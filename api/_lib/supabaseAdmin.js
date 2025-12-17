const { SUPABASE_URL } = require("./supabase");

function getServiceRoleKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    const err = new Error("missing_service_role_key");
    err.statusCode = 500;
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

module.exports = {
  getServiceRoleKey,
  adminRestFetch,
};

