// Vercel Serverless Function: delete a whole session for current user
//
// Auth: expects `Authorization: Bearer <supabase_access_token>`
// Requires env: SUPABASE_SERVICE_ROLE_KEY

const { getBearerToken, getClientIp, json, publicError, rateLimit, rateLimitHeaders, readJson } = require("../_lib/security");
const { getUserFromAccessToken } = require("../_lib/supabase");
const { adminRestFetch } = require("../_lib/supabaseAdmin");

const WINDOW_MS = 60_000;
const LIMIT = 60;
const LEGACY_SESSION_ID = "__legacy_session__";

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return json(res, 405, { error: "Method not allowed" });
    }

    const token = getBearerToken(req);
    if (!token) return json(res, 401, { error: "Unauthorized" });

    const user = await getUserFromAccessToken(token);
    if (!user?.id) return json(res, 401, { error: "Unauthorized" });

    const ip = getClientIp(req);
    const rate = rateLimit({ key: `messages:delete:${user.id}:${ip}`, limit: LIMIT, windowMs: WINDOW_MS });
    if (!rate.ok) {
      return json(res, 429, { error: "Te veel verzoeken. Probeer later opnieuw." }, rateLimitHeaders(rate, LIMIT));
    }

    const body = await readJson(req, { maxBytes: 8 * 1024 });
    const sessionIdRaw = typeof body?.session_id === "string" ? body.session_id.trim() : "";
    const sessionId = sessionIdRaw || LEGACY_SESSION_ID;

    const filter =
      sessionId === LEGACY_SESSION_ID
        ? `user_id=eq.${encodeURIComponent(user.id)}&session_id=is.null`
        : `user_id=eq.${encodeURIComponent(user.id)}&session_id=eq.${encodeURIComponent(sessionId)}`;

    // Delete via PostgREST. Using service role, but we always scope to user_id.
    await adminRestFetch(`messages?${filter}`, { method: "DELETE" });

    return json(res, 200, { ok: true });
  } catch (e) {
    return publicError(res, 500, "Kon sessie niet verwijderen.", e);
  }
};

