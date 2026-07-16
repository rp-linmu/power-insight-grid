from app.db import get_connection


def fetch_series_rows(
    metric_name: str,
    market_type: str | None,
    effective_date: str | None,
    date_from: str | None,
    date_to: str | None,
    object_name: str | None,
    data_topic: str | None,
    limit: int,
) -> list:
    query = """
        SELECT t.metric_name, t.market_type, t.effective_date, t.point_time, t.value, t.unit
        FROM disclosure_timeseries t
        WHERE t.metric_name = ?
          AND EXISTS (
              SELECT 1 FROM import_batches b
              WHERE b.id = t.import_batch_id AND b.is_active = 1
          )
    """
    params: list[object] = [metric_name]

    if market_type:
        query += " AND market_type = ?"
        params.append(market_type)
    if effective_date:
        query += " AND effective_date = ?"
        params.append(effective_date)
    if date_from:
        query += " AND effective_date >= ?"
        params.append(date_from)
    if date_to:
        query += " AND effective_date <= ?"
        params.append(date_to)
    if object_name:
        query += " AND object_name = ?"
        params.append(object_name)
    if data_topic:
        query += " AND data_topic = ?"
        params.append(data_topic)

    query += " ORDER BY effective_date ASC, point_index ASC LIMIT ?"
    params.append(limit)
    with get_connection() as conn:
        return conn.execute(query, params).fetchall()


def fetch_record_rows(sheet_name: str, limit: int | None = None) -> list:
    query = """
        SELECT r.row_key, r.payload_json
        FROM disclosure_records r
        WHERE r.source_sheet >= ?
          AND r.source_sheet < ?
          AND EXISTS (
              SELECT 1 FROM import_batches b
              WHERE b.id = r.import_batch_id AND b.is_active = 1
          )
        ORDER BY r.id ASC
    """
    params: list[object] = [sheet_name, f"{sheet_name}\uffff"]
    if limit is not None:
        query += " LIMIT ?"
        params.append(limit)
    with get_connection() as conn:
        return conn.execute(query, params).fetchall()


def fetch_option_rows() -> tuple[list, list, list]:
    with get_connection() as conn:
        metric_rows = conn.execute(
            """
            SELECT DISTINCT metric_name
            FROM disclosure_timeseries
            WHERE metric_name IS NOT NULL AND metric_name != ''
            ORDER BY metric_name ASC
            LIMIT 5000
            """
        ).fetchall()
        market_rows = conn.execute(
            """
            SELECT DISTINCT market_type
            FROM disclosure_timeseries
            WHERE market_type IS NOT NULL AND market_type != ''
            ORDER BY market_type ASC
            LIMIT 20
            """
        ).fetchall()
        sheet_rows = conn.execute(
            """
            SELECT DISTINCT r.source_sheet
            FROM disclosure_records r
            WHERE r.source_sheet IS NOT NULL AND r.source_sheet != ''
              AND EXISTS (
                  SELECT 1 FROM import_batches b
                  WHERE b.id = r.import_batch_id AND b.is_active = 1
              )
            ORDER BY r.source_sheet ASC
            LIMIT 5000
            """
        ).fetchall()
    return metric_rows, market_rows, sheet_rows


def fetch_date_rows(metric_name: str | None, market_type: str | None) -> list:
    if metric_name:
        query = """
            SELECT DISTINCT effective_date
            FROM disclosure_date_catalog
            WHERE effective_date IS NOT NULL
              AND effective_date != ''
              AND metric_name = ?
        """
        params: list[object] = [metric_name]
        if market_type:
            query += " AND market_type = ?"
            params.append(market_type)
        query += " ORDER BY effective_date DESC LIMIT 365"
        with get_connection() as conn:
            return conn.execute(query, params).fetchall()

    query = """
        SELECT DISTINCT effective_date
        FROM (
            SELECT effective_date
            FROM disclosure_date_catalog
            WHERE effective_date IS NOT NULL
              AND effective_date != ''
    """
    params: list[object] = []
    if market_type:
        query += " AND market_type = ?"
        params.append(market_type)
    query += """
            UNION
            SELECT effective_date
            FROM import_batches
            WHERE is_active = 1
              AND effective_date IS NOT NULL
              AND effective_date != ''
              AND category IN ('disclosure', 'clearing')
        )
        ORDER BY effective_date DESC
        LIMIT 365
    """
    with get_connection() as conn:
        return conn.execute(query, params).fetchall()


def fetch_market_clearing_day(effective_date: str | None) -> tuple[list, object | None]:
    with get_connection() as conn:
        date_rows = conn.execute(
            """
            SELECT DISTINCT effective_date
            FROM import_batches
            WHERE category = 'clearing'
              AND is_active = 1
              AND file_name LIKE '市场出清%'
            ORDER BY effective_date DESC
            LIMIT 365
            """
        ).fetchall()
        selected_date = effective_date or (date_rows[0]["effective_date"] if date_rows else None)
        if not selected_date:
            return date_rows, None
        row = conn.execute(
            """
            SELECT r.payload_json
            FROM disclosure_records r
            JOIN import_batches b ON b.id = r.import_batch_id
            WHERE b.category = 'clearing'
              AND b.is_active = 1
              AND b.effective_date = ?
              AND b.file_name LIKE '市场出清%'
              AND r.source_sheet = '现货分日出清量价'
            ORDER BY r.id DESC
            LIMIT 1
            """,
            (selected_date,),
        ).fetchone()
    return date_rows, row


def fetch_object_rows(
    metric_name: str,
    market_type: str | None,
    data_topic: str | None,
    effective_date: str | None,
    search: str | None,
) -> list:
    query = """
        SELECT DISTINCT t.object_name
        FROM disclosure_timeseries t
        WHERE t.metric_name = ?
          AND t.object_name IS NOT NULL
          AND t.object_name != ''
          AND EXISTS (
              SELECT 1 FROM import_batches b
              WHERE b.id = t.import_batch_id AND b.is_active = 1
          )
    """
    params: list[object] = [metric_name]
    if market_type:
        query += " AND market_type = ?"
        params.append(market_type)
    if data_topic:
        query += " AND data_topic = ?"
        params.append(data_topic)
    if effective_date:
        query += " AND effective_date = ?"
        params.append(effective_date)
    if search:
        query += " AND object_name LIKE ?"
        params.append(f"%{search}%")
    query += " ORDER BY object_name ASC LIMIT 500"
    with get_connection() as conn:
        return conn.execute(query, params).fetchall()


def fetch_ranking_rows(
    metric_name: str,
    market_type: str | None,
    data_topic: str | None,
    effective_date: str | None,
    top_n: int,
    ascending: bool,
    search: str | None,
) -> list:
    order = "ASC" if ascending else "DESC"
    query = f"""
        SELECT t.object_name AS name, AVG(t.value) AS value, MAX(t.unit) AS unit
        FROM disclosure_timeseries t
        WHERE t.metric_name = ?
          AND t.object_name IS NOT NULL
          AND t.object_name != ''
          AND t.object_name != '全省'
          AND EXISTS (
              SELECT 1 FROM import_batches b
              WHERE b.id = t.import_batch_id AND b.is_active = 1
          )
    """
    params: list[object] = [metric_name]
    if market_type:
        query += " AND market_type = ?"
        params.append(market_type)
    if data_topic:
        query += " AND data_topic = ?"
        params.append(data_topic)
    if effective_date:
        query += " AND effective_date = ?"
        params.append(effective_date)
    if search:
        query += " AND object_name LIKE ?"
        params.append(f"%{search}%")
    query += f" GROUP BY object_name ORDER BY value {order} LIMIT ?"
    params.append(top_n)
    with get_connection() as conn:
        return conn.execute(query, params).fetchall()


def fetch_day_ahead_fundamental_path(effective_date: str) -> str | None:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT file_path
            FROM import_batches
            WHERE category = 'disclosure'
              AND is_active = 1
              AND effective_date = ?
              AND file_name LIKE '基本面数据_日前__%'
            ORDER BY id DESC
            LIMIT 1
            """,
            (effective_date,),
        ).fetchone()
    return row["file_path"] if row else None


def fetch_unit_limit_rows(effective_date: str) -> list:
    with get_connection() as conn:
        return conn.execute(
            """
            SELECT r.payload_json
            FROM disclosure_records r
            WHERE r.source_sheet = ?
              AND EXISTS (
                  SELECT 1 FROM import_batches b
                  WHERE b.id = r.import_batch_id AND b.is_active = 1
              )
            ORDER BY r.id ASC
            """,
            (f"机组出力受限情况({effective_date})",),
        ).fetchall()
