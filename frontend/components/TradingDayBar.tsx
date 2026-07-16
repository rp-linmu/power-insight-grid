"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import type { TradingContextResponse } from "../lib/api";


type TradingDayBarProps = {
  initialContext: TradingContextResponse;
};

function formatUpdatedAt(value: string | null) {
  if (!value) {
    return "更新时间未知";
  }
  return `更新 ${value.replace("T", " ").slice(5, 16)}`;
}

function statusClass(status: string) {
  if (status === "published") {
    return "ready";
  }
  if (status === "partial") {
    return "partial";
  }
  return "missing";
}

export default function TradingDayBar({ initialContext }: TradingDayBarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryDate = searchParams.get("trade_date");
  const selectedDate = queryDate || initialContext.selected_date || "";
  const [context, setContext] = useState(initialContext);

  useEffect(() => {
    if (!selectedDate) {
      return;
    }
    const controller = new AbortController();
    fetch(`/api/trading/context?effective_date=${encodeURIComponent(selectedDate)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: TradingContextResponse | null) => {
        if (data?.selected_date) {
          setContext(data);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [selectedDate]);

  function dateHref(date: string) {
    const query = new URLSearchParams(searchParams.toString());
    query.set("trade_date", date);
    if (pathname.startsWith("/operations") || pathname.startsWith("/clearing")) {
      query.set("date", date);
    }
    return `${pathname}?${query.toString()}`;
  }

  return (
    <section className="trading-day-bar" aria-label="全局交易日">
      <form className="trading-day-primary" method="get" action={pathname}>
        <span className="trading-day-label">交易日</span>
        {context.previous_date ? (
          <Link className="trading-day-icon" href={dateHref(context.previous_date)} aria-label="上一交易日" title="上一交易日">
            ‹
          </Link>
        ) : (
          <span className="trading-day-icon trading-day-icon-disabled" aria-hidden="true">‹</span>
        )}
        {Array.from(searchParams.entries())
          .filter(([key]) => key !== "trade_date")
          .map(([key, value]) => <input key={`${key}-${value}`} type="hidden" name={key} value={value} />)}
        <input
          type="date"
          name="trade_date"
          defaultValue={selectedDate}
          min={context.available_dates.at(-1)}
          max={context.available_dates[0]}
          aria-label="选择交易日"
        />
        <button type="submit" className="trading-day-confirm">确认</button>
        {context.next_date ? (
          <Link className="trading-day-icon" href={dateHref(context.next_date)} aria-label="下一交易日" title="下一交易日">
            ›
          </Link>
        ) : (
          <span className="trading-day-icon trading-day-icon-disabled" aria-hidden="true">›</span>
        )}
      </form>
      <div className="trading-day-meta">
        <span className={`status-dot status-${context.status}`} />
        <strong>{context.status_label}</strong>
        <span>完整度 {context.completeness}%</span>
        <span>{formatUpdatedAt(context.updated_at)}</span>
        {context.data_statuses?.length ? (
          <span className="trading-day-data-statuses">
            {context.data_statuses.map((item) => (
              <span key={item.key} className={`trading-day-data-pill status-${statusClass(item.status)}`}>
                {item.label} {item.status_label}
              </span>
            ))}
          </span>
        ) : null}
        {context.missing_items.length ? <span>缺少：{context.missing_items.join("、")}</span> : null}
      </div>
    </section>
  );
}
