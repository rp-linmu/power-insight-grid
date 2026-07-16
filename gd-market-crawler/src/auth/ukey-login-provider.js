class UKeyLoginProvider {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.cachedSession = null;
  }

  async getSession() {
    if (this.cachedSession) return this.cachedSession;

    const auth = this.config.auth;
    if (!auth.cookieHeader || auth.cookieHeader.trim().length === 0) {
      await this.probeChromeDebugEndpoint();
      throw new Error([
        "缺少 UKey 登录后的 cookieHeader。",
        "请先用 UKey 登录广东交易中心，再把浏览器请求头里的 Cookie 填入 config.local.json 的 auth.cookieHeader。",
        "后续接入真实 UKey 环境后，可在 UKeyLoginProvider 中补充自动读取 Chrome DevTools cookie 的实现。"
      ].join("\n"));
    }

    this.cachedSession = {
      cookieHeader: auth.cookieHeader,
      ticket: auth.ticket || "",
      clientTag: auth.clientTag || "",
      extraHeaders: auth.extraHeaders || {}
    };
    this.logger.info("已加载 UKey 浏览器会话。");
    return this.cachedSession;
  }

  async probeChromeDebugEndpoint() {
    const url = this.config.auth.chromeDebugUrl;
    if (!url) return;
    try {
      const response = await fetch(`${url.replace(/\/$/, "")}/json/version`, { signal: AbortSignal.timeout(3000) });
      if (response.ok) {
        const data = await response.json();
        this.logger.info("检测到 Chrome 远程调试端口。", { browser: data.Browser, webSocketDebuggerUrl: data.webSocketDebuggerUrl });
      }
    } catch (error) {
      this.logger.warn("未检测到 Chrome 远程调试端口，当前仍可使用手工 cookieHeader 运行。", { error: error.message });
    }
  }

  clear() {
    this.cachedSession = null;
  }
}

module.exports = { UKeyLoginProvider };
