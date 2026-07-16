async function pickRunDate(cdp, date, selector = ".dateBox input") {
  const target = parseTargetDate(date);
  const input = await inspectVisibleInput(cdp, selector);
  if (!input) {
    throw dateError("visible date input not found", { selector, date });
  }

  const attempts = [];
  let confirmedValue = input.value;
  let initialMonthIndex = null;
  let monthSteps = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const latestInput = await inspectVisibleInput(cdp, selector);
    let calendar = await inspectCalendar(cdp);
    const alreadyOpen = Boolean(calendar?.year && calendar?.month);
    if (!alreadyOpen) {
      calendar = await openCalendar(cdp, latestInput);
    }
    if (!calendar) {
      attempts.push({ attempt, reason: "calendar did not open", currentValue: latestInput?.value || "" });
      await sleep(300);
      continue;
    }

    const navigation = await navigateCalendar(cdp, calendar, target);
    initialMonthIndex ??= navigation.initialMonthIndex;
    monthSteps ??= navigation.monthSteps;

    const day = await waitForStableDay(cdp, target, 2500);
    if (!day) {
      attempts.push({ attempt, reason: "target day position did not stabilize", target });
      await closeCalendar(cdp);
      continue;
    }

    await dispatchMouseClick(cdp, day.x, day.y);
    confirmedValue = await waitForInputValue(cdp, selector, date, 2500);
    if (confirmedValue === date) break;

    attempts.push({
      attempt,
      reason: "clicked date did not match target",
      requestedDate: date,
      confirmedValue,
      clickedDay: day.day,
      dayPoint: { x: day.x, y: day.y }
    });
    await closeCalendar(cdp);
    await sleep(300);
  }

  if (confirmedValue !== date) {
    throw dateError("date selection failed after retries", {
      requestedDate: date,
      confirmedValue,
      attempts,
      href: input.href,
      inputCount: input.inputCount
    });
  }

  const queryResult = await triggerQuery(cdp, selector);
  await sleep(queryResult.clicked ? 3500 : 2500);
  return {
    ok: true,
    method: "cdp-native-calendar",
    initialMonthIndex,
    monthSteps,
    attempts: attempts.length + 1,
    clickedDay: String(target.day),
    value: confirmedValue,
    targetDate: date,
    queryResult
  };
}

function parseTargetDate(date) {
  const match = String(date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw dateError("invalid target date", { date });
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

async function openCalendar(cdp, input) {
  if (!input) return null;
  const existing = await inspectCalendar(cdp);
  if (existing?.year && existing?.month) return existing;

  const points = [input.center, input.iconCenter, input.center].filter(Boolean);
  for (let index = 0; index < points.length; index += 1) {
    await dispatchMouseClick(cdp, points[index].x, points[index].y);
    const calendar = await waitForCalendar(cdp, 1500);
    if (calendar) return calendar;
    if (index === 1) {
      await dispatchMouseDoubleClick(cdp, input.center.x, input.center.y);
      const afterDoubleClick = await waitForCalendar(cdp, 1500);
      if (afterDoubleClick) return afterDoubleClick;
    }
  }
  return null;
}

async function navigateCalendar(cdp, calendar, target) {
  const initialMonthIndex = monthIndex(calendar.year, calendar.month);
  const targetMonthIndex = monthIndex(target.year, target.month);
  const monthSteps = targetMonthIndex - initialMonthIndex;
  if (Math.abs(monthSteps) > 240) {
    throw dateError("target month is too far away", { calendar, target });
  }

  const direction = Math.sign(monthSteps);
  for (let step = 0; step < Math.abs(monthSteps); step += 1) {
    const before = await inspectCalendar(cdp);
    const button = direction < 0 ? before?.previousMonth : before?.nextMonth;
    if (!button) {
      throw dateError(direction < 0 ? "previous month button not found" : "next month button not found", {
        before,
        target
      });
    }
    await dispatchMouseClick(cdp, button.x, button.y);
    const expectedIndex = monthIndex(before.year, before.month) + direction;
    const changed = await waitForCalendarMonth(cdp, expectedIndex, 3000);
    if (!changed) {
      throw dateError("calendar month did not change after native click", {
        before,
        direction,
        expectedIndex,
        target
      });
    }
  }

  const current = await inspectCalendar(cdp);
  if (!current || current.year !== target.year || current.month !== target.month) {
    throw dateError("calendar did not navigate to target month", { current, target });
  }
  return { initialMonthIndex, monthSteps };
}

async function waitForStableDay(cdp, target, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let previous = null;
  let stableCount = 0;
  while (Date.now() < deadline) {
    const calendar = await inspectCalendar(cdp);
    if (calendar?.year === target.year && calendar?.month === target.month) {
      const day = calendar.days.find((item) =>
        item.day === target.day && !item.outsideMonth && !item.disabled
      );
      if (day) {
        const stable = previous
          && Math.abs(previous.x - day.x) < 0.75
          && Math.abs(previous.y - day.y) < 0.75;
        stableCount = stable ? stableCount + 1 : 0;
        previous = day;
        if (stableCount >= 2) return day;
      }
    }
    await sleep(120);
  }
  return null;
}

async function closeCalendar(cdp) {
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
  const deadline = Date.now() + 1200;
  while (Date.now() < deadline) {
    if (!(await inspectCalendar(cdp))) return;
    await sleep(100);
  }
}

async function inspectVisibleInput(cdp, selector) {
  return cdp.evaluate(`(() => {
    const isVisible = ${isVisibleSource()};
    const inputs = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
    const input = inputs.find(isVisible);
    if (!input) return null;
    input.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = input.getBoundingClientRect();
    const wrapper = input.closest('.el-date-editor, .dateBox, [class*="date"]') || input.parentElement;
    const icon = Array.from(wrapper?.querySelectorAll('i,svg,[class*="calendar"]') || []).find(isVisible);
    const iconRect = icon?.getBoundingClientRect();
    return {
      value: input.value || '',
      href: location.href,
      inputCount: inputs.length,
      center: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
      iconCenter: iconRect ? { x: iconRect.x + iconRect.width / 2, y: iconRect.y + iconRect.height / 2 } : null
    };
  })()`);
}

async function inspectCalendar(cdp) {
  return cdp.evaluate(`(() => {
    const isVisible = ${isVisibleSource()};
    const panels = Array.from(document.querySelectorAll(
      '.el-picker-panel, .el-date-picker, .el-popper, [role="dialog"], [class*="picker-panel"], [class*="date-picker"]'
    )).filter(isVisible);
    const panel = panels.find((item) => {
      const table = item.querySelector('.el-date-table, table');
      const text = (item.innerText || item.textContent || '').replace(/\\s+/g, ' ').trim();
      return table && /\\d{4}\\s*年/.test(text) && /\\d{1,2}\\s*月/.test(text);
    });
    if (!panel) return null;

    const labels = Array.from(panel.querySelectorAll(
      '.el-date-picker__header-label, [class*="header-label"], [class*="calendar-header"], div, span'
    ))
      .filter(isVisible)
      .map((item) => (item.innerText || item.textContent || '').replace(/\\s+/g, ' ').trim())
      .filter(Boolean);
    const header = labels.find((value) => /\\d{4}\\s*年\\s*\\d{1,2}\\s*月/.test(value))
      || labels.filter((value) => /\\d{4}\\s*年|\\d{1,2}\\s*月/.test(value)).slice(0, 2).join(' ');
    const match = header.match(/(\\d{4})\\s*年\\s*(\\d{1,2})\\s*月/)
      || labels.join(' ').match(/(\\d{4})\\s*年.*?(\\d{1,2})\\s*月/);
    if (!match) return { reason: 'calendar header not recognized', header, labels: labels.slice(0, 20) };

    const center = (element) => {
      if (!isVisible(element)) return null;
      const rect = element.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    };
    const findMonthButton = (direction) => {
      const selectors = direction < 0
        ? [
            '.el-date-picker__prev-btn.el-icon-arrow-left',
            'button[aria-label*="上个月"]',
            'button[aria-label*="previous month"]'
          ]
        : [
            '.el-date-picker__next-btn.el-icon-arrow-right',
            'button[aria-label*="下个月"]',
            'button[aria-label*="next month"]'
          ];
      for (const selector of selectors) {
        const button = panel.querySelector(selector);
        if (isVisible(button)) return button;
      }
      return Array.from(panel.querySelectorAll('button')).find((button) => {
        if (!isVisible(button)) return false;
        const cls = String(button.className || '');
        return direction < 0
          ? /prev-btn/.test(cls) && !/d-arrow/.test(cls)
          : /next-btn/.test(cls) && !/d-arrow/.test(cls);
      }) || null;
    };

    const cells = Array.from(panel.querySelectorAll('.el-date-table td, table td')).filter(isVisible);
    const days = cells.map((cell) => {
      const value = (cell.querySelector('span')?.innerText || cell.innerText || cell.textContent || '').trim();
      const cls = String(cell.className || '');
      const point = center(cell.querySelector('span') || cell);
      return {
        day: /^\\d{1,2}$/.test(value) ? Number(value) : null,
        outsideMonth: /prev-month|next-month/.test(cls),
        disabled: /disabled/.test(cls) || cell.getAttribute('aria-disabled') === 'true',
        x: point?.x,
        y: point?.y
      };
    }).filter((item) => item.day !== null && item.x !== undefined);

    return {
      year: Number(match[1]),
      month: Number(match[2]),
      previousMonth: center(findMonthButton(-1)),
      nextMonth: center(findMonthButton(1)),
      days
    };
  })()`);
}

async function clickAndWaitForCalendar(cdp, point) {
  await dispatchMouseClick(cdp, point.x, point.y);
  return waitForCalendar(cdp, 2500);
}

async function waitForCalendar(cdp, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const calendar = await inspectCalendar(cdp);
    if (calendar?.year && calendar?.month) return calendar;
    await sleep(100);
  }
  return null;
}

async function waitForCalendarMonth(cdp, expectedIndex, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const calendar = await inspectCalendar(cdp);
    if (calendar?.year && monthIndex(calendar.year, calendar.month) === expectedIndex) return calendar;
    await sleep(100);
  }
  return null;
}

async function waitForInputValue(cdp, selector, expectedValue, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let currentValue = "";
  while (Date.now() < deadline) {
    const input = await inspectVisibleInput(cdp, selector);
    currentValue = input?.value || "";
    if (currentValue === expectedValue) return currentValue;
    await sleep(100);
  }
  return currentValue;
}

async function triggerQuery(cdp, selector) {
  const button = await cdp.evaluate(`(() => {
    const isVisible = ${isVisibleSource()};
    const input = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(isVisible);
    if (!input) return null;
    const labels = ['查询', '搜索', '检索', '确定'];
    const containers = [];
    let current = input.parentElement;
    for (let i = 0; current && i < 6; i += 1) {
      containers.push(current);
      current = current.parentElement;
    }
    containers.push(document.body);
    for (const container of containers) {
      const candidate = Array.from(container.querySelectorAll('button,a,.el-button')).find((item) => {
        const text = (item.innerText || item.textContent || '').replace(/\\s+/g, ' ').trim();
        return isVisible(item) && !item.disabled && labels.includes(text);
      });
      if (!candidate) continue;
      const rect = candidate.getBoundingClientRect();
      return {
        text: (candidate.innerText || candidate.textContent || '').replace(/\\s+/g, ' ').trim(),
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2
      };
    }
    return null;
  })()`);
  if (!button) return { clicked: false, reason: "query button not found; page may auto refresh" };
  await dispatchMouseClick(cdp, button.x, button.y);
  return { clicked: true, text: button.text, method: "cdp-native-click" };
}

async function dispatchMouseClick(cdp, x, y) {
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}

async function dispatchMouseDoubleClick(cdp, x, y) {
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  await sleep(80);
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 2 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 2 });
}

function isVisibleSource() {
  return `(element) => {
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity || 1) !== 0
      && rect.width > 0
      && rect.height > 0;
  }`;
}

function monthIndex(year, month) {
  return year * 12 + month - 1;
}

function dateError(reason, details = {}) {
  const error = new Error(`切换运行日失败: ${JSON.stringify({ ok: false, reason, ...details })}`);
  error.code = "DATE_SELECTION_FAILED";
  return error;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { pickRunDate };
