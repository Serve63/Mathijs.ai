// Staff API usage overview (estimated from chat requests).
//
// Auth: expects `Authorization: Bearer <supabase_access_token>`
// Requires env: SUPABASE_SERVICE_ROLE_KEY

const { getBearerToken, getClientIp, json, publicError, rateLimit, rateLimitHeaders } = require("../_lib/security");
const { getUserFromAccessToken } = require("../_lib/supabase");
const { isStaffUser } = require("../_lib/staff");
const { adminRestCount } = require("../_lib/supabaseAdmin");

const STAFF_WINDOW_MS = 60_000;
const STAFF_LIMIT = 120;
const TOKENS_PER_CHAT = 1;

function getTokensPerEur() {
  const tokensPerEur = Number(process.env.TOPUP_TOKENS_PER_EUR || 100);
  if (!Number.isFinite(tokensPerEur) || tokensPerEur <= 0) return 100;
  return Math.floor(tokensPerEur);
}

function parseLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function startOfDayUtc(now) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfMonthUtc(now) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function startOfYearUtc(now) {
  return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
}

async function countChatsSince(iso) {
  const query = `messages?select=id&role=eq.user&created_at=gte.${encodeURIComponent(iso)}&limit=1`;
  return adminRestCount(query);
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return json(res, 405, { error: "Method not allowed" });
    }

    const token = getBearerToken(req);
    if (!token) return json(res, 401, { error: "Missing Authorization Bearer token" });

    const ip = getClientIp(req);
    const rate = rateLimit({ key: `staff:api-usage:${ip}`, limit: STAFF_LIMIT, windowMs: STAFF_WINDOW_MS });
    if (!rate.ok) {
      return json(res, 429, { error: "Te veel verzoeken. Probeer later opnieuw." }, rateLimitHeaders(rate, STAFF_LIMIT));
    }

    const user = await getUserFromAccessToken(token);
    if (!user?.id || !user?.email) return json(res, 401, { error: "Unauthorized" });
    const confirmedAt = user?.email_confirmed_at || user?.confirmed_at;
    if (!confirmedAt) return json(res, 403, { error: "Forbidden (email not verified)" });
    if (!isStaffUser(user)) return json(res, 403, { error: "Forbidden (not staff)" });

    const now = new Date();
    const todayIso = startOfDayUtc(now).toISOString();
    const monthIso = startOfMonthUtc(now).toISOString();
    const yearIso = startOfYearUtc(now).toISOString();

    const [countToday, countMonth, countYear] = await Promise.all([
      countChatsSince(todayIso),
      countChatsSince(monthIso),
      countChatsSince(yearIso),
    ]);

    const tokensPerEur = getTokensPerEur();
    const eurPerChat = TOKENS_PER_CHAT / tokensPerEur;
    const toEur = (count) => Math.round(count * eurPerChat * 100) / 100;

    const limits = {
      daily_eur: parseLimit(process.env.API_DAILY_LIMIT_EUR),
      monthly_eur: parseLimit(process.env.API_MONTHLY_LIMIT_EUR),
      yearly_eur: parseLimit(process.env.API_YEARLY_LIMIT_EUR),
    };

    return json(res, 200, {
      ok: true,
      currency: "EUR",
      tokens_per_chat: TOKENS_PER_CHAT,
      tokens_per_eur: tokensPerEur,
      usage: {
        today: { chats: countToday, spend_eur: toEur(countToday), since: todayIso },
        month: { chats: countMonth, spend_eur: toEur(countMonth), since: monthIso },
        year: { chats: countYear, spend_eur: toEur(countYear), since: yearIso },
      },
      limits,
      note: "Schatting op basis van chatverzoeken (TOKENS_PER_CHAT).",
    });
  } catch (e) {
    const status = Number(e?.statusCode) || 500;
    const msg = e?.publicMessage || "Er ging iets mis.";
    return publicError(res, status, msg, e);
  }
};
