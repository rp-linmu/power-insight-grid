const { loadConfig } = require("./config");
const { createLogger } = require("./logger");
const { UKeyLoginProvider } = require("./auth/ukey-login-provider");
const { GdMarketClient } = require("./client/gd-market-client");
const { LocalFileStore } = require("./storage/local-file-store");
const { TaskRunner } = require("./tasks/task-runner");
const { listCatalogTasks } = require("./tasks/catalog");
const { SimpleScheduler } = require("./scheduler/simple-scheduler");
const { DayAheadBasicClickDownloader } = require("./browser/day-ahead-basic-click-downloader");
const { WebConsoleServer } = require("./web/server");
const { parseDateRangeFromArgs } = require("./utils/date");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] || "help";

  if (command === "help" || args.help) {
    printHelp();
    return;
  }

  if (command === "list-tasks") {
    for (const task of listCatalogTasks()) {
      console.log(`${task.id}\t${task.category}\t${task.name}\t${task.endpointKey}`);
    }
    return;
  }

  const config = loadConfig(args.config || "config.local.json");
  const logger = createLogger(config);

  if (command === "web") {
    const server = new WebConsoleServer({
      configPath: args.config || "config.local.json",
      port: Number(args.port || 8787)
    });
    server.start();
    return;
  }

  if (command === "click-day-ahead-basic") {
    if (!args.date) throw new Error("click-day-ahead-basic 需要 --date YYYY-MM-DD。");
    const downloader = new DayAheadBasicClickDownloader(config, logger);
    const result = await downloader.download({ date: args.date });
    logger.info("模拟点击下载完成。", result);
    return;
  }

  const authProvider = new UKeyLoginProvider(config, logger);
  const client = new GdMarketClient(config, authProvider, logger);
  const store = new LocalFileStore(config, logger);
  const runner = new TaskRunner(config, client, store, logger);

  if (command === "run") {
    const dateRange = parseDateRangeFromArgs(args);
    const taskIds = parseTaskArgs(args.task || args.tasks || config.tasks.enabled);
    await runner.run({ dateRange, taskIds, supplement: Boolean(args.supplement), overwrite: Boolean(args.overwrite) });
    return;
  }

  if (command === "schedule") {
    const scheduler = new SimpleScheduler(config, runner, logger);
    scheduler.start();
    return;
  }

  throw new Error(`未知命令: ${command}`);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) {
      args._.push(item);
      continue;
    }
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function parseTaskArgs(value) {
  if (Array.isArray(value)) return value;
  if (!value) return ["all"];
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function printHelp() {
  console.log(`广东交易中心本地原始 Excel 获取工具

用法:
  node src/index.js list-tasks
  node src/index.js run --config config.local.json --start 2026-05-01 --end 2026-05-07 --task all
  node src/index.js run --config config.local.json --start 2026-05-01 --end 2026-05-07 --task all --supplement
  node src/index.js run --config config.local.json --date 2026-05-25 --task market_overview --overwrite
  node src/index.js run --config config.local.json --date 2026-05-25 --task market_overview
  node src/index.js click-day-ahead-basic --config config.local.json --date 2026-05-26
  node src/index.js web --config config.local.json --port 8787
  node src/index.js schedule --config config.local.json

说明:
  - 需要 Node.js 20 或更高版本。
  - auth.cookieHeader 必须来自 UKey 登录后的广东交易中心浏览器会话。
  - click-day-ahead-basic 使用已登录 Chrome 页面模拟点击，不直接拼交易中心导出接口。
  - endpoints 需要按真实交易中心导出接口逐步补齐；未配置接口的任务会跳过并记录原因。
`);
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
