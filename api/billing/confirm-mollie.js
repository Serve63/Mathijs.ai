// Vercel Serverless Function: Confirm Mollie payment and mark subscription in Supabase Auth metadata
//
// Requires env vars:
// - MOLLIE_API_KEY
// - SUPABASE_SERVICE_ROLE_KEY
//
// Auth: expects `Authorization: Bearer <supabase_access_token>`

const { getBearerToken, getClientIp, json, publicError, rateLimit, rateLimitHeaders, readJson } = require("../_lib/security");
const { SUPABASE_URL, getUserFromAccessToken } = require("../_lib/supabase");

const CONFIRM_WINDOW_MS = 60_000;
const CONFIRM_LIMIT = 20;

async function mollieGet(path, apiKey) {
  const resp = await fetch(`https://api.mollie.com/v2/${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const text = await resp.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!resp.ok) {
    const msg = payload?.detail || payload?.error || payload?.message || text || "Mollie request failed";
    throw new Error(`mollie_failed:${resp.status}:${msg}`);
  }
  return payload;
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

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

    const mollieKey = String(process.env.MOLLIE_API_KEY || "").trim();
    if (!mollieKey) return json(res, 500, { error: "Missing MOLLIE_API_KEY" });

    const { getSupabaseServiceRoleKey } = require("../_lib/env");
    const serviceRoleKey = getSupabaseServiceRoleKey();
    if (!serviceRoleKey) return json(res, 500, { error: "Missing SUPABASE_SERVICE_ROLE_KEY" });

    const token = getBearerToken(req);
    if (!token) return json(res, 401, { error: "Missing Authorization Bearer token" });

    const ip = getClientIp(req);
    const rate = rateLimit({ key: `billing_mollie_confirm:ip:${ip}`, limit: CONFIRM_LIMIT, windowMs: CONFIRM_WINDOW_MS });
    if (!rate.ok) {
      return json(res, 429, { error: "Te veel verzoeken. Probeer later opnieuw." }, rateLimitHeaders(rate, CONFIRM_LIMIT));
    }

    const user = await getUserFromAccessToken(token);
    const userId = user?.id;
    const email = (user?.email || "").trim();
    if (!userId || !email) return json(res, 401, { error: "Unauthorized" });

    const body = await readJson(req);
    const paymentId = typeof body?.payment_id === "string" ? body.payment_id.trim() : "";
    if (!paymentId) return json(res, 400, { error: "Missing payment_id" });

    const payment = await mollieGet(`payments/${encodeURIComponent(paymentId)}`, mollieKey);
    if (payment?.metadata?.supabase_user_id && payment.metadata.supabase_user_id !== userId) {
      return json(res, 403, { error: "Payment does not belong to current user" });
    }

    const status = payment?.status || null;
    const isPaid = status === "paid";
    if (!isPaid) {
      return json(res, 200, { ok: false, status });
    }

    const nowIso = new Date().toISOString();
    const paidAt = payment?.paidAt || payment?.createdAt || nowIso;
    const currency = payment?.amount?.currency || "EUR";
    const amountValue = Number(payment?.amount?.value || 0);
    const amountEur = currency === "EUR" && Number.isFinite(amountValue) ? amountValue : 0;
    const previousTotalRaw = Number(user?.app_metadata?.total_paid_eur || 0);
    const previousTotal = Number.isFinite(previousTotalRaw) ? previousTotalRaw : 0;
    const lastPaymentId = user?.app_metadata?.last_payment_id || user?.app_metadata?.mollie_payment_id;
    const alreadyCounted = lastPaymentId === paymentId;
    const nextTotal = alreadyCounted ? previousTotal : previousTotal + amountEur;
    const nextAppMeta = {
      ...(user?.app_metadata || {}),
      plan: "standard",
      cancelled_at: null,
      mollie_payment_id: paymentId,
      last_payment_id: paymentId,
      last_payment_at: paidAt,
      last_payment_amount_eur: amountEur,
      total_paid_eur: nextTotal,
      subscribed_at: nowIso,
    };

    await supabaseAuthAdmin(`users/${encodeURIComponent(userId)}`, {
      method: "PUT",
      accessKey: serviceRoleKey,
      body: { app_metadata: nextAppMeta },
    });

    return json(res, 200, { ok: true, status: "paid", plan: "standard" });
  } catch (e) {
    return publicError(res, 500, "Bevestigen mislukt. Probeer later opnieuw.", e);
  }
};
