from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.db import get_connection, init_db  # noqa: E402


TIMES = [f"{hour:02d}:00" for hour in range(24)]


def _curve(base: float, amplitude: float, peak_shift: float = 0.0) -> list[float]:
    values: list[float] = []
    for index in range(len(TIMES)):
        angle = (index - 7 + peak_shift) / 24 * 2 * math.pi
        evening = math.exp(-((index - 19) ** 2) / 12)
        values.append(round(base + amplitude * (math.sin(angle) + 1) / 2 + amplitude * 0.45 * evening, 2))
    return values


def _insert_batch(file_name: str, file_path: str, category: str, effective_date: str) -> int:
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE import_batches
            SET is_active = 0
            WHERE effective_date = ? AND file_name = ?
            """,
            (effective_date, file_name),
        )
        cursor = conn.execute(
            """
            INSERT INTO import_batches (
                file_name, file_path, category, external_date, detected_sheet_date,
                effective_date, validation_message, is_active
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
            """,
            (
                file_name,
                file_path,
                category,
                effective_date,
                effective_date,
                effective_date,
                "demo sample loaded",
            ),
        )
        return int(cursor.lastrowid)


def _insert_timeseries(
    batch_id: int,
    category: str,
    market_type: str,
    data_topic: str,
    object_name: str | None,
    metric_name: str,
    values: list[float],
    unit: str,
    effective_date: str,
    source_sheet: str,
) -> None:
    rows = [
        (
            batch_id,
            category,
            market_type,
            data_topic,
            object_name,
            metric_name,
            point_time,
            index,
            values[index],
            unit,
            effective_date,
            source_sheet,
        )
        for index, point_time in enumerate(TIMES)
    ]
    with get_connection() as conn:
        conn.executemany(
            """
            INSERT INTO disclosure_timeseries (
                import_batch_id, category, market_type, data_topic, object_name,
                metric_name, point_time, point_index, value, unit, effective_date, source_sheet
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            rows,
        )
        conn.execute(
            """
            INSERT OR IGNORE INTO disclosure_date_catalog (metric_name, market_type, effective_date)
            VALUES (?, ?, ?)
            """,
            (metric_name, market_type, effective_date),
        )


def _insert_record(batch_id: int, category: str, source_sheet: str, payload: dict[str, object], effective_date: str, row_key: str = "1") -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO disclosure_records (
                import_batch_id, category, source_sheet, row_key, payload_json, effective_date
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (batch_id, category, source_sheet, row_key, json.dumps(payload, ensure_ascii=False), effective_date),
        )
        conn.execute(
            """
            INSERT OR IGNORE INTO disclosure_date_catalog (metric_name, market_type, effective_date)
            VALUES ('__file_available__', '', ?)
            """,
            (effective_date,),
        )


def load_demo_day(effective_date: str) -> None:
    init_db()

    sample_root = BACKEND_DIR / "data_samples" / "demo"
    sample_root.mkdir(parents=True, exist_ok=True)

    fundamental_file = sample_root / f"基本面数据_日前__{effective_date}.xlsx"
    clearing_file = sample_root / f"市场出清_{effective_date}.xlsx"
    spot_file = sample_root / f"现货分时分类型出清电量_{effective_date}.xlsx"

    fundamental_batch = _insert_batch(fundamental_file.name, str(fundamental_file), "disclosure", effective_date)
    clearing_batch = _insert_batch(clearing_file.name, str(clearing_file), "clearing", effective_date)
    spot_batch = _insert_batch(spot_file.name, str(spot_file), "clearing", effective_date)

    load = _curve(90000, 32000)
    a_source = _curve(18000, 4500, 2)
    b_space = _curve(72000, 23000, -2)
    renewable = _curve(18000, 18000, -5)
    reserve = [round(6200 - (value - min(load)) * 0.035 + renewable[index] * 0.03, 2) for index, value in enumerate(load)]

    for market_type in ("日前",):
        _insert_timeseries(fundamental_batch, "disclosure", market_type, "基本面数据", None, "统调负荷", load, "MW", effective_date, "负荷信息")
        _insert_timeseries(fundamental_batch, "disclosure", market_type, "基本面数据", None, "省内A类电源", a_source, "MW", effective_date, "电源信息")
        _insert_timeseries(fundamental_batch, "disclosure", market_type, "基本面数据", None, "省内B类电源", b_space, "MW", effective_date, "电源信息")
        _insert_timeseries(fundamental_batch, "disclosure", market_type, "现货新能源总出力", None, "D日", renewable, "MW", effective_date, "新能源信息")
        _insert_timeseries(fundamental_batch, "disclosure", market_type, "基本面数据", None, "正备用", reserve, "MW", effective_date, "备用预测信息")

    _insert_record(
        fundamental_batch,
        "disclosure",
        f"必开必停容量预测信息({effective_date})",
        {"必开机组容量(MW)": 820, "必停机组容量(MW)": 460},
        effective_date,
    )
    _insert_record(
        fundamental_batch,
        "disclosure",
        f"阻塞预测信息({effective_date})",
        {"序号": 1, "阻塞信息": "演示线路A检修叠加晚峰负荷上行，建议关注19:00-21:00价差。"},
        effective_date,
    )
    _insert_record(
        fundamental_batch,
        "disclosure",
        f"机组出力受限情况({effective_date})",
        {"机组名称": "演示电厂#1机组", "电厂名称": "演示电厂", "最小技术出力(MW)": 120, "额定出力(MW)": 320},
        effective_date,
    )
    _insert_record(fundamental_batch, "disclosure", f"机组检修预测信息({effective_date})", {"机组名称": "演示电厂#2机组"}, effective_date)

    _insert_record(
        clearing_batch,
        "clearing",
        "现货分日出清量价",
        {
            "日前申报均价(元/MWh)": 382.15,
            "日前出清均价(元/MWh)": 356.42,
            "日前出清电量(MWh)": 2480000,
            "实时出清均价(元/MWh)": 371.80,
            "实时出清电量(MWh)": 2465000,
        },
        effective_date,
    )

    day_ahead_price = _curve(310, 110, -1)
    real_time_price = [round(value + (18 if index in range(18, 22) else -8), 2) for index, value in enumerate(day_ahead_price)]
    _insert_timeseries(clearing_batch, "clearing", "日前", "节点电价", "全省", "电价", day_ahead_price, "元/MWh", effective_date, "全省-日前节点电价查询")
    _insert_timeseries(clearing_batch, "clearing", "实时", "节点电价", "全省", "电价", real_time_price, "元/MWh", effective_date, "全省-实时节点电价查询")

    source_types = {
        "燃煤": (46000, 9000, 118),
        "燃气": (8500, 6200, 38),
        "风电": (3500, 2600, 22),
        "太阳能": (0, 9500, 26),
        "核电": (10000, 200, 10),
        "储能": (900, 1400, 8),
        "抽蓄": (1500, 3200, 12),
    }
    for source_type, (base, amplitude, units) in source_types.items():
        energy = _curve(base, amplitude)
        real_energy = [round(value * (0.98 + (index % 5) * 0.01), 2) for index, value in enumerate(energy)]
        starts = [round(units + math.sin(index / 24 * 2 * math.pi) * 3, 2) for index in range(24)]
        for market_type, values in (("日前", energy), ("实时", real_energy)):
            object_name = f"现货分时分类型出清电量{market_type}（{source_type}）"
            _insert_timeseries(spot_batch, "clearing", market_type, "分时分类型出清结果", object_name, "电量", values, "MWh", effective_date, source_type)
            _insert_timeseries(spot_batch, "clearing", market_type, "分时分类型出清结果", object_name, "开机台数", starts, "台", effective_date, source_type)

    print(f"Loaded demo day: {effective_date}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Load one sanitized demo day into the open-source SQLite database.")
    parser.add_argument("--date", default="2026-07-01", help="Effective date, YYYY-MM-DD.")
    args = parser.parse_args()
    load_demo_day(args.date)


if __name__ == "__main__":
    main()
