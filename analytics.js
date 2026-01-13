(() => {
  const rangeButtons = Array.from(document.querySelectorAll(".range-btn"));
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
      label: "Deze week",
      meta: "Deze week",
      points: weekPoints
    },
    month: {
      label: "Deze maand",
      meta: "Deze maand",
      points: monthPoints
    },
    quarter: {
      label: "Dit kwartaal",
      meta: "Dit kwartaal",
      points: quarterPoints
    },
    year: {
      label: "Dit jaar",
      meta: "Dit jaar",
      points: yearPoints
    },
    all: {
      label: "All time",
      meta: "Sinds 2021",
      points: yearPoints,
      showTotalRow: true
    }
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

  rangeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const rangeId = button.dataset.range || "week";
      setActiveRange(rangeId);
    });
  });

  setActiveRange("week");
})();
