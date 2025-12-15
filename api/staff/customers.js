// Vercel Serverless Function: Staff customer management
//
// Requires Vercel env var:
// - SUPABASE_SERVICE_ROLE_KEY
//
// Auth: expects `Authorization: Bearer <supabase_access_token>`

const SUPABASE_URL = "https://mengrlsqgshxqcxhirjn.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_PeVTrMXz6UaeMhkPn5Fs-Q_xfJFVRNt";

const STAFF_EMAIL_ALLOWLIST = [
  "servec321@gmail.com",
  // Add more explicit staff emails here if needed.
];

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  return await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
  });
}

function isStaffEmail(email) {
  const e = (email || "").toLowerCase().trim();
  if (!e) return false;
  if (STAFF_EMAIL_ALLOWLIST.includes(e)) return true;
  return e.endsWith("@mathijs.ai");
}

async function getUserFromAccessToken(accessToken) {
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`auth_user_failed:${resp.status}:${txt}`);
  }
  return await resp.json();
}

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
  const meta = u?.user_metadata || {};
  return {
    id: u?.id,
    email: u?.email,
    created_at: u?.created_at,
    cancelled_at: meta.cancelled_at || null,
    free_months: Number(meta.free_months || 0),
    lifetime_free: Boolean(meta.lifetime_free) || meta.plan === "lifetime",
    plan: meta.plan || "free",
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

    const authHeader = req.headers.authorization || req.headers.Authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
    if (!token) return json(res, 401, { error: "Missing Authorization Bearer token" });

    const user = await getUserFromAccessToken(token);
    if (!isStaffEmail(user?.email)) return json(res, 403, { error: "Forbidden (not staff)" });

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

      if (action === "ensure_profile") {
        const id = body?.id;
        const email = body?.email;
        if (!id || !email) return json(res, 400, { error: "Missing id/email" });
        // No-op for Auth-based customers (user already exists if they can login)
        return json(res, 200, { ok: true });
      }

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
        const current = Number(u?.user?.user_metadata?.free_months || 0);
        const next = current + months;

        await supabaseAuthAdmin(`users/${encodeURIComponent(id)}`, {
          method: "PUT",
          accessKey: serviceRoleKey,
          body: { user_metadata: { ...(u?.user?.user_metadata || {}), free_months: next } },
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
          body: { user_metadata: { ...(u?.user?.user_metadata || {}), cancelled_at: nowIso } },
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
          body: { user_metadata: { ...(u?.user?.user_metadata || {}), lifetime_free: enabled } },
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
    return json(res, 500, { error: String(e?.message || e) });
  }
};


