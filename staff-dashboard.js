(() => {
  const elVisitors = document.getElementById("kpi-visitors");
  const elVisits = document.getElementById("kpi-visits");
  const elOrders = document.getElementById("kpi-orders");
  const elSales = document.getElementById("kpi-sales");
  const elSalesLabel = document.getElementById("kpi-sales-label");
  const elSalesSub = document.getElementById("kpi-sales-sub");
  const salesToggle = document.getElementById("kpi-sales-toggle");
  const mapCanvas = document.getElementById("nl-map-canvas");
  const provinceInfo = document.getElementById("province-info");
  const recentCustomersEl = document.getElementById("recent-customers");

  const customers = Array.isArray(window.customersData)
    ? window.customersData.map((customer) => ({ ...customer }))
    : [];
  const provinceLabels = window.provinceLabels || {};

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

  const updateProvinceInfo = (provinceId, count) => {
    if (!provinceInfo) return;
    const label = formatProvince(provinceId);
    const plural = count === 1 ? "klant" : "klanten";
    provinceInfo.textContent = `${label}: ${count} ${plural}`;
  };

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
        const lastActive = customer.lastActive ? dateFmt.format(new Date(customer.lastActive)) : "-";
        return `
          <div class="customer-row">
            <div class="customer-avatar">${getInitials(customer.name)}</div>
            <div>
              <p class="customer-name">${customer.name}</p>
              <p class="customer-sub">${provinceLabel} | ${customer.plan} | laatst actief ${lastActive}</p>
            </div>
            <div class="customer-amount">${fmtEUR.format(customer.totalPaid || 0)}</div>
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

  const selectProvince = (provinceEl, provinceId, count) => {
    if (mapCanvas) {
      mapCanvas.querySelectorAll(".province.is-selected").forEach((el) => el.classList.remove("is-selected"));
    }
    if (provinceEl) {
      provinceEl.classList.add("is-selected");
    }
    updateProvinceInfo(provinceId, count);
  };

  const setupProvinceInteractions = () => {
    if (!mapCanvas) return;
    const provinces = Array.from(mapCanvas.querySelectorAll(".province"));
    if (!provinces.length) return;

    const counts = customers.reduce((acc, customer) => {
      if (!customer.provinceId) return acc;
      acc[customer.provinceId] = (acc[customer.provinceId] || 0) + 1;
      return acc;
    }, {});

    const maxCount = Math.max(1, ...Object.values(counts));

    provinces.forEach((province) => {
      const provinceId = province.dataset.province || "";
      const count = counts[provinceId] || 0;
      const label = formatProvince(provinceId);
      const plural = count === 1 ? "klant" : "klanten";

      ensureProvinceOverlay(province);
      applyProvinceHeat(province, count, maxCount);

      province.setAttribute("tabindex", "0");
      province.setAttribute("role", "button");
      province.setAttribute("aria-label", `${label}: ${count} ${plural}`);

      province.addEventListener("click", () => {
        selectProvince(province, provinceId, count);
      });

      province.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectProvince(province, provinceId, count);
        }
      });
    });
  };

  const loadMapSvg = async () => {
    if (!mapCanvas) return;
    try {
      const response = await fetch("assets/nl-map.svg", { cache: "force-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const svgMarkup = await response.text();
      mapCanvas.innerHTML = svgMarkup;
      setupProvinceInteractions();
    } catch (err) {
      mapCanvas.innerHTML = "<div class=\"map-error\">Kaart niet beschikbaar.</div>";
      console.error("Kaart laden mislukt", err);
    }
  };


  let visitorsNow = 27;
  let visitsToday = 891;
  let ordersToday = 77;
  let salesToday = 22282.65;
  let showProfit = false;
  const PROFIT_MARGIN = 0.35;

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
  };

  if (salesToggle) {
    salesToggle.addEventListener("click", () => {
      showProfit = !showProfit;
      updateSalesDisplay();
    });
  }

  loadMapSvg();
  renderRecentCustomers();
  tick();
  setInterval(tick, 1800);
})();
