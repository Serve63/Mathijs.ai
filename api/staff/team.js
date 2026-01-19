// Vercel Serverless Function: staff team management
//
// Requires env vars:
// - SUPABASE_SERVICE_ROLE_KEY
//
// Auth: expects `Authorization: Bearer <supabase_access_token>`

const {
  getBearerToken,
  getClientIp,
  json,
  publicError,
  rateLimit,
  rateLimitHeaders,
  readJson,
  redactSecrets,
} = require("../_lib/security");
const { SUPABASE_URL, getUserFromAccessToken } = require("../_lib/supabase");
const { isStaffUser, isAllowlistedStaff } = require("../_lib/staff");
const { getSupabaseServiceRoleKey } = require("../_lib/env");

const STAFF_WINDOW_MS = 60_000;
const STAFF_LIMIT = 120;

function isValidEmail(email) {
  const e = (email || "").trim();
  if (e.length < 6 || e.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isDuplicateUserError(message = "") {
  const msg = message.toLowerCase();
  return (
    msg.includes("already registered") ||
    msg.includes("already exists") ||
    msg.includes("email_exists") ||
    msg.includes("duplicate") ||
    msg.includes("users_email_key") ||
    msg.includes("user already exists")
  );
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

async function findUserByEmail(accessKey, email) {
  const needle = normalizeEmail(email);
  if (!needle) return null;
  let page = 1;
  const perPage = 200;
  while (page <= 5) {
    const resp = await supabaseAuthAdmin(`users?page=${page}&per_page=${perPage}`, {
      method: "GET",
      accessKey,
    });
    const users = resp?.users || [];
    const found = users.find((u) => normalizeEmail(u?.email) === needle);
    if (found) return found;
    if (users.length < perPage) break;
    page += 1;
  }
  return null;
}

function getAdminUserPayload(payload) {
  return payload?.user || payload;
}

function normalizeStaffUser(u) {
  const appMeta = u?.app_metadata || {};
  const userMeta = u?.user_metadata || {};
  const email = u?.email || "";
  const name =
    (typeof userMeta.full_name === "string" && userMeta.full_name.trim()) ||
    (typeof userMeta.name === "string" && userMeta.name.trim()) ||
    (email ? email.split("@")[0] : "Onbekend");
  const role = String(appMeta.role || (appMeta.is_staff ? "staff" : "user")).toLowerCase();
  const allowlisted = isAllowlistedStaff(u);
  return {
    id: u?.id,
    email,
    name,
    role,
    is_allowlisted: allowlisted,
    created_at: u?.created_at,
    last_sign_in_at: u?.last_sign_in_at,
  };
}

module.exports = async (req, res) => {
  try {
    const serviceRoleKey = getSupabaseServiceRoleKey();
    if (!serviceRoleKey) {
      return json(res, 500, {
        error:
          "Missing SUPABASE_SERVICE_ROLE_KEY or supabase_service_role_key. Add it in Vercel project settings (Environment Variables) and redeploy.",
      });
    }

    const token = getBearerToken(req);
    if (!token) return json(res, 401, { error: "Missing Authorization Bearer token" });

    const ip = getClientIp(req);
    const rate = rateLimit({ key: `staff_team:ip:${ip}`, limit: STAFF_LIMIT, windowMs: STAFF_WINDOW_MS });
    if (!rate.ok) {
      return json(res, 429, { error: "Te veel verzoeken. Probeer later opnieuw." }, rateLimitHeaders(rate, STAFF_LIMIT));
    }

    const user = await getUserFromAccessToken(token);
    if (!user?.id || !user?.email) return json(res, 401, { error: "Unauthorized" });
    const confirmedAt = user?.email_confirmed_at || user?.confirmed_at;
    if (!confirmedAt) return json(res, 403, { error: "Forbidden (email not verified)" });
    if (!isStaffUser(user)) return json(res, 403, { error: "Forbidden (not staff)" });

    if (req.method === "GET") {
      const out = [];
      let page = 1;
      const perPage = 200;
      while (page <= 5) {
        const resp = await supabaseAuthAdmin(`users?page=${page}&per_page=${perPage}`, {
          method: "GET",
          accessKey: serviceRoleKey,
        });
        const users = resp?.users || [];
        users.forEach((u) => {
          if (isStaffUser(u)) out.push(normalizeStaffUser(u));
        });
        if (users.length < perPage) break;
        page += 1;
      }
      out.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
      return json(res, 200, { staff: out });
    }

    if (req.method === "POST") {
      const body = await readJson(req);
      const action = body?.action;

      if (action === "create_staff") {
        const email = typeof body?.email === "string" ? body.email.trim() : "";
        const name = typeof body?.name === "string" ? body.name.trim() : "";
        const passwordRaw = typeof body?.password === "string" ? body.password.trim() : "";

        if (!email) return json(res, 400, { error: "E-mail is verplicht." });
        if (!isValidEmail(email)) return json(res, 400, { error: "Ongeldig e-mailadres." });
        if (!passwordRaw) return json(res, 400, { error: "Wachtwoord is verplicht." });
        if (passwordRaw.length < 10) {
          return json(res, 400, { error: "Wachtwoord moet minimaal 10 tekens zijn." });
        }

        const nowIso = new Date().toISOString();
        const appMeta = {
          role: "staff",
          is_staff: true,
          staff_added_at: nowIso,
          staff_removed_at: null,
        };
        const userMeta = {};
        if (name) {
          userMeta.full_name = name;
          userMeta.name = name;
        }

        try {
          const created = await supabaseAuthAdmin("users", {
            method: "POST",
            accessKey: serviceRoleKey,
            body: {
              email,
              password: passwordRaw,
              email_confirm: true,
              user_metadata: userMeta,
              app_metadata: appMeta,
            },
          });
          const createdUser = getAdminUserPayload(created);
          return json(res, 200, { ok: true, staff: normalizeStaffUser(createdUser), created: true });
        } catch (e) {
          const msg = String(e?.message || "");
          if (isDuplicateUserError(msg)) {
            const existing = await findUserByEmail(serviceRoleKey, email);
            if (!existing?.id) {
              return json(res, 409, { error: "Deze medewerker bestaat al." });
            }
            const existingMeta = existing?.app_metadata || {};
            const existingUserMeta = existing?.user_metadata || {};
            const nextMeta = { ...existingMeta, ...appMeta };
            const nextUserMeta = { ...existingUserMeta, ...userMeta };

            const updated = await supabaseAuthAdmin(`users/${encodeURIComponent(existing.id)}`, {
              method: "PUT",
              accessKey: serviceRoleKey,
              body: {
                password: passwordRaw,
                user_metadata: nextUserMeta,
                app_metadata: nextMeta,
              },
            });
            const updatedUser = getAdminUserPayload(updated) || existing;
            return json(res, 200, { ok: true, staff: normalizeStaffUser(updatedUser), created: false });
          }
          if (msg.startsWith("auth_admin_failed:")) {
            const parts = msg.split(":");
            const status = Number(parts[1]) || 500;
            const detail = parts.slice(2).join(":").trim();
            let detailMsg = detail;
            try {
              const parsed = JSON.parse(detail);
              detailMsg = parsed?.message || parsed?.error_description || parsed?.error || detail;
            } catch {
              detailMsg = detail;
            }
            return json(res, status, { error: redactSecrets(detailMsg) || "Verzoek mislukt. Probeer later opnieuw." });
          }
          return json(res, 500, { error: "Verzoek mislukt. Probeer later opnieuw." });
        }
      }

      const id = body?.id;
      if (!id) return json(res, 400, { error: "Missing id" });

      if (action === "update_password") {
        const passwordRaw = typeof body?.password === "string" ? body.password.trim() : "";
        if (!passwordRaw) return json(res, 400, { error: "Wachtwoord is verplicht." });
        if (passwordRaw.length < 10) {
          return json(res, 400, { error: "Wachtwoord moet minimaal 10 tekens zijn." });
        }

        const u = await supabaseAuthAdmin(`users/${encodeURIComponent(id)}`, {
          method: "GET",
          accessKey: serviceRoleKey,
        });
        const adminUser = getAdminUserPayload(u);
        if (!adminUser?.id) return json(res, 404, { error: "Medewerker niet gevonden." });
        if (!isStaffUser(adminUser)) {
          return json(res, 403, { error: "Wachtwoord aanpassen kan alleen bij personeel." });
        }

        await supabaseAuthAdmin(`users/${encodeURIComponent(id)}`, {
          method: "PUT",
          accessKey: serviceRoleKey,
          body: { password: passwordRaw },
        });
        return json(res, 200, { ok: true });
      }

      if (action === "remove_staff") {
        const u = await supabaseAuthAdmin(`users/${encodeURIComponent(id)}`, {
          method: "GET",
          accessKey: serviceRoleKey,
        });
        const adminUser = getAdminUserPayload(u);
        if (!adminUser?.id) return json(res, 404, { error: "Medewerker niet gevonden." });
        if (isAllowlistedStaff(adminUser)) {
          return json(res, 403, { error: "Deze medewerker staat in de allowlist en kan niet worden verwijderd." });
        }

        const currentMeta = adminUser?.app_metadata || {};
        const nextMeta = {
          ...currentMeta,
          role: "user",
          is_staff: false,
          staff_removed_at: new Date().toISOString(),
        };
        await supabaseAuthAdmin(`users/${encodeURIComponent(id)}`, {
          method: "PUT",
          accessKey: serviceRoleKey,
          body: { app_metadata: nextMeta },
        });
        return json(res, 200, { ok: true });
      }

      return json(res, 400, { error: "Unknown action" });
    }

    return json(res, 405, { error: "Method not allowed" });
  } catch (e) {
    const raw = String(e?.message || "");
    if (raw === "payload_too_large") {
      return json(res, 413, { error: "Aanvraag is te groot." });
    }
    if (raw === "invalid_json") {
      return json(res, 400, { error: "Ongeldige aanvraag." });
    }
    if (raw.startsWith("auth_admin_failed:")) {
      const parts = raw.split(":");
      const status = Number(parts[1]) || 500;
      const detail = parts.slice(2).join(":").trim();
      let detailMsg = detail;
      try {
        const parsed = JSON.parse(detail);
        detailMsg = parsed?.message || parsed?.error_description || parsed?.error || detail;
      } catch {
        detailMsg = detail;
      }
      return json(res, status, { error: redactSecrets(detailMsg) || "Verzoek mislukt. Probeer later opnieuw." });
    }
    return publicError(res, 500, "Verzoek mislukt. Probeer later opnieuw.", e);
  }
};
