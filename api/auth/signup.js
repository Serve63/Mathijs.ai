// Vercel Serverless Function: Signup via Supabase Admin API (email confirmed)
//
// Why: if Supabase email sending/confirmation isn't configured, client signUp can require email verification
// and users won't receive a mail. This endpoint creates the user with `email_confirm: true`.
//
// Requires Vercel env var:
// - SUPABASE_SERVICE_ROLE_KEY

const { checkSameOrigin, getClientIp, json, publicError, rateLimit, rateLimitHeaders, readJson } = require("../_lib/security");
const { SUPABASE_URL } = require("../_lib/supabase");

const SIGNUP_WINDOW_MS = 15 * 60_000;
const SIGNUP_LIMIT = 5;

function isValidEmail(email) {
  const e = (email || "").trim();
  if (e.length < 6 || e.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

async function supabaseAuthAdmin(path, { method = "POST", accessKey, body } = {}) {
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
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!resp.ok) {
    const msg = payload?.message || payload?.error_description || payload?.error || text || "Supabase admin request failed";
    const error = new Error(String(msg));
    error.statusCode = resp.status;
    throw error;
  }

  return payload;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
    if (!checkSameOrigin(req)) return json(res, 403, { error: "Forbidden" });

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) return json(res, 500, { error: "Missing SUPABASE_SERVICE_ROLE_KEY" });

    const ip = getClientIp(req);
    const limitResult = rateLimit({ key: `signup:ip:${ip}`, limit: SIGNUP_LIMIT, windowMs: SIGNUP_WINDOW_MS });
    if (!limitResult.ok) {
      return json(res, 429, { error: "Te veel registratiepogingen. Probeer later opnieuw." }, rateLimitHeaders(limitResult, SIGNUP_LIMIT));
    }

    const body = await readJson(req, { maxBytes: 16 * 1024 });
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const honeypot = typeof body?.company_website === "string" ? body.company_website.trim() : "";

    // Silent success for bots that fill hidden fields.
    if (honeypot) return json(res, 200, { ok: true });

    if (!email || !password) return json(res, 400, { error: "Missing email/password" });
    if (!isValidEmail(email)) return json(res, 400, { error: "Invalid email" });
    if (password.length < 10) return json(res, 400, { error: "Password must be at least 10 characters" });

    await supabaseAuthAdmin("users", {
      accessKey: serviceRoleKey,
      body: {
        email,
        password,
        email_confirm: true,
        user_metadata: { username: email },
      },
    });

    return json(res, 200, { ok: true });
  } catch (e) {
    const status = Number(e?.statusCode) || (e?.code === "payload_too_large" ? 413 : 500);
    return publicError(res, status, "Registratie mislukt. Probeer later opnieuw.", e);
  }
};
