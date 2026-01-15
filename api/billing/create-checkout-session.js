// Vercel Serverless Function: Create Stripe Checkout Session (subscription)
//
// Requires Vercel env vars:
// - STRIPE_SECRET_KEY
// - STRIPE_PRICE_ID (recurring price)
// - SUPABASE_SERVICE_ROLE_KEY (optional; not used here, but kept consistent with confirm endpoint)
//
// Auth: expects `Authorization: Bearer <supabase_access_token>`

const { getBearerToken, getClientIp, json, publicError, rateLimit, rateLimitHeaders, readJson } = require("../_lib/security");
const { getUserFromAccessToken } = require("../_lib/supabase");

const CHECKOUT_WINDOW_MS = 60_000;
const CHECKOUT_LIMIT = 10;

function getBaseUrl(req) {
  const configured = process.env.APP_BASE_URL;
  if (configured) {
    const trimmed = String(configured).trim().replace(/\/+$/, "");
    if (!/^https:\/\//i.test(trimmed)) {
      throw new Error("invalid_APP_BASE_URL");
    }
    return trimmed;
  }

  // Vercel provides this in prod; prefer it over request headers to avoid host-header injection.
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
    const stripePriceId = process.env.STRIPE_PRICE_ID;
    if (!stripeSecretKey) return json(res, 500, { error: "Missing STRIPE_SECRET_KEY" });
    if (!stripePriceId) return json(res, 500, { error: "Missing STRIPE_PRICE_ID" });

    const token = getBearerToken(req);
    if (!token) return json(res, 401, { error: "Missing Authorization Bearer token" });

    const ip = getClientIp(req);
    const rate = rateLimit({ key: `billing_checkout:ip:${ip}`, limit: CHECKOUT_LIMIT, windowMs: CHECKOUT_WINDOW_MS });
    if (!rate.ok) {
      return json(res, 429, { error: "Te veel verzoeken. Probeer later opnieuw." }, rateLimitHeaders(rate, CHECKOUT_LIMIT));
    }

    const user = await getUserFromAccessToken(token);
    const email = (user?.email || "").trim();
    const userId = user?.id;
    if (!userId || !email) return json(res, 401, { error: "Unauthorized" });

    const body = await readJson(req);
    const fullName = typeof body?.full_name === "string" ? body.full_name.trim() : "";
    const company = typeof body?.company === "string" ? body.company.trim() : "";
    const phone = typeof body?.phone === "string" ? body.phone.trim() : "";

    const baseUrl = getBaseUrl(req);

    // 1) Create customer so contact details persist (and portal can be created later).
    const customerParams = new URLSearchParams();
    customerParams.set("email", email);
    if (fullName) customerParams.set("name", fullName);
    if (phone) customerParams.set("phone", phone);
    if (company) customerParams.set("metadata[company]", company);
    customerParams.set("metadata[supabase_user_id]", userId);
    const customer = await stripeRequest("customers", stripeSecretKey, customerParams);

    // 2) Create Checkout session (subscription).
    const sessionParams = new URLSearchParams();
    sessionParams.set("mode", "subscription");
    sessionParams.set("customer", customer.id);
    sessionParams.set("client_reference_id", userId);
    sessionParams.set("success_url", `${baseUrl}/billing-success.html?session_id={CHECKOUT_SESSION_ID}`);
    sessionParams.set("cancel_url", `${baseUrl}/billing-cancelled.html`);
    sessionParams.set("allow_promotion_codes", "true");
    sessionParams.set("billing_address_collection", "required");
    sessionParams.set("tax_id_collection[enabled]", "true");
    sessionParams.set("payment_method_types[0]", "ideal");
    sessionParams.set("payment_method_types[1]", "card");
    sessionParams.set("line_items[0][price]", stripePriceId);
    sessionParams.set("line_items[0][quantity]", "1");
    sessionParams.set("metadata[supabase_user_id]", userId);

    const session = await stripeRequest("checkout/sessions", stripeSecretKey, sessionParams);
    return json(res, 200, { url: session.url });
  } catch (e) {
    return publicError(res, 500, "Checkout kon niet worden gestart. Probeer later opnieuw.", e);
  }
};
