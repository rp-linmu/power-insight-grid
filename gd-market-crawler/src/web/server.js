const fs = require("fs");
const http = require("http");
const path = require("path");
const { loadConfig } = require("../config");
const { createLogger } = require("../logger");
const { listClickTasks } = require("../browser/click-task-catalog");
const { ClickRunner } = require("../browser/click-runner");
const { auditDownloadedData } = require("../storage/data-inventory");

class WebConsoleServer {
  constructor({ configPath, port }) {
    this.configPath = configPath;
    this.port = port;
    this.publicDir = path.resolve(__dirname, "public");
    this.jobs = new Map();
    this.nextJobId = 1;
  }

  start() {
    const server = http.createServer((request, response) => {
      this.handle(request, response).catch((error) => {
        response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: error.message }));
      });
    });
    server.listen(this.port, "127.0.0.1", () => {
      console.log(`可视化控制台已启动: http://127.0.0.1:${this.port}`);
    });
    return server;
  }

  async handle(request, response) {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (request.method === "GET" && url.pathname === "/api/tasks") {
      return json(response, { tasks: listClickTasks() });
    }
    if (request.method === "GET" && url.pathname === "/api/status") {
      const id = url.searchParams.get("id");
      return json(response, this.jobs.get(id) || { error: "任务不存在" });
    }
    if (request.method === "POST" && url.pathname === "/api/run") {
      const body = await readJson(request);
      return json(response, this.createJob(body));
    }
    if (request.method === "POST" && url.pathname === "/api/stop") {
      const body = await readJson(request);
      return json(response, this.stopJob(body.id));
    }
    if (request.method === "POST" && url.pathname === "/api/audit") {
      const body = await readJson(request);
      const config = loadConfig(this.configPath);
      body.stageMode = normalizeStageMode(body.stageMode);
      return json(response, auditDownloadedData(config, body));
    }
    return this.serveStatic(url.pathname, response);
  }

  createJob(body) {
    const config = loadConfig(this.configPath);
    const logger = createLogger(config);
    const runner = new ClickRunner(config, logger);
    const id = String(this.nextJobId++);
    const job = {
      id,
      state: "running",
      start: body.start,
      end: body.end,
      taskIds: body.taskIds || [],
      exactTargets: Array.isArray(body.exactTargets) ? body.exactTargets : [],
      supplement: Boolean(body.supplement),
      overwrite: Boolean(body.overwrite),
      stageMode: normalizeStageMode(body.stageMode),
      cancelRequested: false,
      events: [],
      results: [],
      createdAt: new Date().toISOString()
    };
    this.jobs.set(id, job);

    runner.run({
      start: body.start,
      end: body.end,
      taskIds: body.taskIds || [],
      exactTargets: Array.isArray(body.exactTargets) ? body.exactTargets : [],
      supplement: Boolean(body.supplement),
      overwrite: Boolean(body.overwrite),
      stageMode: normalizeStageMode(body.stageMode),
      shouldStop: () => job.cancelRequested,
      onEvent: (event) => {
        job.events.push(event);
        if (job.events.length > 500) job.events.shift();
      }
    }).then((results) => {
      job.state = job.cancelRequested ? "cancelled" : "completed";
      job.results = results;
      job.finishedAt = new Date().toISOString();
    }).catch((error) => {
      job.state = error.code === "CANCELLED" || job.cancelRequested ? "cancelled" : "failed";
      job.error = error.message;
      job.finishedAt = new Date().toISOString();
    });

    return { id, state: job.state };
  }

  stopJob(id) {
    const job = this.jobs.get(String(id || ""));
    if (!job) return { ok: false, error: "任务不存在" };
    if (job.state !== "running" && job.state !== "stopping") {
      return { ok: true, state: job.state, message: "任务已经结束" };
    }
    job.cancelRequested = true;
    job.state = "stopping";
    job.events.push({
      time: new Date().toISOString(),
      type: "cancelled",
      message: "已收到中断请求，正在停止当前任务"
    });
    if (job.events.length > 500) job.events.shift();
    return { ok: true, state: job.state };
  }

  serveStatic(urlPath, response) {
    const targetPath = urlPath === "/" ? "/index.html" : urlPath;
    const filePath = path.resolve(this.publicDir, `.${targetPath}`);
    if (!filePath.startsWith(this.publicDir)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, { "Content-Type": contentType(filePath) });
    fs.createReadStream(filePath).pipe(response);
  }
}

function normalizeStageMode(value) {
  return ["day-ahead", "real-time", "both"].includes(value) ? value : "both";
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => {
      data += chunk;
    });
    request.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function json(response, payload) {
  response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  return "application/octet-stream";
}

module.exports = { WebConsoleServer };
