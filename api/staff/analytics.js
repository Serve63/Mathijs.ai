// Vercel Serverless Function: staff analytics (real data)
//
// Requires env vars:
// - SUPABASE_SERVICE_ROLE_KEY
//
// Auth: expects `Authorization: Bearer <supabase_access_token>`

const { getBearerToken, getClientIp, json, publicError, rateLimit, rateLimitHeaders } = require("../_lib/security");
const { SUPABASE_URL, getUserFromAccessToken } = require("../_lib/supabase");
const { isStaffUser } = require("../_lib/staff");
const { adminRestFetch } = require("../_lib/supabaseAdmin");
const { getOpenAIApiKey, getOpenAICostsKey, getSupabaseServiceRoleKey } = require("../_lib/env");

const STAFF_WINDOW_MS = 60_000;
const STAFF_LIMIT = 120;
const BASELINE_DATE_UTC = new Date(Date.UTC(2026, 0, 1));
const TOKENS_PER_CHAT = 1;
const DEFAULT_TOKENS_PER_EUR = 100;
const DEFAULT_CREDIT_ALLOWANCE_EUR = 10;
const DEFAULT_FETCH_TIMEOUT_MS = 4_000;
const DEFAULT_FX_TIMEOUT_MS = 2_000;
let cachedUsdToEurRate = null;
let cachedFxAt = 0;

function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const merged = { ...options, signal: controller.signal };
  return fetch(url, merged).finally(() => clearTimeout(timeoutId));
}

function getRequestedOpenAiCurrency() {
  const raw = String(process.env.OPENAI_COSTS_CURRENCY || "EUR").trim();
  return raw ? raw.toUpperCase() : "EUR";
}

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
      const resp = await fetchWithTimeout(url, {}, DEFAULT_FX_TIMEOUT_MS);
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

function getOpenAiProjectId() {
  const raw = String(process.env.OPENAI_PROJECT_ID || "").trim();
  return raw || null;
}

function buildOpenAiHeaders({ apiKey, orgId, projectId }) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (orgId) headers["OpenAI-Organization"] = orgId;
  if (projectId) headers["OpenAI-Project"] = projectId;
  return headers;
}

function extractOpenAiAmount(row) {
  const candidates = [
    row?.amount?.value,
    row?.amount?.usd,
    row?.amount,
    row?.value,
    row?.total,
    row?.cost,
  ];
  for (const candidate of candidates) {
    const num = Number(candidate);
    if (Number.isFinite(num)) return num;
  }
  return 0;
}

async function fetchOpenAiCostsBucketsWithHeaders({ baseUrl, headers }) {
  let url = baseUrl;
  let pageCount = 0;
  let currency = null;
  const buckets = [];

  while (url) {
    try {
      const resp = await fetchWithTimeout(url, { method: "GET", headers });
      if (!resp.ok) break;
      const payload = await resp.json().catch(() => ({}));
      if (Array.isArray(payload?.data)) {
        payload.data.forEach((bucket) => {
          const start = Number(bucket?.start_time);
          if (!Number.isFinite(start)) return;
          let amount = 0;
          if (Array.isArray(bucket?.results)) {
            bucket.results.forEach((row) => {
              amount += extractOpenAiAmount(row);
              if (!currency) {
                const rowCurrency = row?.amount?.currency;
                if (typeof rowCurrency === "string" && rowCurrency.trim()) {
                  currency = rowCurrency.trim().toUpperCase();
                }
              }
            });
          } else {
            amount += extractOpenAiAmount(bucket);
          }
          buckets.push({ start_time: start, amount });
        });
      }

      if (!currency && typeof payload?.currency === "string" && payload.currency.trim()) {
        currency = payload.currency.trim().toUpperCase();
      }

      if (payload?.has_more && payload?.next_page) {
        const nextUrl = new URL(baseUrl);
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

  if (!buckets.length) return null;
  return { currency: currency || "USD", buckets };
}

async function fetchOpenAiCostsBuckets({ startTime, endTime }) {
  const apiKey = getOpenAICostsKey() || getOpenAIApiKey();
  if (!apiKey) return null;

  const orgId = String(process.env.OPENAI_ORG_ID || process.env.OPENAI_ORGANIZATION || "").trim();
  const projectId = getOpenAiProjectId();
  const variants = [];
  if (orgId) variants.push({ orgId, projectId: null });
  if (orgId && projectId) variants.push({ orgId, projectId });
  if (!orgId && projectId) variants.push({ orgId: null, projectId });
  variants.push({ orgId: null, projectId: null });

  const startSec = Math.floor(new Date(startTime).getTime() / 1000);
  const endSec = Math.floor(new Date(endTime).getTime() / 1000);
  const baseUrl = `https://api.openai.com/v1/organization/costs?start_time=${startSec}&end_time=${endSec}`;

  const attempts = await Promise.allSettled(
    variants.map(async (variant) => {
      const headers = buildOpenAiHeaders({ apiKey, orgId: variant.orgId, projectId: variant.projectId });
      const result = await fetchOpenAiCostsBucketsWithHeaders({ baseUrl, headers });
      if (!result?.buckets?.length) return null;
      const total = result.buckets.reduce((sum, bucket) => sum + Number(bucket?.amount || 0), 0);
      return { result, total };
    })
  );

  let best = null;
  let bestTotal = 0;
  attempts.forEach((attempt) => {
    if (attempt.status !== "fulfilled" || !attempt.value) return;
    if (!best || attempt.value.total > bestTotal) {
      best = attempt.value.result;
      bestTotal = attempt.value.total;
    }
  });

  return best;
}

async function convertOpenAiAmount(amount, currency) {
  const requestedCurrency = getRequestedOpenAiCurrency();
  let finalAmount = Number(amount || 0);
  let finalCurrency = (currency || "USD").toUpperCase();
  if (requestedCurrency && requestedCurrency !== finalCurrency) {
    if (requestedCurrency === "EUR" && finalCurrency === "USD") {
      const fxRate = await getUsdToEurRate();
      if (Number.isFinite(fxRate) && fxRate > 0) {
        finalAmount = finalAmount * fxRate;
        finalCurrency = "EUR";
      }
    }
  }
  return { amount: finalAmount, currency: finalCurrency };
}

async function fetchOpenAiCostsByDate(startIso, endIso) {
  const result = await fetchOpenAiCostsBuckets({ startTime: startIso, endTime: endIso });
  if (!result?.buckets?.length) return null;
  const out = new Map();
  for (const bucket of result.buckets) {
    const startMs = Number(bucket?.start_time) * 1000;
    if (!Number.isFinite(startMs)) continue;
    const dateKey = toDateKey(startOfDayUtc(new Date(startMs)));
    const converted = await convertOpenAiAmount(bucket.amount || 0, result.currency);
    const existing = out.get(dateKey) || 0;
    out.set(dateKey, existing + converted.amount);
  }
  return out;
}

function getTokensPerEur() {
  const tokensPerEur = Number(process.env.TOPUP_TOKENS_PER_EUR || DEFAULT_TOKENS_PER_EUR);
  if (!Number.isFinite(tokensPerEur) || tokensPerEur <= 0) return DEFAULT_TOKENS_PER_EUR;
  return Math.floor(tokensPerEur);
}

function getCreditAllowanceEur() {
  const value = Number(process.env.CREDIT_ALLOWANCE_EUR || DEFAULT_CREDIT_ALLOWANCE_EUR);
  if (!Number.isFinite(value) || value < 0) return DEFAULT_CREDIT_ALLOWANCE_EUR;
  return Math.round(value * 100) / 100;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function startOfDayUtc(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toDateKey(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
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

function getCustomerStartDate(user) {
  const appMeta = user?.app_metadata || {};
  const lifetime = Boolean(appMeta.lifetime_free) || appMeta.plan === "lifetime";
  const subscribedAt = parseDate(appMeta.subscribed_at);
  if (subscribedAt) return subscribedAt;
  const lastPaidAt = parseDate(appMeta.last_payment_at);
  if (lastPaidAt) return lastPaidAt;
  if (lifetime) return parseDate(user?.created_at);
  return null;
}

function getCustomerCancelDate(user) {
  const appMeta = user?.app_metadata || {};
  return parseDate(appMeta.cancelled_at);
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

async function fetchBillingEvents() {
  const events = [];
  const limit = 500;
  const maxPages = 5;
  const baselineIso = BASELINE_DATE_UTC.toISOString();
  let lastPaidAt = null;
  let lastId = null;
  let pageCount = 0;
  while (pageCount < maxPages) {
    pageCount += 1;
    const filters = [];
    if (lastPaidAt) {
      const cursor = `or=(paid_at.gt.${lastPaidAt},and(paid_at.eq.${lastPaidAt},id.gt.${lastId}))`;
      filters.push(cursor);
    } else {
      filters.push(`paid_at=gte.${encodeURIComponent(baselineIso)}`);
    }
    const query = [
      "billing_events?select=id,provider,provider_payment_id,event_type,amount_eur,currency,paid_at",
      ...filters,
      "order=paid_at.asc,id.asc",
      `limit=${limit}`,
    ]
      .filter(Boolean)
      .join("&");
    const rows = await adminRestFetch(query, { method: "GET" });
    if (!Array.isArray(rows) || rows.length === 0) break;
    rows.forEach((row) => events.push(row));
    if (rows.length < limit) break;
    const lastRow = rows[rows.length - 1];
    lastPaidAt = encodeURIComponent(String(lastRow?.paid_at || ""));
    lastId = Number(lastRow?.id || 0);
    if (!lastPaidAt || !Number.isFinite(lastId)) break;
  }
  return events;
}

async function fetchUserMessageCountsByDay(baselineIso) {
  const counts = new Map();
  let totalChats = 0;
  const limit = 500;
  const maxPages = 5;
  let lastCreatedAt = null;
  let lastId = null;
  let pageCount = 0;
  while (pageCount < maxPages) {
    pageCount += 1;
    const filters = [];
    if (lastCreatedAt) {
      const cursor = `or=(created_at.gt.${lastCreatedAt},and(created_at.eq.${lastCreatedAt},id.gt.${lastId}))`;
      filters.push(cursor);
    } else {
      filters.push(`created_at=gte.${encodeURIComponent(baselineIso)}`);
    }
    const query = [
      "messages?select=id,created_at&role=eq.user",
      ...filters,
      "order=created_at.asc,id.asc",
      `limit=${limit}`,
    ]
      .filter(Boolean)
      .join("&");
    const rows = await adminRestFetch(query, { method: "GET" });
    if (!Array.isArray(rows) || rows.length === 0) break;
    rows.forEach((row) => {
      const createdAt = parseDate(row?.created_at);
      if (!createdAt || createdAt < BASELINE_DATE_UTC) return;
      const dateKey = toDateKey(startOfDayUtc(createdAt));
      counts.set(dateKey, (counts.get(dateKey) || 0) + 1);
      totalChats += 1;
    });
    if (rows.length < limit) break;
    const lastRow = rows[rows.length - 1];
    lastCreatedAt = encodeURIComponent(String(lastRow?.created_at || ""));
    lastId = Number(lastRow?.id || 0);
    if (!lastCreatedAt || !Number.isFinite(lastId)) break;
  }
  return { counts, totalChats };
}

async function fetchUsageStatsByDay(baselineIso) {
  const counts = new Map();
  const openai = new Map();
  const other = new Map();
  let totalChats = 0;
  const limit = 500;
  const maxPages = 5;
  let lastCreatedAt = null;
  let lastId = null;
  let pageCount = 0;
  while (pageCount < maxPages) {
    pageCount += 1;
    const filters = [];
    if (lastCreatedAt) {
      const cursor = `or=(created_at.gt.${lastCreatedAt},and(created_at.eq.${lastCreatedAt},id.gt.${lastId}))`;
      filters.push(cursor);
    } else {
      filters.push(`created_at=gte.${encodeURIComponent(baselineIso)}`);
    }
    const query = [
      "api_usage_events?select=id,provider,cost_eur,created_at",
      ...filters,
      "order=created_at.asc,id.asc",
      `limit=${limit}`,
    ]
      .filter(Boolean)
      .join("&");
    const rows = await adminRestFetch(query, { method: "GET" });
    if (!Array.isArray(rows) || rows.length === 0) break;
    rows.forEach((row) => {
      const createdAt = parseDate(row?.created_at);
      if (!createdAt || createdAt < BASELINE_DATE_UTC) return;
      const dateKey = toDateKey(startOfDayUtc(createdAt));
      counts.set(dateKey, (counts.get(dateKey) || 0) + 1);
      totalChats += 1;
      const amount = Number(row?.cost_eur || 0);
      if (!Number.isFinite(amount)) return;
      if (String(row?.provider || "").toLowerCase() === "openai") {
        openai.set(dateKey, Math.round(((openai.get(dateKey) || 0) + amount) * 100) / 100);
      } else {
        other.set(dateKey, Math.round(((other.get(dateKey) || 0) + amount) * 100) / 100);
      }
    });
    if (rows.length < limit) break;
    const lastRow = rows[rows.length - 1];
    lastCreatedAt = encodeURIComponent(String(lastRow?.created_at || ""));
    lastId = Number(lastRow?.id || 0);
    if (!lastCreatedAt || !Number.isFinite(lastId)) break;
  }
  return { counts, openai, other, totalChats };
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return json(res, 405, { error: "Method not allowed" });
    }

    const serviceRoleKey = getSupabaseServiceRoleKey();
    if (!serviceRoleKey) {
      return json(res, 500, {
        error:
          "Missing SUPABASE_SERVICE_ROLE_KEY or supabase_service_role_key. Add it in Vercel project settings (Environment Variables) and redeploy.",
      });
    }

    const token = getBearerToken(req);
    if (!token) return json(res, 401, { error: "Missing Authorization Bearer token" });

    const ip = getClientIp(req);
    const rate = rateLimit({ key: `staff_analytics:ip:${ip}`, limit: STAFF_LIMIT, windowMs: STAFF_WINDOW_MS });
    if (!rate.ok) {
      return json(res, 429, { error: "Te veel verzoeken. Probeer later opnieuw." }, rateLimitHeaders(rate, STAFF_LIMIT));
    }

    const user = await getUserFromAccessToken(token);
    if (!user?.id || !user?.email) return json(res, 401, { error: "Unauthorized" });
    const confirmedAt = user?.email_confirmed_at || user?.confirmed_at;
    if (!confirmedAt) return json(res, 403, { error: "Forbidden (email not verified)" });
    if (!isStaffUser(user)) return json(res, 403, { error: "Forbidden (not staff)" });

    const baselineIso = BASELINE_DATE_UTC.toISOString();

    // Run all fetches in parallel for speed
    const [usersResult, usageResult, billingResult] = await Promise.allSettled([
      fetchAllUsers(serviceRoleKey),
      fetchUsageStatsByDay(baselineIso).catch((e) => {
        const isMissingTable = e?.statusCode === 404 || String(e?.detail || "").includes("api_usage_events");
        if (!isMissingTable) throw e;
        return fetchUserMessageCountsByDay(baselineIso);
      }),
      fetchBillingEvents(),
    ]);

    // Handle users
    const users = usersResult.status === "fulfilled" ? usersResult.value : [];

    // Handle usage stats
    let totalChats = 0;
    let chatCountsByDate = new Map();
    let spendByDate = null;
    let openaiExactByDate = null;
    if (usageResult.status === "fulfilled" && usageResult.value) {
      chatCountsByDate = usageResult.value.counts || new Map();
      totalChats = usageResult.value.totalChats || 0;
      if (usageResult.value.openai || usageResult.value.other) {
        spendByDate = { openai: usageResult.value.openai || new Map(), other: usageResult.value.other || new Map() };
      }
    }

    // Handle billing events
    let events = [];
    if (billingResult.status === "fulfilled") {
      events = billingResult.value || [];
    } else {
      const e = billingResult.reason;
      const isMissingTable = e?.statusCode === 404 || String(e?.detail || "").includes("billing_events");
      if (isMissingTable) {
        return json(res, 500, {
          error: "Billing events tabel ontbreekt. Run migrations/create_billing_events.sql in Supabase.",
        });
      }
      // Log but continue with empty events
      console.error("Failed to fetch billing events:", e);
    }

    const payingUsers = users.filter(isPayingCustomer);

    const knownPaymentIds = new Set(
      events.map((event) => String(event?.provider_payment_id || "").trim()).filter(Boolean)
    );

    const legacyEvents = [];
    payingUsers.forEach((u) => {
      const appMeta = u?.app_metadata || {};
      const lastPaymentId =
        (typeof appMeta.last_payment_id === "string" && appMeta.last_payment_id.trim()) ||
        (typeof appMeta.mollie_payment_id === "string" && appMeta.mollie_payment_id.trim()) ||
        "";
      if (!lastPaymentId || knownPaymentIds.has(lastPaymentId)) return;
      const paidAt = parseDate(appMeta.last_payment_at);
      const amountEur = Number(appMeta.last_payment_amount_eur || 0);
      if (!paidAt || !Number.isFinite(amountEur) || amountEur <= 0) return;
      legacyEvents.push({
        provider: "legacy",
        provider_payment_id: lastPaymentId,
        event_type: "subscription",
        amount_eur: amountEur,
        currency: "EUR",
        paid_at: paidAt.toISOString(),
      });
    });

    events = events.concat(legacyEvents);

    const paymentByDate = new Map();
    events.forEach((event) => {
      const paidAt = parseDate(event?.paid_at);
      if (!paidAt) return;
      if (paidAt < BASELINE_DATE_UTC) return;
      const dateKey = toDateKey(startOfDayUtc(paidAt));
      const amount = Number(event?.amount_eur || 0);
      const entry = paymentByDate.get(dateKey) || { revenue: 0 };
      entry.revenue += Number.isFinite(amount) ? amount : 0;
      paymentByDate.set(dateKey, entry);
    });

    const subsByDate = new Map();
    const activeDiff = new Map();
    let baselineActiveCount = 0;
    let earliestDate = null;

    payingUsers.forEach((u) => {
      const start = getCustomerStartDate(u);
      if (!start) return;
      const startDay = startOfDayUtc(start);
      const cancelDate = getCustomerCancelDate(u);
      const cancelDay = cancelDate ? startOfDayUtc(cancelDate) : null;
      if (cancelDay && cancelDay < BASELINE_DATE_UTC) {
        return;
      }
      if (startDay < BASELINE_DATE_UTC) {
        baselineActiveCount += 1;
        if (cancelDay) {
          const nextDay = addDays(cancelDay, 1);
          if (nextDay >= BASELINE_DATE_UTC) {
            const nextKey = toDateKey(nextDay);
            activeDiff.set(nextKey, (activeDiff.get(nextKey) || 0) - 1);
          }
        }
        return;
      }
      const startKey = toDateKey(startDay);
      subsByDate.set(startKey, (subsByDate.get(startKey) || 0) + 1);
      activeDiff.set(startKey, (activeDiff.get(startKey) || 0) + 1);

      if (cancelDay) {
        const nextDay = addDays(cancelDay, 1);
        if (nextDay >= BASELINE_DATE_UTC) {
          const nextKey = toDateKey(nextDay);
          activeDiff.set(nextKey, (activeDiff.get(nextKey) || 0) - 1);
        }
      }

      if (!earliestDate || startDay < earliestDate) {
        earliestDate = startDay;
      }
    });

    events.forEach((event) => {
      const paidAt = parseDate(event?.paid_at);
      if (!paidAt) return;
      if (paidAt < BASELINE_DATE_UTC) return;
      const paidDay = startOfDayUtc(paidAt);
      if (!earliestDate || paidDay < earliestDate) {
        earliestDate = paidDay;
      }
    });

    const now = new Date();
    const today = startOfDayUtc(now);
    const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    let startDate = earliestDate || BASELINE_DATE_UTC;
    if (startDate < BASELINE_DATE_UTC) startDate = BASELINE_DATE_UTC;
    if (startDate > today) startDate = today;
    if (startDate > monthStart) startDate = monthStart;

    const points = [];
    let cursor = new Date(startDate);
    let activeCount = baselineActiveCount;
    const recentCutoff = addDays(today, -2);
    // Use internal tracking only (OpenAI costs API removed for speed)
    openaiExactByDate = null;

    while (cursor <= today) {
      const dateKey = toDateKey(cursor);
      activeCount += activeDiff.get(dateKey) || 0;
      const payment = paymentByDate.get(dateKey) || { revenue: 0 };
      const chats = chatCountsByDate.get(dateKey) || 0;
      const subs = subsByDate.get(dateKey) || 0;
      let spendEur = null;
      if (spendByDate || openaiExactByDate) {
        const otherSpend = spendByDate ? spendByDate.other.get(dateKey) || 0 : 0;
        const openaiUsageSpend = spendByDate ? spendByDate.openai.get(dateKey) || 0 : 0;
        const hasOpenAiExact = Boolean(openaiExactByDate && openaiExactByDate.size);
        const hasOpenAiExactForDay = hasOpenAiExact && openaiExactByDate.has(dateKey);
        const openaiExactSpend = hasOpenAiExactForDay ? openaiExactByDate.get(dateKey) || 0 : null;
        const isRecent = cursor >= recentCutoff;
        let openaiSpend = openaiUsageSpend;
        if (hasOpenAiExactForDay) {
          if (isRecent && openaiExactSpend <= 0 && openaiUsageSpend > 0) {
            openaiSpend = openaiUsageSpend;
          } else {
            openaiSpend = openaiExactSpend;
          }
        }
        spendEur = Math.round((otherSpend + openaiSpend) * 100) / 100;
      }
      points.push({
        date: dateKey,
        revenue: Number(payment.revenue.toFixed(2)),
        orders: chats,
        subs,
        active: Math.max(0, activeCount),
        spend_eur: Number.isFinite(spendEur) ? spendEur : null,
      });
      cursor = addDays(cursor, 1);
    }

    return json(res, 200, {
      ok: true,
      currency: "EUR",
      range: { from: toDateKey(startDate), to: toDateKey(today) },
      points,
      total_chats: totalChats,
      tokens_per_chat: TOKENS_PER_CHAT,
      tokens_per_eur: getTokensPerEur(),
      credit_allowance_eur: getCreditAllowanceEur(),
    });
  } catch (e) {
    return publicError(res, 500, "Analytics ophalen mislukt. Probeer later opnieuw.", e);
  }
};
