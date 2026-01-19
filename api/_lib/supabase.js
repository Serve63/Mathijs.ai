const { getSupabaseUrl, getSupabaseAnonKey, DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY } = require("./env");

const SUPABASE_URL = getSupabaseUrl();
const SUPABASE_ANON_KEY = getSupabaseAnonKey();

async function getUserFromAccessToken(accessToken) {
  if (!accessToken) return null;
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!resp.ok) {
      console.log(`[getUserFromAccessToken] Supabase returned ${resp.status}`);
      return null;
    }
    return await resp.json();
  } catch (e) {
    console.log("[getUserFromAccessToken] Error:", e?.message || e);
    return null;
  }
}

module.exports = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  getUserFromAccessToken,
};

