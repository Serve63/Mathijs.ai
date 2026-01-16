// Vercel Serverless Function: Update user location metadata based on Vercel geo headers.
//
// Requires Vercel env var:
// - SUPABASE_SERVICE_ROLE_KEY
//
// Auth: expects `Authorization: Bearer <supabase_access_token>`

const { checkSameOrigin, getBearerToken, json, publicError } = require("../_lib/security");
const { getGeoFromRequest } = require("../_lib/geo");
const { SUPABASE_URL, getUserFromAccessToken } = require("../_lib/supabase");

async function supabaseAuthAdmin(path, { method = "PUT", accessKey, body } = {}) {
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/admin/${path}`, {
    method,
    headers: {
      apikey: accessKey,
      Authorization: `Bearer ${accessKey}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`auth_admin_failed:${resp.status}:${text}`);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
    if (!checkSameOrigin(req)) return json(res, 403, { error: "Forbidden" });

    const { getSupabaseServiceRoleKey } = require("../_lib/env");
    const serviceRoleKey = getSupabaseServiceRoleKey();
    if (!serviceRoleKey) return json(res, 500, { error: "Missing SUPABASE_SERVICE_ROLE_KEY" });

    const token = getBearerToken(req);
    if (!token) return json(res, 401, { error: "Missing Authorization Bearer token" });

    const user = await getUserFromAccessToken(token);
    if (!user?.id) return json(res, 401, { error: "Unauthorized" });

    const geo = getGeoFromRequest(req);
    if (!geo.country && !geo.region && !geo.regionName && !geo.city && !geo.provinceId && !geo.label) {
      return json(res, 200, { ok: true, updated: false });
    }

    const current = user?.user_metadata || {};
    const updates = {};

    if (!current.province_id && geo.provinceId) updates.province_id = geo.provinceId;
    if (!current.geo_label && geo.label) updates.geo_label = geo.label;
    if (!current.geo_country && geo.country) updates.geo_country = geo.country;
    if (!current.geo_region && (geo.regionName || geo.region)) updates.geo_region = geo.regionName || geo.region;
    if (!current.geo_city && geo.city) updates.geo_city = geo.city;

    if (!Object.keys(updates).length) {
      return json(res, 200, { ok: true, updated: false });
    }

    updates.geo_updated_at = new Date().toISOString();

    await supabaseAuthAdmin(`users/${encodeURIComponent(user.id)}`, {
      method: "PUT",
      accessKey: serviceRoleKey,
      body: { user_metadata: { ...current, ...updates } },
    });

    return json(res, 200, { ok: true, updated: true });
  } catch (e) {
    return publicError(res, 500, "Locatie bijwerken mislukt. Probeer later opnieuw.", e);
  }
};
