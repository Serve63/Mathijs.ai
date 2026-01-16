// Vercel Serverless Function: Staff customer management
//
// Requires Vercel env var:
// - SUPABASE_SERVICE_ROLE_KEY
//
// Auth: expects `Authorization: Bearer <supabase_access_token>`

const { getBearerToken, getClientIp, json, publicError, rateLimit, rateLimitHeaders, readJson } = require("../_lib/security");
const { SUPABASE_URL, getUserFromAccessToken } = require("../_lib/supabase");
const { isStaffUser } = require("../_lib/staff");
const { adminRestCount } = require("../_lib/supabaseAdmin");
const { COUNTRY_LABELS } = require("../_lib/geo");

const STAFF_WINDOW_MS = 60_000;
const STAFF_LIMIT = 120;
const TOKENS_PER_CHAT = 1;

function getTokensPerEur() {
  const tokensPerEur = Number(process.env.TOPUP_TOKENS_PER_EUR || 100);
  if (!Number.isFinite(tokensPerEur) || tokensPerEur <= 0) return 100;
  return Math.floor(tokensPerEur);
}

function parseLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function startOfDayUtc(now) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfMonthUtc(now) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function startOfYearUtc(now) {
  return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
}

async function countChatsSince(iso) {
  const query = `messages?select=id&role=eq.user&created_at=gte.${encodeURIComponent(iso)}&limit=1`;
  return adminRestCount(query);
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

function normalizeCustomerFromUser(u) {
  const appMeta = u?.app_metadata || {};
  const userMeta = u?.user_metadata || {};
  const email = u?.email || "";
  const name =
    (typeof userMeta.full_name === "string" && userMeta.full_name.trim()) ||
    (typeof userMeta.name === "string" && userMeta.name.trim()) ||
    (typeof userMeta.username === "string" && userMeta.username.trim()) ||
    (email ? email.split("@")[0] : "Onbekend");
  const provinceId =
    (typeof userMeta.province_id === "string" && userMeta.province_id.trim()) ||
    (typeof userMeta.province === "string" && userMeta.province.trim()) ||
    null;
  const geoLabel = typeof userMeta.geo_label === "string" ? userMeta.geo_label.trim() : "";
  const geoRegion = typeof userMeta.geo_region === "string" ? userMeta.geo_region.trim() : "";
  const geoCountry = typeof userMeta.geo_country === "string" ? userMeta.geo_country.trim() : "";
  const geoCountryLabel = COUNTRY_LABELS[geoCountry] || geoCountry;
  const locationLabel =
    geoLabel ||
    [geoRegion, geoCountryLabel].filter(Boolean).join(", ") ||
    geoCountryLabel ||
    null;
  const totalPaidRaw = Number(appMeta.total_paid_eur || 0);
  const totalPaidEur = Number.isFinite(totalPaidRaw) ? totalPaidRaw : 0;
  const lastPaidRaw = Number(appMeta.last_payment_amount_eur || 0);
  const lastPaidEur = Number.isFinite(lastPaidRaw) ? lastPaidRaw : 0;
  return {
    id: u?.id,
    email,
    name,
    created_at: u?.created_at,
    last_sign_in_at: u?.last_sign_in_at,
    cancelled_at: appMeta.cancelled_at || null,
    free_months: Number(appMeta.free_months || 0),
    lifetime_free: Boolean(appMeta.lifetime_free) || appMeta.plan === "lifetime",
    plan: appMeta.plan || "free",
    subscribed_at: appMeta.subscribed_at || null,
    last_payment_at: appMeta.last_payment_at || null,
    last_payment_amount_eur: lastPaidEur,
    total_paid_eur: totalPaidEur,
    province_id: provinceId,
    location_label: locationLabel,
  };
}

module.exports = async (req, res) => {
  try {
    const { getSupabaseServiceRoleKey } = require("../_lib/env");
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
    const rate = rateLimit({ key: `staff:ip:${ip}`, limit: STAFF_LIMIT, windowMs: STAFF_WINDOW_MS });
    if (!rate.ok) {
      return json(res, 429, { error: "Te veel verzoeken. Probeer later opnieuw." }, rateLimitHeaders(rate, STAFF_LIMIT));
    }

    const user = await getUserFromAccessToken(token);
    if (!user?.id || !user?.email) return json(res, 401, { error: "Unauthorized" });
    const confirmedAt = user?.email_confirmed_at || user?.confirmed_at;
    if (!confirmedAt) return json(res, 403, { error: "Forbidden (email not verified)" });
    if (!isStaffUser(user)) return json(res, 403, { error: "Forbidden (not staff)" });

    const url = new URL(req.url, "http://localhost");
    const actionFromQuery = (url.searchParams.get("action") || "").toLowerCase();

    if (req.method === "GET") {
      if (actionFromQuery === "api-usage") {
        const now = new Date();
        const todayIso = startOfDayUtc(now).toISOString();
        const monthIso = startOfMonthUtc(now).toISOString();
        const yearIso = startOfYearUtc(now).toISOString();

        const [countToday, countMonth, countYear] = await Promise.all([
          countChatsSince(todayIso),
          countChatsSince(monthIso),
          countChatsSince(yearIso),
        ]);

        const tokensPerEur = getTokensPerEur();
        const eurPerChat = TOKENS_PER_CHAT / tokensPerEur;
        const toEur = (count) => Math.round(count * eurPerChat * 100) / 100;

        const limits = {
          daily_eur: parseLimit(process.env.API_DAILY_LIMIT_EUR),
          monthly_eur: parseLimit(process.env.API_MONTHLY_LIMIT_EUR),
          yearly_eur: parseLimit(process.env.API_YEARLY_LIMIT_EUR),
        };

        return json(res, 200, {
          ok: true,
          currency: "EUR",
          tokens_per_chat: TOKENS_PER_CHAT,
          tokens_per_eur: tokensPerEur,
          usage: {
            today: { chats: countToday, spend_eur: toEur(countToday), since: todayIso },
            month: { chats: countMonth, spend_eur: toEur(countMonth), since: monthIso },
            year: { chats: countYear, spend_eur: toEur(countYear), since: yearIso },
          },
          limits,
          note: "Schatting op basis van chatverzoeken (TOKENS_PER_CHAT).",
        });
      }

      // Return all customers from Supabase Auth users (no DB table needed)
      // Note: Supabase admin list is paginated. We pull first 1000 for now.
      const out = [];
      let page = 1;
      const perPage = 200;
      while (page <= 5) {
        const resp = await supabaseAuthAdmin(`users?page=${page}&per_page=${perPage}`, {
          method: "GET",
          accessKey: serviceRoleKey,
        });
        const users = resp?.users || [];
        users.forEach((u) => out.push(normalizeCustomerFromUser(u)));
        if (users.length < perPage) break;
        page += 1;
      }
      // newest first
      out.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
      return json(res, 200, { customers: out });
    }

    if (req.method === "POST") {
      const body = await readJson(req);
      const action = body?.action;

      const id = body?.id;
      if (!id) return json(res, 400, { error: "Missing id" });

      if (action === "grant_free_months") {
        const months = Number(body?.months || 0);
        if (!Number.isFinite(months) || months <= 0) return json(res, 400, { error: "Invalid months" });

        // Read user to get current metadata
        const u = await supabaseAuthAdmin(`users/${encodeURIComponent(id)}`, {
          method: "GET",
          accessKey: serviceRoleKey,
        });
        const current = Number(u?.user?.app_metadata?.free_months || 0);
        const next = current + months;

        await supabaseAuthAdmin(`users/${encodeURIComponent(id)}`, {
          method: "PUT",
          accessKey: serviceRoleKey,
          body: { app_metadata: { ...(u?.user?.app_metadata || {}), free_months: next } },
        });
        return json(res, 200, { ok: true, free_months: next });
      }

      if (action === "cancel_subscription") {
        const nowIso = new Date().toISOString();
        const u = await supabaseAuthAdmin(`users/${encodeURIComponent(id)}`, {
          method: "GET",
          accessKey: serviceRoleKey,
        });
        await supabaseAuthAdmin(`users/${encodeURIComponent(id)}`, {
          method: "PUT",
          accessKey: serviceRoleKey,
          body: { app_metadata: { ...(u?.user?.app_metadata || {}), cancelled_at: nowIso } },
        });
        return json(res, 200, { ok: true, cancelled_at: nowIso });
      }

      if (action === "set_lifetime_free") {
        const enabled = Boolean(body?.enabled);
        const u = await supabaseAuthAdmin(`users/${encodeURIComponent(id)}`, {
          method: "GET",
          accessKey: serviceRoleKey,
        });
        await supabaseAuthAdmin(`users/${encodeURIComponent(id)}`, {
          method: "PUT",
          accessKey: serviceRoleKey,
          body: { app_metadata: { ...(u?.user?.app_metadata || {}), lifetime_free: enabled } },
        });
        return json(res, 200, { ok: true, lifetime_free: enabled });
      }

      if (action === "delete_customer") {
        await supabaseAuthAdmin(`users/${encodeURIComponent(id)}`, {
          method: "DELETE",
          accessKey: serviceRoleKey,
        });
        return json(res, 200, { ok: true });
      }

      return json(res, 400, { error: "Unknown action" });
    }

    return json(res, 405, { error: "Method not allowed" });
  } catch (e) {
    return publicError(res, 500, "Verzoek mislukt. Probeer later opnieuw.", e);
  }
};
