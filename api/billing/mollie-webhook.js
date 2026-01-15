// Vercel Serverless Function: Mollie webhook handler
//
// Requires env vars:
// - MOLLIE_API_KEY
// - SUPABASE_SERVICE_ROLE_KEY

const { json, publicError } = require("../_lib/security");
const { SUPABASE_URL } = require("../_lib/supabase");

const MAX_BODY_BYTES = 4096;

async function readBody(req) {
  return await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > MAX_BODY_BYTES) {
        const err = new Error("payload_too_large");
        err.code = "payload_too_large";
        reject(err);
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function extractPaymentId(req, rawBody) {
  const url = new URL(req.url || "/", "https://webhook.local");
  let paymentId = url.searchParams.get("payment_id") || url.searchParams.get("id") || "";

  if (!paymentId && rawBody) {
    try {
      const parsed = JSON.parse(rawBody);
      if (parsed && typeof parsed.payment_id === "string") {
        paymentId = parsed.payment_id;
      } else if (parsed && typeof parsed.id === "string") {
        paymentId = parsed.id;
      }
    } catch {
      // Not JSON, ignore.
    }
  }

  if (!paymentId && rawBody) {
    try {
      const params = new URLSearchParams(rawBody);
      paymentId = params.get("payment_id") || params.get("id") || "";
    } catch {
      // Not urlencoded, ignore.
    }
  }

  return paymentId ? paymentId.trim() : "";
}

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

    const mollieKey = process.env.MOLLIE_API_KEY;
    if (!mollieKey) return json(res, 500, { error: "Missing MOLLIE_API_KEY" });

    const { getSupabaseServiceRoleKey } = require("../_lib/env");
    const serviceRoleKey = getSupabaseServiceRoleKey();
    if (!serviceRoleKey) return json(res, 500, { error: "Missing SUPABASE_SERVICE_ROLE_KEY" });

    const rawBody = await readBody(req);
    const paymentId = extractPaymentId(req, rawBody);
    if (!paymentId) return json(res, 400, { error: "Missing payment_id" });

    const payment = await mollieGet(`payments/${encodeURIComponent(paymentId)}`, mollieKey);
    const status = payment?.status || null;
    if (status !== "paid") {
      return json(res, 200, { ok: false, status });
    }

    const metadata = payment?.metadata || {};
    const userId = typeof metadata?.supabase_user_id === "string" ? metadata.supabase_user_id.trim() : "";
    if (!userId) {
      return json(res, 200, { ok: false, status, reason: "missing_user_id" });
    }

    const user = await supabaseAuthAdmin(`users/${encodeURIComponent(userId)}`, {
      method: "GET",
      accessKey: serviceRoleKey,
    });

    const nowIso = new Date().toISOString();
    const nextAppMeta = {
      ...(user?.app_metadata || {}),
      plan: "standard",
      cancelled_at: null,
      mollie_payment_id: paymentId,
      subscribed_at: nowIso,
    };

    await supabaseAuthAdmin(`users/${encodeURIComponent(userId)}`, {
      method: "PUT",
      accessKey: serviceRoleKey,
      body: { app_metadata: nextAppMeta },
    });

    return json(res, 200, { ok: true, status: "paid" });
  } catch (e) {
    return publicError(res, 500, "Webhook verwerken mislukt. Probeer later opnieuw.", e);
  }
};
