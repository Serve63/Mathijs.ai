// Vercel Serverless Function: messages API (combined to stay under Hobby limits)
//
// Auth: expects `Authorization: Bearer <supabase_access_token>`
// Requires env: SUPABASE_SERVICE_ROLE_KEY

const { getBearerToken, getClientIp, json, publicError, rateLimit, rateLimitHeaders, readJson } = require("./_lib/security");
const { getUserFromAccessToken } = require("./_lib/supabase");
const { adminRestFetch } = require("./_lib/supabaseAdmin");

const WINDOW_MS = 60_000;
const LEGACY_SESSION_ID = "__legacy_session__";

const LIMITS = {
  add: 180,
  "delete-session": 60,
  session: 240,
  sessions: 120,
  "import-legacy": 10,
};

const MAX_MESSAGE_CHARS = 8000;
const MAX_SESSIONS = 200;
const MAX_MESSAGES = 5000;

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
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return json(res, 405, { error: "Method not allowed" });
    }

    const url = new URL(req.url, "http://localhost");
    const actionFromQuery = (url.searchParams.get("action") || "").toLowerCase();

    let body = {};
    if (req.method === "POST") {
      try {
        body = await readJson(req, { maxBytes: 512 * 1024 });
      } catch (error) {
        const status = error?.code === "payload_too_large" ? 413 : 400;
        return json(res, status, { error: "Invalid request body" });
      }
    }

    const action = String(body?.action || actionFromQuery || "").toLowerCase();
    if (!action) {
      return json(res, 400, { error: "Missing action" });
    }

    const token = getBearerToken(req);
    if (!token) return json(res, 401, { error: "Unauthorized" });

    const user = await getUserFromAccessToken(token);
    if (!user?.id) return json(res, 401, { error: "Unauthorized" });

    const ip = getClientIp(req);
    const limit = LIMITS[action];
    if (!limit) {
      return json(res, 400, { error: "Unknown action" });
    }
    const rate = rateLimit({ key: `messages:${action}:${user.id}:${ip}`, limit, windowMs: WINDOW_MS });
    if (!rate.ok) {
      return json(res, 429, { error: "Te veel verzoeken. Probeer later opnieuw." }, rateLimitHeaders(rate, limit));
    }

    if (action === "add") {
      if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
      const role = String(body?.role || "").toLowerCase();
      const sessionIdRaw = typeof body?.session_id === "string" ? body.session_id.trim() : "";
      const sessionId = sessionIdRaw || LEGACY_SESSION_ID;
      const messageText = typeof body?.message_text === "string" ? body.message_text : "";
      const provider = typeof body?.provider === "string" ? body.provider.trim().toLowerCase() : null;

      if (role !== "user" && role !== "assistant") return json(res, 400, { error: "Invalid role" });
      if (!messageText || messageText.length > MAX_MESSAGE_CHARS) return json(res, 413, { error: "Message too large" });

      const payload = {
        user_id: user.id,
        session_id: sessionId === LEGACY_SESSION_ID ? null : sessionId,
        role,
        message_text: messageText,
      };
      
      // Add provider if provided and valid
      if (provider === "gemini" || provider === "openai") {
        payload.provider = provider;
      }

      await adminRestFetch("messages", { method: "POST", body: payload });
      return json(res, 200, { ok: true });
    }

    if (action === "delete-session") {
      if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
      const sessionIdRaw = typeof body?.session_id === "string" ? body.session_id.trim() : "";
      const sessionId = sessionIdRaw || LEGACY_SESSION_ID;
      const filter =
        sessionId === LEGACY_SESSION_ID
          ? `user_id=eq.${encodeURIComponent(user.id)}&session_id=is.null`
          : `user_id=eq.${encodeURIComponent(user.id)}&session_id=eq.${encodeURIComponent(sessionId)}`;

      await adminRestFetch(`messages?${filter}`, { method: "DELETE" });
      return json(res, 200, { ok: true });
    }

    if (action === "session") {
      if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
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
    }

    if (action === "sessions") {
      if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
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
    }

    if (action === "import-legacy") {
      if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
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
          const text =
            typeof msg?.message_text === "string" ? msg.message_text : typeof msg?.content === "string" ? msg.content : "";
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

      try {
        await adminRestFetch("messages", { method: "POST", body: rows });
      } catch (e) {
        const withoutCreatedAt = rows.map(({ created_at, ...rest }) => rest);
        await adminRestFetch("messages", { method: "POST", body: withoutCreatedAt });
      }

      return json(res, 200, { ok: true, inserted: rows.length });
    }

    return json(res, 400, { error: "Unknown action" });
  } catch (e) {
    const status = Number(e?.statusCode) || 500;
    const msg = e?.publicMessage || "Er ging iets mis.";
    return publicError(res, status, msg, e);
  }
};
