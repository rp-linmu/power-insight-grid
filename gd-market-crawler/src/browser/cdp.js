class CdpSession {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    this.ws = null;
  }

  async connect() {
    this.ws = new WebSocket(this.webSocketUrl);
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.method) this.events.push(message);
      if (message.id && this.pending.has(message.id)) {
        this.pending.get(message.id)(message);
        this.pending.delete(message.id);
      }
    };
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
  }

  send(method, params = {}) {
    return new Promise((resolve) => {
      const id = ++this.id;
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (response.result?.exceptionDetails) {
      throw new Error(response.result.exceptionDetails.exception?.description || response.result.exceptionDetails.text);
    }
    return response.result.result.value;
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function findGdMarketPage(chromeDebugUrl) {
  const base = chromeDebugUrl.replace(/\/$/, "");
  const pages = await (await fetch(`${base}/json/list`)).json();
  const page = pages.find((item) => item.type === "page" && item.url.includes("pm.gd.csg.cn/pfxh/stc"))
    || pages.find((item) => item.type === "page" && item.url.includes("pm.gd.csg.cn"));
  if (!page) {
    throw new Error(`没有找到已登录广东交易中心页面。请先打开 ${base} 对应 Chrome 并完成 UKey 登录。`);
  }
  return page;
}

module.exports = { CdpSession, findGdMarketPage };
