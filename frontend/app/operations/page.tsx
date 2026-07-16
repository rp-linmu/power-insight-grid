import Link from "next/link";

import FilterBar from "../../components/FilterBar";
import RecordTable from "../../components/RecordTable";
import StatCards from "../../components/StatCards";
import { getDisclosureOptions, getRecords, getRecordsPaged, TableRow } from "../../lib/api";

type OperationsPageProps = {
  searchParams?: Promise<{
    section?: string;
    tab?: string;
    date?: string;
    market?: string;
    unitlimit_search?: string;
    unitlimit_unit_search?: string;
    unitlimit_page?: string;
    maintenance_search?: string;
    trade_date?: string;
  }>;
};

type MaintenanceTabKey = "unitoutage" | "unitcapacity" | "transmission" | "execution";
type ConstraintTabKey = "mustrun" | "unitlimit" | "congestion";

const constraintTabs: ConstraintTabKey[] = ["mustrun", "unitlimit", "congestion"];
const maintenanceTabs: MaintenanceTabKey[] = ["unitoutage", "unitcapacity", "transmission", "execution"];

function extractDate(sheetName: string) {
  const match = sheetName.match(/\((\d{4}-\d{2}-\d{2})\)/);
  return match?.[1] || "";
}

function inferMarket(sheetName: string) {
  if (sheetName.includes("预测")) {
    return "预测";
  }
  if (sheetName.includes("实际")) {
    return "实际";
  }
  return "通用";
}

function uniqueDates(sheetNames: string[]) {
  return Array.from(new Set(sheetNames.map(extractDate).filter(Boolean))).sort().reverse();
}

function pickSheet(sheetNames: string[], keyword: string, date?: string, market?: string) {
  const matches = sheetNames.filter((name) => name.includes(keyword));
  const byDate = date ? matches.filter((name) => extractDate(name) === date) : matches;
  const byMarket =
    market && market !== "全部"
      ? byDate.filter((name) => {
          const inferred = inferMarket(name);
          return inferred === "通用" || inferred === market;
        })
      : byDate;
  return byMarket.sort()[byMarket.length - 1] || byDate.sort()[byDate.length - 1] || matches.sort()[matches.length - 1] || "";
}

function toNumber(value?: string) {
  if (!value) {
    return 0;
  }
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function sumColumn(rows: TableRow[], column: string) {
  return rows.reduce((sum, row) => sum + toNumber(row.payload[column]), 0);
}

function sumMatchingColumns(rows: TableRow[], matcher: (column: string) => boolean) {
  return rows.reduce(
    (sum, row) =>
      sum +
      Object.entries(row.payload).reduce((inner, [column, value]) => inner + (matcher(column) ? toNumber(value) : 0), 0),
    0
  );
}

function formatMw(value: number) {
  return `${Math.round(value).toLocaleString("zh-CN")} MW`;
}

function buildQuery(base: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  Object.entries(base).forEach(([key, value]) => {
    if (value) {
      query.set(key, value);
    }
  });
  return query.toString();
}

function findColumn(rows: TableRow[], candidates: string[]) {
  const columns = Object.keys(rows[0]?.payload || {});
  return candidates.find((candidate) => columns.includes(candidate));
}

function filterRowsByKeyword(rows: TableRow[], keyword: string, candidates: string[]) {
  if (!keyword) {
    return rows;
  }
  const lowered = keyword.toLowerCase();
  const matchedColumns = candidates.filter((candidate) => rows.some((row) => candidate in row.payload));

  if (matchedColumns.length) {
    return rows.filter((row) =>
      matchedColumns.some((column) => String(row.payload[column] || "").toLowerCase().includes(lowered))
    );
  }

  return rows.filter((row) => Object.values(row.payload).join("").toLowerCase().includes(lowered));
}

function getMaintenanceMeta(
  tab: MaintenanceTabKey,
  datasets: {
    unitOutage: TableRow[];
    unitOutageCapacity: TableRow[];
    transmissionOutage: TableRow[];
    transmissionExecution: TableRow[];
  },
  sheets: {
    unitOutageSheet: string;
    unitOutageCapacitySheet: string;
    transmissionOutageSheet: string;
    transmissionExecutionSheet: string;
  },
  search: string
) {
  const configs: Record<
    MaintenanceTabKey,
    {
      title: string;
      emptyText: string;
      sheet: string;
      rows: TableRow[];
      placeholder: string;
      searchFields: string[];
    }
  > = {
    unitoutage: {
      title: "机组检修预测信息",
      emptyText: "暂无机组检修预测信息",
      sheet: sheets.unitOutageSheet,
      rows: datasets.unitOutage,
      placeholder: "搜索机组名称",
      searchFields: ["机组名称", "机组", "机组编号", "电厂名称", "厂站名称"],
    },
    unitcapacity: {
      title: "机组检修容量预测信息",
      emptyText: "暂无机组检修容量预测信息",
      sheet: sheets.unitOutageCapacitySheet,
      rows: datasets.unitOutageCapacity,
      placeholder: "搜索机组名称",
      searchFields: ["机组名称", "机组", "机组编号", "电厂名称", "厂站名称"],
    },
    transmission: {
      title: "输变电检修预测信息",
      emptyText: "暂无输变电检修预测信息",
      sheet: sheets.transmissionOutageSheet,
      rows: datasets.transmissionOutage,
      placeholder: "搜索设备名称",
      searchFields: ["设备名称", "设备", "线路名称", "间隔名称", "设备对象", "厂站名称"],
    },
    execution: {
      title: "输变电设备检修计划执行情况",
      emptyText: "暂无输变电检修执行情况",
      sheet: sheets.transmissionExecutionSheet,
      rows: datasets.transmissionExecution,
      placeholder: "搜索设备名称",
      searchFields: ["设备名称", "设备", "线路名称", "间隔名称", "设备对象", "厂站名称"],
    },
  };

  const config = configs[tab];
  const filteredRows = filterRowsByKeyword(config.rows, search, config.searchFields);
  const matchedField = findColumn(config.rows, config.searchFields);

  return {
    ...config,
    filteredRows,
    matchedField,
  };
}

export default async function OperationsPage({ searchParams }: OperationsPageProps) {
  const params = (await searchParams) || {};
  const section = params.section || "constraints";
  const activeConstraintTab: ConstraintTabKey = constraintTabs.includes((params.tab || "") as ConstraintTabKey)
    ? ((params.tab || "mustrun") as ConstraintTabKey)
    : "mustrun";
  const activeMaintenanceTab: MaintenanceTabKey = maintenanceTabs.includes((params.tab || "") as MaintenanceTabKey)
    ? ((params.tab || "unitoutage") as MaintenanceTabKey)
    : "unitoutage";
  const market = params.market || "全部";
  const unitLimitSearch = params.unitlimit_search || "";
  const unitLimitUnitSearch = params.unitlimit_unit_search || "";
  const unitLimitPage = Number(params.unitlimit_page || "1") || 1;
  const maintenanceSearch = params.maintenance_search || "";

  const options = await getDisclosureOptions();
  const sheetNames = options.record_sheets;
  const dateOptions = uniqueDates(sheetNames);
  const selectedDate = params.trade_date || params.date || dateOptions[0] || "";

  const mustRunForecastSheet = pickSheet(sheetNames, "必开必停容量预测信息", selectedDate, market);
  const mustRunActualSheet = pickSheet(sheetNames, "必开必停容量实际信息", selectedDate, market);
  const unitLimitSheet = pickSheet(sheetNames, "机组出力受限情况", selectedDate, market);
  const congestionSheet = pickSheet(sheetNames, "阻塞预测信息", selectedDate, market);
  const unitOutageSheet = pickSheet(sheetNames, "机组检修预测信息", selectedDate, market);
  const unitOutageCapacitySheet = pickSheet(sheetNames, "机组检修容量预测信息", selectedDate, market);
  const transmissionOutageSheet = pickSheet(sheetNames, "输变电检修预测信息", selectedDate, market);
  const transmissionExecutionSheet = pickSheet(sheetNames, "输变电设备检修计划执行情况", selectedDate, market);

  const [
    mustRunForecast,
    mustRunActual,
    unitLimitResult,
    congestion,
    unitOutage,
    unitOutageCapacity,
    transmissionOutage,
    transmissionExecution,
  ] = await Promise.all([
    mustRunForecastSheet ? getRecords(mustRunForecastSheet) : Promise.resolve([]),
    mustRunActualSheet ? getRecords(mustRunActualSheet) : Promise.resolve([]),
    unitLimitSheet
      ? getRecordsPaged(
          unitLimitSheet,
          unitLimitPage,
          20,
          "电厂名称",
          unitLimitSearch || undefined,
          "机组名称",
          unitLimitUnitSearch || undefined
        )
      : Promise.resolve({ rows: [], total: 0, page: 1, page_size: 20 }),
    congestionSheet ? getRecords(congestionSheet) : Promise.resolve([]),
    unitOutageSheet ? getRecords(unitOutageSheet) : Promise.resolve([]),
    unitOutageCapacitySheet ? getRecords(unitOutageCapacitySheet) : Promise.resolve([]),
    transmissionOutageSheet ? getRecords(transmissionOutageSheet) : Promise.resolve([]),
    transmissionExecutionSheet ? getRecords(transmissionExecutionSheet) : Promise.resolve([]),
  ]);

  const mustRunForecastValue = sumColumn(mustRunForecast, "必开机组容量(MW)");
  const mustStopForecastValue = sumColumn(mustRunForecast, "必停机组容量(MW)");
  const limitedRatedValue = sumColumn(unitLimitResult.rows, "额定出力(MW)");
  const limitedMinValue = sumColumn(unitLimitResult.rows, "最小技术出力(MW)");
  const unitCapacityTotal = sumMatchingColumns(unitOutageCapacity, (column) => column.includes("容量"));
  const transmissionTaskTotal = transmissionOutage.length + transmissionExecution.length;

  const sectionQuery = {
    date: selectedDate,
    market,
    unitlimit_search: unitLimitSearch || undefined,
    unitlimit_unit_search: unitLimitUnitSearch || undefined,
    unitlimit_page: unitLimitSearch || unitLimitUnitSearch ? "1" : String(unitLimitPage),
    maintenance_search: maintenanceSearch || undefined,
  };

  const maintenanceTimelineDates = dateOptions.slice().reverse();
  const timelineRows = [
    { label: "机组检修", keyword: "机组检修预测信息" },
    { label: "检修容量", keyword: "机组检修容量预测信息" },
    { label: "输变电检修", keyword: "输变电检修预测信息" },
    { label: "执行情况", keyword: "输变电设备检修计划执行情况" },
  ];
  const timelineStyle = {
    gridTemplateColumns: `120px repeat(${Math.max(maintenanceTimelineDates.length, 1)}, minmax(74px, 1fr))`,
  };

  const maintenanceMeta =
    section === "maintenance"
      ? getMaintenanceMeta(
          activeMaintenanceTab,
          {
            unitOutage,
            unitOutageCapacity,
            transmissionOutage,
            transmissionExecution,
          },
          {
            unitOutageSheet,
            unitOutageCapacitySheet,
            transmissionOutageSheet,
            transmissionExecutionSheet,
          },
          maintenanceSearch
        )
      : null;

  return (
    <section className="section">
      <div className="section-head">
        <div>
          <h2>运行与检修</h2>
          <p>集中查看运行约束与检修计划。</p>
        </div>
      </div>

      <article className="panel section-card compact-section">
        <div className="tab-strip">
          {[
            { key: "constraints", label: "运行约束" },
            { key: "maintenance", label: "检修计划" },
          ].map((item) => (
            <Link
              key={item.key}
              href={`/operations?${buildQuery({
                date: selectedDate,
                market,
                section: item.key,
                tab:
                  item.key === "constraints"
                    ? activeConstraintTab
                    : activeMaintenanceTab,
                unitlimit_search: item.key === "constraints" ? unitLimitSearch || undefined : undefined,
                unitlimit_unit_search: item.key === "constraints" ? unitLimitUnitSearch || undefined : undefined,
                unitlimit_page: item.key === "constraints" ? String(unitLimitPage) : undefined,
                maintenance_search: item.key === "maintenance" ? maintenanceSearch || undefined : undefined,
              })}`}
              className={`tab-chip ${section === item.key ? "tab-chip-active" : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <FilterBar
          fields={[
            {
              name: "date",
              label: "业务日期",
              value: selectedDate,
              options: dateOptions.map((item) => ({ label: item, value: item })),
            },
            {
              name: "market",
              label: "口径",
              value: market,
              options: [
                { label: "全部", value: "全部" },
                { label: "预测", value: "预测" },
                { label: "实际", value: "实际" },
              ],
            },
          ]}
        />
      </article>

      {section === "constraints" ? (
        <>
          <StatCards
            items={[
              {
                title: "受限机组数",
                value: String(unitLimitResult.total),
                detail: unitLimitSheet || "暂无机组出力受限数据",
              },
              {
                title: "受限额定出力",
                value: formatMw(limitedRatedValue),
                detail: `最小技术出力合计 ${formatMw(limitedMinValue)}`,
              },
              {
                title: "预测必开容量",
                value: formatMw(mustRunForecastValue),
                detail: mustRunForecastSheet || "暂无预测必开必停数据",
              },
              {
                title: "预测必停容量",
                value: formatMw(mustStopForecastValue),
                detail: congestionSheet ? `${congestion.length} 条阻塞记录` : "暂无阻塞预测数据",
              },
            ]}
          />

          <article className="panel section-card compact-section">
            <div className="tab-strip">
              {[
                { key: "mustrun", label: "必开必停容量对照" },
                { key: "unitlimit", label: "机组出力受限情况" },
                { key: "congestion", label: "阻塞预测信息" },
              ].map((tab) => (
                <Link
                  key={tab.key}
                  href={`/operations?${buildQuery({ ...sectionQuery, section: "constraints", tab: tab.key })}`}
                  className={`tab-chip ${activeConstraintTab === tab.key ? "tab-chip-active" : ""}`}
                >
                  {tab.label}
                </Link>
              ))}
            </div>

            {activeConstraintTab === "mustrun" ? (
              <>
                <h3>必开必停容量对照</h3>
                <div className="pill-row">
                  {mustRunForecastSheet ? <span className="pill">{mustRunForecastSheet}</span> : null}
                  {mustRunActualSheet ? <span className="pill">{mustRunActualSheet}</span> : null}
                </div>
                <div className="three-col compact-cards">
                  <article className="mini-summary-card">
                    <span>预测必开</span>
                    <strong>{formatMw(mustRunForecastValue)}</strong>
                  </article>
                  <article className="mini-summary-card">
                    <span>预测必停</span>
                    <strong>{formatMw(mustStopForecastValue)}</strong>
                  </article>
                  <article className="mini-summary-card">
                    <span>实际必开</span>
                    <strong>{formatMw(sumColumn(mustRunActual, "必开机组容量(MW)"))}</strong>
                  </article>
                </div>
                <RecordTable rows={[...mustRunForecast, ...mustRunActual]} emptyText="暂无必开必停容量数据" />
              </>
            ) : null}

            {activeConstraintTab === "unitlimit" ? (
              <>
                <div className="section-head section-head-tight">
                  <div>
                    <h3>机组出力受限情况</h3>
                  </div>
                  <form className="inline-search" action="/operations">
                    <input type="hidden" name="section" value="constraints" />
                    <input type="hidden" name="tab" value="unitlimit" />
                    <input type="hidden" name="date" value={selectedDate} />
                    <input type="hidden" name="market" value={market} />
                    <input type="text" name="unitlimit_search" defaultValue={unitLimitSearch} placeholder="搜索电厂名称" />
                    <input
                      type="text"
                      name="unitlimit_unit_search"
                      defaultValue={unitLimitUnitSearch}
                      placeholder="搜索机组名称"
                    />
                    <button type="submit" className="filter-submit">
                      搜索
                    </button>
                  </form>
                </div>
                <div className="pill-row">
                  {unitLimitSheet ? <span className="pill">{unitLimitSheet}</span> : null}
                  <span className="pill">共 {unitLimitResult.total} 条</span>
                  {unitLimitSearch ? <span className="pill">电厂：{unitLimitSearch}</span> : null}
                  {unitLimitUnitSearch ? <span className="pill">机组：{unitLimitUnitSearch}</span> : null}
                </div>
                <RecordTable rows={unitLimitResult.rows} emptyText="暂无机组受限数据" />
                <div className="pager">
                  {Array.from({ length: Math.max(Math.ceil(unitLimitResult.total / unitLimitResult.page_size), 1) }).map((_, index) => {
                    const page = index + 1;
                    return (
                      <Link
                        key={page}
                        href={`/operations?${buildQuery({
                          ...sectionQuery,
                          section: "constraints",
                          tab: "unitlimit",
                          unitlimit_page: String(page),
                        })}`}
                        className={`pager-chip ${unitLimitPage === page ? "pager-chip-active" : ""}`}
                      >
                        {page}
                      </Link>
                    );
                  })}
                </div>
              </>
            ) : null}

            {activeConstraintTab === "congestion" ? (
              <>
                <h3>阻塞预测信息</h3>
                <div className="pill-row">{congestionSheet ? <span className="pill">{congestionSheet}</span> : null}</div>
                <RecordTable rows={congestion} emptyText="暂无阻塞预测信息" />
              </>
            ) : null}
          </article>
        </>
      ) : (
        <>
          <StatCards
            items={[
              {
                title: "机组检修记录",
                value: String(unitOutage.length),
                detail: unitOutageSheet || "暂无机组检修预测信息",
              },
              {
                title: "检修容量合计",
                value: formatMw(unitCapacityTotal),
                detail: unitOutageCapacitySheet || "暂无机组检修容量数据",
              },
              {
                title: "输变电检修记录",
                value: String(transmissionOutage.length),
                detail: transmissionOutageSheet || "暂无输变电检修预测信息",
              },
              {
                title: "计划执行记录",
                value: String(transmissionTaskTotal),
                detail: transmissionExecutionSheet || "暂无执行跟踪数据",
              },
            ]}
          />

          <article className="panel section-card compact-section">
            <h3>检修时间轴总览</h3>
            <div className="timeline-board">
              <div className="timeline-header" style={timelineStyle}>
                <div className="timeline-corner">类别</div>
                {maintenanceTimelineDates.map((date) => (
                  <div key={date} className={`timeline-date ${date === selectedDate ? "timeline-date-active" : ""}`}>
                    {date.slice(5)}
                  </div>
                ))}
              </div>
              {timelineRows.map((row) => (
                <div key={row.label} className="timeline-row" style={timelineStyle}>
                  <div className="timeline-label">{row.label}</div>
                  {maintenanceTimelineDates.map((date) => {
                    const hasItem = sheetNames.some((sheet) => sheet.includes(row.keyword) && extractDate(sheet) === date);
                    return (
                      <div
                        key={`${row.label}-${date}`}
                        className={`timeline-cell ${hasItem ? "timeline-cell-active" : ""} ${
                          date === selectedDate ? "timeline-cell-selected" : ""
                        }`}
                      >
                        {hasItem ? "计划" : "-"}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </article>

          <article className="panel section-card compact-section">
            <div className="tab-strip">
              {[
                { key: "unitoutage", label: "机组检修预测信息" },
                { key: "unitcapacity", label: "机组检修容量预测信息" },
                { key: "transmission", label: "输变电检修预测信息" },
                { key: "execution", label: "检修计划执行情况" },
              ].map((tab) => (
                <Link
                  key={tab.key}
                  href={`/operations?${buildQuery({
                    date: selectedDate,
                    market,
                    section: "maintenance",
                    tab: tab.key,
                    maintenance_search: maintenanceSearch || undefined,
                  })}`}
                  className={`tab-chip ${activeMaintenanceTab === tab.key ? "tab-chip-active" : ""}`}
                >
                  {tab.label}
                </Link>
              ))}
            </div>

            <form className="inline-search inline-search-tight" action="/operations">
              <input type="hidden" name="section" value="maintenance" />
              <input type="hidden" name="tab" value={activeMaintenanceTab} />
              <input type="hidden" name="date" value={selectedDate} />
              <input type="hidden" name="market" value={market} />
              <input
                type="text"
                name="maintenance_search"
                defaultValue={maintenanceSearch}
                placeholder={maintenanceMeta?.placeholder || "搜索关键字"}
              />
              <button type="submit" className="filter-submit">
                搜索
              </button>
            </form>

            <h3>{maintenanceMeta?.title || "检修计划"}</h3>
            <div className="pill-row">
              {maintenanceMeta?.sheet ? <span className="pill">{maintenanceMeta.sheet}</span> : null}
              {maintenanceSearch ? <span className="pill">搜索：{maintenanceSearch}</span> : null}
              {maintenanceSearch && maintenanceMeta?.matchedField ? (
                <span className="pill">字段：{maintenanceMeta.matchedField}</span>
              ) : null}
              <span className="pill">共 {maintenanceMeta?.filteredRows.length || 0} 条</span>
            </div>
            <RecordTable rows={maintenanceMeta?.filteredRows || []} emptyText={maintenanceMeta?.emptyText || "暂无检修数据"} />
          </article>
        </>
      )}
    </section>
  );
}
