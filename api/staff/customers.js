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

async function supabaseRest(path, { method = "GET", accessKey, body } = {}) {
  const headers = {
    apikey: accessKey,
    Authorization: `Bearer ${accessKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`rest_failed:${resp.status}:${text}`);
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
      // Return all customers (profiles)
      const rows = await supabaseRest(
        "profiles?select=id,email,created_at,cancelled_at,free_months,plan&order=created_at.desc",
        { method: "GET", accessKey: serviceRoleKey }
      );
      return json(res, 200, { customers: rows || [] });
    }

    if (req.method === "POST") {
      const body = await readJson(req);
      const action = body?.action;

      if (action === "ensure_profile") {
        const id = body?.id;
        const email = body?.email;
        if (!id || !email) return json(res, 400, { error: "Missing id/email" });

        // Upsert minimal row
        const rows = await supabaseRest("profiles", {
          method: "POST",
          accessKey: serviceRoleKey,
          body: [{ id, email, plan: "free", updated_at: new Date().toISOString() }],
        });
        return json(res, 200, { ok: true, profile: rows?.[0] || null });
      }

      const id = body?.id;
      if (!id) return json(res, 400, { error: "Missing id" });

      if (action === "grant_free_months") {
        const months = Number(body?.months || 0);
        if (!Number.isFinite(months) || months <= 0) return json(res, 400, { error: "Invalid months" });

        // Read current free_months
        const existing = await supabaseRest(`profiles?select=free_months&id=eq.${encodeURIComponent(id)}`, {
          method: "GET",
          accessKey: serviceRoleKey,
        });
        const current = Number(existing?.[0]?.free_months || 0);
        const next = current + months;

        const updated = await supabaseRest(`profiles?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH",
          accessKey: serviceRoleKey,
          body: { free_months: next, updated_at: new Date().toISOString() },
        });
        return json(res, 200, { ok: true, free_months: updated?.[0]?.free_months ?? next });
      }

      if (action === "cancel_subscription") {
        const updated = await supabaseRest(`profiles?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH",
          accessKey: serviceRoleKey,
          body: { cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        });
        return json(res, 200, { ok: true, cancelled_at: updated?.[0]?.cancelled_at || null });
      }

      if (action === "delete_customer") {
        await supabaseRest(`profiles?id=eq.${encodeURIComponent(id)}`, {
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


