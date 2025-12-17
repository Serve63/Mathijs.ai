// Vercel Serverless Function: add a chat message for current user
//
// Auth: expects `Authorization: Bearer <supabase_access_token>`
// Requires env: SUPABASE_SERVICE_ROLE_KEY

const { getBearerToken, getClientIp, json, publicError, rateLimit, rateLimitHeaders, readJson } = require("../_lib/security");
const { getUserFromAccessToken } = require("../_lib/supabase");
const { adminRestFetch } = require("../_lib/supabaseAdmin");

const WINDOW_MS = 60_000;
const LIMIT = 180;

const MAX_MESSAGE_CHARS = 8000;
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
    const rate = rateLimit({ key: `messages:add:${user.id}:${ip}`, limit: LIMIT, windowMs: WINDOW_MS });
    if (!rate.ok) {
      return json(res, 429, { error: "Te veel verzoeken. Probeer later opnieuw." }, rateLimitHeaders(rate, LIMIT));
    }

    const body = await readJson(req, { maxBytes: 32 * 1024 });
    const role = String(body?.role || "").toLowerCase();
    const sessionIdRaw = typeof body?.session_id === "string" ? body.session_id.trim() : "";
    const sessionId = sessionIdRaw || LEGACY_SESSION_ID;
    const messageText = typeof body?.message_text === "string" ? body.message_text : "";

    if (role !== "user" && role !== "assistant") return json(res, 400, { error: "Invalid role" });
    if (!messageText || messageText.length > MAX_MESSAGE_CHARS) return json(res, 413, { error: "Message too large" });

    const payload = {
      user_id: user.id,
      session_id: sessionId === LEGACY_SESSION_ID ? null : sessionId,
      role,
      message_text: messageText,
    };

    await adminRestFetch("messages", { method: "POST", body: payload });
    return json(res, 200, { ok: true });
  } catch (e) {
    return publicError(res, 500, "Kon bericht niet opslaan.", e);
  }
};

