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

const GEMINI_MODEL_ID = "gemini-1.5-flash";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL_ID = "gpt-4-turbo";

const MAX_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 8000;
const MAX_TOTAL_CHARS = 24000;

const CHAT_WINDOW_MS = 60_000;
const CHAT_LIMIT_FREE = 20;
const CHAT_LIMIT_PAID = 60;

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

async function streamOpenAIResponse(res, messages) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return json(res, 500, { error: "AI provider is niet geconfigureerd." });
  }

  const response = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL_ID,
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
    console.error("OpenAI request failed:", response.status, redactSecrets(details));
    const status = response.status === 429 ? 429 : 502;
    const message = response.status === 429 ? "Te veel AI-verzoeken. Probeer zo opnieuw." : "AI-request mislukt. Probeer later opnieuw.";
    return json(res, status, { error: message });
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
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return json(res, 405, { error: "Method not allowed" });
    }

    const token = getBearerToken(req);
    if (!token) return json(res, 401, { error: "Unauthorized" });

    const user = await getUserFromAccessToken(token);
    if (!user?.id) return json(res, 401, { error: "Unauthorized" });

    const userPlan = String(user?.user_metadata?.plan || "free").toLowerCase();
    const limit = userPlan === "standard" ? CHAT_LIMIT_PAID : CHAT_LIMIT_FREE;

    const userLimit = rateLimit({ key: `chat:user:${user.id}`, limit, windowMs: CHAT_WINDOW_MS });
    if (!userLimit.ok) {
      return json(res, 429, { error: "Te veel chatverzoeken. Probeer zo opnieuw." }, rateLimitHeaders(userLimit, limit));
    }

    const ip = getClientIp(req);
    const ipLimit = rateLimit({ key: `chat:ip:${ip}`, limit: limit * 2, windowMs: CHAT_WINDOW_MS });
    if (!ipLimit.ok) {
      return json(res, 429, { error: "Te veel verzoeken. Probeer zo opnieuw." }, rateLimitHeaders(ipLimit, limit * 2));
    }

    const { messages, model } = parseBody(req);
    const normalizedMessages = validateAndNormalizeMessages(messages);

    const requestedModel = typeof model === "string" ? model : "";
    const wantsGemini = requestedModel.toLowerCase().includes("gemini");

    if (wantsGemini) {
      await streamGeminiResponse(res, normalizedMessages);
      return;
    }

    await streamOpenAIResponse(res, normalizedMessages);
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
