import json
from statistics import fmean

from app.repositories.trading import (
    fetch_day_ahead_fundamental_dates,
    fetch_latest_update,
    fetch_market_summary,
    fetch_metric_exists,
    fetch_metric_points,
    fetch_record_summary,
    fetch_trading_dates,
)
from app.schemas import (
    SeriesPoint,
    TradingContextResponse,
    TradingMetricSnapshot,
    TradingMoment,
    TradingPremarketResponse,
    TradingRiskItem,
)


TRADING_DATA_ITEMS = {
    "day_ahead_fundamental": "日前基本面",
    "market_clearing": "市场出清",
    "day_ahead_price": "日前节点电价",
    "spot_typed_energy": "现货分时分类出清电量",
}


def _number(value: object) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None


def _values(rows: list) -> list[float]:
    return [float(row["value"]) for row in rows if row["value"] is not None]


def _points(rows: list) -> list[SeriesPoint]:
    return [SeriesPoint(point_time=row["point_time"], value=row["value"]) for row in rows]


def _extreme(rows: list, mode: str) -> tuple[float | None, str | None]:
    valid = [row for row in rows if row["value"] is not None]
    if not valid:
        return None, None
    row = max(valid, key=lambda item: item["value"]) if mode == "max" else min(valid, key=lambda item: item["value"])
    return float(row["value"]), row["point_time"]


def _average(rows: list) -> float | None:
    values = _values(rows)
    return fmean(values) if values else None


def _delta(current: float | None, previous: float | None) -> float | None:
    if current is None or previous is None:
        return None
    return current - previous


def _tone(delta: float | None, inverse: bool = False) -> str:
    if delta is None or abs(delta) < 0.5:
        return "flat"
    is_up = delta > 0
    if inverse:
        is_up = not is_up
    return "up" if is_up else "down"


def _payload(rows: list, index: int = 0) -> dict[str, object]:
    if len(rows) <= index:
        return {}
    try:
        return json.loads(rows[index]["payload_json"])
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}


def _market_payload(row: object | None) -> dict[str, object]:
    if not row:
        return {}
    try:
        return json.loads(row["payload_json"])
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}


def _merge_dates(*date_groups: list[str]) -> list[str]:
    return sorted({date for dates in date_groups for date in dates if date}, reverse=True)


def _select_date(requested_date: str | None, dates: list[str], preferred_dates: list[str] | None = None) -> str | None:
    preferred_dates = preferred_dates or []
    if requested_date:
        return requested_date
    if preferred_dates:
        return preferred_dates[0]
    return dates[0] if dates else None


def _status_item(key: str, label: str, present: bool, updated_at: str | None = None) -> dict[str, str | None]:
    return {
        "key": key,
        "label": label,
        "status": "published" if present else "missing",
        "status_label": "已发布" if present else "未发布",
        "updated_at": updated_at if present else None,
    }


def _load_bundle(selected_date: str) -> dict[str, object]:
    records = fetch_record_summary(selected_date)
    market_row = fetch_market_summary(selected_date)
    return {
        "load": fetch_metric_points("统调负荷", selected_date),
        "a_source": fetch_metric_points("省内A类电源", selected_date),
        "b_space": fetch_metric_points("省内B类电源", selected_date),
        "renewable": fetch_metric_points("D日", selected_date, data_topic_prefix="现货新能源总出力"),
        "reserve": fetch_metric_points("正备用", selected_date),
        "records": records,
        "market": _market_payload(market_row),
    }


def _build_data_statuses(selected_date: str, bundle: dict[str, object], updated_at: str | None) -> list[dict[str, str | None]]:
    records = bundle["records"]
    fundamental_present = any(bundle[key] for key in ("load", "a_source", "b_space", "renewable", "reserve")) or any(
        records.values()
    )
    clearing_present = bool(bundle["market"])
    price_present = fetch_metric_exists("电价", selected_date)
    typed_energy_present = fetch_metric_exists("电量", selected_date, data_topic_prefix="分时分类型出清结果")
    return [
        _status_item("day_ahead_fundamental", TRADING_DATA_ITEMS["day_ahead_fundamental"], fundamental_present, updated_at),
        _status_item("market_clearing", TRADING_DATA_ITEMS["market_clearing"], clearing_present, updated_at),
        _status_item("day_ahead_price", TRADING_DATA_ITEMS["day_ahead_price"], price_present, updated_at),
        _status_item("spot_typed_energy", TRADING_DATA_ITEMS["spot_typed_energy"], typed_energy_present, updated_at),
    ]


def _build_context(
    selected_date: str | None,
    dates: list[str],
    updated_at: str | None,
    data_statuses: list[dict[str, str | None]] | None = None,
) -> TradingContextResponse:
    if not selected_date:
        return TradingContextResponse(available_dates=dates)

    data_statuses = data_statuses or []
    present_items = {str(item["key"]) for item in data_statuses if item.get("status") == "published"}
    missing_items = [label for key, label in TRADING_DATA_ITEMS.items() if key not in present_items]
    completeness = round((len(TRADING_DATA_ITEMS) - len(missing_items)) / len(TRADING_DATA_ITEMS) * 100)
    if completeness >= 85:
        status, label = "ready", "盘前数据就绪"
    elif "day_ahead_fundamental" in present_items or completeness >= 50:
        status, label = "partial", "日前基本面可用"
    else:
        status, label = "missing", "关键数据不足"

    try:
        index = dates.index(selected_date)
    except ValueError:
        index = -1
    previous_date = dates[index + 1] if index >= 0 and index + 1 < len(dates) else None
    next_date = dates[index - 1] if index > 0 else None
    return TradingContextResponse(
        selected_date=selected_date,
        available_dates=dates,
        previous_date=previous_date,
        next_date=next_date,
        status=status,
        status_label=label,
        completeness=completeness,
        updated_at=updated_at,
        missing_items=missing_items,
        data_statuses=data_statuses,
    )


def get_trading_context(effective_date: str | None = None) -> TradingContextResponse:
    dates = [row["effective_date"] for row in fetch_trading_dates()]
    fundamental_dates = [row["effective_date"] for row in fetch_day_ahead_fundamental_dates()]
    dates = _merge_dates(dates, fundamental_dates)
    selected_date = _select_date(effective_date, dates, fundamental_dates)
    if not selected_date:
        return TradingContextResponse(available_dates=dates)

    bundle = _load_bundle(selected_date)
    updated_at = fetch_latest_update(selected_date)
    data_statuses = _build_data_statuses(selected_date, bundle, updated_at)
    return _build_context(selected_date, dates, updated_at, data_statuses)


def get_premarket_dashboard(effective_date: str | None = None) -> TradingPremarketResponse:
    dates = [row["effective_date"] for row in fetch_trading_dates()]
    fundamental_dates = [row["effective_date"] for row in fetch_day_ahead_fundamental_dates()]
    dates = _merge_dates(dates, fundamental_dates)
    selected_date = _select_date(effective_date, dates, fundamental_dates)
    if not selected_date:
        return TradingPremarketResponse(
            context=TradingContextResponse(available_dates=dates),
            conclusion="暂无可用于盘前研判的数据。",
            risk_level="unknown",
            risk_label="待补充",
        )

    bundle = _load_bundle(selected_date)
    previous_date = dates[dates.index(selected_date) + 1] if selected_date in dates and dates.index(selected_date) + 1 < len(dates) else None
    previous = _load_bundle(previous_date) if previous_date else {}
    records = bundle["records"]
    market = bundle["market"]

    updated_at = fetch_latest_update(selected_date)
    data_statuses = _build_data_statuses(selected_date, bundle, updated_at)
    context = _build_context(selected_date, dates, updated_at, data_statuses)

    load_peak, load_peak_time = _extreme(bundle["load"], "max")
    previous_load_peak, _ = _extreme(previous.get("load", []), "max")
    b_average = _average(bundle["b_space"])
    previous_b_average = _average(previous.get("b_space", []))
    renewable_peak, renewable_peak_time = _extreme(bundle["renewable"], "max")
    previous_renewable_peak, _ = _extreme(previous.get("renewable", []), "max")
    reserve_min, reserve_min_time = _extreme(bundle["reserve"], "min")
    previous_reserve_min, _ = _extreme(previous.get("reserve", []), "min")

    metrics = [
        TradingMetricSnapshot(
            key="load_peak",
            label="统调负荷峰值",
            value=load_peak,
            detail=f"{load_peak_time or '--'}，较上一交易日",
            delta=_delta(load_peak, previous_load_peak),
            tone=_tone(_delta(load_peak, previous_load_peak), inverse=True),
        ),
        TradingMetricSnapshot(
            key="b_space",
            label="B类竞价空间均值",
            value=b_average,
            detail="全天平均，较上一交易日",
            delta=_delta(b_average, previous_b_average),
            tone=_tone(_delta(b_average, previous_b_average)),
        ),
        TradingMetricSnapshot(
            key="renewable_peak",
            label="新能源预测峰值",
            value=renewable_peak,
            detail=f"{renewable_peak_time or '--'}，较上一交易日",
            delta=_delta(renewable_peak, previous_renewable_peak),
            tone=_tone(_delta(renewable_peak, previous_renewable_peak), inverse=True),
        ),
        TradingMetricSnapshot(
            key="reserve_min",
            label="正备用低点",
            value=reserve_min,
            detail=f"{reserve_min_time or '--'}，较上一交易日",
            delta=_delta(reserve_min, previous_reserve_min),
            tone=_tone(_delta(reserve_min, previous_reserve_min)),
        ),
    ]

    congestion_count = len(records["congestion"])
    unit_limit_count = len(records["unit_limit"])
    maintenance_unit_count = len(records["maintenance_units"])
    risks: list[TradingRiskItem] = []
    if reserve_min is None:
        risks.append(TradingRiskItem(level="warning", title="备用数据缺失", detail="无法判断日内最小正备用水平。", source="备用预测信息"))
    elif reserve_min < 2500:
        risks.append(TradingRiskItem(level="high", title="正备用偏紧", detail=f"{reserve_min_time} 最低约 {reserve_min:,.0f} MW。", source="备用预测信息"))
    elif reserve_min < 4500:
        risks.append(TradingRiskItem(level="warning", title="关注备用低点", detail=f"{reserve_min_time} 最低约 {reserve_min:,.0f} MW。", source="备用预测信息"))

    if congestion_count:
        first_congestion = _payload(records["congestion"])
        risks.append(
            TradingRiskItem(
                level="warning",
                title=f"{congestion_count} 条阻塞预测",
                detail=str(first_congestion.get("阻塞信息") or "请进入运行约束查看明细。"),
                source="阻塞预测信息",
            )
        )
    if unit_limit_count:
        risks.append(
            TradingRiskItem(
                level="warning",
                title=f"{unit_limit_count} 台机组存在出力约束",
                detail="建议结合高峰时段核对受限机组和额定容量。",
                source="机组出力受限情况",
            )
        )

    risk_level, risk_label = ("medium", "需关注") if risks else ("low", "总体平稳")
    conclusion = (
        f"{selected_date} 预计负荷峰值约 {load_peak:,.0f} MW，正备用最低约 {reserve_min:,.0f} MW。"
        if reserve_min is not None and load_peak is not None
        else f"{selected_date} 的部分关键数据尚未齐全，建议先依据现有基本面信息研判。"
    )

    return TradingPremarketResponse(
        context=context,
        conclusion=conclusion,
        risk_level=risk_level,
        risk_label=risk_label,
        metrics=metrics,
        load_series=_points(bundle["load"]),
        b_space_series=_points(bundle["b_space"]),
        renewable_series=_points(bundle["renewable"]),
        reserve_series=_points(bundle["reserve"]),
        moments=[
            TradingMoment(label="负荷峰值", time=load_peak_time, value=load_peak, detail="关注高峰段供需与受限机组"),
            TradingMoment(label="新能源峰值", time=renewable_peak_time, value=renewable_peak, detail="关注新能源高出力对竞价空间的挤压"),
            TradingMoment(label="备用低点", time=reserve_min_time, value=reserve_min, detail="关注安全裕度和临时约束"),
        ],
        risks=risks[:5],
        constraint_summary={
            "congestion_count": congestion_count,
            "unit_limit_count": unit_limit_count,
            "maintenance_unit_count": maintenance_unit_count,
            "maintenance_mw": None,
            "market_maintenance_mw": None,
            "must_open_mw": _number(_payload(records["must_run"]).get("必开机组容量(MW)")),
            "must_stop_mw": _number(_payload(records["must_run"]).get("必停机组容量(MW)")),
        },
        market_summary={
            "day_ahead_offer_price": _number(market.get("日前申报均价(元/MWh)")),
            "day_ahead_clearing_price": _number(market.get("日前出清均价(元/MWh)")),
            "day_ahead_clearing_energy": _number(market.get("日前出清电量(MWh)")),
        },
    )
