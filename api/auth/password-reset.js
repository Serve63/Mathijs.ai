// Vercel Serverless Function: Send branded password reset email
//
// Requires env vars:
// - SUPABASE_SERVICE_ROLE_KEY
// - RESEND_API_KEY
// - EMAIL_FROM (e.g. "Mathijs.ai <support@mathijs.ai>")

const {
  checkSameOrigin,
  getClientIp,
  json,
  publicError,
  rateLimit,
  rateLimitHeaders,
  readJson,
} = require("../_lib/security");
const {
  getEmailFrom,
  getEmailReplyTo,
  getResendApiKey,
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
} = require("../_lib/env");

const RESET_WINDOW_MS = 15 * 60_000;
const RESET_LIMIT = 5;

function isValidEmail(email) {
  const e = (email || "").trim();
  if (e.length < 6 || e.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function getBaseUrl(req) {
  const configured = process.env.APP_BASE_URL;
  if (configured) {
    const trimmed = String(configured).trim().replace(/\/+$/, "");
    if (!/^https:\/\//i.test(trimmed)) {
      throw new Error("invalid_APP_BASE_URL");
    }
    return trimmed;
  }

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) {
    return `https://${String(vercelUrl).trim().replace(/\/+$/, "")}`;
  }

  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  if (!host) {
    throw new Error("missing_host");
  }
  return `https://${host}`;
}

async function supabaseAuthAdmin(path, accessKey, body) {
  const supabaseUrl = getSupabaseUrl();
  const resp = await fetch(`${supabaseUrl}/auth/v1/admin/${path}`, {
    method: "POST",
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
    const msg = payload?.message || payload?.error_description || payload?.error || text || "Supabase request failed";
    const error = new Error(String(msg));
    error.statusCode = resp.status;
    throw error;
  }

  return payload;
}

async function sendResendEmail({ apiKey, from, to, subject, html, text, replyTo }) {
  const payload = {
    from,
    to,
    subject,
    html,
    text,
  };
  if (replyTo) payload.reply_to = replyTo;

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await resp.text();
  if (!resp.ok) {
    const detail = body || "Resend request failed";
    const error = new Error(detail);
    error.statusCode = resp.status;
    throw error;
  }
}

function buildResetEmailHtml({ actionLink, baseUrl }) {
  const logoUrl = `${baseUrl}/assets/logo.png`;
  return `<!doctype html>
<html lang="nl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Reset je wachtwoord</title>
  </head>
  <body style="margin:0;background:#f5f6fb;font-family:Arial,sans-serif;color:#1a1a1f;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f6fb;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#ffffff;border-radius:18px;box-shadow:0 20px 60px rgba(15,23,42,0.12);">
            <tr>
              <td style="padding:32px 32px 16px;">
                <img src="${logoUrl}" alt="Mathijs.ai" width="40" height="40" style="display:block;margin-bottom:16px;" />
                <p style="margin:0;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#F5C518;font-weight:700;">Wachtwoord reset</p>
                <h1 style="margin:12px 0 12px;font-size:24px;line-height:1.3;">Reset je wachtwoord</h1>
                <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#4b5563;">
                  Je vroeg om een nieuw wachtwoord voor je Mathijs.ai account. Klik op de knop hieronder om een nieuw wachtwoord in te stellen.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0 20px;">
                  <tr>
                    <td>
                      <a href="${actionLink}" style="background:#F5C518;color:#1a1600;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700;display:inline-block;">Wachtwoord resetten</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">
                  Werkt de knop niet? Kopieer en plak deze link in je browser:
                </p>
                <p style="margin:0;font-size:12px;word-break:break-all;color:#1f2937;">${actionLink}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 28px;">
                <p style="margin:18px 0 0;font-size:12px;color:#6b7280;">
                  Heb je dit niet aangevraagd? Dan kun je deze e-mail negeren.
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:18px 0 0;font-size:12px;color:#9ca3af;">Mathijs.ai · Slim leren met AI</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildResetEmailText({ actionLink }) {
  return [
    "Reset je wachtwoord voor Mathijs.ai",
    "",
    "Open deze link om een nieuw wachtwoord in te stellen:",
    actionLink,
    "",
    "Heb je dit niet aangevraagd? Dan kun je deze e-mail negeren.",
  ].join("\n");
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
    if (!checkSameOrigin(req)) return json(res, 403, { error: "Forbidden" });

    const serviceRoleKey = getSupabaseServiceRoleKey();
    if (!serviceRoleKey) return json(res, 500, { error: "Missing SUPABASE_SERVICE_ROLE_KEY" });

    const resendApiKey = getResendApiKey();
    const emailFrom = getEmailFrom();
    if (!resendApiKey) return json(res, 500, { error: "Missing RESEND_API_KEY" });
    if (!emailFrom) return json(res, 500, { error: "Missing EMAIL_FROM" });

    const ip = getClientIp(req);
    const limitResult = rateLimit({ key: `reset:ip:${ip}`, limit: RESET_LIMIT, windowMs: RESET_WINDOW_MS });
    if (!limitResult.ok) {
      return json(res, 429, { error: "Te veel reset pogingen. Probeer later opnieuw." }, rateLimitHeaders(limitResult, RESET_LIMIT));
    }

    const body = await readJson(req, { maxBytes: 8 * 1024 });
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    if (!isValidEmail(email)) {
      return json(res, 200, { ok: true });
    }

    const baseUrl = getBaseUrl(req);
    let actionLink = "";
    try {
      const linkPayload = await supabaseAuthAdmin("generate_link", serviceRoleKey, {
        type: "recovery",
        email,
        options: {
          redirectTo: `${baseUrl}/login`,
        },
      });
      actionLink = linkPayload?.action_link || "";
    } catch (err) {
      if (/user.*not found/i.test(String(err?.message || ""))) {
        return json(res, 200, { ok: true });
      }
      throw err;
    }

    if (!actionLink) {
      return json(res, 500, { error: "Kon geen reset link genereren." });
    }

    const subject = "Reset je wachtwoord voor Mathijs.ai";
    const html = buildResetEmailHtml({ actionLink, baseUrl });
    const text = buildResetEmailText({ actionLink });
    await sendResendEmail({
      apiKey: resendApiKey,
      from: emailFrom,
      to: email,
      subject,
      html,
      text,
      replyTo: getEmailReplyTo() || undefined,
    });

    return json(res, 200, { ok: true });
  } catch (err) {
    return publicError(res, 500, "Reset link kon niet worden verstuurd. Probeer later opnieuw.", err);
  }
};
