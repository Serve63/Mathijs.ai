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
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
  getSupabaseAnonKey,
  DEFAULT_SUPABASE_URL,
  DEFAULT_SUPABASE_ANON_KEY,
  missingEnvError,
};
