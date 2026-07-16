const fs = require("fs");
const path = require("path");

function loadConfig(configPath) {
  const absolutePath = path.resolve(process.cwd(), configPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`配置文件不存在: ${absolutePath}。请复制 config.example.json 为 config.local.json 后填写。`);
  }

  const raw = fs.readFileSync(absolutePath, "utf8");
  const config = JSON.parse(raw);
  config.__configPath = absolutePath;
  validateConfig(config);
  return config;
}

function validateConfig(config) {
  requireObject(config.market, "market");
  requireString(config.market.baseUrl, "market.baseUrl");
  requireObject(config.auth, "auth");
  requireString(config.auth.mode, "auth.mode");
  if (config.auth.mode !== "ukey-browser-session") {
    throw new Error("auth.mode 必须为 ukey-browser-session。本工具只接受 UKey 登录产生的会话。");
  }
  requireObject(config.output, "output");
  requireString(config.output.rootDir, "output.rootDir");
  requireObject(config.tasks, "tasks");
  if (!Array.isArray(config.tasks.enabled)) {
    throw new Error("tasks.enabled 必须是数组。");
  }
  if (!config.tasks.endpoints) config.tasks.endpoints = {};
}

function requireObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} 必须是对象。`);
  }
}

function requireString(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} 必须是非空字符串。`);
  }
}

module.exports = { loadConfig };
