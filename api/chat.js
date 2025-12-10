const BING_SEARCH_ENDPOINT = process.env.BING_SEARCH_ENDPOINT || "https://api.bing.microsoft.com/v7.0/search";
const BING_SEARCH_KEY = process.env.BING_SEARCH_KEY || process.env.BING_SUBSCRIPTION_KEY;

let GoogleGenerativeAI = null;
let geminiSdkAvailable = false;

try {
  ({ GoogleGenerativeAI } = require("@google/generative-ai"));
  geminiSdkAvailable = typeof GoogleGenerativeAI === "function";
} catch (error) {
  console.warn("Google Generative AI SDK niet beschikbaar:", error.message);
}

const GEMINI_MODEL_MAP = {
  "gemini 3": "gemini-1.5-pro",
  "gemini 2.5 pro": "gemini-1.5-pro",
  default: "gemini-1.5-flash",
};

async function fetchWebResults(query) {
  if (!BING_SEARCH_KEY || !query) return null;
  try {
    const url = `${BING_SEARCH_ENDPOINT}?count=3&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        "Ocp-Apim-Subscription-Key": BING_SEARCH_KEY,
      },
    });
    if (!response.ok) {
      console.warn("Web search failed", await response.text());
      return null;
    }
    const data = await response.json();
    const items = data?.webPages?.value || [];
    if (!items.length) return null;
    return items
      .slice(0, 3)
      .map((item, idx) => `${idx + 1}. ${item.name} ƒ?" ${item.snippet} (URL: ${item.url})`)
      .join("\n");
  } catch (err) {
    console.warn("Web search error", err);
    return null;
  }
}

function resolveGeminiModelId(label = "") {
  const normalized = label.trim().toLowerCase();
  if (GEMINI_MODEL_MAP[normalized]) {
    return GEMINI_MODEL_MAP[normalized];
  }
  if (normalized.includes("3")) {
    return GEMINI_MODEL_MAP["gemini 3"];
  }
  if (normalized.includes("2.5")) {
    return GEMINI_MODEL_MAP["gemini 2.5 pro"];
  }
  return GEMINI_MODEL_MAP.default;
}

function normalizeMessageContent(content) {
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

function buildGeminiHistory(messages = []) {
  const converted = [];
  messages.forEach((message) => {
    const text = normalizeMessageContent(message?.content);
    if (!text) return;
    const role = (message?.role || "user").toLowerCase() === "assistant" ? "model" : "user";
    converted.push({
      role,
      parts: [{ text }],
    });
  });

  if (!converted.length) {
    return { history: [], prompt: "" };
  }

  let promptEntry = null;
  for (let i = converted.length - 1; i >= 0; i -= 1) {
    if (converted[i].role === "user") {
      promptEntry = converted.splice(i, 1)[0];
      break;
    }
  }

  return {
    history: converted,
    prompt: promptEntry?.parts?.[0]?.text || "",
  };
}

async function streamGeminiCompletion({ messages, modelLabel, res, apiKey }) {
  const modelId = resolveGeminiModelId(modelLabel);
  const { history, prompt } = buildGeminiHistory(messages);
  if (!prompt) {
    throw new Error("Geen gebruikersbericht gevonden om op te antwoorden.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const geminiModel = genAI.getGenerativeModel({ model: modelId });
  const chat = geminiModel.startChat({ history });
  const streamResult = await chat.sendMessageStream(prompt);

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  for await (const chunk of streamResult.stream) {
    const chunkText = chunk.text();
    if (chunkText) {
      res.write(chunkText);
    }
  }

  res.end();
}

async function streamOpenAICompletion({ messages, model, res }) {
  const apiKey = process.env.open_ai_key || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OpenAI API key (set open_ai_key or OPENAI_API_KEY)");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || "gpt-4o",
      messages,
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text().catch(() => "OpenAI API request failed");
    throw new Error(errorText || "OpenAI API request failed");
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";

  const processEvent = (eventChunk) => {
    const trimmed = eventChunk.trim();
    if (!trimmed) return false;
    const lines = trimmed.split("\n");
    let shouldClose = false;
    lines.forEach((line) => {
      if (!line.startsWith("data:")) return;
      const dataStr = line.replace(/^data:\s*/, "");
      if (dataStr === "[DONE]") {
        shouldClose = true;
        return;
      }
      if (!dataStr) return;
      try {
        const parsed = JSON.parse(dataStr);
        const delta = parsed?.choices?.[0]?.delta?.content;
        if (delta) {
          res.write(delta);
        }
      } catch (err) {
        console.warn("Kon OpenAI chunk niet parsen", err);
      }
    });
    return shouldClose;
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundaryIndex;
    while ((boundaryIndex = buffer.indexOf("\n\n")) !== -1) {
      const eventChunk = buffer.slice(0, boundaryIndex);
      buffer = buffer.slice(boundaryIndex + 2);
      const shouldClose = processEvent(eventChunk);
      if (shouldClose) {
        res.end();
        return;
      }
    }
  }

  if (buffer.length) {
    const shouldClose = processEvent(buffer);
    if (shouldClose) {
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
      return res.status(405).json({ error: "Method not allowed" });
    }

    const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
    const parsedBody = rawBody ? JSON.parse(rawBody) : {};
    const { messages, model, webSearch } = parsedBody || {};

    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "Messages array is required" });
    }

    let enrichedMessages = [...messages];
    if (webSearch) {
      const lastUser = [...messages].reverse().find((m) => m.role === "user" && typeof m.content === "string");
      const query = lastUser?.content || "";
      const webContext = await fetchWebResults(query);
      if (webContext) {
        enrichedMessages = [
          {
            role: "system",
            content:
              "Je hebt toegang tot recente webresultaten. Gebruik deze samenvatting voor je antwoord als het relevant is:\n" +
              webContext +
              "\nNoem geen niet-bestaande links.",
          },
          ...messages,
        ];
      }
    }

    const requestedModel = typeof model === "string" ? model : "";
    const wantsGemini = requestedModel.toLowerCase().includes("gemini") || requestedModel === "Gemini 3";

    if (wantsGemini) {
      if (!geminiSdkAvailable || !GoogleGenerativeAI) {
        return res.status(503).json({ error: "Alleen beschikbaar op Vercel" });
      }
      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (!geminiApiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY ontbreekt" });
      }
      await streamGeminiCompletion({
        messages: enrichedMessages,
        modelLabel: requestedModel,
        res,
        apiKey: geminiApiKey,
      });
      return;
    }

    await streamOpenAICompletion({ messages: enrichedMessages, model: requestedModel, res });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error && error.message ? error.message : "Unexpected error";
    if (res.headersSent) {
      res.end();
      return;
    }
    res.status(500).json({ error: message });
  }
};
