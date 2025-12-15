// Vercel Serverless Function: Signup via Supabase Admin API (email confirmed)
//
// Why: if Supabase email sending/confirmation isn't configured, client signUp can require email verification
// and users won't receive a mail. This endpoint creates the user with `email_confirm: true`.
//
// Requires Vercel env var:
// - SUPABASE_SERVICE_ROLE_KEY

const SUPABASE_URL = "https://mengrlsqgshxqcxhirjn.supabase.co";

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

async function supabaseAuthAdmin(path, { method = "POST", accessKey, body } = {}) {
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
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!resp.ok) {
    const msg = payload?.message || payload?.error_description || payload?.error || text || "Supabase admin request failed";
    const error = new Error(String(msg));
    error.statusCode = resp.status;
    throw error;
  }

  return payload;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) return json(res, 500, { error: "Missing SUPABASE_SERVICE_ROLE_KEY" });

    const body = await readJson(req);
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !password) return json(res, 400, { error: "Missing email/password" });
    if (password.length < 6) return json(res, 400, { error: "Password must be at least 6 characters" });

    await supabaseAuthAdmin("users", {
      accessKey: serviceRoleKey,
      body: {
        email,
        password,
        email_confirm: true,
        user_metadata: { username: email },
      },
    });

    return json(res, 200, { ok: true });
  } catch (e) {
    const status = Number(e?.statusCode) || 500;
    return json(res, status, { error: String(e?.message || e) });
  }
};

