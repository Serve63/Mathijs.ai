// Vercel Serverless Function: Create Mollie payment and return checkout URL
//
// Requires env vars:
// - MOLLIE_API_KEY
// - MOLLIE_AMOUNT_EUR (e.g. "29.00")
// - MOLLIE_DESCRIPTION (optional)
//
// Auth: expects `Authorization: Bearer <supabase_access_token>`

const { getBearerToken, getClientIp, json, publicError, rateLimit, rateLimitHeaders, readJson } = require("../_lib/security");
const { getUserFromAccessToken } = require("../_lib/supabase");

const CREATE_WINDOW_MS = 60_000;
const CREATE_LIMIT = 10;

function getBaseUrl(req) {
  const configured = process.env.APP_BASE_URL;
  if (configured) {
    const trimmed = String(configured).trim().replace(/\/+$/, "");
    if (!/^https:\/\//i.test(trimmed)) {
      throw new Error("invalid_APP_BASE_URL");
    }
    return trimmed;
  }
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) {
    return `https://${String(vercelUrl).trim().replace(/\/+$/, "")}`;
  }
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  if (!host) {
    throw new Error("missing_host");
  }
  return `https://${host}`;
}

function normalizeMethod(method) {
  if (!method) return null;
  const value = String(method).toLowerCase();
  if (value === "card") return "creditcard";
  if (["ideal", "bancontact", "creditcard"].includes(value)) return value;
  return null;
}

async function mollieRequest(path, apiKey, body) {
  const resp = await fetch(`https://api.mollie.com/v2/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
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

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

    const mollieKey = String(process.env.MOLLIE_API_KEY || "").trim();
    const amount = String(process.env.MOLLIE_AMOUNT_EUR || "").trim();
    if (!mollieKey) return json(res, 500, { error: "Missing MOLLIE_API_KEY" });
    if (!amount) return json(res, 500, { error: "Missing MOLLIE_AMOUNT_EUR" });

    const token = getBearerToken(req);
    if (!token) return json(res, 401, { error: "Missing Authorization Bearer token" });

    const ip = getClientIp(req);
    const rate = rateLimit({ key: `billing_mollie:ip:${ip}`, limit: CREATE_LIMIT, windowMs: CREATE_WINDOW_MS });
    if (!rate.ok) {
      return json(res, 429, { error: "Te veel verzoeken. Probeer later opnieuw." }, rateLimitHeaders(rate, CREATE_LIMIT));
    }

    const user = await getUserFromAccessToken(token);
    const email = (user?.email || "").trim();
    const userId = user?.id;
    if (!userId || !email) return json(res, 401, { error: "Unauthorized" });

    const body = await readJson(req);
    const fullName = typeof body?.full_name === "string" ? body.full_name.trim() : "";
    const method = normalizeMethod(body?.method);
    const baseUrl = getBaseUrl(req);

    const payment = await mollieRequest("payments", mollieKey, {
      amount: { currency: "EUR", value: amount },
      description: String(process.env.MOLLIE_DESCRIPTION || "Mathijs.ai abonnement").trim() || "Mathijs.ai abonnement",
      redirectUrl: `${baseUrl}/billing-success.html`,
      webhookUrl: String(process.env.MOLLIE_WEBHOOK_URL || "").trim() || undefined,
      method: method || undefined,
      metadata: { supabase_user_id: userId, full_name: fullName, email },
    });

    const checkoutUrl = payment?.checkoutUrl || payment?._links?.checkout?.href || "";
    if (!checkoutUrl) {
      throw new Error("missing_checkout_url");
    }
    return json(res, 200, { checkoutUrl, paymentId: payment?.id });
  } catch (e) {
    const raw = typeof e?.message === "string" ? e.message : "";
    const mollieMatch = raw.match(/^mollie_failed:\\d+:(.+)$/);
    const publicMsg = mollieMatch
      ? `Mollie: ${mollieMatch[1].trim()}`
      : raw === "missing_checkout_url"
      ? "Mollie checkout link ontbreekt. Probeer later opnieuw."
      : "Betaling kon niet worden gestart. Probeer later opnieuw.";
    return publicError(res, 500, publicMsg, e);
  }
};
