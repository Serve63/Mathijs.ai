const DEFAULT_MAX_JSON_BYTES = 64 * 1024;

const SECRET_PATTERNS = [
  // OpenAI
  /\bsk-[A-Za-z0-9_-]{10,}\b/g,
  // Stripe
  /\bsk_live_[A-Za-z0-9]{10,}\b/g,
  /\brk_live_[A-Za-z0-9]{10,}\b/g,
  /\bwhsec_[A-Za-z0-9]{10,}\b/g,
  // Google / Gemini
  /\bAIza[0-9A-Za-z_-]{20,}\b/g,
  // Supabase secret keys (publishable is ok, but redact anyway if it slips in)
  /\bsb_(?:secret|service_role)_[A-Za-z0-9_-]{10,}\b/g,
];

function redactSecrets(value) {
  if (!value) return value;
  const text = String(value);
  return SECRET_PATTERNS.reduce((out, pattern) => out.replace(pattern, "***REDACTED***"), text);
}

function setCommonApiHeaders(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function json(res, status, body, extraHeaders = {}) {
  res.statusCode = status;
  setCommonApiHeaders(res);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  Object.entries(extraHeaders).forEach(([key, val]) => res.setHeader(key, val));
  res.end(JSON.stringify(body));
}

async function readJson(req, { maxBytes = DEFAULT_MAX_JSON_BYTES } = {}) {
  return await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > maxBytes) {
        const err = new Error("payload_too_large");
        err.code = "payload_too_large";
        reject(err);
      }
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        const err = new Error("invalid_json");
        err.code = "invalid_json";
        reject(err);
      }
    });
  });
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || typeof authHeader !== "string") return null;
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  return token || null;
}

function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    return xff.split(",")[0].trim();
  }
  const xri = req.headers["x-real-ip"];
  if (typeof xri === "string" && xri.trim()) return xri.trim();
  return req.socket?.remoteAddress || "unknown";
}

function checkSameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (!origin || !host) return true;
  try {
    const originHost = new URL(String(origin)).host;
    return originHost === String(host);
  } catch {
    return false;
  }
}

function getRateLimitStore() {
  const g = globalThis;
  if (!g.__mathijsRateLimit) {
    g.__mathijsRateLimit = new Map();
  }
  return g.__mathijsRateLimit;
}

function rateLimit({ key, limit, windowMs }) {
  const store = getRateLimitStore();
  const now = Date.now();

  const entry = store.get(key);
  if (!entry || now >= entry.resetAt) {
    const next = { count: 1, resetAt: now + windowMs };
    store.set(key, next);
    return { ok: true, remaining: Math.max(0, limit - next.count), resetAt: next.resetAt };
  }

  entry.count += 1;
  store.set(key, entry);

  const remaining = limit - entry.count;
  return { ok: remaining >= 0, remaining: Math.max(0, remaining), resetAt: entry.resetAt };
}

function rateLimitHeaders(limitResult, limit) {
  const resetSec = Math.max(0, Math.ceil((limitResult.resetAt - Date.now()) / 1000));
  return {
    "RateLimit-Limit": String(limit),
    "RateLimit-Remaining": String(limitResult.remaining),
    "RateLimit-Reset": String(resetSec),
  };
}

function publicError(res, status, publicMessage, err) {
  const safeMessage = redactSecrets(publicMessage || "Er ging iets mis.");
  if (err) {
    const detail = redactSecrets(err?.stack || err?.message || String(err));
    console.error(detail);
  }
  json(res, status, { error: safeMessage });
}

module.exports = {
  DEFAULT_MAX_JSON_BYTES,
  redactSecrets,
  json,
  readJson,
  getBearerToken,
  getClientIp,
  checkSameOrigin,
  rateLimit,
  rateLimitHeaders,
  publicError,
  setCommonApiHeaders,
};

