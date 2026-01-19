(() => {
  const SUPABASE_URL = "https://mengrlsqgshxqcxhirjn.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_PeVTrMXz6UaeMhkPn5Fs-Q_xfJFVRNt";

  const provinceLabels = window.provinceLabels || {};
  let customers = [];
  let accessToken = null;
  let pendingDeleteId = null;
  let pendingLifetimeRevokeId = null;

  const totalCustomersEl = document.getElementById("stat-total-customers");
  const activeCustomersEl = document.getElementById("stat-active-customers");
  const searchInput = document.getElementById("customer-search");
  const tableEl = document.getElementById("customers-table");
  const emptyEl = document.getElementById("customers-empty");

  const dateFmt = new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
  const fmtEUR = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });

  const createSupabaseClient = () => {
    if (!window.supabase?.createClient) return null;
    if (window.mathijsSupabase) return window.mathijsSupabase;
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    window.mathijsSupabase = client;
    return client;
  };

  const formatProvince = (customer) => {
    const provinceId = customer?.province_id;
    if (provinceId) return provinceLabels[provinceId] || provinceId;
    return customer?.location_label || "Onbekend";
  };

  const formatDate = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return dateFmt.format(date);
  };

  const getDisplayName = (customer) => {
    if (customer?.name) return customer.name;
    if (customer?.email) return customer.email.split("@")[0];
    return "Onbekend";
  };

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

  const formatPlan = (customer) => {
    if (customer?.lifetime_free) return "Lifetime Gratis";
    const plan = (customer?.plan || "free").toLowerCase();
    if (plan === "free") return "Gratis";
    if (plan === "standard") return "Standaard";
    return plan.charAt(0).toUpperCase() + plan.slice(1);
  };

  const isPayingCustomer = (customer) => {
    if (!customer) return false;
    if (customer.lifetime_free) return true;
    const totalPaid = Number(customer.total_paid_eur || 0);
    if (Number.isFinite(totalPaid) && totalPaid > 0) return true;
    const lastPaid = Number(customer.last_payment_amount_eur || 0);
    if (Number.isFinite(lastPaid) && lastPaid > 0) return true;
    return false;
  };

  const getStatusConfig = (customer) => {
    if (customer?.cancelled_at) return { label: "opgezegd", className: "cancelled" };
    if (!isPayingCustomer(customer)) return { label: "gratis", className: "trial" };
    return { label: "Actief", className: "active" };
  };

  const isActiveSubscriber = (customer) => {
    if (!customer) return false;
    return isPayingCustomer(customer) && !customer.cancelled_at;
  };

  const updateStats = () => {
    const activeCount = customers.filter(isActiveSubscriber).length;

    if (totalCustomersEl) totalCustomersEl.textContent = String(customers.length);
    if (activeCustomersEl) activeCustomersEl.textContent = String(activeCount);
  };

  const getFilteredCustomers = () => {
    const query = searchInput ? searchInput.value.trim().toLowerCase() : "";
    if (!query) return customers.slice();

    return customers.filter((customer) => {
      const provinceLabel = formatProvince(customer);
      const haystack = `${getDisplayName(customer)} ${customer.email || ""} ${customer.plan || ""} ${provinceLabel}`
        .toLowerCase();
      return haystack.includes(query);
    });
  };

  const renderTable = () => {
    if (!tableEl) return;
    const filtered = getFilteredCustomers();

    if (!filtered.length) {
      tableEl.innerHTML = "";
      if (emptyEl) emptyEl.hidden = false;
      return;
    }

    if (emptyEl) emptyEl.hidden = true;

    tableEl.innerHTML = filtered
      .map((customer) => {
        const name = getDisplayName(customer);
        const provinceLabel = formatProvince(customer);
        const status = getStatusConfig(customer);
        const memberSince = formatDate(customer.subscribed_at || customer.created_at);
        const totalSpent = fmtEUR.format(Number(customer.total_paid_eur || 0) || 0);
        const isLifetime = Boolean(customer?.lifetime_free);
        const isPendingDelete = pendingDeleteId === customer.id;
        const isPendingLifetimeRevoke = pendingLifetimeRevokeId === customer.id;
        const actionsMarkup = isPendingDelete
          ? `
              <div class="delete-confirm">
                <span class="delete-confirm__text">Weet je zeker dat je deze klant wilt verwijderen?</span>
                <button class="btn tiny danger" data-action="confirm-delete">Verwijderen</button>
                <button class="btn tiny ghost" data-action="cancel-delete">Annuleren</button>
              </div>
            `
          : isPendingLifetimeRevoke
          ? `
              <div class="delete-confirm">
                <span class="delete-confirm__text">Lifetime opzeggen? Dit maakt het account inactief.</span>
                <button class="btn tiny danger" data-action="confirm-lifetime-revoke">Opzeggen</button>
                <button class="btn tiny ghost" data-action="cancel-lifetime-revoke">Annuleren</button>
              </div>
            `
          : isLifetime
          ? `
              <button class="btn tiny secondary wide" data-action="lifetime" data-enabled="false">Lifetime opzeggen</button>
              <button class="btn tiny ghost" data-action="delete">Klant verwijderen</button>
            `
          : `
              <button class="btn tiny secondary" data-action="grant" data-months="1">1 maand gratis</button>
              <button class="btn tiny secondary" data-action="lifetime" data-enabled="true">Lifetime geven</button>
              <button class="btn tiny ghost" data-action="delete">Klant verwijderen</button>
            `;

        return `
          <div class="table-row" data-id="${customer.id}">
            <div class="cell customer-cell" data-label="Klant">
              <div class="customer-avatar">${getInitials(name)}</div>
              <div>
                <p class="customer-name">${name}</p>
                <p class="customer-sub">
                  <span class="customer-subline">${customer.email || "-"}</span>
                  <span class="customer-subline">Lid sinds ${memberSince}</span>
                  <span class="customer-subline">Besteed ${totalSpent}</span>
                </p>
              </div>
            </div>
            <div class="cell" data-label="Provincie">${provinceLabel}</div>
            <div class="cell" data-label="Plan">${formatPlan(customer)}</div>
            <div class="cell" data-label="Status"><span class="status ${status.className}">${status.label}</span></div>
            <div class="cell actions" data-label="Acties">
              ${actionsMarkup}
            </div>
          </div>
        `;
      })
      .join("");
  };

  const setActionLoading = (button, loading) => {
    if (!button) return;
    if (loading) {
      button.dataset.originalLabel = button.textContent;
      button.textContent = "Bezig...";
      button.disabled = true;
    } else {
      button.textContent = button.dataset.originalLabel || button.textContent;
      button.disabled = false;
    }
  };

  const handleTableAction = async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const row = button.closest(".table-row");
    if (!row) return;
    const id = row.dataset.id;
    const index = customers.findIndex((customer) => customer.id === id);
    if (index === -1) return;

    const action = button.dataset.action;
    if (action === "delete") {
      pendingDeleteId = id;
      pendingLifetimeRevokeId = null;
      renderTable();
      return;
    }
    if (action === "cancel-delete") {
      if (pendingDeleteId === id) pendingDeleteId = null;
      renderTable();
      return;
    }
    if (action === "lifetime" && button.dataset.enabled === "false") {
      pendingLifetimeRevokeId = id;
      pendingDeleteId = null;
      renderTable();
      return;
    }
    if (action === "cancel-lifetime-revoke") {
      if (pendingLifetimeRevokeId === id) pendingLifetimeRevokeId = null;
      renderTable();
      return;
    }

    setActionLoading(button, true);
    try {
      if (action === "confirm-delete") {
        const resp = await fetch("/api/staff/customers", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ action: "delete_customer", id }),
        });
        const payload = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(payload?.error || "Verwijderen mislukt.");
        pendingDeleteId = null;
        customers.splice(index, 1);
        updateStats();
        renderTable();
        return;
      }

      if (action === "grant") {
        const months = Number(button.dataset.months) || 1;
        const resp = await fetch("/api/staff/customers", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ action: "grant_free_months", id, months }),
        });
        const payload = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(payload?.error || "Bijwerken mislukt.");
        customers[index].free_months = payload?.free_months || customers[index].free_months;
        updateStats();
        renderTable();
        return;
      }

      if (action === "confirm-lifetime-revoke") {
        const resp = await fetch("/api/staff/customers", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ action: "set_lifetime_free", id, enabled: false }),
        });
        const payload = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(payload?.error || "Bijwerken mislukt.");
        customers[index].lifetime_free = Boolean(payload?.lifetime_free);
        if (payload?.plan) customers[index].plan = payload.plan;
        if ("cancelled_at" in payload) customers[index].cancelled_at = payload.cancelled_at;
        pendingLifetimeRevokeId = null;
        updateStats();
        renderTable();
        return;
      }

      if (action === "lifetime") {
        const enabled = button.dataset.enabled !== "false";
        const resp = await fetch("/api/staff/customers", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ action: "set_lifetime_free", id, enabled }),
        });
        const payload = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(payload?.error || "Bijwerken mislukt.");
        customers[index].lifetime_free = Boolean(payload?.lifetime_free);
        if (payload?.plan) customers[index].plan = payload.plan;
        if ("cancelled_at" in payload) customers[index].cancelled_at = payload.cancelled_at;
        pendingLifetimeRevokeId = null;
        updateStats();
        renderTable();
      }
    } catch (err) {
      console.error("Staff action failed", err);
      alert(err?.message || "Actie mislukt.");
    } finally {
      setActionLoading(button, false);
    }
  };

  const fetchCustomers = async () => {
    const resp = await fetch("/api/staff/customers", {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(payload?.error || "Klanten ophalen mislukt.");
    }
    return Array.isArray(payload?.customers) ? payload.customers : [];
  };

  const ensureStaff = async (supabase) => {
    const { data } = await supabase.auth.getSession();
    accessToken = data?.session?.access_token || null;
    if (!accessToken) return false;
    const resp = await fetch("/api/staff/me", {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok || !payload?.staff) {
      await supabase.auth.signOut();
      return false;
    }
    return true;
  };

  const init = async () => {
    const supabase = createSupabaseClient();
    if (!supabase) return;

    const ok = await ensureStaff(supabase);
    if (!ok) {
      window.location.href = "/staff-login";
      return;
    }

    try {
      const allCustomers = await fetchCustomers();
      customers = allCustomers.filter(isPayingCustomer);
      updateStats();
      renderTable();
    } catch (err) {
      console.error("Klanten laden mislukt", err);
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent = err?.message || "Klanten laden mislukt.";
      }
    }
  };

  if (searchInput) {
    searchInput.addEventListener("input", renderTable);
  }
  if (tableEl) {
    tableEl.addEventListener("click", handleTableAction);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
