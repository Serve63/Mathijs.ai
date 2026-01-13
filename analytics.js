(() => {
  const rangeButtons = Array.from(document.querySelectorAll(".range-btn"));
  const rangePickerEl = document.getElementById("range-picker");
  const rangeFromEl = document.getElementById("range-from");
  const rangeToEl = document.getElementById("range-to");
  const rangeApplyEl = document.getElementById("range-apply");
  const rangeCancelEl = document.getElementById("range-cancel");
  const revenueEl = document.getElementById("stat-revenue");
  const revenueSubEl = document.getElementById("stat-revenue-sub");
  const ordersEl = document.getElementById("stat-orders");
  const ordersSubEl = document.getElementById("stat-orders-sub");
  const subsEl = document.getElementById("stat-subs");
  const subsSubEl = document.getElementById("stat-subs-sub");
  const activeEl = document.getElementById("stat-active");
  const activeSubEl = document.getElementById("stat-active-sub");
  const chartTitleEl = document.getElementById("chart-title");
  const chartMetaEl = document.getElementById("chart-meta");
  const chartTotalEl = document.getElementById("chart-total");
  const barChartEl = document.getElementById("bar-chart");
  const tableMetaEl = document.getElementById("table-meta");
  const tableEl = document.getElementById("analytics-table");

  const fmtEUR = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
  const fmtNumber = new Intl.NumberFormat("nl-NL");
  const fmtDateLong = new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "short", year: "numeric" });
  const fmtDayMonth = new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "short" });

  const weekPoints = [
    { label: "Ma", revenue: 300, orders: 12, subs: 8, active: 214 },
    { label: "Di", revenue: 250, orders: 10, subs: 7, active: 216 },
    { label: "Wo", revenue: 350, orders: 14, subs: 9, active: 219 },
    { label: "Do", revenue: 450, orders: 18, subs: 12, active: 221 },
    { label: "Vr", revenue: 500, orders: 20, subs: 14, active: 224 },
    { label: "Za", revenue: 200, orders: 8, subs: 5, active: 223 },
    { label: "Zo", revenue: 150, orders: 6, subs: 4, active: 222 }
  ];

  const monthPoints = [
    { label: "nov '23", revenue: 4800, orders: 192, subs: 18, active: 192 },
    { label: "dec '23", revenue: 4950, orders: 198, subs: 20, active: 198 },
    { label: "jan", revenue: 5150, orders: 206, subs: 22, active: 206 },
    { label: "feb", revenue: 5250, orders: 210, subs: 19, active: 210 },
    { label: "mrt", revenue: 5375, orders: 215, subs: 23, active: 215 },
    { label: "apr", revenue: 5475, orders: 219, subs: 24, active: 219 },
    { label: "mei", revenue: 5575, orders: 223, subs: 26, active: 223 },
    { label: "jun", revenue: 5650, orders: 226, subs: 25, active: 226 },
    { label: "jul", revenue: 5700, orders: 228, subs: 21, active: 228 },
    { label: "aug", revenue: 5775, orders: 231, subs: 22, active: 231 },
    { label: "sep", revenue: 5875, orders: 235, subs: 27, active: 235 },
    { label: "okt", revenue: 5950, orders: 238, subs: 29, active: 238 }
  ];

  const quarterPoints = [
    { label: "Q1 2024", revenue: 16125, orders: 645, subs: 72, active: 215 },
    { label: "Q2 2024", revenue: 16950, orders: 678, subs: 76, active: 226 },
    { label: "Q3 2024", revenue: 17400, orders: 696, subs: 80, active: 232 },
    { label: "Q4 2024", revenue: 17850, orders: 714, subs: 84, active: 238 }
  ];

  const yearPoints = [
    { label: "2021", revenue: 50400, orders: 2016, subs: 240, active: 168 },
    { label: "2022", revenue: 59400, orders: 2376, subs: 280, active: 198 },
    { label: "2023", revenue: 65400, orders: 2616, subs: 320, active: 218 },
    { label: "2024", revenue: 71400, orders: 2856, subs: 360, active: 238 }
  ];

  const ranges = {
    week: {
      label: "DEZE WEEK",
      meta: "DEZE WEEK",
      points: weekPoints
    },
    month: {
      label: "DEZE MAAND",
      meta: "DEZE MAAND",
      points: monthPoints
    },
    quarter: {
      label: "DIT KWARTAAL",
      meta: "DIT KWARTAAL",
      points: quarterPoints
    },
    year: {
      label: "DIT JAAR",
      meta: "DIT JAAR",
      points: yearPoints
    },
    all: {
      label: "ALL TIME",
      meta: "Sinds 2021",
      points: yearPoints,
      showTotalRow: true
    }
  };

  const toISODate = (date) => {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };

  const parseISODate = (value) => {
    if (!value) return null;
    const [y, m, d] = value.split("-").map((v) => Number(v));
    if (!y || !m || !d) return null;
    return new Date(Date.UTC(y, m - 1, d));
  };

  const daysBetweenInclusive = (a, b) => {
    const ms = 24 * 60 * 60 * 1000;
    const start = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
    const end = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
    return Math.floor((end - start) / ms) + 1;
  };

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  const seedFromDate = (iso) => {
    let h = 2166136261;
    for (let i = 0; i < iso.length; i += 1) {
      h ^= iso.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };

  const rand01 = (seed) => {
    // xorshift32
    let x = seed >>> 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };

  const makeDailyPoint = (date) => {
    const iso = toISODate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())));
    const seed = seedFromDate(iso);
    const r = rand01(seed);
    const r2 = rand01(seed ^ 0x9e3779b9);
    const revenue = Math.round(220 + r * 980); // 220..1200
    const orders = Math.round(6 + r2 * 26); // 6..32
    const subs = Math.round(3 + r * 18); // 3..21
    const active = Math.round(160 + r2 * 120); // 160..280
    return {
      label: fmtDayMonth.format(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))),
      revenue,
      orders,
      subs,
      active
    };
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

  const generateCustomPoints = (fromDate, toDate) => {
    const totalDays = daysBetweenInclusive(fromDate, toDate);
    const points = [];
    const ms = 24 * 60 * 60 * 1000;

    // daily (<= 21d), weekly buckets (<= 120d), else monthly buckets
    if (totalDays <= 21) {
      for (let i = 0; i < totalDays; i += 1) {
        const d = new Date(fromDate.getTime() + i * ms);
        points.push(makeDailyPoint(d));
      }
      return points;
    }

    if (totalDays <= 120) {
      let start = new Date(fromDate);
      while (start <= toDate) {
        const end = new Date(Math.min(toDate.getTime(), start.getTime() + 6 * ms));
        const bucket = [];
        const bucketDays = daysBetweenInclusive(start, end);
        for (let i = 0; i < bucketDays; i += 1) {
          bucket.push(makeDailyPoint(new Date(start.getTime() + i * ms)));
        }
        const label = `${fmtDayMonth.format(start)}–${fmtDayMonth.format(end)}`;
        points.push(sumPoints(bucket, label));
        start = new Date(end.getTime() + ms);
      }
      return points;
    }

    // monthly buckets
    let cursor = new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), 1));
    const endMonth = new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), 1));
    while (cursor <= endMonth) {
      const monthStart = new Date(cursor);
      const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
      const realStart = new Date(Math.max(monthStart.getTime(), fromDate.getTime()));
      const realEnd = new Date(Math.min(monthEnd.getTime(), toDate.getTime()));
      const bucketDays = daysBetweenInclusive(realStart, realEnd);
      const bucket = [];
      for (let i = 0; i < bucketDays; i += 1) {
        bucket.push(makeDailyPoint(new Date(realStart.getTime() + i * ms)));
      }
      const label = new Intl.DateTimeFormat("nl-NL", { month: "short", year: "numeric" }).format(monthStart);
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
    const maxRevenue = points.reduce((max, point) => Math.max(max, point.revenue), 0);

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

  const renderTable = (points, includeTotalRow) => {
    if (!tableEl) return;
    const rows = [];

    if (includeTotalRow) {
      const totals = computeTotals(points);
      rows.push(`
        <div class="table-row">
          <div class="cell" data-label="Periode"><strong>All time</strong></div>
          <div class="cell" data-label="Omzet"><strong>${fmtEUR.format(totals.revenue)}</strong></div>
          <div class="cell" data-label="Orders"><strong>${fmtNumber.format(totals.orders)}</strong></div>
          <div class="cell" data-label="Nieuwe abonnees"><strong>${fmtNumber.format(totals.subs)}</strong></div>
          <div class="cell" data-label="Actieve klanten"><strong>${fmtNumber.format(totals.active)}</strong></div>
        </div>
      `);
    }

    points.forEach((point) => {
      rows.push(`
        <div class="table-row">
          <div class="cell" data-label="Periode">${point.label}</div>
          <div class="cell" data-label="Omzet">${fmtEUR.format(point.revenue)}</div>
          <div class="cell" data-label="Orders">${fmtNumber.format(point.orders)}</div>
          <div class="cell" data-label="Nieuwe abonnees">${fmtNumber.format(point.subs)}</div>
          <div class="cell" data-label="Actieve klanten">${fmtNumber.format(point.active)}</div>
        </div>
      `);
    });

    tableEl.innerHTML = rows.join("");
  };

  const setActiveRange = (rangeId) => {
    const config = ranges[rangeId] || ranges.week;
    const totals = computeTotals(config.points);

    rangeButtons.forEach((button) => {
      const isActive = button.dataset.range === rangeId;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    if (revenueEl) revenueEl.textContent = fmtEUR.format(totals.revenue);
    if (revenueSubEl) revenueSubEl.textContent = config.meta;
    if (ordersEl) ordersEl.textContent = fmtNumber.format(totals.orders);
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
    renderTable(config.points, Boolean(config.showTotalRow));
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

  // defaults for date picker: last 7 days
  const today = new Date();
  const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const fromDefault = new Date(todayUTC.getTime() - 6 * 24 * 60 * 60 * 1000);
  if (rangeFromEl && !rangeFromEl.value) rangeFromEl.value = toISODate(fromDefault);
  if (rangeToEl && !rangeToEl.value) rangeToEl.value = toISODate(todayUTC);

  rangeButtons.forEach((button) => {
    button.addEventListener("click", () => {
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
      const from = parseISODate(rangeFromEl?.value);
      const to = parseISODate(rangeToEl?.value);
      if (!from || !to) return;
      if (from.getTime() > to.getTime()) return;

      const totalDays = daysBetweenInclusive(from, to);
      // keep the UI usable
      if (totalDays > 730) return; // max 2 years in demo

      const points = generateCustomPoints(from, to);
      const meta = `${fmtDateLong.format(from)} – ${fmtDateLong.format(to)}`.toUpperCase();
      ranges.custom = {
        label: "AANGEPAST",
        meta,
        points
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

  setActiveRange("week");
})();
