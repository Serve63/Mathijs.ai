// Vercel Serverless Function: Confirm a Stripe top-up session and credit tokens
//
// Requires Vercel env vars:
// - STRIPE_SECRET_KEY
// - SUPABASE_SERVICE_ROLE_KEY
//
// Auth: expects `Authorization: Bearer <supabase_access_token>`

const { getBearerToken, getClientIp, json, publicError, rateLimit, rateLimitHeaders, readJson } = require("../_lib/security");
const { SUPABASE_URL, getUserFromAccessToken } = require("../_lib/supabase");

const WINDOW_MS = 60_000;
const LIMIT = 30;

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
    if (!token) return json(res, 401, { error: "Unauthorized" });

    const user = await getUserFromAccessToken(token);
    const userId = user?.id;
    if (!userId) return json(res, 401, { error: "Unauthorized" });

    const ip = getClientIp(req);
    const rate = rateLimit({ key: `topup_confirm:ip:${ip}`, limit: LIMIT, windowMs: WINDOW_MS });
    if (!rate.ok) {
      return json(res, 429, { error: "Te veel verzoeken. Probeer later opnieuw." }, rateLimitHeaders(rate, LIMIT));
    }

    const body = await readJson(req, { maxBytes: 8 * 1024 });
    const sessionId = typeof body?.session_id === "string" ? body.session_id.trim() : "";
    if (!sessionId) return json(res, 400, { error: "Missing session_id" });

    const session = await stripeGet(`checkout/sessions/${encodeURIComponent(sessionId)}`, stripeSecretKey);
    if (session?.client_reference_id !== userId) {
      return json(res, 403, { error: "Session does not belong to current user" });
    }
    if (session?.payment_status !== "paid") {
      return json(res, 200, { ok: false, status: session?.payment_status || null });
    }

    const meta = session?.metadata || {};
    const tokensToAdd = Number(meta?.topup_tokens || 0);
    if (!Number.isFinite(tokensToAdd) || tokensToAdd <= 0) {
      return json(res, 400, { error: "Invalid topup metadata" });
    }

    // Prevent double-credit: store processed topup session ids in app_metadata.topups[]
    const currentUser = await supabaseAuthAdmin(`users/${encodeURIComponent(userId)}`, {
      method: "GET",
      accessKey: serviceRoleKey,
    });
    const currentAppMeta = currentUser?.user?.app_metadata || {};
    const currentTokens = Number(currentAppMeta?.tokens || 0);
    const topups = Array.isArray(currentAppMeta?.topups) ? currentAppMeta.topups : [];
    if (topups.includes(sessionId)) {
      return json(res, 200, { ok: true, tokens: Math.max(0, Number.isFinite(currentTokens) ? currentTokens : 0), already_processed: true });
    }

    const nextTokens = Math.max(0, Math.floor((Number.isFinite(currentTokens) ? currentTokens : 0) + tokensToAdd));
    const nextTopups = [...topups, sessionId].slice(-50);

    await supabaseAuthAdmin(`users/${encodeURIComponent(userId)}`, {
      method: "PUT",
      accessKey: serviceRoleKey,
      body: { app_metadata: { ...currentAppMeta, tokens: nextTokens, topups: nextTopups } },
    });

    return json(res, 200, { ok: true, tokens: nextTokens, added: tokensToAdd });
  } catch (e) {
    return publicError(res, 500, "Opwaarderen bevestigen mislukt. Probeer later opnieuw.", e);
  }
};

