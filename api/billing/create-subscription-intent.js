// Vercel Serverless Function: Create Stripe Subscription + Payment Intent (inline checkout)
//
// Requires env vars:
// - STRIPE_SECRET_KEY
// - STRIPE_PRICE_ID
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
    const rate = rateLimit({ key: `billing_subscribe:ip:${ip}`, limit: CREATE_LIMIT, windowMs: CREATE_WINDOW_MS });
    if (!rate.ok) {
      return json(res, 429, { error: "Te veel verzoeken. Probeer later opnieuw." }, rateLimitHeaders(rate, CREATE_LIMIT));
    }

    const user = await getUserFromAccessToken(token);
    const email = (user?.email || "").trim();
    const userId = user?.id;
    if (!userId || !email) return json(res, 401, { error: "Unauthorized" });

    const body = await readJson(req);
    const fullName = typeof body?.full_name === "string" ? body.full_name.trim() : "";

    const baseUrl = getBaseUrl(req);

    // 1) Create customer
    const customerParams = new URLSearchParams();
    customerParams.set("email", email);
    if (fullName) customerParams.set("name", fullName);
    customerParams.set("metadata[supabase_user_id]", userId);
    const customer = await stripeRequest("customers", stripeSecretKey, customerParams);

    // 2) Create subscription (incomplete) with PaymentIntent
    const subscriptionParams = new URLSearchParams();
    subscriptionParams.set("customer", customer.id);
    subscriptionParams.set("items[0][price]", stripePriceId);
    subscriptionParams.set("payment_behavior", "default_incomplete");
    subscriptionParams.set("payment_settings[save_default_payment_method]", "on_subscription");
    subscriptionParams.set("payment_settings[payment_method_types][0]", "ideal");
    subscriptionParams.set("payment_settings[payment_method_types][1]", "card");
    subscriptionParams.set("metadata[supabase_user_id]", userId);
    subscriptionParams.set("expand[]", "latest_invoice.payment_intent");
    subscriptionParams.set("collection_method", "charge_automatically");

    const subscription = await stripeRequest("subscriptions", stripeSecretKey, subscriptionParams);
    const clientSecret = subscription?.latest_invoice?.payment_intent?.client_secret;
    if (!clientSecret) {
      throw new Error("missing_client_secret");
    }

    return json(res, 200, {
      clientSecret,
      subscriptionId: subscription.id,
      returnUrl: `${baseUrl}/billing-success.html?subscription_id=${encodeURIComponent(subscription.id)}`,
    });
  } catch (e) {
    return publicError(res, 500, "Betaling kon niet worden gestart. Probeer later opnieuw.", e);
  }
};

