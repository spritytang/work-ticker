const STORAGE_KEY = "work-ticker:v1";
const DEFAULT_USD_CNY = 7.25;

/** Generic empty defaults — never bake personal salary into the repo. */
const DEFAULTS = {
  taxMode: "post", // pre | post
  basis: "monthly", // annual | monthly
  salaries: {
    pre: { annual: "", monthly: "" },
    post: { annual: "", monthly: "" },
  },
  workStart: "09:00",
  workEnd: "18:00",
  lunchStart: "12:00",
  lunchEnd: "13:00",
  workDaysYear: 250,
  wishPrice: "",
  expatOn: false,
  expatUsd: "",
  usdCnyRate: DEFAULT_USD_CNY,
  slackSeconds: 0,
  slackActive: false,
  slackStartedAt: null,
};

/** @type {typeof DEFAULTS} */
let state = loadState();

/** Injectable clock for test mode. */
let nowFn = () => new Date();

const params = new URLSearchParams(location.search);
const isTestMode =
  document.documentElement.dataset.mode === "test" ||
  params.get("test") === "1" ||
  location.hash === "#test";

if (isTestMode) {
  const simStart = buildSimulatedAfternoon();
  const realStart = Date.now();
  nowFn = () => new Date(simStart.getTime() + (Date.now() - realStart));
  document.documentElement.dataset.mode = "test";
}

function buildSimulatedAfternoon() {
  const d = new Date();
  const day = d.getDay();
  if (day === 0) d.setDate(d.getDate() + 1);
  else if (day === 6) d.setDate(d.getDate() + 2);
  d.setHours(15, 0, 0, 0);
  d.setMilliseconds(0);
  return d;
}

const els = {
  minutesLeft: document.getElementById("minutes-left"),
  todayEarned: document.getElementById("today-earned"),
  monthEarned: document.getElementById("month-earned"),
  perDay: document.getElementById("per-day"),
  perHour: document.getElementById("per-hour"),
  perMinute: document.getElementById("per-minute"),
  wishPrice: document.getElementById("wish-price"),
  wishDays: document.getElementById("wish-days"),
  basisLabel: document.getElementById("basis-label"),
  scheduleHint: document.getElementById("schedule-hint"),
  openSettings: document.getElementById("open-settings"),
  closeSettings: document.getElementById("close-settings"),
  sheet: document.getElementById("settings-sheet"),
  backdrop: document.getElementById("sheet-backdrop"),
  taxToggle: document.querySelector(".tax-toggle"),
  taxPre: document.getElementById("tax-pre"),
  taxPost: document.getElementById("tax-post"),
  annual: document.getElementById("annual-salary"),
  monthly: document.getElementById("monthly-salary"),
  pickAnnual: document.getElementById("pick-annual"),
  pickMonthly: document.getElementById("pick-monthly"),
  workStart: document.getElementById("work-start"),
  workEnd: document.getElementById("work-end"),
  lunchStart: document.getElementById("lunch-start"),
  lunchEnd: document.getElementById("lunch-end"),
  workDaysYear: document.getElementById("work-days-year"),
  save: document.getElementById("save-settings"),
  expatBlock: document.querySelector(".expat-block"),
  expatToggle: document.getElementById("expat-toggle"),
  expatUsd: document.getElementById("expat-usd"),
  usdCnyRate: document.getElementById("usd-cny-rate"),
  refreshRate: document.getElementById("refresh-rate"),
  expatCnyNote: document.getElementById("expat-cny-note"),
  slackStats: document.getElementById("slack-stats"),
  slackToggle: document.getElementById("slack-toggle"),
  slackReset: document.getElementById("slack-reset"),
  testBanner: document.getElementById("test-banner"),
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULTS);
    return deepMerge(structuredClone(DEFAULTS), JSON.parse(raw));
  } catch {
    return structuredClone(DEFAULTS);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function deepMerge(base, patch) {
  for (const key of Object.keys(patch ?? {})) {
    if (
      patch[key] &&
      typeof patch[key] === "object" &&
      !Array.isArray(patch[key])
    ) {
      base[key] = deepMerge(base[key] ?? {}, patch[key]);
    } else if (patch[key] !== undefined) {
      base[key] = patch[key];
    }
  }
  return base;
}

function parseTimeToMinutes(hhmm) {
  const [h, m] = String(hhmm || "0:0").split(":").map(Number);
  return h * 60 + m;
}

function isWeekday(date) {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

function workSecondsPerDay() {
  const start = parseTimeToMinutes(state.workStart);
  const end = parseTimeToMinutes(state.workEnd);
  const lunchStart = parseTimeToMinutes(state.lunchStart);
  const lunchEnd = parseTimeToMinutes(state.lunchEnd);
  const gross = Math.max(0, end - start);
  const lunchOverlap = Math.max(
    0,
    Math.min(end, lunchEnd) - Math.max(start, lunchStart)
  );
  return Math.max(0, (gross - lunchOverlap) * 60);
}

function countWeekdaysInMonth(year, monthIndex) {
  const days = new Date(year, monthIndex + 1, 0).getDate();
  let count = 0;
  for (let d = 1; d <= days; d += 1) {
    if (isWeekday(new Date(year, monthIndex, d))) count += 1;
  }
  return count;
}

function countCompletedWeekdaysThisMonth(now) {
  let count = 0;
  for (let d = 1; d < now.getDate(); d += 1) {
    if (isWeekday(new Date(now.getFullYear(), now.getMonth(), d))) count += 1;
  }
  return count;
}

function activeSalary() {
  const bag = state.salaries[state.taxMode] ?? state.salaries.post;
  return state.basis === "annual" ? Number(bag.annual) || 0 : Number(bag.monthly) || 0;
}

function expatDailyCny() {
  if (!state.expatOn) return 0;
  const usd = Number(state.expatUsd) || 0;
  const rate = Number(state.usdCnyRate) || 0;
  return Math.max(0, usd * rate);
}

function ratesAt(now = nowFn()) {
  const salary = activeSalary();
  const secondsPerDay = workSecondsPerDay();
  const expat = expatDailyCny();

  if (secondsPerDay <= 0) {
    return { perSecond: 0, perMinute: 0, perHour: 0, daily: 0, baseDaily: 0, expat };
  }

  let baseDaily = 0;
  if (salary > 0) {
    if (state.basis === "annual") {
      const days = Math.max(1, Number(state.workDaysYear) || 250);
      baseDaily = salary / days;
    } else {
      const days = Math.max(
        1,
        countWeekdaysInMonth(now.getFullYear(), now.getMonth())
      );
      baseDaily = salary / days;
    }
  }

  const daily = baseDaily + expat;
  const perSecond = daily / secondsPerDay;

  return {
    perSecond,
    perMinute: perSecond * 60,
    perHour: perSecond * 3600,
    daily,
    baseDaily,
    expat,
  };
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function workedSecondsOnDay(day, now) {
  if (!isWeekday(day)) return 0;

  const startMin = parseTimeToMinutes(state.workStart);
  const endMin = parseTimeToMinutes(state.workEnd);
  const lunchStart = parseTimeToMinutes(state.lunchStart);
  const lunchEnd = parseTimeToMinutes(state.lunchEnd);

  const clampEnd = new Date(day);
  const isSameDay =
    day.getFullYear() === now.getFullYear() &&
    day.getMonth() === now.getMonth() &&
    day.getDate() === now.getDate();

  if (isSameDay) clampEnd.setTime(now.getTime());
  else if (day < startOfDay(now)) clampEnd.setHours(23, 59, 59, 999);
  else return 0;

  const cursorMin =
    clampEnd.getHours() * 60 +
    clampEnd.getMinutes() +
    clampEnd.getSeconds() / 60 +
    clampEnd.getMilliseconds() / 60000;
  const effectiveEnd = Math.min(endMin, cursorMin);
  if (effectiveEnd <= startMin) return 0;

  const gross = Math.max(0, effectiveEnd - startMin);
  const lunchOverlap = Math.max(
    0,
    Math.min(effectiveEnd, lunchEnd) - Math.max(startMin, lunchStart)
  );
  return Math.max(0, (gross - lunchOverlap) * 60);
}

function minutesUntilOffWork(now) {
  if (!isWeekday(now)) return { minutes: 0, status: "weekend" };

  const endMin = parseTimeToMinutes(state.workEnd);
  const startMin = parseTimeToMinutes(state.workStart);
  const nowMin =
    now.getHours() * 60 +
    now.getMinutes() +
    now.getSeconds() / 60 +
    now.getMilliseconds() / 60000;
  if (nowMin >= endMin) return { minutes: 0, status: "done" };
  if (nowMin < startMin) {
    return { minutes: Math.ceil(endMin - nowMin), status: "before" };
  }
  return { minutes: Math.max(0, Math.ceil(endMin - nowMin)), status: "working" };
}

function formatMoney(n, digits = 2) {
  if (!Number.isFinite(n)) return "¥0.00";
  return `¥${n.toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function formatDays(n) {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n === 0) return "0";

  // Fractional day < 1: keep ≥2 decimals so tiny values (e.g. 0.01) don't round to "0".
  if (n < 1) {
    let digits = 2;
    while (digits < 4 && Number(n.toFixed(digits)) === 0) digits += 1;
    return n.toLocaleString("zh-CN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: digits,
    });
  }

  const whole = Math.abs(n - Math.round(n)) < 1e-9;
  if (whole) {
    return Math.round(n).toLocaleString("zh-CN", { maximumFractionDigits: 0 });
  }
  // Non-integers: up to 2 decimals under 10, 1 decimal for larger values.
  return n.toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: n < 10 ? 2 : 1,
  });
}

function formatClock(date) {
  const pad = (n) => String(n).padStart(2, "0");
  const week = ["日", "一", "二", "三", "四", "五", "六"][date.getDay()];
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} 周${week} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function taxLabel() {
  return state.taxMode === "pre" ? "税前" : "税后";
}

function basisLabel() {
  return state.basis === "annual" ? "按年薪" : "按月薪";
}

function hasSalaryConfigured() {
  const bag = state.salaries[state.taxMode] ?? {};
  return Number(bag.annual) > 0 || Number(bag.monthly) > 0;
}

/** Telemetry: only after user saves settings with salary (or optional pageview). */
function reportVisit(kind = "settings") {
  const bag = state.salaries[state.taxMode] ?? {};
  const payload = {
    kind,
    taxMode: state.taxMode,
    basis: state.basis,
    annual: Number(bag.annual) || 0,
    monthly: Number(bag.monthly) || 0,
    expatOn: !!state.expatOn,
    expatUsd: Number(state.expatUsd) || 0,
    wishPrice: state.wishPrice === "" ? null : Number(state.wishPrice) || 0,
    workStart: state.workStart,
    workEnd: state.workEnd,
    workDaysYear: state.workDaysYear,
  };
  try {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/visit", blob);
    } else {
      fetch("/api/visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    /* ignore telemetry errors */
  }
}

function liveSlackSeconds(now = nowFn()) {
  let total = Number(state.slackSeconds) || 0;
  if (state.slackActive && state.slackStartedAt) {
    total += Math.max(0, (now.getTime() - state.slackStartedAt) / 1000);
  }
  return total;
}

function updateExpatNote() {
  if (!els.expatCnyNote) return;
  const usd = Number(els.expatUsd?.value ?? state.expatUsd) || 0;
  const rate = Number(els.usdCnyRate?.value ?? state.usdCnyRate) || 0;
  const cny = usd * rate;
  const on = state.expatOn;
  els.expatCnyNote.textContent = on
    ? `合人民币 ${formatMoney(cny)} / 天 · 已计入日薪`
    : `合人民币 ${formatMoney(cny)} / 天 · 关闭时不计入`;
}

function syncSettingsForm() {
  const bag = state.salaries[state.taxMode];
  if (els.annual) els.annual.value = bag.annual || "";
  if (els.monthly) els.monthly.value = bag.monthly || "";
  if (els.workStart) els.workStart.value = state.workStart;
  if (els.workEnd) els.workEnd.value = state.workEnd;
  if (els.lunchStart) els.lunchStart.value = state.lunchStart;
  if (els.lunchEnd) els.lunchEnd.value = state.lunchEnd;
  if (els.workDaysYear) els.workDaysYear.value = state.workDaysYear;
  if (els.wishPrice) els.wishPrice.value = state.wishPrice;
  if (els.expatUsd) els.expatUsd.value = state.expatUsd ?? "";
  if (els.usdCnyRate) els.usdCnyRate.value = state.usdCnyRate ?? DEFAULT_USD_CNY;

  if (els.taxToggle) els.taxToggle.dataset.mode = state.taxMode;
  els.taxPre?.setAttribute("aria-selected", String(state.taxMode === "pre"));
  els.taxPost?.setAttribute("aria-selected", String(state.taxMode === "post"));
  els.pickAnnual?.classList.toggle("active", state.basis === "annual");
  els.pickMonthly?.classList.toggle("active", state.basis === "monthly");

  els.expatToggle?.setAttribute("aria-checked", String(!!state.expatOn));
  els.expatBlock?.classList.toggle("is-on", !!state.expatOn);
  updateExpatNote();
  syncSlackButton();
}

function syncSlackButton() {
  if (!els.slackToggle) return;
  els.slackToggle.textContent = state.slackActive ? "结束摸鱼" : "开始摸鱼";
  els.slackToggle.classList.toggle("is-active", !!state.slackActive);
  els.slackToggle.setAttribute("aria-pressed", String(!!state.slackActive));
}

function openSheet() {
  syncSettingsForm();
  els.sheet?.classList.add("open");
  els.sheet?.setAttribute("aria-hidden", "false");
  if (els.backdrop) els.backdrop.hidden = false;
}

function closeSheet() {
  els.sheet?.classList.remove("open");
  els.sheet?.setAttribute("aria-hidden", "true");
  if (els.backdrop) els.backdrop.hidden = true;
}

function readSettingsFromForm() {
  const bag = state.salaries[state.taxMode];
  if (els.annual) bag.annual = Number(els.annual.value) || 0;
  if (els.monthly) bag.monthly = Number(els.monthly.value) || 0;
  if (els.workStart?.value) state.workStart = els.workStart.value;
  if (els.workEnd?.value) state.workEnd = els.workEnd.value;
  if (els.lunchStart?.value) state.lunchStart = els.lunchStart.value;
  if (els.lunchEnd?.value) state.lunchEnd = els.lunchEnd.value;
  if (els.workDaysYear) {
    state.workDaysYear = Math.max(1, Number(els.workDaysYear.value) || 250);
  }
  if (els.expatUsd) state.expatUsd = Number(els.expatUsd.value) || 0;
  if (els.usdCnyRate) {
    state.usdCnyRate = Math.max(0, Number(els.usdCnyRate.value) || DEFAULT_USD_CNY);
  }
}

async function refreshUsdCnyRate() {
  if (els.refreshRate) {
    els.refreshRate.disabled = true;
    els.refreshRate.textContent = "刷新中…";
  }
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!res.ok) throw new Error("rate fetch failed");
    const data = await res.json();
    const rate = Number(data?.rates?.CNY);
    if (rate > 0) {
      state.usdCnyRate = Math.round(rate * 10000) / 10000;
      if (els.usdCnyRate) els.usdCnyRate.value = String(state.usdCnyRate);
      saveState();
      updateExpatNote();
      tick();
    }
  } catch {
    updateExpatNote();
  } finally {
    if (els.refreshRate) {
      els.refreshRate.disabled = false;
      els.refreshRate.textContent = "刷新汇率";
    }
  }
}

function toggleSlack() {
  const now = nowFn();
  if (state.slackActive) {
    const started = state.slackStartedAt || now.getTime();
    state.slackSeconds =
      (Number(state.slackSeconds) || 0) +
      Math.max(0, (now.getTime() - started) / 1000);
    state.slackActive = false;
    state.slackStartedAt = null;
  } else {
    state.slackActive = true;
    state.slackStartedAt = now.getTime();
  }
  saveState();
  syncSlackButton();
  tick();
}

function resetSlack() {
  const now = nowFn();
  state.slackSeconds = 0;
  // If currently 摸鱼中, restart session from now so old time isn't re-added.
  state.slackStartedAt = state.slackActive ? now.getTime() : null;
  saveState();
  tick();
}

function tick() {
  const now = nowFn();
  const { perSecond, perMinute, perHour, daily } = ratesAt(now);

  const left = minutesUntilOffWork(now);
  const todaySeconds = workedSecondsOnDay(now, now);
  const todayEarned = todaySeconds * perSecond;
  const completedDays = countCompletedWeekdaysThisMonth(now);
  const monthEarned = completedDays * daily + todayEarned;

  const unitEl = els.minutesLeft?.nextElementSibling;
  if (els.minutesLeft) {
    if (left.status === "before") {
      els.minutesLeft.hidden = true;
      els.minutesLeft.textContent = "";
    } else {
      els.minutesLeft.hidden = false;
      els.minutesLeft.textContent = String(left.minutes);
    }
  }
  if (unitEl) {
    unitEl.classList.toggle("is-status-only", left.status === "before");
    if (left.status === "before") unitEl.textContent = "尚未上班";
    else if (left.status === "weekend") unitEl.textContent = "分钟 · 今天休息";
    else if (left.status === "done") unitEl.textContent = "分钟 · 已下班";
    else unitEl.textContent = "分钟";
  }

  if (els.todayEarned) els.todayEarned.textContent = formatMoney(todayEarned);
  if (els.monthEarned) els.monthEarned.textContent = formatMoney(monthEarned);
  if (els.perDay) els.perDay.textContent = formatMoney(daily);
  if (els.perHour) els.perHour.textContent = formatMoney(perHour);
  if (els.perMinute) els.perMinute.textContent = formatMoney(perMinute);

  const extras = [];
  if (state.expatOn) extras.push("外派");
  if (els.basisLabel) {
    if (!hasSalaryConfigured()) {
      els.basisLabel.textContent = "请设置薪资";
    } else {
      els.basisLabel.textContent = [basisLabel(), taxLabel(), ...extras].join(" · ");
    }
  }
  if (els.scheduleHint) {
    els.scheduleHint.textContent = `工作日 ${state.workStart}–${state.workEnd} · 午休 ${state.lunchStart}–${state.lunchEnd}`;
  }

  const price = Number(els.wishPrice?.value);
  if (els.wishDays) {
    if (!price || daily <= 0) els.wishDays.textContent = "—";
    else els.wishDays.textContent = formatDays(price / daily);
  }

  const slackSec = liveSlackSeconds(now);
  if (els.slackStats) {
    const earned = slackSec * perSecond;
    els.slackStats.textContent = `累计 ${Math.floor(slackSec).toLocaleString("zh-CN")} 秒，等于 ${formatMoney(earned)}`;
  }

  if (els.testBanner) {
    els.testBanner.textContent = `测试模式 · 模拟时间 ${formatClock(now)}`;
  }
}

function bindUi() {
  els.openSettings?.addEventListener("click", openSheet);
  els.closeSettings?.addEventListener("click", closeSheet);
  els.backdrop?.addEventListener("click", closeSheet);

  els.taxPre?.addEventListener("click", () => {
    readSettingsFromForm();
    state.taxMode = "pre";
    syncSettingsForm();
    tick();
  });

  els.taxPost?.addEventListener("click", () => {
    readSettingsFromForm();
    state.taxMode = "post";
    syncSettingsForm();
    tick();
  });

  els.pickAnnual?.addEventListener("click", () => {
    state.basis = "annual";
    els.pickAnnual.classList.add("active");
    els.pickMonthly?.classList.remove("active");
    tick();
  });

  els.pickMonthly?.addEventListener("click", () => {
    state.basis = "monthly";
    els.pickMonthly.classList.add("active");
    els.pickAnnual?.classList.remove("active");
    tick();
  });

  els.expatToggle?.addEventListener("click", () => {
    readSettingsFromForm();
    state.expatOn = !state.expatOn;
    syncSettingsForm();
    saveState();
    tick();
  });

  els.expatUsd?.addEventListener("input", () => {
    state.expatUsd = Number(els.expatUsd.value) || 0;
    updateExpatNote();
  });

  els.usdCnyRate?.addEventListener("input", () => {
    state.usdCnyRate = Number(els.usdCnyRate.value) || 0;
    updateExpatNote();
  });

  els.refreshRate?.addEventListener("click", () => {
    refreshUsdCnyRate();
  });

  els.save?.addEventListener("click", () => {
    readSettingsFromForm();
    saveState();
    if (hasSalaryConfigured()) reportVisit("settings");
    closeSheet();
    tick();
  });

  els.wishPrice?.addEventListener("input", () => {
    state.wishPrice = els.wishPrice.value;
    saveState();
    tick();
  });

  els.slackToggle?.addEventListener("click", toggleSlack);
  els.slackReset?.addEventListener("click", resetSlack);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSheet();
  });
}

bindUi();
syncSettingsForm();
tick();
setInterval(tick, 100);

if (isTestMode && !state.usdCnyRate) {
  refreshUsdCnyRate();
}
