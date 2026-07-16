const fs = require("fs");
const zlib = require("zlib");

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const inspectionCache = new Map();

function inspectExcelContent(filePath, context = {}) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size === 0) {
      return invalid("文件大小为 0");
    }
    const minimumCellsPerDataRow = resolveMinimumCellsPerDataRow(filePath, context);
    const cacheKey = `${filePath}::${stat.size}::${stat.mtimeMs}::${minimumCellsPerDataRow}`;
    const cached = inspectionCache.get(cacheKey);
    if (cached) return cached;
    if (/\.xls$/i.test(filePath) && !/\.xlsx$/i.test(filePath)) {
      const result = stat.size >= 4096
        ? { valid: true, reason: "旧版 XLS 文件仅执行大小校验", sheetCount: null, dataRows: null }
        : invalid("旧版 XLS 文件过小");
      inspectionCache.set(cacheKey, result);
      return result;
    }

    const entries = readZipEntries(fs.readFileSync(filePath));
    const sheetNames = Array.from(entries.keys()).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name));
    if (sheetNames.length === 0) {
      const result = invalid("工作簿中没有可读取的工作表");
      inspectionCache.set(cacheKey, result);
      return result;
    }

    let totalDataRows = 0;
    let populatedSheets = 0;
    for (const sheetName of sheetNames) {
      const xml = entries.get(sheetName).toString("utf8");
      const dataRows = countDataRows(xml, minimumCellsPerDataRow);
      if (dataRows > 0) populatedSheets += 1;
      totalDataRows += dataRows;
    }

    if (totalDataRows === 0) {
      const result = invalid("工作簿只有表头或数据区为空", {
        sheetCount: sheetNames.length,
        populatedSheets,
        dataRows: 0
      });
      inspectionCache.set(cacheKey, result);
      return result;
    }

    const result = {
      valid: true,
      reason: "工作簿包含有效数据",
      sheetCount: sheetNames.length,
      populatedSheets,
      dataRows: totalDataRows
    };
    inspectionCache.set(cacheKey, result);
    return result;
  } catch (error) {
    return invalid(`Excel 内容解析失败: ${error.message}`);
  }
}

function readWorkbookSheetNames(filePath) {
  try {
    if (/\.xls$/i.test(filePath) && !/\.xlsx$/i.test(filePath)) return [];
    const entries = readZipEntries(fs.readFileSync(filePath));
    const workbook = entries.get("xl/workbook.xml");
    if (!workbook) return [];
    const xml = workbook.toString("utf8");
    return Array.from(xml.matchAll(/<sheet\b[^>]*\bname="([^"]*)"/gi)).map((match) => decodeXml(match[1]));
  } catch {
    return [];
  }
}

function countDataRows(xml, minimumCellsPerDataRow) {
  const rows = xml.match(/<row\b[\s\S]*?<\/row>/gi) || [];
  return rows.slice(1).filter((row) => {
    const cells = row.match(/<c\b[\s\S]*?<\/c>/gi) || [];
    const populatedCells = cells.filter((cell) => {
      const value = cell.match(/<v>([\s\S]*?)<\/v>/i)?.[1];
      if (value !== undefined && decodeXml(value).trim() !== "") return true;
      const inlineText = Array.from(cell.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gi))
        .map((match) => decodeXml(match[1]))
        .join("")
        .trim();
      return inlineText !== "";
    }).length;
    return populatedCells >= minimumCellsPerDataRow;
  }).length;
}

function resolveMinimumCellsPerDataRow(filePath, context) {
  const identity = [
    filePath,
    context.taskId,
    context.taskName
  ].filter(Boolean).join(" ");
  if (
    identity.includes("spot-hourly-type-energy") ||
    identity.includes("现货分时分类型出清电量")
  ) {
    // The export always contains a time column. A row is only data when at
    // least one business-value cell is populated alongside that time.
    return 2;
  }
  return 1;
}

function readZipEntries(buffer) {
  const eocdOffset = findSignatureBackwards(buffer, EOCD_SIGNATURE);
  if (eocdOffset < 0) throw new Error("不是有效的 ZIP/XLSX 文件");
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = new Map();
  let offset = centralOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
      throw new Error("ZIP 中央目录损坏");
    }
    const compression = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8").replace(/\\/g, "/");

    if (/^xl\/worksheets\/sheet\d+\.xml$/i.test(name) || name === "xl/workbook.xml") {
      entries.set(name, extractEntry(buffer, localOffset, compressedSize, compression));
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function extractEntry(buffer, localOffset, compressedSize, compression) {
  if (buffer.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
    throw new Error("ZIP 本地文件头损坏");
  }
  const nameLength = buffer.readUInt16LE(localOffset + 26);
  const extraLength = buffer.readUInt16LE(localOffset + 28);
  const dataOffset = localOffset + 30 + nameLength + extraLength;
  const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
  if (compression === 0) return compressed;
  if (compression === 8) return zlib.inflateRawSync(compressed);
  throw new Error(`不支持的 ZIP 压缩方式: ${compression}`);
}

function findSignatureBackwards(buffer, signature) {
  const minimum = Math.max(0, buffer.length - 65557);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === signature) return offset;
  }
  return -1;
}

function decodeXml(value) {
  return String(value)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function invalid(reason, details = {}) {
  return { valid: false, reason, sheetCount: 0, populatedSheets: 0, dataRows: 0, ...details };
}

module.exports = { inspectExcelContent, readWorkbookSheetNames };
