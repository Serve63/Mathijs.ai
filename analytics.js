(() => {
  const SUPABASE_URL = "https://mengrlsqgshxqcxhirjn.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_PeVTrMXz6UaeMhkPn5Fs-Q_xfJFVRNt";

  const rangeButtons = Array.from(document.querySelectorAll("[data-range]"));
  const modeButtons = Array.from(document.querySelectorAll("[data-mode]"));
  const rangePickerEl = document.getElementById("range-picker");
  const rangeFromEl = document.getElementById("range-from");
  const rangeToEl = document.getElementById("range-to");
  const rangeFromBtn = document.getElementById("range-from-btn");
  const rangeToBtn = document.getElementById("range-to-btn");
  const rangeCalendarEl = document.getElementById("range-calendar");
  const rangeCalendarTitle = document.getElementById("range-calendar-title");
  const rangeCalendarDays = document.getElementById("range-days");
  const rangeCalendarWeekdays = document.getElementById("range-weekdays");
  const rangeCalendarPrev = document.getElementById("range-prev");
  const rangeCalendarNext = document.getElementById("range-next");
  const rangeApplyEl = document.getElementById("range-apply");
  const rangeCancelEl = document.getElementById("range-cancel");
  const revenueEl = document.getElementById("stat-revenue");
  const revenueLabelEl = document.getElementById("stat-revenue-label");
  const revenueSubEl = document.getElementById("stat-revenue-sub");
  const revenueToggleEl = document.getElementById("stat-revenue-toggle");
  const revenueSettingsBtn = document.getElementById("stat-revenue-settings");
  const revenueActionsEl = document.getElementById("stat-revenue-actions");
  const profitSettingsModal = document.getElementById("analytics-profit-settings");
  const profitSettingsForm = document.getElementById("analytics-profit-form");
  const profitSettingsClose = document.getElementById("analytics-profit-close");
  const profitSettingsCancel = document.getElementById("analytics-profit-cancel");
  const profitSettingsCost = document.getElementById("analytics-profit-cost");
  const profitSettingsVat = document.getElementById("analytics-profit-vat");
  const ordersEl = document.getElementById("stat-orders");
  const ordersLabelEl = document.getElementById("stat-orders-label");
  const ordersSubEl = document.getElementById("stat-orders-sub");
  const subsEl = document.getElementById("stat-subs");
  const subsLabelEl = document.getElementById("stat-subs-label");
  const subsSubEl = document.getElementById("stat-subs-sub");
  const activeEl = document.getElementById("stat-active");
  const activeLabelEl = document.getElementById("stat-active-label");
  const activeSubEl = document.getElementById("stat-active-sub");
  const summaryGridEl = document.getElementById("summary-grid");
  const chartTitleEl = document.getElementById("chart-title");
  const chartMetaEl = document.getElementById("chart-meta");
  const chartTotalEl = document.getElementById("chart-total");
  const barChartEl = document.getElementById("bar-chart");
  const tableMetaEl = document.getElementById("table-meta");
  const tableEl = document.getElementById("analytics-table");
  const tableOrdersLabelEl = document.getElementById("table-orders-label");
  const tableSubsLabelEl = document.getElementById("table-subs-label");
  const creditSavingsPanel = document.getElementById("credit-savings-panel");
  const creditSavingsMetaEl = document.getElementById("credit-savings-meta");
  const creditSavingsTotalEl = document.getElementById("credit-savings-total");
  const creditSavingsValueEl = document.getElementById("credit-savings-value");
  const creditOverlayEl = document.getElementById("credit-overlay");

  const fmtEUR = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
  const fmtNumber = new Intl.NumberFormat("nl-NL");
  const fmtDateLong = new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "short", year: "numeric" });
  const fmtDateLongFull = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" });
  const fmtMonthYear = new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" });
  const fmtDayMonth = new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "short" });
  const fmtMonthShort = new Intl.DateTimeFormat("nl-NL", { month: "short" });
  const fmtMonthShortYear = new Intl.DateTimeFormat("nl-NL", { month: "short", year: "numeric" });
  const fmtWeekdayShort = new Intl.DateTimeFormat("nl-NL", { weekday: "short" });

  const today = new Date();
  const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const PROFIT_SETTINGS_KEY = "mathijs_profit_settings_v1";
  const VIEW_STATE_KEY = "mathijs_analytics_view_v1";

  let dailyPoints = [];
  let pointMap = new Map();
  let ranges = {};
  let rangeBounds = { from: todayUTC, to: todayUTC };
  let dataReady = false;
  let totalChatsAllTime = null;
  let showProfit = false;
  let lastRange = null;
  let profitSettings = { creditCostPerCustomer: 0, vatPercent: 0 };
  let metricMode = "revenue";
  let creditOverlayActive = false;
  let activeRangeId = "week";
  let tokensPerChat = 1;
  let tokensPerEur = 100;
  let creditAllowanceEur = 10;

  const setCreditButtonActive = (isActive) => {
    modeButtons.forEach((button) => {
      const isCredit = button.dataset.mode === "credits";
      if (!isCredit) return;
      button.classList.toggle("is-active", Boolean(isActive));
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  };

  const isCreditViewActive = () => creditOverlayActive || metricMode === "credits";

  const createSupabaseClient = () => {
    if (!window.supabase?.createClient) return null;
    if (window.mathijsSupabase) return window.mathijsSupabase;
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    window.mathijsSupabase = client;
    return client;
  };

  const getAccessToken = async (supabase) => {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  };

  const ensureStaff = async (supabase, token) => {
    if (!token) return false;
    const resp = await fetch("/api/staff/me", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok || !payload?.staff) {
      await supabase.auth.signOut();
      return false;
    }
    return true;
  };

  const toISODate = (date) => {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  };

  const parseISODate = (value) => {
    if (!value) return null;
    const [y, m, d] = value.split("-").map((v) => Number(v));
    if (!y || !m || !d) return null;
    return new Date(Date.UTC(y, m - 1, d));
  };

  const clampNumber = (value, min = 0, max = Number.POSITIVE_INFINITY) => {
    if (!Number.isFinite(value)) return min;
    return Math.min(Math.max(value, min), max);
  };

  const loadProfitSettings = () => {
    try {
      const raw = localStorage.getItem(PROFIT_SETTINGS_KEY);
      if (!raw) return { creditCostPerCustomer: 0, vatPercent: 0 };
      const parsed = JSON.parse(raw);
      return {
        creditCostPerCustomer: clampNumber(Number(parsed?.creditCostPerCustomer || 0), 0),
        vatPercent: clampNumber(Number(parsed?.vatPercent || 0), 0, 100),
      };
    } catch (e) {
      console.warn("Kon winst instellingen niet laden", e);
      return { creditCostPerCustomer: 0, vatPercent: 0 };
    }
  };

  const saveProfitSettings = (settings) => {
    try {
      localStorage.setItem(PROFIT_SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn("Kon winst instellingen niet opslaan", e);
    }
  };

  const formatSettingValue = (value) => {
    if (!Number.isFinite(value)) return "0";
    return value.toFixed(2);
  };

  const getEurPerChat = () => {
    const perEur = clampNumber(Number(tokensPerEur || 0), 1, Number.POSITIVE_INFINITY);
    const perChat = clampNumber(Number(tokensPerChat || 0), 1, Number.POSITIVE_INFINITY);
    return perChat / perEur;
  };

  const loadViewState = () => {
    try {
      const raw = localStorage.getItem(VIEW_STATE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const rangeId = typeof parsed?.rangeId === "string" ? parsed.rangeId : null;
      const mode = parsed?.mode === "credits" ? "credits" : "revenue";
      const from = typeof parsed?.from === "string" ? parsed.from : null;
      const to = typeof parsed?.to === "string" ? parsed.to : null;
      return { rangeId, mode, from, to };
    } catch (e) {
      console.warn("Kon analytics view state niet laden", e);
      return null;
    }
  };

  const saveViewState = (state) => {
    try {
      localStorage.setItem(VIEW_STATE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Kon analytics view state niet opslaan", e);
    }
  };

  const WEEKDAY_LABELS = ["ma", "di", "wo", "do", "vr", "za", "zo"];
  let calendarMonth = new Date(todayUTC);
  let activeField = "from";

  const setActiveField = (field) => {
    activeField = field;
    if (rangeFromBtn) rangeFromBtn.classList.toggle("is-active", field === "from");
    if (rangeToBtn) rangeToBtn.classList.toggle("is-active", field === "to");
  };

  const updateRangeButtons = () => {
    const fromDate = parseISODate(rangeFromEl?.value);
    const toDate = parseISODate(rangeToEl?.value);
    if (rangeFromBtn) rangeFromBtn.textContent = fromDate ? fmtDateLong.format(fromDate) : "--";
    if (rangeToBtn) rangeToBtn.textContent = toDate ? fmtDateLong.format(toDate) : "--";
  };

  const renderWeekdays = () => {
    if (!rangeCalendarWeekdays) return;
    if (rangeCalendarWeekdays.childElementCount) return;
    rangeCalendarWeekdays.innerHTML = WEEKDAY_LABELS.map((day) => `<div class="range-calendar__weekday">${day}</div>`).join("");
  };

  const renderCalendar = () => {
    if (!rangeCalendarEl || !rangeCalendarDays || !rangeCalendarTitle) return;
    renderWeekdays();
    const monthStart = new Date(Date.UTC(calendarMonth.getUTCFullYear(), calendarMonth.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(calendarMonth.getUTCFullYear(), calendarMonth.getUTCMonth() + 1, 0));
    rangeCalendarTitle.textContent = fmtMonthYear.format(monthStart);

    const startWeekday = (monthStart.getUTCDay() + 6) % 7;
    const totalDays = monthEnd.getUTCDate();
    const cells = [];
    const fromDate = parseISODate(rangeFromEl?.value);
    const toDate = parseISODate(rangeToEl?.value);

    for (let i = 0; i < startWeekday; i += 1) {
      const day = new Date(monthStart.getTime() - (startWeekday - i) * 24 * 60 * 60 * 1000);
      cells.push({ date: day, outside: true });
    }
    for (let day = 1; day <= totalDays; day += 1) {
      const date = new Date(Date.UTC(calendarMonth.getUTCFullYear(), calendarMonth.getUTCMonth(), day));
      cells.push({ date, outside: false });
    }
    const remainder = cells.length % 7;
    const needed = remainder === 0 ? 0 : 7 - remainder;
    for (let i = 1; i <= needed; i += 1) {
      const day = new Date(monthEnd.getTime() + i * 24 * 60 * 60 * 1000);
      cells.push({ date: day, outside: true });
    }

    rangeCalendarDays.innerHTML = cells
      .map((cell) => {
        const iso = toISODate(cell.date);
        const isFrom = fromDate && toISODate(fromDate) === iso;
        const isTo = toDate && toISODate(toDate) === iso;
        const inRange =
          fromDate && toDate && cell.date.getTime() >= fromDate.getTime() && cell.date.getTime() <= toDate.getTime();
        const classes = ["range-calendar__day"];
        if (cell.outside) classes.push("is-outside");
        if (inRange) classes.push("is-in-range");
        if (isFrom || isTo) classes.push("is-selected");
        return `<button class="${classes.join(" ")}" type="button" data-date="${iso}">${cell.date.getUTCDate()}</button>`;
      })
      .join("");
  };

  const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  const startOfWeekMonday = (date) => {
    const day = date.getUTCDay();
    const diff = (day + 6) % 7;
    return addDays(date, -diff);
  };

  const daysBetweenInclusive = (a, b) => {
    const ms = 24 * 60 * 60 * 1000;
    const start = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
    const end = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
    return Math.floor((end - start) / ms) + 1;
  };

  const normalizePoints = (points) =>
    (Array.isArray(points) ? points : []).map((point) => ({
      date: String(point?.date || ""),
      revenue: Number(point?.revenue || 0),
      orders: Number(point?.orders || 0),
      subs: Number(point?.subs || 0),
      active: Number(point?.active || 0),
      spend_eur: Number.isFinite(Number(point?.spend_eur)) ? Number(point.spend_eur) : null,
    }));

  const rebuildPointMap = () => {
    pointMap = new Map();
    dailyPoints.forEach((point) => {
      if (!point.date) return;
      pointMap.set(point.date, point);
    });
  };

  const buildDailySeries = (fromDate, toDate, labelFn) => {
    const points = [];
    let cursor = new Date(fromDate);
    let lastActive = 0;
    while (cursor <= toDate) {
      const dateKey = toISODate(cursor);
      const base = pointMap.get(dateKey) || {};
      const active = Number.isFinite(base.active) ? base.active : lastActive;
      lastActive = active;
      points.push({
        label: labelFn ? labelFn(cursor) : dateKey,
        revenue: Number(base.revenue || 0),
        orders: Number(base.orders || 0),
        subs: Number(base.subs || 0),
        active,
        spend_eur: Number.isFinite(base.spend_eur) ? base.spend_eur : null,
      });
      cursor = addDays(cursor, 1);
    }
    return points;
  };

  const sumPoints = (points, label) => {
    let spendSum = 0;
    let hasSpend = false;
    const totals = points.reduce(
      (acc, p) => {
        acc.revenue += p.revenue;
        acc.orders += p.orders;
        acc.subs += p.subs;
        acc.active = p.active;
        if (Number.isFinite(p.spend_eur)) {
          spendSum += p.spend_eur;
          hasSpend = true;
        }
        return acc;
      },
      { revenue: 0, orders: 0, subs: 0, active: 0 }
    );
    return { label, ...totals, spend_eur: hasSpend ? spendSum : null };
  };

  const monthAggregate = (year, monthIndex, maxDate) => {
    const monthStart = new Date(Date.UTC(year, monthIndex, 1));
    const monthEnd = new Date(Date.UTC(year, monthIndex + 1, 0));
    const realEnd = maxDate && monthEnd > maxDate ? maxDate : monthEnd;
    if (realEnd < monthStart) return null;
    const points = buildDailySeries(monthStart, realEnd);
    const label = fmtMonthShort.format(monthStart).toLowerCase();
    return sumPoints(points, label);
  };

  const yearAggregate = (year, maxDate) => {
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year + 1, 0, 0));
    const realEnd = maxDate && yearEnd > maxDate ? maxDate : yearEnd;
    if (realEnd < yearStart) return null;
    const points = buildDailySeries(yearStart, realEnd);
    return sumPoints(points, String(year));
  };

  const generateCustomPoints = (fromDate, toDate) => {
    const totalDays = daysBetweenInclusive(fromDate, toDate);
    const points = [];
    const ms = 24 * 60 * 60 * 1000;

    if (totalDays <= 21) {
      return buildDailySeries(fromDate, toDate, (d) => fmtDayMonth.format(d).toUpperCase());
    }

    if (totalDays <= 120) {
      let start = new Date(fromDate);
      while (start <= toDate) {
        const end = new Date(Math.min(toDate.getTime(), start.getTime() + 6 * ms));
        const bucket = buildDailySeries(start, end);
        const label = `${fmtDayMonth.format(start)}–${fmtDayMonth.format(end)}`;
        points.push(sumPoints(bucket, label));
        start = addDays(end, 1);
      }
      return points;
    }

    let cursor = new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), 1));
    const endMonth = new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), 1));
    while (cursor <= endMonth) {
      const monthStart = new Date(cursor);
      const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
      const realStart = new Date(Math.max(monthStart.getTime(), fromDate.getTime()));
      const realEnd = new Date(Math.min(monthEnd.getTime(), toDate.getTime()));
      const bucket = buildDailySeries(realStart, realEnd);
      const label = fmtMonthShortYear.format(monthStart);
      points.push(sumPoints(bucket, label));
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }
    return points;
  };

  const buildMonthlySeries = (fromDate, toDate) => {
    const points = [];
    let cursor = new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), 1));
    const endMonth = new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), 1));
    while (cursor <= endMonth) {
      const monthStart = new Date(cursor);
      const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
      const realStart = new Date(Math.max(monthStart.getTime(), fromDate.getTime()));
      const realEnd = new Date(Math.min(monthEnd.getTime(), toDate.getTime()));
      if (realEnd < realStart) {
        cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
        continue;
      }
      const bucket = buildDailySeries(realStart, realEnd);
      const label = fmtMonthShortYear.format(monthStart);
      points.push(sumPoints(bucket, label));
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }
    return points;
  };

  const computeTotals = (points) =>
    points.reduce(
      (acc, point) => {
        acc.revenue += point.revenue;
        acc.orders += point.orders;
        acc.subs += point.subs;
        acc.active = point.active;
        return acc;
      },
      { revenue: 0, orders: 0, subs: 0, active: 0 }
    );

  const computeCreditTotals = (points) =>
    points.reduce(
      (acc, point) => {
        acc.spent += Number(point.spent || 0);
        acc.max += Number(point.max || 0);
        return acc;
      },
      { spent: 0, max: 0 }
    );

  const getRangeBounds = (rangeId) => {
    const end = rangeBounds.to || todayUTC;
    if (rangeId === "week") {
      return { from: addDays(end, -6), to: end };
    }
    if (rangeId === "month") {
      const from = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
      return { from, to: end };
    }
    if (rangeId === "quarter") {
      const startMonth = Math.floor(end.getUTCMonth() / 3) * 3;
      const from = new Date(Date.UTC(end.getUTCFullYear(), startMonth, 1));
      return { from, to: end };
    }
    if (rangeId === "year") {
      const from = new Date(Date.UTC(end.getUTCFullYear(), 0, 1));
      return { from, to: end };
    }
    if (rangeId === "custom") {
      const from = parseISODate(rangeFromEl?.value) || rangeBounds.from || todayUTC;
      const to = parseISODate(rangeToEl?.value) || end;
      return { from, to };
    }
    return { from: rangeBounds.from || todayUTC, to: end };
  };

  const buildCreditSeries = (rangeId) => {
    const { from, to } = getRangeBounds(rangeId);
    const monthlyPoints = buildMonthlySeries(from, to);
    const eurPerChat = getEurPerChat();
    return monthlyPoints.map((point) => {
      const spent = Number.isFinite(point.spend_eur) ? point.spend_eur : Number(point.orders || 0) * eurPerChat;
      const max = Number(point.active || 0) * creditAllowanceEur;
      return { ...point, spent, max };
    });
  };

  const computeProfitTotal = (points, totals) => {
    const revenue = Number(totals?.revenue || 0);
    if (!points || !points.length || !Number.isFinite(revenue)) return 0;
    const vatRate = clampNumber(Number(profitSettings.vatPercent || 0), 0, 100) / 100;
    const costPerCustomer = clampNumber(Number(profitSettings.creditCostPerCustomer || 0), 0);
    const activeSum = points.reduce((sum, point) => sum + (Number(point?.active) || 0), 0);
    const vatAmount = revenue * vatRate;
    const creditsCost = costPerCustomer * activeSum;
    return revenue - vatAmount - creditsCost;
  };

  const updateRevenueCard = (config, totals) => {
    if (!revenueEl || !revenueSubEl || !config || !totals) return;
    const meta = config.meta || "";
    const profitTotal = computeProfitTotal(config.points || [], totals);

    if (showProfit) {
      if (revenueLabelEl) revenueLabelEl.textContent = "Winst";
      revenueEl.textContent = fmtEUR.format(profitTotal);
      if (revenueToggleEl) {
        revenueToggleEl.textContent = "Toon omzet";
        revenueToggleEl.setAttribute("aria-pressed", "true");
      }
    } else {
      if (revenueLabelEl) revenueLabelEl.textContent = "Omzet";
      revenueEl.textContent = fmtEUR.format(totals.revenue || 0);
      if (revenueToggleEl) {
        revenueToggleEl.textContent = "Toon winst";
        revenueToggleEl.setAttribute("aria-pressed", "false");
      }
    }
    revenueSubEl.textContent = meta;
  };

  const updateCreditCard = (config, totals) => {
    if (!revenueEl || !revenueSubEl || !config || !totals) return;
    const meta = config.meta || "";
    if (revenueLabelEl) revenueLabelEl.textContent = "Kredietgebruik";
    revenueEl.textContent = fmtEUR.format(Number(totals.spent || 0));
    revenueSubEl.textContent = `${meta} · max ${fmtEUR.format(Number(totals.max || 0))}`;
  };

  const updateCreditSavings = (meta, extraProfit) => {
    if (creditSavingsMetaEl) creditSavingsMetaEl.textContent = meta || "Per maand";
    if (creditSavingsTotalEl) creditSavingsTotalEl.textContent = `${fmtEUR.format(extraProfit)} extra`;
    if (creditSavingsValueEl) creditSavingsValueEl.textContent = fmtEUR.format(extraProfit);
  };

  const getAllTimeCreditSavings = () => {
    const fromDate =
      rangeBounds.from ||
      (dailyPoints[0]?.date ? parseISODate(dailyPoints[0].date) : null) ||
      todayUTC;
    const lastFullMonthEnd = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), 0));
    if (lastFullMonthEnd < fromDate) {
      return { extra: 0, meta: "All time · nog geen volledige maand" };
    }
    const monthlyPoints = buildMonthlySeries(fromDate, lastFullMonthEnd);
    const eurPerChat = getEurPerChat();
    const creditPoints = monthlyPoints.map((point) => ({
      spent: Number.isFinite(point.spend_eur) ? point.spend_eur : Number(point.orders || 0) * eurPerChat,
      max: Number(point.active || 0) * creditAllowanceEur,
    }));
    const totals = computeCreditTotals(creditPoints);
    const extra = Math.max(totals.max - totals.spent, 0);
    const startLabel = fmtMonthYear.format(new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), 1)));
    const endLabel = fmtMonthYear.format(
      new Date(Date.UTC(lastFullMonthEnd.getUTCFullYear(), lastFullMonthEnd.getUTCMonth(), 1))
    );
    const meta =
      startLabel === endLabel
        ? `Volledige maanden: ${startLabel}`
        : `Volledige maanden: ${startLabel} – ${endLabel}`;
    return { extra, meta };
  };

  const renderChart = (points, options = {}) => {
    if (!barChartEl) return;
    const mode = options.mode || "revenue";
    const maxRevenue =
      mode === "credits"
        ? 1
        : points.length
        ? points.reduce((max, point) => Math.max(max, point.revenue), 0)
        : 0;

    barChartEl.innerHTML = points
      .map((point) => {
        if (mode === "credits") {
          const max = Number(point.max || 0);
          const spent = Number(point.spent || 0);
          const ratio = max ? Math.min(spent / max, 1) : 0;
          const valueLabel = `${fmtEUR.format(spent)} / ${fmtEUR.format(max)}`;
          return `
            <div class="bar" style="--bar: ${ratio}">
              <div class="bar-value">${valueLabel}</div>
              <div class="bar-fill" title="${valueLabel}"></div>
              <div class="bar-label">${point.label}</div>
            </div>
          `;
        }
        const ratio = maxRevenue ? point.revenue / maxRevenue : 0;
        return `
          <div class="bar" style="--bar: ${ratio}">
            <div class="bar-value">${fmtEUR.format(point.revenue)}</div>
            <div class="bar-fill" title="${fmtEUR.format(point.revenue)}"></div>
            <div class="bar-label">${point.label}</div>
          </div>
        `;
      })
      .join("");
  };

  const renderTable = (points, includeTotalRow, labels = {}) => {
    if (!tableEl) return;
    const ordersLabel = labels.orders || "Verstuurde chats";
    const subsLabel = labels.subs || "Nieuwe abonnees";
    const activeLabel = labels.active || "Actieve abonnees";
    const rows = [];

    if (includeTotalRow) {
      const totals = computeTotals(points);
      rows.push(`
        <div class="table-row">
          <div class="cell" data-label="Periode"><strong>All time</strong></div>
          <div class="cell" data-label="Omzet"><strong>${fmtEUR.format(totals.revenue)}</strong></div>
          <div class="cell" data-label="${ordersLabel}"><strong>${fmtNumber.format(totals.orders)}</strong></div>
          <div class="cell" data-label="${subsLabel}"><strong>${fmtNumber.format(totals.subs)}</strong></div>
          <div class="cell" data-label="${activeLabel}"><strong>${fmtNumber.format(totals.active)}</strong></div>
        </div>
      `);
    }

    points.forEach((point) => {
      rows.push(`
        <div class="table-row">
          <div class="cell" data-label="Periode">${point.label}</div>
          <div class="cell" data-label="Omzet">${fmtEUR.format(point.revenue)}</div>
          <div class="cell" data-label="${ordersLabel}">${fmtNumber.format(point.orders)}</div>
          <div class="cell" data-label="${subsLabel}">${fmtNumber.format(point.subs)}</div>
          <div class="cell" data-label="${activeLabel}">${fmtNumber.format(point.active)}</div>
        </div>
      `);
    });

    tableEl.innerHTML = rows.join("");
  };

  const setRangeButtonState = (rangeId, enabled) => {
    rangeButtons.forEach((button) => {
      if (!enabled) {
        button.classList.remove("is-active");
        button.setAttribute("aria-pressed", "false");
        return;
      }
      const isActive = button.dataset.range === rangeId;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  };

  const setCreditOverlayState = (isActive) => {
    creditOverlayActive = Boolean(isActive);
    if (creditOverlayEl) creditOverlayEl.hidden = !creditOverlayActive;
    if (creditSavingsPanel) creditSavingsPanel.hidden = !isCreditViewActive();
    if (summaryGridEl) summaryGridEl.hidden = metricMode === "credits" || creditOverlayActive;
    setCreditButtonActive(isCreditViewActive());
    setRangeButtonState(activeRangeId, metricMode === "revenue" && !creditOverlayActive);
  };

  const setActiveRange = (rangeId) => {
    activeRangeId = rangeId;
    const config = ranges[rangeId] || ranges.week;
    if (!config) return;
    const totals = computeTotals(config.points);
    const isAllTime = rangeId === "all";
    const ordersValue =
      isAllTime && Number.isFinite(totalChatsAllTime) ? totalChatsAllTime : totals.orders;
    const ordersLabelText = isAllTime ? "Totaal verstuurde chats" : "Verstuurde chats";
    setRangeButtonState(rangeId, metricMode === "revenue" && !creditOverlayActive);
    if (rangeId === "custom") {
      const from = rangeFromEl?.value || null;
      const to = rangeToEl?.value || null;
      saveViewState({ rangeId, mode: metricMode, from, to });
    } else {
      saveViewState({ rangeId, mode: metricMode });
    }

    if (ordersLabelEl) {
      ordersLabelEl.textContent = ordersLabelText;
    }
    if (tableOrdersLabelEl) {
      tableOrdersLabelEl.textContent = ordersLabelText;
    }
    const subsLabelText = isAllTime ? "Abonnees" : "Nieuwe abonnees";
    if (subsLabelEl) {
      subsLabelEl.textContent = subsLabelText;
    }
    if (tableSubsLabelEl) {
      tableSubsLabelEl.textContent = subsLabelText;
    }
    if (activeLabelEl) {
      activeLabelEl.textContent = "Actieve abonnees";
    }

    lastRange = { config, totals, rangeId };
    if (metricMode === "credits") {
      const creditPoints = buildCreditSeries(rangeId);
      const creditTotals = computeCreditTotals(creditPoints);
      const creditMeta = config.meta ? `${config.meta} · per maand` : "per maand";
      updateCreditCard({ ...config, meta: creditMeta }, creditTotals);
      const savings = getAllTimeCreditSavings();
      updateCreditSavings(savings.meta, savings.extra);
      if (summaryGridEl) summaryGridEl.hidden = true;
      if (chartTitleEl) chartTitleEl.textContent = `Kredietgebruik per maand (${config.label})`;
      if (chartMetaEl) chartMetaEl.textContent = creditMeta;
      if (chartTotalEl) {
        chartTotalEl.textContent = `${fmtEUR.format(creditTotals.spent)} / ${fmtEUR.format(creditTotals.max)} max`;
      }
      renderChart(creditPoints, { mode: "credits" });
    } else {
      updateRevenueCard(config, totals);
      if (summaryGridEl) summaryGridEl.hidden = creditOverlayActive;
      if (chartTitleEl) chartTitleEl.textContent = `Omzet trend (${config.label})`;
      if (chartMetaEl) chartMetaEl.textContent = config.meta;
      if (chartTotalEl) chartTotalEl.textContent = `${fmtEUR.format(totals.revenue)} totaal`;
      renderChart(config.points, { mode: "revenue" });
    }
    if (ordersEl) ordersEl.textContent = fmtNumber.format(ordersValue);
    if (ordersSubEl) ordersSubEl.textContent = config.meta;
    if (subsEl) subsEl.textContent = fmtNumber.format(totals.subs);
    if (subsSubEl) subsSubEl.textContent = config.meta;
    if (activeEl) activeEl.textContent = fmtNumber.format(totals.active);
    if (activeSubEl) activeSubEl.textContent = "Laatste meetpunt";

    if (tableMetaEl) tableMetaEl.textContent = config.meta;

    renderTable(config.points, Boolean(config.showTotalRow), {
      orders: ordersLabelText,
      subs: subsLabelText,
      active: "Actieve abonnees",
    });
  };

  const closePicker = () => {
    if (!rangePickerEl) return;
    rangePickerEl.hidden = true;
  };

  const openPicker = () => {
    if (!rangePickerEl) return;
    rangePickerEl.hidden = false;
    setActiveField(activeField || "from");
    const baseDate =
      activeField === "to" ? parseISODate(rangeToEl?.value) : parseISODate(rangeFromEl?.value);
    calendarMonth = baseDate || new Date(todayUTC);
    updateRangeButtons();
    renderCalendar();
    if (rangeFromBtn) rangeFromBtn.focus();
  };

  const setLoadingState = (message) => {
    if (revenueEl) revenueEl.textContent = "--";
    if (revenueLabelEl) {
      revenueLabelEl.textContent = metricMode === "credits" ? "Kredietgebruik" : "Omzet";
    }
    if (revenueActionsEl) {
      revenueActionsEl.hidden = metricMode === "credits";
    }
    if (creditSavingsPanel) {
      creditSavingsPanel.hidden = !isCreditViewActive();
    }
    if (summaryGridEl) {
      summaryGridEl.hidden = metricMode === "credits" || creditOverlayActive;
    }
    if (metricMode === "credits") {
      if (creditSavingsMetaEl) creditSavingsMetaEl.textContent = message || "Data laden";
      if (creditSavingsTotalEl) creditSavingsTotalEl.textContent = "--";
      if (creditSavingsValueEl) creditSavingsValueEl.textContent = "--";
    }
    if (ordersEl) ordersEl.textContent = "--";
    if (subsEl) subsEl.textContent = "--";
    if (activeEl) activeEl.textContent = "--";
    if (chartMetaEl) chartMetaEl.textContent = message || "Data laden";
    if (tableEl) {
      tableEl.innerHTML = `<div class="table-row"><div class="cell">${message || "Data laden..."}</div></div>`;
    }
  };

  const setErrorState = (message) => {
    if (revenueEl) revenueEl.textContent = "--";
    if (revenueLabelEl) {
      revenueLabelEl.textContent = metricMode === "credits" ? "Kredietgebruik" : "Omzet";
    }
    if (revenueActionsEl) {
      revenueActionsEl.hidden = metricMode === "credits";
    }
    if (creditSavingsPanel) {
      creditSavingsPanel.hidden = !isCreditViewActive();
    }
    if (summaryGridEl) {
      summaryGridEl.hidden = metricMode === "credits" || creditOverlayActive;
    }
    if (metricMode === "credits") {
      if (creditSavingsMetaEl) creditSavingsMetaEl.textContent = message || "Analytics laden mislukt";
      if (creditSavingsTotalEl) creditSavingsTotalEl.textContent = "--";
      if (creditSavingsValueEl) creditSavingsValueEl.textContent = "--";
    }
    if (ordersEl) ordersEl.textContent = "--";
    if (subsEl) subsEl.textContent = "--";
    if (activeEl) activeEl.textContent = "--";
    if (chartMetaEl) chartMetaEl.textContent = message || "Analytics laden mislukt";
    if (tableEl) {
      tableEl.innerHTML = `<div class="table-row"><div class="cell">${message || "Analytics laden mislukt."}</div></div>`;
    }
  };

  const buildRangesFromData = () => {
    if (!dailyPoints.length) {
      ranges = {
        week: { label: "DEZE WEEK", meta: "DEZE WEEK", points: [] },
      };
      return;
    }

    const rangeStart = rangeBounds.from;
    const rangeEnd = rangeBounds.to;
    const weekStart = startOfWeekMonday(rangeEnd);
    const weekEnd = addDays(weekStart, 6);
    const monthStart = new Date(Date.UTC(rangeEnd.getUTCFullYear(), rangeEnd.getUTCMonth(), 1));
    const quarterStartMonth = Math.floor(rangeEnd.getUTCMonth() / 3) * 3;
    const quarterStart = new Date(Date.UTC(rangeEnd.getUTCFullYear(), quarterStartMonth, 1));
    const yearStart = new Date(Date.UTC(rangeEnd.getUTCFullYear(), 0, 1));

    const weekPoints = buildDailySeries(weekStart, weekEnd, (d) => {
      const label = fmtWeekdayShort.format(d);
      return label.charAt(0).toUpperCase() + label.slice(1);
    });

    const monthPoints = buildDailySeries(monthStart, rangeEnd, (d) => String(d.getUTCDate()));

    const quarterPoints = [];
    for (let mi = quarterStartMonth; mi <= rangeEnd.getUTCMonth(); mi += 1) {
      const agg = monthAggregate(rangeEnd.getUTCFullYear(), mi, rangeEnd);
      if (agg) quarterPoints.push(agg);
    }

    const yearPoints = [];
    for (let mi = 0; mi <= rangeEnd.getUTCMonth(); mi += 1) {
      const agg = monthAggregate(rangeEnd.getUTCFullYear(), mi, rangeEnd);
      if (agg) yearPoints.push(agg);
    }

    const allPoints = [];
    for (let year = rangeStart.getUTCFullYear(); year <= rangeEnd.getUTCFullYear(); year += 1) {
      const agg = yearAggregate(year, rangeEnd);
      if (agg) allPoints.push(agg);
    }

    const allMeta = `Sinds ${fmtDateLongFull.format(rangeStart)}`;

    ranges = {
      week: { label: "DEZE WEEK", meta: "DEZE WEEK", points: weekPoints },
      month: { label: "DEZE MAAND", meta: "DEZE MAAND", points: monthPoints },
      quarter: { label: "DIT KWARTAAL", meta: "DIT KWARTAAL", points: quarterPoints },
      year: { label: "DIT JAAR", meta: "DIT JAAR", points: yearPoints },
      all: { label: "ALL TIME", meta: allMeta, points: allPoints, showTotalRow: true },
    };
  };

  const fetchAnalytics = async (token) => {
    const resp = await fetch("/api/staff/analytics", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(payload?.error || "Analytics ophalen mislukt.");
    }
    return payload;
  };

  const loadAnalytics = async () => {
    const supabase = createSupabaseClient();
    if (!supabase) {
      setErrorState("Supabase ontbreekt. Vernieuw de pagina.");
      return;
    }

    const token = await getAccessToken(supabase);
    if (!token) {
      window.location.href = "/staff-login";
      return;
    }

    const isStaff = await ensureStaff(supabase, token);
    if (!isStaff) {
      window.location.href = "/staff-login";
      return;
    }

    try {
      setLoadingState("Data laden...");
      profitSettings = loadProfitSettings();
      const payload = await fetchAnalytics(token);
      tokensPerChat = clampNumber(Number(payload?.tokens_per_chat || 1), 1);
      tokensPerEur = clampNumber(Number(payload?.tokens_per_eur || 100), 1);
      creditAllowanceEur = clampNumber(Number(payload?.credit_allowance_eur || 10), 0);
      const points = normalizePoints(payload?.points);
      dailyPoints = points;
      rebuildPointMap();
      totalChatsAllTime = Number.isFinite(payload?.total_chats) ? payload.total_chats : null;

      const fromDate = parseISODate(payload?.range?.from) || (points[0]?.date ? parseISODate(points[0].date) : todayUTC);
      const toDate = parseISODate(payload?.range?.to) || todayUTC;
      rangeBounds = { from: fromDate || todayUTC, to: toDate || todayUTC };

      buildRangesFromData();
      dataReady = true;
      let initialRange = "week";
      if (savedView?.rangeId === "custom") {
        const from = parseISODate(savedView.from);
        const to = parseISODate(savedView.to);
        if (from && to && from.getTime() <= to.getTime()) {
          const points = generateCustomPoints(from, to);
          const meta = `${fmtDateLong.format(from)} – ${fmtDateLong.format(to)}`.toUpperCase();
          ranges.custom = { label: "AANGEPAST", meta, points };
          initialRange = "custom";
        }
      } else if (savedView?.rangeId && ranges[savedView.rangeId]) {
        initialRange = savedView.rangeId;
      }
      setMetricMode("revenue");
      setActiveRange(initialRange);
    } catch (err) {
      console.error("Analytics load failed", err);
      setErrorState(err?.message || "Analytics laden mislukt.");
    }
  };

  const savedView = loadViewState();
  // defaults for date picker: last 7 days
  const fromDefault = new Date(todayUTC.getTime() - 6 * 24 * 60 * 60 * 1000);
  if (rangeFromEl && !rangeFromEl.value) {
    if (savedView?.rangeId === "custom" && savedView.from) {
      rangeFromEl.value = savedView.from;
    } else {
      rangeFromEl.value = toISODate(fromDefault);
    }
  }
  if (rangeToEl && !rangeToEl.value) {
    if (savedView?.rangeId === "custom" && savedView.to) {
      rangeToEl.value = savedView.to;
    } else {
      rangeToEl.value = toISODate(todayUTC);
    }
  }
  updateRangeButtons();

  if (rangeFromBtn) {
    rangeFromBtn.addEventListener("click", () => {
      setActiveField("from");
      const fromDate = parseISODate(rangeFromEl?.value);
      if (fromDate) calendarMonth = fromDate;
      renderCalendar();
    });
  }

  if (rangeToBtn) {
    rangeToBtn.addEventListener("click", () => {
      setActiveField("to");
      const toDate = parseISODate(rangeToEl?.value);
      if (toDate) calendarMonth = toDate;
      renderCalendar();
    });
  }

  if (rangeCalendarPrev) {
    rangeCalendarPrev.addEventListener("click", () => {
      calendarMonth = new Date(Date.UTC(calendarMonth.getUTCFullYear(), calendarMonth.getUTCMonth() - 1, 1));
      renderCalendar();
    });
  }

  if (rangeCalendarNext) {
    rangeCalendarNext.addEventListener("click", () => {
      calendarMonth = new Date(Date.UTC(calendarMonth.getUTCFullYear(), calendarMonth.getUTCMonth() + 1, 1));
      renderCalendar();
    });
  }

  if (rangeCalendarDays) {
    rangeCalendarDays.addEventListener("click", (event) => {
      const button = event.target.closest(".range-calendar__day");
      if (!button) return;
      const iso = button.dataset.date;
      const picked = parseISODate(iso);
      if (!picked) return;
      if (activeField === "from") {
        rangeFromEl.value = iso;
      } else {
        rangeToEl.value = iso;
      }
      const fromDate = parseISODate(rangeFromEl?.value);
      const toDate = parseISODate(rangeToEl?.value);
      if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
        if (activeField === "from") {
          rangeToEl.value = rangeFromEl.value;
        } else {
          rangeFromEl.value = rangeToEl.value;
        }
      }
      updateRangeButtons();
      renderCalendar();
    });
  }

  rangeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (!dataReady) return;
      if (creditOverlayActive) {
        setCreditOverlayState(false);
      }
      const rangeId = button.dataset.range || "week";
      if (metricMode === "credits") {
        setMetricMode("revenue");
      }
      if (rangeId === "custom") {
        openPicker();
        return;
      }
      closePicker();
      setActiveRange(rangeId);
    });
  });

  const setMetricMode = (mode) => {
    metricMode = mode === "credits" ? "credits" : "revenue";
    if (metricMode === "credits" && activeRangeId === "week") {
      activeRangeId = "month";
    }
    modeButtons.forEach((button) => {
      const isActive = button.dataset.mode === metricMode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
    setRangeButtonState(activeRangeId, metricMode === "revenue" && !creditOverlayActive);
    if (revenueActionsEl) {
      revenueActionsEl.hidden = metricMode === "credits";
    }
    if (creditSavingsPanel) {
      creditSavingsPanel.hidden = !isCreditViewActive();
    }
    if (summaryGridEl) {
      summaryGridEl.hidden = metricMode === "credits" || creditOverlayActive;
    }
    setCreditButtonActive(isCreditViewActive());
    saveViewState({
      rangeId: activeRangeId,
      mode: metricMode,
      from: rangeFromEl?.value || null,
      to: rangeToEl?.value || null,
    });
    if (lastRange?.config) {
      setActiveRange(activeRangeId);
    }
  };

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (!dataReady) return;
      const mode = button.dataset.mode || "revenue";
      if (mode === "credits") {
        setCreditOverlayState(!creditOverlayActive);
        return;
      }
      if (creditOverlayActive) {
        setCreditOverlayState(false);
      }
      setMetricMode(mode);
    });
  });

  if (rangeCancelEl) {
    rangeCancelEl.addEventListener("click", closePicker);
  }

  if (rangeApplyEl) {
    rangeApplyEl.addEventListener("click", () => {
      if (!dataReady) return;
      const from = parseISODate(rangeFromEl?.value);
      const to = parseISODate(rangeToEl?.value);
      if (!from || !to) return;
      if (from.getTime() > to.getTime()) return;

      const points = generateCustomPoints(from, to);
      const meta = `${fmtDateLong.format(from)} – ${fmtDateLong.format(to)}`.toUpperCase();
      ranges.custom = {
        label: "AANGEPAST",
        meta,
        points,
      };
      closePicker();
      setActiveRange("custom");
    });
  }

  if (revenueToggleEl) {
    revenueToggleEl.addEventListener("click", () => {
      showProfit = !showProfit;
      if (metricMode === "revenue" && lastRange?.config && lastRange?.totals) {
        updateRevenueCard(lastRange.config, lastRange.totals);
      }
    });
  }

  const openProfitSettings = () => {
    if (!profitSettingsModal || !profitSettingsCost || !profitSettingsVat) return;
    profitSettingsCost.value = formatSettingValue(profitSettings.creditCostPerCustomer);
    profitSettingsVat.value = formatSettingValue(profitSettings.vatPercent);
    profitSettingsModal.hidden = false;
    profitSettingsCost.focus();
  };

  const closeProfitSettings = () => {
    if (!profitSettingsModal) return;
    profitSettingsModal.hidden = true;
  };

  if (revenueSettingsBtn) {
    revenueSettingsBtn.addEventListener("click", openProfitSettings);
  }

  if (profitSettingsClose) {
    profitSettingsClose.addEventListener("click", closeProfitSettings);
  }

  if (profitSettingsCancel) {
    profitSettingsCancel.addEventListener("click", closeProfitSettings);
  }

  if (profitSettingsModal) {
    profitSettingsModal.addEventListener("click", (event) => {
      if (event.target === profitSettingsModal) closeProfitSettings();
    });
  }

  if (profitSettingsForm) {
    profitSettingsForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const cost = clampNumber(Number(profitSettingsCost?.value || 0), 0);
      const vat = clampNumber(Number(profitSettingsVat?.value || 0), 0, 100);
      profitSettings = { creditCostPerCustomer: cost, vatPercent: vat };
      saveProfitSettings(profitSettings);
      if (lastRange?.config && lastRange?.totals) {
        updateRevenueCard(lastRange.config, lastRange.totals);
      }
      closeProfitSettings();
    });
  }

  document.addEventListener("click", (e) => {
    if (!rangePickerEl || rangePickerEl.hidden) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (rangePickerEl.contains(target)) return;
    const btn = target.closest?.(".range-btn[data-range=\"custom\"]");
    if (btn) return;
    closePicker();
  });

  if (creditOverlayEl) {
    creditOverlayEl.addEventListener("click", () => {
      setCreditOverlayState(false);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadAnalytics();
  });
})();
