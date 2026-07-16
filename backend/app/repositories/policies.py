import sqlite3

from app.db import get_connection


def fetch_policy_rows(search: str | None = None) -> list:
    query = """
        SELECT id, title, issuer, region, policy_date, summary, scope_summary, impact_summary,
               key_points_json, impact_tags_json, subject_impacts_json, formula_items_json, fee_items_json,
               responsibility_matrix_json, time_nodes_json, risk_points_json, action_suggestions_json,
               substr(content_text, 1, 400) AS content_preview,
               analysis_mode, analysis_model, analysis_profile, analysis_note, analysis_debug_note, manual_updated_at, file_name,
               (SELECT COUNT(*) FROM policy_analysis_versions pav WHERE pav.policy_id = policy_documents.id) AS version_count
        FROM policy_documents
    """
    params: list[object] = []
    if search:
        query += " WHERE title LIKE ?"
        params.append(f"%{search}%")
    query += " ORDER BY id DESC"

    with get_connection() as conn:
        return conn.execute(query, params).fetchall()


def fetch_policy_detail(policy_id: int):
    with get_connection() as conn:
        return conn.execute(
            """
            SELECT id, title, file_path, issuer, region, policy_date, summary, scope_summary, impact_summary,
                   key_points_json, impact_tags_json, subject_impacts_json, formula_items_json, fee_items_json,
                   responsibility_matrix_json, time_nodes_json, risk_points_json, action_suggestions_json,
                   content_text, analysis_mode, analysis_model,
                   analysis_profile, analysis_note, analysis_debug_note, manual_updated_at
            FROM policy_documents
            WHERE id = ?
            """,
            (policy_id,),
        ).fetchone()


def fetch_policy_versions(policy_id: int) -> list:
    with get_connection() as conn:
        return conn.execute(
            """
            SELECT id, version_no, trigger_type, analysis_mode, analysis_model, analysis_profile, analysis_note, analysis_debug_note,
                   created_at
            FROM policy_analysis_versions
            WHERE policy_id = ?
            ORDER BY version_no DESC, id DESC
            """,
            (policy_id,),
        ).fetchall()


def next_policy_version_no(policy_id: int, conn: sqlite3.Connection | None = None) -> int:
    owns_connection = conn is None
    if conn is None:
        context = get_connection()
        conn = context.__enter__()
    try:
        row = conn.execute(
            "SELECT COALESCE(MAX(version_no), 0) AS value FROM policy_analysis_versions WHERE policy_id = ?",
            (policy_id,),
        ).fetchone()
    finally:
        if owns_connection:
            context.__exit__(None, None, None)
    return int(row["value"]) + 1


def insert_policy_analysis_version(
    policy_id: int,
    version_no: int,
    trigger_type: str,
    analysis_mode: str | None,
    analysis_model: str | None,
    analysis_profile: str | None,
    analysis_note: str | None,
    analysis_debug_note: str | None,
    summary: str | None,
    scope_summary: str | None,
    impact_summary: str | None,
    key_points_json: str,
    impact_tags_json: str,
    subject_impacts_json: str = "[]",
    formula_items_json: str = "[]",
    fee_items_json: str = "[]",
    responsibility_matrix_json: str = "[]",
    time_nodes_json: str = "[]",
    risk_points_json: str = "[]",
    action_suggestions_json: str = "[]",
    conn: sqlite3.Connection | None = None,
) -> None:
    owns_connection = conn is None
    if conn is None:
        context = get_connection()
        conn = context.__enter__()
    try:
        conn.execute(
            """
            INSERT INTO policy_analysis_versions (
                policy_id, version_no, trigger_type, analysis_mode, analysis_model, analysis_profile, analysis_note,
                analysis_debug_note, summary, scope_summary, impact_summary, key_points_json, impact_tags_json,
                subject_impacts_json, formula_items_json, fee_items_json, responsibility_matrix_json,
                time_nodes_json, risk_points_json, action_suggestions_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                policy_id,
                version_no,
                trigger_type,
                analysis_mode,
                analysis_model,
                analysis_profile,
                analysis_note,
                analysis_debug_note,
                summary,
                scope_summary,
                impact_summary,
                key_points_json,
                impact_tags_json,
                subject_impacts_json,
                formula_items_json,
                fee_items_json,
                responsibility_matrix_json,
                time_nodes_json,
                risk_points_json,
                action_suggestions_json,
            ),
        )
    finally:
        if owns_connection:
            context.__exit__(None, None, None)


def count_policies() -> int:
    with get_connection() as conn:
        return conn.execute("SELECT COUNT(*) AS count FROM policy_documents").fetchone()["count"]


def fetch_policy_mode_counts() -> dict[str, int]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT COALESCE(analysis_mode, 'rule') AS analysis_mode, COUNT(*) AS count
            FROM policy_documents
            GROUP BY COALESCE(analysis_mode, 'rule')
            """
        ).fetchall()
    return {row["analysis_mode"]: row["count"] for row in rows}


def update_policy_document(
    policy_id: int,
    summary: str,
    scope_summary: str,
    impact_summary: str,
    key_points_json: str,
    impact_tags_json: str,
) -> bool:
    with get_connection() as conn:
        cursor = conn.execute(
            """
            UPDATE policy_documents
            SET summary = ?,
                scope_summary = ?,
                impact_summary = ?,
                key_points_json = ?,
                impact_tags_json = ?,
                analysis_mode = 'manual',
                analysis_model = NULL,
                analysis_note = 'Manual override applied.',
                analysis_debug_note = NULL,
                manual_updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (summary, scope_summary, impact_summary, key_points_json, impact_tags_json, policy_id),
        )
    return cursor.rowcount > 0
