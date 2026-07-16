import json
from pathlib import Path

from app.db import get_connection
from app.repositories.policies import insert_policy_analysis_version, next_policy_version_no
from app.services.date_rules import normalize_date, resolve_effective_date
from app.services.policy_ai import enhance_policy_analysis_with_llm
from app.services.policy_parser import parse_policy_document
from app.services.xlsx_reader import read_workbook


TIME_HEADER_PATTERN = {":00", ":15", ":30", ":45"}
POLICY_ANALYSIS_FIELDS = (
    "analysis_mode",
    "analysis_model",
    "analysis_profile",
    "analysis_note",
    "analysis_debug_note",
    "summary",
    "scope_summary",
    "impact_summary",
    "key_points_json",
    "impact_tags_json",
    "subject_impacts_json",
    "formula_items_json",
    "fee_items_json",
    "responsibility_matrix_json",
    "time_nodes_json",
    "risk_points_json",
    "action_suggestions_json",
)


def infer_category(path: Path) -> str:
    path_text = str(path)
    parent = path.parent.name
    if "政策" in path_text or "政策" in parent:
        return "policy"
    if "出清" in path_text or "出清" in parent:
        return "clearing"
    if "边界" in path_text or "披露" in path_text or "基本面" in path_text:
        return "disclosure"
    return "other"


def detect_market_type(path: Path, name: str) -> str | None:
    if "实时" in name or "实际" in name:
        return "实时"
    if "日前" in name:
        return "日前"
    if "预测" in name:
        return "日前"
    return None


def split_metric_and_unit(text: str) -> tuple[str, str | None]:
    if "(" in text and text.endswith(")"):
        metric, tail = text.split("(", 1)
        return metric.strip(), tail[:-1].strip()
    if "（" in text and text.endswith("）"):
        metric, tail = text.split("（", 1)
        return metric.strip(), tail[:-1].strip()
    return text.strip(), None


def is_timeseries_header(row: list[str]) -> bool:
    if len(row) >= 2 and row[0] == "时刻" and "电量" in row[1]:
        return True
    return sum(1 for value in row if any(mark in value for mark in TIME_HEADER_PATTERN)) >= 4


def find_explicit_date(rows: list[list[str]]) -> str | None:
    for row in rows[:5]:
        for value in row:
            normalized = normalize_date(value)
            if normalized:
                return normalized
    return None


def insert_batch(
    file_path: Path,
    category: str,
    sheet_name: str,
    explicit_date: str | None = None,
    effective_date_override: str | None = None,
) -> int:
    external_date = normalize_date(file_path.name)
    sheet_date = normalize_date(sheet_name)
    effective_date, message = resolve_effective_date(file_path.name, sheet_name, explicit_date)
    if effective_date_override:
        effective_date = effective_date_override
        message = f"{message}锛涚増鏈棩鏈熻鐩栦负 {effective_date_override}"

    with get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO import_batches (
                file_name, file_path, category, external_date, detected_sheet_date,
                effective_date, validation_message
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                file_path.name,
                str(file_path),
                category,
                external_date,
                sheet_date,
                effective_date,
                message,
            ),
        )
        return int(cursor.lastrowid)


def import_timeseries_sheet(
    file_path: Path,
    sheet: dict,
    category: str,
    effective_date_override: str | None = None,
) -> None:
    rows = sheet["rows"]
    if not rows:
        return

    header = rows[0]
    explicit_date = find_explicit_date(rows[1:])
    batch_id = insert_batch(file_path, category, sheet["name"], explicit_date, effective_date_override)
    time_headers = [value for value in header if ":" in value]
    time_start = header.index(time_headers[0]) if time_headers else len(header)
    market_type = detect_market_type(file_path, sheet["name"]) or detect_market_type(file_path, file_path.name)
    date_catalog_entries: set[tuple[str, str, str]] = set()

    with get_connection() as conn:
        effective_date = conn.execute(
            "SELECT effective_date FROM import_batches WHERE id = ?",
            (batch_id,),
        ).fetchone()["effective_date"]

        for row_number, row in enumerate(rows[1:], start=1):
            if header[:2] == ["时刻", "电量(MWh)"]:
                point_time = row[0] if len(row) > 0 else None
                if not point_time:
                    continue
                conn.execute(
                    """
                    INSERT INTO disclosure_timeseries (
                        import_batch_id, category, market_type, data_topic, object_name,
                        metric_name, point_time, point_index, value, unit, effective_date, source_sheet
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        batch_id,
                        category,
                        market_type,
                        "分时分类型出清结果",
                        sheet["name"],
                        "电量",
                        point_time,
                        row_number - 1,
                        _to_float(row[1] if len(row) > 1 else None),
                        "MWh",
                        effective_date,
                        sheet["name"],
                    ),
                )
                date_catalog_entries.add(("电量", market_type or "", effective_date))
                if len(row) > 2:
                    conn.execute(
                        """
                        INSERT INTO disclosure_timeseries (
                            import_batch_id, category, market_type, data_topic, object_name,
                            metric_name, point_time, point_index, value, unit, effective_date, source_sheet
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            batch_id,
                            category,
                            market_type,
                            "分时分类型出清结果",
                            sheet["name"],
                            "开机台数",
                            point_time,
                            row_number - 1,
                            _to_float(row[2]),
                            "台",
                            effective_date,
                            sheet["name"],
                        ),
                    )
                    date_catalog_entries.add(("开机台数", market_type or "", effective_date))
                continue

            if len(row) <= time_start:
                continue

            if header[:2] == ["类型", "通道名称"]:
                object_name = row[1]
                metric_name, unit = split_metric_and_unit(row[1])
                data_topic = sheet["name"]
            elif header[:2] == ["节点名称", "数据项"]:
                object_name = row[0]
                metric_name, unit = split_metric_and_unit(row[1])
                data_topic = "节点电价"
            elif header[:1] == ["数据项"]:
                metric_name, unit = split_metric_and_unit(row[0])
                data_topic = sheet["name"]
            elif header[:1] == ["绫诲瀷"]:
                object_name = None
                metric_name, unit = split_metric_and_unit(row[0])
                data_topic = sheet["name"]
            else:
                object_name = row[0] if row else None
                metric_name = header[0] if header else sheet["name"]
                unit = None
                data_topic = sheet["name"]

            for index, point_time in enumerate(time_headers):
                source_index = time_start + index
                if source_index >= len(row):
                    continue
                conn.execute(
                    """
                    INSERT INTO disclosure_timeseries (
                        import_batch_id, category, market_type, data_topic, object_name,
                        metric_name, point_time, point_index, value, unit, effective_date, source_sheet
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        batch_id,
                        category,
                        market_type,
                        data_topic,
                        object_name,
                        metric_name,
                        point_time,
                        index,
                        _to_float(row[source_index]),
                        unit,
                        effective_date,
                        sheet["name"],
                    ),
                )
                date_catalog_entries.add((metric_name, market_type or "", effective_date))

        conn.executemany(
            """
            INSERT OR IGNORE INTO disclosure_date_catalog (metric_name, market_type, effective_date)
            VALUES (?, ?, ?)
            """,
            sorted(date_catalog_entries),
        )


def import_record_sheet(
    file_path: Path,
    sheet: dict,
    category: str,
    effective_date_override: str | None = None,
) -> None:
    rows = sheet["rows"]
    if len(rows) <= 1:
        return

    explicit_date = find_explicit_date(rows[1:])
    header = rows[0]
    batch_id = insert_batch(file_path, category, sheet["name"], explicit_date, effective_date_override)

    with get_connection() as conn:
        effective_date = conn.execute(
            "SELECT effective_date FROM import_batches WHERE id = ?",
            (batch_id,),
        ).fetchone()["effective_date"]

        for index, row in enumerate(rows[1:], start=1):
            payload = {
                header[col]: row[col] if col < len(row) else ""
                for col in range(len(header))
                if header[col]
            }
            non_empty_values = [value for value in payload.values() if value not in ("", None)]
            if not non_empty_values:
                continue

            if "鍐呭" in payload and len(payload) <= 2:
                conn.execute(
                    """
                    INSERT INTO disclosure_texts (
                        import_batch_id, category, source_sheet, title, content, effective_date
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (batch_id, category, sheet["name"], sheet["name"], payload["鍐呭"], effective_date),
                )
                continue

            conn.execute(
                """
                INSERT INTO disclosure_records (
                    import_batch_id, category, source_sheet, row_key, payload_json, effective_date
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    batch_id,
                    category,
                    sheet["name"],
                    str(index),
                    json.dumps(payload, ensure_ascii=False),
                    effective_date,
                ),
            )
        conn.execute(
            """
            INSERT OR IGNORE INTO disclosure_date_catalog (metric_name, market_type, effective_date)
            VALUES (?, ?, ?)
            """,
            (
                "__file_available__",
                detect_market_type(file_path, sheet["name"]) or detect_market_type(file_path, file_path.name) or "",
                effective_date,
            ),
        )


def import_policy_file(file_path: Path, trigger_ai: bool = False, trigger_type: str = "import") -> None:
    normalized_path = str(file_path.resolve())
    try:
        parsed = parse_policy_document(file_path.resolve())
        parsed["analysis_mode"] = "rule"
        parsed["analysis_model"] = None
        parsed["analysis_profile"] = None
        parsed["analysis_note"] = "已完成基础规则解读。"
        parsed["analysis_debug_note"] = None
        if trigger_ai:
            parsed = enhance_policy_analysis_with_llm(parsed["title"], parsed["content_text"], parsed)
    except Exception:
        parsed = {
            "title": file_path.stem,
            "region": "骞夸笢" if "骞夸笢" in file_path.stem else None,
            "issuer": None,
            "policy_date": normalize_date(file_path.name),
            "summary": "正文解析暂未完成，当前保留文件元数据。",
            "scope_summary": None,
            "impact_summary": None,
            "key_points_json": "[]",
            "impact_tags_json": "[]",
            "subject_impacts_json": "[]",
            "formula_items_json": "[]",
            "fee_items_json": "[]",
            "responsibility_matrix_json": "[]",
            "time_nodes_json": "[]",
            "risk_points_json": "[]",
            "action_suggestions_json": "[]",
            "content_text": "",
            "analysis_mode": "rule",
            "analysis_model": None,
            "analysis_profile": None,
            "analysis_note": "正文解析暂未完成，当前仅保留文件元数据。",
            "analysis_debug_note": None,
        }

    with get_connection() as conn:
        existing_rows = conn.execute(
            """
            SELECT id, content_text, analysis_mode, analysis_model, analysis_profile, analysis_note,
                   analysis_debug_note, summary, scope_summary, impact_summary, key_points_json,
                   impact_tags_json, subject_impacts_json, formula_items_json, fee_items_json,
                   responsibility_matrix_json, time_nodes_json, risk_points_json, action_suggestions_json
            FROM policy_documents
            WHERE file_path = ? OR file_name = ?
            ORDER BY id ASC
            """,
            (normalized_path, file_path.name),
        ).fetchone()
        if existing_rows:
            policy_id = int(existing_rows["id"])
            unchanged_policy = not trigger_ai and (existing_rows["content_text"] or "") == (parsed.get("content_text") or "")
            preserve_existing_policy_analysis(parsed, existing_rows, trigger_ai)
            conn.execute(
                """
                UPDATE policy_documents
                SET title = ?, file_name = ?, region = ?, issuer = ?, policy_date = ?, summary = ?,
                    scope_summary = ?, impact_summary = ?, key_points_json = ?, impact_tags_json = ?,
                    subject_impacts_json = ?, formula_items_json = ?, fee_items_json = ?,
                    responsibility_matrix_json = ?, time_nodes_json = ?, risk_points_json = ?,
                    action_suggestions_json = ?, content_text = ?, parsed_at = CURRENT_TIMESTAMP,
                    file_path = ?, analysis_mode = ?, analysis_model = ?,
                    analysis_profile = ?, analysis_note = ?, analysis_debug_note = ?
                WHERE id = ?
                """,
                (
                    parsed["title"],
                    file_path.name,
                    parsed["region"],
                    parsed["issuer"],
                    parsed["policy_date"],
                    parsed["summary"],
                    parsed["scope_summary"],
                    parsed["impact_summary"],
                    parsed["key_points_json"],
                    parsed["impact_tags_json"],
                    parsed.get("subject_impacts_json", "[]"),
                    parsed.get("formula_items_json", "[]"),
                    parsed.get("fee_items_json", "[]"),
                    parsed.get("responsibility_matrix_json", "[]"),
                    parsed.get("time_nodes_json", "[]"),
                    parsed.get("risk_points_json", "[]"),
                    parsed.get("action_suggestions_json", "[]"),
                    parsed["content_text"],
                    normalized_path,
                    parsed.get("analysis_mode", "rule"),
                    parsed.get("analysis_model"),
                    parsed.get("analysis_profile"),
                    parsed.get("analysis_note"),
                    parsed.get("analysis_debug_note"),
                    policy_id,
                ),
            )
            conn.execute(
                "DELETE FROM policy_documents WHERE file_name = ? AND id != ?",
                (file_path.name, policy_id),
            )
            if unchanged_policy:
                return
            insert_policy_analysis_version(
                policy_id=policy_id,
                version_no=next_policy_version_no(policy_id, conn=conn),
                trigger_type=trigger_type,
                analysis_mode=parsed.get("analysis_mode"),
                analysis_model=parsed.get("analysis_model"),
                analysis_profile=parsed.get("analysis_profile"),
                analysis_note=parsed.get("analysis_note"),
                analysis_debug_note=parsed.get("analysis_debug_note"),
                summary=parsed.get("summary"),
                scope_summary=parsed.get("scope_summary"),
                impact_summary=parsed.get("impact_summary"),
                key_points_json=parsed.get("key_points_json", "[]"),
                impact_tags_json=parsed.get("impact_tags_json", "[]"),
                subject_impacts_json=parsed.get("subject_impacts_json", "[]"),
                formula_items_json=parsed.get("formula_items_json", "[]"),
                fee_items_json=parsed.get("fee_items_json", "[]"),
                responsibility_matrix_json=parsed.get("responsibility_matrix_json", "[]"),
                time_nodes_json=parsed.get("time_nodes_json", "[]"),
                risk_points_json=parsed.get("risk_points_json", "[]"),
                action_suggestions_json=parsed.get("action_suggestions_json", "[]"),
                conn=conn,
            )
            return

        cursor = conn.execute(
            """
            INSERT INTO policy_documents (
                title, file_name, file_path, region, issuer, policy_date, summary,
                scope_summary, impact_summary, key_points_json, impact_tags_json,
                subject_impacts_json, formula_items_json, fee_items_json, responsibility_matrix_json,
                time_nodes_json, risk_points_json, action_suggestions_json, content_text, parsed_at,
                analysis_mode, analysis_model, analysis_profile, analysis_note, analysis_debug_note
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)
            """,
            (
                parsed["title"],
                file_path.name,
                normalized_path,
                parsed["region"],
                parsed["issuer"],
                parsed["policy_date"],
                parsed["summary"],
                parsed["scope_summary"],
                parsed["impact_summary"],
                parsed["key_points_json"],
                parsed["impact_tags_json"],
                parsed.get("subject_impacts_json", "[]"),
                parsed.get("formula_items_json", "[]"),
                parsed.get("fee_items_json", "[]"),
                parsed.get("responsibility_matrix_json", "[]"),
                parsed.get("time_nodes_json", "[]"),
                parsed.get("risk_points_json", "[]"),
                parsed.get("action_suggestions_json", "[]"),
                parsed["content_text"],
                parsed.get("analysis_mode", "rule"),
                parsed.get("analysis_model"),
                parsed.get("analysis_profile"),
                parsed.get("analysis_note"),
                parsed.get("analysis_debug_note"),
            ),
        )
        policy_id = int(cursor.lastrowid)
        insert_policy_analysis_version(
            policy_id=policy_id,
            version_no=next_policy_version_no(policy_id, conn=conn),
            trigger_type=trigger_type,
            analysis_mode=parsed.get("analysis_mode"),
            analysis_model=parsed.get("analysis_model"),
            analysis_profile=parsed.get("analysis_profile"),
            analysis_note=parsed.get("analysis_note"),
            analysis_debug_note=parsed.get("analysis_debug_note"),
            summary=parsed.get("summary"),
            scope_summary=parsed.get("scope_summary"),
            impact_summary=parsed.get("impact_summary"),
            key_points_json=parsed.get("key_points_json", "[]"),
            impact_tags_json=parsed.get("impact_tags_json", "[]"),
            subject_impacts_json=parsed.get("subject_impacts_json", "[]"),
            formula_items_json=parsed.get("formula_items_json", "[]"),
            fee_items_json=parsed.get("fee_items_json", "[]"),
            responsibility_matrix_json=parsed.get("responsibility_matrix_json", "[]"),
            time_nodes_json=parsed.get("time_nodes_json", "[]"),
            risk_points_json=parsed.get("risk_points_json", "[]"),
            action_suggestions_json=parsed.get("action_suggestions_json", "[]"),
            conn=conn,
        )


def preserve_existing_policy_analysis(parsed: dict[str, object], existing_row, trigger_ai: bool) -> None:
    if trigger_ai:
        return
    if existing_row["analysis_mode"] not in ("llm", "manual"):
        return
    if (existing_row["content_text"] or "") != (parsed.get("content_text") or ""):
        return

    for field in POLICY_ANALYSIS_FIELDS:
        if existing_row[field] is not None:
            parsed[field] = existing_row[field]


def refresh_policy_documents(data_root: Path, trigger_ai: bool = False, trigger_type: str = "manual_batch") -> None:
    for path in sorted(data_root.rglob("*.pdf")):
        if path.is_dir():
            continue
        if "鏀跨瓥" not in str(path) and "policy" not in str(path).lower():
            continue
        import_policy_file(path, trigger_ai=trigger_ai, trigger_type=trigger_type)


def import_sample_files(data_dir: Path) -> None:
    for path in sorted(data_dir.rglob("*")):
        if path.is_dir():
            continue
        if path.name.startswith("~$"):
            continue

        category = infer_category(path)
        if path.suffix.lower() == ".pdf":
            import_policy_file(path, trigger_ai=False, trigger_type="import")
            continue
        if path.suffix.lower() != ".xlsx":
            continue

        for sheet in read_workbook(path):
            rows = sheet["rows"]
            if not rows:
                continue
            if is_timeseries_header(rows[0]):
                import_timeseries_sheet(path, sheet, category)
            else:
                import_record_sheet(path, sheet, category)


def import_uploaded_file(
    file_path: Path,
    effective_date_override: str | None = None,
    category_override: str | None = None,
) -> None:
    category = category_override or infer_category(file_path)
    if file_path.suffix.lower() == ".pdf":
        import_policy_file(file_path, trigger_ai=False, trigger_type="upload")
        return
    if file_path.suffix.lower() != ".xlsx":
        return

    for sheet in read_workbook(file_path):
        rows = sheet["rows"]
        if not rows:
            continue
        if is_timeseries_header(rows[0]):
            import_timeseries_sheet(file_path, sheet, category, effective_date_override)
        else:
            import_record_sheet(file_path, sheet, category, effective_date_override)


def _to_float(value: str | None) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except ValueError:
        return None
