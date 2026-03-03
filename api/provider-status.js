const { getBearerToken, json } = require("./_lib/security");
const { getUserFromAccessToken } = require("./_lib/supabase");
const {
  getOpenAIApiKey,
  getGeminiApiKey,
  getNanoBananaApiKey,
  getGrokApiKey,
  getClaudeApiKey,
  getDeepSeekApiKey,
} = require("./_lib/env");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return json(res, 405, { error: "Method not allowed" });
    }

    const token = getBearerToken(req);
    if (!token) return json(res, 401, { error: "Unauthorized" });

    const user = await getUserFromAccessToken(token);
    if (!user?.id) return json(res, 401, { error: "Unauthorized" });

    const openai = Boolean(getOpenAIApiKey());
    const gemini = Boolean(getGeminiApiKey() || getNanoBananaApiKey());
    const grok = Boolean(getGrokApiKey());
    const claude = Boolean(getClaudeApiKey());
    const deepseek = Boolean(getDeepSeekApiKey());

    return json(res, 200, { openai, gemini, grok, claude, deepseek });
  } catch (error) {
    console.error("provider-status failed", error);
    return json(res, 500, { error: "Er ging iets mis. Probeer opnieuw." });
  }
};


