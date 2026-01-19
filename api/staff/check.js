// Vercel Serverless Function: Staff diagnostic check
//
// Tests Supabase service role key configuration

const { getBearerToken, getClientIp, json, rateLimit, rateLimitHeaders } = require("../_lib/security");
const { SUPABASE_URL, getUserFromAccessToken } = require("../_lib/supabase");
const { isStaffUser } = require("../_lib/staff");

const STAFF_WINDOW_MS = 60_000;
const STAFF_LIMIT = 30;

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return json(res, 405, { error: "Method not allowed" });
    }

    const token = getBearerToken(req);
    if (!token) return json(res, 401, { error: "Missing Authorization Bearer token" });

    const ip = getClientIp(req);
    const rate = rateLimit({ key: `staff_check:ip:${ip}`, limit: STAFF_LIMIT, windowMs: STAFF_WINDOW_MS });
    if (!rate.ok) {
      return json(res, 429, { error: "Te veel verzoeken. Probeer later opnieuw." }, rateLimitHeaders(rate, STAFF_LIMIT));
    }

    const user = await getUserFromAccessToken(token);
    if (!user?.id || !user?.email) return json(res, 401, { error: "Unauthorized" });
    if (!isStaffUser(user)) return json(res, 403, { error: "Forbidden (not staff)" });

    // Check service role key
    const { getSupabaseServiceRoleKey } = require("../_lib/env");
    const serviceRoleKey = getSupabaseServiceRoleKey();

    const diagnostics = {
      supabase_url: SUPABASE_URL ? "configured" : "missing",
      service_role_key: serviceRoleKey ? "configured" : "MISSING",
      service_role_key_length: serviceRoleKey ? serviceRoleKey.length : 0,
      service_role_key_format: serviceRoleKey
        ? serviceRoleKey.startsWith("eyJ")
          ? "jwt"
          : serviceRoleKey.startsWith("sb_")
          ? "sb_format"
          : "unknown"
        : "n/a",
    };

    // Test Supabase Admin API connection
    if (serviceRoleKey) {
      try {
        const testResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1`, {
          method: "GET",
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
          },
        });
        const testText = await testResp.text();
        diagnostics.admin_api_status = testResp.status;
        diagnostics.admin_api_ok = testResp.ok;
        if (!testResp.ok) {
          try {
            const parsed = JSON.parse(testText);
            diagnostics.admin_api_error = parsed?.message || parsed?.error_description || parsed?.error || testText.slice(0, 200);
          } catch {
            diagnostics.admin_api_error = testText.slice(0, 200);
          }
        }
      } catch (e) {
        diagnostics.admin_api_error = String(e?.message || e).slice(0, 200);
      }
    }

    return json(res, 200, { ok: true, diagnostics });
  } catch (e) {
    return json(res, 500, { error: String(e?.message || "Check failed").slice(0, 200) });
  }
};

