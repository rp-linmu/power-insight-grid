import StatCards from "../../components/StatCards";
import {
  getCrawlerBridgeStatus,
  getImportStats,
  getImportTargets,
  getImportsPreviewFiltered,
  getImportVersionBoard,
} from "../../lib/api";

type ImportsPageProps = {
  searchParams?: Promise<{
    category?: string;
    mismatch?: string;
    effective_date?: string;
  }>;
};

const categoryOptions = [
  { label: "全部分类", value: "" },
  { label: "信息披露", value: "disclosure" },
  { label: "出清数据", value: "clearing" },
  { label: "政策文件", value: "policy" },
];

export default async function ImportsPage({ searchParams }: ImportsPageProps) {
  const params = (await searchParams) || {};
  const category = params.category || "";
  const mismatchOnly = params.mismatch === "true";
  const effectiveDate = params.effective_date || "";
  const returnTo = `/imports?effective_date=${encodeURIComponent(effectiveDate)}&category=${encodeURIComponent(category)}&mismatch=${
    mismatchOnly ? "true" : "false"
  }`;

  const [preview, stats, targets, versionBoard, crawlerBridge] = await Promise.all([
    getImportsPreviewFiltered(category || undefined, mismatchOnly, 120, effectiveDate || undefined),
    getImportStats(),
    getImportTargets(),
    getImportVersionBoard(effectiveDate || undefined),
    getCrawlerBridgeStatus(),
  ]);

  const categoryDetail = Object.entries(stats.categories)
    .map(([key, value]) => `${key} ${value} 批`)
    .join(" / ");

  return (
    <section className="section">
      <div className="section-head">
        <div>
          <h2>导入管理</h2>
          <p>支持按页面导入文件、维护版本和删除历史版本。</p>
        </div>
        <div className="imports-head-actions">
          <form method="post" action="/api/imports/crawler-bridge/sync">
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="effective_date" value={effectiveDate} />
            <button type="submit" className="filter-submit">
              同步爬虫数据
            </button>
          </form>
        </div>
      </div>

      <StatCards
        items={[
          { title: "导入总批次", value: String(stats.total_batches), detail: "已登记到导入批次表" },
          { title: "日期不一致批次", value: String(stats.mismatch_batches), detail: "外部文件名日期与 sheet 日期不一致" },
          { title: "页面导入位", value: String(targets.length), detail: "已配置到各模块页面的导入目录" },
          { title: "分类分布", value: String(Object.keys(stats.categories).length), detail: categoryDetail || "暂无分类统计" },
        ]}
      />

      <article className="panel section-card compact-section">
        <form className="imports-filter-form" method="get" action="/imports">
          <label className="filter-field">
            <span>数据日期</span>
            <input type="date" name="effective_date" defaultValue={effectiveDate} />
          </label>
          <label className="filter-field">
            <span>分类</span>
            <select name="category" defaultValue={category}>
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            <span>日期校验</span>
            <select name="mismatch" defaultValue={mismatchOnly ? "true" : "false"}>
              <option value="false">全部批次</option>
              <option value="true">仅看日期不一致</option>
            </select>
          </label>
          <button type="submit" className="filter-submit">
            更新视图
          </button>
        </form>
      </article>

      <article className="panel section-card compact-section">
        <div className="section-head section-head-tight">
          <div>
            <h3>爬虫数据适配</h3>
            <p>{crawlerBridge.message}</p>
          </div>
          <span className="pill">{crawlerBridge.latest_date || "暂无日期"}</span>
        </div>
        <div className="import-target-grid">
          <div className="import-target-card">
            <div className="import-target-head">
              <strong>源目录</strong>
              <span>{crawlerBridge.ok ? "可读取" : "未就绪"}</span>
            </div>
            <p className="muted">{crawlerBridge.source_dir || "未配置"}</p>
          </div>
          <div className="import-target-card">
            <div className="import-target-head">
              <strong>待同步</strong>
              <span>{crawlerBridge.checked_at || "-"}</span>
            </div>
            <div className="pill-row">
              <span className="pill">总文件 {crawlerBridge.total_files}</span>
              <span className="pill">待同步 {crawlerBridge.pending_files}</span>
              <span className="pill">跳过 {crawlerBridge.skipped_files}</span>
            </div>
          </div>
        </div>
        {crawlerBridge.preview_files.length ? (
          <div className="table-chip-list">
            {crawlerBridge.preview_files.map((file) => (
              <span key={file} className="table-chip">
                {file}
              </span>
            ))}
          </div>
        ) : (
          <p className="muted">当前没有待同步文件预览。</p>
        )}
      </article>

      <article className="panel section-card compact-section">
        <div className="section-head section-head-tight">
          <div>
            <h3>新建版本</h3>
          </div>
          <span className="pill">先建版本，再上传文件</span>
        </div>
        <form className="imports-create-form" method="post" action="/api/imports/versions">
          <input type="hidden" name="returnTo" value={returnTo} />
          <label className="filter-field">
            <span>页面</span>
            <select name="page_key" defaultValue={targets[0]?.page_key || ""}>
              {targets.map((target) => (
                <option key={target.page_key} value={target.page_key}>
                  {target.module_name} / {target.page_name}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            <span>数据日期</span>
            <input type="date" name="effective_date" defaultValue={effectiveDate} required />
          </label>
          <label className="filter-field">
            <span>版本标签</span>
            <input type="text" name="version_tag" defaultValue="当前版本" />
          </label>
          <label className="filter-field">
            <span>上传人</span>
            <input type="text" name="owner" defaultValue="系统导入" />
          </label>
          <button type="submit" className="filter-submit">
            新增版本
          </button>
        </form>
      </article>

      <article className="panel section-card compact-section">
        <div className="section-head section-head-tight">
          <div>
            <h3>页面导入位配置</h3>
          </div>
          <span className="pill">按页面绑定目录</span>
        </div>
        <div className="import-target-grid">
          {targets.map((target) => (
            <article key={target.page_key} className="import-target-card">
              <div className="import-target-head">
                <strong>{target.page_name}</strong>
                <span>{target.module_name}</span>
              </div>
              <div className="import-target-meta">
                <span>数据类型</span>
                <strong>{target.data_type}</strong>
              </div>
              <form method="post" action={`/api/imports/targets/${target.page_key}`} className="import-target-form">
                <input type="hidden" name="returnTo" value={returnTo} />
                <label className="filter-field">
                  <span>导入目录</span>
                  <input type="text" name="folder_path" defaultValue={target.folder_path} />
                </label>
                <button type="submit" className="filter-submit">
                  保存目录
                </button>
              </form>
              <div className="pill-row">
                <span className="pill">已上传 {target.uploaded_files} 项</span>
                <span className="pill">待补 {target.missing_files} 项</span>
              </div>
              <div className="import-target-files">
                {target.expected_files.map((file) => (
                  <span key={`${target.page_key}-${file}`} className="import-file-chip">
                    {file}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </article>

      <article className="panel section-card compact-section">
        <div className="section-head section-head-tight">
          <div>
            <h3>版本管理看板</h3>
          </div>
          <span className="pill">{effectiveDate || "全部日期"}</span>
        </div>
        <div className="record-table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>模块</th>
                <th>页面</th>
                <th>数据日期</th>
                <th>数据类型</th>
                <th>版本名称</th>
                <th>版本标签</th>
                <th>上传统计</th>
                <th>已上传内容</th>
                <th>缺失内容</th>
                <th>上传人</th>
                <th>文件上传</th>
                <th>删除版本</th>
              </tr>
            </thead>
            <tbody>
              {versionBoard.rows.map((row, index) => (
                <tr key={`${row.page_name}-${row.version_name}-${index}`}>
                  <td>{row.module_name}</td>
                  <td>{row.page_name}</td>
                  <td>{row.effective_date || "-"}</td>
                  <td>{row.data_type}</td>
                  <td>{row.version_name}</td>
                  <td>
                    <span className="status-badge">{row.version_tag}</span>
                  </td>
                  <td>
                    <span className="trend-down">已上传{row.uploaded_files}项</span>
                    {" / "}
                    <span className="trend-up">未上传{row.missing_files}项</span>
                  </td>
                  <td>
                    {row.uploaded_file_names.length ? (
                      <div className="table-chip-list">
                        {row.uploaded_file_names.map((item) => (
                          <span key={`${row.version_name}-${item}`} className="table-chip table-chip-ok">
                            {item}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="muted">暂无上传文件</span>
                    )}
                  </td>
                  <td>
                    {row.missing_file_names.length ? (
                      <div className="table-chip-list">
                        {row.missing_file_names.map((item) => (
                          <span key={`${row.version_name}-missing-${item}`} className="table-chip table-chip-missing">
                            {item}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="trend-down">已齐全</span>
                    )}
                  </td>
                  <td>{row.owner}</td>
                  <td>
                    {row.id ? (
                      <form method="post" action={`/api/imports/versions/${row.id}/upload`} encType="multipart/form-data" className="inline-action-form">
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <input type="file" name="files" multiple />
                        <button type="submit" className="table-action-link">
                          上传文件
                        </button>
                      </form>
                    ) : (
                      <span className="muted">请先创建版本</span>
                    )}
                  </td>
                  <td>
                    {row.id ? (
                      <form method="post" action={`/api/imports/versions/${row.id}/delete`}>
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <button type="submit" className="table-action-link table-action-danger">
                          删除
                        </button>
                      </form>
                    ) : (
                      <span className="muted">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="panel section-card compact-section">
        <div className="section-head section-head-tight">
          <div>
            <h3>导入批次视图</h3>
          </div>
          <span className="pill">批次校验明细</span>
        </div>
        <div className="pill-row">
          {preview.notes.map((note) => (
            <span key={note} className="pill">
              {note}
            </span>
          ))}
        </div>
        <div className="record-table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>文件</th>
                <th>分类</th>
                <th>外部日期</th>
                <th>sheet 日期</th>
                <th>生效日期</th>
                <th>状态</th>
                <th>校验说明</th>
              </tr>
            </thead>
            <tbody>
              {preview.batches.map((batch) => {
                const mismatch = batch.external_date && batch.detected_sheet_date && batch.external_date !== batch.detected_sheet_date;
                return (
                  <tr key={batch.id}>
                    <td>{batch.file_name}</td>
                    <td>{batch.category}</td>
                    <td>{batch.external_date || "-"}</td>
                    <td>{batch.detected_sheet_date || "-"}</td>
                    <td>{batch.effective_date || "-"}</td>
                    <td>
                      <span className="status-badge">{mismatch ? "日期不一致" : "已校验"}</span>
                    </td>
                    <td>{batch.validation_message}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
