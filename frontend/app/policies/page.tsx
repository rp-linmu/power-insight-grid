import PolicyChatBox from "../../components/PolicyChatBox";
import PolicyWorkspacePanel from "../../components/PolicyWorkspacePanel";
import { getPolicies, getPolicyAnalysisStatus, getPolicyVersions, type PolicyAnalysisVersion, type PolicyDocument } from "../../lib/api";


type PoliciesPageProps = {
  searchParams?: Promise<{
    search?: string;
    policy?: string;
    save?: string;
    message?: string;
    probe?: string;
    probeMessage?: string;
  }>;
};


type RuleGroup = {
  level: string;
  description: string;
  rows: PolicyDocument[];
};


function uniqueTags(rows: PolicyDocument[]) {
  return Array.from(new Set(rows.flatMap((item) => item.impact_tags))).slice(0, 8);
}


function buildInsightText(item: PolicyDocument) {
  const parts = [item.summary, item.impact_summary];
  if (item.key_points.length > 0) {
    parts.push(`重点可继续关注：${item.key_points.slice(0, 3).join("；")}。`);
  }
  if (item.scope_summary) {
    parts.push(`适用对象方面：${item.scope_summary}`);
  }
  return parts.filter(Boolean).join(" ");
}


function readRecord(record: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    if (record[key]) {
      return record[key];
    }
  }
  return Object.values(record).filter(Boolean).join("；");
}


function classifyRuleLevel(item: PolicyDocument) {
  const text = `${item.title} ${item.issuer || ""} ${item.file_name || ""}`;
  if (text.includes("国务院") || text.includes("国家发展改革委")) {
    return {
      level: "国家政策层",
      description: "国家层面发布的政策、办法或通知，通常确定上位原则和监管方向。",
    };
  }
  if (text.includes("国家能源局") || text.includes("南方监管局")) {
    return {
      level: "区域监管层",
      description: "能源监管机构与地方主管部门联合发布，通常约束区域或省内市场执行口径。",
    };
  }
  if (text.includes("广东省能源局")) {
    return {
      level: "省级主管部门",
      description: "省级能源主管部门发布，通常承接国家要求并明确广东省内执行安排。",
    };
  }
  if (text.includes("交易中心") || text.includes("广东交易")) {
    return {
      level: "市场运营机构",
      description: "交易机构发布或配套发布，通常负责交易组织、信息发布和操作规则。",
    };
  }
  return {
    level: "市场实施规则",
    description: "交易、结算、注册、信息披露等配套实施细则，直接影响市场主体操作。",
  };
}


function groupRulesByLevel(rows: PolicyDocument[]) {
  const order = ["国家政策层", "区域监管层", "省级主管部门", "市场运营机构", "市场实施规则"];
  const groups = new Map<string, RuleGroup>();

  for (const item of rows) {
    const classification = classifyRuleLevel(item);
    const existing = groups.get(classification.level);
    if (existing) {
      existing.rows.push(item);
    } else {
      groups.set(classification.level, { ...classification, rows: [item] });
    }
  }

  return Array.from(groups.values()).sort((left, right) => order.indexOf(left.level) - order.indexOf(right.level));
}


function buildPolicyUrl(search: string, policyId: number) {
  const query = new URLSearchParams();
  if (search) {
    query.set("search", search);
  }
  query.set("policy", String(policyId));
  return `/policies?${query.toString()}`;
}


function buildReturnTo(search: string, selectedPolicyId: number | null) {
  const query = new URLSearchParams();
  if (search) {
    query.set("search", search);
  }
  if (selectedPolicyId) {
    query.set("policy", String(selectedPolicyId));
  }
  const queryText = query.toString();
  return queryText ? `/policies?${queryText}` : "/policies";
}


function analysisModeLabel(mode: string | null) {
  if (mode === "manual") {
    return "人工修正";
  }
  if (mode === "llm") {
    return "AI 解读";
  }
  return "规则解读";
}


function PolicyStructuredList({
  title,
  rows,
  primaryKeys,
  detailKeys,
}: {
  title: string;
  rows: Record<string, string>[];
  primaryKeys: string[];
  detailKeys: string[];
}) {
  if (!rows.length) {
    return null;
  }
  return (
    <div className="policy-section-box">
      <strong>{title}</strong>
      <div className="policy-point-list">
        {rows.map((row, index) => {
          const primary = readRecord(row, primaryKeys);
          const detail = readRecord(row, detailKeys);
          const evidence = row.evidence || row.basis || "";
          return (
            <div className="policy-point-item" key={`${title}-${index}`}>
              <strong>{primary || `${title}${index + 1}`}</strong>
              {detail ? <p className="muted">{detail}</p> : null}
              {evidence ? <p className="muted">依据：{evidence}</p> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}


function PolicyDetail({
  item,
  versions,
  canEdit,
  isAdmin,
  returnTo,
}: {
  item: PolicyDocument;
  versions: PolicyAnalysisVersion[];
  canEdit: boolean;
  isAdmin: boolean;
  returnTo: string;
}) {
  return (
    <article className="panel policy-card policy-detail-card">
      <div className="policy-card-head">
        <div>
          <span className="tag">{item.region || "未识别地区"}</span>
          <h3>{item.title}</h3>
          <div className="pill-row policy-action-row">
            <a className="pager-chip" href="/policies">
              返回规则清单
            </a>
            <a className="pager-chip" href={`/api/policies/${item.id}/download`}>
              下载原文
            </a>
            {canEdit ? (
              <form action={`/api/policies/${item.id}/reanalyze`} method="post">
                <input type="hidden" name="returnTo" value={returnTo} />
                <button className="pager-chip" type="submit">
                  手动触发 AI 解读
                </button>
              </form>
            ) : null}
          </div>
        </div>
        <div className="policy-meta">
          <span>{analysisModeLabel(item.analysis_mode)}</span>
          {item.analysis_model ? <span>{item.analysis_model}</span> : null}
          {item.manual_updated_at ? <span>人工修正于 {item.manual_updated_at}</span> : null}
          <span>{item.policy_date || "日期待识别"}</span>
          <span>{item.issuer || "发文机构待识别"}</span>
        </div>
      </div>

      <div className="policy-summary-block">
        <strong>摘要</strong>
        <p>{item.summary || "暂无摘要"}</p>
      </div>

      <div className="policy-insight-box">
        <strong>智能解读</strong>
        <p>{buildInsightText(item)}</p>
      </div>

      <div className="policy-layout-grid">
        <div className="policy-section-box policy-section-box-compact">
          <strong>适用范围</strong>
          <p>{item.scope_summary || "暂无适用范围说明"}</p>
        </div>
        <div className="policy-section-box policy-section-box-wide">
          <strong>交易影响</strong>
          <p>{item.impact_summary || "暂无交易影响说明"}</p>
        </div>
      </div>

      <PolicyStructuredList
        title="主体交易策略影响"
        rows={item.subject_impacts}
        primaryKeys={["subject"]}
        detailKeys={["impact", "strategy_relevance"]}
      />
      <PolicyStructuredList
        title="公式与计算口径"
        rows={item.formula_items}
        primaryKeys={["name", "formula_or_rule"]}
        detailKeys={["formula_or_rule", "applies_to", "strategy_explanation"]}
      />
      <PolicyStructuredList
        title="费用项与分摊返还"
        rows={item.fee_items}
        primaryKeys={["fee_name"]}
        detailKeys={["payer_or_receiver", "trigger_condition", "calculation_basis", "strategy_explanation"]}
      />
      <PolicyStructuredList
        title="责任主体矩阵"
        rows={item.responsibility_matrix}
        primaryKeys={["responsible_party"]}
        detailKeys={["responsibility", "trigger_condition", "consequence"]}
      />
      <PolicyStructuredList
        title="关键时间节点"
        rows={item.time_nodes}
        primaryKeys={["stage", "time_requirement"]}
        detailKeys={["subject", "time_requirement", "action_required"]}
      />
      <PolicyStructuredList
        title="策略风险点"
        rows={item.risk_points}
        primaryKeys={["subject", "risk"]}
        detailKeys={["risk", "strategy_response"]}
      />
      <PolicyStructuredList
        title="分主体行动建议"
        rows={item.action_suggestions}
        primaryKeys={["subject"]}
        detailKeys={["suggestion", "basis"]}
      />

      <div className="policy-section-box">
        <strong>解读版本记录</strong>
        {versions.length > 0 ? (
          <div className="policy-tag-list">
            {versions.map((version) => (
              <span className="table-chip table-chip-ok" key={version.id}>
                V{version.version_no} / {version.analysis_mode || "rule"} / {version.trigger_type}
              </span>
            ))}
          </div>
        ) : (
          <p className="muted">当前还没有解读版本记录。</p>
        )}
      </div>

      <div className="policy-section-box">
        <strong>核心条款</strong>
        <div className="policy-point-list">
          {item.key_points.length > 0 ? (
            item.key_points.map((point) => (
              <div className="policy-point-item" key={point}>
                {point}
              </div>
            ))
          ) : (
            <p className="muted">暂无条款提炼结果</p>
          )}
        </div>
      </div>

      {item.impact_tags.length > 0 ? (
        <div className="policy-section-box">
          <strong>影响标签</strong>
          <div className="policy-tag-list">
            {item.impact_tags.map((tag) => (
              <span className="table-chip table-chip-ok" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {item.analysis_note ? (
        <div className="policy-section-box">
          <strong>解读说明</strong>
          <div className="policy-analysis-meta">
            <div className="policy-analysis-item">
              <p>{item.analysis_note}</p>
            </div>
          </div>
        </div>
      ) : null}

      {isAdmin && item.analysis_debug_note ? (
        <div className="policy-section-box">
          <strong>管理员诊断</strong>
          <div className="policy-analysis-meta">
            <div className="policy-analysis-item">
              <p>{item.analysis_debug_note}</p>
            </div>
          </div>
        </div>
      ) : null}

      {item.content_preview ? (
        <div className="policy-section-box">
          <strong>正文摘录</strong>
          <p className="muted">{item.content_preview}...</p>
        </div>
      ) : null}

      <div className="policy-section-box">
        <PolicyChatBox policyId={item.id} />
      </div>

      {canEdit ? (
        <details className="policy-edit-box">
          <summary>人工修正解读</summary>
          <form method="post" action={`/api/policies/${item.id}/edit`} className="policy-edit-form">
            <input type="hidden" name="returnTo" value={returnTo} />
            <label className="filter-field">
              <span>摘要</span>
              <textarea name="summary" defaultValue={item.summary || ""} rows={4} />
            </label>
            <label className="filter-field">
              <span>适用范围</span>
              <textarea name="scope_summary" defaultValue={item.scope_summary || ""} rows={4} />
            </label>
            <label className="filter-field">
              <span>交易影响</span>
              <textarea name="impact_summary" defaultValue={item.impact_summary || ""} rows={4} />
            </label>
            <label className="filter-field">
              <span>核心条款</span>
              <textarea name="key_points_text" defaultValue={item.key_points.join("\n")} rows={6} />
            </label>
            <label className="filter-field">
              <span>影响标签</span>
              <textarea name="impact_tags_text" defaultValue={item.impact_tags.join(", ")} rows={3} />
            </label>
            <button className="filter-submit" type="submit">
              保存人工修正
            </button>
          </form>
        </details>
      ) : null}
    </article>
  );
}


export default async function PoliciesPage({ searchParams }: PoliciesPageProps) {
  const params = (await searchParams) || {};
  const search = (params.search || "").trim();
  const selectedPolicyId = Number(params.policy || "") || null;
  const saveStatus = params.save || "";
  const saveMessage = params.message || "";
  const probeStatus = params.probe || "";
  const probeMessage = params.probeMessage || "";

  const [policyRows, analysisStatus] = await Promise.all([
    getPolicies(search || undefined),
    getPolicyAnalysisStatus(),
  ]);
  const selectedPolicy = selectedPolicyId ? policyRows.find((item) => item.id === selectedPolicyId) || null : null;
  const selectedVersions = selectedPolicy ? await getPolicyVersions(selectedPolicy.id) : [];
  const tags = uniqueTags(policyRows);
  const ruleGroups = groupRulesByLevel(policyRows);
  const canEdit = true;
  const isAdmin = true;
  const returnTo = buildReturnTo(search, selectedPolicy?.id || null);

  return (
    <section className="section">
      <div className="section-head">
        <div>
          <h2>政策文件模块</h2>
          <p>先按规则清单查看文件与执行层次，点击具体规则后再进入解读、版本记录和问答。</p>
        </div>
      </div>

      <article className="panel section-card compact-section">
        <form className="inline-search policy-search-form" method="get" action="/policies">
          <input type="text" name="search" defaultValue={search} placeholder="输入规则名称关键词，例如：新能源、现货、结算" />
          <button className="filter-submit" type="submit">
            搜索规则
          </button>
          {search ? (
            <a className="pager-chip" href="/policies">
              清空搜索
            </a>
          ) : null}
        </form>
      </article>

      {saveStatus === "success" ? <article className="panel policy-feedback policy-feedback-success">{saveMessage || "操作已完成。"}</article> : null}
      {saveStatus === "error" ? <article className="panel policy-feedback policy-feedback-error">{saveMessage || "操作失败，请稍后再试。"}</article> : null}

      {probeStatus ? (
        <article
          className={`panel policy-feedback ${
            probeStatus === "success"
              ? "policy-feedback-success"
              : probeStatus === "warn"
                ? "policy-feedback-warn"
                : "policy-feedback-error"
          }`}
        >
          {probeMessage || "模型连通性测试已完成。"}
        </article>
      ) : null}

      <article className={`panel policy-feedback ${analysisStatus.llm_enabled ? "policy-feedback-success" : "policy-feedback-warn"}`}>
        <div className="policy-status-row">
          <span>
            {analysisStatus.llm_enabled
              ? `已配置大模型。当前 AI 解读 ${analysisStatus.llm_count} 条，规则解读 ${analysisStatus.rule_count} 条，人工修正 ${analysisStatus.manual_count} 条。`
              : "当前未配置大模型，系统将仅保留规则解读；你也可以先人工修正已有结果。"}
          </span>
          {isAdmin ? (
            <form action="/api/policies/connectivity-test" method="post">
              <button className="pager-chip" type="submit">
                检测模型连通性
              </button>
            </form>
          ) : null}
        </div>
      </article>

      <div className="metric-grid compact-cards">
        <article className="panel metric-card">
          <span className="muted">规则文件数</span>
          <strong>{policyRows.length}</strong>
          <span className="muted">{search ? `当前搜索：${search}` : "当前展示全部规则"}</span>
        </article>
        <article className="panel metric-card">
          <span className="muted">执行层次</span>
          <strong>{ruleGroups.length}</strong>
          <span className="muted">按行政与市场执行口径归类</span>
        </article>
        <article className="panel metric-card">
          <span className="muted">影响标签</span>
          <strong>{tags.length}</strong>
          <span className="muted">现货、中长期、结算等维度</span>
        </article>
        <article className="panel metric-card">
          <span className="muted">运行模式</span>
          <strong>本地开放</strong>
          <span className="muted">可直接触发 AI 解读和人工修正</span>
        </article>
      </div>

      <PolicyWorkspacePanel
        policies={policyRows.map((item) => ({
          id: item.id,
          title: item.title,
          issuer: item.issuer,
          policy_date: item.policy_date,
          analysis_mode: item.analysis_mode,
        }))}
      />

      <div className="policy-rule-layout">
        <article className="panel policy-rule-index">
          <div className="policy-rule-index-head">
            <div>
              <h3>规则清单</h3>
              <p className="muted">点击规则文件后查看对应解读。</p>
            </div>
            {selectedPolicy ? (
              <a className="pager-chip" href={search ? `/policies?search=${encodeURIComponent(search)}` : "/policies"}>
                仅看清单
              </a>
            ) : null}
          </div>

          {ruleGroups.length > 0 ? (
            <div className="policy-rule-groups">
              {ruleGroups.map((group) => (
                <section className="policy-rule-group" key={group.level}>
                  <div className="policy-rule-level">
                    <strong>{group.level}</strong>
                    <span>{group.description}</span>
                  </div>
                  <div className="policy-rule-list">
                    {group.rows.map((item) => (
                      <a
                        className={`policy-rule-item ${selectedPolicy?.id === item.id ? "policy-rule-item-active" : ""}`}
                        href={buildPolicyUrl(search, item.id)}
                        key={item.id}
                      >
                        <div>
                          <strong>{item.title}</strong>
                          <span>{item.file_name || item.issuer || "文件信息待识别"}</span>
                        </div>
                        <div className="policy-rule-meta">
                          <span>{analysisModeLabel(item.analysis_mode)}</span>
                          <span>{item.policy_date || "日期待识别"}</span>
                        </div>
                      </a>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <p className="muted">当前没有匹配的规则文件。</p>
          )}
        </article>

        <div className="policy-rule-detail">
          {selectedPolicy ? (
            <PolicyDetail item={selectedPolicy} versions={selectedVersions} canEdit={canEdit} isAdmin={isAdmin} returnTo={returnTo} />
          ) : (
            <article className="panel policy-empty-detail">
              <strong>请选择一个规则文件</strong>
              <p className="muted">左侧只展示规则清单。进入某个规则后，页面会显示 AI 解读、结构化条款、版本记录和问答入口。</p>
            </article>
          )}
        </div>
      </div>
    </section>
  );
}
