(() => {
  const SUPABASE_URL = "https://mengrlsqgshxqcxhirjn.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_PeVTrMXz6UaeMhkPn5Fs-Q_xfJFVRNt";

  let accessToken = null;

  const monthSpendEl = document.getElementById("api-month-spend");
  const monthChatsEl = document.getElementById("api-month-chats");
  const monthLimitEl = document.getElementById("api-month-limit");
  const monthRemainingEl = document.getElementById("api-month-remaining");
  const tableEl = document.getElementById("api-usage-table");
  const emptyEl = document.getElementById("api-usage-empty");
  const noteEl = document.getElementById("api-usage-note");

  const formatMoney = (amount, currency = "EUR") =>
    new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(amount || 0);
  const formatExactMoney = (amount, currency = "EUR") => {
    if (amount === null || amount === undefined) return "n.v.t.";
    const normalized = typeof amount === "number" ? amount : Number(amount);
    return Number.isFinite(normalized) ? formatMoney(normalized, currency) : "n.v.t.";
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

  const renderSummary = ({ monthSpend, monthCurrency, monthChats, monthlyLimit, remaining }) => {
    if (monthSpendEl) monthSpendEl.textContent = formatExactMoney(monthSpend, monthCurrency || "EUR");
    if (monthChatsEl) monthChatsEl.textContent = `${monthChats || 0} OpenAI chats`;
    if (monthLimitEl) monthLimitEl.textContent = Number.isFinite(monthlyLimit) ? formatMoney(monthlyLimit) : "Geen limiet";
    if (monthRemainingEl) {
      monthRemainingEl.textContent =
        Number.isFinite(monthlyLimit) && Number.isFinite(remaining)
          ? `${formatMoney(Math.max(0, remaining))} resterend`
          : "Geen limiet ingesteld";
    }
  };

  const renderTable = (rows, openAiLimit) => {
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
        const spend = row.spend_eur;
        const currency = row.currency || "EUR";
        const isOpenAiTotal = row.provider === "openai" && row.cost_exact;
        const limitValue = isOpenAiTotal ? openAiLimit?.amount : null;
        const limitCurrency = openAiLimit?.currency || "EUR";
        const limitDisplay = isOpenAiTotal ? formatExactMoney(limitValue, limitCurrency) : "-";
        return `
          <div class="table-row">
            <div class="cell" data-label="Model">${modelLabel}</div>
            <div class="cell" data-label="Provider">${provider}</div>
            <div class="cell" data-label="Chats">${chats}</div>
            <div class="cell" data-label="Tokens">${tokens}</div>
            <div class="cell" data-label="Kosten (exact)">${formatExactMoney(spend, currency)}</div>
            <div class="cell" data-label="OpenAI limiet">${limitDisplay}</div>
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
      renderSummary({ monthSpend: null, monthChats: 0, monthlyLimit: null, remaining: null });
      return;
    }

    const monthReal = payload?.month_real;
    renderSummary({
      monthSpend: Number.isFinite(monthReal?.spend) ? monthReal.spend : null,
      monthCurrency: monthReal?.currency || "EUR",
      monthChats: Number.isFinite(payload?.month?.openai_chats) ? payload.month.openai_chats : payload?.month?.chats || 0,
      monthlyLimit: payload?.limits?.monthly_eur ?? null,
      remaining: payload?.month?.remaining_eur ?? null,
    });
    renderTable(payload?.models || [], payload?.openai_limit);
    if (noteEl) {
      const noteParts = [];
      if (payload?.note) noteParts.push(payload.note);
      noteParts.push("Maandlimiet op basis van actieve klanten + topups.");
      noteEl.textContent = noteParts.filter(Boolean).join(" ");
    }
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
