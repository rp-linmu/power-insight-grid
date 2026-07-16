"use client";

import { useMemo, useState } from "react";

import type {
  UnitCommitmentLinkageResponse,
  UnitCommitmentRow,
  UnitStatusSegment,
} from "../lib/api";


type StatusFilter = "all" | "running" | "available" | "stopped" | "missing" | "changed";

function statusAt(segments: UnitStatusSegment[], time: string) {
  return segments.find((segment) => time >= segment.start && (segment.end === "24:00" || time < segment.end))?.status || "未发布";
}

function statusMeta(status: string) {
  if (status === "开") {
    return { label: "约束运行", className: "unit-status-running" };
  }
  if (status === "自由优化") {
    return { label: "可开机", className: "unit-status-available" };
  }
  if (status === "停") {
    return { label: "约束停机", className: "unit-status-stopped" };
  }
  return { label: "未发布", className: "unit-status-missing" };
}

function formatMw(value: number | null) {
  return value === null ? "--" : value.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function segmentText(segments: UnitStatusSegment[]) {
  if (!segments.length) {
    return "未发布";
  }
  return segments.map((segment) => `${segment.start}-${segment.end} ${statusMeta(segment.status).label}`).join("；");
}

function changeText(row: UnitCommitmentRow, time: string, previousAvailable: boolean) {
  const current = statusAt(row.current_segments, time);
  const previous = statusAt(row.previous_segments, time);
  if (current === "未发布") {
    return "当日约束信息未完整发布";
  }
  if (!previousAvailable || previous === "未发布") {
    return "前日约束信息未发布";
  }
  if (previous !== current) {
    return `较前日：${statusMeta(previous).label} → ${statusMeta(current).label}`;
  }
  return "状态延续";
}

function constraintModeLabel(mode: string) {
  if (mode === "complete") return "完整约束已发布";
  if (mode === "fallback") return "仅简化约束";
  return "约束未发布";
}

export default function UnitCommitmentLinkage({ data }: { data: UnitCommitmentLinkageResponse }) {
  const defaultTime = data.times.includes("12:00") ? "12:00" : data.times[0] || "00:00";
  const [time, setTime] = useState(defaultTime);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const evaluatedRows = useMemo(
    () =>
      data.rows.map((row) => {
        const current = statusAt(row.current_segments, time);
        const previous = statusAt(row.previous_segments, time);
        return {
          ...row,
          current,
          previous,
          changed:
            data.previous_available &&
            current !== "未发布" &&
            previous !== "未发布" &&
            previous !== current,
        };
      }),
    [data, time]
  );

  const counts = {
    running: evaluatedRows.filter((row) => row.current === "开").length,
    available: evaluatedRows.filter((row) => row.current === "自由优化").length,
    stopped: evaluatedRows.filter((row) => row.current === "停").length,
    missing: evaluatedRows.filter((row) => row.current === "未发布").length,
    changed: evaluatedRows.filter((row) => row.changed).length,
  };

  const filteredRows = evaluatedRows
    .filter((row) => {
      if (statusFilter === "running") return row.current === "开";
      if (statusFilter === "available") return row.current === "自由优化";
      if (statusFilter === "stopped") return row.current === "停";
      if (statusFilter === "missing") return row.current === "未发布";
      if (statusFilter === "changed") return row.changed;
      return true;
    })
    .filter((row) => `${row.plant_name || ""}${row.unit_name}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => {
      const priority = { 开: 0, 停: 1, 自由优化: 2, 未发布: 3 };
      return priority[a.current as keyof typeof priority] - priority[b.current as keyof typeof priority] ||
        a.unit_name.localeCompare(b.unit_name, "zh-CN");
    });

  const filters: Array<{ key: StatusFilter; label: string; count: number }> = [
    { key: "all", label: "全部机组", count: evaluatedRows.length },
    { key: "running", label: "约束运行", count: counts.running },
    { key: "available", label: "可开机", count: counts.available },
    { key: "stopped", label: "约束停机", count: counts.stopped },
    { key: "missing", label: "约束未发布", count: counts.missing },
    { key: "changed", label: "较前日变化", count: counts.changed },
  ];

  return (
    <section className="unit-linkage-panel" aria-label="日前机组运行联动">
      <div className="unit-linkage-head">
        <div>
          <span>日前机组状态</span>
          <h2>开停机约束与出力能力联动</h2>
          <p>{data.note}</p>
        </div>
        <div className="unit-date-context">
          <span>{data.previous_date} {constraintModeLabel(data.previous_constraint_mode)}</span>
          <strong>{data.selected_date} {constraintModeLabel(data.current_constraint_mode)}</strong>
        </div>
      </div>

      <div className="unit-linkage-controls">
        <label>
          <span>查看时点</span>
          <select value={time} onChange={(event) => setTime(event.target.value)}>
            {data.times.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label className="unit-search">
          <span>搜索机组或电厂</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="输入名称" />
        </label>
      </div>

      <div className="unit-status-tabs">
        {filters.map((filter) => (
          <button
            key={filter.key}
            type="button"
            className={statusFilter === filter.key ? "unit-status-tab-active" : ""}
            onClick={() => setStatusFilter(filter.key)}
          >
            {filter.label}<strong>{filter.count}</strong>
          </button>
        ))}
      </div>

      <div className="unit-linkage-table-wrap">
        <table className="unit-linkage-table">
          <thead>
            <tr>
              <th>机组</th>
              <th>当前判断</th>
              <th>{data.previous_date || "前一日"}</th>
              <th>{data.selected_date || "当日"}</th>
              <th>出力范围 MW</th>
              <th>当日状态分段</th>
              <th>较前日变化</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => {
              const currentMeta = statusMeta(row.current);
              return (
                <tr key={row.unit_name}>
                  <td>
                    <strong>{row.unit_name}</strong>
                    <span>{row.plant_name || "未匹配电厂"}</span>
                  </td>
                  <td><span className={`unit-status ${currentMeta.className}`}>{currentMeta.label}</span></td>
                  <td><span className={`unit-status ${statusMeta(row.previous).className}`}>{statusMeta(row.previous).label}</span></td>
                  <td><span className={`unit-status ${currentMeta.className}`}>{currentMeta.label}</span></td>
                  <td>{formatMw(row.minimum_output_mw)} - {formatMw(row.rated_output_mw)}</td>
                  <td className="unit-segments">{segmentText(row.current_segments)}</td>
                  <td className={row.changed ? "unit-change" : "unit-stable"}>
                    {changeText(row, time, data.previous_available)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!filteredRows.length ? <div className="empty-state">当前筛选条件下没有机组。</div> : null}
      </div>
    </section>
  );
}
