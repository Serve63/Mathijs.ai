// Vercel Serverless Function: Create Stripe Checkout Session for token top-up
//
// Requires Vercel env vars:
// - STRIPE_SECRET_KEY
// - APP_BASE_URL (recommended)
//
// Optional env:
// - TOPUP_MIN_EUR (default 5)
// - TOPUP_MAX_EUR (default 250)
// - TOPUP_TOKENS_PER_EUR (default 100)
//
// Auth: expects `Authorization: Bearer <supabase_access_token>`

const { getBearerToken, getClientIp, json, publicError, rateLimit, rateLimitHeaders, readJson } = require("../_lib/security");
const { getUserFromAccessToken } = require("../_lib/supabase");

const WINDOW_MS = 60_000;
const LIMIT = 10;

function getBaseUrl(req) {
  const configured = process.env.APP_BASE_URL;
  if (configured) {
    const trimmed = String(configured).trim().replace(/\/+$/, "");
    if (!/^https:\/\//i.test(trimmed)) throw new Error("invalid_APP_BASE_URL");
    return trimmed;
  }
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${String(vercelUrl).trim().replace(/\/+$/, "")}`;
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  if (!host) throw new Error("missing_host");
  return `https://${host}`;
}

async function stripeRequest(path, secretKey, params) {
  const resp = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
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

    const token = getBearerToken(req);
    if (!token) return json(res, 401, { error: "Unauthorized" });

    const user = await getUserFromAccessToken(token);
    const userId = user?.id;
    const email = (user?.email || "").trim();
    if (!userId || !email) return json(res, 401, { error: "Unauthorized" });

    const ip = getClientIp(req);
    const rate = rateLimit({ key: `topup_create:ip:${ip}`, limit: LIMIT, windowMs: WINDOW_MS });
    if (!rate.ok) {
      return json(res, 429, { error: "Te veel verzoeken. Probeer later opnieuw." }, rateLimitHeaders(rate, LIMIT));
    }

    const body = await readJson(req, { maxBytes: 8 * 1024 });
    const amountEur = Number(body?.amount_eur);
    if (!Number.isFinite(amountEur)) return json(res, 400, { error: "Invalid amount" });

    const minEur = Number(process.env.TOPUP_MIN_EUR || 5);
    const maxEur = Number(process.env.TOPUP_MAX_EUR || 250);
    const tokensPerEur = Number(process.env.TOPUP_TOKENS_PER_EUR || 100);
    if (!Number.isFinite(minEur) || !Number.isFinite(maxEur) || minEur <= 0 || maxEur <= minEur) {
      return json(res, 500, { error: "Server misconfiguratie (topup limits)" });
    }
    if (!Number.isFinite(tokensPerEur) || tokensPerEur <= 0) {
      return json(res, 500, { error: "Server misconfiguratie (tokens per eur)" });
    }

    // Allow decimals, but round to cents.
    const amountCents = Math.round(amountEur * 100);
    if (amountCents < Math.round(minEur * 100) || amountCents > Math.round(maxEur * 100)) {
      return json(res, 400, { error: `Bedrag moet tussen €${minEur} en €${maxEur} zijn.` });
    }

    const tokensToAdd = Math.round((amountCents / 100) * tokensPerEur);
    const baseUrl = getBaseUrl(req);

    const params = new URLSearchParams();
    params.set("mode", "payment");
    params.set("payment_method_types[0]", "card");
    params.set("customer_email", email);
    params.set("client_reference_id", userId);
    params.set("success_url", `${baseUrl}//billing-topup-success?session_id={CHECKOUT_SESSION_ID}`);
    params.set("cancel_url", `${baseUrl}//chat?topup_cancelled=1`);
    params.set("line_items[0][quantity]", "1");
    params.set("line_items[0][price_data][currency]", "eur");
    params.set("line_items[0][price_data][unit_amount]", String(amountCents));
    params.set("line_items[0][price_data][product_data][name]", "Tokens opwaarderen");
    params.set("metadata[supabase_user_id]", userId);
    params.set("metadata[topup_tokens]", String(tokensToAdd));
    params.set("metadata[topup_amount_cents]", String(amountCents));

    const session = await stripeRequest("checkout/sessions", stripeSecretKey, params);
    return json(res, 200, { url: session.url });
  } catch (e) {
    return publicError(res, 500, "Opwaarderen kon niet worden gestart. Probeer later opnieuw.", e);
  }
};

