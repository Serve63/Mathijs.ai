// Vercel Serverless Function: import legacy localStorage chat sessions into Supabase messages
//
// Auth: expects `Authorization: Bearer <supabase_access_token>`
// Requires env: SUPABASE_SERVICE_ROLE_KEY
//
// Body:
// {
//   "sessions": [
//     { "id": "...", "messages": [{ "role": "user|assistant", "content": "..." , "created_at": "..." }] }
//   ]
// }

const { getBearerToken, getClientIp, json, publicError, rateLimit, rateLimitHeaders, readJson } = require("../_lib/security");
const { getUserFromAccessToken } = require("../_lib/supabase");
const { adminRestFetch } = require("../_lib/supabaseAdmin");

const WINDOW_MS = 60_000;
const LIMIT = 10;

const MAX_SESSIONS = 200;
const MAX_MESSAGES = 5000;
const MAX_MESSAGE_CHARS = 8000;

function normalizeRole(role) {
  const r = String(role || "").toLowerCase();
  return r === "user" ? "user" : "assistant";
}

function normalizeIso(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

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
    const rate = rateLimit({ key: `messages:import:${user.id}:${ip}`, limit: LIMIT, windowMs: WINDOW_MS });
    if (!rate.ok) {
      return json(res, 429, { error: "Te veel verzoeken. Probeer later opnieuw." }, rateLimitHeaders(rate, LIMIT));
    }

    const body = await readJson(req, { maxBytes: 512 * 1024 });
    const sessions = Array.isArray(body?.sessions) ? body.sessions : [];
    if (!sessions.length) return json(res, 200, { ok: true, inserted: 0 });
    if (sessions.length > MAX_SESSIONS) return json(res, 413, { error: "Te veel sessies om te importeren." });

    const rows = [];
    for (const session of sessions) {
      if (rows.length >= MAX_MESSAGES) break;
      const sessionId = typeof session?.id === "string" && session.id.trim() ? session.id.trim() : null;
      const messages = Array.isArray(session?.messages) ? session.messages : [];
      for (const msg of messages) {
        if (rows.length >= MAX_MESSAGES) break;
        const role = normalizeRole(msg?.role);
        const text = typeof msg?.message_text === "string" ? msg.message_text : typeof msg?.content === "string" ? msg.content : "";
        const trimmed = text.trim();
        if (!trimmed) continue;
        if (trimmed.length > MAX_MESSAGE_CHARS) continue;
        const createdAt = normalizeIso(msg?.created_at || msg?.createdAt);
        const row = {
          user_id: user.id,
          session_id: sessionId,
          role,
          message_text: trimmed,
        };
        if (createdAt) row.created_at = createdAt;
        rows.push(row);
      }
    }

    if (!rows.length) return json(res, 200, { ok: true, inserted: 0 });

    // Try preserve timestamps; if the table blocks created_at writes, retry without it.
    try {
      await adminRestFetch("messages", { method: "POST", body: rows });
    } catch (e) {
      const withoutCreatedAt = rows.map(({ created_at, ...rest }) => rest);
      await adminRestFetch("messages", { method: "POST", body: withoutCreatedAt });
    }

    return json(res, 200, { ok: true, inserted: rows.length });
  } catch (e) {
    const status = Number(e?.statusCode) || 500;
    return publicError(res, status, "Importeren mislukt.", e);
  }
};

