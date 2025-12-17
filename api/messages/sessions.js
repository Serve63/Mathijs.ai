// Vercel Serverless Function: list chat sessions for current user
//
// Auth: expects `Authorization: Bearer <supabase_access_token>`
// Requires env: SUPABASE_SERVICE_ROLE_KEY

const { getBearerToken, getClientIp, json, publicError, rateLimit, rateLimitHeaders } = require("../_lib/security");
const { getUserFromAccessToken } = require("../_lib/supabase");
const { adminRestFetch } = require("../_lib/supabaseAdmin");

const WINDOW_MS = 60_000;
const LIMIT = 120;

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
    const rate = rateLimit({ key: `messages:sessions:${user.id}:${ip}`, limit: LIMIT, windowMs: WINDOW_MS });
    if (!rate.ok) {
      return json(res, 429, { error: "Te veel verzoeken. Probeer later opnieuw." }, rateLimitHeaders(rate, LIMIT));
    }

    const rows =
      (await adminRestFetch(
        `messages?select=session_id,role,message_text,created_at&user_id=eq.${encodeURIComponent(
          user.id
        )}&order=created_at.desc&limit=5000`,
        { method: "GET" }
      )) || [];

    if (!Array.isArray(rows) || !rows.length) {
      return json(res, 200, { sessions: [] });
    }

    const sessionMap = new Map();
    rows.forEach((entry) => {
      const sessionId = entry.session_id || LEGACY_SESSION_ID;
      const createdAt = entry.created_at;
      const existing = sessionMap.get(sessionId);
      if (!existing) {
        sessionMap.set(sessionId, {
          id: sessionId,
          createdAt,
          updatedAt: createdAt,
          firstUserMessage: entry.role === "user" ? entry.message_text : "",
          isLegacy: !entry.session_id,
        });
      } else {
        existing.updatedAt = existing.updatedAt || createdAt;
        if (!existing.createdAt || new Date(createdAt) < new Date(existing.createdAt)) {
          existing.createdAt = createdAt;
        }
        if (!existing.firstUserMessage && entry.role === "user") {
          existing.firstUserMessage = entry.message_text;
        }
      }
    });

    const sessions = Array.from(sessionMap.values()).sort(
      (a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
    );

    return json(res, 200, { sessions });
  } catch (e) {
    return publicError(res, 500, "Kon sessies niet laden.", e);
  }
};

