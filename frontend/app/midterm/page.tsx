const modules: Array<{ title: string; href: string; tag: string; detail: string }> = [];


export default function MidtermPage() {
  return (
    <section className="section midterm-page">
      <div className="section-head">
        <div>
          <span className="eyebrow">中长期辅助决策</span>
          <h2>中长期模块</h2>
          <p>开源整理版已移除中长期调整和预测算法代码，可按需要接入自己的中长期模块。</p>
        </div>
      </div>

      <div className="panel section-card">
        <h3>中长期模块未启用</h3>
        <p className="muted">此开源包不包含私有中长期调整、合约曲线优化和价格预测代码。</p>
      </div>
    </section>
  );
}
