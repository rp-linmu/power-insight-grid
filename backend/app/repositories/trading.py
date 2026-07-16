from app.db import get_connection


def fetch_trading_dates(limit: int = 365) -> list:
    with get_connection() as conn:
        return conn.execute(
            """
            SELECT DISTINCT effective_date
            FROM disclosure_date_catalog
            WHERE effective_date IS NOT NULL
              AND effective_date != ''
            ORDER BY effective_date DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()


def fetch_day_ahead_fundamental_dates(limit: int = 365) -> list:
    with get_connection() as conn:
        return conn.execute(
            """
            SELECT DISTINCT t.effective_date
            FROM disclosure_timeseries t
            WHERE t.effective_date IS NOT NULL
              AND t.effective_date != ''
              AND t.market_type = '日前'
              AND t.metric_name IN ('统调负荷', '省内A类电源', '省内B类电源', 'D日', '正备用')
              AND EXISTS (
                  SELECT 1 FROM import_batches b
                  WHERE b.id = t.import_batch_id AND b.is_active = 1
              )
            ORDER BY t.effective_date DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()


def fetch_metric_exists(
    metric_name: str,
    effective_date: str,
    market_type: str = "日前",
    data_topic_prefix: str | None = None,
) -> bool:
    query = """
        SELECT 1
        FROM disclosure_timeseries t
        WHERE t.metric_name = ?
          AND t.market_type = ?
          AND t.effective_date = ?
          AND t.value IS NOT NULL
          AND EXISTS (
              SELECT 1 FROM import_batches b
              WHERE b.id = t.import_batch_id AND b.is_active = 1
          )
    """
    params: list[object] = [metric_name, market_type, effective_date]
    if data_topic_prefix:
        query += " AND data_topic >= ? AND data_topic < ?"
        params.extend([data_topic_prefix, f"{data_topic_prefix}\uffff"])
    query += " LIMIT 1"

    with get_connection() as conn:
        return conn.execute(query, params).fetchone() is not None


def fetch_metric_points(
    metric_name: str,
    effective_date: str,
    market_type: str = "日前",
    data_topic_prefix: str | None = None,
) -> list:
    query = """
        SELECT t.point_time, t.point_index, t.value, t.unit
        FROM disclosure_timeseries t
        WHERE t.metric_name = ?
          AND t.market_type = ?
          AND t.effective_date = ?
          AND EXISTS (
              SELECT 1 FROM import_batches b
              WHERE b.id = t.import_batch_id AND b.is_active = 1
          )
    """
    params: list[object] = [metric_name, market_type, effective_date]
    if data_topic_prefix:
        query += " AND data_topic >= ? AND data_topic < ?"
        params.extend([data_topic_prefix, f"{data_topic_prefix}\uffff"])
    query += " ORDER BY point_index ASC LIMIT 192"

    with get_connection() as conn:
        return conn.execute(query, params).fetchall()


def fetch_record_summary(effective_date: str) -> dict[str, object]:
    sheet_names = {
        "must_run": f"必开必停容量预测信息({effective_date})",
        "unit_limit": f"机组出力受限情况({effective_date})",
        "congestion": f"阻塞预测信息({effective_date})",
        "maintenance_capacity": f"机组检修容量预测信息({effective_date})",
        "maintenance_units": f"机组检修预测信息({effective_date})",
    }
    result: dict[str, object] = {}
    with get_connection() as conn:
        for key, sheet_name in sheet_names.items():
            rows = conn.execute(
                """
                SELECT r.row_key, r.payload_json
                FROM disclosure_records r
                WHERE r.source_sheet = ?
                  AND EXISTS (
                      SELECT 1 FROM import_batches b
                      WHERE b.id = r.import_batch_id AND b.is_active = 1
                  )
                ORDER BY r.id ASC
                """,
                (sheet_name,),
            ).fetchall()
            result[key] = rows
    return result


def fetch_market_summary(effective_date: str) -> object | None:
    with get_connection() as conn:
        return conn.execute(
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
            (effective_date,),
        ).fetchone()


def fetch_latest_update(effective_date: str) -> str | None:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT MAX(created_at) AS updated_at
            FROM import_batches
            WHERE effective_date = ?
              AND is_active = 1
            """,
            (effective_date,),
        ).fetchone()
    return row["updated_at"] if row else None
