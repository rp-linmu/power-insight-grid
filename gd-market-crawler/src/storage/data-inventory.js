const fs = require("fs");
const path = require("path");
const { getClickTask } = require("../browser/click-task-catalog");
const { enumerateDates } = require("../utils/date");
const { inspectExcelContent, readWorkbookSheetNames } = require("../browser/excel-content-validator");

const DATE_PATTERN = /(\d{4}-\d{2}-\d{2})/;
const EXPECTED_SLOTS = {
  "market-clearing": [{ key: "main", label: "市场出清", subfolder: null }],
  "basic-day-ahead": [{ key: "day-ahead", label: "预测", subfolder: "日前" }],
  "basic-real-time": [{ key: "real-time", label: "实际", subfolder: "实时" }],
  "day-ahead-node-price": [{ key: "main", label: "日前节点电价", subfolder: null }],
  "real-time-node-price": [{ key: "main", label: "实时节点电价", subfolder: null }],
  "spot-hourly-type-energy-day-ahead": [{ key: "day-ahead", label: "日前", subfolder: "日前", expectedStage: "日前" }],
  "spot-hourly-type-energy-real-time": [{ key: "real-time", label: "实时", subfolder: "实时", expectedStage: "实时" }]
};

function auditDownloadedData(config, { start, end, taskIds, stageMode = "both" }) {
  const dates = enumerateDates(start, end);
  const rootDir = path.resolve(process.cwd(), config.output.rootDir, "browser-downloads");
  const selectedTaskIds = Array.from(new Set(taskIds || []));
  const missing = [];
  const unsupported = [];
  const invalidFiles = [];
  let expectedSlots = 0;
  let presentSlots = 0;
  let fileCount = 0;

  for (const taskId of selectedTaskIds) {
    const task = getClickTask(taskId);
    const slots = filterSlots(EXPECTED_SLOTS[taskId], stageMode);
    if (!task || task.status !== "ready" || !slots) {
      unsupported.push({
        taskId,
        taskName: task?.name || taskId,
        reason: task ? "该数据项尚未接入" : "未知数据项"
      });
      continue;
    }

    for (const date of dates) {
      const taskDir = path.join(rootDir, sanitizeSegment(task.storageName || task.name), date);
      for (const slot of slots) {
        expectedSlots += 1;
        const targetDir = slot.subfolder ? path.join(taskDir, sanitizeSegment(slot.subfolder)) : taskDir;
        const inspection = inspectExcelFiles(targetDir, date, {
          taskId,
          taskName: task.name,
          expectedStage: slot.expectedStage
        });
        const files = inspection.valid;
        invalidFiles.push(...inspection.invalid.map((file) => ({
          date,
          taskId,
          taskName: task.name,
          slot: slot.label,
          ...file
        })));
        if (files.length > 0) {
          presentSlots += 1;
          fileCount += files.length;
          continue;
        }
        missing.push({
          date,
          taskId,
          taskName: task.name,
          slotKey: slot.key,
          slot: slot.label,
          expectedDir: targetDir,
          reason: inspection.invalid.length > 0 ? "已有文件为空或无有效数据" : "文件不存在",
          invalidFiles: inspection.invalid
        });
      }
    }
  }

  const supplementTargets = Array.from(
    new Map(
      missing.map((item) => [
        `${item.date}::${item.taskId}`,
        { date: item.date, taskId: item.taskId, slotKey: item.slotKey }
      ])
    ).values()
  ).sort((a, b) => a.date.localeCompare(b.date) || a.taskId.localeCompare(b.taskId));

  return {
    ok: true,
    start,
    end,
    rootDir,
    checkedTasks: selectedTaskIds.length - unsupported.length,
    checkedDates: dates.length,
    expectedSlots,
    presentSlots,
    missingSlots: missing.length,
    completeness: expectedSlots > 0 ? Number(((presentSlots / expectedSlots) * 100).toFixed(1)) : 100,
    fileCount,
    missing,
    invalidFiles,
    supplementTargets,
    unsupported,
    checkedAt: new Date().toISOString()
  };
}

function inspectExcelFiles(dir, expectedDate, context = {}) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return { valid: [], invalid: [] };
  const candidates = fs.readdirSync(dir)
    .filter((name) => /\.(xlsx|xls)$/i.test(name))
    .filter((name) => !name.startsWith("~$"))
    .filter((name) => !expectedDate || name.match(DATE_PATTERN)?.[1] === expectedDate)
    .map((name) => path.join(dir, name))
    .filter((filePath) => fs.statSync(filePath).isFile());
  const valid = [];
  const invalid = [];
  for (const filePath of candidates) {
    const inspection = inspectExcelFile(filePath, context);
    if (inspection.valid) {
      valid.push(filePath);
    } else {
      const deleted = deleteInvalidFile(filePath);
      invalid.push({
        file: path.basename(filePath),
        path: filePath,
        reason: inspection.reason,
        deleted,
        sheetNames: inspection.sheetNames
      });
    }
  }
  return { valid, invalid };
}

function inspectExcelFile(filePath, context = {}) {
  const content = inspectExcelContent(filePath, context);
  if (!content.valid) return content;
  const stage = inspectExpectedStage(filePath, context.expectedStage);
  if (!stage.valid) return stage;
  return content;
}

function inspectExpectedStage(filePath, expectedStage) {
  if (!expectedStage) return { valid: true };
  const sheetNames = readWorkbookSheetNames(filePath);
  if (sheetNames.length === 0) {
    return { valid: false, reason: "未读取到工作表名称", sheetNames };
  }
  const expectedFound = sheetNames.some((name) => String(name).includes(expectedStage));
  const oppositeStage = expectedStage === "实时" ? "日前" : expectedStage === "日前" ? "实时" : "";
  const onlyOpposite = oppositeStage && sheetNames.every(
    (name) => String(name).includes(oppositeStage) && !String(name).includes(expectedStage)
  );
  if (expectedFound && !onlyOpposite) return { valid: true, sheetNames };
  return {
    valid: false,
    reason: `文件市场阶段不匹配，期望${expectedStage}，工作表为 ${sheetNames.join("、") || "空"}`,
    sheetNames
  };
}

function deleteInvalidFile(filePath) {
  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function filterSlots(slots, stageMode = "both") {
  if (!Array.isArray(slots)) return slots;
  return slots.filter((slot) => {
    if (stageMode === "day-ahead") return !slot.key || slot.key === "day-ahead";
    if (stageMode === "real-time") return !slot.key || slot.key === "real-time";
    return true;
  });
}

function sanitizeSegment(value) {
  return String(value).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim();
}

module.exports = { auditDownloadedData };
