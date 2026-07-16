import json
import re
from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path

from app.repositories.disclosure import (
    fetch_day_ahead_fundamental_path,
    fetch_date_rows,
    fetch_market_clearing_day,
    fetch_object_rows,
    fetch_option_rows,
    fetch_ranking_rows,
    fetch_record_rows,
    fetch_series_rows,
    fetch_unit_limit_rows,
)
from app.schemas import (
    DateOptionResponse,
    DisclosureOption,
    MarketClearingDayResponse,
    ObjectOptionResponse,
    RankingResponse,
    RankingRow,
    RecordQueryResponse,
    SeriesPoint,
    SeriesResponse,
    TableRow,
    UnitCommitmentLinkageResponse,
    UnitCommitmentRow,
    UnitStatusSegment,
)
from app.services.xlsx_reader import read_workbook


def derive_region_label(object_name: str) -> str | None:
    name = object_name.replace("全省", "").replace("其他", "").strip()
    if not name:
        return None

    match = re.search(r"([\u4e00-\u9fff]{2,8}(?:站|区|县)?)", name)
    if match:
        return match.group(1)

    match = re.search(r"([\u4e00-\u9fff]{2,6})", name)
    if match:
        return match.group(1)
    return None


def get_series(
    metric_name: str,
    market_type: str | None,
    effective_date: str | None,
    date_from: str | None,
    date_to: str | None,
    object_name: str | None,
    data_topic: str | None,
    limit: int,
) -> SeriesResponse:
    rows = fetch_series_rows(metric_name, market_type, effective_date, date_from, date_to, object_name, data_topic, limit)
    if not rows:
        return SeriesResponse(title=metric_name, unit=None, market_type=market_type, effective_date="", points=[])

    first = rows[0]
    date_values = sorted({row["effective_date"] for row in rows if row["effective_date"]})
    multi_day = len(date_values) > 1 or bool(date_from or date_to)
    return SeriesResponse(
        title=first["metric_name"],
        unit=first["unit"],
        market_type=first["market_type"],
        effective_date=f"{date_values[0]} 至 {date_values[-1]}" if multi_day else first["effective_date"],
        points=[
            SeriesPoint(
                point_time=f"{row['effective_date'][5:]} {row['point_time']}" if multi_day else row["point_time"],
                value=row["value"],
            )
            for row in rows
        ],
    )


def get_records(sheet_name: str) -> list[TableRow]:
    rows = fetch_record_rows(sheet_name, limit=50)
    return [TableRow(row_key=row["row_key"], payload=json.loads(row["payload_json"])) for row in rows]


def get_records_query(
    sheet_name: str,
    search_field: str | None,
    search_value: str | None,
    search_field_2: str | None,
    search_value_2: str | None,
    page: int,
    page_size: int,
) -> RecordQueryResponse:
    rows = fetch_record_rows(sheet_name)
    parsed_rows = [TableRow(row_key=row["row_key"], payload=json.loads(row["payload_json"])) for row in rows]

    if search_field and search_value:
        lowered = search_value.lower()
        parsed_rows = [row for row in parsed_rows if lowered in str(row.payload.get(search_field, "")).lower()]

    if search_field_2 and search_value_2:
        lowered = search_value_2.lower()
        parsed_rows = [row for row in parsed_rows if lowered in str(row.payload.get(search_field_2, "")).lower()]

    total = len(parsed_rows)
    start = (page - 1) * page_size
    end = start + page_size
    return RecordQueryResponse(rows=parsed_rows[start:end], total=total, page=page, page_size=page_size)


def get_options() -> DisclosureOption:
    metric_rows, market_rows, sheet_rows = fetch_option_rows()
    return DisclosureOption(
        metric_names=[row["metric_name"] for row in metric_rows],
        market_types=[row["market_type"] for row in market_rows],
        record_sheets=[row["source_sheet"] for row in sheet_rows],
    )


def get_dates(metric_name: str | None, market_type: str | None) -> DateOptionResponse:
    rows = fetch_date_rows(metric_name, market_type)
    return DateOptionResponse(dates=[row["effective_date"] for row in rows])


def get_market_clearing_day(effective_date: str | None) -> MarketClearingDayResponse:
    date_rows, row = fetch_market_clearing_day(effective_date)
    dates = [item["effective_date"] for item in date_rows]
    selected_date = effective_date or (dates[0] if dates else None)
    payload = json.loads(row["payload_json"]) if row else {}

    def number(key: str) -> float | None:
        value = payload.get(key)
        if value in (None, ""):
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    return MarketClearingDayResponse(
        selected_date=selected_date,
        available_dates=dates,
        day_ahead_offer_price=number("日前申报均价(元/MWh)"),
        day_ahead_clearing_price=number("日前出清均价(元/MWh)"),
        day_ahead_clearing_energy=number("日前出清电量(MWh)"),
        realtime_clearing_price=number("实时出清均价(元/MWh)"),
        realtime_clearing_energy=number("实时出清电量(MWh)"),
    )


def get_objects(
    metric_name: str,
    market_type: str | None,
    data_topic: str | None,
    effective_date: str | None,
    search: str | None,
    region: str | None,
) -> ObjectOptionResponse:
    rows = fetch_object_rows(metric_name, market_type, data_topic, effective_date, search)
    object_names = [row["object_name"] for row in rows]
    regions = sorted({label for label in (derive_region_label(name) for name in object_names) if label})

    if region:
        object_names = [name for name in object_names if derive_region_label(name) == region]

    return ObjectOptionResponse(object_names=object_names, regions=regions)


def get_ranking(
    metric_name: str,
    market_type: str | None,
    data_topic: str | None,
    effective_date: str | None,
    top_n: int,
    ascending: bool,
    region: str | None,
    search: str | None,
) -> RankingResponse:
    rows = fetch_ranking_rows(metric_name, market_type, data_topic, effective_date, top_n, ascending, search)

    if region:
        rows = [row for row in rows if derive_region_label(row["name"]) == region][:top_n]

    unit = rows[0]["unit"] if rows else None
    return RankingResponse(
        title=f"{metric_name}排名",
        unit=unit,
        rows=[RankingRow(name=row["name"], value=row["value"]) for row in rows],
    )


def _number(value: object) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None


@lru_cache(maxsize=12)
def _read_constraint_sheet(
    file_path: str,
    modified_at: float,
) -> tuple[list[str], tuple[tuple[str, tuple[str, ...]], ...], str]:
    del modified_at
    sheets = read_workbook(Path(file_path))
    ordered_sheets = [
        *[sheet for sheet in sheets if "开停机不满足最小约束时间机组信息" in sheet["name"]],
        *[sheet for sheet in sheets if "必开必停机组信息预测信息" in sheet["name"]],
    ]
    for sheet in ordered_sheets:
        if not sheet["rows"]:
            continue
        header = sheet["rows"][0]
        time_columns = [
            (index, value)
            for index, value in enumerate(header)
            if re.fullmatch(r"\d{2}:\d{2}", str(value).strip())
        ]
        if not time_columns:
            continue
        unit_index = header.index("机组名称") if "机组名称" in header else 0
        data_type_index = header.index("数据类型") if "数据类型" in header else None
        times = tuple(value for _, value in time_columns)
        parsed_rows: list[tuple[str, tuple[str, ...]]] = []
        for row in sheet["rows"][1:]:
            unit_name = row[unit_index].strip() if unit_index < len(row) else ""
            if not unit_name:
                continue
            if data_type_index is not None and data_type_index < len(row):
                data_type = row[data_type_index].strip()
                if data_type and data_type not in {"标签", "状态", "开停机状态"}:
                    continue
            values = tuple(
                _normalize_commitment_status(row[index] if index < len(row) else "")
                for index, _ in time_columns
            )
            parsed_rows.append((unit_name, values))
        rows = tuple(parsed_rows)
        mode = "complete" if "开停机不满足最小约束时间机组信息" in sheet["name"] else "fallback"
        return list(times), rows, mode
    return [], (), "missing"


def _normalize_commitment_status(value: str) -> str:
    status = str(value or "").strip()
    if not status:
        return "自由优化"
    if status in {"开", "必开", "约束开机", "约束运行"}:
        return "开"
    if status in {"停", "必停", "约束停机"}:
        return "停"
    if status in {"自由优化", "优化", "自由开停", "市场优化"}:
        return "自由优化"
    return status


def _constraint_data(effective_date: str) -> tuple[list[str], dict[str, tuple[str, ...]], str]:
    file_path = fetch_day_ahead_fundamental_path(effective_date)
    if not file_path:
        return [], {}, "missing"
    path = Path(file_path)
    if not path.exists():
        return [], {}, "missing"
    times, rows, mode = _read_constraint_sheet(str(path), path.stat().st_mtime)
    return times, dict(rows), mode


def clear_disclosure_caches() -> None:
    _read_constraint_sheet.cache_clear()


def _segments(times: list[str], values: tuple[str, ...] | None) -> list[UnitStatusSegment]:
    if not times or not values:
        return []
    output: list[UnitStatusSegment] = []
    start_index = 0
    for index in range(1, len(times) + 1):
        if index < len(times) and index < len(values) and values[index] == values[start_index]:
            continue
        output.append(
            UnitStatusSegment(
                start=times[start_index],
                end=times[index] if index < len(times) else "24:00",
                status=values[start_index] or "未知",
            )
        )
        start_index = index
    return output


def _expand_group_name(unit_name: str) -> list[str]:
    if "、" not in unit_name:
        return [unit_name]
    match = re.match(r"^(.*?)(#[^、]+)、(#[^机]+)机组$", unit_name)
    if not match:
        return [unit_name]
    prefix, first, second = match.groups()
    return [f"{prefix}{first}机组", f"{prefix}{second}机组"]


def _status_values(
    unit_name: str,
    data: dict[str, tuple[str, ...]],
    mode: str,
    times: list[str],
) -> tuple[str, ...] | None:
    if unit_name in data:
        return data[unit_name]
    if mode == "complete" and times:
        return tuple("自由优化" for _ in times)
    return None


def get_unit_commitment_linkage(effective_date: str | None) -> UnitCommitmentLinkageResponse:
    selected = effective_date or date.today().isoformat()
    selected_day = date.fromisoformat(selected)
    previous_date = (selected_day - timedelta(days=1)).isoformat()

    current_times, current, current_mode = _constraint_data(selected)
    previous_times, previous, previous_mode = _constraint_data(previous_date)
    times = current_times or previous_times
    limit_rows = [json.loads(row["payload_json"]) for row in fetch_unit_limit_rows(selected)]
    limits = {
        str(row.get("机组名称") or ""): row
        for row in limit_rows
        if str(row.get("机组名称") or "").strip()
    }

    unit_names = sorted(set(limits) | set(current) | set(previous))
    rows: list[UnitCommitmentRow] = []
    for unit_name in unit_names:
        if unit_name in limits:
            matched_limits = [limits[unit_name]]
        else:
            matched_limits = [limits[name] for name in _expand_group_name(unit_name) if name in limits]
        plant_names = sorted({str(item.get("电厂名称") or "") for item in matched_limits if item.get("电厂名称")})
        minimum_values = [_number(item.get("最小技术出力(MW)")) for item in matched_limits]
        rated_values = [_number(item.get("额定出力(MW)")) for item in matched_limits]
        rows.append(
            UnitCommitmentRow(
                unit_name=unit_name,
                plant_name="、".join(plant_names) or None,
                minimum_output_mw=sum(value for value in minimum_values if value is not None) if matched_limits else None,
                rated_output_mw=sum(value for value in rated_values if value is not None) if matched_limits else None,
                current_segments=_segments(
                    times,
                    _status_values(unit_name, current, current_mode, times),
                ),
                previous_segments=_segments(
                    times,
                    _status_values(unit_name, previous, previous_mode, times),
                ),
            )
        )

    mode_labels = {
        "complete": "完整约束表",
        "fallback": "简化必开必停表",
        "missing": "未发布",
    }
    return UnitCommitmentLinkageResponse(
        selected_date=selected,
        previous_date=previous_date,
        current_constraint_mode=current_mode,
        previous_constraint_mode=previous_mode,
        previous_available=bool(previous),
        times=times,
        rows=rows,
        note=(
            f"当日采用{mode_labels[current_mode]}，前日采用{mode_labels[previous_mode]}。"
            "“开”表示约束运行；“自由优化”表示无最小开停机约束，不代表必然运行；"
            "“停”表示约束停机；缺少完整约束表且简化表未覆盖的机组标记为“约束未发布”。"
        ),
    )
