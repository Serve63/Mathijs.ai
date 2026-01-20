// Vercel Serverless Function: Staff API usage overview (month)
//
// Requires Supabase service role key and api_usage_events table.

const { getBearerToken, getClientIp, json, publicError, rateLimit, rateLimitHeaders } = require("../_lib/security");
const { SUPABASE_URL, getUserFromAccessToken } = require("../_lib/supabase");
const { isStaffUser } = require("../_lib/staff");
const { adminRestFetch } = require("../_lib/supabaseAdmin");
const { getOpenAIApiKey, getSupabaseServiceRoleKey } = require("../_lib/env");

const STAFF_WINDOW_MS = 60_000;
const STAFF_LIMIT = 120;
const DEFAULT_TOKENS_PER_EUR = 100;
const DEFAULT_CREDIT_ALLOWANCE_EUR = 10;

function startOfMonthUtc(now) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function getTokensPerEur() {
  const tokensPerEur = Number(process.env.TOPUP_TOKENS_PER_EUR || DEFAULT_TOKENS_PER_EUR);
  if (!Number.isFinite(tokensPerEur) || tokensPerEur <= 0) return DEFAULT_TOKENS_PER_EUR;
  return Math.floor(tokensPerEur);
}

function parseLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function getCreditAllowanceEur() {
  const value = Number(process.env.CREDIT_ALLOWANCE_EUR || DEFAULT_CREDIT_ALLOWANCE_EUR);
  if (!Number.isFinite(value) || value < 0) return DEFAULT_CREDIT_ALLOWANCE_EUR;
  return Math.round(value * 100) / 100;
}

function toEur(tokens, tokensPerEur) {
  const amount = Number(tokens || 0) / Number(tokensPerEur || DEFAULT_TOKENS_PER_EUR);
  return Math.round(amount * 100) / 100;
}

async function getTopupsThisMonthEur(startIso) {
  let total = 0;
  let offset = 0;
  const limit = 1000;
  while (true) {
    const rows =
      (await adminRestFetch(
        `billing_events?select=amount_eur&event_type=eq.topup&paid_at=gte.${encodeURIComponent(
          startIso
        )}&order=paid_at.desc&limit=${limit}&offset=${offset}`,
        { method: "GET" }
      )) || [];
    if (!Array.isArray(rows) || rows.length === 0) break;
    rows.forEach((row) => {
      const amount = Number(row?.amount_eur || 0);
      if (Number.isFinite(amount)) total += amount;
    });
    if (rows.length < limit) break;
    offset += limit;
  }
  return Math.round(total * 100) / 100;
}

async function supabaseAuthAdmin(path, { method = "GET", accessKey, body } = {}) {
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/admin/${path}`, {
    method,
    headers: {
      apikey: accessKey,
      Authorization: `Bearer ${accessKey}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`auth_admin_failed:${resp.status}:${text}`);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function fetchAllUsers(serviceRoleKey) {
  const out = [];
  let page = 1;
  const perPage = 200;
  while (page <= 5) {
    const resp = await supabaseAuthAdmin(`users?page=${page}&per_page=${perPage}`, {
      method: "GET",
      accessKey: serviceRoleKey,
    });
    const users = resp?.users || [];
    users.forEach((u) => out.push(u));
    if (users.length < perPage) break;
    page += 1;
  }
  return out;
}

function isPayingCustomer(user) {
  if (!user) return false;
  const appMeta = user.app_metadata || {};
  if (appMeta.lifetime_free || appMeta.plan === "lifetime" || appMeta.plan === "trial") return true;
  const freeMonths = Number(appMeta.free_months || 0);
  if (Number.isFinite(freeMonths) && freeMonths > 0) return true;
  const totalPaid = Number(appMeta.total_paid_eur || 0);
  if (Number.isFinite(totalPaid) && totalPaid > 0) return true;
  const lastPaid = Number(appMeta.last_payment_amount_eur || 0);
  if (Number.isFinite(lastPaid) && lastPaid > 0) return true;
  return false;
}

function isActiveCustomer(user) {
  if (!isPayingCustomer(user)) return false;
  const cancelledAt = user?.app_metadata?.cancelled_at;
  return !cancelledAt;
}

async function fetchOpenAiUsagePeriod({ startTime, endTime }) {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) return null;

  const orgId = process.env.OPENAI_ORG_ID || process.env.OPENAI_ORGANIZATION || "";
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (orgId) headers["OpenAI-Organization"] = orgId;

  const startDate = new Date(startTime).toISOString().slice(0, 10);
  const endDate = new Date(endTime).toISOString().slice(0, 10);

  const endpoints = [
    {
      name: "org_usage",
      url: `https://api.openai.com/v1/organization/usage?start_time=${Math.floor(
        new Date(startTime).getTime() / 1000
      )}&end_time=${Math.floor(new Date(endTime).getTime() / 1000)}`,
    },
    {
      name: "org_costs",
      url: `https://api.openai.com/v1/organization/costs?start_time=${Math.floor(
        new Date(startTime).getTime() / 1000
      )}&end_time=${Math.floor(new Date(endTime).getTime() / 1000)}`,
    },
    {
      name: "legacy_usage",
      url: `https://api.openai.com/v1/dashboard/billing/usage?start_date=${startDate}&end_date=${endDate}`,
    },
  ];

  for (const endpoint of endpoints) {
    try {
      const resp = await fetch(endpoint.url, { method: "GET", headers });
      if (!resp.ok) continue;
      const payload = await resp.json().catch(() => ({}));

      // Normalize possible shapes
      if (Array.isArray(payload?.data) && payload.data.length) {
        return {
          source: endpoint.name,
          currency: payload?.currency || "USD",
          rows: payload.data,
        };
      }

      if (typeof payload?.total_usage === "number") {
        return {
          source: endpoint.name,
          currency: "USD",
          rows: [
            {
              model: "OpenAI totaal",
              model_label: "OpenAI totaal",
              cost_usd: payload.total_usage / 100,
              tokens: payload.total_tokens || 0,
              requests: payload.total_requests || 0,
            },
          ],
        };
      }
    } catch (_) {
      // try next endpoint
    }
  }

  return null;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return json(res, 405, { error: "Method not allowed" });
    }

    const token = getBearerToken(req);
    if (!token) return json(res, 401, { error: "Missing Authorization Bearer token" });

    const ip = getClientIp(req);
    const rate = rateLimit({ key: `staff_api_usage:ip:${ip}`, limit: STAFF_LIMIT, windowMs: STAFF_WINDOW_MS });
    if (!rate.ok) {
      return json(res, 429, { error: "Te veel verzoeken. Probeer later opnieuw." }, rateLimitHeaders(rate, STAFF_LIMIT));
    }

    const user = await getUserFromAccessToken(token);
    if (!user?.id || !user?.email) return json(res, 401, { error: "Unauthorized" });
    const confirmedAt = user?.email_confirmed_at || user?.confirmed_at;
    if (!confirmedAt) return json(res, 403, { error: "Forbidden (email not verified)" });
    if (!isStaffUser(user)) return json(res, 403, { error: "Forbidden (not staff)" });

    const now = new Date();
    const monthIso = startOfMonthUtc(now).toISOString();

    let rows = [];
    try {
      let offset = 0;
      const limit = 1000;
      while (true) {
        const batch =
          (await adminRestFetch(
            `api_usage_events?select=provider,model,model_label,tokens,tokens_per_eur,cost_eur,created_at&created_at=gte.${encodeURIComponent(
              monthIso
            )}&order=created_at.desc&limit=${limit}&offset=${offset}`,
            { method: "GET" }
          )) || [];
        if (!Array.isArray(batch) || batch.length === 0) break;
        rows = rows.concat(batch);
        if (batch.length < limit) break;
        offset += limit;
      }
    } catch (e) {
      const detail = String(e?.detail || "");
      const isMissingTable = e?.statusCode === 404 || detail.includes("api_usage_events");
      if (isMissingTable) {
        return json(res, 500, {
          error: "API usage tabel ontbreekt. Run migrations/create_api_usage_events.sql in Supabase.",
        });
      }
      throw e;
    }

    const tokensPerEur = getTokensPerEur();
    const totals = new Map();
    let monthTokens = 0;
    let monthSpend = 0;

    rows.forEach((row) => {
      const modelLabel = row?.model_label || row?.model || "Onbekend";
      const provider = row?.provider || "onbekend";
      const key = `${provider}::${modelLabel}`;
      const tokens = Number(row?.tokens || 0);
      const rowTokensPerEur = Number(row?.tokens_per_eur || tokensPerEur || DEFAULT_TOKENS_PER_EUR);
      const spend = Number.isFinite(Number(row?.cost_eur)) ? Number(row.cost_eur) : toEur(tokens, rowTokensPerEur);

      monthTokens += tokens;
      monthSpend += spend;

      const existing = totals.get(key) || {
        provider,
        model_label: modelLabel,
        tokens: 0,
        spend_eur: 0,
        chats: 0,
        currency: "EUR",
        source: "estimate",
      };
      existing.tokens += tokens;
      existing.spend_eur = Math.round((existing.spend_eur + spend) * 100) / 100;
      existing.chats += 1;
      totals.set(key, existing);
    });

    const openaiUsage = await fetchOpenAiUsagePeriod({ startTime: monthIso, endTime: now.toISOString() });
    let monthReal = null;

    if (openaiUsage?.rows?.length) {
      const realTotals = new Map();
      openaiUsage.rows.forEach((row) => {
        const modelLabel = row?.model_label || row?.model || "OpenAI";
        const provider = "openai";
        const key = `${provider}::${modelLabel}`;
        const tokens =
          Number(row?.tokens || row?.total_tokens || 0) ||
          Number((row?.input_tokens || 0) + (row?.output_tokens || 0));
        const spend =
          Number(row?.cost_eur || row?.cost_usd || row?.total_cost || row?.amount || 0) ||
          0;
        const chats = Number(row?.requests || row?.n_requests || row?.count || 0) || 0;
        const existing = realTotals.get(key) || {
          provider,
          model_label: modelLabel,
          tokens: 0,
          spend_eur: 0,
          chats: 0,
          currency: openaiUsage.currency || "USD",
          source: "openai_api",
        };
        existing.tokens += tokens;
        existing.spend_eur = Math.round((existing.spend_eur + spend) * 100) / 100;
        existing.chats += chats || 0;
        realTotals.set(key, existing);
      });

      // Replace estimated OpenAI rows with real ones
      for (const [key, value] of realTotals.entries()) {
        totals.set(key, value);
      }

      const openaiTotal = Array.from(realTotals.values()).reduce((acc, item) => acc + (item.spend_eur || 0), 0);
      monthReal = {
        spend: Math.round(openaiTotal * 100) / 100,
        currency: openaiUsage.currency || "USD",
        source: openaiUsage.source || "openai_api",
      };
    }

    const models = Array.from(totals.values()).sort((a, b) => b.spend_eur - a.spend_eur);
    const creditAllowanceEur = getCreditAllowanceEur();
    let monthlyLimit = null;
    let monthlyLimitSource = "credits";
    let topupsThisMonth = null;
    let activeCustomers = null;

    try {
      const serviceRoleKey = getSupabaseServiceRoleKey();
      const users = await fetchAllUsers(serviceRoleKey);
      activeCustomers = users.filter(isActiveCustomer).length;
    } catch (_) {
      activeCustomers = null;
    }

    try {
      topupsThisMonth = await getTopupsThisMonthEur(monthIso);
    } catch (_) {
      topupsThisMonth = null;
    }

    const hasActiveCustomers =
      Number.isFinite(activeCustomers) && Number.isFinite(creditAllowanceEur) && creditAllowanceEur >= 0;
    const hasTopups = Number.isFinite(topupsThisMonth) && topupsThisMonth > 0;
    let computed = false;
    let total = 0;
    if (hasActiveCustomers) {
      total += activeCustomers * creditAllowanceEur;
      computed = true;
    }
    if (hasTopups) {
      total += topupsThisMonth;
      computed = true;
    }
    if (computed) {
      monthlyLimit = Math.round(total * 100) / 100;
    } else {
      monthlyLimit = parseLimit(process.env.API_MONTHLY_LIMIT_EUR);
      if (monthlyLimit) monthlyLimitSource = "env";
    }
    const remaining = Number.isFinite(monthlyLimit)
      ? Math.max(0, Math.round((monthlyLimit - monthSpend) * 100) / 100)
      : null;

    return json(res, 200, {
      ok: true,
      currency: "EUR",
      month: {
        chats: rows.length,
        tokens: monthTokens,
        spend_eur: Math.round(monthSpend * 100) / 100,
        remaining_eur: remaining,
        since: monthIso,
      },
      month_real: monthReal,
      models,
      limits: {
        monthly_eur: monthlyLimit,
        source: monthlyLimitSource,
        credit_allowance_eur: creditAllowanceEur,
        topups_this_month_eur: Number.isFinite(topupsThisMonth) ? topupsThisMonth : null,
        active_customers: Number.isFinite(activeCustomers) ? activeCustomers : null,
      },
      tokens_per_eur: tokensPerEur,
      note: monthReal
        ? "OpenAI kosten zijn gekoppeld via OpenAI usage API. Overige providers zijn schattingen. Tokens komen uit provider usage."
        : "Tokens komen uit provider usage. Kosten zijn gebaseerd op interne credits (TOPUP_TOKENS_PER_EUR).",
    });
  } catch (e) {
    return publicError(res, 500, "API usage ophalen mislukt.", e);
  }
};
