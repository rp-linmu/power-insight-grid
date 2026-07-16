import FilterBar from "../../components/FilterBar";
import StatCards from "../../components/StatCards";
import TopologyNetworkViewer from "../../components/TopologyNetworkViewer";
import TopologyTimeSlider from "../../components/TopologyTimeSlider";
import { getTopologyResult, getTopologyStatus } from "../../lib/api";

type TopologyPageProps = {
  searchParams?: Promise<{
    market?: string;
    date?: string;
    time?: string;
    trade_date?: string;
  }>;
};

function formatNumber(value: number | null | undefined, digits = 2) {
  return value == null ? "-" : value.toFixed(digits);
}

function selectedDateFrom(options: string[], requested?: string) {
  if (requested && options.includes(requested)) return requested;
  return options[0] || requested || "";
}

export default async function TopologyPage({ searchParams }: TopologyPageProps) {
  const params = (await searchParams) || {};
  const market = params.market === "日前" ? "日前" : "实时";
  const status = await getTopologyStatus();
  const dates = market === "日前" ? status.day_ahead_dates : status.real_time_dates;
  const selectedDate = selectedDateFrom(dates, params.trade_date || params.date);
  const selectedTime = params.time && params.time !== "all" ? params.time : "";
  const result = selectedDate ? await getTopologyResult(selectedDate, market, selectedTime || undefined) : null;
  const summary = result?.summary || {};
  const ranking = result?.ranking || [];
  const causes = result?.causes || [];
  const availableTimes = result?.available_times || [];
  const sectionOverview = result?.section_overview;
  const sectionModeLabel = sectionOverview?.mode === "point" ? `${sectionOverview.point_time || selectedTime} 时点` : "全天峰值";

  return (
    <section className="section topology-page">
      <div className="section-head">
        <div>
          <h2>网络拓扑阻塞识别</h2>
          <p>基于网架线路关系和节点电价，识别线路两端价格分化与阻塞强度。</p>
        </div>
      </div>

      <article className="panel section-card compact-section">
        <FilterBar
          fields={[
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
              options: dates.map((item) => ({ label: item, value: item })),
              disabled: !dates.length,
            },
          ]}
        />
        {availableTimes.length ? <TopologyTimeSlider times={availableTimes} selectedTime={selectedTime} /> : null}
        {!status.ok ? <p className="muted filter-note">尚未导入网架模型，导入后可生成线路价差与拓扑图。</p> : null}
        {status.ok && !dates.length ? (
          <p className="muted filter-note">当前没有可用于{market}拓扑分析的节点电价日期。</p>
        ) : null}
        {result && !result.ok ? <p className="muted filter-note">{result.message}</p> : null}
      </article>

      <StatCards
        items={[
          { title: "网架节点", value: String(status.nodes), detail: "节点表" },
          { title: "网架线路", value: String(status.lines), detail: "线路表" },
          {
            title: "节点匹配率",
            value: summary.match_rate == null ? "-" : `${summary.match_rate}%`,
            detail: `${summary.matched_node_count || 0}/${summary.total_node_count || status.nodes}`,
          },
          {
            title: "峰值价差",
            value: `${formatNumber(summary.max_abs_spread)} 元/MWh`,
            detail: selectedTime ? `${selectedTime} 分时快照` : summary.peak_time || `${market} ${selectedDate}`,
            tone: summary.max_abs_spread ? "up" : "flat",
          },
        ]}
      />

      <div className="topology-layout">
        <article className="panel section-card topology-network-card">
          <div className="section-head section-head-tight">
            <div>
              <h3>{market}价格侧阻塞拓扑</h3>
              <p className="muted">
                {selectedTime
                  ? "按所选时点展示线路两端价差，红色线路表示该时点超过阻塞阈值。"
                  : "红色线路为当日峰值价差超过阈值的线路，节点颜色表示是否匹配到节点电价。"}
              </p>
            </div>
            <span className="pill">{selectedTime || "全天"} / 阈值 {formatNumber(result?.network?.threshold)} 元/MWh</span>
          </div>
          <TopologyNetworkViewer nodes={result?.network?.nodes || []} edges={result?.network?.edges || []} />
        </article>

        <article className="panel section-card compact-section">
          <div className="section-head section-head-tight">
            <div>
              <h3>{selectedTime ? "分时阻塞线路排名" : "阻塞线路排名"}</h3>
              <p className="muted">
                {selectedTime ? "按所选时点线路两端绝对价差排序。" : "按全日 96 点线路两端绝对价差累计值排序。"}
              </p>
            </div>
            <span className="pill">
              {market} {selectedDate} {selectedTime || "全天"}
            </span>
          </div>
          <div className="topology-ranking">
            {ranking.length ? (
              ranking.slice(0, 20).map((row, index) => (
                <div className="topology-ranking-row" key={`${row.line_name}-${row.node_start}-${row.node_end}`}>
                  <strong>{String(index + 1).padStart(2, "0")}</strong>
                  <span>
                    <b>{row.line_name}</b>
                    <small>
                      {row.node_start} 至 {row.node_end} / {selectedTime ? `时点 ${row.point_time || selectedTime}` : `峰值 ${row.peak_time || "-"}`}
                    </small>
                  </span>
                  <em>{formatNumber(selectedTime ? row.abs_spread : row.sum_abs_spread, 0)}</em>
                </div>
              ))
            ) : (
              <p className="muted">暂无拓扑阻塞排名。</p>
            )}
          </div>
        </article>
      </div>

      <article className="panel section-card compact-section">
        <div className="section-head section-head-tight">
          <div>
            <h3>实时基本面断面</h3>
            <p className="muted">展示实时基本面中的“实时出清断面”和“实际断面”，用于校验价格侧阻塞是否由断面约束触发并被实际运行验证。</p>
          </div>
          <span className="pill">{sectionModeLabel || "暂无断面"}</span>
        </div>
        <div className="topology-section-grid">
          <div className="topology-section-list">
            <div className="topology-section-list-head">
              <strong>实时出清断面</strong>
              <span>原因侧</span>
            </div>
            {sectionOverview?.realtime_clearing?.length ? (
              sectionOverview.realtime_clearing.map((item) => (
                <div className="topology-section-row" key={`clearing-${item.section_name}-${item.point_time}`}>
                  <span>
                    <b>{item.section_name}</b>
                    <small>{item.point_time || "-"} / {item.data_topic || "实时出清断面"}</small>
                  </span>
                  <em className={`section-level-${item.level}`}>
                    {formatNumber(item.value, 2)} {item.level_label}
                  </em>
                </div>
              ))
            ) : (
              <p className="muted">当前日期暂无实时出清断面数据。</p>
            )}
          </div>
          <div className="topology-section-list">
            <div className="topology-section-list-head">
              <strong>实际断面</strong>
              <span>结果侧</span>
            </div>
            {sectionOverview?.actual?.length ? (
              sectionOverview.actual.map((item) => (
                <div className="topology-section-row" key={`actual-${item.section_name}-${item.point_time}`}>
                  <span>
                    <b>{item.section_name}</b>
                    <small>{item.point_time || "-"} / {item.data_topic || "实际断面"}</small>
                  </span>
                  <em className={`section-level-${item.level}`}>
                    {formatNumber(item.value, 2)} {item.level_label}
                  </em>
                </div>
              ))
            ) : (
              <p className="muted">当前日期暂无实际断面数据。</p>
            )}
          </div>
        </div>
      </article>

      <article className="panel section-card compact-section">
        <div className="section-head section-head-tight">
          <div>
            <h3>阻塞原因研判</h3>
            <p className="muted">基于当前数据库中的阻塞披露、输变电检修、线路停运、断面和基本面信号生成规则化证据。</p>
          </div>
          <span className="pill">{selectedTime || "全天峰值"} / {market}</span>
        </div>
        <div className="topology-cause-grid">
          {causes.length ? (
            causes.map((item) => (
              <article className="topology-cause-card" key={`${item.line_name}-${item.point_time || "all"}`}>
                <div className="topology-cause-head">
                  <div>
                    <h4>{item.line_name}</h4>
                    <p>
                      {item.node_start} 至 {item.node_end} / {item.point_time || "-"}
                    </p>
                  </div>
                  <span className={`topology-cause-level level-${item.level}`}>
                    {item.level_label} {item.score}
                  </span>
                </div>
                <p className="topology-cause-summary">{item.summary}</p>
                <div className="topology-evidence-list">
                  {item.evidence.length ? (
                    item.evidence.map((evidence, index) => (
                      <div className="topology-evidence-row" key={`${item.line_name}-${index}`}>
                        <strong>{evidence.title}</strong>
                        <span>{evidence.detail}</span>
                        <small>{evidence.source || "系统数据"} / +{evidence.score}</small>
                      </div>
                    ))
                  ) : (
                    <p className="muted">暂无直接证据。</p>
                  )}
                </div>
              </article>
            ))
          ) : (
            <p className="muted">暂无可用于原因研判的阻塞线路。</p>
          )}
        </div>
      </article>
    </section>
  );
}
