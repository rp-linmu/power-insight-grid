"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type FilterOption = {
  label: string;
  value: string;
};

type DateRange = {
  start: string;
  end: string;
};

type FilterField =
  | {
      name: string;
      label: string;
      value: string;
      options: FilterOption[];
      type?: "select";
      disabled?: boolean;
    }
  | {
      name: string;
      label: string;
      value: string;
      options: FilterOption[];
      type: "toggle";
      disabled?: boolean;
    }
  | {
      name: string;
      label: string;
      value: string;
      options: FilterOption[];
      type: "multiselect";
      disabled?: boolean;
    }
  | {
      name: string;
      label: string;
      value: string;
      type: "checkbox";
      disabled?: boolean;
    }
  | {
      name: string;
      label: string;
      value: string;
      type: "text";
      placeholder?: string;
      disabled?: boolean;
    }
  | {
      name: string;
      label: string;
      value: string;
      dates: string[];
      type: "dateranges";
      disabled?: boolean;
      clearOnOpen?: boolean;
      autoPreviousFrom?: string;
    };

type FilterBarProps = {
  fields: FilterField[];
};

function normalizeRange(range: DateRange) {
  return range.start <= range.end ? range : { start: range.end, end: range.start };
}

function parseRanges(value: string) {
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

function serializeRanges(ranges: DateRange[]) {
  return ranges.map((range) => `${range.start}~${range.end}`).join(",");
}

function dedupeRanges(ranges: DateRange[]) {
  const seen = new Set<string>();
  return ranges.filter((range) => {
    const key = `${range.start}~${range.end}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function monthStart(value: string) {
  return `${value.slice(0, 7)}-01`;
}

function shiftMonth(month: string, delta: number) {
  const [year, monthValue] = month.split("-").map(Number);
  const date = new Date(year, monthValue - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function monthLabel(month: string) {
  const [year, monthValue] = month.split("-").map(Number);
  return `${year}年 ${monthValue}月`;
}

function buildMonthGrid(month: string) {
  const [year, monthValue] = month.split("-").map(Number);
  const first = new Date(year, monthValue - 1, 1);
  const weekday = first.getDay();
  const offset = weekday === 0 ? 6 : weekday - 1;
  const start = new Date(year, monthValue - 1, 1 - offset);

  return Array.from({ length: 35 }).map((_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return {
      value: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`,
      label: String(day.getDate()).padStart(2, "0"),
      inMonth: day.getMonth() === monthValue - 1,
    };
  });
}

function rangeLabel(range: DateRange) {
  return `${range.start}至${range.end}`;
}

function previousAvailableDate(value: string, dates: string[]) {
  const [year, month, day] = value.split("-").map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day));
  previous.setUTCDate(previous.getUTCDate() - 1);
  const exact = previous.toISOString().slice(0, 10);
  return dates.includes(exact) ? exact : dates.filter((item) => item < value).sort().at(-1);
}

function DateRangeField({
  field,
  onCommit,
}: {
  field: Extract<FilterField, { type: "dateranges" }>;
  onCommit: (ranges: DateRange[]) => void;
}) {
  const availableDates = useMemo(() => new Set(field.dates), [field.dates]);
  const months = useMemo(() => {
    const source = field.dates.length ? field.dates : parseRanges(field.value).flatMap((range) => [range.start, range.end]);
    const unique = Array.from(new Set(source.map((item) => monthStart(item)))).sort();
    return unique.length ? unique : [monthStart(new Date().toISOString().slice(0, 10))];
  }, [field.dates, field.value]);

  const initialRanges = useMemo(() => dedupeRanges(parseRanges(field.value)), [field.value]);
  const initialMonth = initialRanges[0]?.start ? monthStart(initialRanges[0].start) : months[0];
  const [open, setOpen] = useState(false);
  const [committedRanges, setCommittedRanges] = useState<DateRange[]>(initialRanges);
  const [draftRanges, setDraftRanges] = useState<DateRange[]>(initialRanges);
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const [visibleMonth, setVisibleMonth] = useState(initialMonth);
  const rootRef = useRef<HTMLLabelElement | null>(null);

  useEffect(() => {
    setCommittedRanges(initialRanges);
    setDraftRanges(initialRanges);
    if (initialRanges[0]?.start) setVisibleMonth(monthStart(initialRanges[0].start));
  }, [initialRanges]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setDraftRanges(committedRanges);
        setPendingStart(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [committedRanges]);

  const nextMonth = shiftMonth(visibleMonth, 1);
  const leftGrid = buildMonthGrid(visibleMonth);
  const rightGrid = buildMonthGrid(nextMonth);

  const summary =
    committedRanges.length === 0
      ? "选择日期区间"
      : committedRanges.length === 1
        ? rangeLabel(committedRanges[0])
        : `${rangeLabel(committedRanges[0])} +${committedRanges.length - 1}`;
  const draftSummary =
    draftRanges.length === 0
      ? pendingStart
        ? `已选择起始日 ${pendingStart}`
        : "请选择新的日期"
      : draftRanges.length === 1
        ? rangeLabel(draftRanges[0])
        : `${rangeLabel(draftRanges[0])} +${draftRanges.length - 1}`;

  const dayStatus = (day: string) => {
    const inRange = draftRanges.some((range) => day >= range.start && day <= range.end);
    const rangeStart = draftRanges.some((range) => day === range.start);
    const rangeEnd = draftRanges.some((range) => day === range.end);
    const selectable = availableDates.has(day);
    const pending = pendingStart === day;
    return { inRange, rangeStart, rangeEnd, selectable, pending };
  };

  const addOrCompleteRange = (day: string) => {
    if (!availableDates.has(day) || field.disabled) return;
    if (!pendingStart) {
      setPendingStart(day);
      return;
    }
    const nextRanges = dedupeRanges([...draftRanges, normalizeRange({ start: pendingStart, end: day })]).sort((a, b) =>
      a.start.localeCompare(b.start)
    );
    setDraftRanges(nextRanges);
    setPendingStart(null);
  };

  return (
    <label ref={rootRef} className={`filter-field filter-date-field ${field.disabled ? "filter-field-disabled" : ""}`}>
      <span>{field.label}</span>
      <input type="hidden" name={field.name} value={serializeRanges(committedRanges)} />
      <button
        type="button"
        className="date-range-trigger"
        disabled={field.disabled}
        onClick={() => {
          setDraftRanges(field.clearOnOpen ? [] : committedRanges);
          setPendingStart(null);
          setOpen((current) => !current);
        }}
      >
        <span>{summary}</span>
        <strong>{committedRanges.length} 段</strong>
      </button>

      {open ? (
        <div className="date-range-popover">
          <div className="date-range-toolbar">
            <div className="date-range-summary">{draftSummary}</div>
            <div className="date-range-note">先点起始，再点结束，可连续添加多个区间</div>
          </div>

          <div className="date-range-body">
            <aside className="date-range-sidebar">
              <h4>已选日期</h4>
              {draftRanges.length ? (
                <div className="date-range-list">
                  {draftRanges.map((range) => (
                    <div key={`${range.start}-${range.end}`} className="date-range-item">
                      <span>{rangeLabel(range)}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setDraftRanges((current) =>
                            current.filter((item) => item.start !== range.start || item.end !== range.end)
                          )
                        }
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">还没有选中日期区间</p>
              )}
            </aside>

            <div className="date-range-calendars">
              <div className="date-range-nav">
                <button type="button" onClick={() => setVisibleMonth(shiftMonth(visibleMonth, -2))}>
                  &laquo;
                </button>
                <button type="button" onClick={() => setVisibleMonth(shiftMonth(visibleMonth, -1))}>
                  &lsaquo;
                </button>
                <button type="button" onClick={() => setVisibleMonth(shiftMonth(visibleMonth, 1))}>
                  &rsaquo;
                </button>
                <button type="button" onClick={() => setVisibleMonth(shiftMonth(visibleMonth, 2))}>
                  &raquo;
                </button>
              </div>

              <div className="calendar-months">
                {[visibleMonth, nextMonth].map((month, monthIndex) => (
                  <div key={month} className="calendar-month">
                    <div className="calendar-title">{monthLabel(month)}</div>
                    <div className="calendar-weekdays">
                      {["一", "二", "三", "四", "五", "六", "日"].map((item) => (
                        <span key={`${month}-${item}`}>{item}</span>
                      ))}
                    </div>
                    <div className="calendar-grid">
                      {(monthIndex === 0 ? leftGrid : rightGrid).map((day) => {
                        const status = dayStatus(day.value);
                        return (
                          <button
                            key={day.value}
                            type="button"
                            className={[
                              "calendar-day",
                              day.inMonth ? "" : "calendar-day-outside",
                              status.selectable ? "calendar-day-selectable" : "calendar-day-disabled",
                              status.inRange ? "calendar-day-in-range" : "",
                              status.rangeStart ? "calendar-day-edge" : "",
                              status.rangeEnd ? "calendar-day-edge" : "",
                              status.pending ? "calendar-day-pending" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            disabled={!status.selectable}
                            onClick={() => addOrCompleteRange(day.value)}
                          >
                            {day.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="date-range-actions">
            <button
              type="button"
              className="date-range-action-secondary"
              onClick={() => {
                setDraftRanges([]);
                setPendingStart(null);
              }}
            >
              清空
            </button>
            <button
              type="button"
              className="date-range-action-secondary"
              onClick={() => {
                setDraftRanges(committedRanges);
                setPendingStart(null);
                setOpen(false);
              }}
            >
              取消
            </button>
            <button
              type="button"
              className="date-range-action-primary"
              onClick={() => {
                const nextRanges = dedupeRanges(draftRanges).sort((a, b) => a.start.localeCompare(b.start));
                setCommittedRanges(nextRanges);
                setDraftRanges(nextRanges);
                setPendingStart(null);
                setOpen(false);
                onCommit(nextRanges);
              }}
            >
              确定
            </button>
          </div>
        </div>
      ) : null}
    </label>
  );
}

function MultiSelectField({
  field,
}: {
  field: Extract<FilterField, { type: "multiselect" }>;
}) {
  const [selected, setSelected] = useState<string[]>(() =>
    field.value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );

  useEffect(() => {
    setSelected(
      field.value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    );
  }, [field.value]);

  const toggle = (value: string) => {
    if (field.disabled) return;
    setSelected((current) => {
      if (current.includes(value)) {
        const next = current.filter((item) => item !== value);
        return next.length ? next : current;
      }
      return [...current, value];
    });
  };

  return (
    <label className={`filter-field filter-multi-field ${field.disabled ? "filter-field-disabled" : ""}`}>
      <span>{field.label}</span>
      <input type="hidden" name={field.name} value={selected.join(",")} />
      <div className="filter-multi-options">
        {field.options.map((option) => {
          const active = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              className={active ? "filter-multi-chip is-active" : "filter-multi-chip"}
              disabled={field.disabled}
              onClick={() => toggle(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </label>
  );
}

export default function FilterBar({ fields }: FilterBarProps) {
  const dateFieldSignature = fields
    .filter((field): field is Extract<FilterField, { type: "dateranges" }> => field.type === "dateranges")
    .map((field) => `${field.name}:${field.value}`)
    .join("|");
  const [dateValues, setDateValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      fields
        .filter((field): field is Extract<FilterField, { type: "dateranges" }> => field.type === "dateranges")
        .map((field) => [field.name, field.value])
    )
  );

  useEffect(() => {
    setDateValues(
      Object.fromEntries(
        fields
          .filter((field): field is Extract<FilterField, { type: "dateranges" }> => field.type === "dateranges")
          .map((field) => [field.name, field.value])
      )
    );
  }, [dateFieldSignature, fields]);

  return (
    <form className="filter-bar">
      {fields.map((field) => {
        if (field.type === "dateranges") {
          return (
            <DateRangeField
              key={field.name}
              field={{ ...field, value: dateValues[field.name] ?? field.value }}
              onCommit={(ranges) => {
                const value = serializeRanges(ranges);
                setDateValues((current) => {
                  const next = { ...current, [field.name]: value };
                  const linkedField = fields.find(
                    (item): item is Extract<FilterField, { type: "dateranges" }> =>
                      item.type === "dateranges" && item.autoPreviousFrom === field.name
                  );
                  const selectedDate = ranges[0]?.start;
                  if (linkedField && selectedDate) {
                    const previous = previousAvailableDate(selectedDate, linkedField.dates);
                    next[linkedField.name] = previous ? `${previous}~${previous}` : "";
                  }
                  return next;
                });
              }}
            />
          );
        }

        if (field.type === "multiselect") {
          return <MultiSelectField key={field.name} field={field} />;
        }

        if (field.type === "checkbox") {
          const checked = field.value === "1" || field.value === "true";
          return (
            <label key={field.name} className={`filter-field filter-check-field ${field.disabled ? "filter-field-disabled" : ""}`}>
              <span>{field.label}</span>
              <input name={field.name} type="checkbox" value="1" defaultChecked={checked} disabled={field.disabled} />
            </label>
          );
        }

        return (
          <label key={field.name} className={`filter-field ${field.disabled ? "filter-field-disabled" : ""}`}>
            <span>{field.label}</span>
            {field.type === "text" ? (
              <input name={field.name} defaultValue={field.value} placeholder={field.placeholder} disabled={field.disabled} />
            ) : (
              <select name={field.name} defaultValue={field.value} disabled={field.disabled}>
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </label>
        );
      })}
      <button type="submit" className="filter-submit">
        更新视图
      </button>
    </form>
  );
}
