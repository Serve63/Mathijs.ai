// Vercel Serverless Function: Staff API usage overview (month)
//
// Requires Supabase service role key and api_usage_events table.

const { getBearerToken, getClientIp, json, publicError, rateLimit, rateLimitHeaders } = require("../_lib/security");
const { SUPABASE_URL, getUserFromAccessToken } = require("../_lib/supabase");
const { isStaffUser } = require("../_lib/staff");
const { adminRestFetch } = require("../_lib/supabaseAdmin");
const { getOpenAIApiKey, getOpenAICostsKey, getSupabaseServiceRoleKey } = require("../_lib/env");

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

const CACHE_TTLS = {
  usage: 60_000,
  costs: 300_000,
  topups: 300_000,
  active: 300_000,
  openai_limit: 300_000,
};

const cacheStore = {
  usage: new Map(),
  costs: new Map(),
  topups: new Map(),
  active: new Map(),
  openai_limit: new Map(),
};

function getCached(map, key) {
  const entry = map.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    map.delete(key);
    return undefined;
  }
  return entry.value;
}

function setCached(map, key, value, ttlMs) {
  map.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

let cachedUsdToEurRate = null;
let cachedFxAt = 0;

async function getUsdToEurRate() {
  const override = Number(process.env.OPENAI_USD_EUR_RATE || 0);
  if (Number.isFinite(override) && override > 0) return override;
  const now = Date.now();
  if (cachedUsdToEurRate && now - cachedFxAt < 6 * 60 * 60 * 1000) {
    return cachedUsdToEurRate;
  }
  const endpoints = [
    "https://api.exchangerate.host/latest?base=USD&symbols=EUR",
    "https://open.er-api.com/v6/latest/USD",
  ];
  for (const url of endpoints) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const payload = await resp.json().catch(() => ({}));
      const rate = Number(payload?.rates?.EUR);
      if (!Number.isFinite(rate) || rate <= 0) continue;
      cachedUsdToEurRate = rate;
      cachedFxAt = now;
      return rate;
    } catch (_) {
      continue;
    }
  }
  return null;
}

function getCreditAllowanceEur() {
  const value = Number(process.env.CREDIT_ALLOWANCE_EUR || DEFAULT_CREDIT_ALLOWANCE_EUR);
  if (!Number.isFinite(value) || value < 0) return DEFAULT_CREDIT_ALLOWANCE_EUR;
  return Math.round(value * 100) / 100;
}

function getRequestedOpenAiCurrency() {
  const raw = String(process.env.OPENAI_COSTS_CURRENCY || "EUR").trim();
  return raw ? raw.toUpperCase() : "EUR";
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

async function getTopupsThisMonthCached(monthKey, startIso) {
  const cached = getCached(cacheStore.topups, monthKey);
  if (cached !== undefined) return cached;
  try {
    const total = await getTopupsThisMonthEur(startIso);
    return setCached(cacheStore.topups, monthKey, total, CACHE_TTLS.topups);
  } catch (_) {
    return setCached(cacheStore.topups, monthKey, null, CACHE_TTLS.topups);
  }
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

async function convertOpenAiAmount(amount, currency) {
  const requestedCurrency = getRequestedOpenAiCurrency();
  let finalAmount = Number(amount || 0);
  let finalCurrency = (currency || "USD").toUpperCase();
  let fxRateUsed = null;

  if (requestedCurrency && requestedCurrency !== finalCurrency) {
    if (requestedCurrency === "EUR" && finalCurrency === "USD") {
      const fxRate = await getUsdToEurRate();
      if (Number.isFinite(fxRate) && fxRate > 0) {
        finalAmount = finalAmount * fxRate;
        finalCurrency = "EUR";
        fxRateUsed = fxRate;
      }
    }
  }

  return {
    amount: Math.round(finalAmount * 100) / 100,
    currency: finalCurrency,
    fx_rate: fxRateUsed,
  };
}

async function getActiveCustomersCached(monthKey, serviceRoleKey) {
  const cached = getCached(cacheStore.active, monthKey);
  if (cached !== undefined) return cached;
  if (!serviceRoleKey) {
    return setCached(cacheStore.active, monthKey, null, CACHE_TTLS.active);
  }
  try {
    const users = await fetchAllUsers(serviceRoleKey);
    const count = users.filter(isActiveCustomer).length;
    return setCached(cacheStore.active, monthKey, count, CACHE_TTLS.active);
  } catch (_) {
    return setCached(cacheStore.active, monthKey, null, CACHE_TTLS.active);
  }
}

async function fetchOpenAiUsagePeriod({ startTime, endTime, preferLegacy = false }) {
  const apiKey = getOpenAICostsKey() || getOpenAIApiKey();
  if (!apiKey) return null;

  const orgId = process.env.OPENAI_ORG_ID || process.env.OPENAI_ORGANIZATION || "";
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (orgId) headers["OpenAI-Organization"] = orgId;

  const startDate = new Date(startTime).toISOString().slice(0, 10);
  const endDate = new Date(endTime).toISOString().slice(0, 10);

  const endpoints = preferLegacy
    ? [
        {
          name: "legacy_usage",
          url: `https://api.openai.com/v1/dashboard/billing/usage?start_date=${startDate}&end_date=${endDate}`,
        },
        {
          name: "org_costs",
          url: `https://api.openai.com/v1/organization/costs?start_time=${Math.floor(
            new Date(startTime).getTime() / 1000
          )}&end_time=${Math.floor(new Date(endTime).getTime() / 1000)}`,
        },
      ]
    : [
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
    let url = endpoint.url;
    let pageCount = 0;
    let rows = [];
    let currency = null;
    let lastPayload = null;
    while (url) {
      try {
        const resp = await fetch(url, { method: "GET", headers });
        if (!resp.ok) break;
        const payload = await resp.json().catch(() => ({}));
        lastPayload = payload;

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

        if (Array.isArray(payload?.data) && payload.data.length) {
          const pageRows = [];
          payload.data.forEach((item) => {
            if (Array.isArray(item?.results)) {
              item.results.forEach((result) => pageRows.push(result));
            } else {
              pageRows.push(item);
            }
          });
          if (pageRows.length) {
            rows = rows.concat(pageRows);
            if (!currency) {
              const fromRow = pageRows.find((row) => row?.amount && typeof row.amount === "object")?.amount?.currency;
              currency = fromRow || payload?.currency || null;
            }
          }
        }

        if (payload?.has_more && payload?.next_page) {
          const nextUrl = new URL(endpoint.url);
          nextUrl.searchParams.set("page", payload.next_page);
          url = nextUrl.toString();
        } else {
          url = null;
        }

        pageCount += 1;
        if (pageCount > 50) url = null;
      } catch (_) {
        break;
      }
    }

    if (rows.length) {
      return {
        source: endpoint.name,
        currency: currency || lastPayload?.currency || "USD",
        rows,
      };
    }
  }

  return null;
}

async function fetchOpenAiLimit() {
  const apiKey = getOpenAICostsKey() || getOpenAIApiKey();
  if (!apiKey) return null;

  const orgId = process.env.OPENAI_ORG_ID || process.env.OPENAI_ORGANIZATION || "";
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (orgId) headers["OpenAI-Organization"] = orgId;

  try {
    const resp = await fetch("https://api.openai.com/v1/dashboard/billing/subscription", { method: "GET", headers });
    if (!resp.ok) return null;
    const payload = await resp.json().catch(() => ({}));
    const candidates = [payload?.hard_limit_usd, payload?.system_hard_limit_usd, payload?.soft_limit_usd];
    const limitUsd = candidates.map((value) => Number(value)).find((value) => Number.isFinite(value) && value > 0);
    if (!limitUsd) return null;
    return { limit: limitUsd, currency: "USD", source: "openai_subscription" };
  } catch (_) {
    return null;
  }
}

async function computeOpenAiLimit() {
  const limit = await fetchOpenAiLimit();
  if (!limit) return null;
  const converted = await convertOpenAiAmount(limit.limit, limit.currency);
  return {
    limit: converted.amount,
    currency: converted.currency,
    source: limit.source || "openai_subscription",
    fx_rate: converted.fx_rate,
  };
}

async function getOpenAiLimitCached(monthKey) {
  const cached = getCached(cacheStore.openai_limit, monthKey);
  if (cached !== undefined) return cached;
  const limit = await computeOpenAiLimit();
  return setCached(cacheStore.openai_limit, monthKey, limit, CACHE_TTLS.openai_limit);
}

async function computeOpenAiMonthReal({ monthIso, now, openaiAgg }) {
  const openaiUsage = await fetchOpenAiUsagePeriod({ startTime: monthIso, endTime: now.toISOString() });
  if (!openaiUsage?.rows?.length) return null;

  const openaiCurrencyRaw =
    openaiUsage.currency ||
    openaiUsage.rows.find((row) => row?.amount && typeof row.amount === "object" && row.amount.currency)?.amount
      ?.currency ||
    "USD";
  let openaiCurrency = typeof openaiCurrencyRaw === "string" ? openaiCurrencyRaw.toUpperCase() : "USD";
  let openaiTotal = openaiUsage.rows.reduce((acc, row) => {
    const candidates = [
      row?.cost_eur,
      row?.cost_usd,
      row?.total_cost,
      row?.amount && typeof row.amount === "object" ? row.amount.value : row?.amount,
      row?.value,
    ];
    let spend = 0;
    for (const candidate of candidates) {
      const num = Number(candidate);
      if (Number.isFinite(num)) {
        spend = num;
        break;
      }
    }
    return acc + spend;
  }, 0);

  if (openaiTotal <= 0 && openaiAgg.tokens > 0) {
    const legacyUsage = await fetchOpenAiUsagePeriod({
      startTime: monthIso,
      endTime: now.toISOString(),
      preferLegacy: true,
    });
    if (legacyUsage?.rows?.length) {
      const legacyTotal = legacyUsage.rows.reduce((acc, row) => {
        const candidates = [row?.cost_usd, row?.total_cost, row?.cost_eur, row?.value, row?.amount];
        let spend = 0;
        for (const candidate of candidates) {
          const num = Number(candidate);
          if (Number.isFinite(num)) {
            spend = num;
            break;
          }
        }
        return acc + spend;
      }, 0);
      if (legacyTotal > 0) {
        openaiTotal = legacyTotal;
        openaiCurrency = (legacyUsage.currency || "USD").toUpperCase();
      }
    }
  }

  const converted = await convertOpenAiAmount(openaiTotal, openaiCurrency);

  return {
    spend: converted.amount,
    currency: converted.currency,
    source: openaiUsage.source || "openai_api",
    fx_rate: converted.fx_rate,
  };
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

    const monthKey = monthIso.slice(0, 7);
    const tokensPerEur = getTokensPerEur();
    const serviceRoleKey = getSupabaseServiceRoleKey();
    const activeCustomersPromise = getActiveCustomersCached(monthKey, serviceRoleKey);
    const topupsThisMonthPromise = getTopupsThisMonthCached(monthKey, monthIso);
    const openAiLimitPromise = getOpenAiLimitCached(monthKey);
    let usageSummary = getCached(cacheStore.usage, monthKey);
    if (!usageSummary) {
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

      const totals = new Map();
      const providerTotals = new Map();
      let monthTokens = 0;
      let internalSpend = 0;

      rows.forEach((row) => {
        const modelLabel = row?.model_label || row?.model || "Onbekend";
        const provider = row?.provider || "onbekend";
        const key = `${provider}::${modelLabel}`;
        const tokens = Number(row?.tokens || 0);
        const rowTokensPerEur = Number(row?.tokens_per_eur || tokensPerEur || DEFAULT_TOKENS_PER_EUR);
        const internalCost = Number.isFinite(Number(row?.cost_eur))
          ? Number(row.cost_eur)
          : toEur(tokens, rowTokensPerEur);

        monthTokens += tokens;
        internalSpend += internalCost;

        const existing = totals.get(key) || {
          provider,
          model_label: modelLabel,
          tokens: 0,
          spend_eur: null,
          chats: 0,
          currency: "EUR",
          source: "usage_events",
          cost_exact: false,
        };
        existing.tokens += tokens;
        existing.chats += 1;
        totals.set(key, existing);

        const providerAgg = providerTotals.get(provider) || { tokens: 0, chats: 0 };
        providerAgg.tokens += tokens;
        providerAgg.chats += 1;
        providerTotals.set(provider, providerAgg);
      });

      usageSummary = {
        rowCount: rows.length,
        monthTokens,
        internalSpend,
        providerTotals,
        modelsBase: Array.from(totals.values()).sort((a, b) => b.tokens - a.tokens),
      };
      setCached(cacheStore.usage, monthKey, usageSummary, CACHE_TTLS.usage);
    }

    const {
      rowCount,
      monthTokens,
      internalSpend,
      providerTotals,
    } = usageSummary;

    const openaiAgg = providerTotals.get("openai") || { tokens: 0, chats: 0 };
    let monthReal = getCached(cacheStore.costs, monthKey);
    const monthRealPromise =
      monthReal === undefined ? computeOpenAiMonthReal({ monthIso, now, openaiAgg }) : Promise.resolve(monthReal);
    const [resolvedMonthReal, activeCustomers, topupsThisMonth, openaiLimit] = await Promise.all([
      monthRealPromise,
      activeCustomersPromise,
      topupsThisMonthPromise,
      openAiLimitPromise,
    ]);
    if (monthReal === undefined) {
      monthReal = resolvedMonthReal;
      setCached(cacheStore.costs, monthKey, monthReal, CACHE_TTLS.costs);
    }

    const models = [];
    if (monthReal) {
      models.push({
        provider: "openai",
        model_label: "OpenAI totaal (exact)",
        tokens: openaiAgg.tokens,
        spend_eur: monthReal.spend,
        chats: openaiAgg.chats,
        currency: monthReal.currency || "USD",
        source: monthReal.source || "openai_api",
        cost_exact: true,
      });
    }
    const openaiLimitValue =
      Number.isFinite(openaiLimit?.limit) && openaiLimit.limit > 0 ? openaiLimit.limit : null;
    const openaiLimitCurrency = openaiLimit?.currency || "EUR";
    const creditAllowanceEur = getCreditAllowanceEur();
    let monthlyLimit = null;
    let monthlyLimitSource = "credits";
    const activeCustomersValue = Number.isFinite(activeCustomers) ? activeCustomers : null;
    const topupsThisMonthValue = Number.isFinite(topupsThisMonth) ? topupsThisMonth : null;

    const hasActiveCustomers =
      Number.isFinite(activeCustomersValue) && Number.isFinite(creditAllowanceEur) && creditAllowanceEur >= 0;
    const hasTopups = Number.isFinite(topupsThisMonthValue) && topupsThisMonthValue > 0;
    let computed = false;
    let total = 0;
    if (hasActiveCustomers) {
      total += activeCustomersValue * creditAllowanceEur;
      computed = true;
    }
    if (hasTopups) {
      total += topupsThisMonthValue;
      computed = true;
    }
    if (computed) {
      monthlyLimit = Math.round(total * 100) / 100;
    } else {
      monthlyLimit = parseLimit(process.env.API_MONTHLY_LIMIT_EUR);
      if (monthlyLimit) monthlyLimitSource = "env";
    }
    const remaining = Number.isFinite(monthlyLimit)
      ? Math.max(0, Math.round((monthlyLimit - internalSpend) * 100) / 100)
      : null;

    const hasOpenAiCostsKey = Boolean(getOpenAICostsKey() || getOpenAIApiKey());
    const openAiOrgId = String(process.env.OPENAI_ORG_ID || process.env.OPENAI_ORGANIZATION || "").trim();
    const fxNote =
      monthReal?.fx_rate && monthReal.currency === "EUR" ? "OpenAI kosten omgerekend van USD naar EUR." : null;
    const exactCostsNote = monthReal
      ? ["Exacte kosten beschikbaar voor OpenAI (totaal).", fxNote].filter(Boolean).join(" ")
      : [
          "Exacte kosten nog niet beschikbaar voor OpenAI.",
          !hasOpenAiCostsKey ? "OPENAI_COSTS_KEY ontbreekt." : null,
          !openAiOrgId ? "OPENAI_ORG_ID ontbreekt." : null,
        ]
          .filter(Boolean)
          .join(" ");

    return json(res, 200, {
      ok: true,
      currency: "EUR",
      month: {
        chats: rowCount,
        tokens: monthTokens,
        spend_eur: null,
        spend_internal_eur: Math.round(internalSpend * 100) / 100,
        openai_chats: openaiAgg.chats,
        openai_tokens: openaiAgg.tokens,
        remaining_eur: remaining,
        since: monthIso,
      },
      month_real: monthReal,
      openai_limit: openaiLimitValue
        ? {
            amount: openaiLimitValue,
            currency: openaiLimitCurrency,
            source: openaiLimit?.source || "openai_subscription",
          }
        : null,
      models,
      limits: {
        monthly_eur: monthlyLimit,
        source: monthlyLimitSource,
        credit_allowance_eur: creditAllowanceEur,
        topups_this_month_eur: topupsThisMonthValue,
        active_customers: activeCustomersValue,
      },
      tokens_per_eur: tokensPerEur,
      note: exactCostsNote,
    });
  } catch (e) {
    return publicError(res, 500, "API usage ophalen mislukt.", e);
  }
};
