const { resolveTasks } = require("./catalog");
const { enumerateDates } = require("../utils/date");

class TaskRunner {
  constructor(config, client, store, logger) {
    this.config = config;
    this.client = client;
    this.store = store;
    this.logger = logger;
  }

  async run({ dateRange, taskIds, supplement = false, overwrite = false }) {
    const tasks = resolveTasks(taskIds || this.config.tasks.enabled);
    const dates = enumerateDates(dateRange.start, dateRange.end);
    this.logger.info("开始执行任务。", {
      tasks: tasks.map((task) => task.id),
      start: dateRange.start,
      end: dateRange.end
    });

    let saved = 0;
    let skipped = 0;
    let failed = 0;

    for (const task of tasks) {
      for (const date of dates) {
        try {
          if (supplement && !overwrite && this.store.hasOriginalExcel({ task, date })) {
            skipped += 1;
            this.logger.info("补充获取模式下已有文件，跳过任务。", { task: task.id, date });
            continue;
          }
          if (overwrite) {
            this.store.clearOriginalExcel({ task, date });
          }
          const result = await this.client.downloadExcel(task, date);
          if (result.skipped) {
            skipped += 1;
            this.logger.warn("跳过任务。", { task: task.id, date, reason: result.reason });
            continue;
          }
          const target = this.store.saveOriginalExcel({ task, date, buffer: result.buffer, filename: result.filename });
          saved += 1;
          this.logger.info("已保存原始 Excel。", { task: task.id, date, path: target });
        } catch (error) {
          failed += 1;
          this.logger.error("任务执行失败。", { task: task.id, date, error: error.message });
        }
      }
    }

    this.logger.info("任务执行结束。", { saved, skipped, failed });
    if (failed > 0) {
      throw new Error(`有 ${failed} 个任务执行失败，请查看日志。`);
    }
  }
}

module.exports = { TaskRunner };
