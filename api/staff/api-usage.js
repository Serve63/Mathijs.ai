// Vercel Serverless Function: Staff API usage overview (today)
//
// Requires Supabase service role key and api_usage_events table.

const { getBearerToken, getClientIp, json, publicError, rateLimit, rateLimitHeaders } = require("../_lib/security");
const { getUserFromAccessToken } = require("../_lib/supabase");
const { isStaffUser } = require("../_lib/staff");
const { adminRestFetch } = require("../_lib/supabaseAdmin");

const STAFF_WINDOW_MS = 60_000;
const STAFF_LIMIT = 120;
const DEFAULT_TOKENS_PER_EUR = 100;

function startOfDayUtc(now) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function getTokensPerEur() {
  const tokensPerEur = Number(process.env.TOPUP_TOKENS_PER_EUR || DEFAULT_TOKENS_PER_EUR);
  if (!Number.isFinite(tokensPerEur) || tokensPerEur <= 0) return DEFAULT_TOKENS_PER_EUR;
  return Math.floor(tokensPerEur);
}

function parseLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function toEur(tokens, tokensPerEur) {
  const amount = Number(tokens || 0) / Number(tokensPerEur || DEFAULT_TOKENS_PER_EUR);
  return Math.round(amount * 100) / 100;
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
    const rate = rateLimit({ key: `staff_api_usage:ip:${ip}`, limit: STAFF_LIMIT, windowMs: STAFF_WINDOW_MS });
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

    let rows = [];
    try {
      rows =
        (await adminRestFetch(
          `api_usage_events?select=provider,model,model_label,tokens,tokens_per_eur,cost_eur,created_at&created_at=gte.${encodeURIComponent(
            todayIso
          )}&order=created_at.desc&limit=10000`,
          { method: "GET" }
        )) || [];
    } catch (e) {
      const detail = String(e?.detail || "");
      const isMissingTable = e?.statusCode === 404 || detail.includes("api_usage_events");
      if (isMissingTable) {
        return json(res, 500, {
          error: "API usage tabel ontbreekt. Run migrations/create_api_usage_events.sql in Supabase.",
        });
      }
      throw e;
    }

    const tokensPerEur = getTokensPerEur();
    const totals = new Map();
    let todayTokens = 0;
    let todaySpend = 0;

    rows.forEach((row) => {
      const modelLabel = row?.model_label || row?.model || "Onbekend";
      const provider = row?.provider || "onbekend";
      const key = `${provider}::${modelLabel}`;
      const tokens = Number(row?.tokens || 0);
      const rowTokensPerEur = Number(row?.tokens_per_eur || tokensPerEur || DEFAULT_TOKENS_PER_EUR);
      const spend = Number.isFinite(Number(row?.cost_eur)) ? Number(row.cost_eur) : toEur(tokens, rowTokensPerEur);

      todayTokens += tokens;
      todaySpend += spend;

      const existing = totals.get(key) || {
        provider,
        model_label: modelLabel,
        tokens: 0,
        spend_eur: 0,
        chats: 0,
      };
      existing.tokens += tokens;
      existing.spend_eur = Math.round((existing.spend_eur + spend) * 100) / 100;
      existing.chats += 1;
      totals.set(key, existing);
    });

    const models = Array.from(totals.values()).sort((a, b) => b.spend_eur - a.spend_eur);
    const dailyLimit = parseLimit(process.env.API_DAILY_LIMIT_EUR);
    const remaining = dailyLimit ? Math.max(0, Math.round((dailyLimit - todaySpend) * 100) / 100) : null;

    return json(res, 200, {
      ok: true,
      currency: "EUR",
      today: {
        chats: rows.length,
        tokens: todayTokens,
        spend_eur: Math.round(todaySpend * 100) / 100,
        remaining_eur: remaining,
        since: todayIso,
      },
      models,
      limits: {
        daily_eur: dailyLimit,
      },
      tokens_per_eur: tokensPerEur,
      note: "Kosten zijn gebaseerd op tokens per chat per model.",
    });
  } catch (e) {
    return publicError(res, 500, "API usage ophalen mislukt.", e);
  }
};

