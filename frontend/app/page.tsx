import Link from "next/link";

import LineChart from "../components/LineChart";
import { getPremarketDashboard, TradingMetricSnapshot } from "../lib/api";


type HomePageProps = {
  searchParams?: Promise<{ trade_date?: string }>;
};

function formatValue(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined) {
    return "--";
  }
  return value.toLocaleString("zh-CN", { maximumFractionDigits: digits });
}

function formatDelta(item: TradingMetricSnapshot) {
  if (item.delta === null) {
    return "暂无昨日对比";
  }
  const sign = item.delta > 0 ? "+" : "";
  return `${sign}${formatValue(item.delta)} ${item.unit}`;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = (await searchParams) || {};
  const dashboard = await getPremarketDashboard(params.trade_date);
  const selectedDate = dashboard.context.selected_date || "";
  const constraints = dashboard.constraint_summary;
  const market = dashboard.market_summary;

  return (
    <main className="premarket-workspace">
      <section className="premarket-heading">
        <div>
          <span className="workspace-kicker">TRADER WORKBENCH</span>
          <h1>盘前研判</h1>
          <p>{dashboard.conclusion}</p>
        </div>
        <div className={`risk-badge risk-${dashboard.risk_level}`}>
          <span>综合风险</span>
          <strong>{dashboard.risk_label}</strong>
        </div>
      </section>

      <section className="premarket-metrics" aria-label="盘前关键指标">
        {dashboard.metrics.map((item) => (
          <article className="premarket-metric" key={item.key}>
            <span>{item.label}</span>
            <strong>
              {formatValue(item.value)}
              <small>{item.unit}</small>
            </strong>
            <div className={`metric-change change-${item.tone}`}>
              {formatDelta(item)}
              <em>{item.detail}</em>
            </div>
          </article>
        ))}
      </section>

      <section className="premarket-grid">
        <div className="workbench-panel supply-panel">
          <div className="workbench-panel-head">
            <div>
              <span>供需边界</span>
              <h2>日前关键曲线</h2>
            </div>
            <Link href={`/disclosure?primary_date=${selectedDate}&trade_date=${selectedDate}`} className="text-link">
              查看基本面
            </Link>
          </div>
          <LineChart
            title=""
            unit="MW"
            showDeviation={false}
            series={[
              { label: "统调负荷", color: "#185c9d", points: dashboard.load_series },
              { label: "B类竞价空间", color: "#14866d", points: dashboard.b_space_series },
              { label: "新能源预测", color: "#d08a16", points: dashboard.renewable_series },
            ]}
          />
        </div>

        <aside className="workbench-panel risk-panel">
          <div className="workbench-panel-head">
            <div>
              <span>风险清单</span>
              <h2>盘前重点关注</h2>
            </div>
            <Link href={`/operations?section=constraints&date=${selectedDate}&trade_date=${selectedDate}`} className="text-link">
              查看约束
            </Link>
          </div>
          <div className="risk-list">
            {dashboard.risks.length ? (
              dashboard.risks.map((risk, index) => (
                <article className={`risk-item risk-item-${risk.level}`} key={`${risk.title}-${index}`}>
                  <div>
                    <span>{risk.source}</span>
                    <strong>{risk.title}</strong>
                  </div>
                  <p>{risk.detail}</p>
                </article>
              ))
            ) : (
              <div className="empty-state">当前未识别到需单列提示的风险项。</div>
            )}
          </div>
        </aside>
      </section>

      <section className="premarket-lower-grid">
        <div className="workbench-panel">
          <div className="workbench-panel-head">
            <div>
              <span>关键时点</span>
              <h2>日内执行窗口</h2>
            </div>
          </div>
          <div className="moment-grid">
            {dashboard.moments.map((moment) => (
              <article className="moment-item" key={moment.label}>
                <span>{moment.label}</span>
                <strong>{moment.time || "--"}</strong>
                <b>{formatValue(moment.value)} {moment.unit}</b>
                <p>{moment.detail}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="workbench-panel">
          <div className="workbench-panel-head">
            <div>
              <span>运行边界</span>
              <h2>约束与检修</h2>
            </div>
          </div>
          <div className="constraint-grid">
            <div><span>阻塞预测</span><strong>{formatValue(constraints.congestion_count)} 条</strong></div>
            <div><span>受限机组</span><strong>{formatValue(constraints.unit_limit_count)} 台</strong></div>
            <div><span>检修容量</span><strong>{formatValue(constraints.maintenance_mw)} MW</strong></div>
            <div><span>必开容量</span><strong>{formatValue(constraints.must_open_mw)} MW</strong></div>
          </div>
        </div>

        <div className="workbench-panel">
          <div className="workbench-panel-head">
            <div>
              <span>市场快照</span>
              <h2>日前出清</h2>
            </div>
            <Link href={`/clearing?date=${selectedDate}&trade_date=${selectedDate}`} className="text-link">
              查看出清
            </Link>
          </div>
          <div className="market-snapshot">
            <div>
              <span>申报均价</span>
              <strong>{formatValue(market.day_ahead_offer_price, 2)}</strong>
              <small>元/MWh</small>
            </div>
            <div>
              <span>出清均价</span>
              <strong>{formatValue(market.day_ahead_clearing_price, 2)}</strong>
              <small>元/MWh</small>
            </div>
            <div>
              <span>出清电量</span>
              <strong>{formatValue(market.day_ahead_clearing_energy)}</strong>
              <small>MWh</small>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
