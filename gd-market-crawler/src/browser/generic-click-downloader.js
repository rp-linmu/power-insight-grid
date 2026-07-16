const fs = require("fs");
const path = require("path");
const { CdpSession, findGdMarketPage } = require("./cdp");
const { pickRunDate } = require("./date-picker");
const { validateDownloadedFiles, selectExistingFilesForDate } = require("./download-validator");

const ROUTES = {
  home: "https://pm.gd.csg.cn/pfxh/stc/index",
  dayAheadNodePrice: "https://pm.gd.csg.cn/pfxh/stc/qctc-web-trade-out/pages/organizatCenter/dayNodePriceQuery/dayNodePriceQuery",
  realTimeNodePrice: "https://pm.gd.csg.cn/pfxh/stc/qctc-web-trade-out/pages/organizatCenter/ssNodePriceQuery/ssNodePriceQuery"
};

class GenericClickDownloader {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }

  async download({
    task,
    date,
    plan,
    supplement = false,
    overwrite = false,
    stageMode = "both",
    slotKeys,
    shouldStop = () => false
  }) {
    const chromeDebugUrl = this.config.auth.chromeDebugUrl || "http://127.0.0.1:9222";
    const downloadDir = outputDir(this.config, task.storageName || task.name, date);
    fs.mkdirSync(downloadDir, { recursive: true });

    const page = await findGdMarketPage(chromeDebugUrl);
    const cdp = new CdpSession(page.webSocketDebuggerUrl);
    await cdp.connect();

    try {
      assertNotCancelled(shouldStop);
      await cdp.send("Runtime.enable");
      await cdp.send("Page.enable");
      if (plan.route) {
        assertNotCancelled(shouldStop);
        await this.navigate(cdp, plan.route);
      }
      assertNotCancelled(shouldStop);
      const dateResult = await pickRunDate(cdp, date, '.dateBox input, input[placeholder*="日期"], input[placeholder*="时间"]');
      this.logger.info(`已切换运行日: ${task.name}`, { requestedDate: date, ...dateResult });

      const allFiles = [];
      for (const action of filterActions(plan.actions, stageMode, slotKeys)) {
        assertNotCancelled(shouldStop);
        const actionDir = action.subfolder ? path.join(downloadDir, sanitizeSegment(action.subfolder)) : downloadDir;
        fs.mkdirSync(actionDir, { recursive: true });
        if (supplement && !overwrite && hasExcelFiles(actionDir)) {
          const existing = selectExistingFilesForDate({
            files: listExcelFiles(actionDir, true),
            requestedDate: date,
            taskName: action.expectedStage ? `${task.name}-${action.expectedStage}` : task.name,
            expectedStage: action.expectedStage
          });
          if (existing.rejected.length > 0) {
            this.logger.warn(`已删除日期不匹配或无有效数据的历史文件: ${task.name}`, {
              requestedDate: date,
              files: existing.rejected.map((item) => ({ file: item.file, reason: item.reason }))
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
        await cdp.send("Browser.setDownloadBehavior", {
          behavior: "allow",
          downloadPath: actionDir,
          eventsEnabled: true
        });
        const before = snapshot(actionDir);
        const startedAt = Date.now();
        if (action.tab) {
          assertNotCancelled(shouldStop);
          let tabResult;
          if (action.section) {
            tabResult = await this.selectTabInSection(cdp, action.section, action.tab);
          } else {
            tabResult = await this.clickText(cdp, action.tab);
          }
          if (tabResult?.warning) {
            this.logger.warn(tabResult.warning, {
              taskName: task.name,
              section: action.section,
              tab: action.tab,
              verified: tabResult.verified
            });
          }
          await sleep(action.waitAfterTabMs || 1200, shouldStop);
        }
        assertNotCancelled(shouldStop);
        const clicked = action.section
          ? await this.clickExportInSection(cdp, action.section)
          : await this.clickExportButton(cdp);
        this.logger.info(`已模拟点击导出: ${task.name}`, clicked);
        const files = await waitForDownload(actionDir, before, startedAt, action.timeoutMs || 180000, shouldStop);
        const validatedFiles = validateDownloadedFiles({
          files,
          requestedDate: date,
          taskName: action.expectedStage ? `${task.name}-${action.expectedStage}` : task.name,
          expectedStage: action.expectedStage
        });
        allFiles.push(...validatedFiles);
        await sleep(action.waitAfterExportMs || 1000, shouldStop);
      }

      return { downloadDir, files: uniqueFiles(allFiles) };
    } finally {
      cdp.close();
    }
  }

  async navigate(cdp, url) {
    const state = await cdp.evaluate(`(() => ({ href: location.href }))()`);
    if (state.href === url) return;
    await cdp.send("Page.navigate", { url });
    await sleep(5000);
    await waitUntil(cdp, `(() => document.readyState === 'complete' && document.body && document.body.innerText.length > 20)()`, 30000);
  }

  async pickRunDate(cdp, date) {
    const result = await cdp.evaluate(`(() => {
      const date = ${JSON.stringify(date)};
      const input = document.querySelector('.dateBox input, input[placeholder*="日期"], input[placeholder*="时间"]');
      if (!input) return { ok: false, reason: 'date input not found' };
      if (input.value === date) return { ok: true, unchanged: true, value: input.value };
      input.scrollIntoView({ block: 'center', inline: 'center' });
      input.click();
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, date);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      const day = String(Number(date.slice(8, 10)));
      const tds = Array.from(document.querySelectorAll('.el-date-table td'));
      const td = tds.find((item) => item.innerText.trim() === day
        && /available/.test(item.className)
        && !/prev-month|next-month/.test(item.className));
      if (td) {
        ['mousedown', 'mouseup', 'click'].forEach((type) => {
          td.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
        });
      }
      input.blur();
      return { ok: true, value: input.value, clicked: td ? td.innerText.trim() : '' };
    })()`);
    if (!result.ok) throw new Error(`切换运行日失败: ${JSON.stringify(result)}`);
    await sleep(2500);
  }

  async clickText(cdp, text) {
    await this.installClickHelper(cdp);
    const result = await cdp.evaluate(`(() => {
      const target = ${JSON.stringify(text)};
      const items = Array.from(document.querySelectorAll('li,button,div,span,a'));
      const el = items.find((item) => (item.innerText || item.textContent || '').replace(/\\s+/g, ' ').trim() === target);
      if (!el) return { ok: false, reason: 'text not found', target };
      return window.__gdClickElement(el);
    })()`);
    if (!result.ok) throw new Error(`点击“${text}”失败: ${JSON.stringify(result)}`);
    return result;
  }

  async clickTextInSection(cdp, sectionText, text) {
    await this.installClickHelper(cdp);
    const result = await cdp.evaluate(`(() => {
      const sectionText = ${JSON.stringify(sectionText)};
      const target = ${JSON.stringify(text)};
      const candidates = Array.from(document.querySelectorAll('section,article,.dataBox,.card,.box,.module,div'));
      const ranked = candidates
        .map((el) => ({ el, text: (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim() }))
        .filter((item) => item.text.includes(sectionText) && item.text.includes(target))
        .sort((a, b) => a.text.length - b.text.length);
      for (const item of ranked) {
        const controls = Array.from(item.el.querySelectorAll('li,button,div,span,a'));
        const el = controls.find((node) => (node.innerText || node.textContent || '').replace(/\\s+/g, ' ').trim() === target);
        if (el) return window.__gdClickElement(el);
      }
      return { ok: false, reason: 'section text not found', sectionText, target };
    })()`);
    if (!result.ok) throw new Error(`点击“${sectionText}”模块内“${text}”失败: ${JSON.stringify(result)}`);
    return result;
  }

  async selectTabInSection(cdp, sectionText, text) {
    await this.installClickHelper(cdp);
    const result = await cdp.evaluate(`(() => {
      const sectionText = ${JSON.stringify(sectionText)};
      const target = ${JSON.stringify(text)};
      const exactText = (node) => (node.innerText || node.textContent || '').replace(/\\s+/g, ' ').trim();
      const isInteractive = (node) => {
        const role = node.getAttribute && node.getAttribute('role');
        return ['BUTTON', 'LI', 'A'].includes(node.tagName) || role === 'button' || /btn|tab|switch|radio|active/i.test(node.className || '');
      };
      const candidates = Array.from(document.querySelectorAll('section,article,.dataBox,.card,.box,.module,div'));
      const ranked = candidates
        .map((el) => ({ el, text: exactText(el) }))
        .filter((item) => item.text.includes(sectionText) && item.text.includes(target))
        .sort((a, b) => a.text.length - b.text.length);
      for (const item of ranked) {
        const controls = Array.from(item.el.querySelectorAll('button,li,a,span,div,[role="button"]'));
        const matches = controls
          .filter((node) => exactText(node) === target)
          .sort((a, b) => Number(isInteractive(b)) - Number(isInteractive(a)));
        for (const node of matches) {
          const el = isInteractive(node) ? node : (node.closest('button,li,a,[role="button"],.el-radio-button,.el-tabs__item') || node);
          const clicked = window.__gdClickElement(el);
          return { ...clicked, sectionText, target, clickedTag: el.tagName, clickedClass: el.className || '' };
        }
      }
      return { ok: false, reason: 'section tab not found', sectionText, target };
    })()`);
    if (!result.ok) throw new Error(`切换“${sectionText}”模块到“${text}”失败: ${JSON.stringify(result)}`);

    const verified = await waitUntilResult(cdp, `(() => {
      const sectionText = ${JSON.stringify(sectionText)};
      const target = ${JSON.stringify(text)};
      const exactText = (node) => (node.innerText || node.textContent || '').replace(/\\s+/g, ' ').trim();
      const candidates = Array.from(document.querySelectorAll('section,article,.dataBox,.card,.box,.module,div'));
      const ranked = candidates
        .map((el) => ({ el, text: exactText(el) }))
        .filter((item) => item.text.includes(sectionText) && item.text.includes(target))
        .sort((a, b) => a.text.length - b.text.length);
      for (const item of ranked) {
        const controls = Array.from(item.el.querySelectorAll('button,li,a,span,div,[role="button"]'));
        const matches = controls.filter((node) => exactText(node) === target);
        for (const node of matches) {
          const el = node.closest('button,li,a,[role="button"],.el-radio-button,.el-tabs__item') || node;
          const cls = String(el.className || '');
          const aria = el.getAttribute && (el.getAttribute('aria-selected') || el.getAttribute('aria-checked'));
          const style = window.getComputedStyle(el);
          const selected = /active|selected|is-active|checked/i.test(cls) || aria === 'true';
          const visuallySelected = [
            'rgb(0, 0, 0)',
            'rgb(24, 92, 157)',
            'rgb(64, 158, 255)',
            'rgb(51, 51, 51)'
          ].includes(style.borderColor);
          if (selected || visuallySelected) {
            return { ok: true, target, className: cls, color: style.color, borderColor: style.borderColor, backgroundColor: style.backgroundColor };
          }
        }
      }
      return { ok: false, target };
    })()`, 5000);
    if (!verified.ok) {
      return {
        ...result,
        verified,
        warning: `切换“${sectionText}”模块到“${text}”后未检测到选中态，继续导出并以后续 Excel 阶段校验为准`
      };
    }
    return { ...result, verified };
  }

  async clickExportButton(cdp) {
    await this.installClickHelper(cdp);
    const result = await cdp.evaluate(`(() => {
      const items = Array.from(document.querySelectorAll('button,span,div,a'));
      const el = items.find((item) => (item.innerText || item.textContent || '').replace(/\\s+/g, ' ').trim() === '导出');
      if (!el) return { ok: false, reason: 'export button not found' };
      return window.__gdClickElement(el);
    })()`);
    if (!result.ok) throw new Error(`点击导出失败: ${JSON.stringify(result)}`);
    return result;
  }

  async clickExportInSection(cdp, sectionText) {
    await this.installClickHelper(cdp);
    const result = await cdp.evaluate(`(() => {
      const sectionText = ${JSON.stringify(sectionText)};
      const candidates = Array.from(document.querySelectorAll('section,article,.dataBox,.card,.box,.module,div'));
      const ranked = candidates
        .map((el) => ({ el, text: (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim() }))
        .filter((item) => item.text.includes(sectionText) && item.text.includes('导出'))
        .sort((a, b) => a.text.length - b.text.length);
      for (const item of ranked) {
        const buttons = Array.from(item.el.querySelectorAll('button,span,div,a'));
        const button = buttons.find((el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim() === '导出');
        if (button) return window.__gdClickElement(button);
      }
      return { ok: false, reason: 'section export not found', sectionText };
    })()`);
    if (!result.ok) throw new Error(`点击“${sectionText}”模块导出失败: ${JSON.stringify(result)}`);
    return result;
  }

  async installClickHelper(cdp) {
    await cdp.evaluate(`(() => {
      window.__gdClickElement = (el) => {
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
          text: (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim(),
          x: rect.x,
          y: rect.y,
          w: rect.width,
          h: rect.height
        };
      };
    })()`);
  }
}

function filterActions(actions = [], stageMode = "both", slotKeys) {
  const selectedSlotKeys = Array.isArray(slotKeys) && slotKeys.length > 0 ? new Set(slotKeys) : null;
  return actions.filter((action) => {
    if (!action.key) return true;
    if (selectedSlotKeys) return selectedSlotKeys.has(action.key);
    if (stageMode === "day-ahead") return action.key === "day-ahead";
    if (stageMode === "real-time") return action.key === "real-time";
    return true;
  });
}

function outputDir(config, taskName, date) {
  return path.resolve(process.cwd(), config.output.rootDir, "browser-downloads", sanitizeSegment(taskName), date);
}

function hasExcelFiles(downloadDir) {
  return listExcelFiles(downloadDir).length > 0;
}

function listExcelFiles(downloadDir, existing = false) {
  if (!fs.existsSync(downloadDir)) return [];
  return fs.readdirSync(downloadDir)
    .filter((name) => /\.(xlsx|xls)$/i.test(name) && !name.startsWith("~$"))
    .map((name) => {
      const filePath = path.join(downloadDir, name);
      const stat = fs.statSync(filePath);
      return {
        file: name,
        path: filePath,
        size: stat.size,
        lastWriteTime: stat.mtime.toISOString(),
        existing
      };
    });
}

function clearExcelFiles(downloadDir) {
  for (const file of listExcelFiles(downloadDir)) {
    fs.unlinkSync(file.path);
  }
}

function sanitizeSegment(value) {
  return String(value).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim();
}

function snapshot(downloadDir) {
  const names = fs.existsSync(downloadDir) ? fs.readdirSync(downloadDir) : [];
  return new Map(names.map((name) => [name, fs.statSync(path.join(downloadDir, name)).mtimeMs]));
}

async function waitForDownload(downloadDir, before, startedAt, timeoutMs, shouldStop = () => false) {
  const deadline = Date.now() + timeoutMs;
  const zeroSizeObservations = new Map();
  while (Date.now() < deadline) {
    await sleep(1000, shouldStop);
    assertNotCancelled(shouldStop);
    const names = fs.readdirSync(downloadDir);
    if (names.some((name) => name.endsWith(".crdownload") || name.endsWith(".tmp"))) continue;
    const files = names
      .filter((name) => /\.(xlsx|xls)$/i.test(name) && !name.startsWith("~$"))
      .map((name) => {
        const filePath = path.join(downloadDir, name);
        const stat = fs.statSync(filePath);
        return {
          file: name,
          path: filePath,
          size: stat.size,
          lastWriteTime: stat.mtime.toISOString(),
          isNewName: !before.has(name)
        };
      })
      .filter((item) => {
        const previousMtime = before.get(item.file) || 0;
        const currentMtime = new Date(item.lastWriteTime).getTime();
        return item.isNewName || currentMtime > previousMtime || currentMtime >= startedAt - 1000;
      });
    const completed = files.filter((item) => {
      if (item.size > 0) return true;
      const observationKey = `${item.path}::${item.lastWriteTime}`;
      const observations = (zeroSizeObservations.get(observationKey) || 0) + 1;
      zeroSizeObservations.set(observationKey, observations);
      return observations >= 2;
    });
    if (completed.length > 0) return completed;
  }
  throw new Error(`等待下载超时: ${downloadDir}`);
}

function uniqueFiles(files) {
  const byPath = new Map();
  for (const file of files) byPath.set(file.path, file);
  return Array.from(byPath.values());
}

async function waitUntil(cdp, expression, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await cdp.evaluate(expression);
    if (ok) return;
    await sleep(500);
  }
  throw new Error("页面加载超时");
}

async function waitUntilResult(cdp, expression, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastResult = null;
  while (Date.now() < deadline) {
    lastResult = await cdp.evaluate(expression);
    if (lastResult?.ok) return lastResult;
    await sleep(250);
  }
  return lastResult || { ok: false, reason: "timeout" };
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

module.exports = { GenericClickDownloader, ROUTES, outputDir, waitForDownload, hasExcelFiles, listExcelFiles, clearExcelFiles };
