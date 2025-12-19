// Vercel Serverless Function: list messages for a session for current user
//
// Auth: expects `Authorization: Bearer <supabase_access_token>`
// Requires env: SUPABASE_SERVICE_ROLE_KEY

const { getBearerToken, getClientIp, json, publicError, rateLimit, rateLimitHeaders } = require("../_lib/security");
const { getUserFromAccessToken } = require("../_lib/supabase");
const { adminRestFetch } = require("../_lib/supabaseAdmin");

const WINDOW_MS = 60_000;
const LIMIT = 240;

const LEGACY_SESSION_ID = "__legacy_session__";

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return json(res, 405, { error: "Method not allowed" });
    }

    const token = getBearerToken(req);
    if (!token) return json(res, 401, { error: "Unauthorized" });

    const user = await getUserFromAccessToken(token);
    if (!user?.id) return json(res, 401, { error: "Unauthorized" });

    const ip = getClientIp(req);
    const rate = rateLimit({ key: `messages:session:${user.id}:${ip}`, limit: LIMIT, windowMs: WINDOW_MS });
    if (!rate.ok) {
      return json(res, 429, { error: "Te veel verzoeken. Probeer later opnieuw." }, rateLimitHeaders(rate, LIMIT));
    }

    const url = new URL(req.url, "http://localhost");
    const sessionIdRaw = (url.searchParams.get("session_id") || "").trim();
    const sessionId = sessionIdRaw || LEGACY_SESSION_ID;

    const base = `messages?select=role,message_text,created_at,session_id&user_id=eq.${encodeURIComponent(user.id)}&order=created_at.asc&limit=5000`;
    const query =
      sessionId === LEGACY_SESSION_ID
        ? `${base}&session_id=is.null`
        : `${base}&session_id=eq.${encodeURIComponent(sessionId)}`;

    const rows = (await adminRestFetch(query, { method: "GET" })) || [];
    const messages = Array.isArray(rows)
      ? rows.map((row) => ({
          role: row.role === "user" ? "user" : "assistant",
          message_text: row.message_text || "",
          created_at: row.created_at,
          session_id: row.session_id || null,
        }))
      : [];

    return json(res, 200, { messages });
  } catch (e) {
    const status = e?.statusCode || 500;
    const msg = e?.publicMessage || "Kon berichten niet laden.";
    return publicError(res, status, msg, e);
  }
};

