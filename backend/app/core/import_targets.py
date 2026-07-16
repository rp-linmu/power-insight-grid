import json
from pathlib import Path

from app.core.config import DATA_DIR
from app.db import get_connection


IMPORT_TARGETS = [
    {
        "module_name": "现货模块",
        "page_name": "信息披露",
        "page_key": "disclosure",
        "data_type": "边界数据",
        "category": "disclosure",
        "folder_path": "data_samples/边界数据",
        "expected_files": ["信息披露查询实际信息", "信息披露查询预测信息"],
    },
    {
        "module_name": "现货模块",
        "page_name": "运行与检修",
        "page_key": "operations",
        "data_type": "运行约束与检修计划",
        "category": "disclosure",
        "folder_path": "data_samples/边界数据",
        "expected_files": ["信息披露查询实际信息", "信息披露查询预测信息"],
    },
    {
        "module_name": "现货模块",
        "page_name": "出清信息",
        "page_key": "clearing",
        "data_type": "出清结果",
        "category": "clearing",
        "folder_path": "data_samples/出清数据",
        "expected_files": ["实时节点电价查询", "日前节点电价查询", "现货分时分类型出清电量"],
    },
    {
        "module_name": "政策文件模块",
        "page_name": "政策文件",
        "page_key": "policies",
        "data_type": "政策文件",
        "category": "policy",
        "folder_path": "data_samples/政策数据",
        "expected_files": [".pdf"],
    },
]


def normalize_folder_path(folder_path: str) -> Path:
    relative = folder_path.replace("\\", "/").strip().lstrip("/")
    if not relative.startswith("data_samples"):
        relative = f"data_samples/{relative}"
    return DATA_DIR.parent / relative


def seed_import_targets() -> None:
    with get_connection() as conn:
        for target in IMPORT_TARGETS:
            conn.execute(
                """
                INSERT INTO import_target_configs (
                    page_key, module_name, page_name, data_type, category, folder_path, expected_files_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(page_key) DO UPDATE SET
                    module_name = excluded.module_name,
                    page_name = excluded.page_name,
                    data_type = excluded.data_type,
                    category = excluded.category,
                    folder_path = excluded.folder_path,
                    expected_files_json = excluded.expected_files_json
                """,
                (
                    target["page_key"],
                    target["module_name"],
                    target["page_name"],
                    target["data_type"],
                    target["category"],
                    target["folder_path"],
                    json.dumps(target["expected_files"], ensure_ascii=False),
                ),
            )


def load_target_configs() -> list[dict[str, object]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT page_key, module_name, page_name, data_type, category, folder_path, expected_files_json
            FROM import_target_configs
            ORDER BY page_key ASC
            """
        ).fetchall()

    return [
        {
            "page_key": row["page_key"],
            "module_name": row["module_name"],
            "page_name": row["page_name"],
            "data_type": row["data_type"],
            "category": row["category"],
            "folder_path": row["folder_path"],
            "expected_files": json.loads(row["expected_files_json"]),
        }
        for row in rows
    ]


def split_uploaded_and_missing(expected_files: list[str], uploaded_names: list[str]) -> tuple[list[str], list[str]]:
    uploaded_keys: list[str] = []
    missing_keys: list[str] = []
    for expected in expected_files:
        matched = [name for name in uploaded_names if expected in name]
        if matched:
            uploaded_keys.extend(matched)
        else:
            missing_keys.append(expected)
    uploaded_unique = sorted(dict.fromkeys(uploaded_keys))
    return uploaded_unique, missing_keys


def summarize_target_version_rows(rows, target: dict[str, object]) -> tuple[int, str | None, str | None]:
    filtered = [row for row in rows if row["page_key"] == target["page_key"]]
    uploaded_files = sum(row["uploaded_files"] for row in filtered)
    latest_effective_date = None
    latest_uploaded_at = None
    for row in filtered:
        if row["effective_date"] and (latest_effective_date is None or row["effective_date"] > latest_effective_date):
            latest_effective_date = row["effective_date"]
        if row["uploaded_at"] and (latest_uploaded_at is None or row["uploaded_at"] > latest_uploaded_at):
            latest_uploaded_at = row["uploaded_at"]
    return uploaded_files, latest_effective_date, latest_uploaded_at
