"use client";

import { useEffect, useMemo, useState } from "react";

import LineChart from "./LineChart";

type Point = { point_time: string; value: number | null };

type WidgetVariant = {
  id: string;
  label: string;
  unit: string | null;
  effectiveDate: string;
  primaryDate?: string;
  secondaryDate?: string;
  primarySeries: Point[];
  secondarySeries: Point[];
};

type WidgetData = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  category: "supply" | "renewable" | "safety" | "interconnection";
  unit: string | null;
  effectiveDate: string;
  primaryDate?: string;
  secondaryDate?: string;
  primaryLabel: string;
  secondaryLabel: string;
  primarySeries: Point[];
  secondarySeries: Point[];
  variants?: WidgetVariant[];
};

type BoundaryDashboardProps = {
  widgets: WidgetData[];
  anomalyThreshold: number;
  anomalyEnabled: boolean;
  displayMode?: "compare" | "trend";
};

const STORAGE_KEY = "boundary-dashboard-order";
const FOCUS_STORAGE_KEY = "boundary-dashboard-focus";
const DEFAULT_FOCUS_IDS = ["price", "load", "a_source", "local_source", "b_space"];
const CATEGORY_OPTIONS = [
  { id: "all", label: "全景总览" },
  { id: "supply", label: "供需结构" },
  { id: "renewable", label: "新能源" },
  { id: "safety", label: "安全裕度" },
  { id: "interconnection", label: "跨区通道" },
] as const;

function formatNumber(value: number | null, digits = 0) {
  if (value === null) {
    return "-";
  }
  return value.toFixed(digits);
}

function normalizeTimeLabel(label: string) {
  const match = label.match(/(\d{2}:\d{2})$/);
  return match ? match[1] : label;
}

function timeSortValue(label: string) {
  const normalized = normalizeTimeLabel(label);
  const [hour, minute] = normalized.split(":").map(Number);
  if (Number.isFinite(hour) && Number.isFinite(minute)) {
    return hour * 60 + minute;
  }
  return Number.MAX_SAFE_INTEGER;
}

function hasDuplicateNormalizedTime(points: Point[]) {
  const seen = new Set<string>();
  for (const point of points) {
    const key = normalizeTimeLabel(point.point_time);
    if (seen.has(key)) {
      return true;
    }
    seen.add(key);
  }
  return false;
}

function lastValue(points: Point[]) {
  const valid = points.filter((point) => point.value !== null);
  return valid.length ? valid[valid.length - 1].value : null;
}

function averageValue(points: Point[]) {
  const valid = points.map((point) => point.value).filter((value): value is number => value !== null);
  if (!valid.length) {
    return null;
  }
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function peakValue(points: Point[]) {
  const valid = points.map((point) => point.value).filter((value): value is number => value !== null);
  if (!valid.length) {
    return null;
  }
  return Math.max(...valid);
}

function diffTone(primary: number | null, secondary: number | null) {
  if (primary === null || secondary === null) {
    return "flat";
  }
  if (primary > secondary) {
    return "up";
  }
  if (primary < secondary) {
    return "down";
  }
  return "flat";
}

function deviationValue(primary: number | null, secondary: number | null) {
  if (primary === null || secondary === null) {
    return null;
  }
  return primary - secondary;
}

function pointValueAtTime(points: Point[], time: string) {
  const point = points.find((item) => normalizeTimeLabel(item.point_time) === time);
  return point?.value ?? null;
}

function percentValue(numerator: number | null, denominator: number | null) {
  if (numerator === null || denominator === null || denominator === 0) {
    return null;
  }
  return (numerator / denominator) * 100;
}

function safeStorage(action: () => void) {
  try {
    action();
  } catch {
    // Embedded and privacy-restricted browsers may disable local storage.
  }
}

function deviationMarkers(primary: Point[], secondary: Point[], threshold: number) {
  return primary
    .map((point, index) => {
      const compare = secondary[index]?.value ?? null;
      if (point.value === null || compare === null) {
        return null;
      }
      return {
        point_time: point.point_time,
        value: point.value,
        diff: Math.abs(point.value - compare),
      };
    })
    .filter(Boolean)
    .filter((item) => (item?.diff ?? 0) >= threshold)
    .sort((a, b) => (b?.diff ?? 0) - (a?.diff ?? 0))
    .slice(0, 3)
    .map((item, index) => ({
      point_time: item!.point_time,
      value: item!.value,
      label: `异常${index + 1}`,
      color: "#dc2626",
    }));
}

function moveItem(ids: string[], fromId: string, toId: string) {
  const next = [...ids];
  const fromIndex = next.indexOf(fromId);
  const toIndex = next.indexOf(toId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return next;
  }
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function VariantComposition({
  variants,
}: {
  variants: WidgetVariant[];
}) {
  const values = variants
    .map((variant) => ({
      label: variant.label,
      value: averageValue(variant.primarySeries),
    }))
    .filter((item) => item.value !== null) as Array<{ label: string; value: number }>;

  const total = values.reduce((sum, item) => sum + item.value, 0);
  if (!values.length || total <= 0) {
    return null;
  }

  return (
    <div className="composition-card">
      <div className="composition-head">
        <h3>地方电源分类型占比</h3>
        <p className="muted">按当前主参考口径的平均出力估算占比</p>
      </div>
      <div className="composition-list">
        {values.map((item, index) => {
          const percent = (item.value / total) * 100;
          return (
            <div key={`${item.label}-${index}`} className="composition-row">
              <div className="composition-label">
                <span>{item.label}</span>
                <strong>{percent.toFixed(1)}%</strong>
              </div>
              <div className="composition-bar">
                <div className="composition-bar-fill" style={{ width: `${percent}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MiniTrend({
  primary,
  secondary,
  primaryLabel,
  secondaryLabel,
  primaryVisible,
  secondaryVisible,
  deviationVisible,
  comparisonVisible,
  linkedTime,
  tooltipVisible,
  onLinkedTimeChange,
}: {
  primary: Point[];
  secondary: Point[];
  primaryLabel: string;
  secondaryLabel: string;
  primaryVisible: boolean;
  secondaryVisible: boolean;
  deviationVisible: boolean;
  comparisonVisible: boolean;
  linkedTime: string;
  tooltipVisible: boolean;
  onLinkedTimeChange: (time: string) => void;
}) {
  const alignByTime =
    comparisonVisible &&
    !hasDuplicateNormalizedTime(primary) &&
    !hasDuplicateNormalizedTime(secondary);
  const labels = alignByTime
    ? Array.from(
        new Set([...primary, ...secondary].map((point) => normalizeTimeLabel(point.point_time)))
      ).sort((a, b) => timeSortValue(a) - timeSortValue(b) || a.localeCompare(b))
    : primary.map((point) => point.point_time);
  const primaryMap = new Map(primary.map((point) => [alignByTime ? normalizeTimeLabel(point.point_time) : point.point_time, point.value]));
  const secondaryMap = new Map(secondary.map((point) => [alignByTime ? normalizeTimeLabel(point.point_time) : point.point_time, point.value]));
  const alignedPrimary = labels.map((label) => ({ point_time: label, value: primaryMap.get(label) ?? null }));
  const alignedSecondary = labels.map((label) => ({ point_time: label, value: secondaryMap.get(label) ?? null }));

  const validValues = [...alignedPrimary, ...(comparisonVisible ? alignedSecondary : [])]
    .map((point) => point.value)
    .filter((value): value is number => value !== null);

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (!validValues.length || !alignedPrimary.length) {
    return <div className="mini-trend-empty">暂无数据</div>;
  }

  const min = Math.min(...validValues);
  const max = Math.max(...validValues);
  const range = max - min || 1;
  const width = 320;
  const height = 150;
  const left = 52;
  const right = 18;
  const top = 8;
  const bottom = 24;
  const gap = comparisonVisible ? 10 : 0;
  const lineHeight = comparisonVisible ? 62 : 104;
  const barHeight = comparisonVisible ? 42 : 0;
  const lineTop = top;
  const lineBottom = lineTop + lineHeight;
  const barTop = lineBottom + gap;
  const barBottom = barTop + barHeight;
  const innerWidth = width - left - right;
  const lineInnerHeight = lineHeight - 8;
  const zeroY = barTop + barHeight / 2;

  const xForIndex = (index: number) => left + (innerWidth * index) / Math.max(alignedPrimary.length - 1, 1);
  const yForValue = (value: number) => lineTop + lineInnerHeight - ((value - min) / range) * lineInnerHeight;

  const buildPath = (points: Point[]) => {
    let isOpen = false;
    return points
      .map((point, index) => {
        if (point.value === null) {
          isOpen = false;
          return "";
        }
        const x = xForIndex(index);
        const y = yForValue(point.value);
        const command = isOpen ? "L" : "M";
        isOpen = true;
        return `${command} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .filter(Boolean)
      .join(" ");
  };

  const deviations = alignedPrimary.map((point, index) => {
    const secondaryValue = alignedSecondary[index]?.value ?? null;
    if (point.value === null || secondaryValue === null) {
      return null;
    }
    return point.value - secondaryValue;
  });

  const validDeviationValues = deviations.filter((value): value is number => value !== null);
  const deviationAbsMax = validDeviationValues.length
    ? Math.max(...validDeviationValues.map((value) => Math.abs(value)))
    : 1;

  const xTickTargets = ["00:00", "06:00", "12:00", "18:00", "23:45"];
  const xTicks = xTickTargets
    .map((time) => {
      const index = alignedPrimary.findIndex((point) => point.point_time === time);
      if (index < 0) {
        return null;
      }
      return { time, x: xForIndex(index) };
    })
    .filter(Boolean) as Array<{ time: string; x: number }>;

  const linkedIndex = alignedPrimary.findIndex((point) => normalizeTimeLabel(point.point_time) === linkedTime);
  const activeIndex = hoverIndex ?? (linkedIndex >= 0 ? linkedIndex : null);
  const activePrimary = activeIndex !== null ? alignedPrimary[activeIndex]?.value ?? null : null;
  const activeSecondary = activeIndex !== null ? alignedSecondary[activeIndex]?.value ?? null : null;
  const activeDeviation =
    comparisonVisible && activePrimary !== null && activeSecondary !== null ? activePrimary - activeSecondary : null;
  const hoverX = activeIndex !== null ? xForIndex(activeIndex) : null;

  return (
    <div className="mini-trend-wrap">
      <div className="mini-trend-unit">MW</div>
      <svg viewBox={`0 0 ${width} ${height}`} className="mini-trend">
        <line x1={left} y1={lineBottom} x2={width - right} y2={lineBottom} stroke="rgba(31,37,44,0.16)" />
        <line x1={left} y1={lineTop} x2={left} y2={lineBottom} stroke="rgba(31,37,44,0.16)" />
        <line x1={left} y1={lineTop} x2={width - right} y2={lineTop} stroke="rgba(31,37,44,0.06)" />
        <line x1={left} y1={lineTop + lineInnerHeight / 2} x2={width - right} y2={lineTop + lineInnerHeight / 2} stroke="rgba(31,37,44,0.06)" />
        <line x1={left} y1={lineBottom} x2={width - right} y2={lineBottom} stroke="rgba(31,37,44,0.06)" />
        <text x={left - 6} y={lineTop + 4} textAnchor="end" className="mini-axis-text">
          {formatNumber(max, 0)}
        </text>
        <text x={left - 6} y={lineTop + lineInnerHeight / 2 + 4} textAnchor="end" className="mini-axis-text">
          {formatNumber((max + min) / 2, 0)}
        </text>
        <text x={left - 6} y={lineBottom + 4} textAnchor="end" className="mini-axis-text">
          {formatNumber(min, 0)}
        </text>

        {primaryVisible ? (
          <path d={buildPath(alignedPrimary)} fill="none" stroke="#0f766e" strokeWidth="2.5" strokeLinecap="round" />
        ) : null}
        {comparisonVisible && secondaryVisible ? (
          <path d={buildPath(alignedSecondary)} fill="none" stroke="#d97706" strokeWidth="2.2" strokeDasharray="4 4" strokeLinecap="round" />
        ) : null}

        {comparisonVisible ? <line x1={left} y1={zeroY} x2={width - right} y2={zeroY} stroke="rgba(31,37,44,0.12)" /> : null}
        {comparisonVisible && deviationVisible
          ? deviations.map((value, index) => {
              if (value === null) {
                return null;
              }
              const x = xForIndex(index);
              const barWidth = Math.max(innerWidth / Math.max(primary.length, 1) - 1, 2);
              const scaled = (Math.abs(value) / deviationAbsMax) * (barHeight / 2 - 4);
              const y = value >= 0 ? zeroY - scaled : zeroY;
              return (
                <rect
                  key={`${alignedPrimary[index]?.point_time || index}`}
                  x={x - barWidth / 2}
                  y={y}
                  width={barWidth}
                  height={scaled}
                  rx="1"
                  fill={value >= 0 ? "#ef4444" : "#22c55e"}
                  opacity="0.85"
                />
              );
            })
          : null}

        {comparisonVisible ? (
          <>
            <text x={left - 6} y={barTop + 4} textAnchor="end" className="mini-axis-text">
              {formatNumber(deviationAbsMax, 0)}
            </text>
            <text x={left - 6} y={zeroY + 4} textAnchor="end" className="mini-axis-text">
              0
            </text>
            <text x={left - 6} y={barBottom + 4} textAnchor="end" className="mini-axis-text">
              {formatNumber(-deviationAbsMax, 0)}
            </text>
          </>
        ) : null}

        {xTicks.map((tick) => (
          <text key={tick.time} x={tick.x} y={height - 6} textAnchor="middle" className="mini-axis-text">
            {tick.time}
          </text>
        ))}

        {hoverX !== null && tooltipVisible ? (
          <>
            <line x1={hoverX} y1={lineTop} x2={hoverX} y2={barBottom} stroke="rgba(31,37,44,0.18)" strokeDasharray="3 3" />
            {primaryVisible && activePrimary !== null ? (
              <circle cx={hoverX} cy={yForValue(activePrimary)} r="3.5" fill="#0f766e" />
            ) : null}
            {comparisonVisible && secondaryVisible && activeSecondary !== null ? (
              <circle cx={hoverX} cy={yForValue(activeSecondary)} r="3.5" fill="#d97706" />
            ) : null}
            <g transform={`translate(${Math.min(Math.max(hoverX - 54, left + 4), width - right - 112)}, ${lineTop + 6})`}>
              <rect width="112" height={comparisonVisible ? "48" : "34"} rx="10" fill="rgba(255,255,255,0.72)" stroke="rgba(31,37,44,0.1)" />
              <text x="8" y="14" className="mini-tooltip-text">
                {alignedPrimary[activeIndex!]?.point_time || ""}
              </text>
              <text x="8" y="28" className="mini-tooltip-text">
                {primaryLabel} {formatNumber(activePrimary, 0)}
              </text>
              {comparisonVisible ? (
                <text x="8" y="41" className="mini-tooltip-text">
                  {secondaryLabel} {formatNumber(activeSecondary, 0)} 偏差 {formatNumber(activeDeviation, 0)}
                </text>
              ) : null}
            </g>
          </>
        ) : null}

        <rect
          x={left}
          y={lineTop}
          width={innerWidth}
          height={barBottom - lineTop}
          fill="transparent"
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const relativeX = event.clientX - rect.left;
            const ratio = Math.min(Math.max(relativeX / rect.width, 0), 1);
            const nextIndex = Math.round(ratio * Math.max(primary.length - 1, 0));
            setHoverIndex(nextIndex);
            const nextTime = alignedPrimary[nextIndex]?.point_time;
            if (nextTime) {
              onLinkedTimeChange(normalizeTimeLabel(nextTime));
            }
          }}
          onMouseLeave={() => setHoverIndex(null)}
        />
      </svg>
    </div>
  );
}

export default function BoundaryDashboard({ widgets, anomalyThreshold, anomalyEnabled, displayMode = "compare" }: BoundaryDashboardProps) {
  const comparisonVisible = displayMode === "compare";
  const initialOrder = widgets.map((item) => item.id);
  const [order, setOrder] = useState(initialOrder);
  const [activeId, setActiveId] = useState(initialOrder[0] || "");
  const [draggingId, setDraggingId] = useState("");
  const [focusIds, setFocusIds] = useState(DEFAULT_FOCUS_IDS.filter((id) => initialOrder.includes(id)).slice(0, 6));
  const [visibility, setVisibility] = useState<Record<string, { primary: boolean; secondary: boolean; deviation: boolean }>>({});
  const [variantSelection, setVariantSelection] = useState<Record<string, string>>({});
  const [activeCategory, setActiveCategory] = useState<(typeof CATEGORY_OPTIONS)[number]["id"]>("all");
  const [linkedTime, setLinkedTime] = useState("12:00");
  const [overviewTooltipVisible, setOverviewTooltipVisible] = useState(true);

  useEffect(() => {
    let saved: string | null = null;
    safeStorage(() => {
      saved = window.localStorage.getItem(STORAGE_KEY);
    });
    if (!saved) {
      return;
    }
    try {
      const parsed = JSON.parse(saved) as string[];
      const filtered = parsed.filter((id) => initialOrder.includes(id));
      const missing = initialOrder.filter((id) => !filtered.includes(id));
      const next = [...filtered, ...missing];
      setOrder(next);
      if (next[0]) {
        setActiveId(next[0]);
      }
    } catch {
      safeStorage(() => window.localStorage.removeItem(STORAGE_KEY));
    }
  }, [widgets.length]);

  useEffect(() => {
    let saved: string | null = null;
    safeStorage(() => {
      saved = window.localStorage.getItem(FOCUS_STORAGE_KEY);
    });
    if (!saved) {
      return;
    }
    try {
      const parsed = JSON.parse(saved) as string[];
      const filtered = parsed.filter((id) => initialOrder.includes(id)).slice(0, 6);
      if (filtered.length) {
        setFocusIds(filtered);
      }
    } catch {
      safeStorage(() => window.localStorage.removeItem(FOCUS_STORAGE_KEY));
    }
  }, [widgets.length]);

  const orderedWidgets = order
    .map((id) => widgets.find((item) => item.id === id))
    .filter(Boolean) as WidgetData[];
  const visibleWidgets =
    activeCategory === "all"
      ? orderedWidgets
      : orderedWidgets.filter((widget) => widget.category === activeCategory);

  const activeWidget =
    visibleWidgets.find((item) => item.id === activeId) ||
    visibleWidgets[0] ||
    orderedWidgets.find((item) => item.id === activeId) ||
    orderedWidgets[0] ||
    widgets[0];
  const activeVariantId = variantSelection[activeWidget?.id || ""] || activeWidget?.variants?.[0]?.id || "";
  const activeVariant = activeWidget?.variants?.find((item) => item.id === activeVariantId);

  const activeWidgetView = useMemo(() => {
    if (!activeWidget) {
      return undefined;
    }
    if (!activeVariant) {
      return activeWidget;
    }
    return {
      ...activeWidget,
      unit: activeVariant.unit,
      effectiveDate: activeVariant.effectiveDate,
      primaryDate: activeVariant.primaryDate,
      secondaryDate: activeVariant.secondaryDate,
      primarySeries: activeVariant.primarySeries,
      secondarySeries: activeVariant.secondarySeries,
    };
  }, [activeWidget, activeVariant]);

  const activePrimary = pointValueAtTime(activeWidgetView?.primarySeries || [], linkedTime);
  const activeSecondary = pointValueAtTime(activeWidgetView?.secondarySeries || [], linkedTime);
  const activeAverage = averageValue(activeWidgetView?.primarySeries || []);
  const activePeak = peakValue(activeWidgetView?.primarySeries || []);
  const activeTone = diffTone(activePrimary, activeSecondary);
  const activeDelta = deviationValue(activePrimary, activeSecondary);

  const highlights = [
    { label: "谷段", start: "00:00", end: "07:00", color: "#60a5fa" },
    { label: "峰段", start: "10:00", end: "15:00", color: "#f59e0b" },
    { label: "峰段", start: "18:00", end: "21:00", color: "#ef4444" },
  ];

  const toggleVisibility = (widgetId: string, key: "primary" | "secondary" | "deviation") => {
    setVisibility((current) => {
      const entry = current[widgetId] || { primary: true, secondary: true, deviation: true };
      return {
        ...current,
        [widgetId]: {
          ...entry,
          [key]: !entry[key],
        },
      };
    });
  };

  const selectedFocusWidgets = visibleWidgets.filter((widget) => focusIds.includes(widget.id)).slice(0, 6);
  const focusWidgets = selectedFocusWidgets.length ? selectedFocusWidgets : visibleWidgets.slice(0, 6);

  const toggleFocusWidget = (widgetId: string) => {
    setFocusIds((current) => {
      const exists = current.includes(widgetId);
      let next = current;
      if (exists) {
        next = current.filter((id) => id !== widgetId);
      } else if (current.length < 6) {
        next = [...current, widgetId];
      }
      safeStorage(() => window.localStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(next)));
      return next;
    });
  };

  const loadWidget = orderedWidgets.find((widget) => widget.id === "load");
  const renewableWidget = orderedWidgets.find((widget) => widget.id === "spot_new_energy");
  const reserveWidget = orderedWidgets.find((widget) => widget.id === "reserve");
  const bSpaceWidget = orderedWidgets.find((widget) => widget.id === "b_space");
  const linkedLoad = pointValueAtTime(loadWidget?.primarySeries || [], linkedTime);
  const renewableVariant = renewableWidget?.variants?.find(
    (variant) => variant.id === (variantSelection.spot_new_energy || "d0")
  );
  const linkedRenewable = pointValueAtTime(
    renewableVariant?.primarySeries || renewableWidget?.primarySeries || [],
    linkedTime
  );
  const reserveVariant = reserveWidget?.variants?.find(
    (variant) => variant.id === (variantSelection.reserve || "positive")
  );
  const linkedReserve = pointValueAtTime(
    reserveVariant?.primarySeries || reserveWidget?.primarySeries || [],
    linkedTime
  );
  const linkedBSpace = pointValueAtTime(bSpaceWidget?.primarySeries || [], linkedTime);
  const linkedNetLoad =
    linkedLoad !== null && linkedRenewable !== null ? linkedLoad - linkedRenewable : null;
  const linkedTimes = Array.from(
    new Set((loadWidget?.primarySeries || []).map((point) => normalizeTimeLabel(point.point_time)))
  );
  const linkedTimeIndex = Math.max(linkedTimes.indexOf(linkedTime), 0);

  return (
    <div className="boundary-dashboard">
      <section className="fundamental-linkage" aria-label="基本面联动分析">
        <div className="fundamental-linkage-head">
          <div>
            <span>多指标联动</span>
            <h2>{linkedTime} 基本面快照</h2>
          </div>
          <div className="fundamental-category-tabs" role="tablist" aria-label="基本面专题">
            {CATEGORY_OPTIONS.map((category) => (
              <button
                key={category.id}
                type="button"
                role="tab"
                aria-selected={activeCategory === category.id}
                className={activeCategory === category.id ? "fundamental-category-active" : ""}
                onClick={() => {
                  setActiveCategory(category.id);
                  const nextWidget =
                    category.id === "all"
                      ? orderedWidgets[0]
                      : orderedWidgets.find((widget) => widget.category === category.id);
                  if (nextWidget) {
                    setActiveId(nextWidget.id);
                  }
                }}
              >
                {category.label}
              </button>
            ))}
          </div>
        </div>

        <div className="linked-time-control">
          <span>00:00</span>
          <input
            type="range"
            min="0"
            max={Math.max(linkedTimes.length - 1, 0)}
            value={linkedTimeIndex}
            onChange={(event) => {
              const nextTime = linkedTimes[Number(event.target.value)];
              if (nextTime) {
                setLinkedTime(nextTime);
              }
            }}
            aria-label="联动时间"
          />
          <strong>{linkedTime}</strong>
          <span>23:45</span>
        </div>

        <div className="linked-metric-grid">
          <article>
            <span>净负荷</span>
            <strong>{formatNumber(linkedNetLoad, 0)} <small>MW</small></strong>
            <p>统调负荷扣除新能源预测</p>
          </article>
          <article>
            <span>新能源占比</span>
            <strong>{formatNumber(percentValue(linkedRenewable, linkedLoad), 1)} <small>%</small></strong>
            <p>新能源预测 / 统调负荷</p>
          </article>
          <article>
            <span>正备用率</span>
            <strong>{formatNumber(percentValue(linkedReserve, linkedLoad), 1)} <small>%</small></strong>
            <p>正备用 / 统调负荷</p>
          </article>
          <article>
            <span>B类竞价空间</span>
            <strong>{formatNumber(linkedBSpace, 0)} <small>MW</small></strong>
            <p>同步时点的省内B类电源口径</p>
          </article>
        </div>
      </section>

      <section className="panel focus-hero">
        <div className="focus-copy">
          <h1>{comparisonVisible ? "核心边界对比" : "边界趋势观察"}</h1>
          <div className="focus-picker">
            {visibleWidgets.map((widget) => {
              const selected = focusIds.includes(widget.id);
              const disabled = !selected && focusIds.length >= 6;
              return (
                <button
                  key={widget.id}
                  type="button"
                  className={`focus-picker-chip ${selected ? "focus-picker-chip-active" : ""}`}
                  disabled={disabled}
                  onClick={() => toggleFocusWidget(widget.id)}
                >
                  {widget.title}
                </button>
              );
            })}
          </div>
          <div className="pill-row">
            <span className="pill">当前专题 {visibleWidgets.length} 项</span>
            <span className="pill">联动时点 {linkedTime}</span>
            <span className="pill">{comparisonVisible ? `异常阈值 ${anomalyEnabled ? anomalyThreshold : "关闭"}` : "单口径趋势"}</span>
          </div>
          <div className="focus-active-note">
            <strong>当前主图：</strong>
            <span>{activeWidget?.title || "-"}</span>
          </div>
        </div>

        <div className="focus-overview-grid">
          {focusWidgets.map((widget) => {
            const selectedVariantId = variantSelection[widget.id] || widget.variants?.[0]?.id || "";
            const selectedVariant = widget.variants?.find((item) => item.id === selectedVariantId);
            const view = selectedVariant
              ? {
                  ...widget,
                  unit: selectedVariant.unit,
                  effectiveDate: selectedVariant.effectiveDate,
                  primarySeries: selectedVariant.primarySeries,
                  secondarySeries: selectedVariant.secondarySeries,
                }
              : widget;
            const primary = pointValueAtTime(view.primarySeries, linkedTime);
            const secondary = pointValueAtTime(view.secondarySeries, linkedTime);
            const average = averageValue(view.primarySeries);
            const peak = peakValue(view.primarySeries);
            const delta = deviationValue(primary, secondary);
            const tone = diffTone(primary, secondary);

            return (
              <button
                key={widget.id}
                type="button"
                className={`focus-overview-card ${widget.id === activeWidget?.id ? "focus-overview-card-active" : ""}`}
                onClick={() => setActiveId(widget.id)}
              >
                <div className="focus-overview-head">
                  <h3>{widget.title}</h3>
                  <span>{view.unit || "-"}</span>
                </div>
                <div className="focus-overview-values">
                  <div>
                    <span>{linkedTime}</span>
                    <strong className={`trend-${tone}`}>{formatNumber(primary, 0)}</strong>
                    <small>{view.primaryLabel}</small>
                  </div>
                  {comparisonVisible ? (
                    <>
                      <div>
                        <span>对比</span>
                        <strong>{formatNumber(secondary, 0)}</strong>
                        <small>{view.secondaryLabel}</small>
                      </div>
                      <div>
                        <span>偏差</span>
                        <strong className={`trend-${tone}`}>{formatNumber(delta, 0)}</strong>
                        <small>{view.effectiveDate || "-"}</small>
                      </div>
                    </>
                  ) : null}
                  <div>
                    <span>均值 / 峰值</span>
                    <strong>{formatNumber(average, 0)}</strong>
                    <small>{formatNumber(peak, 0)}</small>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="panel section-card focus-chart-panel">
        <div className="focus-chart-headline">
          <div>
            <h3>{activeWidget?.title} 焦点分析</h3>
            <p className="muted">{activeWidget?.description}</p>
          </div>
          <div className="focus-chart-summary">
            <span className="pill">业务日期 {activeWidgetView?.effectiveDate || "-"}</span>
            {comparisonVisible ? (
              <span className={`pill ${activeTone === "up" ? "trend-up" : activeTone === "down" ? "trend-down" : "trend-flat"}`}>
                偏差 {formatNumber(activeDelta, 0)}
              </span>
            ) : (
              <span className="pill">趋势展示</span>
            )}
          </div>
        </div>
        {activeWidget?.variants?.length ? (
          <div className="variant-switch">
            <span>展示项</span>
            <select
              value={activeVariantId}
              onChange={(event) =>
                setVariantSelection((current) => ({
                  ...current,
                  [activeWidget.id]: event.target.value,
                }))
              }
            >
              {activeWidget.variants.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <LineChart
          title={`${activeWidget?.title} 日内趋势`}
          unit={activeWidgetView?.unit}
          highlights={highlights}
          markers={[
            ...(activePrimary !== null
              ? [{ point_time: linkedTime, value: activePrimary, label: linkedTime, color: "#185c9d" }]
              : []),
            ...(comparisonVisible && anomalyEnabled
              ? deviationMarkers(activeWidgetView?.primarySeries || [], activeWidgetView?.secondarySeries || [], anomalyThreshold)
              : []),
          ]}
          showDeviation={comparisonVisible}
          series={
            comparisonVisible
              ? [
                  {
                    label: activeWidgetView?.primaryLabel || "主序列",
                    color: "#0f766e",
                    date: activeWidgetView?.primaryDate || activeWidgetView?.effectiveDate,
                    points: activeWidgetView?.primarySeries || [],
                  },
                  {
                    label: activeWidgetView?.secondaryLabel || "对比序列",
                    color: "#d97706",
                    date: activeWidgetView?.secondaryDate,
                    points: activeWidgetView?.secondarySeries || [],
                  },
                ]
              : [
                  {
                    label: activeWidgetView?.primaryLabel || "趋势序列",
                    color: "#0f766e",
                    date: activeWidgetView?.primaryDate || activeWidgetView?.effectiveDate,
                    points: activeWidgetView?.primarySeries || [],
                  },
                ]
          }
        />
        {activeWidget?.id === "local_source" && activeWidget.variants?.length ? (
          <VariantComposition variants={activeWidget.variants} />
        ) : null}
      </section>

      <section className="widget-board-head">
        <div>
          <h2>{CATEGORY_OPTIONS.find((item) => item.id === activeCategory)?.label}指标</h2>
          <p>移动任意小图的时间游标，全部指标会同步到相同时点。</p>
        </div>
        <button
          type="button"
          className="chart-tooltip-toggle"
          onClick={() => setOverviewTooltipVisible((current) => !current)}
        >
          {overviewTooltipVisible ? "隐藏浮窗" : "显示浮窗"}
        </button>
      </section>

      <section className="widget-grid">
        {visibleWidgets.map((widget) => {
          const selectedVariantId = variantSelection[widget.id] || widget.variants?.[0]?.id || "";
          const selectedVariant = widget.variants?.find((item) => item.id === selectedVariantId);
          const view = selectedVariant
            ? {
                ...widget,
                unit: selectedVariant.unit,
                effectiveDate: selectedVariant.effectiveDate,
                primarySeries: selectedVariant.primarySeries,
                secondarySeries: selectedVariant.secondarySeries,
              }
            : widget;

          const primary = pointValueAtTime(view.primarySeries, linkedTime);
          const secondary = pointValueAtTime(view.secondarySeries, linkedTime);
          const average = averageValue(view.primarySeries);
          const tone = diffTone(primary, secondary);
          const delta = deviationValue(primary, secondary);
          const widgetVisibility = visibility[widget.id] || { primary: true, secondary: true, deviation: true };

          return (
            <article
              key={widget.id}
              className={`panel widget-card ${widget.id === activeWidget?.id ? "widget-card-active" : ""}`}
              draggable
              onDragStart={() => setDraggingId(widget.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (!draggingId || draggingId === widget.id) {
                  return;
                }
                const next = moveItem(order, draggingId, widget.id);
                setOrder(next);
                safeStorage(() => window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)));
                setDraggingId("");
              }}
              onClick={() => setActiveId(widget.id)}
            >
              <div className="widget-topbar">
                <div>
                  <h3>{widget.title}</h3>
                  {widget.variants?.length ? (
                    <select
                      className="widget-variant-select"
                      value={selectedVariantId}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) =>
                        setVariantSelection((current) => ({
                          ...current,
                          [widget.id]: event.target.value,
                        }))
                      }
                    >
                      {widget.variants.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
                <button type="button" className="drag-chip">
                  拖动排序
                </button>
              </div>

              <div className="widget-stats">
                <div>
                  <span>{linkedTime}</span>
                  <strong className={`trend-${tone}`}>{formatNumber(primary, 0)}</strong>
                </div>
                <div>
                  <span>{comparisonVisible ? "对比" : "峰值"}</span>
                  <strong>{comparisonVisible ? formatNumber(secondary, 0) : formatNumber(peakValue(view.primarySeries), 0)}</strong>
                </div>
                <div>
                  <span>均值</span>
                  <strong>{formatNumber(average, 0)}</strong>
                </div>
                <div>
                  <span>{comparisonVisible ? "偏差" : "峰谷差"}</span>
                  <strong className={`trend-${tone}`}>
                    {comparisonVisible ? formatNumber(delta, 0) : formatNumber(deviationValue(peakValue(view.primarySeries), averageValue(view.primarySeries)), 0)}
                  </strong>
                </div>
              </div>

              <div className="widget-legend">
                <button
                  type="button"
                  className={`legend-chip ${widgetVisibility.primary ? "legend-chip-active" : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleVisibility(widget.id, "primary");
                  }}
                >
                  <i style={{ background: "#0f766e" }} />
                  {view.primaryLabel}
                </button>
                {comparisonVisible ? (
                  <button
                  type="button"
                  className={`legend-chip ${widgetVisibility.secondary ? "legend-chip-active" : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleVisibility(widget.id, "secondary");
                  }}
                >
                  <i style={{ background: "#d97706" }} />
                  {view.secondaryLabel}
                </button>
                ) : null}
                {comparisonVisible ? (
                  <button
                  type="button"
                  className={`legend-chip ${widgetVisibility.deviation ? "legend-chip-active" : ""} ${
                    delta !== null ? (delta > 0 ? "trend-up" : delta < 0 ? "trend-down" : "trend-flat") : "trend-flat"
                  }`}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleVisibility(widget.id, "deviation");
                  }}
                >
                  <i style={{ background: delta !== null && delta >= 0 ? "#ef4444" : "#22c55e" }} />
                  偏差量
                </button>
                ) : null}
              </div>

              <MiniTrend
                primary={view.primarySeries}
                secondary={view.secondarySeries}
                primaryLabel={view.primaryLabel}
                secondaryLabel={view.secondaryLabel}
                primaryVisible={widgetVisibility.primary}
                secondaryVisible={widgetVisibility.secondary}
                deviationVisible={widgetVisibility.deviation}
                comparisonVisible={comparisonVisible}
                linkedTime={linkedTime}
                tooltipVisible={overviewTooltipVisible}
                onLinkedTimeChange={setLinkedTime}
              />

              <div className="widget-foot">
                <span>{view.primaryLabel}</span>
                <span>{comparisonVisible ? view.secondaryLabel : view.effectiveDate}</span>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
