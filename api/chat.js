let GoogleGenerativeAI = null;
let geminiSdkAvailable = false;

try {
  ({ GoogleGenerativeAI } = require("@google/generative-ai"));
  geminiSdkAvailable = typeof GoogleGenerativeAI === "function";
} catch (error) {
  console.warn("Gemini SDK niet beschikbaar:", error.message);
}

const GEMINI_MODEL_ID = "gemini-1.5-flash";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL_ID = "gpt-4-turbo";

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

async function streamGeminiResponse(res, messages) {
  if (!geminiSdkAvailable || !GoogleGenerativeAI) {
    res.status(500).json({ error: "Gemini SDK ontbreekt op deze omgeving." });
    return;
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "GEMINI_API_KEY ontbreekt." });
    return;
  }

  const { history, prompt } = splitGeminiHistory(messages);
  if (!prompt) {
    res.status(400).json({ error: "Geen gebruikersprompt aangetroffen." });
    return;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL_ID });
  const chat = model.startChat({ history });
  const stream = await chat.sendMessageStream(prompt);

  res.statusCode = 200;
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
    res.status(500).json({ error: "OPENAI_API_KEY ontbreekt." });
    return;
  }

  const response = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL_ID,
      messages,
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    let errorMessage = "OpenAI API request failed.";
    try {
      const payload = await response.json();
      if (payload?.error?.message) {
        errorMessage = payload.error.message;
      }
    } catch (jsonError) {
      try {
        errorMessage = await response.text();
      } catch (textError) {
        /* ignore */
      }
    }
    res.status(response.status || 500).json({ error: errorMessage || "OpenAI API request failed." });
    return;
  }

  res.statusCode = 200;
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
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const { messages, model } = parseBody(req);
    if (!Array.isArray(messages)) {
      res.status(400).json({ error: "Messages array is required." });
      return;
    }

    const requestedModel = typeof model === "string" ? model : "";
    const wantsGemini = requestedModel.toLowerCase().includes("gemini");

    if (wantsGemini) {
      await streamGeminiResponse(res, messages);
      return;
    }

    await streamOpenAIResponse(res, messages);
  } catch (error) {
    console.error("Chat handler error:", error);
    if (res.headersSent) {
      res.end();
      return;
    }
    res.status(500).json({ error: error.message || "Unexpected server error." });
  }
};
