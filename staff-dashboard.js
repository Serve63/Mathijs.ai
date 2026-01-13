(() => {
  const elVisitors = document.getElementById("kpi-visitors");
  const elVisits = document.getElementById("kpi-visits");
  const elOrders = document.getElementById("kpi-orders");
  const elSales = document.getElementById("kpi-sales");
  const elSalesLabel = document.getElementById("kpi-sales-label");
  const elSalesSub = document.getElementById("kpi-sales-sub");
  const salesToggle = document.getElementById("kpi-sales-toggle");
  const sparkMap = Array.from(document.querySelectorAll("[data-spark]")).reduce((acc, line) => {
    if (line.dataset.spark) {
      acc[line.dataset.spark] = line;
    }
    return acc;
  }, {});
  const nlMapCanvas = document.getElementById("nl-map-canvas");
  const beMapCanvas = document.getElementById("be-map-canvas");
  const recentCustomersEl = document.getElementById("recent-customers");

  const customers = Array.isArray(window.customersData)
    ? window.customersData.map((customer) => ({ ...customer }))
    : [];
  const provinceLabels = window.provinceLabels || {};
  const customerCounts = customers.reduce((acc, customer) => {
    if (!customer.provinceId) return acc;
    acc[customer.provinceId] = (acc[customer.provinceId] || 0) + 1;
    return acc;
  }, {});

  const fmtEUR = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
  const dateFmt = new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "short" });
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const rand = (a, b) => a + Math.random() * (b - a);

  const getInitials = (name) => {
    if (!name) return "";
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  };

  const formatProvince = (provinceId) => provinceLabels[provinceId] || provinceId || "Onbekend";


  const renderRecentCustomers = () => {
    if (!recentCustomersEl) return;
    const recent = customers
      .slice()
      .sort((a, b) => new Date(b.lastActive) - new Date(a.lastActive))
      .slice(0, 5);

    if (!recent.length) {
      recentCustomersEl.innerHTML = "<div class=\"customer-row\">Nog geen klanten gevonden.</div>";
      return;
    }

    recentCustomersEl.innerHTML = recent
      .map((customer) => {
        const provinceLabel = formatProvince(customer.provinceId);
        return `
          <div class="customer-row">
            <div class="customer-avatar">${getInitials(customer.name)}</div>
            <div>
              <p class="customer-name">${customer.name}</p>
              <p class="customer-sub">${provinceLabel} | Standaard abonnement</p>
            </div>
            <div class="customer-amount">${fmtEUR.format(25)}</div>
          </div>
        `;
      })
      .join("");
  };

  const ensureProvinceOverlay = (provinceEl) => {
    if (!provinceEl) return;
    const path = provinceEl.querySelector("path");
    if (!path) return;
    path.classList.add("province-base");
    if (provinceEl.querySelector(".province-overlay")) return;
    const overlay = path.cloneNode();
    overlay.classList.add("province-overlay");
    overlay.setAttribute("aria-hidden", "true");
    provinceEl.appendChild(overlay);
  };

  const applyProvinceHeat = (provinceEl, count, maxCount) => {
    if (!provinceEl) return;
    const ratio = maxCount ? count / maxCount : 0;
    let color = "rgba(233, 90, 74, 0.65)";
    if (ratio >= 0.66) {
      color = "rgba(56, 191, 127, 0.65)";
    } else if (ratio >= 0.33) {
      color = "rgba(242, 173, 63, 0.6)";
    }
    provinceEl.style.setProperty("--province-color", color);
  };

  const setupProvinceInteractions = (canvas) => {
    if (!canvas) return;
    const provinces = Array.from(canvas.querySelectorAll(".province"));
    if (!provinces.length) return;
    const maxCount = Math.max(
      1,
      ...provinces.map((province) => customerCounts[province.dataset.province || ""] || 0)
    );

    provinces.forEach((province) => {
      const provinceId = province.dataset.province || "";
      const count = customerCounts[provinceId] || 0;
      ensureProvinceOverlay(province);
      applyProvinceHeat(province, count, maxCount);
    });
  };

  const loadMapSvg = async (canvas, url) => {
    if (!canvas) return;
    try {
      const response = await fetch(url, { cache: "no-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const svgMarkup = await response.text();
      canvas.innerHTML = svgMarkup;
      setupProvinceInteractions(canvas);
    } catch (err) {
      canvas.innerHTML = "<div class=\"map-error\">Kaart niet beschikbaar.</div>";
      console.error("Kaart laden mislukt", err);
    }
  };


  let visitorsNow = 27;
  let visitsToday = 891;
  let ordersToday = 77;
  let salesToday = 22282.65;
  let showProfit = false;
  const PROFIT_MARGIN = 0.35;
  const SPARK_COLORS = {
    up: "rgba(56, 191, 127, 0.95)",
    down: "rgba(233, 90, 74, 0.95)"
  };
  let lastVisitsDelta = null;
  let lastOrdersDelta = null;
  let lastSalesDelta = null;

  const setSparkTrend = (key, isUp) => {
    const spark = sparkMap[key];
    if (!spark) return;
    const points = isUp ? spark.dataset.up : spark.dataset.down;
    if (points) {
      spark.setAttribute("points", points);
    }
    spark.setAttribute("stroke", isUp ? SPARK_COLORS.up : SPARK_COLORS.down);
  };

  const initSparks = () => {
    Object.keys(sparkMap).forEach((key) => setSparkTrend(key, true));
  };

  const updateSalesDisplay = () => {
    if (!elSales) return;
    if (showProfit) {
      const profit = salesToday * PROFIT_MARGIN;
      elSales.textContent = fmtEUR.format(profit);
      if (elSalesLabel) elSalesLabel.textContent = "Winst vandaag";
      if (elSalesSub) elSalesSub.textContent = "Winst";
      if (salesToggle) {
        salesToggle.textContent = "Toon omzet";
        salesToggle.setAttribute("aria-pressed", "true");
      }
    } else {
      elSales.textContent = fmtEUR.format(salesToday);
      if (elSalesLabel) elSalesLabel.textContent = "Omzet vandaag";
      if (elSalesSub) elSalesSub.textContent = "Omzet";
      if (salesToggle) {
        salesToggle.textContent = "Toon winst";
        salesToggle.setAttribute("aria-pressed", "false");
      }
    }
  };

  const tick = () => {
    const prevVisits = visitsToday;
    const prevOrders = ordersToday;
    const prevSales = salesToday;
    visitorsNow = clamp(Math.round(visitorsNow + rand(-4, 6)), 8, 120);
    if (elVisitors) elVisitors.textContent = String(visitorsNow);

    const saleChance = Math.random();
    if (saleChance > 0.55) {
      ordersToday += 1;
      salesToday += rand(29, 240);
    }

    visitsToday += clamp(Math.round(rand(1, 5)), 1, 8);

    if (elVisits) elVisits.textContent = String(visitsToday);
    if (elOrders) elOrders.textContent = String(ordersToday);
    updateSalesDisplay();

    const visitDelta = visitsToday - prevVisits;
    const orderDelta = ordersToday - prevOrders;
    const salesDelta = salesToday - prevSales;

    if (lastVisitsDelta !== null) {
      setSparkTrend("visits", visitDelta >= lastVisitsDelta);
    }
    if (lastOrdersDelta !== null) {
      setSparkTrend("customers", orderDelta >= lastOrdersDelta);
    }
    if (lastSalesDelta !== null) {
      setSparkTrend("sales", salesDelta >= lastSalesDelta);
    }

    lastVisitsDelta = visitDelta;
    lastOrdersDelta = orderDelta;
    lastSalesDelta = salesDelta;
  };

  if (salesToggle) {
    salesToggle.addEventListener("click", () => {
      showProfit = !showProfit;
      updateSalesDisplay();
    });
  }

  loadMapSvg(nlMapCanvas, "assets/nl-map.svg");
  loadMapSvg(beMapCanvas, "assets/be-map.svg");
  renderRecentCustomers();
  initSparks();
  tick();
  setInterval(tick, 1800);
})();
