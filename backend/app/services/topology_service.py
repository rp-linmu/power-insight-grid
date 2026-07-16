from __future__ import annotations

import json
import math
import re
import unicodedata
from pathlib import Path

from app.repositories.topology import (
    fetch_analysis,
    fetch_available_price_dates,
    fetch_cause_record_candidates,
    fetch_cause_timeseries_signals,
    fetch_grid_lines,
    fetch_grid_nodes,
    fetch_grid_status,
    fetch_manual_mappings,
    fetch_price_series,
    fetch_section_signals,
    import_grid_model,
    replace_analysis_result,
)
from app.services.date_rules import normalize_date


def import_model(source_path: str) -> dict[str, object]:
    path = Path(source_path)
    if not path.exists():
        raise ValueError(f"网架模型文件不存在：{source_path}")
    if path.suffix.lower() not in {".xlsx", ".xlsm"}:
        raise ValueError("当前仅支持 xlsx/xlsm 网架模型")
    return import_grid_model(path)


def get_status() -> dict[str, object]:
    status = fetch_grid_status()
    return {
        "ok": bool(status["lines"]),
        **status,
        "day_ahead_dates": fetch_available_price_dates("日前")[:20],
        "real_time_dates": fetch_available_price_dates("实时")[:20],
    }


def run_analysis(effective_date: str, market_type: str) -> dict[str, object]:
    date = normalize_date(effective_date)
    if not date:
        raise ValueError("无效的业务日期")
    market = "实时" if market_type == "实时" else "日前"

    lines = fetch_grid_lines()
    nodes = fetch_grid_nodes()
    if not lines:
        raise ValueError("尚未导入网架模型，请先导入包含“线路”表的 Excel")

    prices = fetch_price_series(date, market)
    if not prices:
        raise ValueError(f"{date} {market}节点电价尚未入库")

    match_result = match_nodes([str(node["node_name"]) for node in nodes], prices, fetch_manual_mappings())
    price_by_topology = build_topology_price_series(match_result["matched"], prices)
    line_rows, time_rows, threshold = compute_line_spreads(lines, price_by_topology)
    if not line_rows:
        raise ValueError("网架节点与节点电价未形成有效匹配，无法计算线路价差")

    best = max(line_rows, key=lambda row: float(row["max_abs_spread"] or 0))
    summary = {
        "line_count": len(line_rows),
        "matched_node_count": len(price_by_topology),
        "total_node_count": len(nodes),
        "peak_time": best.get("peak_time"),
        "max_abs_spread": best.get("max_abs_spread"),
    }
    network = build_network_payload(date, market, nodes, lines, price_by_topology, line_rows, threshold, match_result)
    run_id = replace_analysis_result(date, market, summary, line_rows, time_rows, network)
    return get_result(date, market, run_if_missing=False) | {"run_id": run_id}


def get_result(
    effective_date: str,
    market_type: str,
    run_if_missing: bool = True,
    point_time: str | None = None,
) -> dict[str, object]:
    date = normalize_date(effective_date)
    if not date:
        raise ValueError("无效的业务日期")
    market = "实时" if market_type == "实时" else "日前"
    time_value = str(point_time or "").strip() or None
    result = fetch_analysis(date, market, point_time=time_value)
    if not result and run_if_missing:
        return run_analysis(date, market)
    if not result:
        return {
            "ok": False,
            "effective_date": date,
            "market_type": market,
            "message": "尚未生成拓扑分析结果",
            "summary": {},
            "ranking": [],
            "causes": [],
            "available_times": [],
            "network": {},
        }
    run = result["run"]
    ranking = result["ranking"]
    network = result["network"]
    if time_value:
        network = apply_time_snapshot(network, ranking, time_value)
    max_abs_spread = ranking[0].get("abs_spread") if time_value and ranking else run["max_abs_spread"]
    peak_time = time_value if time_value else run["peak_time"]
    return {
        "ok": True,
        "effective_date": date,
        "market_type": market,
        "message": "拓扑分析结果已生成",
        "summary": {
            "line_count": run["line_count"],
            "matched_node_count": run["matched_node_count"],
            "total_node_count": run["total_node_count"],
            "match_rate": round((run["matched_node_count"] / max(run["total_node_count"], 1)) * 100, 1),
            "peak_time": peak_time,
            "max_abs_spread": max_abs_spread,
            "created_at": run["created_at"],
            "view_time": time_value,
        },
        "ranking": ranking,
        "causes": build_blockage_causes(date, market, time_value, ranking),
        "section_overview": build_section_overview(date, time_value),
        "available_times": result.get("available_times", []),
        "network": network,
    }


def apply_time_snapshot(network: dict[str, object], ranking: list[dict[str, object]], point_time: str) -> dict[str, object]:
    snapshot = dict(network)
    by_line = {str(row["line_name"]): row for row in ranking}
    edges = []
    for edge in list(snapshot.get("edges") or []):
        next_edge = dict(edge)
        row = by_line.get(str(next_edge.get("line_name")))
        if row:
            next_edge["selected_time"] = point_time
            next_edge["selected_spread"] = row.get("spread")
            next_edge["selected_abs_spread"] = row.get("abs_spread")
            next_edge["max_abs_spread"] = row.get("abs_spread")
            next_edge["blocked"] = bool(row.get("is_blocked"))
        else:
            next_edge["selected_time"] = point_time
            next_edge["selected_spread"] = None
            next_edge["selected_abs_spread"] = None
            next_edge["max_abs_spread"] = None
            next_edge["blocked"] = False
        edges.append(next_edge)
    snapshot["edges"] = edges
    snapshot["view_time"] = point_time
    return snapshot


def compact_text(value: object, max_length: int = 180) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return text if len(text) <= max_length else f"{text[:max_length]}..."


def evidence_text_from_payload(payload_json: str) -> str:
    try:
        payload = json.loads(payload_json)
    except json.JSONDecodeError:
        return compact_text(payload_json)
    if isinstance(payload, dict):
        parts = []
        for key, value in payload.items():
            if value in (None, ""):
                continue
            parts.append(f"{key}:{value}")
        return compact_text("；".join(parts), 240)
    return compact_text(payload)


def line_alias_tokens(line: dict[str, object]) -> list[str]:
    start = str(line.get("node_start") or "")
    end = str(line.get("node_end") or "")
    line_name = str(line.get("line_name") or "")
    tokens = set()
    for value in [start, end, line_name]:
        tokens.update(node_cores(value))
        cleaned = clean_node_name(value)
        if cleaned:
            tokens.add(cleaned)
    start_core = node_cores(start)
    end_core = node_cores(end)
    if start_core and end_core:
        for a in start_core[:2]:
            for b in end_core[:2]:
                tokens.update({a + b, b + a, a[:2] + b[:2], b[:2] + a[:2], a[:1] + b[:1], b[:1] + a[:1]})
    return sorted({token for token in tokens if len(token) >= 2}, key=len, reverse=True)[:16]


def record_weight(source_sheet: str) -> int:
    if "阻塞" in source_sheet:
        return 45
    if "输变电" in source_sheet or "线路停运" in source_sheet or "设备检修" in source_sheet:
        return 38
    if "机组群约束" in source_sheet or "必开必停" in source_sheet:
        return 28
    if "机组出力受限" in source_sheet:
        return 22
    return 12


def build_blockage_causes(
    effective_date: str,
    market_type: str,
    point_time: str | None,
    ranking: list[dict[str, object]],
) -> list[dict[str, object]]:
    top_lines = ranking[:8]
    if not top_lines:
        return []
    records = fetch_cause_record_candidates(effective_date)
    signals = fetch_cause_timeseries_signals(effective_date, point_time)
    section_signals = fetch_section_signals(effective_date)
    signal_texts = [
        {
            **signal,
            "_text": normalize_text(
                f"{signal.get('data_topic') or ''} {signal.get('object_name') or ''} {signal.get('metric_name') or ''}"
            ),
        }
        for signal in signals
    ]
    results = []
    for line in top_lines:
        tokens = line_alias_tokens(line)
        normalized_tokens = [normalize_text(token) for token in tokens if token]
        evidence: list[dict[str, object]] = []
        seen_sources = set()

        evidence.extend(build_section_evidence(line, normalized_tokens, section_signals, point_time))

        for record in records:
            source = str(record.get("source_sheet") or "")
            detail = evidence_text_from_payload(str(record.get("payload_json") or ""))
            searchable = normalize_text(f"{source} {detail}")
            matched = [token for token in normalized_tokens if token and token in searchable]
            if not matched:
                continue
            key = (source, detail[:80])
            if key in seen_sources:
                continue
            seen_sources.add(key)
            evidence.append(
                {
                    "type": "record",
                    "title": cause_title_from_source(source),
                    "detail": detail,
                    "source": source,
                    "score": min(record_weight(source) + min(len(matched), 3) * 6, 60),
                    "matched_terms": matched[:4],
                }
            )
            if len(evidence) >= 5:
                break

        for signal in signal_texts:
            matched = [token for token in normalized_tokens if token and token in str(signal["_text"])]
            if not matched:
                continue
            value = signal.get("value")
            unit = signal.get("unit") or ""
            evidence.append(
                {
                    "type": "timeseries",
                    "title": "关联断面/基本面信号",
                    "detail": f"{signal.get('point_time') or '-'} {signal.get('data_topic') or ''} {signal.get('object_name') or signal.get('metric_name') or ''} = {round(float(value), 2) if value is not None else '-'}{unit}",
                    "source": str(signal.get("data_topic") or ""),
                    "score": 18,
                    "matched_terms": matched[:4],
                }
            )
            if len(evidence) >= 7:
                break

        if not evidence:
            generic = generic_system_signals(signal_texts, point_time)
            evidence.extend(generic)

        total_score = min(sum(int(item.get("score") or 0) for item in evidence), 100)
        if total_score >= 70:
            level = "high"
            label = "高可信"
        elif total_score >= 35:
            level = "medium"
            label = "中可信"
        else:
            level = "low"
            label = "待验证"
        primary = evidence[0]["title"] if evidence else "暂无直接原因证据"
        results.append(
            {
                "line_name": line.get("line_name"),
                "node_start": line.get("node_start"),
                "node_end": line.get("node_end"),
                "market_type": market_type,
                "point_time": point_time or line.get("peak_time"),
                "score": total_score,
                "level": level,
                "level_label": label,
                "summary": f"{primary}；建议结合该线路价差峰值时点核对停运、检修、断面和机组约束。",
                "evidence": evidence[:6],
            }
        )
    return results


def build_section_evidence(
    line: dict[str, object],
    normalized_tokens: list[str],
    section_signals: list[dict[str, object]],
    point_time: str | None,
) -> list[dict[str, object]]:
    target_time = str(point_time or line.get("peak_time") or "").strip()
    if not target_time:
        return []
    target_minutes = time_to_minutes(target_time)
    if target_minutes is None:
        return []

    matched_rows = []
    for signal in section_signals:
        object_text = normalize_text(signal.get("object_name") or "")
        data_topic = str(signal.get("data_topic") or "")
        if not object_text or not ("实时出清断面" in data_topic or "实际断面" in data_topic):
            continue
        matched = [token for token in normalized_tokens if token and token in object_text]
        if not matched:
            continue
        signal_minutes = time_to_minutes(str(signal.get("point_time") or ""))
        if signal_minutes is None:
            continue
        distance = abs(signal_minutes - target_minutes)
        if distance > 30:
            continue
        matched_rows.append((distance, len(matched), signal, matched))

    if not matched_rows:
        return []

    matched_rows.sort(
        key=lambda item: (
            item[0],
            -float(item[2].get("value") or 0),
            -item[1],
            str(item[2].get("object_name") or ""),
        )
    )
    evidence = []
    seen = set()
    for distance, _, signal, matched in matched_rows:
        topic = str(signal.get("data_topic") or "")
        object_name = str(signal.get("object_name") or "")
        key = ("实时出清断面" if "实时出清断面" in topic else "实际断面", object_name)
        if key in seen:
            continue
        seen.add(key)
        value = float(signal.get("value") or 0)
        is_clearing_section = "实时出清断面" in topic
        evidence.append(
            {
                "type": "section_clearing" if is_clearing_section else "section_actual",
                "title": "实时出清断面接近约束" if is_clearing_section else "实际断面运行验证",
                "detail": section_evidence_detail(signal, value, distance),
                "source": topic,
                "score": section_evidence_score(value, distance, is_clearing_section),
                "matched_terms": matched[:4],
            }
        )
        if len(evidence) >= 3:
            break
    return evidence


def section_evidence_detail(signal: dict[str, object], value: float, distance: int) -> str:
    point_time = signal.get("point_time") or "-"
    object_name = signal.get("object_name") or signal.get("metric_name") or "-"
    relation = "同一时点" if distance == 0 else f"距价差时点{distance}分钟"
    return f"{point_time} {object_name} = {round(value, 2)}，{relation}"


def section_evidence_score(value: float, distance: int, is_clearing_section: bool) -> int:
    if is_clearing_section:
        base = 35 if value >= 95 else 28 if value >= 90 else 22 if value >= 85 else 14
    else:
        base = 25 if value >= 90 else 18 if value >= 80 else 10
    if distance == 0:
        base += 6
    elif distance <= 15:
        base += 3
    return min(base, 45)


def build_section_overview(effective_date: str, point_time: str | None) -> dict[str, object]:
    signals = fetch_section_signals(effective_date)
    return {
        "mode": "point" if point_time else "daily_peak",
        "point_time": point_time,
        "realtime_clearing": summarize_section_signals(signals, "实时出清断面", point_time),
        "actual": summarize_section_signals(signals, "实际断面", point_time),
    }


def summarize_section_signals(
    signals: list[dict[str, object]],
    topic_keyword: str,
    point_time: str | None,
    limit: int = 12,
) -> list[dict[str, object]]:
    rows = [signal for signal in signals if topic_keyword in str(signal.get("data_topic") or "")]
    if point_time:
        rows = [signal for signal in rows if signal.get("point_time") == point_time]
        rows.sort(key=lambda item: float(item.get("value") or 0), reverse=True)
    else:
        by_section: dict[str, dict[str, object]] = {}
        for signal in rows:
            section_name = str(signal.get("object_name") or signal.get("metric_name") or "")
            if not section_name:
                continue
            current = by_section.get(section_name)
            if current is None or float(signal.get("value") or 0) > float(current.get("value") or 0):
                by_section[section_name] = signal
        rows = list(by_section.values())
        rows.sort(key=lambda item: float(item.get("value") or 0), reverse=True)
    return [section_signal_payload(row) for row in rows[:limit]]


def section_signal_payload(signal: dict[str, object]) -> dict[str, object]:
    value = float(signal.get("value") or 0)
    return {
        "section_name": signal.get("object_name") or signal.get("metric_name") or "-",
        "point_time": signal.get("point_time"),
        "value": round(value, 2),
        "market_type": signal.get("market_type"),
        "data_topic": signal.get("data_topic"),
        "level": section_signal_level(value),
        "level_label": section_signal_level_label(value),
    }


def section_signal_level(value: float) -> str:
    if value >= 95:
        return "critical"
    if value >= 90:
        return "high"
    if value >= 80:
        return "watch"
    return "normal"


def section_signal_level_label(value: float) -> str:
    if value >= 95:
        return "临界"
    if value >= 90:
        return "高位"
    if value >= 80:
        return "关注"
    return "观察"


def time_to_minutes(value: str) -> int | None:
    matched = re.search(r"(\d{1,2}):(\d{2})", value)
    if not matched:
        return None
    hour = int(matched.group(1))
    minute = int(matched.group(2))
    if hour > 23 or minute > 59:
        return None
    return hour * 60 + minute


def cause_title_from_source(source_sheet: str) -> str:
    if "阻塞" in source_sheet:
        return "披露阻塞信息命中"
    if "输变电" in source_sheet or "设备检修" in source_sheet:
        return "输变电检修/设备计划命中"
    if "线路停运" in source_sheet:
        return "线路停运信息命中"
    if "机组群约束" in source_sheet:
        return "机组群约束关联"
    if "必开必停" in source_sheet:
        return "必开必停约束关联"
    if "机组出力受限" in source_sheet:
        return "机组出力受限关联"
    return "披露记录关联"


def generic_system_signals(signals: list[dict[str, object]], point_time: str | None) -> list[dict[str, object]]:
    evidence = []
    for signal in signals[:3]:
        value = signal.get("value")
        unit = signal.get("unit") or ""
        evidence.append(
            {
                "type": "system",
                "title": "系统运行边界信号",
                "detail": f"{signal.get('point_time') or point_time or '-'} {signal.get('data_topic') or ''} {signal.get('object_name') or signal.get('metric_name') or ''} = {round(float(value), 2) if value is not None else '-'}{unit}",
                "source": str(signal.get("data_topic") or ""),
                "score": 8,
                "matched_terms": [],
            }
        )
    return evidence


def normalize_text(value: object) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).upper().strip()
    text = text.replace("（", "(").replace("）", ")")
    return re.sub(r"\s+", "", text)


def clean_node_name(value: object) -> str:
    text = normalize_text(value)
    text = re.sub(r"#?\d+[A-Z]*", "", text)
    text = re.sub(r"\d+KV|KV|千伏|变电站|站|电厂|厂|其他", "", text)
    text = re.sub(r"[^A-Z0-9\u4e00-\u9fff]", "", text)
    return text


def node_cores(node_name: str) -> list[str]:
    cleaned = clean_node_name(node_name)
    cores = {cleaned}
    for suffix in ("A", "B", "甲", "乙"):
        if cleaned.endswith(suffix) and len(cleaned) > 1:
            cores.add(cleaned[:-1])
    return sorted((core for core in cores if core), key=len, reverse=True)


def match_nodes(
    topology_nodes: list[str],
    price_series: dict[str, list[dict[str, object]]],
    manual_mapping: dict[str, list[str]],
) -> dict[str, object]:
    price_names = list(price_series.keys())
    cleaned_price = {name: clean_node_name(name) for name in price_names}
    matched: dict[str, list[str]] = {}
    rows = []
    for node in topology_nodes:
        manual = [name for name in manual_mapping.get(node, []) if name in price_series]
        if manual:
            matched[node] = manual
            rows.append({"topology_node": node, "matched_price_nodes": manual, "method": "manual", "score": 100})
            continue

        cores = node_cores(node)
        candidates: list[tuple[int, str]] = []
        for price_name, cleaned in cleaned_price.items():
            score = 0
            for core in cores:
                if not core:
                    continue
                if cleaned == core:
                    score = max(score, 100)
                elif cleaned.startswith(core) or cleaned.endswith(core):
                    score = max(score, 88)
                elif core in cleaned:
                    score = max(score, 78)
                elif cleaned in core and len(cleaned) >= 2:
                    score = max(score, 70)
            if "500KV" in normalize_text(price_name):
                score += 3
            if score:
                candidates.append((score, price_name))
        candidates.sort(key=lambda item: (-item[0], len(item[1]), item[1]))
        best_score = candidates[0][0] if candidates else 0
        best = [name for score, name in candidates if score == best_score][:4]
        if best_score >= 75 and best:
            matched[node] = best
            rows.append({"topology_node": node, "matched_price_nodes": best, "method": "auto", "score": best_score})
        else:
            rows.append({"topology_node": node, "matched_price_nodes": [], "method": "unmatched", "score": 0})
    return {"matched": matched, "rows": rows}


def build_topology_price_series(
    matched: dict[str, list[str]],
    prices: dict[str, list[dict[str, object]]],
) -> dict[str, list[dict[str, object]]]:
    result: dict[str, list[dict[str, object]]] = {}
    for node, price_nodes in matched.items():
        by_index: dict[int, dict[str, object]] = {}
        for price_node in price_nodes:
            for point in prices.get(price_node, []):
                index = int(point["point_index"])
                bucket = by_index.setdefault(index, {"point_time": point["point_time"], "values": []})
                if point["value"] is not None:
                    bucket["values"].append(float(point["value"]))
        series = []
        for index in sorted(by_index):
            values = by_index[index]["values"]
            if not values:
                continue
            series.append(
                {
                    "point_index": index,
                    "point_time": by_index[index]["point_time"],
                    "value": sum(values) / len(values),
                }
            )
        if series:
            result[node] = series
    return result


def percentile(values: list[float], q: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    pos = (len(ordered) - 1) * q
    lower = math.floor(pos)
    upper = math.ceil(pos)
    if lower == upper:
        return ordered[int(pos)]
    return ordered[lower] * (upper - pos) + ordered[upper] * (pos - lower)


def compute_line_spreads(
    lines: list[dict[str, object]],
    price_by_node: dict[str, list[dict[str, object]]],
) -> tuple[list[dict[str, object]], list[dict[str, object]], float]:
    raw: list[dict[str, object]] = []
    line_rows = []
    for line in lines:
        start = str(line["node_start"])
        end = str(line["node_end"])
        start_series = {int(p["point_index"]): p for p in price_by_node.get(start, [])}
        end_series = {int(p["point_index"]): p for p in price_by_node.get(end, [])}
        common = sorted(set(start_series).intersection(end_series))
        if not common:
            continue
        points = []
        for index in common:
            start_value = float(start_series[index]["value"])
            end_value = float(end_series[index]["value"])
            spread = start_value - end_value
            points.append(
                {
                    "line_name": line["line_name"],
                    "point_time": start_series[index]["point_time"],
                    "point_index": index,
                    "spread": spread,
                    "abs_spread": abs(spread),
                    "start_price": start_value,
                    "end_price": end_value,
                }
            )
        raw.extend(points)
        peak = max(points, key=lambda item: item["abs_spread"])
        abs_values = [float(point["abs_spread"]) for point in points]
        line_rows.append(
            {
                "line_name": line["line_name"],
                "node_start": start,
                "node_end": end,
                "voltage_level": line.get("voltage_level"),
                "sum_abs_spread": round(sum(abs_values), 4),
                "max_abs_spread": round(float(peak["abs_spread"]), 4),
                "avg_abs_spread": round(sum(abs_values) / len(abs_values), 4),
                "peak_time": peak["point_time"],
                "blocked_points": 0,
                "start_price_at_peak": round(float(peak["start_price"]), 4),
                "end_price_at_peak": round(float(peak["end_price"]), 4),
            }
        )
    threshold = max(percentile([float(row["max_abs_spread"]) for row in line_rows], 0.85), 1.0)
    line_by_name = {str(row["line_name"]): row for row in line_rows}
    time_rows = []
    for item in raw:
        is_blocked = float(item["abs_spread"]) >= threshold
        if is_blocked:
            line_by_name[str(item["line_name"])]["blocked_points"] += 1
        time_rows.append(
            {
                "line_name": item["line_name"],
                "point_time": item["point_time"],
                "point_index": item["point_index"],
                "spread": round(float(item["spread"]), 4),
                "abs_spread": round(float(item["abs_spread"]), 4),
                "is_blocked": is_blocked,
            }
        )
    line_rows.sort(key=lambda row: float(row["sum_abs_spread"] or 0), reverse=True)
    return line_rows, time_rows, threshold


def build_network_payload(
    date: str,
    market: str,
    nodes: list[dict[str, object]],
    lines: list[dict[str, object]],
    price_by_node: dict[str, list[dict[str, object]]],
    line_rows: list[dict[str, object]],
    threshold: float,
    match_result: dict[str, object],
) -> dict[str, object]:
    line_summary = {str(row["line_name"]): row for row in line_rows}
    node_payload = []
    for node in nodes:
        name = str(node["node_name"])
        series = price_by_node.get(name, [])
        latest = series[-1]["value"] if series else None
        node_payload.append(
            {
                "name": name,
                "type": node.get("node_type"),
                "voltage_level": node.get("voltage_level"),
                "region": node.get("region"),
                "longitude": node.get("longitude"),
                "latitude": node.get("latitude"),
                "price": round(float(latest), 4) if latest is not None else None,
                "matched": name in price_by_node,
            }
        )
    edge_payload = []
    for line in lines:
        summary = line_summary.get(str(line["line_name"]))
        edge_payload.append(
            {
                "line_name": line["line_name"],
                "source": line["node_start"],
                "target": line["node_end"],
                "voltage_level": line.get("voltage_level"),
                "capacity": line.get("capacity"),
                "sum_abs_spread": summary.get("sum_abs_spread") if summary else None,
                "max_abs_spread": summary.get("max_abs_spread") if summary else None,
                "peak_time": summary.get("peak_time") if summary else None,
                "blocked": bool(summary and float(summary.get("max_abs_spread") or 0) >= threshold),
            }
        )
    return {
        "date": date,
        "market": market,
        "threshold": round(threshold, 4),
        "nodes": node_payload,
        "edges": edge_payload,
        "match_rows": match_result["rows"],
    }
