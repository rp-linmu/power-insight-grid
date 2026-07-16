import Link from "next/link";

import FilterBar from "../../components/FilterBar";
import LineChart from "../../components/LineChart";
import StatCards from "../../components/StatCards";
import {
  getDisclosureDates,
  getDisclosureObjects,
  getDisclosureRanking,
  getMarketClearingDay,
  getSeries,
  RankingResponse,
  SeriesResponse,
} from "../../lib/api";

type ClearingPageProps = {
  searchParams?: Promise<{
    view?: string;
    mode?: string;
    date?: string;
    compare_date?: string;
    date_compare?: string;
    primary_date_ranges?: string;
    secondary_date_ranges?: string;
    energy_type?: string;
    energy_types?: string;
    node?: string;
    node_search?: string;
    market?: string;
    trade_date?: string;
  }>;
};

type Point = SeriesResponse["points"][number];
type EnergyTypeOption = {
  label: string;
  source: string;
};
type EnergyBundle = {
  type: EnergyTypeOption;
  dayAheadEnergy: SeriesResponse;
  realtimeEnergy: SeriesResponse;
  dayAheadUnits: SeriesResponse;
  realtimeUnits: SeriesResponse;
};

const ENERGY_TYPES: EnergyTypeOption[] = [
  { label: "全部", source: "全部" },
  { label: "燃煤", source: "燃煤" },
  { label: "燃气", source: "燃气" },
  { label: "风电", source: "风电" },
  { label: "太阳能", source: "太阳能" },
  { label: "核电", source: "核电" },
  { label: "储能", source: "独立储能" },
  { label: "抽蓄", source: "抽蓄" },
];

const DEFAULT_ENERGY_TYPES = ["燃煤", "燃气", "风电", "太阳能"];

const ENERGY_COLORS: Record<string, string> = {
  全部: "#334155",
  燃煤: "#7c2d12",
  燃气: "#d97706",
  风电: "#0f766e",
  太阳能: "#ca8a04",
  核电: "#185c9d",
  储能: "#7c3aed",
  抽蓄: "#0369a1",
};

const PEAK_WINDOWS = [
  { label: "谷段", start: "00:00", end: "08:00", color: "#2563eb" },
  { label: "平段", start: "08:00", end: "14:00", color: "#d97706" },
  { label: "峰段", start: "14:00", end: "19:00", color: "#dc2626" },
  { label: "晚峰", start: "19:00", end: "23:45", color: "#b45309" },
];

function latestValue(points: Point[]) {
  return points.at(-1)?.value ?? null;
}

function averageValue(points: Point[]) {
  const values = points.map((point) => point.value).filter((value): value is number => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function sumValue(points: Point[]) {
  const values = points.map((point) => point.value).filter((value): value is number => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function formatValue(value: number | null | undefined, unit: string, digits = 2) {
  if (value === null || value === undefined) return "-";
  return `${value.toFixed(Math.abs(value) >= 1000 ? 0 : digits)} ${unit}`;
}

function normalizeTime(label: string) {
  const match = label.match(/(\d{1,2}:\d{2})$/);
  return match ? match[1].padStart(5, "0") : label;
}

function alignDeviation(current: Point[], compare: Point[]) {
  const compareMap = new Map(compare.map((point) => [normalizeTime(point.point_time), point.value]));
  return current
    .map((point) => {
      const compareValue = compareMap.get(normalizeTime(point.point_time));
      if (point.value === null || compareValue === null || compareValue === undefined) return null;
      return {
        time: normalizeTime(point.point_time),
        current: point.value,
        compare: compareValue,
        deviation: point.value - compareValue,
      };
    })
    .filter(Boolean) as { time: string; current: number; compare: number; deviation: number }[];
}

function topDeviationRows(current: Point[], compare: Point[], limit = 8) {
  return alignDeviation(current, compare)
    .sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation))
    .slice(0, limit);
}

function previousAvailableDate(value: string, dates: string[]) {
  const previous = dates.filter((item) => item < value).sort().at(-1);
  if (previous) return previous;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function splitObjectName(market: "日前" | "实时", sourceType: string) {
  return `现货分时分类型出清电量-${market}（${sourceType}）`;
}

async function getSplitSeries(metric: string, market: "日前" | "实时", date: string, sourceType: string) {
  return getSeries(metric, market, date, splitObjectName(market, sourceType), "分时分类型出清结果", 200);
}

function rankingRows(response: RankingResponse) {
  return response.rows.filter((row) => row.value !== null);
}

function parseEnergyLabels(value?: string) {
  const labels = (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const valid = labels.filter((label) => ENERGY_TYPES.some((item) => item.label === label));
  return valid.length ? valid : DEFAULT_ENERGY_TYPES;
}

function colorForEnergy(label: string, variant: "primary" | "secondary" | "dayAhead" | "realtime" = "primary") {
  const base = ENERGY_COLORS[label] || "#0f766e";
  if (variant === "secondary") return "#64748b";
  if (variant === "dayAhead") return "#d97706";
  if (variant === "realtime") return base;
  return base;
}

function hasPoints(series: SeriesResponse) {
  return series.points.some((point) => point.value !== null);
}

function bundleHasPoints(bundle: Record<string, EnergyBundle>, labels: string[], mode: "compare" | "dayAhead" | "realTime") {
  return labels.some((label) => {
    const item = bundle[label];
    if (!item) return false;
    if (mode === "dayAhead") return hasPoints(item.dayAheadEnergy) || hasPoints(item.dayAheadUnits);
    if (mode === "realTime") return hasPoints(item.realtimeEnergy) || hasPoints(item.realtimeUnits);
    return (
      hasPoints(item.dayAheadEnergy) ||
      hasPoints(item.dayAheadUnits) ||
      hasPoints(item.realtimeEnergy) ||
      hasPoints(item.realtimeUnits)
    );
  });
}

export default async function ClearingPage({ searchParams }: ClearingPageProps) {
  const params = (await searchParams) || {};
  const view = params.view === "price" ? "price" : "overview";
  const fallbackContextDate = params.trade_date || params.date || "";

  if (view === "price") {
    return renderPriceView(params, fallbackContextDate);
  }

  const mode =
    params.mode === "compare" || params.mode === "realTime" || params.mode === "dayAhead" ? params.mode : "dayAhead";
  const dateCompareEnabled = params.date_compare === "1" || params.date_compare === "true";
  const selectedEnergyLabels = parseEnergyLabels(params.energy_types || params.energy_type);
  const selectedEnergyTypes = selectedEnergyLabels
    .map((label) => ENERGY_TYPES.find((item) => item.label === label))
    .filter(Boolean) as typeof ENERGY_TYPES;
  const [dayAheadDates, realtimeDates, priceDayAheadDates, priceRealtimeDates] = await Promise.all([
    getDisclosureDates("电量", "日前"),
    getDisclosureDates("电量", "实时"),
    getDisclosureDates("电价", "日前"),
    getDisclosureDates("电价", "实时"),
  ]);
  const availableDates = Array.from(
    new Set([...dayAheadDates.dates, ...realtimeDates.dates, ...priceDayAheadDates.dates, ...priceRealtimeDates.dates])
  )
    .filter(Boolean)
    .sort()
    .reverse();
  const legacyPrimaryDate = params.primary_date_ranges?.split("~")[0];
  const legacySecondaryDate = params.secondary_date_ranges?.split("~")[0];
  const primaryDate = params.date || legacyPrimaryDate || fallbackContextDate || availableDates[0] || "";
  const secondaryFallback = primaryDate ? previousAvailableDate(primaryDate, availableDates) : availableDates[1] || "";
  const secondaryDate = params.compare_date || legacySecondaryDate || secondaryFallback;
  const dateOptions = Array.from(new Set([primaryDate, secondaryDate, ...availableDates].filter(Boolean))).sort().reverse();

  const emptySeries: SeriesResponse = { title: "", unit: null, market_type: null, effective_date: "", points: [] };

  const loadEnergyBundle = async (date: string): Promise<Record<string, EnergyBundle>> => {
    const entries = await Promise.all(
      selectedEnergyTypes.map(async (type) => {
        const [dayAheadEnergy, realtimeEnergy, dayAheadUnits, realtimeUnits] = await Promise.all([
          getSplitSeries("电量", "日前", date, type.source),
          getSplitSeries("电量", "实时", date, type.source),
          getSplitSeries("开机台数", "日前", date, type.source),
          getSplitSeries("开机台数", "实时", date, type.source),
        ]);
        return [type.label, { type, dayAheadEnergy, realtimeEnergy, dayAheadUnits, realtimeUnits }] as const;
      })
    );
    return Object.fromEntries(entries);
  };

  const [
    primaryMarketClearing,
    secondaryMarketClearing,
    primaryDayAheadPrice,
    primaryRealtimePrice,
    secondaryDayAheadPrice,
    secondaryRealtimePrice,
    primaryEnergyBundle,
    secondaryEnergyBundle,
  ] = await Promise.all([
    getMarketClearingDay(primaryDate),
    dateCompareEnabled ? getMarketClearingDay(secondaryDate) : Promise.resolve(null),
    getSeries("电价", "日前", primaryDate, "全省", "节点电价", 200),
    getSeries("电价", "实时", primaryDate, "全省", "节点电价", 200),
    dateCompareEnabled ? getSeries("电价", "日前", secondaryDate, "全省", "节点电价", 200) : Promise.resolve(emptySeries),
    dateCompareEnabled ? getSeries("电价", "实时", secondaryDate, "全省", "节点电价", 200) : Promise.resolve(emptySeries),
    loadEnergyBundle(primaryDate),
    dateCompareEnabled ? loadEnergyBundle(secondaryDate) : Promise.resolve({} as Record<string, EnergyBundle>),
  ]);

  const primaryPrice = mode === "dayAhead" ? primaryDayAheadPrice : primaryRealtimePrice;
  const secondaryPrice = mode === "dayAhead" ? secondaryDayAheadPrice : secondaryRealtimePrice;
  const primaryEnergy = primaryEnergyBundle[selectedEnergyLabels[0]]
    ? mode === "dayAhead"
      ? primaryEnergyBundle[selectedEnergyLabels[0]].dayAheadEnergy
      : primaryEnergyBundle[selectedEnergyLabels[0]].realtimeEnergy
    : emptySeries;
  const secondaryEnergy = secondaryEnergyBundle[selectedEnergyLabels[0]]
    ? mode === "dayAhead"
      ? secondaryEnergyBundle[selectedEnergyLabels[0]].dayAheadEnergy
      : secondaryEnergyBundle[selectedEnergyLabels[0]].realtimeEnergy
    : emptySeries;

  const primaryAvgPrice = averageValue(primaryPrice.points);
  const secondaryAvgPrice = averageValue(secondaryPrice.points);
  const primaryDisplayAvgPrice =
    mode === "compare" ? averageValue(primaryRealtimePrice.points) ?? averageValue(primaryDayAheadPrice.points) : primaryAvgPrice;
  const secondaryDisplayAvgPrice =
    mode === "compare" ? averageValue(secondaryRealtimePrice.points) ?? averageValue(secondaryDayAheadPrice.points) : secondaryAvgPrice;
  const datePriceSpread =
    primaryDisplayAvgPrice !== null && secondaryDisplayAvgPrice !== null ? primaryDisplayAvgPrice - secondaryDisplayAvgPrice : null;
  const primaryEnergySum = selectedEnergyLabels.reduce((sum, label) => {
    const series = primaryEnergyBundle[label]
      ? mode === "dayAhead"
        ? primaryEnergyBundle[label].dayAheadEnergy
        : primaryEnergyBundle[label].realtimeEnergy
      : emptySeries;
    return sum + (sumValue(series.points) || 0);
  }, 0);
  const secondaryEnergySum = selectedEnergyLabels.reduce((sum, label) => {
    const series = secondaryEnergyBundle[label]
      ? mode === "dayAhead"
        ? secondaryEnergyBundle[label].dayAheadEnergy
        : secondaryEnergyBundle[label].realtimeEnergy
      : emptySeries;
    return sum + (sumValue(series.points) || 0);
  }, 0);
  const dateEnergySpread =
    dateCompareEnabled && primaryEnergySum !== null && secondaryEnergySum !== null ? primaryEnergySum - secondaryEnergySum : null;
  const marketSpread =
    primaryMarketClearing.day_ahead_clearing_price !== null && primaryMarketClearing.realtime_clearing_price !== null
      ? primaryMarketClearing.realtime_clearing_price - primaryMarketClearing.day_ahead_clearing_price
      : null;
  const primaryPriceAvailable =
    mode === "compare"
      ? hasPoints(primaryDayAheadPrice) || hasPoints(primaryRealtimePrice)
      : hasPoints(primaryPrice);
  const secondaryPriceAvailable =
    mode === "compare"
      ? hasPoints(secondaryDayAheadPrice) || hasPoints(secondaryRealtimePrice)
      : hasPoints(secondaryPrice);
  const primaryDataAvailable = primaryPriceAvailable || bundleHasPoints(primaryEnergyBundle, selectedEnergyLabels, mode);
  const secondaryDataAvailable =
    secondaryPriceAvailable || bundleHasPoints(secondaryEnergyBundle, selectedEnergyLabels, mode);
  const realtimeMissingInCompare =
    mode === "compare" &&
    (hasPoints(primaryDayAheadPrice) || bundleHasPoints(primaryEnergyBundle, selectedEnergyLabels, "dayAhead")) &&
    !hasPoints(primaryRealtimePrice) &&
    !bundleHasPoints(primaryEnergyBundle, selectedEnergyLabels, "realTime");
  const marketLabel = mode === "dayAhead" ? "日前" : mode === "realTime" ? "实时" : "日前 vs 实时";
  const priceSeries = dateCompareEnabled
    ? mode === "compare"
      ? [
          { label: "运行日实时", color: "#0f766e", date: primaryDate, points: primaryRealtimePrice.points },
          { label: "运行日日前", color: "#d97706", date: primaryDate, points: primaryDayAheadPrice.points },
          { label: "对比日实时", color: "#185c9d", date: secondaryDate, points: secondaryRealtimePrice.points },
          { label: "对比日日前", color: "#b45309", date: secondaryDate, points: secondaryDayAheadPrice.points },
        ]
      : [
          { label: "运行日", color: "#0f766e", date: primaryDate, points: primaryPrice.points },
          { label: "对比日", color: "#d97706", date: secondaryDate, points: secondaryPrice.points },
        ]
    : mode === "compare"
      ? [
          { label: "实时", color: "#0f766e", date: primaryDate, points: primaryRealtimePrice.points },
          { label: "日前", color: "#d97706", date: primaryDate, points: primaryDayAheadPrice.points },
        ]
      : [{ label: marketLabel, color: "#0f766e", date: primaryDate, points: primaryPrice.points }];
  const buildTypeSeries = (label: string, metric: "energy" | "units") => {
      const primary = primaryEnergyBundle[label];
      const secondary = secondaryEnergyBundle[label];
      if (!primary) return [];
      const key = metric === "energy" ? "Energy" : "Units";
      if (!dateCompareEnabled) {
        if (mode === "compare") {
          return [
            {
              label: `${label}实时`,
              color: colorForEnergy(label, "realtime"),
              date: primaryDate,
              points: primary[`realtime${key}` as "realtimeEnergy" | "realtimeUnits"].points,
            },
            {
              label: `${label}日前`,
              color: colorForEnergy(label, "dayAhead"),
              date: primaryDate,
              points: primary[`dayAhead${key}` as "dayAheadEnergy" | "dayAheadUnits"].points,
            },
          ];
        }
        const series = mode === "dayAhead" ? primary[`dayAhead${key}` as "dayAheadEnergy" | "dayAheadUnits"] : primary[`realtime${key}` as "realtimeEnergy" | "realtimeUnits"];
        return [{ label, color: colorForEnergy(label), date: primaryDate, points: series.points }];
      }
      if (mode === "compare") {
        return [
          {
            label: `${label}运行日实时`,
            color: colorForEnergy(label, "realtime"),
            date: primaryDate,
            points: primary[`realtime${key}` as "realtimeEnergy" | "realtimeUnits"].points,
          },
          {
            label: `${label}运行日日前`,
            color: colorForEnergy(label, "dayAhead"),
            date: primaryDate,
            points: primary[`dayAhead${key}` as "dayAheadEnergy" | "dayAheadUnits"].points,
          },
          ...(secondary
            ? [
                {
                  label: `${label}对比日实时`,
                  color: "#185c9d",
                  date: secondaryDate,
                  points: secondary[`realtime${key}` as "realtimeEnergy" | "realtimeUnits"].points,
                },
                {
                  label: `${label}对比日日前`,
                  color: "#b45309",
                  date: secondaryDate,
                  points: secondary[`dayAhead${key}` as "dayAheadEnergy" | "dayAheadUnits"].points,
                },
              ]
            : []),
        ];
      }
      const primarySeries = mode === "dayAhead" ? primary[`dayAhead${key}` as "dayAheadEnergy" | "dayAheadUnits"] : primary[`realtime${key}` as "realtimeEnergy" | "realtimeUnits"];
      const secondarySeries = secondary
        ? mode === "dayAhead"
          ? secondary[`dayAhead${key}` as "dayAheadEnergy" | "dayAheadUnits"]
          : secondary[`realtime${key}` as "realtimeEnergy" | "realtimeUnits"]
        : emptySeries;
      return [
        { label: `${label}运行日`, color: colorForEnergy(label), date: primaryDate, points: primarySeries.points },
        { label: `${label}对比日`, color: colorForEnergy(label, "secondary"), date: secondaryDate, points: secondarySeries.points },
      ];
    };

  return (
    <section className="section clearing-compare-page">
      <div className="section-head">
        <div>
          <h2>市场出清与分时电量对比</h2>
          <p>选择运行日和对比日，查看不同日期之间的价格、电量和开机结构变化。</p>
        </div>
        <div className="pill-row">
          <Link className="pager-chip pager-chip-active" href="/clearing">
            出清总览
          </Link>
          <Link className="pager-chip" href="/clearing?view=price">
            节点电价
          </Link>
        </div>
      </div>

      <article className="panel section-card compact-section clearing-control-panel">
        <FilterBar
          fields={[
            {
              name: "mode",
              label: "市场口径",
                value: mode,
                options: [
                  { label: "仅日前", value: "dayAhead" },
                  { label: "仅实时", value: "realTime" },
                  { label: "日前 vs 实时", value: "compare" },
                ],
              },
            {
              name: "date_compare",
              label: "日期对比",
              value: dateCompareEnabled ? "1" : "",
              type: "checkbox",
            },
            {
              name: "date",
              label: "运行日",
              value: primaryDate,
              options: dateOptions.map((item) => ({ label: item, value: item })),
            },
            {
              name: "compare_date",
              label: "对比日",
              value: secondaryDate,
              disabled: !dateCompareEnabled,
              options: dateOptions.map((item) => ({ label: item, value: item })),
            },
            {
              name: "energy_types",
              label: "电源类型",
              value: selectedEnergyLabels.join(","),
              type: "multiselect",
              options: ENERGY_TYPES.map((item) => ({ label: item.label, value: item.label })),
            },
          ]}
        />
        <div className="clearing-status-row">
          <span className={primaryDataAvailable ? "status-pill is-ok" : "status-pill is-warn"}>
            运行日{primaryDataAvailable ? "可用" : "缺失"}
          </span>
          {dateCompareEnabled ? (
            <span className={secondaryDataAvailable ? "status-pill is-ok" : "status-pill is-warn"}>
              对比日{secondaryDataAvailable ? "可用" : "缺失"}
            </span>
          ) : null}
          {realtimeMissingInCompare ? (
            <span className="status-pill is-warn">实时未入库，当前仅有日前数据</span>
          ) : null}
          <span className="muted">当前类型：{selectedEnergyLabels.join("、")}</span>
        </div>
      </article>

      <StatCards
        items={
          dateCompareEnabled
            ? [
                {
                  title: "运行日均价",
                  value: formatValue(primaryDisplayAvgPrice, "元/MWh"),
                  detail: `${primaryDate} ${mode === "dayAhead" ? "日前" : mode === "realTime" ? "实时" : "实时口径"}`,
                },
                {
                  title: "对比日均价",
                  value: formatValue(secondaryDisplayAvgPrice, "元/MWh"),
                  detail: `${secondaryDate} ${mode === "dayAhead" ? "日前" : mode === "realTime" ? "实时" : "实时口径"}`,
                },
                {
                  title: "运行日-对比日价差",
                  value: formatValue(datePriceSpread, "元/MWh"),
                  detail: datePriceSpread === null ? "等待可比价格" : datePriceSpread >= 0 ? "运行日高于对比日" : "运行日低于对比日",
                  tone: datePriceSpread === null ? "flat" : datePriceSpread >= 0 ? "up" : "down",
                },
                {
                  title: "选中电源电量变化",
                  value: formatValue(dateEnergySpread, "MWh", 0),
                  detail:
                    dateEnergySpread === null
                      ? "等待可比电量"
                      : dateEnergySpread >= 0
                        ? "运行日多出清"
                        : "运行日少出清",
                  tone: dateEnergySpread === null ? "flat" : dateEnergySpread >= 0 ? "up" : "down",
                },
              ]
            : [
                {
                  title: "运行日均价",
                  value: formatValue(primaryDisplayAvgPrice, "元/MWh"),
                  detail: `${primaryDate} ${mode === "dayAhead" ? "日前" : mode === "realTime" ? "实时" : "实时口径"}`,
                },
                {
                  title: "运行日实时-日前",
                  value: formatValue(marketSpread, "元/MWh"),
                  detail: marketSpread === null ? "等待日前/实时价格" : marketSpread >= 0 ? "实时高于日前" : "实时低于日前",
                  tone: marketSpread === null ? "flat" : marketSpread >= 0 ? "up" : "down",
                },
                {
                  title: "选中电源电量",
                  value: formatValue(primaryEnergySum, "MWh", 0),
                  detail: selectedEnergyLabels.join("、"),
                },
              ]
        }
      />

      <article className="panel section-card compact-section">
        <div className="section-head section-head-tight">
          <div>
            <h3>{dateCompareEnabled ? "出清价格日期对比" : "运行日出清价格"}</h3>
            <p className="muted">
              {dateCompareEnabled ? "运行日与对比日同屏展示，偏差柱展示运行日减对比日。" : "默认聚焦运行日，按所选市场口径查看价格曲线。"}
            </p>
          </div>
          <span className="pill">
            {dateCompareEnabled ? `${primaryDate} / ${secondaryDate}` : primaryDate}
          </span>
        </div>
        <LineChart
          title={dateCompareEnabled ? "运行日与对比日出清价格" : `${primaryDate} 出清价格`}
          unit="元/MWh"
          highlights={PEAK_WINDOWS}
          showDeviation={dateCompareEnabled && mode !== "compare"}
          series={priceSeries}
        />
      </article>

      <section className="panel section-card compact-section">
        <div className="section-head section-head-tight">
          <div>
            <h3>{dateCompareEnabled ? "分时出清电量日期对比" : "运行日分时出清电量"}</h3>
            <p className="muted">按电源类型拆分展示，避免不同量级曲线互相挤压。</p>
          </div>
          <span className="pill">
            {dateCompareEnabled ? `${primaryDate} / ${secondaryDate}` : primaryDate}
          </span>
        </div>
        <div className="clearing-type-chart-grid">
          {selectedEnergyLabels.map((label) => (
            <article className="clearing-type-chart-card" key={`energy-${label}`}>
              <LineChart
                title={`${label}电量`}
                unit="MWh"
                showDeviation={dateCompareEnabled && mode !== "compare"}
                series={buildTypeSeries(label, "energy")}
              />
            </article>
          ))}
        </div>
      </section>

      <section className="panel section-card compact-section">
        <div className="section-head section-head-tight">
          <div>
            <h3>{dateCompareEnabled ? "开机台数日期对比" : "运行日开机台数"}</h3>
            <p className="muted">按电源类型查看开机结构，便于观察日前、实时和日期变化。</p>
          </div>
          <span className="pill">
            {dateCompareEnabled ? `${primaryDate} / ${secondaryDate}` : primaryDate}
          </span>
        </div>
        <div className="clearing-type-chart-grid">
          {selectedEnergyLabels.map((label) => (
            <article className="clearing-type-chart-card" key={`units-${label}`}>
              <LineChart
                title={`${label}开机台数`}
                unit="台"
                showDeviation={dateCompareEnabled && mode !== "compare"}
                series={buildTypeSeries(label, "units")}
              />
            </article>
          ))}
        </div>
      </section>

      {dateCompareEnabled ? (
        <div className="clearing-compare-grid">
          <DeviationTable title="价格日期差异时段" unit="元/MWh" rows={topDeviationRows(primaryPrice.points, secondaryPrice.points, 8)} />
          <DeviationTable title={`${selectedEnergyLabels[0]}电量日期差异时段`} unit="MWh" rows={topDeviationRows(primaryEnergy.points, secondaryEnergy.points, 8)} />
        </div>
      ) : null}
    </section>
  );
}

function DeviationTable({
  title,
  unit,
  rows,
}: {
  title: string;
  unit: string;
  rows: { time: string; current: number; compare: number; deviation: number }[];
}) {
  return (
    <article className="panel section-card compact-section">
      <h3>{title}</h3>
      <div className="clearing-table">
        <div className="clearing-table-head">
          <span>时点</span>
          <span>运行日</span>
          <span>对比日</span>
          <span>偏差</span>
        </div>
        {rows.length ? (
          rows.map((row) => (
            <div className="clearing-table-row" key={`${title}-${row.time}`}>
              <strong>{row.time}</strong>
              <span>{formatValue(row.current, unit)}</span>
              <span>{formatValue(row.compare, unit)}</span>
              <em className={row.deviation >= 0 ? "change-up" : "change-down"}>{formatValue(row.deviation, unit)}</em>
            </div>
          ))
        ) : (
          <p className="muted">暂无可比异常时段。</p>
        )}
      </div>
    </article>
  );
}

async function renderPriceView(params: Awaited<NonNullable<ClearingPageProps["searchParams"]>>, fallbackDate: string) {
  const market = params.market === "日前" ? "日前" : "实时";
  const dates = await getDisclosureDates("电价", market);
  const selectedDate = params.trade_date || params.date || dates.dates[0] || fallbackDate;
  const nodeSearch = params.node_search || "";
  const objectResponse = await getDisclosureObjects("电价", market, "节点电价", selectedDate, nodeSearch || undefined);
  const nodeOptionsRaw = objectResponse.object_names.filter((name) => name && name !== "全省");
  const selectedNode = params.node || nodeOptionsRaw[0] || "";

  const [provinceSeries, nodeSeries, highRanking, lowRanking] = await Promise.all([
    getSeries("电价", market, selectedDate, "全省", "节点电价", 200),
    selectedNode
      ? getSeries("电价", market, selectedDate, selectedNode, "节点电价", 200)
      : Promise.resolve({ title: "节点电价", unit: "元/MWh", market_type: market, effective_date: selectedDate, points: [] }),
    getDisclosureRanking("电价", market, "节点电价", selectedDate, 8, false, undefined, nodeSearch || undefined),
    getDisclosureRanking("电价", market, "节点电价", selectedDate, 8, true, undefined, nodeSearch || undefined),
  ]);

  const spread =
    averageValue(nodeSeries.points) !== null && averageValue(provinceSeries.points) !== null
      ? (averageValue(nodeSeries.points) as number) - (averageValue(provinceSeries.points) as number)
      : null;

  return (
    <section className="section">
      <div className="section-head">
        <div>
          <h2>节点电价分析</h2>
          <p>作为价格侧深挖入口，用于查看全省与节点之间的电价差异。</p>
        </div>
        <div className="pill-row">
          <Link className="pager-chip" href="/clearing">
            出清总览
          </Link>
          <Link className="pager-chip pager-chip-active" href="/clearing?view=price">
            节点电价
          </Link>
        </div>
      </div>

      <article className="panel section-card compact-section">
        <FilterBar
          fields={[
            {
              name: "view",
              label: "视图",
              value: "price",
              options: [{ label: "节点电价", value: "price" }],
            },
            {
              name: "market",
              label: "市场口径",
              value: market,
              options: [
                { label: "实时", value: "实时" },
                { label: "日前", value: "日前" },
              ],
            },
            {
              name: "date",
              label: "业务日期",
              value: selectedDate,
              options: dates.dates.map((item) => ({ label: item, value: item })),
            },
            {
              name: "node_search",
              label: "节点搜索",
              value: nodeSearch,
              type: "text",
              placeholder: "输入节点名称关键字",
            },
            {
              name: "node",
              label: "节点",
              value: selectedNode,
              options: nodeOptionsRaw.map((item) => ({ label: item, value: item })),
            },
          ]}
        />
      </article>

      <StatCards
        items={[
          { title: "全省最新电价", value: formatValue(latestValue(provinceSeries.points), "元/MWh"), detail: `${market} ${selectedDate}` },
          { title: "节点最新电价", value: formatValue(latestValue(nodeSeries.points), "元/MWh"), detail: selectedNode || "暂无节点" },
          {
            title: "节点均价偏差",
            value: formatValue(spread, "元/MWh"),
            detail: spread === null ? "暂无可比数据" : spread >= 0 ? "节点高于全省" : "节点低于全省",
            tone: spread === null ? "flat" : spread >= 0 ? "up" : "down",
          },
        ]}
      />

      <LineChart
        title={selectedNode ? `全省与 ${selectedNode} 节点电价` : "全省节点电价"}
        unit="元/MWh"
        series={[
          { label: "全省", color: "#0f766e", date: selectedDate, points: provinceSeries.points },
          ...(selectedNode ? [{ label: selectedNode, color: "#d97706", date: selectedDate, points: nodeSeries.points }] : []),
        ]}
        showDeviation={Boolean(selectedNode)}
      />

      <div className="two-col">
        <Ranking title="节点高价排行" rows={rankingRows(highRanking)} />
        <Ranking title="节点低价排行" rows={rankingRows(lowRanking)} />
      </div>
    </section>
  );
}

function Ranking({ title, rows }: { title: string; rows: { name: string; value: number | null }[] }) {
  return (
    <article className="panel section-card compact-section">
      <h3>{title}</h3>
      <div className="ranking-list">
        {rows.length ? (
          rows.map((row, index) => (
            <div className="ranking-row" key={`${title}-${row.name}`}>
              <strong>{String(index + 1).padStart(2, "0")}</strong>
              <span>{row.name}</span>
              <em>{row.value === null ? "-" : `${row.value.toFixed(2)} 元/MWh`}</em>
            </div>
          ))
        ) : (
          <div className="muted">暂无排行数据</div>
        )}
      </div>
    </article>
  );
}
