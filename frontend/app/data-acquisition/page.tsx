import CrawlerWorkspace from "../../components/CrawlerWorkspace";
import { getTradingContext } from "../../lib/api";

type DataAcquisitionPageProps = {
  searchParams?: Promise<{ trade_date?: string }>;
};

export default async function DataAcquisitionPage({ searchParams }: DataAcquisitionPageProps) {
  const params = (await searchParams) || {};
  const context = await getTradingContext(params.trade_date);
  const initialDate = params.trade_date || context.selected_date || new Date().toISOString().slice(0, 10);

  return (
    <section className="section crawler-page">
      <div className="section-head">
        <div>
          <h2>数据获取</h2>
          <p>检查交易数据完整性，按缺失清单精确补采，并将有效文件同步进入辅助决策系统。</p>
        </div>
        <span className="pill">浏览器会话 / UKey</span>
      </div>
      <CrawlerWorkspace initialDate={initialDate} />
    </section>
  );
}
