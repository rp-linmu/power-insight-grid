const fs = require("fs");
const { inspectExcelContent } = require("./excel-content-validator");
const { readWorkbookSheetNames } = require("./excel-content-validator");

const DATE_PATTERN = /(\d{4}-\d{2}-\d{2})/;

function validateDownloadedFiles({ files, requestedDate, taskName, expectedStage }) {
  const accepted = [];
  const rejected = [];

  for (const file of files || []) {
    if (file.existing) {
      accepted.push(file);
      continue;
    }

    const detectedDate = extractDate(file.file);
    const content = inspectExcelContent(file.path, { taskName });
    const stage = expectedStage ? inspectStage(file.path, expectedStage) : { valid: true };
    if (detectedDate === requestedDate && content.valid && stage.valid) {
      accepted.push({ ...file, detectedDate, content });
      continue;
    }

    deleteFile(file.path);
    rejected.push({
      file: file.file,
      requestedDate,
      detectedDate,
      reason: detectedDate !== requestedDate ? "文件日期不匹配" : !content.valid ? content.reason : stage.reason,
      content,
      deletedPath: file.path
    });
  }

  if (rejected.length > 0) {
    const details = rejected
      .map(
        (item) =>
          `${item.file}: ${item.reason}，请求 ${item.requestedDate}，文件日期 ${item.detectedDate || "未识别"}`
      )
      .join("；");
    const error = new Error(`${taskName} 下载文件校验失败，错误文件已删除。${details}`);
    error.code = rejected.some((item) => item.detectedDate === requestedDate)
      ? "DOWNLOAD_CONTENT_EMPTY"
      : "DOWNLOAD_DATE_MISMATCH";
    error.rejectedFiles = rejected;
    throw error;
  }

  return accepted;
}

function selectExistingFilesForDate({ files, requestedDate, taskName, expectedStage }) {
  const accepted = [];
  const rejected = [];

  for (const file of files || []) {
    const detectedDate = extractDate(file.file);
    const content = inspectExcelContent(file.path, { taskName });
    const stage = expectedStage ? inspectStage(file.path, expectedStage) : { valid: true };
    if (detectedDate === requestedDate && content.valid && stage.valid) {
      accepted.push({ ...file, detectedDate, content, existing: true });
      continue;
    }

    deleteFile(file.path);
    rejected.push({
      ...file,
      detectedDate,
      reason: detectedDate !== requestedDate ? "文件日期不匹配" : !content.valid ? content.reason : stage.reason,
      content,
      deletedPath: file.path
    });
  }

  return { accepted, rejected };
}

function extractDate(filename) {
  return String(filename || "").match(DATE_PATTERN)?.[1] || null;
}

function deleteFile(filePath) {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

function inspectStage(filePath, expectedStage) {
  if (!expectedStage) return { valid: true };
  const sheetNames = readWorkbookSheetNames(filePath);
  if (sheetNames.length === 0) return { valid: false, reason: "未读取到工作表名称" };
  const expectedFound = sheetNames.some((name) => String(name).includes(expectedStage));
  const oppositeStage = expectedStage === "实时" ? "日前" : expectedStage === "日前" ? "实时" : "";
  const onlyOpposite = oppositeStage && sheetNames.every((name) => String(name).includes(oppositeStage) && !String(name).includes(expectedStage));
  if (expectedFound && !onlyOpposite) return { valid: true };
  return {
    valid: false,
    reason: `文件市场阶段不匹配，期望${expectedStage}，工作表为 ${sheetNames.join("、") || "空"}`
  };
}

module.exports = { validateDownloadedFiles, selectExistingFilesForDate, extractDate };
