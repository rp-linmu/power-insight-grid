from datetime import datetime
from pathlib import Path
import shutil

from fastapi import HTTPException, UploadFile

from app.core.config import DATA_DIR
from app.core.import_targets import (
    load_target_configs,
    normalize_folder_path,
    split_uploaded_and_missing,
    summarize_target_version_rows,
)
from app.repositories.imports import (
    count_import_batches_for_file,
    create_import_version_record,
    delete_version_data,
    fetch_import_preview_rows,
    fetch_import_stats,
    fetch_target_version_rows,
    fetch_upload_version,
    fetch_version_board_rows,
    insert_version_file,
    update_import_target_folder,
)
from app.schemas import (
    ImportBatchSummary,
    ImportPreviewResponse,
    ImportStatsResponse,
    ImportTargetSummary,
    ImportVersionBoardResponse,
    ImportVersionRow,
)
from app.services.importer import import_uploaded_file


IMPORT_PREVIEW_NOTES = [
    "当前系统保留预测、日前、实时三类口径。",
    "边界数据文件中的“实际信息”统一归为“实时”。",
    "边界数据文件中的“预测信息”当前统一归为“日前”。",
    "未来新增名为“预测数据”的文件夹后，其中数据会单独归为“预测”。",
]


def get_import_preview(
    category: str | None,
    effective_date: str | None,
    mismatch_only: bool,
    limit: int,
) -> ImportPreviewResponse:
    rows = fetch_import_preview_rows(category, effective_date, mismatch_only, limit)
    return ImportPreviewResponse(
        batches=[ImportBatchSummary(**dict(row)) for row in rows],
        notes=IMPORT_PREVIEW_NOTES,
    )


def get_import_stats() -> ImportStatsResponse:
    total_batches, mismatch_batches, category_rows = fetch_import_stats()
    return ImportStatsResponse(
        total_batches=total_batches,
        mismatch_batches=mismatch_batches,
        categories={row["category"]: row["count"] for row in category_rows},
    )


def get_import_targets() -> list[ImportTargetSummary]:
    targets = load_target_configs()
    version_rows = fetch_target_version_rows()

    summaries: list[ImportTargetSummary] = []
    for target in targets:
        uploaded_files, latest_effective_date, latest_uploaded_at = summarize_target_version_rows(version_rows, target)
        expected_count = len(target["expected_files"])
        summaries.append(
            ImportTargetSummary(
                module_name=target["module_name"],
                page_name=target["page_name"],
                page_key=target["page_key"],
                data_type=target["data_type"],
                category=target["category"],
                folder_path=target["folder_path"],
                expected_files=target["expected_files"],
                uploaded_files=uploaded_files,
                missing_files=max(expected_count - uploaded_files, 0),
                latest_effective_date=latest_effective_date,
                latest_uploaded_at=latest_uploaded_at,
            )
        )
    return summaries


def get_import_version_board(effective_date: str | None) -> ImportVersionBoardResponse:
    targets = {target["page_key"]: target for target in load_target_configs()}
    rows = fetch_version_board_rows(effective_date)
    selected_date = effective_date or (rows[0]["effective_date"] if rows else None)

    version_rows: list[ImportVersionRow] = []
    for row in rows:
        target = targets.get(row["page_key"])
        if not target:
            continue
        expected_count = len(target["expected_files"])
        file_names = [name for name in (row["file_names"] or "").split("||") if name]
        uploaded_file_names, missing_file_names = split_uploaded_and_missing(target["expected_files"], file_names)
        version_rows.append(
            ImportVersionRow(
                id=row["id"],
                module_name=target["module_name"],
                page_name=target["page_name"],
                page_key=target["page_key"],
                data_type=target["data_type"],
                effective_date=row["effective_date"],
                version_name=row["version_name"],
                version_tag=row["version_tag"],
                uploaded_at=row["created_at"],
                uploaded_files=row["uploaded_files"],
                missing_files=max(expected_count - row["uploaded_files"], 0),
                owner=row["owner"],
                folder_path=target["folder_path"],
                expected_files=target["expected_files"],
                uploaded_file_names=uploaded_file_names,
                missing_file_names=missing_file_names,
            )
        )

    if selected_date and not version_rows:
        for target in targets.values():
            expected_count = len(target["expected_files"])
            version_rows.append(
                ImportVersionRow(
                    id=None,
                    module_name=target["module_name"],
                    page_name=target["page_name"],
                    page_key=target["page_key"],
                    data_type=target["data_type"],
                    effective_date=selected_date,
                    version_name="待创建版本",
                    version_tag="待上传",
                    uploaded_at=None,
                    uploaded_files=0,
                    missing_files=expected_count,
                    owner="系统导入",
                    folder_path=target["folder_path"],
                    expected_files=target["expected_files"],
                    uploaded_file_names=[],
                    missing_file_names=target["expected_files"],
                )
            )

    return ImportVersionBoardResponse(selected_date=selected_date, rows=version_rows)


def save_import_target(page_key: str, folder_path: str) -> dict[str, str]:
    try:
        update_import_target_folder(page_key, folder_path)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="未找到页面导入位配置") from exc

    normalize_folder_path(folder_path).mkdir(parents=True, exist_ok=True)
    return {"status": "ok"}


def create_import_version(
    page_key: str,
    effective_date: str,
    version_tag: str,
    owner: str,
) -> dict[str, int]:
    if not effective_date:
        raise HTTPException(status_code=400, detail="请选择数据日期")

    try:
        version_id = create_import_version_record(
            page_key,
            effective_date,
            datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            version_tag or "当前版本",
            owner or "系统导入",
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="未找到页面导入位配置") from exc

    return {"id": version_id}


async def upload_import_version_files(version_id: int, files: list[UploadFile]) -> dict[str, int]:
    version = fetch_upload_version(version_id)
    if not version:
        raise HTTPException(status_code=404, detail="未找到版本")

    target_root = normalize_folder_path(version["folder_path"])
    version_dir = target_root / "__versions__" / version["page_key"] / version["effective_date"] / str(version_id)
    version_dir.mkdir(parents=True, exist_ok=True)

    saved_count = 0
    for file in files:
        if not file.filename:
            continue
        destination = version_dir / file.filename
        with destination.open("wb") as output:
            shutil.copyfileobj(file.file, output)

        import_uploaded_file(destination, version["effective_date"])
        imported_batches = count_import_batches_for_file(str(destination))
        insert_version_file(version_id, file.filename, str(destination), version["category"], imported_batches)
        saved_count += 1

    return {"uploaded_files": saved_count}


def delete_import_version(version_id: int) -> dict[str, str]:
    file_paths = delete_version_data(version_id)

    for file_path in file_paths:
        path = Path(file_path)
        if path.exists():
            path.unlink()
        parent = path.parent
        while parent != DATA_DIR.parent and parent.exists():
            if any(parent.iterdir()):
                break
            parent.rmdir()
            parent = parent.parent

    return {"status": "ok"}
