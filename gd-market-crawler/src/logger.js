const fs = require("fs");
const path = require("path");

function createLogger(config) {
  const logRoot = path.resolve(process.cwd(), config.logs?.rootDir || "./logs");
  fs.mkdirSync(logRoot, { recursive: true });
  const logFile = path.join(logRoot, `${new Date().toISOString().slice(0, 10)}.log`);

  function write(level, message, meta) {
    const line = JSON.stringify({
      time: new Date().toISOString(),
      level,
      message,
      ...(meta ? { meta } : {})
    });
    fs.appendFileSync(logFile, `${line}\n`, "utf8");
    const printable = meta ? `${message} ${JSON.stringify(meta)}` : message;
    console.log(`[${level}] ${printable}`);
  }

  return {
    info: (message, meta) => write("info", message, meta),
    warn: (message, meta) => write("warn", message, meta),
    error: (message, meta) => write("error", message, meta),
    debug: (message, meta) => {
      if (config.logs?.debug) write("debug", message, meta);
    }
  };
}

module.exports = { createLogger };
