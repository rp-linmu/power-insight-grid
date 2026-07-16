from app.db import get_connection


def fetch_overview_snapshot() -> tuple[list, int, int, int]:
    with get_connection() as conn:
        import_batches = conn.execute(
            """
            SELECT id, file_name, category, external_date, detected_sheet_date,
                   effective_date, validation_message
            FROM import_batches
            WHERE is_active = 1
            ORDER BY id DESC
            LIMIT 6
            """
        ).fetchall()
        series_count = conn.execute("SELECT COALESCE(MAX(id), 0) AS count FROM disclosure_timeseries").fetchone()["count"]
        record_count = conn.execute("SELECT COALESCE(MAX(id), 0) AS count FROM disclosure_records").fetchone()["count"]
        policy_count = conn.execute("SELECT COUNT(*) AS count FROM policy_documents").fetchone()["count"]

    return import_batches, series_count, record_count, policy_count
