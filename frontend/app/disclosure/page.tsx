import FilterBar from "../../components/FilterBar";
import BoundaryDashboard from "../../components/BoundaryDashboard";
import UnitCommitmentLinkage from "../../components/UnitCommitmentLinkage";
import { getDisclosureDates, getMarketClearingDay, getSeries, getUnitCommitmentLinkage } from "../../lib/api";

type DisclosurePageProps = {
  searchParams?: Promise<{
    primary_market?: string;
    secondary_market?: string;
    primary_date?: string;
    secondary_date?: string;
    primary_date_ranges?: string;
    secondary_date_ranges?: string;
    primary_date_from?: string;
    primary_date_to?: string;
    secondary_date_from?: string;
    secondary_date_to?: string;
    display_mode?: string;
    compare_type?: string;
    trend_market?: string;
    trade_date?: string;
  }>;
};

type DateRange = {
  start: string;
  end: string;
};

type WidgetSpec = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  category: "supply" | "renewable" | "safety" | "interconnection";
  metricName: string;
  primaryMarket?: string;
  secondaryMarket?: string;
  objectName?: string;
  dataTopic?: string;
  variantsConfig?: { id: string; label: string; metricName: string; dataTopic?: string }[];
};

const DEFAULT_PRIMARY_MARKET = "日前";
const DEFAULT_SECONDARY_MARKET = "日前";
const DEFAULT_DISPLAY_MODE = "compare";
const DEFAULT_COMPARE_TYPE = "dayahead-dayahead";
const DEFAULT_TREND_MARKET = "日前";

const DISPLAY_MODE_OPTIONS = [
  { label: "对比展示", value: "compare" },
  { label: "趋势展示", value: "trend" },
];

const COMPARE_TYPE_OPTIONS = [
  { label: "日前信息对比", value: "dayahead-dayahead", primaryMarket: "日前", secondaryMarket: "日前" },
  { label: "实时信息对比", value: "realtime-realtime", primaryMarket: "实时", secondaryMarket: "实时" },
  { label: "日前与实时对比", value: "dayahead-realtime", primaryMarket: "日前", secondaryMarket: "实时" },
  { label: "实时与日前对比", value: "realtime-dayahead", primaryMarket: "实时", secondaryMarket: "日前" },
];

const MARKET_OPTIONS = [
  { label: "日前", value: "日前" },
  { label: "实时", value: "实时" },
  { label: "预测", value: "预测" },
];

const RESERVE_VARIANTS = [
  { id: "positive", label: "正备用", metricName: "正备用" },
  { id: "negative", label: "负备用", metricName: "负备用" },
];

const RENEWABLE_VARIANTS = [
  { id: "d0", label: "D日总出力", metricName: "D日", dataTopic: "现货新能源总出力" },
  { id: "wind", label: "风电预测", metricName: "风电出力预测" },
  { id: "solar", label: "光伏预测", metricName: "光伏出力预测" },
];

const WIDGET_SPECS: WidgetSpec[] = [
  {
    id: "load",
    title: "统调负荷",
    subtitle: "核心边界",
    description: "观察日内负荷峰谷变化和日前偏差，是边界分析最核心的参考量。",
    category: "supply",
    metricName: "统调负荷",
  },
  {
    id: "b_space",
    title: "B类竞价空间",
    subtitle: "竞价口径",
    description: "观察省内B类电源口径变化，辅助判断市场竞价空间。",
    category: "supply",
    metricName: "省内B类电源",
  },
  {
    id: "a_source",
    title: "A类电源出力",
    subtitle: "机组结构",
    description: "观察A类电源在不同时间段的出力水平和日前偏差。",
    category: "supply",
    metricName: "省内A类电源",
  },
  {
    id: "spot_new_energy",
    title: "现货新能源总出力",
    subtitle: "新能源",
    description: "展示D日新能源总出力，并可扩展切换风电、光伏预测。",
    category: "renewable",
    metricName: "D日",
    primaryMarket: "日前",
    secondaryMarket: "日前",
    dataTopic: "现货新能源总出力",
    variantsConfig: RENEWABLE_VARIANTS,
  },
  {
    id: "reserve",
    title: "备用预测信息",
    subtitle: "安全裕度",
    description: "观察正备用变化，判断日内安全裕度。",
    category: "safety",
    metricName: "正备用",
    variantsConfig: RESERVE_VARIANTS,
  },
];

function normalizeMarket(market: string) {
  if (market === "实际") return "实时";
  return market;
}

function uniqueDates(dates: string[]) {
  return Array.from(new Set(dates.filter(Boolean)));
}

function normalizeRange(range: DateRange) {
  return range.start <= range.end ? range : { start: range.end, end: range.start };
}

function parseDateRanges(value?: string) {
  if (!value) return [] as DateRange[];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [start, end] = item.split("~");
      return start && end ? normalizeRange({ start, end }) : null;
    })
    .filter(Boolean) as DateRange[];
}

function serializeDateRanges(ranges: DateRange[]) {
  return ranges.map((range) => `${range.start}~${range.end}`).join(",");
}

function resolveDateOptions(preferredDates: string[], fallbackDates: string[]) {
  const preferred = uniqueDates(preferredDates);
  return preferred.length > 0 ? preferred : uniqueDates(fallbackDates);
}

function mergeDateOptions(...groups: string[][]) {
  return uniqueDates(groups.flat()).sort((a, b) => b.localeCompare(a));
}

function buildDefaultRanges(options: string[]) {
  if (options.length === 0) return [] as DateRange[];
  return [{ start: options[0], end: options[0] }];
}

function previousDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function buildPreviousDayRanges(primaryRanges: DateRange[], options: string[]) {
  const primaryDate = primaryRanges[0]?.start;
  if (!primaryDate) return buildDefaultRanges(options);
  const exactPrevious = previousDate(primaryDate);
  const selected = options.includes(exactPrevious)
    ? exactPrevious
    : options.filter((item) => item < primaryDate).sort().at(-1);
  return selected ? [{ start: selected, end: selected }] : buildDefaultRanges(options);
}

function resolveSelectedRanges(serialized: string | undefined, options: string[], legacyStart?: string, legacyEnd?: string) {
  const availableDates = new Set(options);
  const isAvailableRange = (range: DateRange) => availableDates.has(range.start) && availableDates.has(range.end);
  const fromSerialized = parseDateRanges(serialized).filter(isAvailableRange);
  if (fromSerialized.length > 0) return fromSerialized;
  if (legacyStart && legacyEnd && availableDates.has(legacyStart) && availableDates.has(legacyEnd)) {
    return [normalizeRange({ start: legacyStart, end: legacyEnd })];
  }
  if (legacyStart && availableDates.has(legacyStart)) return [{ start: legacyStart, end: legacyStart }];
  if (legacyEnd && availableDates.has(legacyEnd)) return [{ start: legacyEnd, end: legacyEnd }];
  return buildDefaultRanges(options);
}

async function loadSeries(
  metricName: string,
  marketType?: string,
  objectName?: string,
  dataTopic?: string,
  ranges: DateRange[] = []
) {
  const requests = ranges.length > 0 ? ranges : [{ start: "", end: "" }];
  const direct = await Promise.all(
    requests.map((range) =>
      getSeries(
        metricName,
        marketType,
        undefined,
        objectName,
        dataTopic,
        2000,
        range.start || undefined,
        range.end || undefined
      )
    )
  );
  const points = direct.flatMap((item) => item.points);
  if (points.length > 0) {
    return {
      title: direct.find((item) => item.title)?.title || metricName,
      unit: direct.find((item) => item.unit)?.unit || null,
      market_type: direct.find((item) => item.market_type)?.market_type || marketType || null,
      effective_date: direct.map((item) => item.effective_date).filter(Boolean).join(" / "),
      points,
    };
  }
  return {
    title: metricName,
    unit: null,
    market_type: marketType || null,
    effective_date: "",
    points: [],
  };
}

export default async function DisclosurePage({ searchParams }: DisclosurePageProps) {
  const params = (await searchParams) || {};
  const displayMode = params.display_mode === "trend" ? "trend" : DEFAULT_DISPLAY_MODE;
  const comparePreset =
    COMPARE_TYPE_OPTIONS.find((item) => item.value === params.compare_type) ||
    COMPARE_TYPE_OPTIONS.find((item) => item.value === DEFAULT_COMPARE_TYPE)!;
  const trendMarket = normalizeMarket(params.trend_market || DEFAULT_TREND_MARKET);
  const primaryMarket = displayMode === "trend" ? trendMarket : comparePreset.primaryMarket || DEFAULT_PRIMARY_MARKET;
  const secondaryMarket = displayMode === "trend" ? "" : comparePreset.secondaryMarket || DEFAULT_SECONDARY_MARKET;

  const [allDates, primaryDates, primaryFundamentalDates, secondaryDates, marketClearingDay] = await Promise.all([
    getDisclosureDates(),
    getDisclosureDates(undefined, primaryMarket),
    primaryMarket === "日前" ? getDisclosureDates("统调负荷", primaryMarket) : Promise.resolve({ dates: [] }),
    displayMode === "compare" ? getDisclosureDates(undefined, secondaryMarket) : Promise.resolve({ dates: [] }),
    getMarketClearingDay(),
  ]);

  const clearingDateOptions = marketClearingDay.available_dates || [];
  const primaryDateOptions = mergeDateOptions(
    resolveDateOptions(primaryDates.dates, allDates.dates),
    primaryMarket === "日前" ? mergeDateOptions(primaryFundamentalDates.dates, clearingDateOptions) : []
  );
  const secondaryDateOptions = mergeDateOptions(
    resolveDateOptions(secondaryDates.dates, allDates.dates),
    secondaryMarket === "日前" ? clearingDateOptions : []
  );
  const globalTradeDate = params.trade_date || "";
  const defaultPrimaryDateOptions =
    primaryMarket === "日前" && primaryFundamentalDates.dates.length
      ? mergeDateOptions(primaryFundamentalDates.dates)
      : primaryDateOptions;
  const primaryRanges = resolveSelectedRanges(
    globalTradeDate ? undefined : params.primary_date_ranges,
    globalTradeDate ? primaryDateOptions : defaultPrimaryDateOptions,
    globalTradeDate || params.primary_date_from || params.primary_date,
    globalTradeDate || params.primary_date_to || params.primary_date
  );
  const hasExplicitSecondaryDate = Boolean(
    params.secondary_date_ranges ||
      params.secondary_date_from ||
      params.secondary_date_to ||
      params.secondary_date
  );
  const secondaryRanges = hasExplicitSecondaryDate
    ? resolveSelectedRanges(
        params.secondary_date_ranges,
        secondaryDateOptions,
        params.secondary_date_from || params.secondary_date,
        params.secondary_date_to || params.secondary_date
      )
    : buildPreviousDayRanges(primaryRanges, secondaryDateOptions);

  const widgets = await Promise.all(
    WIDGET_SPECS.map(async (spec) => {
      const primary = await loadSeries(
        spec.metricName,
        spec.primaryMarket || primaryMarket,
        spec.objectName,
        spec.dataTopic,
        primaryRanges
      );
      const secondary =
        displayMode === "compare"
          ? await loadSeries(
              spec.metricName,
              spec.secondaryMarket || secondaryMarket,
              spec.objectName,
              spec.dataTopic,
              secondaryRanges
            )
          : { title: spec.metricName, unit: null, market_type: null, effective_date: "", points: [] };
      const baseWidget = {
        id: spec.id,
        title: spec.title,
        subtitle: spec.subtitle,
        description: spec.description,
        category: spec.category,
        unit: primary.unit || secondary.unit,
        effectiveDate: primary.effective_date || secondary.effective_date,
        primaryDate: primary.effective_date,
        secondaryDate: secondary.effective_date,
        primaryLabel: displayMode === "trend" ? `${spec.primaryMarket || primary.market_type || primaryMarket}趋势` : spec.primaryMarket || primary.market_type || primaryMarket,
        secondaryLabel: spec.secondaryMarket || secondary.market_type || secondaryMarket,
        primarySeries: primary.points,
        secondarySeries: secondary.points,
      };
      if (!spec.variantsConfig?.length) return baseWidget;
      const variants = await Promise.all(
        spec.variantsConfig.map(async (variant) => {
          const variantPrimary = await loadSeries(variant.metricName, primaryMarket, undefined, variant.dataTopic, primaryRanges);
          const variantSecondary =
            displayMode === "compare"
              ? await loadSeries(variant.metricName, secondaryMarket, undefined, variant.dataTopic, secondaryRanges)
              : { unit: null, effective_date: "", points: [] };
          return {
            id: variant.id,
            label: variant.label,
            unit: variantPrimary.unit || variantSecondary.unit,
            effectiveDate: variantPrimary.effective_date || variantSecondary.effective_date,
            primaryDate: variantPrimary.effective_date,
            secondaryDate: variantSecondary.effective_date,
            primarySeries: variantPrimary.points,
            secondarySeries: variantSecondary.points,
          };
        })
      );
      return { ...baseWidget, variants };
    })
  );
  const unitCommitment = await getUnitCommitmentLinkage(primaryRanges[0]?.start);

  return (
    <section className="section">
      <div className="section-head">
        <div>
          <h2>基本面数据</h2>
          <p>优先查看负荷、电源出力、新能源、备用和联络线等现货基本面。</p>
        </div>
      </div>

      <article className="panel section-card">
        <FilterBar
          fields={[
            { name: "display_mode", label: "展示方式", value: displayMode, options: DISPLAY_MODE_OPTIONS },
            {
              name: "compare_type",
              label: "对比项",
              value: comparePreset.value,
              options: COMPARE_TYPE_OPTIONS.map(({ label, value }) => ({ label, value })),
              disabled: displayMode === "trend",
            },
            {
              name: "trend_market",
              label: "趋势口径",
              value: trendMarket,
              options: MARKET_OPTIONS,
              disabled: displayMode === "compare",
            },
            {
              name: "primary_date_ranges",
              label: displayMode === "trend" ? "趋势日期" : "运行日",
              value: serializeDateRanges(primaryRanges),
              dates: primaryDateOptions,
              type: "dateranges",
              clearOnOpen: true,
            },
            {
              name: "secondary_date_ranges",
              label: "对比日",
              value: serializeDateRanges(secondaryRanges),
              dates: secondaryDateOptions,
              type: "dateranges",
              disabled: displayMode === "trend",
              clearOnOpen: true,
              autoPreviousFrom: "primary_date_ranges",
            },
          ]}
        />
        <div className="pill-row">
          <span className="pill">{displayMode === "compare" ? comparePreset.label : `${trendMarket}趋势展示`}</span>
          {primaryDateOptions.length === 0 ? <span className="pill">当前没有可用日期</span> : null}
        </div>
      </article>

      {primaryMarket === "日前" && unitCommitment.rows.length ? <UnitCommitmentLinkage data={unitCommitment} /> : null}
      <BoundaryDashboard widgets={widgets} anomalyThreshold={0} anomalyEnabled={false} displayMode={displayMode} />
    </section>
  );
}
