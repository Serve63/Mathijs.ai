let GoogleGenerativeAI = null;
let geminiSdkAvailable = false;

try {
  ({ GoogleGenerativeAI } = require("@google/generative-ai"));
  geminiSdkAvailable = typeof GoogleGenerativeAI === "function";
} catch (error) {
  console.warn("Gemini SDK niet beschikbaar:", error.message);
}

const { getBearerToken, getClientIp, json, publicError, rateLimit, rateLimitHeaders, redactSecrets, setCommonApiHeaders } = require("./_lib/security");
const { getUserFromAccessToken } = require("./_lib/supabase");
const { SUPABASE_URL } = require("./_lib/supabase");
const { getOpenAIApiKey, getSupabaseServiceRoleKey } = require("./_lib/env");

const GEMINI_MODEL_ID = "gemini-1.5-flash";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const OPENAI_DEFAULT_MODEL = "gpt-4o";
const OPENAI_ALLOWED_MODELS = ["gpt-4o", "gpt-4o-mini"];

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

function parseBody(req) {
  if (!req) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (error) {
      return {};
    }
  }
  if (typeof req.body === "object" && req.body !== null) {
    return req.body;
  }
  return {};
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

function splitGeminiHistory(messages = []) {
  const history = [];
  let prompt = "";

  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i];
    const text = normalizeContent(message?.content);
    if (!text) continue;
    const role = (message?.role || "user").toLowerCase();
    const geminiRole = role === "assistant" ? "model" : "user";
    history.push({
      role: geminiRole,
      parts: [{ text }],
    });
  }

  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].role === "user") {
      prompt = history[i].parts?.[0]?.text || "";
      history.splice(i, 1);
      break;
    }
  }

  return { history, prompt };
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

async function streamGeminiResponse(res, messages) {
  if (!geminiSdkAvailable || !GoogleGenerativeAI) {
    return json(res, 500, { error: "AI provider niet beschikbaar. Probeer later opnieuw." });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json(res, 500, { error: "AI provider is niet geconfigureerd." });
  }

  const { history, prompt } = splitGeminiHistory(messages);
  if (!prompt) {
    return json(res, 400, { error: "Geen gebruikersprompt aangetroffen." });
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL_ID });
  const chat = model.startChat({ history });
  const stream = await chat.sendMessageStream(prompt);

  res.statusCode = 200;
  setCommonApiHeaders(res);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  for await (const chunk of stream.stream) {
    const chunkText = chunk.text();
    if (chunkText) {
      res.write(chunkText);
    }
  }

  res.end();
}

async function streamOpenAIResponse(res, messages, { model = OPENAI_DEFAULT_MODEL, requestId = "" } = {}) {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    console.warn("OpenAI key missing (expected: OPEN_AI_KEY, OPENAI_API_KEY, or open_ai_key)");
    return json(res, 500, { error: "OpenAI key missing (set OPEN_AI_KEY, OPENAI_API_KEY, or open_ai_key)." });
  }

  const response = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    let details = "";
    try {
      details = await response.text();
    } catch {
      /* ignore */
    }
    console.error(`OpenAI request failed (${requestId})`, response.status, redactSecrets(details));
    const status = response.status === 429 ? 429 : 502;
    const message = response.status === 429 ? "Te veel AI-verzoeken. Probeer zo opnieuw." : "AI-request mislukt. Probeer later opnieuw.";
    return json(res, status, { error: `${message} [${requestId || "no-request-id"}]` });
  }

  res.statusCode = 200;
  setCommonApiHeaders(res);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const handleEvent = (eventChunk) => {
    const trimmed = eventChunk.trim();
    if (!trimmed) return false;
    const lines = trimmed.split("\n");
    let shouldStop = false;

    lines.forEach((line) => {
      if (!line.startsWith("data:")) return;
      const payload = line.replace(/^data:\s*/, "");
      if (!payload || payload === "[DONE]") {
        shouldStop = payload === "[DONE]";
        return;
      }
      try {
        const parsed = JSON.parse(payload);
        const delta = parsed?.choices?.[0]?.delta?.content;
        if (delta) {
          res.write(delta);
        }
      } catch (error) {
        console.warn("Kon OpenAI stream chunk niet parsen:", error);
      }
    });

    return shouldStop;
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const eventChunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const shouldStop = handleEvent(eventChunk);
      if (shouldStop) {
        res.end();
        return;
      }
      boundary = buffer.indexOf("\n\n");
    }
  }

  if (buffer.length) {
    const shouldStop = handleEvent(buffer);
    if (shouldStop) {
      res.end();
      return;
    }
  }

  res.end();
}

module.exports = async function handler(req, res) {
  try {
    const requestId = `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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

    const { messages, model } = parseBody(req);
    const normalizedMessages = validateAndNormalizeMessages(messages);

    const requestedModel = typeof model === "string" ? model : "";
    const wantsGemini = requestedModel.toLowerCase().includes("gemini");

    if (wantsGemini) {
      await streamGeminiResponse(res, normalizedMessages);
      return;
    }

    const openaiModel = resolveOpenAIModel(requestedModel);
    await streamOpenAIResponse(res, normalizedMessages, { model: openaiModel, requestId });
  } catch (error) {
    const status = Number(error?.statusCode) || (error?.code === "payload_too_large" ? 413 : 500);
    if (res.headersSent) return;

    const map = {
      messages_required: "Berichten ontbreken.",
      messages_empty: "Berichten ontbreken.",
      messages_too_many: "Te veel context meegestuurd. Start een nieuw gesprek.",
      message_too_large: "Bericht is te lang.",
      messages_too_large: "Te veel tekst/context meegestuurd.",
    };
    const publicMsg = map[error?.message] || "Er ging iets mis. Probeer opnieuw.";
    publicError(res, status, publicMsg, error);
  }
};
