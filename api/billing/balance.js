// Vercel Serverless Function: get current token + euro credit balance
//
// Auth: expects `Authorization: Bearer <supabase_access_token>`
// Requires env: SUPABASE_SERVICE_ROLE_KEY (only needed for initializing missing balances)
//
// Credits model:
// - Stored as integer `app_metadata.tokens`
// - Euros are derived via `TOPUP_TOKENS_PER_EUR` (default 100)
// - Every new user gets €10 starter credits (tokens initialized once)

const { getBearerToken, getClientIp, json, publicError, rateLimit, rateLimitHeaders } = require("../_lib/security");
const { getUserFromAccessToken } = require("../_lib/supabase");
const { SUPABASE_URL } = require("../_lib/supabase");
const { getSupabaseServiceRoleKey } = require("../_lib/env");

const WINDOW_MS = 60_000;
const LIMIT = 120;

const STARTER_CREDITS_EUR = 10;

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

function getTokensPerEur() {
  const tokensPerEur = Number(process.env.TOPUP_TOKENS_PER_EUR || 100);
  if (!Number.isFinite(tokensPerEur) || tokensPerEur <= 0) return 100;
  return Math.floor(tokensPerEur);
}

function tokensToEur(tokens, tokensPerEur) {
  const eur = Number(tokens) / Number(tokensPerEur || 100);
  if (!Number.isFinite(eur) || eur < 0) return 0;
  return Math.round(eur * 100) / 100;
}

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
    const rate = rateLimit({ key: `billing:balance:${user.id}:${ip}`, limit: LIMIT, windowMs: WINDOW_MS });
    if (!rate.ok) {
      return json(res, 429, { error: "Te veel verzoeken. Probeer later opnieuw." }, rateLimitHeaders(rate, LIMIT));
    }

    const tokensPerEur = getTokensPerEur();
    const starterTokens = Math.max(0, Math.round(STARTER_CREDITS_EUR * tokensPerEur));

    const appMeta = user?.app_metadata || {};
    let tokenBalance = Number(appMeta?.tokens);
    const serviceRoleKey = getSupabaseServiceRoleKey();

    // Initialize once for existing users that don't have a balance yet.
    if (!Number.isFinite(tokenBalance)) {
      if (!serviceRoleKey) {
        return json(res, 503, { error: "Supabase service role key missing; tokens cannot be initialized." });
      }
      const nextMeta = { ...(appMeta || {}), tokens: starterTokens, credits_initialized: true, starter_credits_eur: STARTER_CREDITS_EUR };
      try {
        await supabaseAuthAdmin(`users/${encodeURIComponent(user.id)}`, {
          method: "PUT",
          accessKey: serviceRoleKey,
          body: { app_metadata: nextMeta },
        });
        tokenBalance = starterTokens;
      } catch (e) {
        console.error("Token initialization failed:", e?.message || e);
        return json(res, 503, { error: "Tokens konden niet worden geïnitialiseerd. Probeer later opnieuw." });
      }
    }

    tokenBalance = Math.max(0, Math.floor(Number.isFinite(tokenBalance) ? tokenBalance : 0));
    const creditsEur = tokensToEur(tokenBalance, tokensPerEur);

    return json(res, 200, {
      ok: true,
      tokens_available: tokenBalance,
      tokens_per_eur: tokensPerEur,
      credits_eur: creditsEur,
      starter_credits_eur: STARTER_CREDITS_EUR,
    });
  } catch (e) {
    return publicError(res, 500, "Kon credits niet laden.", e);
  }
};

