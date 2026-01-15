const { SUPABASE_URL } = require("./supabase");
const { getSupabaseServiceRoleKey } = require("./env");

function getServiceRoleKey() {
  const key = getSupabaseServiceRoleKey();
  if (!key) {
    const err = new Error("missing_service_role_key");
    err.statusCode = 500;
    err.publicMessage =
      "Supabase service role key missing (set SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_KEY / SUPABASE_SERVICE_ROLE).";
    throw err;
  }
  return key;
}

async function adminRestFetch(pathWithQuery, { method = "GET", body } = {}) {
  const serviceRoleKey = getServiceRoleKey();
  const url = `${SUPABASE_URL}/rest/v1/${pathWithQuery.replace(/^\//, "")}`;
  const resp = await fetch(url, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
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
    const err = new Error(`supabase_rest_failed:${resp.status}`);
    err.statusCode = resp.status;
    err.detail = payload;
    throw err;
  }
  return payload;
}

async function adminRestCount(pathWithQuery) {
  const serviceRoleKey = getServiceRoleKey();
  const url = `${SUPABASE_URL}/rest/v1/${pathWithQuery.replace(/^\//, "")}`;
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: "count=exact",
      "Content-Type": "application/json",
    },
  });

  const text = await resp.text();
  if (!resp.ok) {
    const err = new Error(`supabase_rest_failed:${resp.status}`);
    err.statusCode = resp.status;
    err.detail = text;
    throw err;
  }

  const range = resp.headers.get("content-range") || "";
  const total = Number(range.split("/")[1]);
  return Number.isFinite(total) ? total : 0;
}

module.exports = {
  getServiceRoleKey,
  adminRestFetch,
  adminRestCount,
};
