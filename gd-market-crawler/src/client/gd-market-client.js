const { setTimeout: sleep } = require("timers/promises");

class GdMarketClient {
  constructor(config, authProvider, logger) {
    this.config = config;
    this.authProvider = authProvider;
    this.logger = logger;
    this.lastRequestAt = 0;
  }

  async downloadExcel(task, date) {
    const endpoint = this.config.tasks.endpoints[task.endpointKey];
    if (!endpoint) {
      return {
        skipped: true,
        reason: `未配置 endpoint: ${task.endpointKey}`
      };
    }

    await this.respectMinInterval();
    const session = await this.authProvider.getSession();
    const request = this.buildRequest(endpoint, task, date, session);

    this.logger.info("请求交易中心导出接口。", {
      task: task.id,
      date,
      method: request.method,
      url: redactUrl(request.url)
    });

    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: AbortSignal.timeout(this.config.market.requestTimeoutMs || 120000)
    });

    this.lastRequestAt = Date.now();
    if (!response.ok) {
      const body = await safeReadText(response);
      throw new Error(`交易中心请求失败: ${response.status} ${response.statusText} ${body.slice(0, 500)}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "";
    const disposition = response.headers.get("content-disposition") || "";
    return {
      skipped: false,
      buffer,
      contentType,
      filename: parseFilename(disposition) || `${task.id}_${date}.xlsx`
    };
  }

  buildRequest(endpoint, task, date, session) {
    const method = (endpoint.method || "GET").toUpperCase();
    const url = new URL(renderTemplate(endpoint.path, { date, task }), this.config.market.baseUrl);
    const params = renderObject(endpoint.params || {}, { date, task });
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }

    const headers = {
      "User-Agent": this.config.market.userAgent,
      ...(this.config.market.defaultHeaders || {}),
      Cookie: session.cookieHeader,
      ...session.extraHeaders,
      ...(endpoint.headers || {})
    };
    if (session.ticket) headers.ticket = session.ticket;
    if (session.clientTag) headers.clientTag = session.clientTag;

    let body;
    if (method !== "GET" && endpoint.body) {
      body = JSON.stringify(renderObject(endpoint.body, { date, task }));
      headers["Content-Type"] = headers["Content-Type"] || "application/json";
    }

    return { method, url: url.toString(), headers, body };
  }

  async respectMinInterval() {
    const minIntervalMs = this.config.market.minIntervalMs || 0;
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < minIntervalMs) {
      await sleep(minIntervalMs - elapsed);
    }
  }
}

function renderObject(input, context) {
  const output = {};
  for (const [key, value] of Object.entries(input)) {
    output[key] = typeof value === "string" ? renderTemplate(value, context) : value;
  }
  return output;
}

function renderTemplate(value, context) {
  return value
    .replace(/\{\{date\}\}/g, context.date)
    .replace(/\{\{taskId\}\}/g, context.task.id)
    .replace(/\{\{endpointKey\}\}/g, context.task.endpointKey);
}

function parseFilename(disposition) {
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) return decodeURIComponent(utf8Match[1]);
  const normalMatch = disposition.match(/filename="?([^";]+)"?/i);
  if (normalMatch) return decodeURIComponent(normalMatch[1]);
  return "";
}

function redactUrl(url) {
  return String(url).replace(/([?&](?:ticket|token|Cookie|cookie)=)[^&]+/gi, "$1***");
}

async function safeReadText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

module.exports = { GdMarketClient };
