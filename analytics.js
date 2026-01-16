(() => {
  const SUPABASE_URL = "https://mengrlsqgshxqcxhirjn.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_PeVTrMXz6UaeMhkPn5Fs-Q_xfJFVRNt";

  const rangeButtons = Array.from(document.querySelectorAll(".range-btn"));
  const rangePickerEl = document.getElementById("range-picker");
  const rangeFromEl = document.getElementById("range-from");
  const rangeToEl = document.getElementById("range-to");
  const rangeApplyEl = document.getElementById("range-apply");
  const rangeCancelEl = document.getElementById("range-cancel");
  const revenueEl = document.getElementById("stat-revenue");
  const revenueSubEl = document.getElementById("stat-revenue-sub");
  const ordersEl = document.getElementById("stat-orders");
  const ordersLabelEl = document.getElementById("stat-orders-label");
  const ordersSubEl = document.getElementById("stat-orders-sub");
  const subsEl = document.getElementById("stat-subs");
  const subsLabelEl = document.getElementById("stat-subs-label");
  const subsSubEl = document.getElementById("stat-subs-sub");
  const activeEl = document.getElementById("stat-active");
  const activeLabelEl = document.getElementById("stat-active-label");
  const activeSubEl = document.getElementById("stat-active-sub");
  const chartTitleEl = document.getElementById("chart-title");
  const chartMetaEl = document.getElementById("chart-meta");
  const chartTotalEl = document.getElementById("chart-total");
  const barChartEl = document.getElementById("bar-chart");
  const tableMetaEl = document.getElementById("table-meta");
  const tableEl = document.getElementById("analytics-table");
  const tableSubsLabelEl = document.getElementById("table-subs-label");

  const fmtEUR = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
  const fmtNumber = new Intl.NumberFormat("nl-NL");
  const fmtDateLong = new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "short", year: "numeric" });
  const fmtDayMonth = new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "short" });
  const fmtMonthShort = new Intl.DateTimeFormat("nl-NL", { month: "short" });
  const fmtMonthShortYear = new Intl.DateTimeFormat("nl-NL", { month: "short", year: "numeric" });
  const fmtWeekdayShort = new Intl.DateTimeFormat("nl-NL", { weekday: "short" });

  const today = new Date();
  const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));

  let dailyPoints = [];
  let pointMap = new Map();
  let ranges = {};
  let rangeBounds = { from: todayUTC, to: todayUTC };
  let dataReady = false;
  let totalChatsAllTime = null;

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

  const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

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
      });
      cursor = addDays(cursor, 1);
    }
    return points;
  };

  const sumPoints = (points, label) => {
    const totals = points.reduce(
      (acc, p) => {
        acc.revenue += p.revenue;
        acc.orders += p.orders;
        acc.subs += p.subs;
        acc.active = p.active;
        return acc;
      },
      { revenue: 0, orders: 0, subs: 0, active: 0 }
    );
    return { label, ...totals };
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

  const renderChart = (points) => {
    if (!barChartEl) return;
    const maxRevenue = points.length ? points.reduce((max, point) => Math.max(max, point.revenue), 0) : 0;

    barChartEl.innerHTML = points
      .map((point) => {
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
    const subsLabel = labels.subs || "Nieuwe abonnees";
    const activeLabel = labels.active || "Actieve abonnees";
    const rows = [];

    if (includeTotalRow) {
      const totals = computeTotals(points);
      rows.push(`
        <div class="table-row">
          <div class="cell" data-label="Periode"><strong>All time</strong></div>
          <div class="cell" data-label="Omzet"><strong>${fmtEUR.format(totals.revenue)}</strong></div>
          <div class="cell" data-label="Orders"><strong>${fmtNumber.format(totals.orders)}</strong></div>
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
          <div class="cell" data-label="Orders">${fmtNumber.format(point.orders)}</div>
          <div class="cell" data-label="${subsLabel}">${fmtNumber.format(point.subs)}</div>
          <div class="cell" data-label="${activeLabel}">${fmtNumber.format(point.active)}</div>
        </div>
      `);
    });

    tableEl.innerHTML = rows.join("");
  };

  const setActiveRange = (rangeId) => {
    const config = ranges[rangeId] || ranges.week;
    if (!config) return;
    const totals = computeTotals(config.points);
    const isAllTime = rangeId === "all";
    const ordersValue =
      isAllTime && Number.isFinite(totalChatsAllTime) ? totalChatsAllTime : totals.orders;

    rangeButtons.forEach((button) => {
      const isActive = button.dataset.range === rangeId;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    if (ordersLabelEl) {
      ordersLabelEl.textContent = isAllTime ? "Totaal verstuurde chats" : "Orders";
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

    if (revenueEl) revenueEl.textContent = fmtEUR.format(totals.revenue);
    if (revenueSubEl) revenueSubEl.textContent = config.meta;
    if (ordersEl) ordersEl.textContent = fmtNumber.format(ordersValue);
    if (ordersSubEl) ordersSubEl.textContent = config.meta;
    if (subsEl) subsEl.textContent = fmtNumber.format(totals.subs);
    if (subsSubEl) subsSubEl.textContent = config.meta;
    if (activeEl) activeEl.textContent = fmtNumber.format(totals.active);
    if (activeSubEl) activeSubEl.textContent = "Laatste meetpunt";

    if (chartTitleEl) chartTitleEl.textContent = `Omzet trend (${config.label})`;
    if (chartMetaEl) chartMetaEl.textContent = config.meta;
    if (chartTotalEl) chartTotalEl.textContent = `${fmtEUR.format(totals.revenue)} totaal`;
    if (tableMetaEl) tableMetaEl.textContent = config.meta;

    renderChart(config.points);
    renderTable(config.points, Boolean(config.showTotalRow), {
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
    if (rangeFromEl) rangeFromEl.focus();
  };

  const setLoadingState = (message) => {
    if (revenueEl) revenueEl.textContent = "--";
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
    const weekStart = addDays(rangeEnd, -6);
    const monthStart = new Date(Date.UTC(rangeEnd.getUTCFullYear(), rangeEnd.getUTCMonth(), 1));
    const quarterStartMonth = Math.floor(rangeEnd.getUTCMonth() / 3) * 3;
    const quarterStart = new Date(Date.UTC(rangeEnd.getUTCFullYear(), quarterStartMonth, 1));
    const yearStart = new Date(Date.UTC(rangeEnd.getUTCFullYear(), 0, 1));

    const weekPoints = buildDailySeries(weekStart, rangeEnd, (d) => {
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

    const allMeta = `Sinds ${rangeStart.getUTCFullYear()}`;

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
      window.location.href = "staff-login.html";
      return;
    }

    const isStaff = await ensureStaff(supabase, token);
    if (!isStaff) {
      window.location.href = "staff-login.html";
      return;
    }

    try {
      setLoadingState("Data laden...");
      const payload = await fetchAnalytics(token);
      const points = normalizePoints(payload?.points);
      dailyPoints = points;
      rebuildPointMap();
      totalChatsAllTime = Number.isFinite(payload?.total_chats) ? payload.total_chats : null;

      const fromDate = parseISODate(payload?.range?.from) || (points[0]?.date ? parseISODate(points[0].date) : todayUTC);
      const toDate = parseISODate(payload?.range?.to) || todayUTC;
      rangeBounds = { from: fromDate || todayUTC, to: toDate || todayUTC };

      buildRangesFromData();
      dataReady = true;
      setActiveRange("week");
    } catch (err) {
      console.error("Analytics load failed", err);
      setErrorState(err?.message || "Analytics laden mislukt.");
    }
  };

  // defaults for date picker: last 7 days
  const fromDefault = new Date(todayUTC.getTime() - 6 * 24 * 60 * 60 * 1000);
  if (rangeFromEl && !rangeFromEl.value) rangeFromEl.value = toISODate(fromDefault);
  if (rangeToEl && !rangeToEl.value) rangeToEl.value = toISODate(todayUTC);

  rangeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (!dataReady) return;
      const rangeId = button.dataset.range || "week";
      if (rangeId === "custom") {
        openPicker();
        return;
      }
      closePicker();
      setActiveRange(rangeId);
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

  document.addEventListener("click", (e) => {
    if (!rangePickerEl || rangePickerEl.hidden) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (rangePickerEl.contains(target)) return;
    const btn = target.closest?.(".range-btn[data-range=\"custom\"]");
    if (btn) return;
    closePicker();
  });

  document.addEventListener("DOMContentLoaded", () => {
    loadAnalytics();
  });
})();
