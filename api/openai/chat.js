const OpenAI = require("openai");

const { json, readJson, redactSecrets } = require("../_lib/security");

const DEFAULT_MODEL = "gpt-5.2-chat-latest";
const ALLOWED_MODELS = new Set(["gpt-5.2-chat-latest", "gpt-5.2", "gpt-5-mini"]);
const ALLOWED_ROLES = new Set(["user", "assistant", "developer"]);

function getOpenAIApiKey() {
  const primary = process.env.OPEN_AI_KEY;
  if (typeof primary === "string" && primary.trim()) return primary.trim();
  const fallback = process.env.OPENAI_API_KEY || process.env.open_ai_key;
  if (typeof fallback === "string" && fallback.trim()) return fallback.trim();
  return null;
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((message) => {
      const role = String(message?.role || "").toLowerCase();
      const content = typeof message?.content === "string" ? message.content.trim() : "";
      if (!ALLOWED_ROLES.has(role) || !content) return null;
      return { role, content };
    })
    .filter(Boolean);
}

function extractText(response) {
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

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return json(res, 405, { error: "Method not allowed" });
    }

    const apiKey = getOpenAIApiKey();
    console.log(`[openai] key ${apiKey ? "present" : "missing"}`);
    if (!apiKey) {
      return json(res, 500, { error: "Missing OPEN_AI_KEY" });
    }

    let body = {};
    try {
      body = await readJson(req, { maxBytes: 64 * 1024 });
    } catch (error) {
      const status = error?.code === "payload_too_large" ? 413 : 400;
      return json(res, status, { error: "Invalid request body" });
    }
    const modelRaw = typeof body?.model === "string" ? body.model.trim() : "";
    const model = modelRaw || DEFAULT_MODEL;
    if (!ALLOWED_MODELS.has(model)) {
      return json(res, 400, { error: "Invalid model" });
    }

    const messages = normalizeMessages(body?.messages);
    if (!messages.length) {
      return json(res, 400, { error: "Missing messages" });
    }

    const client = new OpenAI({ apiKey });
    const response = await client.responses.create({
      model,
      input: messages.map((message) => ({ role: message.role, content: message.content })),
    });

    const text = extractText(response);
    return json(res, 200, { text: text || "" });
  } catch (error) {
    const status = Number(error?.status) || 502;
    const details = redactSecrets(error?.message || "");
    if (details) {
      console.error(`[openai] request failed: ${details}`);
    } else {
      console.error("[openai] request failed");
    }
    return json(res, status, { error: "OpenAI request failed.", details: details || undefined });
  }
};
