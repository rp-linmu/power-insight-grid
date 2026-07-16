const fs = require("fs");
const path = require("path");
const { inspectExcelContent } = require("../browser/excel-content-validator");

class LocalFileStore {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.rootDir = path.resolve(process.cwd(), config.output.rootDir);
    fs.mkdirSync(this.rootDir, { recursive: true });
  }

  saveOriginalExcel({ task, date, buffer, filename }) {
    const safeCategory = sanitizePathSegment(task.category);
    const safeTaskName = sanitizePathSegment(`${task.id}_${task.name}`);
    const dir = path.join(this.rootDir, safeCategory, safeTaskName, date);
    fs.mkdirSync(dir, { recursive: true });

    const finalName = this.config.output.preserveOriginalFilename
      ? sanitizeFilename(filename)
      : `${task.id}_${date}${guessExtension(filename)}`;
    const target = path.join(dir, finalName);
    fs.writeFileSync(target, buffer);
    const content = inspectExcelContent(target, { taskId: task.id, taskName: task.name });
    if (!content.valid) {
      fs.unlinkSync(target);
      const error = new Error(`下载文件无有效数据，已删除: ${content.reason}`);
      error.code = "DOWNLOAD_CONTENT_EMPTY";
      throw error;
    }
    return target;
  }

  hasOriginalExcel({ task, date }) {
    return listExcelFiles(this.originalDir(task, date)).some((filePath) =>
      inspectExcelContent(filePath, { taskId: task.id, taskName: task.name }).valid
    );
  }

  clearOriginalExcel({ task, date }) {
    for (const filePath of listExcelFiles(this.originalDir(task, date))) {
      fs.unlinkSync(filePath);
    }
  }

  originalDir(task, date) {
    const safeCategory = sanitizePathSegment(task.category);
    const safeTaskName = sanitizePathSegment(`${task.id}_${task.name}`);
    return path.join(this.rootDir, safeCategory, safeTaskName, date);
  }
}

function sanitizePathSegment(value) {
  return String(value).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim();
}

function sanitizeFilename(value) {
  const filename = sanitizePathSegment(value || "download.xlsx");
  if (/\.(xlsx|xls)$/i.test(filename)) return filename;
  return `${filename}.xlsx`;
}

function guessExtension(filename) {
  if (/\.xls$/i.test(filename)) return ".xls";
  return ".xlsx";
}

function listExcelFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => /\.(xlsx|xls)$/i.test(name) && !name.startsWith("~$"))
    .map((name) => path.join(dir, name))
    .filter((filePath) => fs.statSync(filePath).isFile());
}

module.exports = { LocalFileStore };
