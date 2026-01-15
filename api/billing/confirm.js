// Vercel Serverless Function: Confirm Stripe Checkout session and mark subscription in Supabase Auth metadata
//
// Requires Vercel env vars:
// - STRIPE_SECRET_KEY
// - SUPABASE_SERVICE_ROLE_KEY
//
// Auth: expects `Authorization: Bearer <supabase_access_token>`

const { getBearerToken, getClientIp, json, publicError, rateLimit, rateLimitHeaders, readJson } = require("../_lib/security");
const { SUPABASE_URL, getUserFromAccessToken } = require("../_lib/supabase");

const CONFIRM_WINDOW_MS = 60_000;
const CONFIRM_LIMIT = 20;

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

async function stripeGet(path, secretKey) {
  const resp = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const text = await resp.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!resp.ok) {
    const msg = payload?.error?.message || text || "Stripe request failed";
    throw new Error(`stripe_failed:${resp.status}:${msg}`);
  }
  return payload;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) return json(res, 500, { error: "Missing STRIPE_SECRET_KEY" });

    const { getSupabaseServiceRoleKey } = require("../_lib/env");
    const serviceRoleKey = getSupabaseServiceRoleKey();
    if (!serviceRoleKey) return json(res, 500, { error: "Missing SUPABASE_SERVICE_ROLE_KEY or supabase_service_role_key" });

    const token = getBearerToken(req);
    if (!token) return json(res, 401, { error: "Missing Authorization Bearer token" });

    const ip = getClientIp(req);
    const rate = rateLimit({ key: `billing_confirm:ip:${ip}`, limit: CONFIRM_LIMIT, windowMs: CONFIRM_WINDOW_MS });
    if (!rate.ok) {
      return json(res, 429, { error: "Te veel verzoeken. Probeer later opnieuw." }, rateLimitHeaders(rate, CONFIRM_LIMIT));
    }

    const user = await getUserFromAccessToken(token);
    const userId = user?.id;
    const email = (user?.email || "").trim();
    if (!userId || !email) return json(res, 401, { error: "Unauthorized" });

    const body = await readJson(req);
    const sessionId = typeof body?.session_id === "string" ? body.session_id.trim() : "";
    const subscriptionId = typeof body?.subscription_id === "string" ? body.subscription_id.trim() : "";
    if (!sessionId && !subscriptionId) return json(res, 400, { error: "Missing session_id or subscription_id" });

    let subscription = null;
    let customerId = null;
    if (subscriptionId) {
      subscription = await stripeGet(`subscriptions/${encodeURIComponent(subscriptionId)}`, stripeSecretKey);
      customerId = subscription?.customer || null;
      if (subscription?.metadata?.supabase_user_id && subscription.metadata.supabase_user_id !== userId) {
        return json(res, 403, { error: "Subscription does not belong to current user" });
      }
    } else {
      const session = await stripeGet(`checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=subscription`, stripeSecretKey);
      if (session?.client_reference_id !== userId) {
        return json(res, 403, { error: "Session does not belong to current user" });
      }
      subscription = session?.subscription || null;
      customerId = session?.customer || null;
    }

    const subStatus = subscription?.status || null;
    const isActive = subStatus === "active" || subStatus === "trialing";
    if (!isActive) {
      return json(res, 200, { ok: false, status: subStatus || null });
    }

    const nowIso = new Date().toISOString();
    const nextAppMeta = {
      ...(user?.app_metadata || {}),
      plan: "standard",
      cancelled_at: null,
      stripe_customer_id: customerId || null,
      stripe_subscription_id: subscription?.id || null,
      subscribed_at: nowIso,
    };

    await supabaseAuthAdmin(`users/${encodeURIComponent(userId)}`, {
      method: "PUT",
      accessKey: serviceRoleKey,
      body: { app_metadata: nextAppMeta },
    });

    return json(res, 200, { ok: true, status: subStatus, plan: "standard" });
  } catch (e) {
    return publicError(res, 500, "Bevestigen mislukt. Probeer later opnieuw.", e);
  }
};
