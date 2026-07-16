const { buildDateRange } = require("../utils/date");

class SimpleScheduler {
  constructor(config, runner, logger) {
    this.config = config;
    this.runner = runner;
    this.logger = logger;
    this.lastRunKeys = new Set();
  }

  start() {
    if (!this.config.schedule?.enabled) {
      throw new Error("schedule.enabled 为 false，请在配置文件中开启后再执行 schedule。");
    }

    this.logger.info("定时器已启动。", { runs: this.config.schedule.runs });
    this.tick();
    setInterval(() => this.tick(), 30 * 1000);
  }

  async tick() {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const dateKey = now.toISOString().slice(0, 10);

    for (const run of this.config.schedule.runs || []) {
      if (run.time !== hhmm) continue;
      const key = `${dateKey}:${run.name}:${run.time}`;
      if (this.lastRunKeys.has(key)) continue;
      this.lastRunKeys.add(key);
      try {
        const dateRange = buildDateRange(run.dateRange || { mode: "yesterday" });
        await this.runner.run({ dateRange, taskIds: run.tasks || this.config.tasks.enabled });
      } catch (error) {
        this.logger.error("定时任务失败。", { run: run.name, error: error.message });
      }
    }
  }
}

module.exports = { SimpleScheduler };
