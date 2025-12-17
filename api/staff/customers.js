// Vercel Serverless Function: Staff customer management
//
// Requires Vercel env var:
// - SUPABASE_SERVICE_ROLE_KEY
//
// Auth: expects `Authorization: Bearer <supabase_access_token>`

const { getBearerToken, getClientIp, json, publicError, rateLimit, rateLimitHeaders, readJson } = require("../_lib/security");
const { SUPABASE_URL, getUserFromAccessToken } = require("../_lib/supabase");
const { isStaffUser } = require("../_lib/staff");

const STAFF_WINDOW_MS = 60_000;
const STAFF_LIMIT = 120;

async function supabaseAuthAdmin(path, { method = "GET", accessKey, body } = {}) {
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

function normalizeCustomerFromUser(u) {
  const appMeta = u?.app_metadata || {};
  return {
    id: u?.id,
    email: u?.email,
    created_at: u?.created_at,
    cancelled_at: appMeta.cancelled_at || null,
    free_months: Number(appMeta.free_months || 0),
    lifetime_free: Boolean(appMeta.lifetime_free) || appMeta.plan === "lifetime",
    plan: appMeta.plan || "free",
  };
}

module.exports = async (req, res) => {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return json(res, 500, {
        error:
          "Missing SUPABASE_SERVICE_ROLE_KEY. Add it in Vercel project settings (Environment Variables) and redeploy.",
      });
    }

    const token = getBearerToken(req);
    if (!token) return json(res, 401, { error: "Missing Authorization Bearer token" });

    const ip = getClientIp(req);
    const rate = rateLimit({ key: `staff:ip:${ip}`, limit: STAFF_LIMIT, windowMs: STAFF_WINDOW_MS });
    if (!rate.ok) {
      return json(res, 429, { error: "Te veel verzoeken. Probeer later opnieuw." }, rateLimitHeaders(rate, STAFF_LIMIT));
    }

    const user = await getUserFromAccessToken(token);
    if (!user?.id || !user?.email) return json(res, 401, { error: "Unauthorized" });
    const confirmedAt = user?.email_confirmed_at || user?.confirmed_at;
    if (!confirmedAt) return json(res, 403, { error: "Forbidden (email not verified)" });
    if (!isStaffUser(user)) return json(res, 403, { error: "Forbidden (not staff)" });

    if (req.method === "GET") {
      // Return all customers from Supabase Auth users (no DB table needed)
      // Note: Supabase admin list is paginated. We pull first 1000 for now.
      const out = [];
      let page = 1;
      const perPage = 200;
      while (page <= 5) {
        const resp = await supabaseAuthAdmin(`users?page=${page}&per_page=${perPage}`, {
          method: "GET",
          accessKey: serviceRoleKey,
        });
        const users = resp?.users || [];
        users.forEach((u) => out.push(normalizeCustomerFromUser(u)));
        if (users.length < perPage) break;
        page += 1;
      }
      // newest first
      out.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
      return json(res, 200, { customers: out });
    }

    if (req.method === "POST") {
      const body = await readJson(req);
      const action = body?.action;

      const id = body?.id;
      if (!id) return json(res, 400, { error: "Missing id" });

      if (action === "grant_free_months") {
        const months = Number(body?.months || 0);
        if (!Number.isFinite(months) || months <= 0) return json(res, 400, { error: "Invalid months" });

        // Read user to get current metadata
        const u = await supabaseAuthAdmin(`users/${encodeURIComponent(id)}`, {
          method: "GET",
          accessKey: serviceRoleKey,
        });
        const current = Number(u?.user?.app_metadata?.free_months || 0);
        const next = current + months;

        await supabaseAuthAdmin(`users/${encodeURIComponent(id)}`, {
          method: "PUT",
          accessKey: serviceRoleKey,
          body: { app_metadata: { ...(u?.user?.app_metadata || {}), free_months: next } },
        });
        return json(res, 200, { ok: true, free_months: next });
      }

      if (action === "cancel_subscription") {
        const nowIso = new Date().toISOString();
        const u = await supabaseAuthAdmin(`users/${encodeURIComponent(id)}`, {
          method: "GET",
          accessKey: serviceRoleKey,
        });
        await supabaseAuthAdmin(`users/${encodeURIComponent(id)}`, {
          method: "PUT",
          accessKey: serviceRoleKey,
          body: { app_metadata: { ...(u?.user?.app_metadata || {}), cancelled_at: nowIso } },
        });
        return json(res, 200, { ok: true, cancelled_at: nowIso });
      }

      if (action === "set_lifetime_free") {
        const enabled = Boolean(body?.enabled);
        const u = await supabaseAuthAdmin(`users/${encodeURIComponent(id)}`, {
          method: "GET",
          accessKey: serviceRoleKey,
        });
        await supabaseAuthAdmin(`users/${encodeURIComponent(id)}`, {
          method: "PUT",
          accessKey: serviceRoleKey,
          body: { app_metadata: { ...(u?.user?.app_metadata || {}), lifetime_free: enabled } },
        });
        return json(res, 200, { ok: true, lifetime_free: enabled });
      }

      if (action === "delete_customer") {
        await supabaseAuthAdmin(`users/${encodeURIComponent(id)}`, {
          method: "DELETE",
          accessKey: serviceRoleKey,
        });
        return json(res, 200, { ok: true });
      }

      return json(res, 400, { error: "Unknown action" });
    }

    return json(res, 405, { error: "Method not allowed" });
  } catch (e) {
    return publicError(res, 500, "Verzoek mislukt. Probeer later opnieuw.", e);
  }
};
