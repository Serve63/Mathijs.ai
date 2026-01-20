(() => {
  const SUPABASE_URL = "https://mengrlsqgshxqcxhirjn.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_PeVTrMXz6UaeMhkPn5Fs-Q_xfJFVRNt";

  let accessToken = null;

  const todaySpendEl = document.getElementById("api-today-spend");
  const todayChatsEl = document.getElementById("api-today-chats");
  const dailyLimitEl = document.getElementById("api-daily-limit");
  const dailyRemainingEl = document.getElementById("api-daily-remaining");
  const tableEl = document.getElementById("api-usage-table");
  const emptyEl = document.getElementById("api-usage-empty");
  const noteEl = document.getElementById("api-usage-note");

  const formatMoney = (amount, currency = "EUR") =>
    new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(amount || 0);

  const createSupabaseClient = () => {
    if (!window.supabase?.createClient) return null;
    if (window.mathijsSupabase) return window.mathijsSupabase;
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    window.mathijsSupabase = client;
    return client;
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

  const renderSummary = ({ todaySpend, todayCurrency, todayChats, dailyLimit, remaining }) => {
    if (todaySpendEl) todaySpendEl.textContent = formatMoney(todaySpend || 0, todayCurrency || "EUR");
    if (todayChatsEl) todayChatsEl.textContent = `${todayChats || 0} chats`;
    if (dailyLimitEl) dailyLimitEl.textContent = dailyLimit ? formatMoney(dailyLimit) : "Geen limiet";
    if (dailyRemainingEl) {
      dailyRemainingEl.textContent =
        dailyLimit && Number.isFinite(remaining)
          ? `${formatMoney(Math.max(0, remaining))} resterend`
          : "Geen limiet ingesteld";
    }
  };

  const renderTable = (rows) => {
    if (!tableEl) return;
    if (!rows || !rows.length) {
      tableEl.innerHTML = "";
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    tableEl.innerHTML = rows
      .map((row) => {
        const modelLabel = row.model_label || row.model || "Onbekend";
        const provider = row.provider || "-";
        const chats = row.chats || 0;
        const tokens = row.tokens || 0;
        const spend = row.spend_eur || 0;
        const currency = row.currency || "EUR";
        return `
          <div class="table-row">
            <div class="cell" data-label="Model">${modelLabel}</div>
            <div class="cell" data-label="Provider">${provider}</div>
            <div class="cell" data-label="Chats">${chats}</div>
            <div class="cell" data-label="Tokens">${tokens}</div>
            <div class="cell" data-label="Kosten">${formatMoney(spend, currency)}</div>
          </div>
        `;
      })
      .join("");
  };

  const loadUsage = async () => {
    if (!accessToken) return;
    const resp = await fetch("/api/staff/api-usage", {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const message = payload?.error || "API usage ophalen mislukt.";
      if (noteEl) noteEl.textContent = message;
      renderTable([]);
      renderSummary({ todaySpend: 0, todayChats: 0, dailyLimit: null, remaining: null });
      return;
    }

    const todayReal = payload?.today_real;
    renderSummary({
      todaySpend: todayReal?.spend ?? payload?.today?.spend_eur ?? 0,
      todayCurrency: todayReal?.currency || "EUR",
      todayChats: payload?.today?.chats || 0,
      dailyLimit: payload?.limits?.daily_eur || null,
      remaining: payload?.today?.remaining_eur ?? null,
    });
    renderTable(payload?.models || []);
    if (noteEl) noteEl.textContent = payload?.note || "";
  };

  const init = async () => {
    const supabase = createSupabaseClient();
    if (!supabase) return;
    const ok = await ensureStaff(supabase);
    if (!ok) {
      window.location.href = "/staff-login";
      return;
    }
    await loadUsage();
  };

  document.addEventListener("DOMContentLoaded", init);
})();

