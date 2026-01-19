const OpenAI = require("openai");

const { getBearerToken, getClientIp, json, publicError, rateLimit, rateLimitHeaders, readJson } = require("./_lib/security");
const { getUserFromAccessToken } = require("./_lib/supabase");
const { SUPABASE_URL } = require("./_lib/supabase");
const { getOpenAIApiKey, getGeminiApiKey, getSupabaseServiceRoleKey } = require("./_lib/env");

// NOTE: UI labels may map to marketing names; server maps them to real OpenAI model IDs.
// Keep this conservative and stable across accounts/keys.
const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";
const OPENAI_ALLOWED_MODELS = ["gpt-4o", "gpt-4o-mini"];

// Gemini model IDs vary by API version and rollout. We keep a conservative default and
// map UI labels/legacy names to something likely to exist, then we try both v1 and v1beta endpoints.
const GEMINI_DEFAULT_MODEL = "gemini-1.5-flash";
const GEMINI_ALLOWED_MODELS = [
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gemini-pro",
  "gemini-1.0-pro",
  "gemini-1.5-flash-001",
  "gemini-1.5-pro-001",
];

const MAX_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 8000;
const MAX_TOTAL_CHARS = 24000;

const CHAT_WINDOW_MS = 60_000;
const CHAT_LIMIT_FREE = 20;
const CHAT_LIMIT_PAID = 60;
const TOKENS_PER_CHAT_DEFAULT = 1;

const isPaidAppMeta = (appMeta = {}) => {
  const plan = String(appMeta.plan || "").toLowerCase();
  if (appMeta.lifetime_free === true || plan === "standard" || plan === "lifetime" || plan === "trial") return true;
  const freeMonths = Number(appMeta.free_months || 0);
  if (Number.isFinite(freeMonths) && freeMonths > 0) return true;
  const totalPaid = Number(appMeta.total_paid_eur || 0);
  if (Number.isFinite(totalPaid) && totalPaid > 0) return true;
  const lastPaid = Number(appMeta.last_payment_amount_eur || 0);
  if (Number.isFinite(lastPaid) && lastPaid > 0) return true;
  if (typeof appMeta.last_payment_at === "string" && appMeta.last_payment_at.trim()) return true;
  return false;
};
const STARTER_CREDITS_EUR = 15;
const MODEL_TOKEN_COSTS = {
  chatgpt52: 2,
  gemini3: 1,
  opus45: 5,
  sonnet45: 3,
  haiku45: 1,
  grok4: 3,
  llama4: 1,
  qwen: 1,
  deepseekv2: 1,
};
const MODEL_LABEL_TOKEN_COSTS = [
  ["chatgpt 5.2", 2],
  ["gpt-5 mini", 1],
  ["gemini 3", 1],
  ["opus 4.5", 5],
  ["sonnet 4.5", 3],
  ["haiku 4.5", 1],
  ["grok 4", 3],
  ["llama 4", 1],
  ["qwen3-max", 1],
  ["deepseek v2", 1],
];
const OPENAI_MODEL_TOKEN_COSTS = {
  "gpt-4o": 2,
  "gpt-4o-mini": 1,
};
const GEMINI_MODEL_TOKEN_COSTS = {
  "gemini-1.5-flash": 1,
  "gemini-1.5-flash-001": 1,
  "gemini-1.5-pro": 2,
  "gemini-1.5-pro-001": 2,
  "gemini-pro": 2,
  "gemini-1.0-pro": 2,
};

function getTokensPerEur() {
  const tokensPerEur = Number(process.env.TOPUP_TOKENS_PER_EUR || 100);
  if (!Number.isFinite(tokensPerEur) || tokensPerEur <= 0) return 100;
  return Math.floor(tokensPerEur);
}

function resolveOpenAIModel(requested) {
  if (typeof requested !== "string" || !requested.trim()) {
    return OPENAI_DEFAULT_MODEL;
  }
  const raw = requested.trim();
  // Backwards compatible aliases (used by UI labels / older clients)
  const aliasMap = {
    "gpt-5.2-chat-latest": "gpt-4o",
    "gpt-5.2": "gpt-4o",
    "gpt-5-mini": "gpt-4o-mini",
    // Some older names we used in docs/clients
    "gpt-4o-latest": "gpt-4o",
  };
  const normalized = aliasMap[raw] || raw;
  if (!OPENAI_ALLOWED_MODELS.includes(normalized)) {
    console.warn(`Niet toegestane OpenAI model requested: ${raw} (→ ${normalized}). Valt terug op ${OPENAI_DEFAULT_MODEL}`);
    return OPENAI_DEFAULT_MODEL;
  }
  return normalized;
}

function resolveGeminiModel(requested) {
  if (typeof requested !== "string" || !requested.trim()) {
    return GEMINI_DEFAULT_MODEL;
  }
  let normalized = requested.trim();
  // Map various names to actual Google model identifiers
  const modelMap = {
    "gemini-1.5-flash": "gemini-1.5-flash-001",
    "gemini-1.5-flash-latest": "gemini-1.5-flash-001",
    "gemini-1.5-pro": "gemini-1.5-pro-001",
    "gemini-1.5-pro-latest": "gemini-1.5-pro-001",
    "gemini-2.0-flash": "gemini-1.5-flash",
    "gemini-2.0-flash-latest": "gemini-1.5-flash",
  };
  if (modelMap[normalized]) {
    normalized = modelMap[normalized];
  }

  if (!GEMINI_ALLOWED_MODELS.includes(normalized)) {
    console.warn(`Niet toegestane/ongekende Gemini model requested: ${normalized}. Valt terug op ${GEMINI_DEFAULT_MODEL}`);
    return GEMINI_DEFAULT_MODEL;
  }
  return normalized;
}

function normalizeModelKey(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function normalizeModelLabel(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function resolveTokensRequired({ modelKey, modelLabel, provider, requestedModel, resolvedModel }) {
  const normalizedKey = normalizeModelKey(modelKey);
  if (normalizedKey && MODEL_TOKEN_COSTS[normalizedKey]) {
    return MODEL_TOKEN_COSTS[normalizedKey];
  }

  const normalizedLabel = normalizeModelLabel(modelLabel);
  if (normalizedLabel) {
    for (const [prefix, tokens] of MODEL_LABEL_TOKEN_COSTS) {
      if (normalizedLabel.startsWith(prefix)) {
        return tokens;
      }
    }
  }

  if (provider === "openai") {
    const openaiModel = resolvedModel || resolveOpenAIModel(requestedModel);
    if (OPENAI_MODEL_TOKEN_COSTS[openaiModel]) return OPENAI_MODEL_TOKEN_COSTS[openaiModel];
  }

  if (provider === "gemini") {
    const geminiModel = resolvedModel || resolveGeminiModel(requestedModel);
    if (GEMINI_MODEL_TOKEN_COSTS[geminiModel]) return GEMINI_MODEL_TOKEN_COSTS[geminiModel];
  }

  return TOKENS_PER_CHAT_DEFAULT;
}

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
    const safe = sanitizeProviderErrorMessage(text || "");
    const err = new Error("supabase_auth_admin_failed");
    err.statusCode = 502;
    err.publicMessage =
      `Supabase admin call faalde (${resp.status}). ` +
      `Controleer of SUPABASE_SERVICE_ROLE_KEY klopt en voldoende rechten heeft.` +
      (safe ? ` Details: ${safe}` : "");
    err.detail = safe;
    throw err;
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function normalizeContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part) return "";
        if (typeof part === "string") return part;
        if (typeof part.text === "string") return part.text;
        if (typeof part.value === "string") return part.value;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (content && typeof content === "object") {
    if (typeof content.text === "string") return content.text;
    if (typeof content.value === "string") return content.value;
  }
  return "";
}

function validateAndNormalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    const err = new Error("messages_required");
    err.statusCode = 400;
    throw err;
  }

  if (messages.length > MAX_MESSAGES) {
    const err = new Error("messages_too_many");
    err.statusCode = 413;
    throw err;
  }

  let totalChars = 0;
  const normalized = [];

  for (const message of messages) {
    const role = (message?.role || "user").toLowerCase();
    if (role !== "user" && role !== "assistant" && role !== "developer") continue;
    const content = normalizeContent(message?.content);
    if (!content) continue;

    if (content.length > MAX_MESSAGE_CHARS) {
      const err = new Error("message_too_large");
      err.statusCode = 413;
      throw err;
    }

    totalChars += content.length;
    if (totalChars > MAX_TOTAL_CHARS) {
      const err = new Error("messages_too_large");
      err.statusCode = 413;
      throw err;
    }

    normalized.push({ role, content });
  }

  if (!normalized.length) {
    const err = new Error("messages_empty");
    err.statusCode = 400;
    throw err;
  }

  return normalized;
}

function extractResponseText(response) {
  if (!response) return "";
  if (typeof response.output_text === "string") return response.output_text;
  const output = Array.isArray(response.output) ? response.output : [];
  let text = "";
  output.forEach((item) => {
    if (!item || !Array.isArray(item.content)) return;
    item.content.forEach((part) => {
      if (part?.type === "output_text" && typeof part.text === "string") {
        text += part.text;
      }
    });
  });
  return text;
}

function buildGeminiPrompt(normalizedMessages) {
  const developerParts = [];
  const lines = [];

  normalizedMessages.forEach((message) => {
    if (!message || typeof message.content !== "string") return;
    if (message.role === "developer") {
      developerParts.push(message.content);
      return;
    }
    if (message.role === "user") {
      lines.push(`User: ${message.content}`);
      return;
    }
    if (message.role === "assistant") {
      lines.push(`Assistant: ${message.content}`);
    }
  });

  const systemInstruction = developerParts.filter(Boolean).join("\n\n").trim();
  const header = systemInstruction ? `System: ${systemInstruction}\n\n` : "";
  return `${header}${lines.join("\n\n")}`.trim();
}

function sanitizeProviderErrorMessage(message) {
  if (!message) return "";
  return String(message)
    .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, "***REDACTED***")
    .replace(/\b(?:sk_live|rk_live|whsec)_[A-Za-z0-9]{10,}\b/g, "***REDACTED***")
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, "***REDACTED***");
}

function extractGeminiText(payload) {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  const parts = candidates?.[0]?.content?.parts || [];
  return parts
    .map((p) => (p && typeof p.text === "string" ? p.text : ""))
    .filter(Boolean)
    .join("\n");
}

async function geminiGenerateViaRest({ apiKey, model, prompt }) {
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  };

  const versions = ["v1", "v1beta"];
  let lastErr = null;

  for (const version of versions) {
    const url = `https://generativelanguage.googleapis.com/${version}/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const msg = payload?.error?.message || payload?.message || `${resp.status} ${resp.statusText}`;
        console.error(`[gemini] API error (${version}, model: ${model}, status: ${resp.status}):`, msg);
        if (payload?.error) {
          console.error(`[gemini] Error details:`, JSON.stringify(payload.error, null, 2));
        }
        const err = new Error(msg);
        err.status = resp.status;
        err.versionTried = version;
        err.payload = payload;
        lastErr = err;
        // try next version
        continue;
      }

      return extractGeminiText(payload);
    } catch (e) {
      console.error(`[gemini] Network/parse error (${version}, model: ${model}):`, e?.message || e);
      lastErr = e;
      continue;
    }
  }

  throw lastErr || new Error("gemini_rest_failed");
}

async function listGeminiModels(apiKey) {
  const versions = ["v1", "v1beta"];
  for (const version of versions) {
    const url = `https://generativelanguage.googleapis.com/${version}/models?key=${apiKey}`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const payload = await resp.json().catch(() => ({}));
      const models = Array.isArray(payload?.models) ? payload.models : [];
      const names = models
        .filter((m) => m?.name && m?.supportedGenerationMethods?.includes("generateContent"))
        .map((m) => {
          const name = m.name || "";
          return name.startsWith("models/") ? name.slice(7) : name;
        })
        .filter(Boolean);
      if (names.length) return names;
    } catch {
      continue;
    }
  }
  return [];
}

async function runGeminiChat({ apiKey, model, messages }) {
  const prompt = buildGeminiPrompt(messages);

  try {
    // First try the requested model (mapped). If it fails with 404-like errors, list available models and try those.
    const candidates = [model, "gemini-1.5-flash", "gemini-pro", "gemini-1.0-pro"].filter(Boolean);
    let lastError = null;
    for (const candidateModel of candidates) {
      try {
        const text = await geminiGenerateViaRest({ apiKey, model: candidateModel, prompt });
        if (text) return text;
        return "";
      } catch (e) {
        lastError = e;
      }
    }

    // If all candidates failed, list available models and try the first one
    console.log("[gemini] All hardcoded models failed. Listing available models...");
    const availableModels = await listGeminiModels(apiKey);
    console.log(`[gemini] Available models: ${availableModels.join(", ") || "none"}`);
    if (availableModels.length) {
      const firstAvailable = availableModels[0];
      console.log(`[gemini] Trying first available model: ${firstAvailable}`);
      const text = await geminiGenerateViaRest({ apiKey, model: firstAvailable, prompt });
      if (text) return text;
      return "";
    }

    throw lastError || new Error("gemini_rest_failed");
  } catch (err) {
    const safe = sanitizeProviderErrorMessage(err?.message || "");
    const wrapped = new Error("gemini_failed");
    wrapped.statusCode = 502;
    wrapped.publicMessage = safe ? `Gemini request mislukte: ${safe}` : "Gemini request mislukte.";
    wrapped.cause = err;
    throw wrapped;
  }
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return json(res, 405, { error: "Method not allowed" });
    }

    const token = getBearerToken(req);
    if (!token) return json(res, 401, { error: "Unauthorized" });

    const user = await getUserFromAccessToken(token);
    if (!user?.id) return json(res, 401, { error: "Unauthorized" });

    // Token management is best-effort. If service role is missing/misconfigured, we still allow chat to work.
    const serviceRoleKey = getSupabaseServiceRoleKey();
    const tokenOpsEnabled = Boolean(serviceRoleKey);
    if (!tokenOpsEnabled) {
      console.error(
        "Supabase service role key missing (expected SUPABASE_SERVICE_ROLE_KEY or supabase_service_role_key). Token gating disabled."
      );
    }

    // Parse & validate request FIRST so we don't deduct tokens for invalid requests.
    let body = {};
    try {
      body = await readJson(req, { maxBytes: 64 * 1024 });
    } catch (error) {
      const status = error?.code === "payload_too_large" ? 413 : 400;
      return json(res, status, { error: "Invalid request body" });
    }

    const { messages, model, provider } = body || {};
    const modelKey =
      typeof body?.model_key === "string"
        ? body.model_key
        : typeof body?.modelKey === "string"
          ? body.modelKey
          : "";
    const modelLabel =
      typeof body?.model_label === "string"
        ? body.model_label
        : typeof body?.modelLabel === "string"
          ? body.modelLabel
          : "";
    const normalizedMessages = validateAndNormalizeMessages(messages);

    const requestedProvider = typeof provider === "string" ? provider.trim().toLowerCase() : "";
    const inferredProvider =
      requestedProvider ||
      (typeof model === "string" && model.trim().startsWith("gemini-") ? "gemini" : "openai");

    const requestedModel = typeof model === "string" ? model : "";
    const resolvedOpenAIModel = inferredProvider === "openai" ? resolveOpenAIModel(requestedModel) : null;
    const resolvedGeminiModel = inferredProvider === "gemini" ? resolveGeminiModel(requestedModel) : null;
    const tokensRequiredRaw = resolveTokensRequired({
      modelKey,
      modelLabel,
      provider: inferredProvider,
      requestedModel,
      resolvedModel: resolvedOpenAIModel || resolvedGeminiModel,
    });
    const tokensRequired = Math.max(
      1,
      Math.floor(Number.isFinite(tokensRequiredRaw) ? tokensRequiredRaw : TOKENS_PER_CHAT_DEFAULT)
    );

    // Initialize / read token balance AFTER we know request is valid.
    let appMeta = user?.app_metadata || {};
    const tokensPerEur = getTokensPerEur();
    const starterTokens = Math.max(0, Math.round(STARTER_CREDITS_EUR * tokensPerEur));
    const tokenMetaValue = Number(appMeta?.tokens);
    const starterCreditsRecorded = Number(appMeta?.starter_credits_eur || 0);
    const creditsInitialized = Boolean(appMeta?.credits_initialized);

    // Initialize starter credits once for users missing a token balance (best-effort).
    if (tokenOpsEnabled && !Number.isFinite(tokenMetaValue)) {
      try {
        appMeta = {
          ...(appMeta || {}),
          tokens: starterTokens,
          credits_initialized: true,
          starter_credits_eur: STARTER_CREDITS_EUR,
        };
        await supabaseAuthAdmin(`users/${encodeURIComponent(user.id)}`, {
          method: "PUT",
          accessKey: serviceRoleKey,
          body: { app_metadata: appMeta },
        });
      } catch (e) {
        console.error("Token init failed; continuing without token gating.", e?.message || e);
      }
    } else if (
      tokenOpsEnabled &&
      Number.isFinite(tokenMetaValue) &&
      (creditsInitialized || starterCreditsRecorded > 0) &&
      starterCreditsRecorded < STARTER_CREDITS_EUR
    ) {
      try {
        const nextTokens = Math.max(Math.floor(tokenMetaValue), starterTokens);
        appMeta = {
          ...(appMeta || {}),
          tokens: nextTokens,
          credits_initialized: true,
          starter_credits_eur: STARTER_CREDITS_EUR,
        };
        await supabaseAuthAdmin(`users/${encodeURIComponent(user.id)}`, {
          method: "PUT",
          accessKey: serviceRoleKey,
          body: { app_metadata: appMeta },
        });
      } catch (e) {
        console.error("Token upgrade failed; continuing without token gating.", e?.message || e);
      }
    }

    const isPaid = isPaidAppMeta(appMeta);
    if (!isPaid) {
      return json(res, 402, {
        error: "Abonnement vereist om te chatten.",
        subscribe_required: true,
      });
    }
    const limit = CHAT_LIMIT_PAID;

    // Rate limit before deducting tokens.
    const userLimit = rateLimit({ key: `chat:user:${user.id}`, limit, windowMs: CHAT_WINDOW_MS });
    if (!userLimit.ok) {
      return json(res, 429, { error: "Te veel chatverzoeken. Probeer zo opnieuw." }, rateLimitHeaders(userLimit, limit));
    }

    const ip = getClientIp(req);
    const ipLimit = rateLimit({ key: `chat:ip:${ip}`, limit: limit * 2, windowMs: CHAT_WINDOW_MS });
    if (!ipLimit.ok) {
      return json(res, 429, { error: "Te veel verzoeken. Probeer zo opnieuw." }, rateLimitHeaders(ipLimit, limit * 2));
    }

    // Token gating + deduct (stored server-side in app_metadata.tokens) - best-effort.
    const tokenBalance = Number(appMeta?.tokens || 0);
    if (tokenOpsEnabled) {
      if (!Number.isFinite(tokenBalance) || tokenBalance < tokensRequired) {
        return json(res, 402, {
          error: "Je tokens zijn op. Waardeer je account op om door te chatten.",
          topup_required: true,
          tokens_required: tokensRequired,
          tokens_available: Math.max(0, Number.isFinite(tokenBalance) ? tokenBalance : 0),
        });
      }

      const nextTokens = Math.max(0, Math.floor(tokenBalance - tokensRequired));
      try {
        await supabaseAuthAdmin(`users/${encodeURIComponent(user.id)}`, {
          method: "PUT",
          accessKey: serviceRoleKey,
          body: { app_metadata: { ...(appMeta || {}), tokens: nextTokens } },
        });
      } catch (e) {
        console.error("Token deduct failed; continuing without blocking chat.", e?.message || e);
      }
    }

    const refundTokensBestEffort = async () => {
      if (!tokenOpsEnabled) return;
      try {
        await supabaseAuthAdmin(`users/${encodeURIComponent(user.id)}`, {
          method: "PUT",
          accessKey: serviceRoleKey,
          body: { app_metadata: { ...(appMeta || {}), tokens: tokenBalance } },
        });
      } catch (e) {
        console.error("Token refund failed", e?.message || e);
      }
    };

    try {
      if (inferredProvider === "gemini") {
        const geminiModel = resolvedGeminiModel || resolveGeminiModel(requestedModel);
        const apiKey = getGeminiApiKey();
        console.log(`[gemini] key ${apiKey ? "present" : "missing"}`);
        if (!apiKey) {
          await refundTokensBestEffort();
          return json(res, 500, { error: "Missing GEMINI_API_KEY" });
        }
        // Validate API key format (should start with AIza)
        if (!apiKey.startsWith("AIza")) {
          console.error(`[gemini] Invalid API key format (should start with AIza)`);
          await refundTokensBestEffort();
          return json(res, 500, { error: "Invalid GEMINI_API_KEY format. API key should start with 'AIza'" });
        }
        console.log(`[gemini] Using model: ${geminiModel}, messages: ${normalizedMessages.length}`);
        const text = await runGeminiChat({ apiKey, model: geminiModel, messages: normalizedMessages });
        return json(res, 200, { text: text || "" });
      }

      const openaiModel = resolvedOpenAIModel || resolveOpenAIModel(requestedModel);
      const apiKey = getOpenAIApiKey();
      console.log(`[openai] key ${apiKey ? "present" : "missing"}`);
      if (!apiKey) {
        await refundTokensBestEffort();
        return json(res, 500, { error: "Missing OPEN_AI_KEY" });
      }

      const client = new OpenAI({ apiKey });
      let response;
      try {
        response = await client.responses.create({
          model: openaiModel,
          input: normalizedMessages.map((message) => ({ role: message.role, content: message.content })),
        });
      } catch (err) {
        await refundTokensBestEffort();
        const safe = sanitizeProviderErrorMessage(err?.message || "");
        const wrapped = new Error("openai_failed");
        wrapped.statusCode = 502;
        wrapped.publicMessage = safe ? `OpenAI request mislukte: ${safe}` : "OpenAI request mislukte.";
        wrapped.cause = err;
        throw wrapped;
      }
      const text = extractResponseText(response);
      return json(res, 200, { text: text || "" });
    } catch (err) {
      // Refund tokens for provider errors (best effort). If this throws, the outer catch handles it.
      // Note: for successful responses we never enter here.
      throw err;
    }
  } catch (error) {
    const status = Number(error?.statusCode) || (error?.code === "payload_too_large" ? 413 : 500);
    if (res.headersSent) return;

    const map = {
      messages_required: "Berichten ontbreken.",
      messages_empty: "Berichten ontbreken.",
      messages_too_many: "Te veel context meegestuurd. Start een nieuw gesprek.",
      message_too_large: "Bericht is te lang.",
      messages_too_large: "Te veel tekst/context meegestuurd.",
      gemini_failed: "Gemini kon geen antwoord geven. Probeer opnieuw.",
      openai_failed: "OpenAI kon geen antwoord geven. Probeer opnieuw.",
      supabase_auth_admin_failed: "Tokenbeheer faalde door Supabase. Controleer SUPABASE_SERVICE_ROLE_KEY.",
      token_init_failed: "Tokens konden niet worden geïnitialiseerd. Controleer SUPABASE_SERVICE_ROLE_KEY.",
      token_deduct_failed: "Tokens konden niet worden bijgewerkt. Controleer SUPABASE_SERVICE_ROLE_KEY.",
    };
    const publicMsg = error?.publicMessage || map[error?.message] || "Er ging iets mis. Probeer opnieuw.";
    publicError(res, status, publicMsg, error);
  }
};
