const fs = require("fs");
const path = require("path");
const { CdpSession, findGdMarketPage } = require("./cdp");
const { outputDir, waitForDownload, hasExcelFiles, listExcelFiles, clearExcelFiles } = require("./generic-click-downloader");
const { pickRunDate } = require("./date-picker");
const { validateDownloadedFiles, selectExistingFilesForDate } = require("./download-validator");

const INFO_DISCLOSURE_ROUTE = "https://pm.gd.csg.cn/pfxh/stc/qctc-web-trade-out/pages/disclosureCenter/infoDisclosure/infoDisclosure";

const BASIC_EXPORTS = [
  {
    key: "day-ahead",
    name: "日前",
    subfolder: "日前",
    tab: "预测",
    tabCandidates: ["预测", "日前", "日前基本面"]
  },
  {
    key: "real-time",
    name: "实时",
    subfolder: "实时",
    tab: "实际",
    tabCandidates: ["实际", "实时", "实时基本面"]
  }
];

class DayAheadBasicClickDownloader {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }

  async download({ date, supplement = false, overwrite = false, stageMode = "both", slotKeys, shouldStop = () => false }) {
    const chromeDebugUrl = this.config.auth.chromeDebugUrl || "http://127.0.0.1:9222";
    const downloadDir = outputDir(this.config, "基本面数据", date);
    fs.mkdirSync(downloadDir, { recursive: true });

    const page = await findGdMarketPage(chromeDebugUrl);
    const cdp = new CdpSession(page.webSocketDebuggerUrl);
    await cdp.connect();

    try {
      assertNotCancelled(shouldStop);
      await cdp.send("Runtime.enable");
      await cdp.send("Page.enable");

      assertNotCancelled(shouldStop);
      await this.ensureInfoDisclosurePage(cdp);
      assertNotCancelled(shouldStop);
      const allFiles = [];
      for (const item of filterExports(BASIC_EXPORTS, stageMode, slotKeys)) {
        assertNotCancelled(shouldStop);
        const actionDir = path.join(downloadDir, item.subfolder);
        fs.mkdirSync(actionDir, { recursive: true });
        if (supplement && !overwrite && hasExcelFiles(actionDir)) {
          const existing = selectExistingFilesForDate({
            files: listExcelFiles(actionDir, true),
            requestedDate: date,
            taskName: `基本面数据-${item.name}`
          });
          if (existing.rejected.length > 0) {
            this.logger.warn(`已删除日期不匹配或无有效数据的历史文件: 基本面数据-${item.name}`, {
              requestedDate: date,
              files: existing.rejected.map((file) => ({ file: file.file, reason: file.reason }))
            });
          }
          if (existing.accepted.length > 0) {
            allFiles.push(...existing.accepted);
            continue;
          }
        }
        if (overwrite) {
          clearExcelFiles(actionDir);
        }

        // The disclosure page applies the selected date to the currently active
        // tab. Reconfirm it before every export, then switch to the target tab.
        const dateResult = await pickRunDate(cdp, date);
        this.logger.info(`已确认基本面数据-${item.name}运行日`, {
          requestedDate: date,
          ...dateResult
        });

        assertNotCancelled(shouldStop);
        const tab = await this.selectAndConfirmTab(cdp, item, date, shouldStop);
        this.logger.info(`已确认基本面数据-${item.name}页签`, {
          requestedDate: date,
          expectedTab: item.tab,
          ...tab
        });

        await cdp.send("Browser.setDownloadBehavior", {
          behavior: "allow",
          downloadPath: actionDir,
          eventsEnabled: true
        });

        const before = snapshot(actionDir);
        const startedAt = Date.now();
        assertNotCancelled(shouldStop);
        const clickResult = await this.clickExport(cdp);
        this.logger.info(`已模拟点击基本面数据-${item.name}导出`, { tab, clickResult });

        const files = await waitForDownload(actionDir, before, startedAt, 180000, shouldStop);
        const validatedFiles = validateDownloadedFiles({
          files,
          requestedDate: date,
          taskName: `基本面数据-${item.name}`
        });
        allFiles.push(...validatedFiles);
        await sleep(1000, shouldStop);
      }

      return { downloadDir, files: uniqueFiles(allFiles) };
    } finally {
      cdp.close();
    }
  }

  async selectAndConfirmTab(cdp, item, date, shouldStop) {
    const point = await this.findTabPoint(cdp, item.tabCandidates);
    if (!point?.ok) {
      throw new Error(`定位基本面“${item.tab}”页签失败: ${JSON.stringify(point)}`);
    }

    await dispatchNativeClick(cdp, point.x, point.y);
    const state = await waitForTabReady(cdp, {
      expectedTab: item.tab,
      candidates: item.tabCandidates,
      requestedDate: date,
      timeoutMs: 10000,
      shouldStop
    });
    if (!state.ok) {
      throw new Error(`切换基本面“${item.tab}”页签失败: ${JSON.stringify(state)}`);
    }
    return { click: point, state };
  }

  async findTabPoint(cdp, candidates) {
    return cdp.evaluate(`(() => {
      const candidates = ${JSON.stringify(candidates)};
      const isVisible = (element) => {
        if (!element) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number(style.opacity || 1) !== 0
          && rect.width > 0
          && rect.height > 0;
      };
      const normalize = (element) =>
        (element.innerText || element.textContent || '').replace(/\\s+/g, ' ').trim();
      const elements = Array.from(document.querySelectorAll('li,button,div,span,a')).filter(isVisible);
      for (const target of candidates) {
        const matches = elements
          .filter((element) => normalize(element) === target)
          .sort((left, right) => {
            const a = left.getBoundingClientRect();
            const b = right.getBoundingClientRect();
            return a.width * a.height - b.width * b.height;
          });
        const element = matches[0];
        if (!element) continue;
        const clickable = element.closest('button,li,a,[role="tab"]') || element;
        const rect = clickable.getBoundingClientRect();
        return {
          ok: true,
          text: target,
          tag: clickable.tagName,
          className: String(clickable.className || ''),
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2
        };
      }
      return { ok: false, reason: 'tab not found', candidates };
    })()`);
  }

  async ensureInfoDisclosurePage(cdp) {
    const state = await inspectDisclosurePage(cdp);
    if (state.ready) return;
    await cdp.send("Page.navigate", { url: INFO_DISCLOSURE_ROUTE });
    const deadline = Date.now() + 30000;
    let next = null;
    while (Date.now() < deadline) {
      await sleep(500);
      next = await inspectDisclosurePage(cdp);
      if (next.ready) return;
    }
    throw new Error(
      `无法进入“披露中心 -> 信息披露查询”页面，请确认当前 Chrome 已完成 UKey 登录。${JSON.stringify(next)}`
    );
  }

  async clickExport(cdp) {
    const result = await cdp.evaluate(`(() => {
      const items = Array.from(document.querySelectorAll('li,button,div,span,a'));
      const el = items.find((item) => (item.innerText || item.textContent || '').replace(/\\s+/g, ' ').trim() === '全部导出');
      if (!el) return { ok: false, reason: 'export button not found' };
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const rect = el.getBoundingClientRect();
      ['mouseover', 'mousemove', 'mousedown', 'mouseup', 'click'].forEach((type) => {
        el.dispatchEvent(new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: rect.x + rect.width / 2,
          clientY: rect.y + rect.height / 2
        }));
      });
      return {
        ok: true,
        text: (el.innerText || el.textContent || '').trim(),
        x: rect.x,
        y: rect.y,
        w: rect.width,
        h: rect.height
      };
    })()`);
    if (!result.ok) throw new Error(`点击全部导出失败: ${JSON.stringify(result)}`);
    return result;
  }
}

async function inspectDisclosurePage(cdp) {
  return cdp.evaluate(`(() => {
    const isVisible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || 1) !== 0
        && rect.width > 0
        && rect.height > 0;
    };
    const texts = Array.from(document.querySelectorAll('button,li,a,span,div'))
      .filter(isVisible)
      .map((element) => (element.innerText || element.textContent || '').replace(/\\s+/g, ' ').trim());
    const hasPredict = texts.includes('\\u9884\\u6d4b');
    const hasActual = texts.includes('\\u5b9e\\u9645');
    const hasExport = texts.includes('\\u5168\\u90e8\\u5bfc\\u51fa');
    return {
      ready: location.href.includes('infoDisclosure') && hasPredict && hasActual && hasExport,
      href: location.href,
      documentReady: document.readyState,
      hasPredict,
      hasActual,
      hasExport
    };
  })()`);
}

async function waitForTabReady(cdp, {
  expectedTab,
  candidates,
  requestedDate,
  timeoutMs,
  shouldStop
}) {
  const deadline = Date.now() + timeoutMs;
  let stableCount = 0;
  let latest = null;

  while (Date.now() < deadline) {
    assertNotCancelled(shouldStop);
    latest = await inspectBasicPageState(cdp, expectedTab, candidates, requestedDate);
    if (latest.tabActive && latest.dateMatches && !latest.loading) {
      stableCount += 1;
      if (stableCount >= 3) {
        return { ok: true, ...latest, stableChecks: stableCount };
      }
    } else {
      stableCount = 0;
    }
    await sleep(250, shouldStop);
  }

  return {
    ok: false,
    reason: !latest?.tabActive
      ? "target tab did not become active"
      : !latest?.dateMatches
        ? "run date changed after tab switch"
        : "page remained loading",
    expectedTab,
    requestedDate,
    latest
  };
}

async function inspectBasicPageState(cdp, expectedTab, candidates, requestedDate) {
  return cdp.evaluate(`(() => {
    const expectedTab = ${JSON.stringify(expectedTab)};
    const candidates = ${JSON.stringify(candidates)};
    const requestedDate = ${JSON.stringify(requestedDate)};
    const isVisible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || 1) !== 0
        && rect.width > 0
        && rect.height > 0;
    };
    const normalize = (element) =>
      (element.innerText || element.textContent || '').replace(/\\s+/g, ' ').trim();
    const chroma = (color) => {
      const values = String(color || '').match(/\\d+(?:\\.\\d+)?/g);
      if (!values || values.length < 3) return 0;
      const rgb = values.slice(0, 3).map(Number);
      return Math.max(...rgb) - Math.min(...rgb);
    };
    const elements = Array.from(document.querySelectorAll('li,button,div,span,a')).filter(isVisible);
    const targetMatches = elements
      .filter((element) => candidates.includes(normalize(element)))
      .sort((left, right) => {
        const a = left.getBoundingClientRect();
        const b = right.getBoundingClientRect();
        return a.width * a.height - b.width * b.height;
      });
    const rawTarget = targetMatches.find((element) => normalize(element) === expectedTab) || targetMatches[0];
    const target = rawTarget?.closest('button,li,a,[role="tab"]') || rawTarget || null;
    const ancestry = [];
    let current = target;
    for (let level = 0; current && level < 4; level += 1) {
      ancestry.push(String(current.className || ''));
      current = current.parentElement;
    }
    const style = target ? getComputedStyle(target) : null;
    const semanticActive = Boolean(target) && (
      target.getAttribute('aria-selected') === 'true'
      || target.getAttribute('aria-current') === 'true'
      || target.getAttribute('data-active') === 'true'
      || Boolean(target.matches('input:checked'))
      || ancestry.some((className) => /(^|\\s)(is-)?(active|selected|current)(\\s|$)/i.test(className))
    );
    const visualActive = Boolean(style) && (
      chroma(style.color) >= 45
      || chroma(style.borderTopColor) >= 45
      || chroma(style.backgroundColor) >= 45
    );
    const dateInput = Array.from(document.querySelectorAll(
      '.dateBox input, input[placeholder*="日期"], input[placeholder*="时间"]'
    )).find(isVisible);
    const loading = Array.from(document.querySelectorAll(
      '.el-loading-mask, .el-loading-spinner, [class*="loading-mask"], [class*="loading-spinner"]'
    )).some(isVisible);

    return {
      expectedTab,
      matchedText: target ? normalize(target) : null,
      tabFound: Boolean(target),
      tabActive: semanticActive || visualActive,
      activeEvidence: semanticActive ? 'semantic' : visualActive ? 'visual' : 'none',
      classNames: ancestry,
      ariaSelected: target?.getAttribute('aria-selected') || null,
      color: style?.color || null,
      borderColor: style?.borderTopColor || null,
      backgroundColor: style?.backgroundColor || null,
      currentDate: dateInput?.value || '',
      dateMatches: dateInput?.value === requestedDate,
      loading
    };
  })()`);
}

async function dispatchNativeClick(cdp, x, y) {
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1
  });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1
  });
}

function filterExports(exports, stageMode = "both", slotKeys) {
  const selectedSlotKeys = Array.isArray(slotKeys) && slotKeys.length > 0 ? new Set(slotKeys) : null;
  return exports.filter((item) => {
    if (selectedSlotKeys) return selectedSlotKeys.has(item.key);
    if (stageMode === "day-ahead") return item.key === "day-ahead";
    if (stageMode === "real-time") return item.key === "real-time";
    return true;
  });
}

function snapshot(downloadDir) {
  const names = fs.existsSync(downloadDir) ? fs.readdirSync(downloadDir) : [];
  return new Map(names.map((name) => [name, fs.statSync(path.join(downloadDir, name)).mtimeMs]));
}

function uniqueFiles(files) {
  const byPath = new Map();
  for (const file of files) byPath.set(file.path, file);
  return Array.from(byPath.values());
}

function sleep(ms, shouldStop = () => false) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const tick = () => {
      if (shouldStop()) {
        reject(cancelledError());
        return;
      }
      if (Date.now() - startedAt >= ms) {
        resolve();
        return;
      }
      setTimeout(tick, Math.min(250, ms));
    };
    tick();
  });
}

function assertNotCancelled(shouldStop) {
  if (shouldStop()) throw cancelledError();
}

function cancelledError() {
  const error = new Error("任务已中断");
  error.code = "CANCELLED";
  return error;
}

module.exports = { DayAheadBasicClickDownloader };
