const { DayAheadBasicClickDownloader } = require("./day-ahead-basic-click-downloader");
const { GenericClickDownloader, ROUTES } = require("./generic-click-downloader");
const { getClickTask } = require("./click-task-catalog");
const { enumerateDates } = require("../utils/date");

const CLICK_PLANS = {
  "market-clearing": {
    route: ROUTES.home,
    actions: [{ section: "现货分日出清量价" }]
  },
  "day-ahead-node-price": {
    route: ROUTES.dayAheadNodePrice,
    actions: [{}]
  },
  "real-time-node-price": {
    route: ROUTES.realTimeNodePrice,
    actions: [{}]
  },
  "spot-hourly-type-energy-day-ahead": {
    route: ROUTES.home,
    actions: [
      { key: "day-ahead", section: "现货分时分类型出清电量", tab: "日前", expectedStage: "日前", subfolder: "日前", waitAfterTabMs: 2500 }
    ]
  },
  "spot-hourly-type-energy-real-time": {
    route: ROUTES.home,
    actions: [
      { key: "real-time", section: "现货分时分类型出清电量", tab: "实时", expectedStage: "实时", subfolder: "实时", waitAfterTabMs: 2500 }
    ]
  }
};

class ClickRunner {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.dayAheadBasic = new DayAheadBasicClickDownloader(config, logger);
    this.generic = new GenericClickDownloader(config, logger);
  }

  async run({
    start,
    end,
    taskIds,
    exactTargets,
    supplement = false,
    overwrite = false,
    stageMode = "both",
    shouldStop = () => false,
    onEvent
  }) {
    const queue = buildRunQueue({ start, end, taskIds, exactTargets });
    const results = [];
    emit(onEvent, "queued", {
      message: exactTargets?.length
        ? `已按缺失清单生成 ${queue.length} 个补采任务`
        : `已生成 ${queue.length} 个运行任务`
    });
    for (const { date, taskId, slotKeys } of queue) {
      if (shouldStop()) {
        emit(onEvent, "cancelled", { date, taskId, message: "任务已中断" });
        return results;
      }
      const task = getClickTask(taskId);
      if (!task) {
        const result = { date, taskId, status: "failed", message: "未知数据项" };
        results.push(result);
        emit(onEvent, "failed", result);
        continue;
      }

      const modeText = supplement ? "补充获取" : overwrite ? "覆盖获取" : "常规获取";
      emit(onEvent, "running", { date, taskId, taskName: task.name, message: `开始${modeText}` });
      try {
        const result = await this.runOne(task, date, { supplement, overwrite, stageMode, slotKeys, shouldStop });
        results.push({ date, taskId, taskName: task.name, ...result });
        emit(onEvent, result.status, { date, taskId, taskName: task.name, ...result });
      } catch (error) {
        if (error.code === "CANCELLED") {
          const result = { date, taskId, taskName: task.name, status: "cancelled", message: error.message };
          results.push(result);
          emit(onEvent, "cancelled", result);
          return results;
        }
        const result = { date, taskId, taskName: task.name, status: "failed", message: error.message };
        results.push(result);
        emit(onEvent, "failed", result);
      }
    }
    return results;
  }

  async runOne(task, date, options = {}) {
    if (task.id === "basic-day-ahead" || task.id === "basic-real-time") {
      const slotKey = task.id === "basic-real-time" ? "real-time" : "day-ahead";
      const result = await this.dayAheadBasic.download({
        date,
        ...options,
        slotKeys: [slotKey],
        stageMode: slotKey
      });
      return {
        status: "completed",
        message: buildCompletedMessage(result.files),
        files: result.files || [],
        downloadDir: result.downloadDir
      };
    }

    const plan = CLICK_PLANS[task.id];
    if (!plan) {
      return {
        status: "skipped",
        message: "当前登录页面暂未定位到该数据项的可点击入口，未执行下载",
        files: []
      };
    }

    const result = await this.generic.download({ task, date, plan, ...options });
    return {
      status: "completed",
      message: buildCompletedMessage(result.files),
      files: result.files || [],
      downloadDir: result.downloadDir
    };
  }
}

function buildRunQueue({ start, end, taskIds, exactTargets }) {
  if (Array.isArray(exactTargets) && exactTargets.length > 0) {
    const grouped = new Map();
    for (const item of exactTargets) {
      if (!item || !item.date || !item.taskId) continue;
      const key = `${item.date}::${item.taskId}`;
      const target = grouped.get(key) || { date: item.date, taskId: item.taskId, slotKeys: new Set() };
      if (item.slotKey) target.slotKeys.add(item.slotKey);
      grouped.set(key, target);
    }
    return Array.from(grouped.values())
      .map((item) => ({
        date: item.date,
        taskId: item.taskId,
        slotKeys: item.slotKeys.size ? Array.from(item.slotKeys).sort() : undefined
      }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.taskId.localeCompare(b.taskId));
  }
  const dates = enumerateDates(start, end);
  return dates.flatMap((date) => (taskIds || []).map((taskId) => ({ date, taskId })));
}

function buildCompletedMessage(files = []) {
  const existing = files.filter((file) => file.existing).length;
  const downloaded = files.length - existing;
  if (downloaded > 0 && existing > 0) return `下载 ${downloaded} 个文件，保留已有 ${existing} 个文件`;
  if (downloaded > 0) return `已通过页面模拟点击完成导出，下载 ${downloaded} 个文件`;
  if (existing > 0) return `补充获取模式下已有文件完整，跳过下载 ${existing} 个文件`;
  return "未发现新增下载文件";
}

function emit(onEvent, type, payload) {
  if (onEvent) onEvent({ time: new Date().toISOString(), type, ...payload });
}

module.exports = { ClickRunner, buildRunQueue };
