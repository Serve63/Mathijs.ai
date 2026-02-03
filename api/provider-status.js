const { getBearerToken, json } = require("./_lib/security");
const { getUserFromAccessToken } = require("./_lib/supabase");
const { getOpenAIApiKey, getGeminiApiKey, getGrokApiKey, getClaudeApiKey } = require("./_lib/env");

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
    const gemini = Boolean(getGeminiApiKey());
    const grok = Boolean(getGrokApiKey());
    const claude = Boolean(getClaudeApiKey());

    return json(res, 200, { openai, gemini, grok, claude });
  } catch (error) {
    console.error("provider-status failed", error);
    return json(res, 500, { error: "Er ging iets mis. Probeer opnieuw." });
  }
};


