from datetime import datetime, timedelta
from pathlib import Path
import shutil
import uuid

from app.core.import_targets import load_target_configs, normalize_folder_path
from app.db import get_connection
from app.repositories.imports import (
    count_import_batches_for_file,
    create_import_version_record,
    insert_version_file,
)
from app.services.date_rules import normalize_date
from app.services.disclosure_service import clear_disclosure_caches
from app.services.importer import import_uploaded_file
from app.services.xlsx_reader import read_workbook


CRAWLER_DOWNLOAD_DIR = Path(__file__).resolve().parents[3] / "gd-market-crawler" / "data" / "browser-downloads"
CRAWLER_FILE_PATTERN = "*.xlsx"
_CONTENT_VALIDATION_CACHE: dict[tuple[str, int, int], str | None] = {}

TASK_SOURCE_RULES = {
    "market-clearing": ["市场出清"],
    "basic-day-ahead": ["基本面数据", "信息披露"],
    "basic-real-time": ["基本面数据", "信息披露"],
    "day-ahead-node-price": ["日前节点电价"],
    "real-time-node-price": ["实时节点电价"],
    "spot-hourly-type-energy": ["现货分时分类型出清电量"],
    "spot-hourly-type-energy-day-ahead": ["现货分时分类型出清电量"],
    "spot-hourly-type-energy-real-time": ["现货分时分类型出清电量"],
}

SOURCE_RULES = [
    ("基本面数据", "disclosure", "disclosure"),
    ("信息披露", "disclosure", "disclosure"),
    ("实时节点电价", "clearing", "clearing"),
    ("日前节点电价", "clearing", "clearing"),
    ("现货分时分类型出清电量", "clearing", "clearing"),
    ("市场出清", "clearing", "clearing"),
]


def get_crawler_bridge_status() -> dict[str, object]:
    candidates = _discover_candidates()
    skipped = [item for item in candidates if item["skip_reason"]]
    targets = {str(item["page_key"]): item for item in load_target_configs()}
    registered_paths = _registered_destination_paths()
    pending = [
        item
        for item in candidates
        if not item["skip_reason"] and not _is_imported(item, targets, registered_paths)
    ]
    dates = sorted(
        {
            str(item["effective_date"])
            for item in candidates
            if item["effective_date"] and not item["skip_reason"]
        }
    )

    return {
        "ok": CRAWLER_DOWNLOAD_DIR.exists(),
        "message": _status_message(candidates, pending),
        "source_dir": str(CRAWLER_DOWNLOAD_DIR),
        "total_files": len(candidates),
        "pending_files": len(pending),
        "skipped_files": len(skipped),
        "available_dates": dates,
        "latest_date": dates[-1] if dates else None,
        "preview_files": [str(item["relative_path"]) for item in pending[:8]],
        "checked_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


def sync_crawler_downloads(
    effective_date: str | None = None,
    overwrite: bool = False,
    source_paths: list[str] | None = None,
) -> dict[str, object]:
    if effective_date and not normalize_date(effective_date):
        return _sync_response(False, f"无效的数据日期：{effective_date}", [], [], [])

    candidates = _discover_candidates(None if source_paths is not None else effective_date)
    if source_paths is not None:
        selected_paths = {str(Path(item).resolve()) for item in source_paths if item}
        candidates = [
            item
            for item in candidates
            if str(Path(str(item["source_file"])).resolve()) in selected_paths
        ]
        for candidate in candidates:
            if candidate["skip_reason"]:
                continue
            source_file = Path(str(candidate["source_file"]))
            relative_path = Path(str(candidate["relative_path"]))
            candidate["skip_reason"] = _validate_source_content(source_file, relative_path)
            if not candidate["skip_reason"] and _has_market_stage_mismatch(source_file, relative_path):
                candidate["skip_reason"] = "文件市场阶段与目录不一致"
    if not CRAWLER_DOWNLOAD_DIR.exists():
        return _sync_response(False, "未找到爬虫下载目录。", [], [], [])
    if not candidates:
        return _sync_response(True, "爬虫下载目录中没有可同步的 Excel 文件。", [], [], [])

    synced_files: list[str] = []
    skipped_files: list[str] = []
    failed_files: list[str] = []
    catalog_dates: set[str] = set()

    targets = {str(item["page_key"]): item for item in load_target_configs()}

    for candidate in candidates:
        source_file = Path(str(candidate["source_file"]))
        page_key = str(candidate["page_key"])
        category = str(candidate["category"])
        business_date = str(candidate["effective_date"] or "")
        skip_reason = candidate["skip_reason"]

        if skip_reason:
            skipped_files.append(f"{candidate['relative_path']} ({skip_reason})")
            continue

        target = targets.get(page_key)
        if not target:
            skipped_files.append(f"{candidate['relative_path']} (未配置导入位 {page_key})")
            continue

        target_root = normalize_folder_path(str(target["folder_path"]))
        bridge_root = target_root / "__crawler_bridge__" / business_date
        bridge_root.mkdir(parents=True, exist_ok=True)
        destination = bridge_root / _destination_name(candidate)

        if not overwrite and destination.exists() and _is_destination_registered(destination):
            skipped_files.append(f"{candidate['relative_path']} (已同步)")
            if business_date:
                catalog_dates.add(business_date)
            continue

        try:
            if overwrite:
                _overwrite_imported_file(
                    source_file=source_file,
                    destination=destination,
                    page_key=page_key,
                    category=category,
                    business_date=business_date,
                )
            else:
                _import_new_file(
                    source_file=source_file,
                    destination=destination,
                    page_key=page_key,
                    category=category,
                    business_date=business_date,
                )
            synced_files.append(destination.name)
            if business_date:
                catalog_dates.add(business_date)
        except Exception as exc:
            failed_files.append(f"{candidate['relative_path']} ({exc})")

    rebuilt_dates = _rebuild_date_catalogs(catalog_dates)

    if synced_files or rebuilt_dates:
        clear_disclosure_caches()

    message = f"已同步 {len(synced_files)} 个爬虫 Excel，跳过 {len(skipped_files)} 个，失败 {len(failed_files)} 个。"
    return _sync_response(
        not failed_files,
        message,
        synced_files,
        skipped_files,
        failed_files,
        effective_date=effective_date,
        overwrite=overwrite,
        rebuilt_dates=rebuilt_dates,
    )


def audit_crawler_imports(start: str, end: str, task_ids: list[str] | None = None) -> dict[str, object]:
    start_date = normalize_date(start)
    end_date = normalize_date(end)
    if not start_date or not end_date:
        raise ValueError("无效的日期范围")
    if start_date > end_date:
        raise ValueError("开始日期不能晚于结束日期")

    selected_task_ids = [task_id for task_id in (task_ids or []) if task_id]
    dates = _enumerate_dates(start_date, end_date)
    targets = {str(item["page_key"]): item for item in load_target_configs()}
    registered_paths = _registered_destination_paths()
    rows: list[dict[str, object]] = []
    pending_source_paths: list[str] = []

    for business_date in dates:
        candidates = [
            candidate
            for candidate in _discover_candidates(business_date)
            if _candidate_matches_tasks(candidate, selected_task_ids)
        ]
        if not candidates:
            rows.append(
                {
                    "date": business_date,
                    "taskId": "",
                    "taskName": "未发现本地文件",
                    "file": "",
                    "sourcePath": "",
                    "status": "missing",
                    "statusLabel": "未获取",
                    "reason": "所选数据项在本地下载目录中没有可同步文件",
                    "imported": False,
                    "valid": False,
                }
            )
            continue

        for candidate in candidates:
            source_file = Path(str(candidate["source_file"]))
            skip_reason = candidate["skip_reason"]
            imported = _is_imported(candidate, targets, registered_paths)
            status = "imported" if imported else "pending"
            status_label = "已入库" if imported else "待入库"
            valid = not skip_reason
            if skip_reason:
                status = "invalid"
                status_label = "文件无效"
            elif not imported:
                pending_source_paths.append(str(source_file))

            rows.append(
                {
                    "date": business_date,
                    "taskId": _task_id_for_candidate(candidate) or "",
                    "taskName": str(candidate["source_topic"] or ""),
                    "file": source_file.name,
                    "sourcePath": str(source_file),
                    "destinationName": _destination_name(candidate),
                    "status": status,
                    "statusLabel": status_label,
                    "reason": skip_reason or "",
                    "imported": imported,
                    "valid": valid,
                    "size": source_file.stat().st_size if source_file.exists() else 0,
                    "modifiedAt": datetime.fromtimestamp(source_file.stat().st_mtime).strftime("%Y-%m-%d %H:%M:%S")
                    if source_file.exists()
                    else "",
                }
            )

    total_files = sum(1 for row in rows if row["status"] != "missing")
    imported_files = sum(1 for row in rows if row["status"] == "imported")
    pending_files = sum(1 for row in rows if row["status"] == "pending")
    invalid_files = sum(1 for row in rows if row["status"] == "invalid")
    return {
        "ok": True,
        "start": start_date,
        "end": end_date,
        "checkedDates": len(dates),
        "totalFiles": total_files,
        "importedFiles": imported_files,
        "pendingFiles": pending_files,
        "invalidFiles": invalid_files,
        "missingDates": sum(1 for row in rows if row["status"] == "missing"),
        "rows": rows,
        "pendingSourcePaths": sorted(set(pending_source_paths)),
        "checkedAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


def _sync_response(
    ok: bool,
    message: str,
    synced_files: list[str],
    skipped_files: list[str],
    failed_files: list[str],
    effective_date: str | None = None,
    overwrite: bool = False,
    rebuilt_dates: list[str] | None = None,
) -> dict[str, object]:
    rebuilt_dates = rebuilt_dates or []
    return {
        "ok": ok,
        "message": message,
        "source_dir": str(CRAWLER_DOWNLOAD_DIR),
        "synced_files": synced_files,
        "skipped_files": skipped_files,
        "failed_files": failed_files,
        "rebuilt_dates": rebuilt_dates,
        "effective_date": effective_date,
        "overwrite": overwrite,
        "strategy": "active_batch_swap",
        "cache_cleared": bool(synced_files or rebuilt_dates),
        "synced_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


def _import_new_file(
    source_file: Path,
    destination: Path,
    page_key: str,
    category: str,
    business_date: str,
) -> None:
    version_id: int | None = None
    try:
        shutil.copy2(source_file, destination)
        version_id = create_import_version_record(
            page_key,
            business_date,
            datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "爬虫自动同步",
            "gd-market-crawler",
        )
        import_uploaded_file(
            destination,
            effective_date_override=business_date,
            category_override=category,
        )
        imported_batches = count_import_batches_for_file(str(destination))
        if imported_batches <= 0:
            raise RuntimeError("文件未产生可用导入批次")
        insert_version_file(version_id, destination.name, str(destination), category, imported_batches)
    except Exception:
        _cleanup_failed_import(destination, version_id)
        raise


def _overwrite_imported_file(
    source_file: Path,
    destination: Path,
    page_key: str,
    category: str,
    business_date: str,
) -> None:
    token = uuid.uuid4().hex
    staging = destination.with_name(f"{destination.stem}__incoming_{token}{destination.suffix}")
    backup = destination.with_name(f"{destination.name}.backup-{token}")
    version_id: int | None = None
    destination_existed = destination.exists()

    try:
        shutil.copy2(source_file, staging)
        version_id = create_import_version_record(
            page_key,
            business_date,
            datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "爬虫自动覆盖",
            "gd-market-crawler",
        )
        import_uploaded_file(
            staging,
            effective_date_override=business_date,
            category_override=category,
        )
        imported_batches = count_import_batches_for_file(str(staging))
        if imported_batches <= 0:
            raise RuntimeError("覆盖文件未产生可用导入批次")

        if destination_existed:
            shutil.copy2(destination, backup)
        staging.replace(destination)
        _promote_staged_import(
            staging_path=str(staging),
            destination_path=str(destination),
            destination_name=destination.name,
            version_id=version_id,
            category=category,
            imported_batches=imported_batches,
            business_date=business_date,
        )
        if backup.exists():
            backup.unlink()
    except Exception:
        if backup.exists():
            shutil.copy2(backup, destination)
            backup.unlink()
        elif not destination_existed and destination.exists():
            destination.unlink()
        _cleanup_failed_import(staging, version_id)
        if staging.exists():
            staging.unlink()
        raise


def _promote_staged_import(
    staging_path: str,
    destination_path: str,
    destination_name: str,
    version_id: int,
    category: str,
    imported_batches: int,
    business_date: str,
) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE import_batches SET is_active = 0 WHERE file_path = ? AND is_active = 1",
            (destination_path,),
        )

        old_version_ids = [
            int(row["version_id"])
            for row in conn.execute(
                "SELECT DISTINCT version_id FROM import_version_files WHERE file_path = ?",
                (destination_path,),
            ).fetchall()
        ]
        conn.execute("DELETE FROM import_version_files WHERE file_path = ?", (destination_path,))
        for old_version_id in old_version_ids:
            if old_version_id == version_id:
                continue
            remaining = conn.execute(
                "SELECT 1 FROM import_version_files WHERE version_id = ? LIMIT 1",
                (old_version_id,),
            ).fetchone()
            if not remaining:
                conn.execute("DELETE FROM import_versions WHERE id = ?", (old_version_id,))

        conn.execute(
            """
            UPDATE import_batches
            SET file_path = ?, file_name = ?, is_active = 1
            WHERE file_path = ?
            """,
            (destination_path, destination_name, staging_path),
        )
        conn.execute(
            """
            INSERT INTO import_version_files (
                version_id, file_name, file_path, category, imported_batches
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (version_id, destination_name, destination_path, category, imported_batches),
        )
        _rebuild_date_catalog(conn, business_date)


def _rebuild_date_catalog(conn, business_date: str) -> None:
    conn.execute(
        "DELETE FROM disclosure_date_catalog WHERE effective_date = ?",
        (business_date,),
    )
    conn.execute(
        """
        INSERT OR IGNORE INTO disclosure_date_catalog (metric_name, market_type, effective_date)
        SELECT DISTINCT t.metric_name, COALESCE(t.market_type, ''), t.effective_date
        FROM disclosure_timeseries t
        JOIN import_batches b ON b.id = t.import_batch_id
        WHERE t.effective_date = ?
          AND b.is_active = 1
        """,
        (business_date,),
    )
    conn.execute(
        """
        INSERT OR IGNORE INTO disclosure_date_catalog (metric_name, market_type, effective_date)
        SELECT DISTINCT
            '__file_available__',
            CASE
                WHEN b.file_name LIKE '%日前%' THEN '日前'
                WHEN b.file_name LIKE '%实时%' OR b.file_name LIKE '%实际%' THEN '实时'
                WHEN b.file_name LIKE '%预测%' THEN '预测'
                ELSE ''
            END,
            b.effective_date
        FROM import_batches b
        WHERE b.effective_date = ?
          AND b.is_active = 1
          AND b.category IN ('disclosure', 'clearing')
        """,
        (business_date,),
    )


def _rebuild_date_catalogs(business_dates: set[str]) -> list[str]:
    dates = sorted({business_date for business_date in business_dates if normalize_date(business_date)})
    if not dates:
        return []
    with get_connection() as conn:
        for business_date in dates:
            _rebuild_date_catalog(conn, business_date)
    return dates


def _discover_candidates(effective_date: str | None = None) -> list[dict[str, object]]:
    if not CRAWLER_DOWNLOAD_DIR.exists():
        return []

    selected_date = normalize_date(effective_date)
    candidates: list[dict[str, object]] = []
    for source_file in sorted(CRAWLER_DOWNLOAD_DIR.rglob(CRAWLER_FILE_PATTERN)):
        if source_file.name.startswith("~$"):
            continue
        relative_path = source_file.relative_to(CRAWLER_DOWNLOAD_DIR)
        source_topic = relative_path.parts[0] if relative_path.parts else ""
        requested_date = _extract_requested_date(relative_path)
        business_date = normalize_date(source_file.name)
        page_key, category = _classify_source(source_topic)
        skip_reason = None

        if selected_date and requested_date != selected_date and business_date != selected_date:
            continue
        if not business_date:
            skip_reason = "未从文件名识别业务日期"
        elif not page_key or not category:
            skip_reason = "未匹配数据项"

        candidates.append(
            {
                "source_file": source_file,
                "relative_path": relative_path,
                "source_topic": source_topic,
                "requested_date": requested_date,
                "effective_date": business_date,
                "page_key": page_key,
                "category": category,
                "skip_reason": skip_reason,
            }
        )

    validation_date = selected_date or max(
        (str(item["effective_date"]) for item in candidates if item["effective_date"]),
        default=None,
    )
    if validation_date:
        for candidate in candidates:
            if candidate["skip_reason"] or candidate["effective_date"] != validation_date:
                continue
            source_file = Path(str(candidate["source_file"]))
            relative_path = Path(str(candidate["relative_path"]))
            candidate["skip_reason"] = _validate_source_content(source_file, relative_path)
            if not candidate["skip_reason"] and _has_market_stage_mismatch(source_file, relative_path):
                candidate["skip_reason"] = "文件市场阶段与目录不一致"
    return candidates


def _classify_source(source_topic: str) -> tuple[str | None, str | None]:
    for keyword, page_key, category in SOURCE_RULES:
        if keyword in source_topic:
            return page_key, category
    return None, None


def _extract_requested_date(relative_path: Path) -> str | None:
    for part in relative_path.parts[:-1]:
        normalized = normalize_date(part)
        if normalized:
            return normalized
    return None


def _destination_name(candidate: dict[str, object]) -> str:
    relative_path = Path(str(candidate["relative_path"]))
    stem_parts = [part for part in relative_path.parts[:-1] if normalize_date(part) is None]
    prefix = "__".join(_safe_name(part) for part in stem_parts if part)
    file_name = relative_path.name
    return f"{prefix}__{file_name}" if prefix else file_name


def _validate_source_content(source_file: Path, relative_path: Path) -> str | None:
    stat = source_file.stat()
    cache_key = (str(source_file), stat.st_size, stat.st_mtime_ns)
    if cache_key in _CONTENT_VALIDATION_CACHE:
        return _CONTENT_VALIDATION_CACHE[cache_key]

    try:
        sheets = read_workbook(source_file)
    except Exception as exc:
        result = f"Excel 内容无法读取：{exc}"
        _CONTENT_VALIDATION_CACHE[cache_key] = result
        return result

    if not sheets:
        result = "Excel 没有可读取的工作表"
        _CONTENT_VALIDATION_CACHE[cache_key] = result
        return result

    if relative_path.parts and relative_path.parts[0] == "现货分时分类型出清电量":
        has_business_value = any(
            any(
                len(row) >= 2 and any(str(value).strip() for value in row[1:])
                for row in sheet.get("rows", [])[1:]
            )
            for sheet in sheets
        )
        if not has_business_value:
            result = "工作簿只有时刻或表头，没有出清业务值"
            _CONTENT_VALIDATION_CACHE[cache_key] = result
            return result
        _CONTENT_VALIDATION_CACHE[cache_key] = None
        return None

    has_data_row = any(
        any(any(str(value).strip() for value in row) for row in sheet.get("rows", [])[1:])
        for sheet in sheets
    )
    if not has_data_row:
        result = "工作簿只有表头，没有有效数据"
        _CONTENT_VALIDATION_CACHE[cache_key] = result
        return result
    _CONTENT_VALIDATION_CACHE[cache_key] = None
    return None


def _has_market_stage_mismatch(source_file: Path, relative_path: Path) -> bool:
    if not relative_path.parts or relative_path.parts[0] != "现货分时分类型出清电量":
        return False

    requested_stage = next(
        (part for part in relative_path.parts[:-1] if part in {"日前", "实时"}),
        None,
    )
    if not requested_stage:
        return False
    if requested_stage != "实时":
        return False

    try:
        sheet_names = [str(sheet["name"]) for sheet in read_workbook(source_file)]
    except Exception:
        return False

    if requested_stage == "实时":
        return bool(sheet_names) and all("日前" in name and "实时" not in name for name in sheet_names)
    return bool(sheet_names) and all("实时" in name and "日前" not in name for name in sheet_names)


def _safe_name(value: str) -> str:
    return value.replace("/", "_").replace("\\", "_").replace(":", "_").strip()


def _cleanup_failed_import(destination: Path, version_id: int | None) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE import_batches SET is_active = 0 WHERE file_path = ?",
            (str(destination),),
        )
        if version_id is not None:
            conn.execute("DELETE FROM import_version_files WHERE version_id = ?", (version_id,))
            conn.execute("DELETE FROM import_versions WHERE id = ?", (version_id,))


def _is_imported(
    candidate: dict[str, object],
    targets: dict[str, dict[str, object]] | None = None,
    registered_paths: set[str] | None = None,
) -> bool:
    if candidate["skip_reason"]:
        return False
    business_date = str(candidate["effective_date"])
    target_map = targets or {str(item["page_key"]): item for item in load_target_configs()}
    target = target_map.get(str(candidate["page_key"]))
    if not target:
        return False
    destination = normalize_folder_path(str(target["folder_path"])) / "__crawler_bridge__" / business_date / _destination_name(candidate)
    if registered_paths is not None:
        return str(destination) in registered_paths
    return destination.exists() and _is_destination_registered(destination)


def _registered_destination_paths() -> set[str]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT file_path FROM import_version_files
            UNION
            SELECT file_path FROM import_batches WHERE is_active = 1
            """
        ).fetchall()
    return {str(row["file_path"]) for row in rows if row["file_path"]}


def _is_destination_registered(destination: Path) -> bool:
    if count_import_batches_for_file(str(destination)) > 0:
        return True
    with get_connection() as conn:
        return (
            conn.execute(
                "SELECT 1 FROM import_version_files WHERE file_path = ? LIMIT 1",
                (str(destination),),
            ).fetchone()
            is not None
        )


def _enumerate_dates(start: str, end: str) -> list[str]:
    start_date = datetime.strptime(start, "%Y-%m-%d").date()
    end_date = datetime.strptime(end, "%Y-%m-%d").date()
    days = (end_date - start_date).days
    return [(start_date + timedelta(days=offset)).isoformat() for offset in range(days + 1)]


def _candidate_matches_tasks(candidate: dict[str, object], task_ids: list[str]) -> bool:
    if not task_ids:
        return True
    topic = str(candidate.get("source_topic") or "")
    relative_path = Path(str(candidate.get("relative_path") or ""))
    path_text = str(relative_path)
    for task_id in task_ids:
        if task_id == "basic-day-ahead" and _is_basic_candidate(topic, path_text):
            return _candidate_stage(relative_path) == "day-ahead"
        if task_id == "basic-real-time" and _is_basic_candidate(topic, path_text):
            return _candidate_stage(relative_path) == "real-time"
        if task_id == "spot-hourly-type-energy-day-ahead" and _is_spot_hourly_candidate(topic, path_text):
            return _candidate_stage(relative_path) == "day-ahead"
        if task_id == "spot-hourly-type-energy-real-time" and _is_spot_hourly_candidate(topic, path_text):
            return _candidate_stage(relative_path) == "real-time"
        for keyword in TASK_SOURCE_RULES.get(task_id, []):
            if keyword in topic or keyword in path_text:
                return True
    return False


def _task_id_for_candidate(candidate: dict[str, object]) -> str | None:
    topic = str(candidate.get("source_topic") or "")
    relative_path = Path(str(candidate.get("relative_path") or ""))
    path_text = str(relative_path)
    stage = _candidate_stage(relative_path)
    if _is_basic_candidate(topic, path_text):
        return "basic-real-time" if stage == "real-time" else "basic-day-ahead"
    if _is_spot_hourly_candidate(topic, path_text):
        return "spot-hourly-type-energy-real-time" if stage == "real-time" else "spot-hourly-type-energy-day-ahead"
    for task_id, keywords in TASK_SOURCE_RULES.items():
        if any(keyword in topic or keyword in path_text for keyword in keywords):
            return task_id
    return None


def _is_basic_candidate(topic: str, path_text: str) -> bool:
    return "基本面数据" in topic or "信息披露" in topic or "基本面数据" in path_text or "信息披露" in path_text


def _is_spot_hourly_candidate(topic: str, path_text: str) -> bool:
    return "现货分时分类型出清电量" in topic or "现货分时分类型出清电量" in path_text


def _candidate_stage(relative_path: Path) -> str:
    parts = set(relative_path.parts[:-1])
    if "实时" in parts or "实际" in parts:
        return "real-time"
    if "日前" in parts or "预测" in parts:
        return "day-ahead"
    path_text = str(relative_path)
    if "实时" in path_text or "实际" in path_text:
        return "real-time"
    return "day-ahead"


def _status_message(candidates: list[dict[str, object]], pending: list[dict[str, object]]) -> str:
    if not CRAWLER_DOWNLOAD_DIR.exists():
        return "未找到 gd-market-crawler 的下载目录。"
    if not candidates:
        return "爬虫下载目录中还没有可识别的 Excel 文件。"
    if pending:
        return f"发现 {len(candidates)} 个爬虫 Excel，其中 {len(pending)} 个待同步。"
    return f"发现 {len(candidates)} 个爬虫 Excel，当前没有待同步文件。"
