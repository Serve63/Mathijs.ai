// Vercel Serverless Function: staff analytics (real data)
//
// Requires env vars:
// - SUPABASE_SERVICE_ROLE_KEY
//
// Auth: expects `Authorization: Bearer <supabase_access_token>`

const { getBearerToken, getClientIp, json, publicError, rateLimit, rateLimitHeaders } = require("../_lib/security");
const { SUPABASE_URL, getUserFromAccessToken } = require("../_lib/supabase");
const { isStaffUser } = require("../_lib/staff");
const { adminRestFetch, adminRestCount } = require("../_lib/supabaseAdmin");
const { getSupabaseServiceRoleKey } = require("../_lib/env");

const STAFF_WINDOW_MS = 60_000;
const STAFF_LIMIT = 120;
const BASELINE_DATE_UTC = new Date(Date.UTC(2026, 0, 1));

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
  if (appMeta.lifetime_free || appMeta.plan === "lifetime") return true;
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
  const limit = 1000;
  let offset = 0;
  while (true) {
    const rows = await adminRestFetch(
      `billing_events?select=provider,provider_payment_id,event_type,amount_eur,currency,paid_at&order=paid_at.asc&limit=${limit}&offset=${offset}`,
      { method: "GET" }
    );
    if (!Array.isArray(rows) || rows.length === 0) break;
    rows.forEach((row) => events.push(row));
    if (rows.length < limit) break;
    offset += limit;
  }
  return events;
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

    const users = await fetchAllUsers(serviceRoleKey);
    const baselineIso = BASELINE_DATE_UTC.toISOString();
    const totalChats = await adminRestCount(
      `messages?select=id&role=eq.user&created_at=gte.${encodeURIComponent(baselineIso)}`
    );
    const payingUsers = users.filter(isPayingCustomer);

    let events = [];
    try {
      events = await fetchBillingEvents();
    } catch (e) {
      const isMissingTable = e?.statusCode === 404 || String(e?.detail || "").includes("billing_events");
      if (isMissingTable) {
        return json(res, 500, {
          error: "Billing events tabel ontbreekt. Run migrations/create_billing_events.sql in Supabase.",
        });
      }
      throw e;
    }

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
      const entry = paymentByDate.get(dateKey) || { revenue: 0, orders: 0 };
      entry.revenue += Number.isFinite(amount) ? amount : 0;
      entry.orders += 1;
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

    const today = startOfDayUtc(new Date());
    let startDate = earliestDate || BASELINE_DATE_UTC;
    if (startDate < BASELINE_DATE_UTC) startDate = BASELINE_DATE_UTC;
    if (startDate > today) startDate = today;

    const points = [];
    let cursor = new Date(startDate);
    let activeCount = baselineActiveCount;

    while (cursor <= today) {
      const dateKey = toDateKey(cursor);
      activeCount += activeDiff.get(dateKey) || 0;
      const payment = paymentByDate.get(dateKey) || { revenue: 0, orders: 0 };
      const subs = subsByDate.get(dateKey) || 0;
      points.push({
        date: dateKey,
        revenue: Number(payment.revenue.toFixed(2)),
        orders: payment.orders,
        subs,
        active: Math.max(0, activeCount),
      });
      cursor = addDays(cursor, 1);
    }

    return json(res, 200, {
      ok: true,
      currency: "EUR",
      range: { from: toDateKey(startDate), to: toDateKey(today) },
      points,
      total_chats: totalChats,
    });
  } catch (e) {
    return publicError(res, 500, "Analytics ophalen mislukt. Probeer later opnieuw.", e);
  }
};
