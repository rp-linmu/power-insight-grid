function parseDateRangeFromArgs(args) {
  if (args.date) return { start: args.date, end: args.date };
  if (args.start && args.end) return { start: args.start, end: args.end };
  throw new Error("请提供 --date YYYY-MM-DD 或 --start YYYY-MM-DD --end YYYY-MM-DD。");
}

function buildDateRange(rule) {
  if (rule.mode === "today") {
    const today = formatDate(new Date());
    return { start: today, end: today };
  }
  if (rule.mode === "yesterday") {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    const yesterday = formatDate(date);
    return { start: yesterday, end: yesterday };
  }
  if (rule.mode === "fixed") {
    if (!rule.start || !rule.end) throw new Error("fixed dateRange 需要 start 和 end。");
    return { start: rule.start, end: rule.end };
  }
  throw new Error(`未知 dateRange.mode: ${rule.mode}`);
}

function enumerateDates(start, end) {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  if (startDate > endDate) throw new Error("开始日期不能晚于结束日期。");
  const dates = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    dates.push(formatDate(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`日期格式错误: ${value}`);
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) throw new Error(`日期无效: ${value}`);
  return date;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

module.exports = { parseDateRangeFromArgs, buildDateRange, enumerateDates };
