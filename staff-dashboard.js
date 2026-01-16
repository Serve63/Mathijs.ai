(() => {
  const SUPABASE_URL = "https://mengrlsqgshxqcxhirjn.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_PeVTrMXz6UaeMhkPn5Fs-Q_xfJFVRNt";
  const PRICE_EUR = 25;

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

  const provinceLabels = window.provinceLabels || {};
  let customers = [];
  let customerCounts = {};
  let showProfit = false;
  let lastMetrics = null;
  let mapsLoaded = false;

  const fmtEUR = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
  const dateFmt = new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "short" });
  const PROFIT_MARGIN = 0.35;
  const SPARK_COLORS = {
    up: "rgba(56, 191, 127, 0.95)",
    down: "rgba(233, 90, 74, 0.95)"
  };

  const createSupabaseClient = () => {
    if (!window.supabase?.createClient) return null;
    if (window.mathijsSupabase) return window.mathijsSupabase;
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    window.mathijsSupabase = client;
    return client;
  };

  const parseDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  };

  const startOfDayUtc = (now) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const formatProvince = (provinceId) => provinceLabels[provinceId] || provinceId || "Onbekend";

  const getDisplayName = (customer) => {
    if (customer?.name) return customer.name;
    if (customer?.email) return customer.email.split("@")[0];
    return "Onbekend";
  };

  const formatPlan = (customer) => {
    if (customer?.lifetime_free) return "Lifetime";
    const plan = (customer?.plan || "free").toLowerCase();
    if (plan === "free") return "Gratis";
    if (plan === "standard") return "Standaard";
    return plan.charAt(0).toUpperCase() + plan.slice(1);
  };

  const isActiveSubscriber = (customer) => {
    if (!customer) return false;
    const paidPlan = customer.lifetime_free || (customer.plan && customer.plan !== "free");
    return paidPlan && !customer.cancelled_at;
  };

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

  const updateSalesDisplay = (salesToday) => {
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

  const renderRecentCustomers = () => {
    if (!recentCustomersEl) return;
    if (!customers.length) {
      recentCustomersEl.innerHTML = "<div class=\"customer-row\">Nog geen klanten gevonden.</div>";
      return;
    }

    const recent = customers
      .slice()
      .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
      .slice(0, 5);

    recentCustomersEl.innerHTML = recent
      .map((customer) => {
        const name = getDisplayName(customer);
        const provinceLabel = formatProvince(customer.province_id);
        const planLabel = formatPlan(customer);
        const amount = customer.last_payment_amount_eur || customer.total_paid_eur || 0;
        const amountLabel = amount ? fmtEUR.format(amount) : "-";
        return `
          <div class="customer-row">
            <div class="customer-avatar">${name
              .split(" ")
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part[0])
              .join("")
              .toUpperCase()}</div>
            <div>
              <p class="customer-name">${name}</p>
              <p class="customer-sub">${provinceLabel} | ${planLabel}</p>
            </div>
            <div class="customer-amount">${amountLabel}</div>
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

  const updateMaps = () => {
    const counts = customers.reduce((acc, customer) => {
      if (!customer.province_id) return acc;
      acc[customer.province_id] = (acc[customer.province_id] || 0) + 1;
      return acc;
    }, {});
    customerCounts = counts;
    const hasProvinceData = Object.keys(counts).length > 0;

    if (!hasProvinceData) {
      if (nlMapCanvas) nlMapCanvas.innerHTML = "<div class=\"map-error\">Geen locatiegegevens beschikbaar.</div>";
      if (beMapCanvas) beMapCanvas.innerHTML = "<div class=\"map-error\">Geen locatiegegevens beschikbaar.</div>";
      return;
    }

    if (!mapsLoaded) {
      loadMapSvg(nlMapCanvas, "assets/nl-map.svg");
      loadMapSvg(beMapCanvas, "assets/be-map.svg");
      mapsLoaded = true;
      return;
    }

    setupProvinceInteractions(nlMapCanvas);
    setupProvinceInteractions(beMapCanvas);
  };

  const computeMetrics = (usage) => {
    const now = new Date();
    const startToday = startOfDayUtc(now);
    const activeCount = customers.filter(isActiveSubscriber).length;
    const newCustomersToday = customers.filter((customer) => {
      const created = parseDate(customer.created_at);
      return created && created >= startToday;
    }).length;

    const salesToday = customers.reduce((sum, customer) => {
      const paidAt = parseDate(customer.last_payment_at || customer.subscribed_at);
      if (!paidAt || paidAt < startToday) return sum;
      const amount = Number(customer.last_payment_amount_eur || 0);
      if (Number.isFinite(amount) && amount > 0) return sum + amount;
      return sum + PRICE_EUR;
    }, 0);

    const visitsToday = Number(usage?.usage?.today?.chats || 0);

    return { activeCount, newCustomersToday, salesToday, visitsToday };
  };

  const updateKpis = (metrics) => {
    if (elVisitors) elVisitors.textContent = String(metrics.activeCount || 0);
    if (elVisits) elVisits.textContent = String(metrics.visitsToday || 0);
    if (elOrders) elOrders.textContent = String(metrics.newCustomersToday || 0);
    updateSalesDisplay(metrics.salesToday || 0);

    if (lastMetrics) {
      setSparkTrend("visits", metrics.visitsToday >= lastMetrics.visitsToday);
      setSparkTrend("customers", metrics.newCustomersToday >= lastMetrics.newCustomersToday);
      setSparkTrend("sales", metrics.salesToday >= lastMetrics.salesToday);
    }
    lastMetrics = metrics;
  };

  const setLoadingState = (message) => {
    if (recentCustomersEl) {
      recentCustomersEl.innerHTML = `<div class="customer-row">${message}</div>`;
    }
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

  const fetchCustomers = async (token) => {
    const resp = await fetch("/api/staff/customers", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(payload?.error || "Klanten ophalen mislukt.");
    }
    return Array.isArray(payload?.customers) ? payload.customers : [];
  };

  const fetchUsage = async (token) => {
    const resp = await fetch("/api/staff/customers?action=api-usage", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(payload?.error || "Usage ophalen mislukt.");
    }
    return payload;
  };

  const loadData = async () => {
    const supabase = createSupabaseClient();
    if (!supabase) {
      setLoadingState("Supabase ontbreekt. Vernieuw de pagina.");
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
      const customersData = await fetchCustomers(token);
      let usageData = null;
      try {
        usageData = await fetchUsage(token);
      } catch (err) {
        console.warn("Usage ophalen mislukt", err);
        usageData = null;
      }
      customers = customersData;
      const metrics = computeMetrics(usageData);
      renderRecentCustomers();
      updateMaps();
      updateKpis(metrics);
    } catch (err) {
      console.error("Staff dashboard load failed", err);
      setLoadingState("Dashboard laden mislukt. Probeer opnieuw.");
    }
  };

  if (salesToggle) {
    salesToggle.addEventListener("click", () => {
      showProfit = !showProfit;
      const metrics = lastMetrics || computeMetrics(null);
      updateSalesDisplay(metrics.salesToday || 0);
    });
  }

  initSparks();
  document.addEventListener("DOMContentLoaded", () => {
    loadData();
    setInterval(loadData, 60_000);
  });
})();
