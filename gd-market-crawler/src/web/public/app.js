const taskList = document.querySelector("#taskList");
const startDate = document.querySelector("#startDate");
const endDate = document.querySelector("#endDate");
const supplementMode = document.querySelector("#supplementMode");
const overwriteMode = document.querySelector("#overwriteMode");
const runButton = document.querySelector("#runButton");
const auditButton = document.querySelector("#auditButton");
const stopButton = document.querySelector("#stopButton");
const selectReady = document.querySelector("#selectReady");
const selectAll = document.querySelector("#selectAll");
const log = document.querySelector("#log");
const files = document.querySelector("#files");
const jobState = document.querySelector("#jobState");
const auditState = document.querySelector("#auditState");
const auditSummary = document.querySelector("#auditSummary");
const auditResults = document.querySelector("#auditResults");

let tasks = [];
let pollTimer = null;
let currentJobId = null;
let lastAuditPlan = null;

init();

async function init() {
  const today = new Date().toISOString().slice(0, 10);
  startDate.value = today;
  endDate.value = today;
  const response = await fetch("/api/tasks");
  const payload = await response.json();
  tasks = payload.tasks;
  renderTasks();
}

function renderTasks() {
  taskList.innerHTML = tasks.map((task) => `
    <label class="task">
      <input type="checkbox" value="${task.id}" ${task.status === "ready" ? "checked" : ""}>
      <span>
        <span class="task-title">${escapeHtml(task.name)}</span>
        <span class="task-desc">${escapeHtml(task.description)}</span>
      </span>
      <span class="badge ${task.status === "ready" ? "ready" : "pending"}">${task.status === "ready" ? "已接入" : "待接入"}</span>
    </label>
  `).join("");
}

selectReady.addEventListener("click", () => {
  document.querySelectorAll(".task input").forEach((input) => {
    const task = tasks.find((item) => item.id === input.value);
    input.checked = task?.status === "ready";
  });
});

selectAll.addEventListener("click", () => {
  document.querySelectorAll(".task input").forEach((input) => {
    input.checked = true;
  });
});

runButton.addEventListener("click", async () => {
  const taskIds = selectedTaskIds();
  if (!validateSelection(taskIds, appendLog)) return;
  let exactTargets = [];
  if (supplementMode.checked) {
    const signature = selectionSignature(taskIds);
    if (!lastAuditPlan || lastAuditPlan.signature !== signature) {
      appendLog("failed", "请先按当前日期范围和数据项执行“检查缺失数据”，再开始补充获取");
      return;
    }
    exactTargets = lastAuditPlan.targets;
    if (exactTargets.length === 0) {
      appendLog("completed", "当前检查结果没有缺失数据，无需补充获取");
      return;
    }
  }

  runButton.disabled = true;
  auditButton.disabled = true;
  stopButton.disabled = false;
  log.innerHTML = "";
  files.innerHTML = "暂无下载文件";
  files.className = "files empty";
  setState("running", supplementMode.checked ? "补采中" : overwriteMode.checked ? "覆盖中" : "运行中");

  const response = await fetch("/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      start: startDate.value,
      end: endDate.value,
      taskIds,
      exactTargets,
      supplement: supplementMode.checked,
      overwrite: overwriteMode.checked
    })
  });
  const payload = await response.json();
  currentJobId = payload.id;
  poll(payload.id);
});

stopButton.addEventListener("click", async () => {
  if (!currentJobId) return;
  stopButton.disabled = true;
  setState("stopping", "中断中");
  appendLog("cancelled", "已发送中断请求");
  await fetch("/api/stop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: currentJobId })
  });
});

function poll(id) {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    const response = await fetch(`/api/status?id=${encodeURIComponent(id)}`);
    const job = await response.json();
    renderJob(job);
    if (isFinished(job.state)) {
      clearInterval(pollTimer);
      runButton.disabled = false;
      auditButton.disabled = false;
      stopButton.disabled = true;
      currentJobId = null;
    }
  }, 1000);
}

auditButton.addEventListener("click", async () => {
  const taskIds = selectedTaskIds();
  if (!validateSelection(taskIds, (_, message) => renderAuditError(message))) return;

  auditButton.disabled = true;
  auditState.textContent = "检查中";
  auditState.className = "badge";
  auditSummary.textContent = "正在扫描已下载文件目录...";
  auditResults.className = "audit-results empty";
  auditResults.textContent = "检查中";

  try {
    const response = await fetch("/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        start: startDate.value,
        end: endDate.value,
        taskIds
      })
    });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error || "检查失败");
    lastAuditPlan = {
      signature: selectionSignature(taskIds),
      targets: result.supplementTargets || []
    };
    renderAudit(result);
  } catch (error) {
    lastAuditPlan = null;
    renderAuditError(error.message || String(error));
  } finally {
    auditButton.disabled = false;
  }
});

function selectedTaskIds() {
  return Array.from(document.querySelectorAll(".task input:checked")).map((item) => item.value);
}

function selectionSignature(taskIds) {
  return JSON.stringify({
    start: startDate.value,
    end: endDate.value,
    taskIds: [...taskIds].sort()
  });
}

function validateSelection(taskIds, report) {
  if (!startDate.value || !endDate.value) {
    report("failed", "请选择开始日期和结束日期");
    return false;
  }
  if (taskIds.length === 0) {
    report("failed", "请至少选择一个数据项");
    return false;
  }
  return true;
}

function renderAudit(result) {
  const complete = result.missingSlots === 0;
  auditState.textContent = complete ? "数据齐全" : `缺失 ${result.missingSlots}`;
  auditState.className = `badge ${complete ? "ready" : "pending"}`;
  auditSummary.innerHTML = `
    <div class="audit-metrics">
      <span><strong>${result.checkedDates}</strong> 天</span>
      <span><strong>${result.checkedTasks}</strong> 个数据项</span>
      <span><strong>${result.presentSlots}/${result.expectedSlots}</strong> 项齐全</span>
      <span><strong>${result.completeness}%</strong> 完整率</span>
      <span><strong>${(result.supplementTargets || []).length}</strong> 个补采任务</span>
    </div>
    <div class="audit-root">扫描目录：${escapeHtml(result.rootDir)}</div>
  `;

  const rows = [];
  for (const item of result.missing || []) {
    rows.push(`
      <div class="audit-item missing">
        <div><strong>${escapeHtml(item.date)}</strong> / ${escapeHtml(item.taskName)} / ${escapeHtml(item.slot)}</div>
        <div class="audit-path">${escapeHtml(item.reason || "文件不存在")} · ${escapeHtml(item.expectedDir)}</div>
      </div>
    `);
  }
  for (const item of result.invalidFiles || []) {
    rows.push(`
      <div class="audit-item unsupported">
        <div><strong>${escapeHtml(item.date)}</strong> / ${escapeHtml(item.taskName)} / ${escapeHtml(item.slot)} / 错误文件已${item.deleted ? "删除" : "保留"}</div>
        <div class="audit-path">${escapeHtml(item.reason || "文件无效")} · ${escapeHtml(item.path || item.file || "")}</div>
      </div>
    `);
  }
  for (const item of result.unsupported || []) {
    rows.push(`
      <div class="audit-item unsupported">
        <div><strong>${escapeHtml(item.taskName)}</strong> / 不参与检查</div>
        <div class="audit-path">${escapeHtml(item.reason)}</div>
      </div>
    `);
  }

  auditResults.className = rows.length ? "audit-results" : "audit-results empty";
  auditResults.innerHTML = rows.length ? rows.join("") : "指定周期内所选数据项均已获取。";
}

function renderAuditError(message) {
  lastAuditPlan = null;
  auditState.textContent = "检查失败";
  auditState.className = "badge pending";
  auditSummary.textContent = message;
  auditResults.className = "audit-results empty";
  auditResults.textContent = "请检查日期范围和配置后重试。";
}

function renderJob(job) {
  setState(job.state, stateText(job.state));
  log.innerHTML = (job.events || []).map((event) => {
    const message = `${formatTime(event.time)} [${event.type}] ${event.date || ""} ${event.taskName || event.taskId || ""} ${event.message || ""}`;
    return `<div class="log-line ${event.type}">${escapeHtml(message)}</div>`;
  }).join("");
  log.scrollTop = log.scrollHeight;

  const downloaded = [];
  for (const result of job.results || []) {
    for (const file of result.files || []) {
      downloaded.push({ ...file, taskName: result.taskName, date: result.date });
    }
  }
  if (downloaded.length === 0) return;
  files.className = "files";
  files.innerHTML = downloaded.map((file) => `
    <div class="file">
      <div class="file-name">${escapeHtml(file.taskName)} / ${escapeHtml(file.date)} / ${escapeHtml(file.file)}${file.existing ? " / 已存在" : ""}</div>
      <div class="file-path">${escapeHtml(file.path)}</div>
    </div>
  `).join("");
}

function appendLog(type, message) {
  log.insertAdjacentHTML("beforeend", `<div class="log-line ${type}">${escapeHtml(message)}</div>`);
}

function setState(state, text) {
  jobState.textContent = text;
  jobState.className = `badge ${state === "completed" ? "ready" : state === "running" || state === "stopping" ? "" : state === "failed" ? "pending" : state === "cancelled" ? "pending" : "muted"}`;
}

function stateText(state) {
  if (state === "running") return "运行中";
  if (state === "stopping") return "中断中";
  if (state === "completed") return "已完成";
  if (state === "failed") return "失败";
  if (state === "cancelled") return "已中断";
  return "未开始";
}

function isFinished(state) {
  return state === "completed" || state === "failed" || state === "cancelled";
}

function formatTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("zh-CN", { hour12: false });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}
