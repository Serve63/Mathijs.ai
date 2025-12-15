// Vercel Serverless Function: Confirm Stripe Checkout session and mark subscription in Supabase Auth metadata
//
// Requires Vercel env vars:
// - STRIPE_SECRET_KEY
// - SUPABASE_SERVICE_ROLE_KEY
//
// Auth: expects `Authorization: Bearer <supabase_access_token>`

const SUPABASE_URL = "https://mengrlsqgshxqcxhirjn.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_PeVTrMXz6UaeMhkPn5Fs-Q_xfJFVRNt";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  return await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function getUserFromAccessToken(accessToken) {
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`auth_user_failed:${resp.status}:${txt}`);
  }
  return await resp.json();
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

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) return json(res, 500, { error: "Missing SUPABASE_SERVICE_ROLE_KEY" });

    const authHeader = req.headers.authorization || req.headers.Authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
    if (!token) return json(res, 401, { error: "Missing Authorization Bearer token" });

    const user = await getUserFromAccessToken(token);
    const userId = user?.id;
    const email = (user?.email || "").trim();
    if (!userId || !email) return json(res, 401, { error: "Unauthorized" });

    const body = await readJson(req);
    const sessionId = typeof body?.session_id === "string" ? body.session_id.trim() : "";
    if (!sessionId) return json(res, 400, { error: "Missing session_id" });

    const session = await stripeGet(`checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=subscription`, stripeSecretKey);
    if (session?.client_reference_id !== userId) {
      return json(res, 403, { error: "Session does not belong to current user" });
    }

    const subscription = session?.subscription;
    const subStatus = subscription?.status || null;
    const isActive = subStatus === "active" || subStatus === "trialing";
    if (!isActive) {
      return json(res, 200, { ok: false, status: subStatus || session?.payment_status || null });
    }

    const nowIso = new Date().toISOString();
    const nextMeta = {
      ...(user?.user_metadata || {}),
      plan: "standard",
      cancelled_at: null,
      stripe_customer_id: session?.customer || null,
      stripe_subscription_id: subscription?.id || null,
      subscribed_at: nowIso,
    };

    await supabaseAuthAdmin(`users/${encodeURIComponent(userId)}`, {
      method: "PUT",
      accessKey: serviceRoleKey,
      body: { user_metadata: nextMeta },
    });

    return json(res, 200, { ok: true, status: subStatus, plan: "standard" });
  } catch (e) {
    return json(res, 500, { error: String(e?.message || e) });
  }
};

