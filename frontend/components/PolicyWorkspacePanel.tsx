"use client";

import { useMemo, useState, useTransition } from "react";


type PolicyWorkspaceOption = {
  id: number;
  title: string;
  issuer: string | null;
  policy_date: string | null;
  analysis_mode: string | null;
};

type WorkspaceReportDocument = {
  id: number;
  title: string;
  analysis_mode: string | null;
  analysis_note: string | null;
};

type WorkspaceReportResponse = {
  policy_ids: number[];
  mode: string;
  report_title: string;
  report_text: string;
  evidence: string[];
  documents: WorkspaceReportDocument[];
};

type WorkspaceChatResponse = {
  answer: string;
  evidence: string[];
  mode: string;
  remaining_quota?: number | null;
  related_policies?: number[];
};

type WorkspaceReanalyzeResponse = {
  status: string;
  policy_id?: number;
  detail?: string;
};

type WorkspaceMessage = {
  role: "user" | "assistant";
  content: string;
  evidence?: string[];
  mode?: string;
  relatedPolicyIds?: number[];
};

type PolicyWorkspacePanelProps = {
  policies: PolicyWorkspaceOption[];
};


async function parseJsonSafely(response: Response): Promise<any> {
  const raw = await response.text();
  if (!raw.trim()) {
    return { detail: `服务返回空响应（HTTP ${response.status}）。请稍后重试。` };
  }
  try {
    return JSON.parse(raw);
  } catch {
    return { detail: raw.slice(0, 240) || "响应解析失败。" };
  }
}


function modeLabel(mode: string | null) {
  if (mode === "llm") {
    return "AI";
  }
  if (mode === "manual") {
    return "人工";
  }
  return "规则";
}


export default function PolicyWorkspacePanel({ policies }: PolicyWorkspacePanelProps) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [report, setReport] = useState<WorkspaceReportResponse | null>(null);
  const [reportError, setReportError] = useState("");
  const [reportStatus, setReportStatus] = useState("");
  const [question, setQuestion] = useState("");
  const [chatError, setChatError] = useState("");
  const [messages, setMessages] = useState<WorkspaceMessage[]>([]);
  const [remainingQuota, setRemainingQuota] = useState<number | null>(null);
  const [isGenerating, startGenerating] = useTransition();
  const [isAsking, startAsking] = useTransition();

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const togglePolicy = (policyId: number) => {
    setSelectedIds((current) => {
      if (current.includes(policyId)) {
        return current.filter((item) => item !== policyId);
      }
      return [...current, policyId];
    });
  };

  const runSequentialReanalyze = async (policyIds: number[]) => {
    const successIds: number[] = [];
    const failedIds: number[] = [];

    for (let index = 0; index < policyIds.length; index += 1) {
      const policyId = policyIds[index];
      setReportStatus(`正在顺序执行 AI 解读（${index + 1}/${policyIds.length}）...`);
      const formData = new FormData();
      formData.set("policy_id", String(policyId));
      const response = await fetch("/api/policies/workspace/reanalyze", {
        method: "POST",
        body: formData,
      });
      const body = (await parseJsonSafely(response)) as WorkspaceReanalyzeResponse;
      if (!response.ok || body.status !== "ok") {
        failedIds.push(policyId);
        continue;
      }
      successIds.push(policyId);
    }

    return { successIds, failedIds };
  };

  const generateReport = (reanalyze: boolean) => {
    if (selectedIds.length < 2) {
      setReportError("请至少选择两份规则文件后再生成联动报告。");
      return;
    }

    setReportError("");
    setReportStatus("");
    startGenerating(async () => {
      try {
        let sequentialResult: { successIds: number[]; failedIds: number[] } | null = null;
        if (reanalyze) {
          sequentialResult = await runSequentialReanalyze(selectedIds);
          if (sequentialResult.failedIds.length > 0) {
            setReportStatus(
              `顺序解读完成：成功 ${sequentialResult.successIds.length} 份，失败 ${sequentialResult.failedIds.length} 份。将按当前可用结果汇总报告。`
            );
          } else {
            setReportStatus(`顺序解读完成：${sequentialResult.successIds.length} 份均成功，正在汇总报告...`);
          }
        }

        const formData = new FormData();
        formData.set("policy_ids_json", JSON.stringify(selectedIds));
        formData.set("reanalyze", "false");

        const response = await fetch("/api/policies/workspace/report", {
          method: "POST",
          body: formData,
        });
        const body = (await parseJsonSafely(response)) as WorkspaceReportResponse | { detail?: string };
        if (!response.ok) {
          throw new Error("detail" in body && body.detail ? body.detail : "联动报告生成失败");
        }

        const typed = body as WorkspaceReportResponse;
        setReport(typed);
        setMessages([]);

        if (!reanalyze) {
          setReportStatus(`联动报告已生成（${typed.mode === "llm" ? "AI 模式" : "规则模式"}）。`);
        } else if (sequentialResult?.failedIds.length) {
          setReportStatus(
            `顺序解读与汇总已完成（${typed.mode === "llm" ? "AI 模式" : "规则模式"}）。失败文件 ID：${sequentialResult.failedIds.join(", ")}。`
          );
        } else {
          setReportStatus(`顺序解读与汇总已完成（${typed.mode === "llm" ? "AI 模式" : "规则模式"}）。`);
        }
      } catch (error) {
        const text = error instanceof Error ? error.message : "联动报告生成失败，请稍后重试。";
        setReportError(text);
      }
    });
  };

  const askQuestion = (rawQuestion: string) => {
    const trimmed = rawQuestion.trim();
    if (!trimmed) {
      setChatError("请输入问题后再问询。");
      return;
    }
    if (selectedIds.length < 2) {
      setChatError("请先选择至少两份规则文件。");
      return;
    }
    setChatError("");
    startAsking(async () => {
      try {
        const formData = new FormData();
        formData.set("policy_ids_json", JSON.stringify(selectedIds));
        formData.set("question", trimmed);
        formData.set("report_text", report?.report_text || "");
        formData.set(
          "history_json",
          JSON.stringify(messages.map((item) => ({ role: item.role, content: item.content })).slice(-8))
        );
        const response = await fetch("/api/policies/workspace/chat", {
          method: "POST",
          body: formData,
        });
        const body = (await parseJsonSafely(response)) as WorkspaceChatResponse | { detail?: string };
        if (!response.ok) {
          throw new Error("detail" in body && body.detail ? body.detail : "联动问询失败");
        }
        const typed = body as WorkspaceChatResponse;
        setMessages((current) => [
          ...current,
          { role: "user", content: trimmed },
          {
            role: "assistant",
            content: typed.answer,
            evidence: typed.evidence || [],
            mode: typed.mode,
            relatedPolicyIds: typed.related_policies || [],
          },
        ]);
        setRemainingQuota(typed.remaining_quota ?? null);
        setQuestion("");
      } catch (error) {
        const text = error instanceof Error ? error.message : "联动问询失败，请稍后重试。";
        setChatError(text);
      }
    });
  };

  const quickQuestions = [
    "多份规则联动后，售电公司本周最需要先做哪些动作？",
    "新能源主体在申报、结算和风险控制上有哪些冲突点？",
    "发电企业在时间节点和责任分工上最容易漏掉哪些要求？",
  ];

  return (
    <article className="panel policy-workspace-panel">
      <div className="policy-workspace-head">
        <div>
          <h3>联动规则解读工作台</h3>
          <p className="muted">可同时选择多份规则文件，先逐份解读，再统一汇总成联动报告并继续问询。</p>
        </div>
        <div className="policy-workspace-actions">
          <button className="pager-chip" type="button" onClick={() => setSelectedIds(policies.map((item) => item.id))}>
            全选
          </button>
          <button className="pager-chip" type="button" onClick={() => setSelectedIds([])}>
            清空
          </button>
        </div>
      </div>

      <div className="policy-workspace-grid">
        {policies.map((item) => (
          <label className="policy-workspace-item" key={item.id}>
            <input type="checkbox" checked={selectedIdSet.has(item.id)} onChange={() => togglePolicy(item.id)} />
            <div>
              <strong>{item.title}</strong>
              <span>
                {item.policy_date || "日期待识别"} / {item.issuer || "发文机构待识别"} / {modeLabel(item.analysis_mode)}
              </span>
            </div>
          </label>
        ))}
      </div>

      <div className="policy-workspace-toolbar">
        <span className="muted">已选择 {selectedIds.length} 份文件（建议 2-5 份）</span>
        <div className="policy-workspace-buttons">
          <button className="filter-submit" type="button" disabled={isGenerating} onClick={() => generateReport(false)}>
            {isGenerating ? "生成中..." : "生成联动报告"}
          </button>
          <button className="pager-chip" type="button" disabled={isGenerating} onClick={() => generateReport(true)}>
            {isGenerating ? "处理中..." : "先执行 AI 解读再生成"}
          </button>
        </div>
      </div>

      {reportStatus ? <p className="muted">{reportStatus}</p> : null}
      {reportError ? <p className="policy-chat-error">{reportError}</p> : null}

      {report ? (
        <div className="policy-workspace-report">
          <div className="policy-workspace-report-head">
            <strong>{report.report_title}</strong>
            <span className="policy-chat-mode">{report.mode === "llm" ? "联动 AI 报告" : "规则汇总报告"}</span>
          </div>
          <p className="policy-workspace-report-text">{report.report_text}</p>
          {report.evidence.length > 0 ? (
            <div className="policy-chat-evidence">
              <strong>关键依据</strong>
              <div className="policy-point-list">
                {report.evidence.map((item) => (
                  <div className="policy-point-item" key={item}>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {report.documents.length > 0 ? (
            <div className="policy-tag-list">
              {report.documents.map((item) => (
                <span className="table-chip table-chip-ok" key={item.id}>
                  {item.id} / {modeLabel(item.analysis_mode)} / {item.title}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="policy-chat-box">
        <div className="policy-chat-head">
          <strong>联动问询</strong>
          <span className="muted">
            {remainingQuota !== null ? `本分钟剩余 ${remainingQuota} 次` : "围绕已选规则进行多文件追问"}
          </span>
        </div>
        <div className="policy-chat-quick">
          {quickQuestions.map((item) => (
            <button key={item} type="button" className="pager-chip" onClick={() => askQuestion(item)}>
              {item}
            </button>
          ))}
        </div>
        <div className="policy-chat-form">
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={3}
            placeholder="例如：这些规则联动后，售电公司在月度交易到结算阶段有哪些连续动作？"
          />
          <button className="filter-submit" type="button" disabled={isAsking} onClick={() => askQuestion(question)}>
            {isAsking ? "问询中..." : "发送联动问询"}
          </button>
        </div>
        {chatError ? <p className="policy-chat-error">{chatError}</p> : null}
        {messages.length > 0 ? (
          <div className="policy-chat-thread">
            {messages.map((message, index) => (
              <div
                className={`policy-chat-bubble ${message.role === "user" ? "policy-chat-bubble-user" : "policy-chat-bubble-assistant"}`}
                key={`${message.role}-${index}-${message.content.slice(0, 12)}`}
              >
                <div className="policy-chat-mode">
                  {message.role === "user"
                    ? "我的问题"
                    : message.mode === "llm"
                      ? "联动 AI 回答"
                      : message.mode === "guard"
                        ? "范围提示"
                        : "规则联动回答"}
                </div>
                <p>{message.content}</p>
                {message.relatedPolicyIds && message.relatedPolicyIds.length > 0 ? (
                  <p className="muted">相关文件 ID：{message.relatedPolicyIds.join(", ")}</p>
                ) : null}
                {message.evidence && message.evidence.length > 0 ? (
                  <div className="policy-chat-evidence">
                    <strong>相关依据</strong>
                    <div className="policy-point-list">
                      {message.evidence.map((item) => (
                        <div className="policy-point-item" key={item}>
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}
