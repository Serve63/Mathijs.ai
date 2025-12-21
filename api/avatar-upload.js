const { SUPABASE_URL, getUserFromAccessToken } = require("./_lib/supabase");
const { getSupabaseServiceRoleKey } = require("./_lib/env");

const BUCKET_NAME = "profile-images";
const MAX_BYTES = 5 * 1024 * 1024;
const SIGNED_EXPIRES = 60 * 60 * 24 * 365;

const json = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
};

const getAccessToken = (req) => {
  const header = req.headers.authorization || "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  return header.slice(7).trim();
};

const parseBody = (req) => {
  if (!req.body) return null;
  if (typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  return null;
};

const normalizeExt = (ext) => {
  const normalized = (ext || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!normalized) return "";
  if (normalized === "jpeg") return "jpg";
  return normalized;
};

const inferExt = (fileName, mimeType) => {
  const nameExt = normalizeExt(fileName?.split(".").pop());
  const allowed = new Set(["jpg", "png", "webp", "gif", "avif"]);
  if (allowed.has(nameExt)) return nameExt;
  const fallbackMap = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
  };
  return fallbackMap[mimeType] || "jpg";
};

const decodeDataUrl = ({ dataUrl, base64, contentType }) => {
  if (typeof dataUrl === "string") {
    const match = dataUrl.match(/^data:(.*?);base64,(.+)$/);
    if (!match) {
      const err = new Error("invalid_data_url");
      err.statusCode = 400;
      throw err;
    }
    const mime = contentType || match[1];
    return { mimeType: mime, base64Data: match[2] };
  }
  if (typeof base64 === "string") {
    return { mimeType: contentType, base64Data: base64 };
  }
  const err = new Error("missing_data");
  err.statusCode = 400;
  throw err;
};

const encodePath = (path) => path.split("/").map(encodeURIComponent).join("/");

const storageFetch = async (path, { method = "GET", headers = {}, body } = {}, serviceRoleKey) => {
  const resp = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      ...headers,
    },
    body,
  });
  const text = await resp.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { resp, payload };
};

const ensureBucket = async (serviceRoleKey) => {
  const { resp: getResp } = await storageFetch(`/storage/v1/bucket/${BUCKET_NAME}`, {}, serviceRoleKey);
  if (getResp.ok) return;
  if (getResp.status !== 404) {
    const err = new Error("bucket_check_failed");
    err.statusCode = getResp.status;
    throw err;
  }

  const createBody = JSON.stringify({ id: BUCKET_NAME, name: BUCKET_NAME, public: false });
  const { resp: createResp } = await storageFetch(
    "/storage/v1/bucket",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: createBody },
    serviceRoleKey
  );
  if (!createResp.ok && createResp.status !== 409) {
    const err = new Error("bucket_create_failed");
    err.statusCode = createResp.status;
    throw err;
  }
};

const updateUserMetadata = async (serviceRoleKey, userId, userMetadata) => {
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_metadata: userMetadata }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    const err = new Error(`auth_admin_failed:${resp.status}:${text}`);
    err.statusCode = resp.status;
    throw err;
  }
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { error: "Method not allowed" });
  }

  const accessToken = getAccessToken(req);
  const user = await getUserFromAccessToken(accessToken);
  if (!user) {
    return json(res, 401, { error: "Unauthorized" });
  }

  const serviceRoleKey = getSupabaseServiceRoleKey();
  if (!serviceRoleKey) {
    return json(res, 500, { error: "Supabase service role key ontbreekt." });
  }

  const payload = parseBody(req) || {};
  let decoded;
  try {
    decoded = decodeDataUrl(payload);
  } catch (error) {
    return json(res, error.statusCode || 400, { error: "Ongeldig upload formaat." });
  }

  const mimeType = decoded.mimeType || payload.contentType || "";
  if (!mimeType.startsWith("image/")) {
    return json(res, 415, { error: "Alleen afbeeldingen zijn toegestaan." });
  }

  const buffer = Buffer.from(decoded.base64Data, "base64");
  if (!buffer.length || buffer.length > MAX_BYTES) {
    return json(res, 413, { error: "Afbeelding te groot (max 5MB)." });
  }

  try {
    await ensureBucket(serviceRoleKey);
  } catch (error) {
    return json(res, error.statusCode || 500, { error: "Bucket controleren mislukt." });
  }

  const safeExt = inferExt(payload.fileName, mimeType);
  const path = `${user.id}/${Date.now()}.${safeExt}`;
  const uploadPath = `/storage/v1/object/${BUCKET_NAME}/${encodePath(path)}`;

  const uploadResp = await fetch(`${SUPABASE_URL}${uploadPath}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": mimeType,
      "x-upsert": "true",
    },
    body: buffer,
  });

  if (!uploadResp.ok) {
    const text = await uploadResp.text();
    return json(res, uploadResp.status, { error: `Upload mislukt: ${text}` });
  }

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${encodePath(path)}`;
  let signedUrl = null;

  try {
    const { resp, payload: signPayload } = await storageFetch(
      `/storage/v1/object/sign/${BUCKET_NAME}/${encodePath(path)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: SIGNED_EXPIRES }) },
      serviceRoleKey
    );
    if (resp.ok) {
      signedUrl = signPayload?.signedURL || signPayload?.signedUrl || null;
    }
  } catch (_) {}

  const avatarUrl = signedUrl || publicUrl;
  const mergedMetadata = {
    ...(user.user_metadata || {}),
    avatar_url: avatarUrl,
    avatar_bucket: BUCKET_NAME,
    avatar_path: path,
  };

  try {
    await updateUserMetadata(serviceRoleKey, user.id, mergedMetadata);
  } catch (error) {
    return json(res, error.statusCode || 500, { error: "Gebruiker bijwerken mislukt." });
  }

  return json(res, 200, {
    avatar_url: avatarUrl,
    avatar_bucket: BUCKET_NAME,
    avatar_path: path,
    public_url: publicUrl,
    signed_url: signedUrl,
  });
};
