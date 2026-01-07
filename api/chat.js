const OpenAI = require("openai");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const { getBearerToken, getClientIp, json, publicError, rateLimit, rateLimitHeaders, readJson } = require("./_lib/security");
const { getUserFromAccessToken } = require("./_lib/supabase");
const { SUPABASE_URL } = require("./_lib/supabase");
const { getOpenAIApiKey, getGeminiApiKey, getSupabaseServiceRoleKey } = require("./_lib/env");

const OPENAI_DEFAULT_MODEL = "gpt-5.2-chat-latest";
const OPENAI_ALLOWED_MODELS = ["gpt-5.2-chat-latest", "gpt-5.2", "gpt-5-mini"];

const GEMINI_DEFAULT_MODEL = "gemini-1.5-flash";
const GEMINI_ALLOWED_MODELS = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash"];

const MAX_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 8000;
const MAX_TOTAL_CHARS = 24000;

const CHAT_WINDOW_MS = 60_000;
const CHAT_LIMIT_FREE = 20;
const CHAT_LIMIT_PAID = 60;
const TOKENS_PER_CHAT = 1;
const STARTER_CREDITS_EUR = 10;

function getTokensPerEur() {
  const tokensPerEur = Number(process.env.TOPUP_TOKENS_PER_EUR || 100);
  if (!Number.isFinite(tokensPerEur) || tokensPerEur <= 0) return 100;
  return Math.floor(tokensPerEur);
}

function resolveOpenAIModel(requested) {
  if (typeof requested !== "string" || !requested.trim()) {
    return OPENAI_DEFAULT_MODEL;
  }
  const normalized = requested.trim();
  if (!OPENAI_ALLOWED_MODELS.includes(normalized)) {
    console.warn(`Niet toegestane OpenAI model requested: ${normalized}. Valt terug op ${OPENAI_DEFAULT_MODEL}`);
    return OPENAI_DEFAULT_MODEL;
  }
  return normalized;
}

function resolveGeminiModel(requested) {
  if (typeof requested !== "string" || !requested.trim()) {
    return GEMINI_DEFAULT_MODEL;
  }
  const normalized = requested.trim();
  if (!GEMINI_ALLOWED_MODELS.includes(normalized)) {
    console.warn(`Niet toegestane Gemini model requested: ${normalized}. Valt terug op ${GEMINI_DEFAULT_MODEL}`);
    return GEMINI_DEFAULT_MODEL;
  }
  return normalized;
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
    throw new Error(`auth_admin_failed:${resp.status}:${text}`);
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

async function runGeminiChat({ apiKey, model, messages }) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const gemini = genAI.getGenerativeModel({ model });
  const prompt = buildGeminiPrompt(messages);

  try {
    const result = await gemini.generateContent(prompt);
    const response = result?.response;
    if (!response) return "";
    if (typeof response.text === "function") {
      return response.text() || "";
    }
    return "";
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

    const serviceRoleKey = getSupabaseServiceRoleKey();
    if (!serviceRoleKey) {
      console.error("Supabase service role key missing (expected SUPABASE_SERVICE_ROLE_KEY or supabase_service_role_key)");
      return json(res, 500, { error: "Supabase service role key missing; tokens cannot be initialized." });
    }

    let appMeta = user?.app_metadata || {};
    const tokensPerEur = getTokensPerEur();
    const starterTokens = Math.max(0, Math.round(STARTER_CREDITS_EUR * tokensPerEur));
    const tokenMetaValue = Number(appMeta?.tokens);

    // Initialize starter credits once for users missing a token balance.
    if (!Number.isFinite(tokenMetaValue)) {
      appMeta = { ...(appMeta || {}), tokens: starterTokens, credits_initialized: true, starter_credits_eur: STARTER_CREDITS_EUR };
      await supabaseAuthAdmin(`users/${encodeURIComponent(user.id)}`, {
        method: "PUT",
        accessKey: serviceRoleKey,
        body: { app_metadata: appMeta },
      });
    }

    const userPlan = String(appMeta?.plan || "free").toLowerCase();
    const isPaid = userPlan === "standard" || userPlan === "lifetime" || appMeta?.lifetime_free === true;
    const limit = isPaid ? CHAT_LIMIT_PAID : CHAT_LIMIT_FREE;

    // Token gating + deduct (stored server-side in app_metadata.tokens)
    const tokenBalance = Number(appMeta?.tokens || 0);
    if (!Number.isFinite(tokenBalance) || tokenBalance < TOKENS_PER_CHAT) {
      return json(res, 402, {
        error: "Je tokens zijn op. Waardeer je account op om door te chatten.",
        topup_required: true,
        tokens_required: TOKENS_PER_CHAT,
        tokens_available: Math.max(0, Number.isFinite(tokenBalance) ? tokenBalance : 0),
      });
    }

    const userLimit = rateLimit({ key: `chat:user:${user.id}`, limit, windowMs: CHAT_WINDOW_MS });
    if (!userLimit.ok) {
      return json(res, 429, { error: "Te veel chatverzoeken. Probeer zo opnieuw." }, rateLimitHeaders(userLimit, limit));
    }

    const ip = getClientIp(req);
    const ipLimit = rateLimit({ key: `chat:ip:${ip}`, limit: limit * 2, windowMs: CHAT_WINDOW_MS });
    if (!ipLimit.ok) {
      return json(res, 429, { error: "Te veel verzoeken. Probeer zo opnieuw." }, rateLimitHeaders(ipLimit, limit * 2));
    }

    // Deduct tokens upfront to prevent free usage on failed streams.
    // Note: app_metadata update is not atomic across concurrent requests; rate limiting mitigates abuse.
    const nextTokens = Math.max(0, Math.floor(tokenBalance - TOKENS_PER_CHAT));
    await supabaseAuthAdmin(`users/${encodeURIComponent(user.id)}`, {
      method: "PUT",
      accessKey: serviceRoleKey,
      body: { app_metadata: { ...(appMeta || {}), tokens: nextTokens } },
    });

    let body = {};
    try {
      body = await readJson(req, { maxBytes: 64 * 1024 });
    } catch (error) {
      const status = error?.code === "payload_too_large" ? 413 : 400;
      return json(res, status, { error: "Invalid request body" });
    }

    const { messages, model, provider } = body || {};
    const normalizedMessages = validateAndNormalizeMessages(messages);

    const requestedProvider = typeof provider === "string" ? provider.trim().toLowerCase() : "";
    const inferredProvider =
      requestedProvider ||
      (typeof model === "string" && model.trim().startsWith("gemini-") ? "gemini" : "openai");

    const requestedModel = typeof model === "string" ? model : "";

    if (inferredProvider === "gemini") {
      const geminiModel = resolveGeminiModel(requestedModel);
      const apiKey = getGeminiApiKey();
      console.log(`[gemini] key ${apiKey ? "present" : "missing"}`);
      if (!apiKey) {
        return json(res, 500, { error: "Missing GEMINI_API_KEY" });
      }
      const text = await runGeminiChat({ apiKey, model: geminiModel, messages: normalizedMessages });
      return json(res, 200, { text: text || "" });
    }

    const openaiModel = resolveOpenAIModel(requestedModel);
    const apiKey = getOpenAIApiKey();
    console.log(`[openai] key ${apiKey ? "present" : "missing"}`);
    if (!apiKey) {
      return json(res, 500, { error: "Missing OPEN_AI_KEY" });
    }

    const client = new OpenAI({ apiKey });
    const response = await client.responses.create({
      model: openaiModel,
      input: normalizedMessages.map((message) => ({ role: message.role, content: message.content })),
    });
    const text = extractResponseText(response);
    return json(res, 200, { text: text || "" });
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
    };
    const publicMsg = error?.publicMessage || map[error?.message] || "Er ging iets mis. Probeer opnieuw.";
    publicError(res, status, publicMsg, error);
  }
};
