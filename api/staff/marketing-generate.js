// Vercel Serverless Function: Staff marketing generator
//
// Requires Vercel env var:
// - OPENAI_API_KEY
//
// Auth: expects `Authorization: Bearer <supabase_access_token>`

const { getBearerToken, getClientIp, json, publicError, rateLimit, rateLimitHeaders, readJson, redactSecrets } = require("../_lib/security");
const { getUserFromAccessToken } = require("../_lib/supabase");
const { isStaffUser } = require("../_lib/staff");

const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL_ID = "gpt-4-turbo";

const STAFF_WINDOW_MS = 60_000;
const STAFF_LIMIT = 90;

function buildPrompt(input) {
  const channel = String(input?.channel || "instagram");
  const objective = String(input?.objective || "awareness");
  const tone = String(input?.tone || "").trim();
  const product = String(input?.product || "").trim();
  const audience = String(input?.audience || "").trim();
  const offer = String(input?.offer || "").trim();
  const notes = String(input?.notes || "").trim();

  const parts = [];
  parts.push(`Kanaal: ${channel}`);
  parts.push(`Doel: ${objective}`);
  if (tone) parts.push(`Tone of voice: ${tone}`);
  if (audience) parts.push(`Doelgroep: ${audience}`);
  if (offer) parts.push(`Aanbod/CTA: ${offer}`);
  if (notes) parts.push(`Extra context: ${notes}`);
  parts.push("");
  parts.push("Product/dienst:");
  parts.push(product);

  const formats = {
    instagram: [
      "Schrijf 1 Instagram post (NL).",
      "Geef: 1 sterke hook (1 zin), caption (max ~1200 tekens), 8–15 relevante hashtags, en 3 korte varianten van de eerste zin.",
      "Geen emoji verplicht; wel oké als het past bij tone.",
    ],
    facebook: [
      "Schrijf Facebook Ads copy (NL).",
      "Geef: 3 varianten met telkens: Primary text (1–3 alinea's), Headline (max 40 tekens), Description (max 30 tekens), CTA voorstel.",
      "Houd het concreet en conversiegericht.",
    ],
    google: [
      "Schrijf Google Ads assets (NL).",
      "Geef: 15 headlines (max 30 tekens) + 4 descriptions (max 90 tekens).",
      "Zorg voor variatie (USP's, offers, CTA, bezwaren).",
      "Zet elke headline/description op een nieuwe regel en label ze duidelijk.",
    ],
    linkedin: [
      "Schrijf LinkedIn Ads copy (NL).",
      "Geef: 2–3 varianten met telkens: Intro text (max 300 tekens), Headline (max 70 tekens), CTA voorstel.",
      "B2B-stijl, professioneel maar menselijk.",
    ],
  };

  const instruction = (formats[channel] || formats.instagram).join("\n");

  return {
    system:
      "Je bent een senior performance marketeer en copywriter. Schrijf helder, direct en zonder vage claims. Vermijd misleidende beloftes. Schrijf in vloeiend Nederlands.",
    user: `${instruction}\n\nInput:\n${parts.join("\n")}`,
  };
}

async function callOpenAI({ system, user }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const err = new Error("missing_openai_api_key");
    err.statusCode = 500;
    throw err;
  }

  const resp = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL_ID,
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`openai_failed:${resp.status}:${redactSecrets(text)}`);
  }
  if (!text) return "";
  const payload = JSON.parse(text);
  return payload?.choices?.[0]?.message?.content || "";
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return json(res, 405, { error: "Method not allowed" });
    }

    const token = getBearerToken(req);
    if (!token) return json(res, 401, { error: "Missing Authorization Bearer token" });

    const ip = getClientIp(req);
    const rate = rateLimit({ key: `staff_marketing:ip:${ip}`, limit: STAFF_LIMIT, windowMs: STAFF_WINDOW_MS });
    if (!rate.ok) {
      return json(res, 429, { error: "Te veel verzoeken. Probeer later opnieuw." }, rateLimitHeaders(rate, STAFF_LIMIT));
    }

    const user = await getUserFromAccessToken(token);
    if (!user?.id || !user?.email) return json(res, 401, { error: "Unauthorized" });
    const confirmedAt = user?.email_confirmed_at || user?.confirmed_at;
    if (!confirmedAt) return json(res, 403, { error: "Forbidden" });
    if (!isStaffUser(user)) return json(res, 403, { error: "Forbidden" });

    const body = await readJson(req);
    const product = String(body?.product || "").trim();
    if (!product) return json(res, 400, { error: "Missing product" });

    const prompt = buildPrompt(body);
    const result = await callOpenAI(prompt);
    return json(res, 200, { ok: true, result: String(result || "").trim() });
  } catch (e) {
    const status = e?.statusCode || 500;
    const msg =
      e?.message === "missing_openai_api_key"
        ? "AI provider is niet geconfigureerd."
        : "Verzoek mislukt. Probeer later opnieuw.";
    return publicError(res, status, msg, e);
  }
};

