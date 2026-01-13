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
    { label: "Ma", revenue: 3180, orders: 48, subs: 6, active: 214 },
    { label: "Di", revenue: 2860, orders: 41, subs: 5, active: 216 },
    { label: "Wo", revenue: 3425, orders: 54, subs: 8, active: 219 },
    { label: "Do", revenue: 4010, orders: 62, subs: 7, active: 221 },
    { label: "Vr", revenue: 4520, orders: 71, subs: 10, active: 224 },
    { label: "Za", revenue: 2980, orders: 39, subs: 4, active: 223 },
    { label: "Zo", revenue: 2640, orders: 35, subs: 3, active: 222 }
  ];

  const monthPoints = [
    { label: "nov '23", revenue: 61200, orders: 940, subs: 82, active: 192 },
    { label: "dec '23", revenue: 68450, orders: 1020, subs: 95, active: 198 },
    { label: "jan", revenue: 70210, orders: 1080, subs: 102, active: 206 },
    { label: "feb", revenue: 65820, orders: 980, subs: 88, active: 210 },
    { label: "mrt", revenue: 74100, orders: 1140, subs: 110, active: 215 },
    { label: "apr", revenue: 76850, orders: 1185, subs: 116, active: 219 },
    { label: "mei", revenue: 81240, orders: 1240, subs: 128, active: 223 },
    { label: "jun", revenue: 79310, orders: 1205, subs: 121, active: 226 },
    { label: "jul", revenue: 72400, orders: 1112, subs: 105, active: 228 },
    { label: "aug", revenue: 76890, orders: 1178, subs: 112, active: 231 },
    { label: "sep", revenue: 83540, orders: 1260, subs: 134, active: 235 },
    { label: "okt", revenue: 88230, orders: 1320, subs: 142, active: 238 }
  ];

  const quarterPoints = [
    { label: "Q1 2024", revenue: 210130, orders: 3200, subs: 300, active: 215 },
    { label: "Q2 2024", revenue: 237400, orders: 3625, subs: 365, active: 226 },
    { label: "Q3 2024", revenue: 232350, orders: 3500, subs: 338, active: 232 },
    { label: "Q4 2024", revenue: 258900, orders: 3850, subs: 402, active: 238 }
  ];

  const yearPoints = [
    { label: "2021", revenue: 520400, orders: 7820, subs: 860, active: 168 },
    { label: "2022", revenue: 692500, orders: 9860, subs: 1120, active: 198 },
    { label: "2023", revenue: 818900, orders: 11240, subs: 1290, active: 218 },
    { label: "2024", revenue: 938700, orders: 13540, subs: 1480, active: 238 }
  ];

  const ranges = {
    week: {
      label: "Week",
      meta: "Laatste 7 dagen",
      points: weekPoints
    },
    month: {
      label: "Maand",
      meta: "Laatste 12 maanden",
      points: monthPoints
    },
    quarter: {
      label: "Kwartaal",
      meta: "Laatste 4 kwartalen",
      points: quarterPoints
    },
    year: {
      label: "Jaar",
      meta: "Laatste 4 jaar",
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
