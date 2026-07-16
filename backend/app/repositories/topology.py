from __future__ import annotations

import json
from pathlib import Path

from app.db import get_connection
from app.services.xlsx_reader import read_workbook


def _to_float(value: object) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


def import_grid_model(path: Path) -> dict[str, object]:
    sheets = {sheet["name"]: sheet for sheet in read_workbook(path)}
    node_sheet = sheets.get("节点")
    line_sheet = sheets.get("线路")
    channel_sheet = sheets.get("通道")
    if not line_sheet or len(line_sheet["rows"]) < 2:
        raise ValueError("网架模型缺少“线路”表或线路表为空")

    nodes = []
    if node_sheet and node_sheet["rows"]:
        header = node_sheet["rows"][0]
        for row in node_sheet["rows"][1:]:
            item = dict(zip(header, row))
            node_name = str(item.get("节点名称") or "").strip()
            if not node_name:
                continue
            nodes.append(
                (
                    node_name,
                    str(item.get("类型") or "").strip(),
                    str(item.get("电压等级") or "").strip(),
                    str(item.get("所属区域") or "").strip(),
                    _to_float(item.get("经度")),
                    _to_float(item.get("纬度")),
                )
            )

    header = line_sheet["rows"][0]
    lines = []
    for row in line_sheet["rows"][1:]:
        item = dict(zip(header, row))
        line_name = str(item.get("线路名称") or "").strip()
        node_start = str(item.get("起点") or "").strip()
        node_end = str(item.get("终点") or "").strip()
        if not line_name or not node_start or not node_end:
            continue
        lines.append(
            (
                line_name,
                node_start,
                node_end,
                str(item.get("电压等级") or "").strip(),
                _to_float(item.get("传输容量")),
            )
        )

    channels = []
    if channel_sheet and channel_sheet["rows"]:
        header = channel_sheet["rows"][0]
        for row in channel_sheet["rows"][1:]:
            item = dict(zip(header, row))
            channel_name = str(item.get("通道名称") or "").strip()
            if not channel_name:
                continue
            channels.append((channel_name, _to_float(item.get("传输容量"))))

    with get_connection() as conn:
        conn.execute("DELETE FROM grid_nodes")
        conn.execute("DELETE FROM grid_lines")
        conn.execute("DELETE FROM grid_channels")
        conn.executemany(
            """
            INSERT OR REPLACE INTO grid_nodes (node_name, node_type, voltage_level, region, longitude, latitude)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            nodes,
        )
        conn.executemany(
            """
            INSERT INTO grid_lines (line_name, node_start, node_end, voltage_level, capacity)
            VALUES (?, ?, ?, ?, ?)
            """,
            lines,
        )
        conn.executemany(
            """
            INSERT INTO grid_channels (channel_name, capacity)
            VALUES (?, ?)
            """,
            channels,
        )
    return {
        "ok": True,
        "source_path": str(path),
        "nodes": len(nodes),
        "lines": len(lines),
        "channels": len(channels),
    }


def fetch_grid_status() -> dict[str, object]:
    with get_connection() as conn:
        nodes = conn.execute("SELECT COUNT(*) AS count FROM grid_nodes").fetchone()["count"]
        lines = conn.execute("SELECT COUNT(*) AS count FROM grid_lines").fetchone()["count"]
        channels = conn.execute("SELECT COUNT(*) AS count FROM grid_channels").fetchone()["count"]
        runs = conn.execute("SELECT COUNT(*) AS count FROM topology_analysis_runs").fetchone()["count"]
    return {"nodes": nodes, "lines": lines, "channels": channels, "runs": runs}


def fetch_grid_nodes() -> list[dict[str, object]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT node_name, node_type, voltage_level, region, longitude, latitude
            FROM grid_nodes
            ORDER BY node_name
            """
        ).fetchall()
    return [dict(row) for row in rows]


def fetch_grid_lines() -> list[dict[str, object]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, line_name, node_start, node_end, voltage_level, capacity
            FROM grid_lines
            ORDER BY id
            """
        ).fetchall()
    items = [dict(row) for row in rows]
    counts: dict[str, int] = {}
    for item in items:
        key = str(item["line_name"])
        counts[key] = counts.get(key, 0) + 1
    for item in items:
        key = str(item["line_name"])
        if counts[key] > 1:
            item["line_name"] = f"{item['line_name']}#{item['id']}"
    return items


def fetch_manual_mappings() -> dict[str, list[str]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT topology_node, price_node_name
            FROM grid_node_price_mapping
            ORDER BY topology_node, price_node_name
            """
        ).fetchall()
    mapping: dict[str, list[str]] = {}
    for row in rows:
        mapping.setdefault(row["topology_node"], []).append(row["price_node_name"])
    return mapping


def fetch_price_series(effective_date: str, market_type: str) -> dict[str, list[dict[str, object]]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT t.object_name, t.point_time, t.point_index, AVG(t.value) AS value
            FROM disclosure_timeseries t INDEXED BY idx_disclosure_timeseries_lookup
            WHERE t.metric_name = '电价'
              AND t.market_type = ?
              AND t.effective_date = ?
              AND t.data_topic = '节点电价'
              AND t.object_name IS NOT NULL
              AND t.object_name != ''
              AND t.object_name != '全省'
              AND EXISTS (
                  SELECT 1 FROM import_batches b
                  WHERE b.id = t.import_batch_id AND b.is_active = 1
              )
            GROUP BY t.object_name, t.point_index
            ORDER BY t.object_name, t.point_index
            """,
            (market_type, effective_date),
        ).fetchall()
    series: dict[str, list[dict[str, object]]] = {}
    for row in rows:
        series.setdefault(row["object_name"], []).append(
            {
                "point_time": row["point_time"],
                "point_index": row["point_index"],
                "value": row["value"],
            }
        )
    return series


def replace_analysis_result(
    effective_date: str,
    market_type: str,
    summary: dict[str, object],
    line_rows: list[dict[str, object]],
    time_rows: list[dict[str, object]],
    network_payload: dict[str, object],
) -> int:
    with get_connection() as conn:
        old = conn.execute(
            """
            SELECT id FROM topology_analysis_runs
            WHERE effective_date = ? AND market_type = ?
            """,
            (effective_date, market_type),
        ).fetchone()
        if old:
            old_id = old["id"]
            conn.execute("DELETE FROM topology_network_payloads WHERE run_id = ?", (old_id,))
            conn.execute("DELETE FROM topology_line_time_spread WHERE run_id = ?", (old_id,))
            conn.execute("DELETE FROM topology_line_blockage WHERE run_id = ?", (old_id,))
            conn.execute("DELETE FROM topology_analysis_runs WHERE id = ?", (old_id,))

        cursor = conn.execute(
            """
            INSERT INTO topology_analysis_runs (
                effective_date, market_type, line_count, matched_node_count,
                total_node_count, peak_time, max_abs_spread
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                effective_date,
                market_type,
                int(summary.get("line_count") or 0),
                int(summary.get("matched_node_count") or 0),
                int(summary.get("total_node_count") or 0),
                summary.get("peak_time"),
                summary.get("max_abs_spread"),
            ),
        )
        run_id = int(cursor.lastrowid)
        conn.executemany(
            """
            INSERT INTO topology_line_blockage (
                run_id, line_name, node_start, node_end, voltage_level,
                sum_abs_spread, max_abs_spread, avg_abs_spread, peak_time,
                blocked_points, start_price_at_peak, end_price_at_peak
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    run_id,
                    row["line_name"],
                    row["node_start"],
                    row["node_end"],
                    row.get("voltage_level"),
                    row.get("sum_abs_spread"),
                    row.get("max_abs_spread"),
                    row.get("avg_abs_spread"),
                    row.get("peak_time"),
                    row.get("blocked_points"),
                    row.get("start_price_at_peak"),
                    row.get("end_price_at_peak"),
                )
                for row in line_rows
            ],
        )
        conn.executemany(
            """
            INSERT INTO topology_line_time_spread (
                run_id, line_name, point_time, point_index, spread, abs_spread, is_blocked
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    run_id,
                    row["line_name"],
                    row["point_time"],
                    row["point_index"],
                    row["spread"],
                    row["abs_spread"],
                    1 if row["is_blocked"] else 0,
                )
                for row in time_rows
            ],
        )
        conn.execute(
            """
            INSERT INTO topology_network_payloads (run_id, payload_json)
            VALUES (?, ?)
            """,
            (run_id, json.dumps(network_payload, ensure_ascii=False)),
        )
    return run_id


def fetch_analysis(
    effective_date: str,
    market_type: str,
    top_n: int = 30,
    point_time: str | None = None,
) -> dict[str, object] | None:
    with get_connection() as conn:
        run = conn.execute(
            """
            SELECT * FROM topology_analysis_runs
            WHERE effective_date = ? AND market_type = ?
            """,
            (effective_date, market_type),
        ).fetchone()
        if not run:
            return None
        available_times = conn.execute(
            """
            SELECT DISTINCT point_time, point_index
            FROM topology_line_time_spread
            WHERE run_id = ?
            ORDER BY point_index
            """,
            (run["id"],),
        ).fetchall()
        if point_time:
            ranking = conn.execute(
                """
                SELECT
                    b.line_name,
                    b.node_start,
                    b.node_end,
                    b.voltage_level,
                    b.sum_abs_spread,
                    b.max_abs_spread,
                    b.avg_abs_spread,
                    b.peak_time,
                    b.blocked_points,
                    b.start_price_at_peak,
                    b.end_price_at_peak,
                    t.point_time,
                    t.point_index,
                    t.spread,
                    t.abs_spread,
                    t.is_blocked
                FROM topology_line_time_spread t
                JOIN topology_line_blockage b
                  ON b.run_id = t.run_id AND b.line_name = t.line_name
                WHERE t.run_id = ? AND t.point_time = ?
                ORDER BY t.abs_spread DESC
                LIMIT ?
                """,
                (run["id"], point_time, top_n),
            ).fetchall()
        else:
            ranking = conn.execute(
                """
                SELECT * FROM topology_line_blockage
                WHERE run_id = ?
                ORDER BY sum_abs_spread DESC
                LIMIT ?
                """,
                (run["id"], top_n),
            ).fetchall()
        payload = conn.execute(
            """
            SELECT payload_json FROM topology_network_payloads
            WHERE run_id = ?
            """,
            (run["id"],),
        ).fetchone()
    return {
        "run": dict(run),
        "ranking": [dict(row) for row in ranking],
        "available_times": [row["point_time"] for row in available_times],
        "network": json.loads(payload["payload_json"]) if payload else {},
    }


def fetch_available_price_dates(market_type: str) -> list[str]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT effective_date
            FROM disclosure_date_catalog
            WHERE metric_name = '电价'
              AND market_type = ?
            ORDER BY effective_date DESC
            LIMIT 365
            """,
            (market_type,),
        ).fetchall()
    return [row["effective_date"] for row in rows]


def fetch_cause_record_candidates(effective_date: str, limit: int = 2000) -> list[dict[str, object]]:
    patterns = [
        "%阻塞%",
        "%输变电检修%",
        "%设备检修%",
        "%线路停运%",
        "%机组群约束%",
        "%机组出力受限%",
        "%必开必停%",
    ]
    clauses = " OR ".join(["r.source_sheet LIKE ?"] * len(patterns))
    params: list[object] = [effective_date, *patterns, limit]
    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT r.source_sheet, r.row_key, r.payload_json
            FROM disclosure_records r
            WHERE r.effective_date = ?
              AND ({clauses})
              AND EXISTS (
                  SELECT 1 FROM import_batches b
                  WHERE b.id = r.import_batch_id AND b.is_active = 1
              )
            ORDER BY r.id ASC
            LIMIT ?
            """,
            params,
        ).fetchall()
    return [dict(row) for row in rows]


def fetch_cause_timeseries_signals(effective_date: str, point_time: str | None = None, limit: int = 600) -> list[dict[str, object]]:
    query = """
        SELECT t.market_type, t.data_topic, t.object_name, t.metric_name, t.point_time, t.value, t.unit
        FROM disclosure_timeseries t
        WHERE t.effective_date = ?
          AND t.value IS NOT NULL
          AND (
              t.data_topic LIKE '%断面%'
              OR t.data_topic LIKE '%负荷%'
              OR t.data_topic LIKE '%备用%'
              OR t.data_topic LIKE '%新能源%'
              OR t.data_topic LIKE '%地方电%'
              OR t.data_topic LIKE '%抽蓄%'
          )
          AND EXISTS (
              SELECT 1 FROM import_batches b
              WHERE b.id = t.import_batch_id AND b.is_active = 1
          )
    """
    params: list[object] = [effective_date]
    if point_time:
        query += " AND t.point_time = ?"
        params.append(point_time)
    query += " ORDER BY ABS(t.value) DESC LIMIT ?"
    params.append(limit)
    with get_connection() as conn:
        rows = conn.execute(query, params).fetchall()
    return [dict(row) for row in rows]


def fetch_section_signals(effective_date: str, limit: int = 60000) -> list[dict[str, object]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                t.market_type,
                t.data_topic,
                t.object_name,
                t.metric_name,
                t.point_time,
                t.point_index,
                t.value,
                t.unit
            FROM disclosure_timeseries t
            WHERE t.effective_date = ?
              AND t.value IS NOT NULL
              AND (
                  t.data_topic LIKE '%实时出清断面%'
                  OR t.data_topic LIKE '%实际断面%'
              )
              AND EXISTS (
                  SELECT 1 FROM import_batches b
                  WHERE b.id = t.import_batch_id AND b.is_active = 1
              )
            ORDER BY t.point_index ASC, ABS(t.value) DESC
            LIMIT ?
            """,
            (effective_date, limit),
        ).fetchall()
    return [dict(row) for row in rows]
