"use client";

import { useMemo, useState } from "react";

type Point = { point_time: string; value: number | null };

type ChartSeries = {
  label: string;
  color: string;
  date?: string;
  points: Point[];
};

type HighlightWindow = {
  label: string;
  start: string;
  end: string;
  color: string;
};

type Marker = {
  point_time: string;
  value: number;
  label: string;
  color?: string;
};

type LineChartProps = {
  title: string;
  unit?: string | null;
  series: ChartSeries[];
  highlights?: HighlightWindow[];
  markers?: Marker[];
  showDeviation?: boolean;
};

function formatValue(value: number) {
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  return value.toFixed(2);
}

function normalizeTimeLabel(label: string) {
  const match = label.match(/(\d{1,2}:\d{2})$/);
  return match ? match[1].padStart(5, "0") : label;
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
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

export default function LineChart({
  title,
  unit,
  series,
  highlights = [],
  markers = [],
  showDeviation = series.length === 2,
}: LineChartProps) {
  const alignByTime =
    showDeviation &&
    series.length >= 2 &&
    series.every((item) => !hasDuplicateNormalizedTime(item.points));
  const labels = alignByTime
    ? Array.from(new Set(series.flatMap((item) => item.points.map((point) => normalizeTimeLabel(point.point_time))))).sort(
        (a, b) => timeSortValue(a) - timeSortValue(b) || a.localeCompare(b)
      )
    : series[0]?.points.map((point) => point.point_time) || [];
  const alignedSeries = series.map((item) => {
    const pointMap = new Map(
      item.points.map((point) => [alignByTime ? normalizeTimeLabel(point.point_time) : point.point_time, point.value])
    );
    return {
      ...item,
      points: labels.map((label) => ({
        point_time: label,
        value: pointMap.get(label) ?? null,
      })),
    };
  });
  const validValues = alignedSeries.flatMap((item) =>
    item.points.map((point) => point.value).filter((value): value is number => value !== null)
  );
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltipVisible, setTooltipVisible] = useState(true);

  const deviations = useMemo(() => {
    if (alignedSeries.length < 2) return [] as Array<number | null>;
    return alignedSeries[0].points.map((point, index) => {
      const compare = alignedSeries[1]?.points[index]?.value ?? null;
      if (point.value === null || compare === null) return null;
      return point.value - compare;
    });
  }, [alignedSeries]);

  if (validValues.length === 0 || labels.length === 0) {
    return (
      <div className="chart-shell">
        <div className="chart-head">
          <div>
            <h3>{title}</h3>
            <p className="muted">暂无可展示数据</p>
          </div>
        </div>
      </div>
    );
  }

  const min = Math.min(...validValues);
  const max = Math.max(...validValues);
  const range = max - min || 1;
  const validDeviationValues = deviations.filter((value): value is number => value !== null);
  const deviationAbsMax = validDeviationValues.length
    ? Math.max(...validDeviationValues.map((value) => Math.abs(value)))
    : 1;

  const width = 760;
  const height = 360;
  const left = 48;
  const right = 28;
  const top = 20;
  const bottom = 42;
  const gap = 16;
  const lineHeight = 220;
  const barHeight = 58;
  const lineTop = top;
  const lineBottom = lineTop + lineHeight;
  const barTop = lineBottom + gap;
  const barBottom = barTop + barHeight;
  const innerWidth = width - left - right;
  const innerHeight = lineHeight;
  const zeroY = barTop + barHeight / 2;

  const yTicks = Array.from({ length: 5 }, (_, index) => {
    const value = max - (range / 4) * index;
    const y = lineTop + (innerHeight / 4) * index;
    return { value, y };
  });

  const xForIndex = (index: number) => left + (innerWidth * index) / Math.max(labels.length - 1, 1);
  const yForValue = (value: number) => lineTop + innerHeight - ((value - min) / range) * innerHeight;

  const toPath = (points: Point[]) => {
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

  const sampledLabels = labels.filter(
    (_, index) => index % Math.ceil(labels.length / 8) === 0 || index === labels.length - 1
  );

  const highlightRects = highlights
    .map((item) => {
      const startIndex = labels.indexOf(alignByTime ? normalizeTimeLabel(item.start) : item.start);
      const endIndex = labels.indexOf(alignByTime ? normalizeTimeLabel(item.end) : item.end);
      if (startIndex < 0 || endIndex < 0) return null;
      const x1 = xForIndex(startIndex);
      const x2 = xForIndex(endIndex);
      return { ...item, x: Math.min(x1, x2), width: Math.abs(x2 - x1) || 6 };
    })
    .filter(Boolean) as Array<HighlightWindow & { x: number; width: number }>;

  const activePrimary = hoverIndex !== null ? alignedSeries[0]?.points[hoverIndex]?.value ?? null : null;
  const activeSecondary = hoverIndex !== null ? alignedSeries[1]?.points[hoverIndex]?.value ?? null : null;
  const activeDeviation = activePrimary !== null && activeSecondary !== null ? activePrimary - activeSecondary : null;
  const hoverX = hoverIndex !== null ? xForIndex(hoverIndex) : null;
  const tooltipRows =
    hoverIndex !== null
      ? alignedSeries.map((item) => ({
          label: item.label,
          date: item.date,
          value: item.points[hoverIndex]?.value ?? null,
        }))
      : [];
  const tooltipHeight = 22 + tooltipRows.length * 15 + (showDeviation && series.length >= 2 ? 15 : 0);
  const tooltipWidth = 190;
  const tooltipX =
    hoverX !== null ? Math.min(Math.max(hoverX - tooltipWidth / 2, left + 4), width - right - tooltipWidth) : left;

  return (
    <div className="chart-shell">
      <div className="chart-head">
        <div>
          <h3>{title}</h3>
          <p className="muted">{unit ? `单位 ${unit}` : "单位待识别"}</p>
        </div>
        <div className="chart-legend">
          {alignedSeries.map((item, index) => (
            <span key={`legend-${item.label}-${item.date || "no-date"}-${index}`}>
              <i style={{ background: item.color }} />
              {item.label}
            </span>
          ))}
          {showDeviation && series.length >= 2 ? (
            <span>
              <i style={{ background: "#60d6de" }} />
              偏差量
            </span>
          ) : null}
          <button
            type="button"
            className="chart-tooltip-toggle"
            onClick={() => setTooltipVisible((current) => !current)}
          >
            {tooltipVisible ? "隐藏浮窗" : "显示浮窗"}
          </button>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg" role="img" aria-label={title}>
        {highlightRects.map((item) => (
          <g key={`${item.label}-${item.start}`}>
            <rect x={item.x} y={lineTop} width={item.width} height={innerHeight} fill={item.color} opacity="0.15" />
            <text x={item.x + item.width / 2} y={lineTop + 14} textAnchor="middle" className="chart-axis-text">
              {item.label}
            </text>
          </g>
        ))}

        {yTicks.map((tick) => (
          <g key={`line-${tick.y}`}>
            <line x1={left} x2={width - right} y1={tick.y} y2={tick.y} stroke="rgba(31,37,44,0.1)" />
            <text x={left - 8} y={tick.y + 4} textAnchor="end" className="chart-axis-text">
              {formatValue(tick.value)}
            </text>
          </g>
        ))}

        {alignedSeries.map((item, index) => (
          <path
            key={`series-${item.label}-${item.date || "no-date"}-${index}`}
            d={toPath(item.points)}
            fill="none"
            stroke={item.color}
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {markers.map((marker) => {
          const index = labels.indexOf(alignByTime ? normalizeTimeLabel(marker.point_time) : marker.point_time);
          if (index < 0) return null;
          const x = xForIndex(index);
          const y = yForValue(marker.value);
          return (
            <g key={`${marker.label}-${marker.point_time}`}>
              <circle cx={x} cy={y} r="5" fill={marker.color || "#dc2626"} />
              <text x={x} y={y - 10} textAnchor="middle" className="chart-axis-text">
                {marker.label}
              </text>
            </g>
          );
        })}

        {showDeviation && series.length >= 2 ? (
          <>
            <line x1={left} x2={width - right} y1={zeroY} y2={zeroY} stroke="rgba(31,37,44,0.12)" />
            {deviations.map((value, index) => {
              if (value === null) return null;
              const x = xForIndex(index);
              const barWidth = Math.max(innerWidth / Math.max(labels.length, 1) - 1, 2);
              const scaled = (Math.abs(value) / deviationAbsMax) * (barHeight / 2 - 5);
              const y = value >= 0 ? zeroY - scaled : zeroY;
              return (
                <rect
                  key={`deviation-${labels[index]}`}
                  x={x - barWidth / 2}
                  y={y}
                  width={barWidth}
                  height={scaled}
                  rx="1"
                  fill={value >= 0 ? "#ef4444" : "#22c55e"}
                  opacity="0.82"
                />
              );
            })}
            <text x={left - 8} y={barTop + 4} textAnchor="end" className="chart-axis-text">
              {formatValue(deviationAbsMax)}
            </text>
            <text x={left - 8} y={zeroY + 4} textAnchor="end" className="chart-axis-text">
              0
            </text>
            <text x={left - 8} y={barBottom + 4} textAnchor="end" className="chart-axis-text">
              {formatValue(-deviationAbsMax)}
            </text>
            <text x={left - 8} y={barTop - 4} textAnchor="start" className="chart-axis-text">
              偏差量
            </text>
          </>
        ) : null}

        {sampledLabels.map((label, index) => {
          const labelIndex = labels.indexOf(label);
          const x = xForIndex(labelIndex);
          const anchor = labelIndex === 0 ? "start" : labelIndex === labels.length - 1 ? "end" : "middle";
          return (
            <text key={`${label}-${index}`} x={x} y={height - 10} textAnchor={anchor} className="chart-axis-text">
              {label}
            </text>
          );
        })}

        {hoverX !== null && tooltipVisible ? (
          <>
            <line x1={hoverX} x2={hoverX} y1={lineTop} y2={barBottom} stroke="rgba(31,37,44,0.18)" strokeDasharray="3 3" />
            {alignedSeries.map((item, index) => {
              const point = item.points[hoverIndex!]?.value ?? null;
              if (point === null) return null;
              return <circle key={`${item.label}-${index}`} cx={hoverX} cy={yForValue(point)} r="4" fill={item.color} />;
            })}
            <g transform={`translate(${tooltipX}, ${lineTop + 8})`}>
              <rect
                width={tooltipWidth}
                height={tooltipHeight}
                rx="12"
                fill="rgba(255,255,255,0.72)"
                stroke="rgba(31,37,44,0.1)"
              />
              <text x="10" y="16" className="chart-tooltip-text">
                {labels[hoverIndex!] || ""}
              </text>
          {tooltipRows.map((row, index) => (
                <text key={`${row.label}-${row.date || "no-date"}-${index}`} x="10" y={31 + index * 15} className="chart-tooltip-text">
                  {row.date ? `${row.date} ` : ""}
                  {row.label} {row.value === null ? "-" : formatValue(row.value)}
                </text>
              ))}
              {showDeviation && alignedSeries[1] ? (
                <text x="10" y={31 + tooltipRows.length * 15} className="chart-tooltip-text">
                  偏差 {activeDeviation === null ? "-" : formatValue(activeDeviation)}
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
            setHoverIndex(Math.round(ratio * Math.max(labels.length - 1, 0)));
          }}
          onMouseLeave={() => setHoverIndex(null)}
        />
      </svg>
    </div>
  );
}
