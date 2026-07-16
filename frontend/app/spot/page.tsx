import Link from "next/link";

const spotModules = [
  {
    title: "基本面数据",
    href: "/disclosure",
    tag: "优先展示",
    detail: "查看负荷、电源出力、新能源、备用、联络线和竞价空间等核心基本面。",
  },
  {
    title: "市场出清",
    href: "/clearing",
    tag: "优先展示",
    detail: "查看日前申报、日前与实时出清均价和出清电量。",
  },
  {
    title: "现货分时分类型出清电量",
    href: "/clearing#split-energy",
    tag: "优先展示",
    detail: "查看燃煤、燃气、风电、太阳能等类型的分时出清电量和开机结构。",
  },
  {
    title: "运行与检修",
    href: "/operations?section=constraints&tab=mustrun",
    tag: "运行支撑",
    detail: "通过页签统一查看运行约束与检修计划。",
  },
  {
    title: "节点电价",
    href: "/clearing?view=price",
    tag: "后续优化",
    detail: "保留全省与节点电价、节点高低价排行，后续继续优化交互与诊断。",
  },
];


export default function SpotPage() {
  return (
    <section className="section">
      <div className="section-head">
        <div>
          <h2>现货模块</h2>
          <p>优先展示基本面、市场出清和分时分类出清电量，电价分析作为后续优化功能。</p>
        </div>
      </div>

      <div className="module-grid">
        {spotModules.map((module) => (
          <Link key={module.title} href={module.href} className="panel module-card">
            <span className="tag">{module.tag}</span>
            <h3>{module.title}</h3>
            <p className="muted">{module.detail}</p>
            <strong className="module-link">进入模块</strong>
          </Link>
        ))}
      </div>
    </section>
  );
}
