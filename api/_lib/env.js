const DEFAULT_SUPABASE_URL = "https://mengrlsqgshxqcxhirjn.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_PeVTrMXz6UaeMhkPn5Fs-Q_xfJFVRNt";

function pickEnv(names = []) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim()) {
      const trimmed = value.trim();
      if (trimmed.length >= 2) {
        const first = trimmed[0];
        const last = trimmed[trimmed.length - 1];
        if ((first === "\"" && last === "\"") || (first === "'" && last === "'")) {
          return trimmed.slice(1, -1);
        }
      }
      return trimmed;
    }
  }
  return null;
}

function getOpenAIApiKey() {
  return pickEnv(["OPEN_AI_KEY", "OPENAI_API_KEY", "open_ai_key"]);
}

function getOpenAICostsKey() {
  return pickEnv(["OPENAI_COSTS_KEY", "OPENAI_USAGE_KEY", "OPENAI_ADMIN_KEY"]);
}

function getGeminiApiKey() {
  return pickEnv(["GEMINI_API_KEY", "GOOGLE_API_KEY", "google_api_key"]);
}

function getNanoBananaApiKey() {
  return pickEnv([
    "NANO_BANANA_API_KEY",
    "GEMINI_NANO_BANANA_API_KEY",
    "NANOBANANA_API_KEY",
    "nano_banana_api_key",
    "gemini_nano_banana_api_key",
  ]);
}

function getNanoBananaModel() {
  return pickEnv(["NANO_BANANA_MODEL", "GEMINI_NANO_BANANA_MODEL", "nano_banana_model"]);
}

function getGrokApiKey() {
  return pickEnv(["GROK_API_KEY", "XAI_API_KEY", "grok_api_key", "xai_api_key"]);
}

function getClaudeApiKey() {
  return pickEnv(["CLAUDE_API_KEY", "ANTHROPIC_API_KEY", "claude_api_key"]);
}

function getSupabaseServiceRoleKey() {
  return pickEnv([
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_KEY",
    "SUPABASE_SERVICE_ROLE",
    "SUPABASE_SECRET_KEY",
    "supabase_service_role_key",
  ]);
}

function getSupabaseUrl() {
  return pickEnv(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]) || DEFAULT_SUPABASE_URL;
}

function getSupabaseAnonKey() {
  return pickEnv(["SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) || DEFAULT_SUPABASE_ANON_KEY;
}

function getResendApiKey() {
  return pickEnv(["RESEND_API_KEY", "RESEND_KEY", "resend_api_key"]);
}

function getEmailFrom() {
  return pickEnv(["EMAIL_FROM", "MAIL_FROM", "RESEND_FROM", "email_from"]);
}

function getEmailReplyTo() {
  return pickEnv(["EMAIL_REPLY_TO", "MAIL_REPLY_TO", "RESEND_REPLY_TO", "email_reply_to"]);
}

function missingEnvError(label, acceptedNames = []) {
  const err = new Error(`${label}_missing`);
  err.statusCode = 500;
  err.publicMessage = `${label} missing (set one of: ${acceptedNames.join(", ")})`;
  err.acceptedNames = acceptedNames;
  return err;
}

module.exports = {
  getOpenAIApiKey,
  getOpenAICostsKey,
  getGeminiApiKey,
  getNanoBananaApiKey,
  getNanoBananaModel,
  getGrokApiKey,
  getClaudeApiKey,
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
  getSupabaseAnonKey,
  getResendApiKey,
  getEmailFrom,
  getEmailReplyTo,
  DEFAULT_SUPABASE_URL,
  DEFAULT_SUPABASE_ANON_KEY,
  missingEnvError,
};
