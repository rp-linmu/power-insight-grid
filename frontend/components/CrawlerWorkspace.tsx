"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type CrawlerTask = {
  id: string;
  name: string;
  description: string;
  status: "ready" | "pending";
};

type SupplementTarget = {
  date: string;
  taskId: string;
};

type AuditMissingItem = {
  date: string;
  taskId: string;
  taskName: string;
  slot: string;
  reason?: string;
  expectedDir: string;
};

type AuditInvalidFile = {
  date: string;
  taskId: string;
  taskName: string;
  slot: string;
  file: string;
  path: string;
  reason?: string;
  deleted?: boolean;
};

type AuditResult = {
  checkedDates: number;
  checkedTasks: number;
  expectedSlots: number;
  presentSlots: number;
  missingSlots: number;
  completeness: number;
  missing: AuditMissingItem[];
  invalidFiles?: AuditInvalidFile[];
  supplementTargets: SupplementTarget[];
  unsupported: { taskName: string; reason: string }[];
};

type JobEvent = {
  time?: string;
  type: string;
  date?: string;
  taskName?: string;
  taskId?: string;
  message?: string;
};

type JobResult = {
  status?: string;
  taskName: string;
  date: string;
  message?: string;
  files?: { file: string; path: string; existing?: boolean }[];
};

type JobStatus = {
  id?: string;
  state: string;
  events?: JobEvent[];
  results?: JobResult[];
  error?: string;
};

type ServiceStatus = {
  ok: boolean;
  message: string;
  control_url: string;
  task_count: number;
};

type SyncResult = {
  ok: boolean;
  message: string;
  synced_files: string[];
  skipped_files: string[];
  failed_files: string[];
  rebuilt_dates?: string[];
  effective_date?: string | null;
  overwrite?: boolean;
  cache_cleared?: boolean;
};

type ImportAuditRow = {
  date: string;
  taskId: string;
  taskName: string;
  file: string;
  sourcePath: string;
  destinationName?: string;
  status: "imported" | "pending" | "invalid" | "missing";
  statusLabel: string;
  reason?: string;
  imported: boolean;
  valid: boolean;
  size?: number;
  modifiedAt?: string;
};

type ImportAuditResult = {
  ok: boolean;
  start: string;
  end: string;
  checkedDates: number;
  totalFiles: number;
  importedFiles: number;
  pendingFiles: number;
  invalidFiles: number;
  missingDates: number;
  rows: ImportAuditRow[];
  pendingSourcePaths: string[];
  checkedAt: string;
};

type CrawlerWorkspaceProps = {
  initialDate: string;
};

const finishedStates = new Set(["completed", "failed", "cancelled"]);

export default function CrawlerWorkspace({ initialDate }: CrawlerWorkspaceProps) {
  const [service, setService] = useState<ServiceStatus | null>(null);
  const [tasks, setTasks] = useState<CrawlerTask[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(initialDate);
  const [endDate, setEndDate] = useState(initialDate);
  const [overwrite, setOverwrite] = useState(false);
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [auditSignature, setAuditSignature] = useState("");
  const [auditLoading, setAuditLoading] = useState(false);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [requestError, setRequestError] = useState("");
  const [syncMessage, setSyncMessage] = useState("");
  const [autoSyncing, setAutoSyncing] = useState(false);
  const [importAudit, setImportAudit] = useState<ImportAuditResult | null>(null);
  const [importAuditSignature, setImportAuditSignature] = useState("");
  const [importAuditLoading, setImportAuditLoading] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const handledJobs = useRef<Set<string>>(new Set());

  const selectionSignature = useMemo(
    () => JSON.stringify({ startDate, endDate, taskIds: [...selectedTaskIds].sort() }),
    [endDate, selectedTaskIds, startDate],
  );
  const jobRunning = job?.state === "running" || job?.state === "stopping";
  const auditCurrent = Boolean(audit && auditSignature === selectionSignature);
  const importAuditCurrent = Boolean(importAudit && importAuditSignature === selectionSignature);

  useEffect(() => {
    void loadService();
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  async function loadService() {
    setRequestError("");
    try {
      const [servicePayload, taskPayload] = await Promise.all([
        apiRequest<ServiceStatus>("/api/crawler/service-status"),
        apiRequest<{ tasks: CrawlerTask[] }>("/api/crawler/tasks"),
      ]);
      setService(servicePayload);
      setTasks(taskPayload.tasks);
      setSelectedTaskIds(taskPayload.tasks.filter((task) => task.status === "ready").map((task) => task.id));
    } catch (error) {
      setService({
        ok: false,
        message: errorMessage(error),
        control_url: "http://127.0.0.1:8787",
        task_count: 0,
      });
      setRequestError(errorMessage(error));
    }
  }

  function toggleTask(taskId: string) {
    setSelectedTaskIds((current) =>
      current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId],
    );
  }

  function selectReadyTasks() {
    setSelectedTaskIds(tasks.filter((task) => task.status === "ready").map((task) => task.id));
  }

  function validateSelection() {
    if (!startDate || !endDate) return "请选择开始日期和结束日期。";
    if (startDate > endDate) return "开始日期不能晚于结束日期。";
    if (!selectedTaskIds.length) return "请至少选择一个数据项。";
    return "";
  }

  async function inspectMissing() {
    const validation = validateSelection();
    if (validation) {
      setRequestError(validation);
      return;
    }
    setAuditLoading(true);
    setRequestError("");
    setSyncMessage("");
    try {
      const result = await apiRequest<AuditResult>("/api/crawler/audit", {
        method: "POST",
        body: JSON.stringify({ start: startDate, end: endDate, taskIds: selectedTaskIds }),
      });
      setAudit(result);
      setAuditSignature(selectionSignature);
    } catch (error) {
      setAudit(null);
      setAuditSignature("");
      setRequestError(errorMessage(error));
    } finally {
      setAuditLoading(false);
    }
  }

  async function inspectImportStatus() {
    const validation = validateSelection();
    if (validation) {
      setRequestError(validation);
      return;
    }
    setImportAuditLoading(true);
    setRequestError("");
    setSyncMessage("");
    try {
      const result = await apiRequest<ImportAuditResult>("/api/crawler/import-audit", {
        method: "POST",
        body: JSON.stringify({ start: startDate, end: endDate, taskIds: selectedTaskIds }),
      });
      setImportAudit(result);
      setImportAuditSignature(selectionSignature);
    } catch (error) {
      setImportAudit(null);
      setImportAuditSignature("");
      setRequestError(errorMessage(error));
    } finally {
      setImportAuditLoading(false);
    }
  }

  async function syncPendingImports() {
    if (!importAuditCurrent || !importAudit?.pendingSourcePaths.length) {
      setRequestError("请先检查入库状态，确认存在待入库文件。");
      return;
    }
    setRequestError("");
    setSyncMessage("正在同步未入库文件...");
    try {
      const result = await apiRequest<SyncResult>("/api/crawler/sync", {
        method: "POST",
        body: JSON.stringify({
          overwrite: true,
          source_paths: importAudit.pendingSourcePaths,
        }),
      });
      if (!result.ok || result.failed_files.length) {
        throw new Error(result.message || "同步未入库文件失败。");
      }
      setSyncMessage(`${result.message} 已重建日期目录：${(result.rebuilt_dates || []).join(", ") || "无"}`);
      await inspectImportStatus();
    } catch (error) {
      setRequestError(errorMessage(error));
      setSyncMessage("");
    }
  }

  async function startJob(mode: "range" | "supplement") {
    const validation = validateSelection();
    if (validation) {
      setRequestError(validation);
      return;
    }
    if (mode === "supplement" && !auditCurrent) {
      setRequestError("日期范围或数据项已变化，请先重新检查缺失数据。");
      return;
    }
    if (mode === "supplement" && !audit?.supplementTargets.length) {
      setRequestError("当前检查结果没有缺失数据，无需补充获取。");
      return;
    }

    setRequestError("");
    setSyncMessage("");
    setJob({ state: "starting", events: [], results: [] });
    try {
      const created = await apiRequest<{ id: string; state: string }>("/api/crawler/run", {
        method: "POST",
        body: JSON.stringify({
          start: startDate,
          end: endDate,
          taskIds: selectedTaskIds,
          exactTargets: mode === "supplement" ? audit?.supplementTargets || [] : [],
          supplement: mode === "supplement",
          overwrite,
        }),
      });
      setJob({ id: created.id, state: created.state, events: [], results: [] });
      beginPolling(created.id);
    } catch (error) {
      setJob({ state: "failed", error: errorMessage(error), events: [], results: [] });
      setRequestError(errorMessage(error));
    }
  }

  function beginPolling(id: string) {
    if (pollTimer.current) clearInterval(pollTimer.current);
    const poll = async () => {
      try {
        const latest = await apiRequest<JobStatus>(`/api/crawler/status?id=${encodeURIComponent(id)}`);
        setJob(latest);
        if (finishedStates.has(latest.state) && pollTimer.current) {
          clearInterval(pollTimer.current);
          pollTimer.current = null;
          if (latest.state === "completed" && !handledJobs.current.has(id)) {
            handledJobs.current.add(id);
            await autoSyncCompletedJob(latest);
          }
        }
      } catch (error) {
        setRequestError(errorMessage(error));
      }
    };
    void poll();
    pollTimer.current = setInterval(() => void poll(), 1000);
  }

  async function autoSyncCompletedJob(completedJob: JobStatus) {
    const newFiles = (completedJob.results || [])
      .filter((result) => result.status === "completed")
      .flatMap((result) => (result.files || []).filter((file) => !file.existing));
    if (!newFiles.length) {
      setSyncMessage("爬取已完成，本次没有新增文件，数据库无需更新。");
      return;
    }

    const completedDates = (completedJob.results || [])
      .filter((result) => result.status === "completed" && (result.files || []).some((file) => !file.existing))
      .map((result) => result.date)
      .filter(Boolean)
      .sort();
    const latestDate = completedDates.at(-1) || endDate;

    setAutoSyncing(true);
    setSyncMessage("爬取成功，正在校验文件并覆盖同步数据库...");
    setRequestError("");
    try {
      const result = await apiRequest<SyncResult>(
        "/api/crawler/sync",
        {
          method: "POST",
          body: JSON.stringify({
            overwrite: true,
            source_paths: newFiles.map((file) => file.path),
          }),
        },
      );
      if (!result.ok || result.failed_files.length) {
        throw new Error(result.message || "自动覆盖同步失败。");
      }
      setAudit(null);
      setAuditSignature("");
      setSyncMessage(`${result.message} 页面缓存已清除，正在刷新 ${latestDate} 基本面。`);
      window.setTimeout(() => {
        window.location.assign(`/disclosure?trade_date=${encodeURIComponent(latestDate)}`);
      }, 900);
    } catch (error) {
      setRequestError(`爬取已完成，但自动入库失败：${errorMessage(error)}`);
      setSyncMessage("");
    } finally {
      setAutoSyncing(false);
    }
  }

  async function stopJob() {
    if (!job?.id) return;
    try {
      await apiRequest("/api/crawler/stop", {
        method: "POST",
        body: JSON.stringify({ id: job.id }),
      });
      setJob((current) => (current ? { ...current, state: "stopping" } : current));
    } catch (error) {
      setRequestError(errorMessage(error));
    }
  }

  async function syncDownloads() {
    setSyncMessage("");
    setRequestError("");
    const sourcePaths = (job?.results || [])
      .filter((result) => result.status === "completed")
      .flatMap((result) => (result.files || []).filter((file) => !file.existing).map((file) => file.path));
    if (!sourcePaths.length && startDate !== endDate) {
      setRequestError("跨日期手动同步需要先完成一次获取任务；系统将只覆盖同步本次任务中的有效新文件。");
      return;
    }
    const suffix = sourcePaths.length ? "" : `?effective_date=${encodeURIComponent(startDate)}`;
    try {
      const result = await apiRequest<SyncResult>(`/api/crawler/sync${suffix}`, {
        method: "POST",
        body: JSON.stringify({
          overwrite: true,
          ...(sourcePaths.length ? { source_paths: sourcePaths } : {}),
        }),
      });
      setSyncMessage(result.message);
    } catch (error) {
      setRequestError(errorMessage(error));
    }
  }

  const downloadedFiles = (job?.results || []).flatMap((result) =>
    (result.files || []).map((file) => ({ ...file, taskName: result.taskName, date: result.date })),
  );

  return (
    <div className="crawler-workspace">
      <div className={`crawler-service-strip ${service?.ok ? "is-ready" : "is-offline"}`}>
        <div>
          <strong>{service?.ok ? "数据获取服务在线" : "数据获取服务未连接"}</strong>
          <span>{service?.message || "正在检查服务状态..."}</span>
        </div>
        <button type="button" className="crawler-button crawler-button-secondary" onClick={() => void loadService()}>
          重新连接
        </button>
      </div>

      <section className="crawler-control-grid">
        <div className="crawler-control-block">
          <h3>获取范围</h3>
          <div className="crawler-date-grid">
            <label className="filter-field">
              <span>开始日期</span>
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>
            <label className="filter-field">
              <span>结束日期</span>
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
          </div>
          <label className="crawler-toggle">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(event) => setOverwrite(event.target.checked)}
            />
            <span>
              <strong>覆盖已有有效文件</strong>
              <small>仅在需要强制刷新整段数据时启用</small>
            </span>
          </label>
        </div>

        <div className="crawler-control-block crawler-task-block">
          <div className="crawler-block-head">
            <h3>数据项</h3>
            <button type="button" className="crawler-text-button" onClick={selectReadyTasks}>
              选择已接入项
            </button>
          </div>
          <div className="crawler-task-list">
            {tasks.map((task) => (
              <label key={task.id} className={`crawler-task-row ${task.status !== "ready" ? "is-pending" : ""}`}>
                <input
                  type="checkbox"
                  checked={selectedTaskIds.includes(task.id)}
                  onChange={() => toggleTask(task.id)}
                  disabled={jobRunning}
                />
                <span>
                  <strong>{task.name}</strong>
                  <small>{task.description}</small>
                </span>
                <em>{task.status === "ready" ? "已接入" : "待接入"}</em>
              </label>
            ))}
          </div>
        </div>
      </section>

      <div className="crawler-action-bar">
        <button
          type="button"
          className="crawler-button crawler-button-secondary"
          onClick={() => void inspectMissing()}
          disabled={!service?.ok || auditLoading || jobRunning}
        >
          {auditLoading ? "正在检查" : "检查缺失数据"}
        </button>
        <button
          type="button"
          className="crawler-button crawler-button-secondary"
          onClick={() => void inspectImportStatus()}
          disabled={importAuditLoading || jobRunning}
        >
          {importAuditLoading ? "检查入库中" : "检查入库状态"}
        </button>
        <button
          type="button"
          className="crawler-button crawler-button-primary"
          onClick={() => void syncPendingImports()}
          disabled={!importAuditCurrent || !importAudit?.pendingSourcePaths.length || jobRunning || autoSyncing}
        >
          同步未入库文件
        </button>
        <button
          type="button"
          className="crawler-button crawler-button-primary"
          onClick={() => void startJob("supplement")}
          disabled={!service?.ok || !auditCurrent || !audit?.supplementTargets.length || jobRunning}
        >
          按缺失清单补充获取
        </button>
        <button
          type="button"
          className="crawler-button crawler-button-secondary"
          onClick={() => void startJob("range")}
          disabled={!service?.ok || jobRunning}
        >
          获取所选范围
        </button>
        <button
          type="button"
          className="crawler-button crawler-button-danger"
          onClick={() => void stopJob()}
          disabled={!jobRunning}
        >
          中断执行
        </button>
        <button
          type="button"
          className="crawler-button crawler-button-secondary"
          onClick={() => void syncDownloads()}
          disabled={jobRunning || autoSyncing}
        >
          {autoSyncing ? "自动同步中" : "同步入库"}
        </button>
        <a
          className="crawler-button crawler-button-secondary crawler-view-link"
          href={`/disclosure?trade_date=${encodeURIComponent(endDate)}`}
        >
          查看所选日期基本面
        </a>
      </div>

      {requestError ? <div className="crawler-message is-error">{requestError}</div> : null}
      {syncMessage ? <div className="crawler-message is-success">{syncMessage}</div> : null}

      <section className="crawler-results-grid">
        <article className="crawler-result-panel">
          <div className="crawler-result-head">
            <div>
              <h3>数据完整性</h3>
              <p>{auditCurrent ? "当前选择条件的检查结果" : "检查后可直接生成精确补采任务"}</p>
            </div>
            <span className={`crawler-state ${auditCurrent && audit?.missingSlots === 0 ? "is-complete" : ""}`}>
              {auditLoading ? "检查中" : auditCurrent ? `完整率 ${audit?.completeness}%` : "未检查"}
            </span>
          </div>
          {auditCurrent && audit ? (
            <>
              <div className="crawler-metric-row">
                <span><strong>{audit.checkedDates}</strong>天</span>
                <span><strong>{audit.presentSlots}/{audit.expectedSlots}</strong>项齐全</span>
                <span><strong>{audit.missingSlots}</strong>项缺失</span>
                <span><strong>{audit.supplementTargets.length}</strong>个补采任务</span>
              </div>
              <div className="crawler-missing-list">
                {audit.missing.length || audit.invalidFiles?.length ? (
                  <>
                    {audit.missing.map((item) => (
                      <div key={`${item.date}-${item.taskId}-${item.slot}`} className="crawler-missing-row">
                        <strong>{item.date}</strong>
                        <span>{item.taskName} / {item.slot}</span>
                        <em>{item.reason || "文件不存在"}</em>
                      </div>
                    ))}
                    {(audit.invalidFiles || []).map((item) => (
                      <div key={`${item.date}-${item.taskId}-${item.slot}-${item.file}`} className="crawler-missing-row">
                        <strong>{item.date}</strong>
                        <span>{item.taskName} / {item.slot}</span>
                        <em>{item.deleted ? "错误文件已删除" : "错误文件未删除"}：{item.reason || item.file}</em>
                      </div>
                    ))}
                  </>
                ) : <p className="crawler-empty">所选周期内数据齐全。</p>}
              </div>
            </>
          ) : (
            <p className="crawler-empty">请选择日期和数据项后执行检查。</p>
          )}
        </article>

        <article className="crawler-result-panel">
          <div className="crawler-result-head">
            <div>
              <h3>执行状态</h3>
              <p>任务进度、错误与中断状态</p>
            </div>
            <span className={`crawler-state state-${job?.state || "idle"}`}>{jobStateLabel(job?.state)}</span>
          </div>
          <div className="crawler-log" aria-live="polite">
            {(job?.events || []).length ? (job?.events || []).map((event, index) => (
              <div key={`${event.time}-${index}`} className={`crawler-log-row event-${event.type}`}>
                <time>{formatTime(event.time)}</time>
                <strong>{event.date || ""}</strong>
                <span>{event.taskName || event.taskId || ""} {event.message || ""}</span>
              </div>
            )) : <p className="crawler-empty">暂无执行日志。</p>}
            {job?.error ? <div className="crawler-log-row event-failed"><span>{job.error}</span></div> : null}
          </div>
        </article>
      </section>

      <section className="crawler-files-panel">
        <div className="crawler-result-head">
          <div>
            <h3>获取文件</h3>
            <p>本次任务已确认的有效文件</p>
          </div>
          <span className="crawler-state">{downloadedFiles.length} 个文件</span>
        </div>
        {downloadedFiles.length ? (
          <div className="crawler-file-list">
            {downloadedFiles.map((file) => (
              <div key={file.path} className="crawler-file-row">
                <strong>{file.date} / {file.taskName}</strong>
                <span>{file.file}{file.existing ? "（已存在）" : ""}</span>
                <small>{file.path}</small>
              </div>
            ))}
          </div>
        ) : <p className="crawler-empty">任务完成后在此显示有效文件。</p>}
      </section>

      <section className="crawler-files-panel">
        <div className="crawler-result-head">
          <div>
            <h3>入库状态</h3>
            <p>扫描所选周期内本地已获取文件，并检查是否已经同步进入数据库</p>
          </div>
          <span className={`crawler-state ${importAuditCurrent && importAudit?.pendingFiles === 0 ? "is-complete" : ""}`}>
            {importAuditLoading
              ? "检查中"
              : importAuditCurrent
                ? `待入库 ${importAudit?.pendingFiles || 0}`
                : "未检查"}
          </span>
        </div>
        {importAuditCurrent && importAudit ? (
          <>
            <div className="crawler-metric-row">
              <span><strong>{importAudit.totalFiles}</strong>个本地文件</span>
              <span><strong>{importAudit.importedFiles}</strong>个已入库</span>
              <span><strong>{importAudit.pendingFiles}</strong>个待入库</span>
              <span><strong>{importAudit.invalidFiles}</strong>个无效</span>
            </div>
            <div className="crawler-file-list">
              {importAudit.rows.map((row, index) => (
                <div key={`${row.sourcePath || row.date}-${index}`} className={`crawler-file-row import-status-${row.status}`}>
                  <strong>{row.date} / {row.taskName || row.taskId || "本地文件"}</strong>
                  <span>{row.file || row.reason} <em>{row.statusLabel}</em></span>
                  {row.reason ? <small>{row.reason}</small> : <small>{row.sourcePath}</small>}
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="crawler-empty">点击“检查入库状态”后，将列出周期内已获取但尚未入库的文件。</p>
        )}
      </section>
    </div>
  );
}

async function apiRequest<T = Record<string, unknown>>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
    headers: { "Content-Type": "application/json; charset=utf-8", ...(init?.headers || {}) },
    ...init,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || payload.error || "请求失败，请稍后重试。");
  }
  return payload as T;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function formatTime(value?: string) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("zh-CN", { hour12: false });
}

function jobStateLabel(state?: string) {
  if (state === "starting") return "正在创建";
  if (state === "running") return "执行中";
  if (state === "stopping") return "中断中";
  if (state === "completed") return "已完成";
  if (state === "failed") return "执行失败";
  if (state === "cancelled") return "已中断";
  return "未开始";
}
