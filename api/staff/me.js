// Vercel Serverless Function: verify staff access
//
// Auth: expects `Authorization: Bearer <supabase_access_token>`
// Staff allowlist is configured via:
// - STAFF_EMAIL_ALLOWLIST (comma-separated)
// - STAFF_USER_ID_ALLOWLIST (comma-separated, optional)

const { getBearerToken, getClientIp, json, publicError, rateLimit, rateLimitHeaders } = require("../_lib/security");
const { getUserFromAccessToken } = require("../_lib/supabase");
const { isStaffUser } = require("../_lib/staff");

const STAFF_WINDOW_MS = 60_000;
const STAFF_LIMIT = 240;

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return json(res, 405, { error: "Method not allowed" });
    }

    const token = getBearerToken(req);
    if (!token) return json(res, 401, { error: "Missing Authorization Bearer token" });

    const ip = getClientIp(req);
    const rate = rateLimit({ key: `staff_me:ip:${ip}`, limit: STAFF_LIMIT, windowMs: STAFF_WINDOW_MS });
    if (!rate.ok) {
      return json(res, 429, { error: "Te veel verzoeken. Probeer later opnieuw." }, rateLimitHeaders(rate, STAFF_LIMIT));
    }

    const user = await getUserFromAccessToken(token);
    if (!user?.id || !user?.email) return json(res, 401, { error: "Unauthorized" });
    const confirmedAt = user?.email_confirmed_at || user?.confirmed_at;
    if (!confirmedAt) return json(res, 403, { error: "Forbidden" });
    if (!isStaffUser(user)) return json(res, 403, { error: "Forbidden" });

    return json(res, 200, { ok: true, staff: true, id: user.id, email: user.email });
  } catch (e) {
    return publicError(res, 500, "Verzoek mislukt. Probeer later opnieuw.", e);
  }
};

