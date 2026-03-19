const OpenAI = require("openai");

const { getBearerToken, getClientIp, json, publicError, rateLimit, rateLimitHeaders, readJson } = require("./_lib/security");
const { getUserFromAccessToken } = require("./_lib/supabase");
const { SUPABASE_URL } = require("./_lib/supabase");
const {
  getOpenAIApiKey,
  getGeminiApiKey,
  getNanoBananaApiKey,
  getNanoBananaModel,
  getGrokApiKey,
  getGrokImageModel,
  getClaudeApiKey,
  getDeepSeekApiKey,
  getSupabaseServiceRoleKey,
} = require("./_lib/env");
const { adminRestFetch } = require("./_lib/supabaseAdmin");

// NOTE: UI labels may map to marketing names; server maps them to real OpenAI model IDs.
// Keep this conservative and stable across accounts/keys.
const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";
const OPENAI_ALLOWED_MODELS = ["gpt-4o", "gpt-4o-mini"];
const OPENAI_DEEP_RESEARCH_MODELS = ["o4-mini-deep-research", "o3-deep-research"];

// Gemini model IDs vary by API version and rollout. We keep a conservative default and
// map UI labels/legacy names to something likely to exist, then we try both v1 and v1beta endpoints.
const GEMINI_DEFAULT_MODEL = "gemini-1.5-flash";
const GEMINI_IMAGE_DEFAULT_MODEL = "gemini-2.5-flash-image";
const GEMINI_DEEP_RESEARCH_AGENT = "deep-research-pro-preview-12-2025";
const GEMINI_ALLOWED_MODELS = [
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gemini-pro",
  "gemini-1.0-pro",
  "gemini-1.5-flash-001",
  "gemini-1.5-pro-001",
];

// Grok model IDs - xAI API expects grok-4-0709 for Grok 4 (grok-4 is invalid/400)
const GROK_DEFAULT_MODEL = "grok-4-0709";
const GROK_ALLOWED_MODELS = ["grok-4-0709", "grok-4", "grok-beta", "grok-2", "grok-3", "grok-3-mini"];
const GROK_IMAGE_DEFAULT_MODEL = "grok-imagine-image";

// Claude (Anthropic) model IDs - Opus 4.6, Sonnet 4.6, Haiku 4.5
const CLAUDE_DEFAULT_MODEL = "claude-sonnet-4-6";
const CLAUDE_ALLOWED_MODELS = [
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-opus-4-5",
  "claude-opus-4-5-20251101",
  "claude-sonnet-4-5",
  "claude-sonnet-4-5-20250929",
  "claude-haiku-4-5",
  "claude-haiku-4-5-20251001",
];

const DEEPSEEK_DEFAULT_MODEL = "deepseek-chat";
const DEEPSEEK_REASONING_MODEL = "deepseek-reasoner";
const DEEPSEEK_ALLOWED_MODELS = [
  "deepseek-chat",
  "deepseek-reasoner",
];

const MAX_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 8000;
const MAX_TOTAL_CHARS = 24000;

const CHAT_WINDOW_MS = 60_000;
const CHAT_LIMIT_FREE = 20;
const CHAT_LIMIT_PAID = 60;
const TOKENS_PER_CHAT_DEFAULT = 1;

const CACHE_TTLS = {
  activeCustomers: 5 * 60_000,
  topupsThisMonth: 5 * 60_000,
  monthlyLimit: 60_000,
  monthSpend: 60_000,
};
const cacheStore = globalThis.__mathijsChatCache || (globalThis.__mathijsChatCache = {});

function getCacheEntry(key) {
  const entry = cacheStore[key];
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    delete cacheStore[key];
    return null;
  }
  return entry;
}

function setCacheEntry(key, value, ttlMs) {
  cacheStore[key] = {
    value,
    expiresAt: Date.now() + ttlMs,
  };
  return value;
}

const isPaidAppMeta = (appMeta = {}) => {
  const plan = String(appMeta.plan || "").toLowerCase();
  if (appMeta.lifetime_free === true || plan === "standard" || plan === "lifetime" || plan === "trial") return true;
  const freeMonths = Number(appMeta.free_months || 0);
  if (Number.isFinite(freeMonths) && freeMonths > 0) return true;
  const totalPaid = Number(appMeta.total_paid_eur || 0);
  if (Number.isFinite(totalPaid) && totalPaid > 0) return true;
  const lastPaid = Number(appMeta.last_payment_amount_eur || 0);
  if (Number.isFinite(lastPaid) && lastPaid > 0) return true;
  if (typeof appMeta.last_payment_at === "string" && appMeta.last_payment_at.trim()) return true;
  return false;
};
const STARTER_CREDITS_EUR = 15;
const DEFAULT_CREDIT_ALLOWANCE_EUR = 10;
const MODEL_TOKEN_COSTS = {
  chatgpt52: 2,
  gemini3: 1,
  opus46: 5,
  sonnet46: 3,
  haiku45: 1,
  grok4: 3,
  llama4: 1,
  qwen: 1,
  deepseekv2: 1,
};
const MODEL_LABEL_TOKEN_COSTS = [
  ["chatgpt 5.2", 2],
  ["gpt-5 mini", 1],
  ["gemini 3", 1],
  ["opus 4.6", 5],
  ["sonnet 4.6", 3],
  ["opus 4.5", 5],
  ["sonnet 4.5", 3],
  ["haiku 4.5", 1],
  ["grok 4", 3],
  ["llama 4", 1],
  ["qwen3-max", 1],
  ["deepseek v2", 1],
];
const OPENAI_MODEL_TOKEN_COSTS = {
  "gpt-4o": 2,
  "gpt-4o-mini": 1,
};
const GEMINI_MODEL_TOKEN_COSTS = {
  "gemini-1.5-flash": 1,
  "gemini-1.5-flash-001": 1,
  "gemini-1.5-pro": 2,
  "gemini-1.5-pro-001": 2,
  "gemini-pro": 2,
  "gemini-1.0-pro": 2,
};
const GROK_MODEL_TOKEN_COSTS = {
  "grok-4": 3,
  "grok-4-0709": 3,
  "grok-beta": 3,
  "grok-2": 3,
  "grok-3": 3,
  "grok-3-mini": 1,
};
const CLAUDE_MODEL_TOKEN_COSTS = {
  "claude-opus-4-6": 5,
  "claude-sonnet-4-6": 3,
  "claude-opus-4-5": 5,
  "claude-opus-4-5-20251101": 5,
  "claude-sonnet-4-5": 3,
  "claude-sonnet-4-5-20250929": 3,
  "claude-haiku-4-5": 1,
  "claude-haiku-4-5-20251001": 1,
};
const DEEPSEEK_MODEL_TOKEN_COSTS = {
  "deepseek-chat": 1,
  "deepseek-reasoner": 2,
};

function getTokensPerEur() {
  const tokensPerEur = Number(process.env.TOPUP_TOKENS_PER_EUR || 100);
  if (!Number.isFinite(tokensPerEur) || tokensPerEur <= 0) return 100;
  return Math.floor(tokensPerEur);
}

function getCreditAllowanceEur() {
  const value = Number(process.env.CREDIT_ALLOWANCE_EUR || DEFAULT_CREDIT_ALLOWANCE_EUR);
  if (!Number.isFinite(value) || value < 0) return DEFAULT_CREDIT_ALLOWANCE_EUR;
  return Math.round(value * 100) / 100;
}

function parseMonthlyLimit() {
  const value = Number(process.env.API_MONTHLY_LIMIT_EUR || 0);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

async function fetchAllUsers(serviceRoleKey) {
  const out = [];
  let page = 1;
  const perPage = 200;
  while (page <= 5) {
    const resp = await supabaseAuthAdmin(`users?page=${page}&per_page=${perPage}`, {
      method: "GET",
      accessKey: serviceRoleKey,
    });
    const users = resp?.users || [];
    users.forEach((u) => out.push(u));
    if (users.length < perPage) break;
    page += 1;
  }
  return out;
}

function isPayingCustomer(user) {
  if (!user) return false;
  const appMeta = user.app_metadata || {};
  if (appMeta.lifetime_free || appMeta.plan === "lifetime" || appMeta.plan === "trial") return true;
  const freeMonths = Number(appMeta.free_months || 0);
  if (Number.isFinite(freeMonths) && freeMonths > 0) return true;
  const totalPaid = Number(appMeta.total_paid_eur || 0);
  if (Number.isFinite(totalPaid) && totalPaid > 0) return true;
  const lastPaid = Number(appMeta.last_payment_amount_eur || 0);
  if (Number.isFinite(lastPaid) && lastPaid > 0) return true;
  return false;
}

function isActiveCustomer(user) {
  if (!isPayingCustomer(user)) return false;
  const cancelledAt = user?.app_metadata?.cancelled_at;
  return !cancelledAt;
}

async function getActiveCustomersCached(serviceRoleKey) {
  const cached = getCacheEntry("activeCustomers");
  if (cached) return cached.value;
  if (!serviceRoleKey) {
    return setCacheEntry("activeCustomers", null, CACHE_TTLS.activeCustomers);
  }
  try {
    const users = await fetchAllUsers(serviceRoleKey);
    const count = users.filter(isActiveCustomer).length;
    return setCacheEntry("activeCustomers", count, CACHE_TTLS.activeCustomers);
  } catch (_) {
    return setCacheEntry("activeCustomers", null, CACHE_TTLS.activeCustomers);
  }
}

async function getMonthlyLimitEur(serviceRoleKey) {
  const cached = getCacheEntry("monthlyLimit");
  if (cached) return cached.value;
  if (!serviceRoleKey) {
    return setCacheEntry("monthlyLimit", parseMonthlyLimit(), CACHE_TTLS.monthlyLimit);
  }
  const creditAllowance = getCreditAllowanceEur();
  let activeCustomers = null;
  let topupsThisMonth = null;
  const tasks = [];
  tasks.push(
    getActiveCustomersCached(serviceRoleKey).then((value) => {
      activeCustomers = value;
    })
  );
  tasks.push(
    getTopupsThisMonthEur()
      .then((value) => {
        topupsThisMonth = value;
      })
      .catch(() => {
        topupsThisMonth = null;
      })
  );
  await Promise.all(tasks).catch(() => {});

  const hasActiveCustomers = Number.isFinite(activeCustomers) && Number.isFinite(creditAllowance) && creditAllowance >= 0;
  const hasTopups = Number.isFinite(topupsThisMonth) && topupsThisMonth > 0;
  let computed = false;
  let total = 0;
  if (hasActiveCustomers) {
    total += activeCustomers * creditAllowance;
    computed = true;
  }
  if (hasTopups) {
    total += topupsThisMonth;
    computed = true;
  }
  if (computed) {
    return setCacheEntry("monthlyLimit", Math.round(total * 100) / 100, CACHE_TTLS.monthlyLimit);
  }
  return setCacheEntry("monthlyLimit", parseMonthlyLimit(), CACHE_TTLS.monthlyLimit);
}

function startOfMonthUtc(now) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function getMonthSpendEur() {
  const cached = getCacheEntry("monthSpend");
  if (cached) return cached.value;
  const now = new Date();
  const sinceIso = startOfMonthUtc(now).toISOString();
  let total = 0;
  let offset = 0;
  const limit = 1000;
  while (true) {
    const rows =
      (await adminRestFetch(
        `api_usage_events?select=cost_eur&created_at=gte.${encodeURIComponent(sinceIso)}&order=created_at.desc&limit=${limit}&offset=${offset}`,
        { method: "GET" }
      )) || [];
    if (!Array.isArray(rows) || rows.length === 0) break;
    rows.forEach((row) => {
      const cost = Number(row?.cost_eur || 0);
      if (Number.isFinite(cost)) total += cost;
    });
    if (rows.length < limit) break;
    offset += limit;
  }
  return setCacheEntry("monthSpend", Math.round(total * 100) / 100, CACHE_TTLS.monthSpend);
}

async function getTopupsThisMonthEur() {
  const cached = getCacheEntry("topupsThisMonth");
  if (cached) return cached.value;
  const now = new Date();
  const sinceIso = startOfMonthUtc(now).toISOString();
  let total = 0;
  let offset = 0;
  const limit = 1000;
  while (true) {
    const rows =
      (await adminRestFetch(
        `billing_events?select=amount_eur&event_type=eq.topup&paid_at=gte.${encodeURIComponent(
          sinceIso
        )}&order=paid_at.desc&limit=${limit}&offset=${offset}`,
        { method: "GET" }
      )) || [];
    if (!Array.isArray(rows) || rows.length === 0) break;
    rows.forEach((row) => {
      const amount = Number(row?.amount_eur || 0);
      if (Number.isFinite(amount)) total += amount;
    });
    if (rows.length < limit) break;
    offset += limit;
  }
  return setCacheEntry("topupsThisMonth", Math.round(total * 100) / 100, CACHE_TTLS.topupsThisMonth);
}

async function recordUsageEvent({
  userId,
  provider,
  model,
  modelLabel,
  tokens,
  tokensPerEur,
  costEur,
}) {
  if (!userId || !provider) return;
  const safeTokens = Math.max(0, Math.floor(Number(tokens) || 0));
  const safeTokensPerEur = Math.max(1, Math.floor(Number(tokensPerEur) || 100));
  const computedCost =
    Number.isFinite(Number(costEur)) && Number(costEur) >= 0
      ? Math.round(Number(costEur) * 100) / 100
      : Math.round((safeTokens / safeTokensPerEur) * 100) / 100;
  try {
    await adminRestFetch("api_usage_events", {
      method: "POST",
      body: {
        user_id: userId,
        provider,
        model: model || null,
        model_label: modelLabel || null,
        tokens: safeTokens,
        tokens_per_eur: safeTokensPerEur,
        cost_eur: computedCost,
        created_at: new Date().toISOString(),
      },
    });
  } catch (e) {
    console.warn("api_usage_events insert failed", e?.detail || e?.message || e);
  }
}

function resolveOpenAIModel(requested) {
  if (typeof requested !== "string" || !requested.trim()) {
    return OPENAI_DEFAULT_MODEL;
  }
  const raw = requested.trim();
  // Backwards compatible aliases (used by UI labels / older clients)
  const aliasMap = {
    "gpt-5.2-chat-latest": "gpt-4o",
    "gpt-5.2": "gpt-4o",
    "gpt-5-mini": "gpt-4o-mini",
    // Some older names we used in docs/clients
    "gpt-4o-latest": "gpt-4o",
  };
  const normalized = aliasMap[raw] || raw;
  if (!OPENAI_ALLOWED_MODELS.includes(normalized)) {
    console.warn(`Niet toegestane OpenAI model requested: ${raw} (→ ${normalized}). Valt terug op ${OPENAI_DEFAULT_MODEL}`);
    return OPENAI_DEFAULT_MODEL;
  }
  return normalized;
}

function resolveGeminiModel(requested) {
  if (typeof requested !== "string" || !requested.trim()) {
    return GEMINI_DEFAULT_MODEL;
  }
  let normalized = requested.trim();
  // Map various names to actual Google model identifiers
  const modelMap = {
    "gemini-1.5-flash": "gemini-1.5-flash-001",
    "gemini-1.5-flash-latest": "gemini-1.5-flash-001",
    "gemini-1.5-pro": "gemini-1.5-pro-001",
    "gemini-1.5-pro-latest": "gemini-1.5-pro-001",
    "gemini-2.0-flash": "gemini-1.5-flash",
    "gemini-2.0-flash-latest": "gemini-1.5-flash",
  };
  if (modelMap[normalized]) {
    normalized = modelMap[normalized];
  }

  if (!GEMINI_ALLOWED_MODELS.includes(normalized)) {
    console.warn(`Niet toegestane/ongekende Gemini model requested: ${normalized}. Valt terug op ${GEMINI_DEFAULT_MODEL}`);
    return GEMINI_DEFAULT_MODEL;
  }
  return normalized;
}

function resolveGrokModel(requested) {
  if (typeof requested !== "string" || !requested.trim()) {
    return GROK_DEFAULT_MODEL;
  }
  const normalized = requested.trim();
  // Map UI/legacy names to xAI API model IDs (Grok 4 = grok-4-0709)
  const modelMap = {
    "grok-4": "grok-4-0709",
    "grok-4-latest": "grok-4-0709",
    "grok-beta": "grok-4-0709",
    "grok-2": "grok-2",
    "grok-3": "grok-3",
    "grok-3-mini": "grok-3-mini",
  };
  const mapped = modelMap[normalized] || normalized;

  if (!GROK_ALLOWED_MODELS.includes(mapped)) {
    console.warn(`Niet toegestane/ongekende Grok model requested: ${normalized} (→ ${mapped}). Valt terug op ${GROK_DEFAULT_MODEL}`);
    return GROK_DEFAULT_MODEL;
  }
  return mapped;
}

function resolveClaudeModel(requested) {
  if (typeof requested !== "string" || !requested.trim()) {
    return CLAUDE_DEFAULT_MODEL;
  }
  const normalized = requested.trim();
  if (CLAUDE_ALLOWED_MODELS.includes(normalized)) return normalized;
  // Map UI labels / aliases to Anthropic API model IDs
  const modelMap = {
    "opus 4.6": "claude-opus-4-6",
    "sonnet 4.6": "claude-sonnet-4-6",
    "opus 4.5": "claude-opus-4-5",
    "claude-opus-4-5-20251101": "claude-opus-4-5",
    "sonnet 4.5": "claude-sonnet-4-5",
    "claude-sonnet-4-5-20250929": "claude-sonnet-4-5",
    "haiku 4.5": "claude-haiku-4-5",
    "claude-haiku-4-5-20251001": "claude-haiku-4-5",
  };
  const lower = normalized.toLowerCase();
  const mapped = modelMap[lower] || modelMap[normalized] || normalized;
  if (CLAUDE_ALLOWED_MODELS.includes(mapped)) return mapped;
  console.warn(`Niet toegestane/ongekende Claude model requested: ${normalized}. Valt terug op ${CLAUDE_DEFAULT_MODEL}`);
  return CLAUDE_DEFAULT_MODEL;
}

function resolveDeepSeekModel(requested) {
  if (typeof requested !== "string" || !requested.trim()) {
    return DEEPSEEK_DEFAULT_MODEL;
  }
  const normalized = requested.trim().toLowerCase();
  const modelMap = {
    "deepseek-v2": "deepseek-chat",
    "deepseek-v2-chat": "deepseek-chat",
    "deepseek-r1": "deepseek-reasoner",
  };
  const mapped = modelMap[normalized] || normalized;
  if (!DEEPSEEK_ALLOWED_MODELS.includes(mapped)) {
    console.warn(`Niet toegestane/ongekende DeepSeek model requested: ${normalized}. Valt terug op ${DEEPSEEK_DEFAULT_MODEL}`);
    return DEEPSEEK_DEFAULT_MODEL;
  }
  return mapped;
}

function normalizeModelKey(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function normalizeModelLabel(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function resolveTokensRequired({ modelKey, modelLabel, provider, requestedModel, resolvedModel }) {
  const normalizedKey = normalizeModelKey(modelKey);
  if (normalizedKey && MODEL_TOKEN_COSTS[normalizedKey]) {
    return MODEL_TOKEN_COSTS[normalizedKey];
  }

  const normalizedLabel = normalizeModelLabel(modelLabel);
  if (normalizedLabel) {
    for (const [prefix, tokens] of MODEL_LABEL_TOKEN_COSTS) {
      if (normalizedLabel.startsWith(prefix)) {
        return tokens;
      }
    }
  }

  if (provider === "openai") {
    const openaiModel = resolvedModel || resolveOpenAIModel(requestedModel);
    if (OPENAI_MODEL_TOKEN_COSTS[openaiModel]) return OPENAI_MODEL_TOKEN_COSTS[openaiModel];
  }

  if (provider === "gemini") {
    const geminiModel = resolvedModel || resolveGeminiModel(requestedModel);
    if (GEMINI_MODEL_TOKEN_COSTS[geminiModel]) return GEMINI_MODEL_TOKEN_COSTS[geminiModel];
  }

  if (provider === "grok") {
    const grokModel = resolvedModel || resolveGrokModel(requestedModel);
    if (GROK_MODEL_TOKEN_COSTS[grokModel]) return GROK_MODEL_TOKEN_COSTS[grokModel];
  }

  if (provider === "anthropic" || provider === "claude") {
    const claudeModel = resolvedModel || resolveClaudeModel(requestedModel);
    if (CLAUDE_MODEL_TOKEN_COSTS[claudeModel]) return CLAUDE_MODEL_TOKEN_COSTS[claudeModel];
  }

  if (provider === "deepseek") {
    const deepSeekModel = resolvedModel || resolveDeepSeekModel(requestedModel);
    if (DEEPSEEK_MODEL_TOKEN_COSTS[deepSeekModel]) return DEEPSEEK_MODEL_TOKEN_COSTS[deepSeekModel];
  }

  return TOKENS_PER_CHAT_DEFAULT;
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
    const safe = sanitizeProviderErrorMessage(text || "");
    const err = new Error("supabase_auth_admin_failed");
    err.statusCode = 502;
    err.publicMessage =
      `Supabase admin call faalde (${resp.status}). ` +
      `Controleer of SUPABASE_SERVICE_ROLE_KEY klopt en voldoende rechten heeft.` +
      (safe ? ` Details: ${safe}` : "");
    err.detail = safe;
    throw err;
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function normalizeContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part) return "";
        if (typeof part === "string") return part;
        if (typeof part.text === "string") return part.text;
        if (typeof part.value === "string") return part.value;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (content && typeof content === "object") {
    if (typeof content.text === "string") return content.text;
    if (typeof content.value === "string") return content.value;
  }
  return "";
}

function contentLengthForLimit(content) {
  if (typeof content === "string") return content.length;
  if (!Array.isArray(content)) return 0;
  let len = 0;
  for (const part of content) {
    if (part && part.type === "text" && typeof part.text === "string") len += part.text.length;
  }
  return len;
}

function isMultimodalContent(content) {
  return Array.isArray(content) && content.length > 0 && content.some((p) => p && (p.type === "image_url" || p.type === "image"));
}

function validateAndNormalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    const err = new Error("messages_required");
    err.statusCode = 400;
    throw err;
  }

  if (messages.length > MAX_MESSAGES) {
    const err = new Error("messages_too_many");
    err.statusCode = 413;
    throw err;
  }

  let totalChars = 0;
  const normalized = [];

  for (const message of messages) {
    const role = (message?.role || "user").toLowerCase();
    if (role !== "user" && role !== "assistant" && role !== "developer") continue;
    const rawContent = message?.content;
    const isArray = Array.isArray(rawContent);
    const content = isArray ? rawContent : normalizeContent(rawContent);
    if (isArray) {
      if (!content.length) continue;
      const textLen = contentLengthForLimit(content);
      if (textLen > MAX_MESSAGE_CHARS) {
        const err = new Error("message_too_large");
        err.statusCode = 413;
        throw err;
      }
      totalChars += textLen;
    } else {
      if (!content) continue;
      if (content.length > MAX_MESSAGE_CHARS) {
        const err = new Error("message_too_large");
        err.statusCode = 413;
        throw err;
      }
      totalChars += content.length;
    }
    if (totalChars > MAX_TOTAL_CHARS) {
      const err = new Error("messages_too_large");
      err.statusCode = 413;
      throw err;
    }

    normalized.push({ role, content: isArray ? rawContent : content });
  }

  if (!normalized.length) {
    const err = new Error("messages_empty");
    err.statusCode = 400;
    throw err;
  }

  return normalized;
}

function extractResponseText(response) {
  if (!response) return "";
  if (typeof response.output_text === "string") return response.output_text;
  const output = Array.isArray(response.output) ? response.output : [];
  let text = "";
  output.forEach((item) => {
    if (!item || !Array.isArray(item.content)) return;
    item.content.forEach((part) => {
      if (part?.type === "output_text" && typeof part.text === "string") {
        text += part.text;
      }
    });
  });
  return text;
}

function toOpenAiInputContent(content, role = "user") {
  const textType = role === "assistant" ? "output_text" : "input_text";
  if (typeof content === "string") {
    const text = content.trim();
    return text ? [{ type: textType, text }] : [];
  }
  if (!Array.isArray(content)) {
    return [];
  }

  const out = [];
  for (const part of content) {
    if (!part) continue;
    if (part.type === "text" && typeof part.text === "string" && part.text.trim()) {
      out.push({ type: textType, text: part.text });
      continue;
    }
    if (
      role !== "assistant" &&
      part.type === "image_url" &&
      part.image_url &&
      typeof part.image_url.url === "string" &&
      part.image_url.url.trim()
    ) {
      out.push({ type: "input_image", image_url: part.image_url.url });
      continue;
    }
    if (role !== "assistant" && part.type === "image" && typeof part.image === "string" && part.image.trim()) {
      out.push({ type: "input_image", image_url: part.image });
      continue;
    }
  }
  return out;
}

function extractOpenAiSources(response) {
  const output = Array.isArray(response?.output) ? response.output : [];
  const seen = new Set();
  const sources = [];
  output.forEach((item) => {
    const content = Array.isArray(item?.content) ? item.content : [];
    content.forEach((part) => {
      const annotations = Array.isArray(part?.annotations) ? part.annotations : [];
      annotations.forEach((annotation) => {
        const rawUrl =
          annotation?.url ||
          annotation?.source?.url ||
          annotation?.url_citation?.url ||
          annotation?.web_search_result?.url ||
          "";
        const rawTitle =
          annotation?.title ||
          annotation?.source?.title ||
          annotation?.url_citation?.title ||
          annotation?.web_search_result?.title ||
          "";
        const url = typeof rawUrl === "string" ? rawUrl.trim() : "";
        if (!url || seen.has(url)) return;
        seen.add(url);
        sources.push({ url, title: typeof rawTitle === "string" ? rawTitle.trim() : "" });
      });
    });
  });
  return sources;
}

function getLatestUserText(normalizedMessages) {
  if (!Array.isArray(normalizedMessages)) return "";
  for (let i = normalizedMessages.length - 1; i >= 0; i -= 1) {
    const msg = normalizedMessages[i];
    if (!msg || msg.role !== "user") continue;
    const text = typeof msg.content === "string" ? msg.content : normalizeContent(msg.content);
    if (text && text.trim()) return text.trim();
  }
  return "";
}

function buildModeInstruction({ toolMode, thinkingMode }) {
  const parts = [];
  if (
    thinkingMode === "thinking" ||
    thinkingMode === "denken" ||
    thinkingMode === "expert" ||
    thinkingMode === "heavy" ||
    thinkingMode === "pro" ||
    thinkingMode === "extended_thinking"
  ) {
    parts.push("Werk stap voor stap en controleer je redenering voordat je antwoord geeft.");
  }
  if (toolMode === "deep_research") {
    parts.push("Voer diepgaand onderzoek uit. Gebruik meerdere actuele bronnen en sluit af met een sectie 'Bronnen'.");
  }
  if (toolMode === "shopping_research") {
    parts.push("Voer winkelonderzoek uit: vergelijk concrete opties, noem prijsindicaties, plus- en minpunten en sluit af met een aanbeveling.");
  }
  if (!parts.length) return null;
  return parts.join(" ");
}

function extractOpenAiUsage(response) {
  const usage = response?.usage || {};
  const inputTokens = Number(usage?.input_tokens ?? usage?.inputTokens ?? 0);
  const outputTokens = Number(usage?.output_tokens ?? usage?.outputTokens ?? 0);
  let totalTokens = Number(usage?.total_tokens ?? usage?.totalTokens ?? 0);
  if (!Number.isFinite(totalTokens) || totalTokens <= 0) {
    const summed = (Number.isFinite(inputTokens) ? inputTokens : 0) + (Number.isFinite(outputTokens) ? outputTokens : 0);
    if (summed > 0) totalTokens = summed;
  }
  return {
    inputTokens: Number.isFinite(inputTokens) ? inputTokens : 0,
    outputTokens: Number.isFinite(outputTokens) ? outputTokens : 0,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : 0,
  };
}

function buildGeminiPrompt(normalizedMessages) {
  const developerParts = [];
  const lines = [];

  normalizedMessages.forEach((message) => {
    if (!message) return;
    const text = typeof message.content === "string" ? message.content : normalizeContent(message.content);
    if (!text) return;
    if (message.role === "developer") {
      developerParts.push(text);
      return;
    }
    if (message.role === "user") {
      lines.push(`User: ${text}`);
      return;
    }
    if (message.role === "assistant") {
      lines.push(`Assistant: ${text}`);
    }
  });

  const systemInstruction = developerParts.filter(Boolean).join("\n\n").trim();
  const header = systemInstruction ? `System: ${systemInstruction}\n\n` : "";
  return `${header}${lines.join("\n\n")}`.trim();
}

function sanitizeProviderErrorMessage(message) {
  if (!message) return "";
  return String(message)
    .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, "***REDACTED***")
    .replace(/\bsk-ant-[A-Za-z0-9_-]{10,}\b/g, "***REDACTED***")
    .replace(/\b(?:sk_live|rk_live|whsec)_[A-Za-z0-9]{10,}\b/g, "***REDACTED***")
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, "***REDACTED***")
    .replace(/\bxai-[A-Za-z0-9_-]{20,}\b/g, "***REDACTED***");
}

function extractGeminiText(payload) {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  const parts = candidates?.[0]?.content?.parts || [];
  return parts
    .map((p) => (p && typeof p.text === "string" ? p.text : ""))
    .filter(Boolean)
    .join("\n");
}

function extractGeminiUsage(payload) {
  const meta = payload?.usageMetadata || payload?.usage_metadata || {};
  const inputTokens = Number(meta?.promptTokenCount ?? meta?.prompt_token_count ?? 0);
  const outputTokens = Number(meta?.candidatesTokenCount ?? meta?.candidates_token_count ?? 0);
  let totalTokens = Number(meta?.totalTokenCount ?? meta?.total_token_count ?? 0);
  if (!Number.isFinite(totalTokens) || totalTokens <= 0) {
    const summed = (Number.isFinite(inputTokens) ? inputTokens : 0) + (Number.isFinite(outputTokens) ? outputTokens : 0);
    if (summed > 0) totalTokens = summed;
  }
  return {
    inputTokens: Number.isFinite(inputTokens) ? inputTokens : 0,
    outputTokens: Number.isFinite(outputTokens) ? outputTokens : 0,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : 0,
  };
}

async function geminiGenerateViaRest({ apiKey, model, prompt, webSearch = false }) {
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  };
  if (webSearch) {
    body.tools = [{ google_search: {} }];
  }

  const versions = ["v1", "v1beta"];
  let lastErr = null;

  for (const version of versions) {
    const url = `https://generativelanguage.googleapis.com/${version}/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const msg = payload?.error?.message || payload?.message || `${resp.status} ${resp.statusText}`;
        console.error(`[gemini] API error (${version}, model: ${model}, status: ${resp.status}):`, msg);
        if (payload?.error) {
          console.error(`[gemini] Error details:`, JSON.stringify(payload.error, null, 2));
        }
        const err = new Error(msg);
        err.status = resp.status;
        err.versionTried = version;
        err.payload = payload;
        lastErr = err;
        // try next version
        continue;
      }

      return { text: extractGeminiText(payload), usage: extractGeminiUsage(payload) };
    } catch (e) {
      console.error(`[gemini] Network/parse error (${version}, model: ${model}):`, e?.message || e);
      lastErr = e;
      continue;
    }
  }

  throw lastErr || new Error("gemini_rest_failed");
}

function getDeepResearchPollingConfig() {
  const intervalMsRaw = Number(process.env.DEEP_RESEARCH_POLL_INTERVAL_MS || 3000);
  const timeoutMsRaw = Number(process.env.DEEP_RESEARCH_POLL_TIMEOUT_MS || 90000);
  const intervalMs = Number.isFinite(intervalMsRaw) && intervalMsRaw >= 1000 ? Math.floor(intervalMsRaw) : 3000;
  const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw >= 10_000 ? Math.floor(timeoutMsRaw) : 90000;
  return { intervalMs, timeoutMs };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractSourcesFromAnyPayload(payload) {
  const out = [];
  const seen = new Set();
  const queue = [payload];

  while (queue.length) {
    const node = queue.shift();
    if (!node) continue;
    if (Array.isArray(node)) {
      for (const item of node) queue.push(item);
      continue;
    }
    if (typeof node !== "object") continue;

    const rawUrl =
      node.url ||
      node.uri ||
      node.link ||
      node.sourceUrl ||
      node.source_url ||
      node.webUri ||
      node.web_uri ||
      "";
    const rawTitle = node.title || node.name || node.sourceTitle || node.source_title || "";
    const url = typeof rawUrl === "string" ? rawUrl.trim() : "";
    if (url && /^https?:\/\//i.test(url) && !seen.has(url)) {
      seen.add(url);
      out.push({ url, title: typeof rawTitle === "string" ? rawTitle.trim() : "" });
      if (out.length >= 60) break;
    }

    for (const value of Object.values(node)) {
      if (value && (typeof value === "object" || Array.isArray(value))) queue.push(value);
    }
  }

  return out;
}

function extractGeminiImagePart(payload) {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  const parts = candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    const inlineData = part?.inlineData || part?.inline_data || null;
    const b64 = typeof inlineData?.data === "string" ? inlineData.data : "";
    const mime = typeof inlineData?.mimeType === "string" ? inlineData.mimeType : typeof inlineData?.mime_type === "string" ? inlineData.mime_type : "image/png";
    if (b64) {
      return { b64, mime };
    }
  }
  return null;
}

function extractGeminiInteractionImage(payload) {
  const outputs = Array.isArray(payload?.outputs) ? payload.outputs : [];
  for (const output of outputs) {
    if (!output || output.type !== "image") continue;
    const data = typeof output?.data === "string" ? output.data : "";
    const mime = typeof output?.mime_type === "string" ? output.mime_type : "image/png";
    if (data) {
      return { b64: data, mime };
    }
  }
  return null;
}

function extractGeminiInteractionText(payload) {
  if (payload && typeof payload?.response === "object") {
    const nested = extractGeminiInteractionText(payload.response);
    if (nested) return nested;
  }
  const outputs = Array.isArray(payload?.outputs) ? payload.outputs : [];
  const chunks = [];
  for (const output of outputs) {
    if (!output) continue;
    if (typeof output?.text === "string" && output.text.trim()) {
      chunks.push(output.text.trim());
      continue;
    }
    const parts = Array.isArray(output?.content?.parts)
      ? output.content.parts
      : Array.isArray(output?.parts)
        ? output.parts
        : [];
    for (const part of parts) {
      if (typeof part?.text === "string" && part.text.trim()) {
        chunks.push(part.text.trim());
      }
    }
  }
  return chunks.join("\n\n").trim();
}

function buildDeepResearchPrompt(messages) {
  const base = buildGeminiPrompt(messages).trim();
  if (!base) return "Voer diepgaand onderzoek uit op basis van de gegeven context en vraag.";
  return `${base}\n\nLever een gestructureerd rapport op met duidelijke koppen en concrete bronverwijzingen.`;
}

async function runGeminiDeepResearch({ apiKey, messages }) {
  const prompt = buildDeepResearchPrompt(messages);
  const agent = process.env.GEMINI_DEEP_RESEARCH_AGENT || GEMINI_DEEP_RESEARCH_AGENT;
  const { intervalMs, timeoutMs } = getDeepResearchPollingConfig();
  const start = Date.now();

  const startResp = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      input: prompt,
      agent,
      background: true,
    }),
  });
  const startPayload = await startResp.json().catch(() => ({}));
  if (!startResp.ok) {
    const msg = startPayload?.error?.message || startPayload?.message || `${startResp.status} ${startResp.statusText}`;
    throw new Error(`Gemini deep research start mislukte: ${msg}`);
  }

  const interactionRef = startPayload?.id || startPayload?.name || startPayload?.interaction?.id || startPayload?.interaction?.name;
  if (!interactionRef || typeof interactionRef !== "string") {
    throw new Error("Gemini deep research gaf geen interaction id terug.");
  }

  let latest = startPayload;
  while (Date.now() - start < timeoutMs) {
    const status = String(latest?.status || "").toLowerCase();
    const done = latest?.done === true || status === "completed";
    if (done) {
      const text = extractGeminiInteractionText(latest);
      const usage = extractGeminiUsage(latest);
      const sources = extractSourcesFromAnyPayload(latest);
      return { text, usage, sources, modelUsed: agent };
    }
    if (status === "failed" || status === "cancelled") {
      const msg =
        latest?.error?.message ||
        latest?.error ||
        latest?.status_detail ||
        `Gemini deep research status: ${status}`;
      throw new Error(typeof msg === "string" ? msg : "Gemini deep research mislukt.");
    }

    await sleep(intervalMs);
    const pollPath = interactionRef.startsWith("interactions/")
      ? `https://generativelanguage.googleapis.com/v1beta/${interactionRef}`
      : `https://generativelanguage.googleapis.com/v1beta/interactions/${encodeURIComponent(interactionRef)}`;
    const pollResp = await fetch(pollPath, {
      method: "GET",
      headers: { "x-goog-api-key": apiKey },
    });
    latest = await pollResp.json().catch(() => ({}));
    if (!pollResp.ok) {
      const msg = latest?.error?.message || latest?.message || `${pollResp.status} ${pollResp.statusText}`;
      throw new Error(`Gemini deep research polling mislukte: ${msg}`);
    }
  }

  throw new Error(
    "Gemini deep research duurt langer dan verwacht. Verhoog DEEP_RESEARCH_POLL_TIMEOUT_MS of probeer een kortere vraag."
  );
}

function resolveOpenAiDeepResearchModel() {
  const preferred = String(process.env.OPENAI_DEEP_RESEARCH_MODEL || "").trim();
  if (preferred) return preferred;
  return OPENAI_DEEP_RESEARCH_MODELS[0];
}

async function runOpenAiDeepResearch({ client, messages }) {
  const modeInstruction =
    "Voer diepgaand onderzoek uit. Gebruik meerdere actuele bronnen, citeer concrete feiten en sluit af met een sectie 'Bronnen'.";
  const effectiveMessages = [...messages, { role: "developer", content: modeInstruction }];
  const input = effectiveMessages.reduce((acc, message) => {
    const role = message.role === "developer" ? "system" : message.role;
    const content = toOpenAiInputContent(message.content, role);
    if (!content.length) return acc;
    acc.push({ role, content });
    return acc;
  }, []);
  if (!input.length) {
    throw new Error("Geen geldige OpenAI input gevonden.");
  }

  const modelCandidates = Array.from(
    new Set([resolveOpenAiDeepResearchModel(), ...OPENAI_DEEP_RESEARCH_MODELS].filter(Boolean))
  );
  const { intervalMs, timeoutMs } = getDeepResearchPollingConfig();

  let lastError = null;
  for (const deepModel of modelCandidates) {
    try {
      let response = await client.responses.create({
        model: deepModel,
        input,
        background: true,
        tools: [{ type: "web_search_preview" }],
      });

      const id = response?.id;
      const start = Date.now();
      while (id && Date.now() - start < timeoutMs) {
        const status = String(response?.status || "").toLowerCase();
        if (status === "completed") {
          const text = extractResponseText(response);
          const usage = extractOpenAiUsage(response);
          const sources = extractOpenAiSources(response);
          const fallbackSources = sources.length ? sources : extractSourcesFromAnyPayload(response);
          return { text, usage, sources: fallbackSources, modelUsed: deepModel };
        }
        if (status === "failed" || status === "cancelled" || status === "incomplete") {
          const msg =
            response?.error?.message ||
            response?.incomplete_details?.reason ||
            `OpenAI deep research status: ${status}`;
          throw new Error(typeof msg === "string" ? msg : "OpenAI deep research mislukt.");
        }
        await sleep(intervalMs);
        response = await client.responses.retrieve(id);
      }

      if (id) {
        throw new Error(
          "OpenAI deep research duurt langer dan verwacht. Verhoog DEEP_RESEARCH_POLL_TIMEOUT_MS of probeer een kortere vraag."
        );
      }

      // Fallback in case API returned immediately without id/status.
      const text = extractResponseText(response);
      const usage = extractOpenAiUsage(response);
      const sources = extractOpenAiSources(response);
      const fallbackSources = sources.length ? sources : extractSourcesFromAnyPayload(response);
      return { text, usage, sources: fallbackSources, modelUsed: deepModel };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("OpenAI deep research mislukt.");
}

async function geminiGenerateImageViaRest({ apiKey, model, prompt }) {
  const modelCandidates = Array.from(
    new Set(
      [
        model,
        "gemini-2.5-flash-image",
        "gemini-2.5-flash-image-preview",
        "gemini-3-pro-image-preview",
        "gemini-2.0-flash-exp-image-generation",
      ].filter(Boolean)
    )
  );

  const versions = ["v1beta", "v1"];
  let lastErr = null;

  for (const modelName of modelCandidates) {
    // 1) Interactions API (newer multimodal path).
    try {
      const interactionsResp = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          model: modelName,
          input: prompt,
          response_modalities: ["IMAGE"],
        }),
      });
      const interactionsPayload = await interactionsResp.json().catch(() => ({}));
      if (interactionsResp.ok) {
        const image = extractGeminiInteractionImage(interactionsPayload);
        if (image?.b64) {
          return {
            imageData: `data:${image.mime || "image/png"};base64,${image.b64}`,
            text: "Hier is je afbeelding.",
            usage: null,
          };
        }
      } else {
        const msg = interactionsPayload?.error?.message || interactionsPayload?.message || `${interactionsResp.status} ${interactionsResp.statusText}`;
        lastErr = new Error(`[interactions ${modelName}] ${msg}`);
      }
    } catch (err) {
      lastErr = err;
    }

    const contentVariants = [
      { generation_config: { response_modalities: ["TEXT", "IMAGE"] } },
      { generation_config: { responseModalities: ["TEXT", "IMAGE"] } },
      { generationConfig: { response_modalities: ["TEXT", "IMAGE"] } },
      { generationConfig: { responseModalities: ["TEXT", "IMAGE"] } },
    ];

    for (const version of versions) {
      const url = `https://generativelanguage.googleapis.com/${version}/models/${encodeURIComponent(modelName)}:generateContent?key=${apiKey}`;
      for (const variant of contentVariants) {
        const body = {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          ...variant,
        };
        try {
          const resp = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const payload = await resp.json().catch(() => ({}));
          if (!resp.ok) {
            const msg = payload?.error?.message || payload?.message || `${resp.status} ${resp.statusText}`;
            lastErr = new Error(`[${version} ${modelName}] ${msg}`);
            continue;
          }
          const image = extractGeminiImagePart(payload);
          if (!image?.b64) {
            lastErr = new Error(`[${version} ${modelName}] Gemini gaf geen afbeelding terug.`);
            continue;
          }
          return {
            imageData: `data:${image.mime || "image/png"};base64,${image.b64}`,
            text: extractGeminiText(payload) || "Hier is je afbeelding.",
            usage: extractGeminiUsage(payload),
          };
        } catch (err) {
          lastErr = err;
        }
      }
    }
  }

  // Final fallback: list models and retry first image-capable candidate once.
  try {
    const available = await listGeminiModels(apiKey);
    const imageLike = available.find((m) => /image|vision|flash/i.test(m));
    if (imageLike) {
      for (const version of versions) {
        const url = `https://generativelanguage.googleapis.com/${version}/models/${encodeURIComponent(imageLike)}:generateContent?key=${apiKey}`;
        try {
          const resp = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generation_config: { response_modalities: ["TEXT", "IMAGE"] },
            }),
          });
          const payload = await resp.json().catch(() => ({}));
          if (!resp.ok) continue;
          const image = extractGeminiImagePart(payload);
          if (image?.b64) {
            return {
              imageData: `data:${image.mime || "image/png"};base64,${image.b64}`,
              text: extractGeminiText(payload) || "Hier is je afbeelding.",
              usage: extractGeminiUsage(payload),
            };
          }
        } catch {
          // continue
        }
      }
    }
  } catch {
    // ignore listing failures
  }

  throw lastErr || new Error("gemini_image_failed");
}

async function listGeminiModels(apiKey) {
  const versions = ["v1", "v1beta"];
  for (const version of versions) {
    const url = `https://generativelanguage.googleapis.com/${version}/models?key=${apiKey}`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const payload = await resp.json().catch(() => ({}));
      const models = Array.isArray(payload?.models) ? payload.models : [];
      const names = models
        .filter((m) => m?.name && m?.supportedGenerationMethods?.includes("generateContent"))
        .map((m) => {
          const name = m.name || "";
          return name.startsWith("models/") ? name.slice(7) : name;
        })
        .filter(Boolean);
      if (names.length) return names;
    } catch {
      continue;
    }
  }
  return [];
}

async function runGeminiChat({ apiKey, model, messages, webSearch = false }) {
  const prompt = buildGeminiPrompt(messages);

  try {
    // Try requested capabilities first; if search tooling is rejected, retry once without it.
    const searchModes = webSearch ? [true, false] : [false];
    let lastError = null;
    for (const useWebSearch of searchModes) {
      // First try the requested model (mapped). If it fails with 404-like errors, list available models and try those.
      const candidates = [model, "gemini-1.5-flash", "gemini-pro", "gemini-1.0-pro"].filter(Boolean);
      for (const candidateModel of candidates) {
        try {
          const result = await geminiGenerateViaRest({ apiKey, model: candidateModel, prompt, webSearch: useWebSearch });
          return { text: result?.text || "", usage: result?.usage || null, modelUsed: candidateModel };
        } catch (e) {
          lastError = e;
        }
      }

      // If all candidates failed, list available models and try the first one
      console.log("[gemini] All hardcoded models failed. Listing available models...");
      const availableModels = await listGeminiModels(apiKey);
      console.log(`[gemini] Available models: ${availableModels.join(", ") || "none"}`);
      if (availableModels.length) {
        const firstAvailable = availableModels[0];
        console.log(`[gemini] Trying first available model: ${firstAvailable}`);
        const result = await geminiGenerateViaRest({ apiKey, model: firstAvailable, prompt, webSearch: useWebSearch });
        return { text: result?.text || "", usage: result?.usage || null, modelUsed: firstAvailable };
      }
    }

    throw lastError || new Error("gemini_rest_failed");
  } catch (err) {
    const safe = sanitizeProviderErrorMessage(err?.message || "");
    const wrapped = new Error("gemini_failed");
    wrapped.statusCode = 502;
    wrapped.publicMessage = safe ? `Gemini request mislukte: ${safe}` : "Gemini request mislukte.";
    wrapped.cause = err;
    throw wrapped;
  }
}

function extractGrokText(payload) {
  const choices = Array.isArray(payload?.choices) ? payload.choices : [];
  if (choices.length === 0) return "";
  const message = choices[0]?.message;
  if (!message) return "";
  return typeof message.content === "string" ? message.content : "";
}

function extractGrokUsage(payload) {
  const usage = payload?.usage || {};
  const inputTokens = Number(usage?.prompt_tokens ?? usage?.promptTokens ?? 0);
  const outputTokens = Number(usage?.completion_tokens ?? usage?.completionTokens ?? 0);
  let totalTokens = Number(usage?.total_tokens ?? usage?.totalTokens ?? 0);
  if (!Number.isFinite(totalTokens) || totalTokens <= 0) {
    const summed = (Number.isFinite(inputTokens) ? inputTokens : 0) + (Number.isFinite(outputTokens) ? outputTokens : 0);
    if (summed > 0) totalTokens = summed;
  }
  return {
    inputTokens: Number.isFinite(inputTokens) ? inputTokens : 0,
    outputTokens: Number.isFinite(outputTokens) ? outputTokens : 0,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : 0,
  };
}

const SUPPORTED_THINKING_MODES = new Set([
  "automatisch",
  "snel",
  "denken",
  "pro",
  "expert",
  "grok420beta",
  "heavy",
  "diepdenken",
  "extended_thinking",
  "extendedthinking",
  "instantly",
  "thinking",
]);

function normalizeThinkingMode(rawMode) {
  const mode = typeof rawMode === "string" ? rawMode.trim().toLowerCase() : "";
  if (!mode) return "instantly";
  if (mode === "extendedthinking") return "extended_thinking";
  if (SUPPORTED_THINKING_MODES.has(mode)) return mode;
  return "instantly";
}

function buildGrokModeCandidates({ model, thinkingMode }) {
  const normalizedMode = normalizeThinkingMode(thinkingMode);
  const base = { model };
  if (normalizedMode === "automatisch" || normalizedMode === "instantly") {
    return [base];
  }
  if (normalizedMode === "snel") {
    return [{ ...base, reasoning_effort: "low" }, base];
  }
  if (normalizedMode === "expert" || normalizedMode === "thinking") {
    return [{ ...base, reasoning_effort: "high" }, base];
  }
  if (normalizedMode === "heavy") {
    return [{ ...base, reasoning_effort: "high" }, base];
  }
  if (normalizedMode === "grok420beta") {
    return [
      { model: "grok-beta", reasoning_effort: "high" },
      { ...base, reasoning_effort: "high" },
      base,
    ];
  }
  return [base];
}

function buildGrokModelCandidates(model) {
  const requested = typeof model === "string" && model.trim() ? model.trim() : GROK_DEFAULT_MODEL;
  const lower = requested.toLowerCase();
  if (lower.includes("grok-4")) {
    return Array.from(new Set([requested, "grok-4-0709", "grok-4", "grok-3", "grok-3-mini"]));
  }
  if (lower.includes("grok-3")) {
    return Array.from(new Set([requested, "grok-3", "grok-3-mini"]));
  }
  if (lower.includes("grok-2")) {
    return [requested];
  }
  return Array.from(new Set([requested, GROK_DEFAULT_MODEL, "grok-4"]));
}

function extractDeepSeekText(payload) {
  const choices = Array.isArray(payload?.choices) ? payload.choices : [];
  if (!choices.length) return "";
  const message = choices[0]?.message;
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => (part && typeof part.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function extractDeepSeekUsage(payload) {
  const usage = payload?.usage || {};
  const inputTokens = Number(usage?.prompt_tokens ?? usage?.promptTokens ?? 0);
  const outputTokens = Number(usage?.completion_tokens ?? usage?.completionTokens ?? 0);
  let totalTokens = Number(usage?.total_tokens ?? usage?.totalTokens ?? 0);
  if (!Number.isFinite(totalTokens) || totalTokens <= 0) {
    const summed = (Number.isFinite(inputTokens) ? inputTokens : 0) + (Number.isFinite(outputTokens) ? outputTokens : 0);
    if (summed > 0) totalTokens = summed;
  }
  return {
    inputTokens: Number.isFinite(inputTokens) ? inputTokens : 0,
    outputTokens: Number.isFinite(outputTokens) ? outputTokens : 0,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : 0,
  };
}

function flattenDuckDuckGoTopics(items, out = []) {
  if (!Array.isArray(items)) return out;
  items.forEach((item) => {
    if (!item || typeof item !== "object") return;
    if (Array.isArray(item.Topics)) {
      flattenDuckDuckGoTopics(item.Topics, out);
      return;
    }
    const url = typeof item.FirstURL === "string" ? item.FirstURL.trim() : "";
    const text = typeof item.Text === "string" ? item.Text.trim() : "";
    if (url) out.push({ url, title: text || url, snippet: text || "" });
  });
  return out;
}

async function fetchSmartSearchSources(query, maxResults = 6) {
  const q = typeof query === "string" ? query.trim() : "";
  if (!q) return [];
  const limit = Math.max(1, Math.min(10, Number(maxResults) || 6));
  const seen = new Set();
  const sources = [];
  const pushSource = (entry) => {
    const rawUrl = typeof entry?.url === "string" ? entry.url.trim() : "";
    if (!rawUrl || seen.has(rawUrl) || sources.length >= limit) return;
    seen.add(rawUrl);
    sources.push({
      url: rawUrl,
      title: typeof entry?.title === "string" ? entry.title.trim() : "",
      snippet: typeof entry?.snippet === "string" ? entry.snippet.trim() : "",
    });
  };

  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`;
    const ddgResp = await fetch(ddgUrl, { headers: { Accept: "application/json" } });
    const ddgPayload = await ddgResp.json().catch(() => ({}));
    if (ddgResp.ok) {
      if (ddgPayload?.AbstractURL) {
        pushSource({
          url: ddgPayload.AbstractURL,
          title: ddgPayload.Heading || ddgPayload.AbstractSource || ddgPayload.AbstractURL,
          snippet: ddgPayload.AbstractText || "",
        });
      }
      flattenDuckDuckGoTopics(ddgPayload?.RelatedTopics).forEach(pushSource);
    }
  } catch (_) {
    // ignore search-source failures and continue
  }

  if (sources.length < limit) {
    try {
      const wikiUrl =
        `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}` +
        `&limit=${limit}&namespace=0&format=json`;
      const wikiResp = await fetch(wikiUrl, { headers: { Accept: "application/json" } });
      const wikiPayload = await wikiResp.json().catch(() => []);
      if (wikiResp.ok && Array.isArray(wikiPayload)) {
        const titles = Array.isArray(wikiPayload[1]) ? wikiPayload[1] : [];
        const snippets = Array.isArray(wikiPayload[2]) ? wikiPayload[2] : [];
        const urls = Array.isArray(wikiPayload[3]) ? wikiPayload[3] : [];
        urls.forEach((url, idx) => {
          pushSource({
            url,
            title: titles[idx] || url,
            snippet: snippets[idx] || "",
          });
        });
      }
    } catch (_) {
      // ignore search-source failures and continue
    }
  }

  return sources.slice(0, limit);
}

function buildDeepSeekModeCandidates({ model, thinkingMode }) {
  const mode = normalizeThinkingMode(thinkingMode);
  const requested = resolveDeepSeekModel(model || DEEPSEEK_DEFAULT_MODEL);
  const prefersReasoning =
    mode === "diepdenken" ||
    mode === "denken" ||
    mode === "thinking" ||
    mode === "expert" ||
    mode === "heavy" ||
    mode === "pro" ||
    mode === "extended_thinking";
  const firstModel = prefersReasoning ? DEEPSEEK_REASONING_MODEL : requested;
  return Array.from(new Set([firstModel, requested, DEEPSEEK_DEFAULT_MODEL]));
}

async function runDeepSeekChat({
  apiKey,
  model,
  messages,
  webSearch = false,
  thinkingMode = "instantly",
  toolMode = "none",
}) {
  try {
    const baseMessages = [];
    messages.forEach((msg) => {
      if (!msg) return;
      const content = typeof msg.content === "string" ? msg.content : normalizeContent(msg.content);
      if (!content) return;
      const role = msg.role === "developer" ? "system" : msg.role;
      if (role !== "system" && role !== "user" && role !== "assistant") return;
      baseMessages.push({ role, content });
    });
    if (!baseMessages.length) {
      throw new Error("DeepSeek: geen geldige berichten.");
    }

    const latestUserText = getLatestUserText(messages);
    const sources = webSearch ? await fetchSmartSearchSources(latestUserText, 6) : [];
    const searchContext = sources.length
      ? `Actuele webresultaten:\n${sources
          .map((source, idx) => {
            const title = source.title || source.url;
            const snippet = source.snippet ? ` - ${source.snippet}` : "";
            return `${idx + 1}. ${title} (${source.url})${snippet}`;
          })
          .join("\n")}`
      : "";
    const modeInstruction = buildModeInstruction({ toolMode, thinkingMode });
    if (modeInstruction || searchContext) {
      const systemText = [modeInstruction, searchContext].filter(Boolean).join("\n\n").trim();
      if (systemText) {
        baseMessages.unshift({ role: "system", content: systemText });
      }
    }

    const modeCandidates = buildDeepSeekModeCandidates({ model, thinkingMode });
    let payload = null;
    let lastError = null;
    for (const candidateModel of modeCandidates) {
      const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: candidateModel,
          messages: baseMessages,
          temperature: 0.3,
          stream: false,
        }),
      });
      payload = await resp.json().catch(() => ({}));
      if (resp.ok) {
        return {
          text: extractDeepSeekText(payload),
          usage: extractDeepSeekUsage(payload),
          modelUsed: candidateModel,
          sources,
        };
      }
      const msg = payload?.error?.message || payload?.message || `${resp.status} ${resp.statusText}`;
      const err = new Error(sanitizeProviderErrorMessage(msg));
      err.status = resp.status;
      err.payload = payload;
      lastError = err;
    }
    if (lastError) throw lastError;
    throw new Error("DeepSeek gaf geen bruikbare response terug.");
  } catch (err) {
    const safe = sanitizeProviderErrorMessage(err?.message || "");
    const wrapped = new Error("deepseek_failed");
    wrapped.statusCode = 502;
    wrapped.publicMessage = safe ? `DeepSeek request mislukte: ${safe}` : "DeepSeek request mislukte.";
    wrapped.cause = err;
    throw wrapped;
  }
}

async function runGrokChat({ apiKey, model, messages, webSearch = false, thinkingMode = "instantly" }) {
  try {
    // Grok API uses standard chat completions format (similar to OpenAI)
    const url = "https://api.x.ai/v1/chat/completions";

    // Convert messages to Grok format (developer role becomes system). Grok expects string content.
    const grokMessages = messages.map((msg) => {
      const content = typeof msg.content === "string" ? msg.content : normalizeContent(msg.content);
      if (msg.role === "developer") {
        return { role: "system", content };
      }
      return { role: msg.role, content };
    });

    const searchModes = webSearch ? [true, false] : [false];
    let payload = null;
    let lastError = null;
    for (const useWebSearch of searchModes) {
      const modelCandidates = buildGrokModelCandidates(model);
      for (const candidateModel of modelCandidates) {
        const modeCandidates = buildGrokModeCandidates({ model: candidateModel, thinkingMode });
        for (const modeCandidate of modeCandidates) {
          const body = {
            ...modeCandidate,
            messages: grokMessages,
          };
          if (useWebSearch) {
            body.tools = [{ type: "web_search" }];
          }

          const resp = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(body),
          });

          payload = await resp.json().catch(() => ({}));
          if (resp.ok) {
            lastError = null;
            return {
              text: extractGrokText(payload),
              usage: extractGrokUsage(payload),
              modelUsed: body.model || model,
            };
          }

          const msg = payload?.error?.message || payload?.message || `${resp.status} ${resp.statusText}`;
          const errorType = payload?.error?.type || payload?.type || "";
          const effortValue =
            typeof modeCandidate.reasoning_effort === "string" ? modeCandidate.reasoning_effort : "none";
          console.error(
            `[grok] API error (model: ${body.model || model}, effort: ${effortValue}, status: ${resp.status}):`,
            msg
          );
          console.error(`[grok] Error type: ${errorType}`);
          if (payload?.error) {
            console.error(`[grok] Full error payload:`, JSON.stringify(payload.error, null, 2));
          }

          // Provide more specific error messages for common issues
          let errorMessage = msg;
          if (resp.status === 403) {
            if (errorType === "insufficient_quota" || msg.includes("quota")) {
              errorMessage = "403 Forbidden: API quota is opgebruikt of facturering is niet geactiveerd. Activeer facturering op docs.x.ai.";
            } else if (errorType === "invalid_api_key" || msg.includes("invalid") || msg.includes("key")) {
              errorMessage = "403 Forbidden: API key is ongeldig. Controleer of GROK_API_KEY correct is ingesteld.";
            } else {
              errorMessage = "403 Forbidden: API key heeft geen toegang tot de Grok API. Controleer of GROK_API_KEY correct is ingesteld en toegang heeft tot Grok-4.";
            }
          } else if (resp.status === 401) {
            errorMessage = "401 Unauthorized: API key ontbreekt of is ongeldig. Controleer GROK_API_KEY.";
          } else if (resp.status === 400) {
            errorMessage = `400 Bad Request: ${msg}. Controleer of het model '${body.model || model}' beschikbaar is.`;
          }

          const err = new Error(errorMessage);
          err.status = resp.status;
          err.payload = payload;
          lastError = err;
        }
      }
    }
    if (lastError) {
      throw lastError;
    }

    throw new Error("Grok gaf geen bruikbare response terug.");
  } catch (err) {
    const safe = sanitizeProviderErrorMessage(err?.message || "");
    const wrapped = new Error("grok_failed");
    wrapped.statusCode = 502;
    wrapped.publicMessage = safe ? `Grok request mislukte: ${safe}` : "Grok request mislukte.";
    wrapped.cause = err;
    throw wrapped;
  }
}

function extractGrokImageData(payload) {
  const directUrl = payload?.url || payload?.image_url || payload?.imageUrl || "";
  if (typeof directUrl === "string" && directUrl.trim()) return directUrl.trim();
  const directB64 = payload?.image || payload?.b64_json || payload?.base64 || "";
  if (typeof directB64 === "string" && directB64.trim()) {
    if (directB64.trim().startsWith("data:")) return directB64.trim();
    return `data:image/png;base64,${directB64.trim()}`;
  }
  const first = Array.isArray(payload?.data) ? payload.data[0] : null;
  const b64 = first?.b64_json || first?.base64 || first?.image_base64 || "";
  if (typeof b64 === "string" && b64.trim()) {
    return `data:image/png;base64,${b64.trim()}`;
  }
  const url = first?.url || first?.image_url || "";
  if (typeof url === "string" && url.trim()) return url.trim();
  return "";
}

async function resolveImageSourceToDataUrl(imageSource, { apiKey } = {}) {
  const src = typeof imageSource === "string" ? imageSource.trim() : "";
  if (!src) return "";
  if (src.startsWith("data:")) return src;
  if (!/^https?:\/\//i.test(src)) return "";

  const toDataUrl = async (resp) => {
    if (!resp || !resp.ok) return "";
    const contentType = String(resp.headers.get("content-type") || "image/png").split(";")[0].trim() || "image/png";
    const arrBuf = await resp.arrayBuffer();
    const b64 = Buffer.from(arrBuf).toString("base64");
    return b64 ? `data:${contentType};base64,${b64}` : "";
  };

  try {
    if (apiKey) {
      const authResp = await fetch(src, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const authDataUrl = await toDataUrl(authResp);
      if (authDataUrl) return authDataUrl;
    }
  } catch {
    // fallback without auth
  }

  try {
    const plainResp = await fetch(src);
    const plainDataUrl = await toDataUrl(plainResp);
    if (plainDataUrl) return plainDataUrl;
  } catch {
    // ignore and return original source as final fallback
  }

  return src;
}

function extractImageUsage(payload) {
  const usage = payload?.usage || {};
  const totalTokens = Number(usage?.total_tokens ?? usage?.totalTokens ?? usage?.tokens ?? 0);
  return {
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : 0,
  };
}

async function runGrokImageGeneration({ apiKey, prompt, model }) {
  const url = "https://api.x.ai/v1/images/generations";
  const modelCandidates = Array.from(
    new Set([model || getGrokImageModel() || GROK_IMAGE_DEFAULT_MODEL, GROK_IMAGE_DEFAULT_MODEL, "grok-2-image"].filter(Boolean))
  );
  const formatCandidates = [{ image_format: "base64" }, {}];
  let lastError = null;

  for (const candidateModel of modelCandidates) {
    for (const formatOptions of formatCandidates) {
      const body = {
        model: candidateModel,
        prompt,
        n: 1,
        ...formatOptions,
      };
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      const payload = await resp.json().catch(() => ({}));
      if (resp.ok) {
        const rawImage = extractGrokImageData(payload);
        const imageData = await resolveImageSourceToDataUrl(rawImage, { apiKey });
        if (!imageData) {
          lastError = new Error("Grok gaf geen afbeelding terug.");
          continue;
        }
        return {
          imageData,
          text: "Hier is je afbeelding.",
          usage: extractImageUsage(payload),
          modelUsed: candidateModel,
        };
      }
      const msg = payload?.error?.message || payload?.message || payload?.detail || `${resp.status} ${resp.statusText}`;
      const err = new Error(sanitizeProviderErrorMessage(msg));
      err.status = resp.status;
      err.payload = payload;
      lastError = err;
    }
  }

  throw lastError || new Error("grok_image_failed");
}

function dataUrlToBase64(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return null;
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return null;
  return dataUrl.slice(comma + 1);
}

function dataUrlToMediaType(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return "image/jpeg";
  const match = dataUrl.match(/^data:([^;]+);/);
  const mime = match ? match[1].trim().toLowerCase() : "image/jpeg";
  if (mime === "image/png" || mime === "image/jpeg" || mime === "image/gif" || mime === "image/webp") return mime;
  return "image/jpeg";
}

function buildClaudeRequest(normalizedMessages) {
  const systemParts = [];
  const messages = [];
  for (const msg of normalizedMessages) {
    if (!msg) continue;
    if (msg.role === "developer") {
      const text = typeof msg.content === "string" ? msg.content : normalizeContent(msg.content);
      if (text) systemParts.push(text);
      continue;
    }
    if (msg.role !== "user" && msg.role !== "assistant") continue;
    const content = msg.content;
    if (Array.isArray(content)) {
      const blocks = [];
      for (const part of content) {
        if (!part) continue;
        if (part.type === "text" && typeof part.text === "string") {
          blocks.push({ type: "text", text: part.text });
          continue;
        }
        if (part.type === "image_url" && part.image_url && typeof part.image_url.url === "string") {
          const data = dataUrlToBase64(part.image_url.url);
          const mediaType = dataUrlToMediaType(part.image_url.url);
          if (data) blocks.push({ type: "image", source: { type: "base64", media_type: mediaType, data } });
        }
      }
      if (blocks.length) messages.push({ role: msg.role, content: blocks });
      continue;
    }
    if (typeof content === "string" && content.trim()) {
      messages.push({ role: msg.role, content: content });
    }
  }
  return {
    system: systemParts.filter(Boolean).join("\n\n").trim() || undefined,
    messages,
  };
}

function extractClaudeText(payload) {
  const content = Array.isArray(payload?.content) ? payload.content : [];
  return content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
}

function extractClaudeUsage(payload) {
  const usage = payload?.usage || {};
  const inputTokens = Number(usage?.input_tokens ?? usage?.inputTokens ?? 0);
  const outputTokens = Number(usage?.output_tokens ?? usage?.output_tokens ?? 0);
  let totalTokens = Number(usage?.total_tokens ?? usage?.totalTokens ?? 0);
  if (!Number.isFinite(totalTokens) || totalTokens <= 0) {
    const summed = (Number.isFinite(inputTokens) ? inputTokens : 0) + (Number.isFinite(outputTokens) ? outputTokens : 0);
    if (summed > 0) totalTokens = summed;
  }
  return {
    inputTokens: Number.isFinite(inputTokens) ? inputTokens : 0,
    outputTokens: Number.isFinite(outputTokens) ? outputTokens : 0,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : 0,
  };
}

function buildClaudeModeCandidates({ model, thinkingMode }) {
  const mode = normalizeThinkingMode(thinkingMode);
  const base = { model, max_tokens: 4096 };
  if (mode !== "extended_thinking") return [base];
  return [
    { ...base, max_tokens: 12000, thinking: { type: "enabled", budget_tokens: 4096 } },
    base,
  ];
}

function buildClaudeModelCandidates(model) {
  const requested = typeof model === "string" && model.trim() ? model.trim() : CLAUDE_DEFAULT_MODEL;
  const lower = requested.toLowerCase();
  if (lower.includes("opus")) {
    return Array.from(new Set([requested, "claude-opus-4-6", "claude-opus-4-5", "claude-opus-4-5-20251101"]));
  }
  if (lower.includes("haiku")) {
    return Array.from(new Set([requested, "claude-haiku-4-5", "claude-haiku-4-5-20251001"]));
  }
  return Array.from(new Set([requested, "claude-sonnet-4-6", "claude-sonnet-4-5", "claude-sonnet-4-5-20250929"]));
}

async function runClaudeChat({ apiKey, model, messages, webSearch = false, thinkingMode = "instantly" }) {
  try {
    const { system, messages: claudeMessages } = buildClaudeRequest(messages);
    if (!claudeMessages.length) {
      throw new Error("Claude: geen geldige berichten.");
    }
    const url = "https://api.anthropic.com/v1/messages";
    const searchModes = webSearch ? [true, false] : [false];
    let payload = null;
    let lastError = null;
    for (const useWebSearch of searchModes) {
      const modelCandidates = buildClaudeModelCandidates(model);
      for (const candidateModel of modelCandidates) {
        const modeCandidates = buildClaudeModeCandidates({ model: candidateModel, thinkingMode });
        for (const modeCandidate of modeCandidates) {
          const requestBody = {
            ...modeCandidate,
            messages: claudeMessages,
          };
          if (system) requestBody.system = system;
          if (useWebSearch) {
            requestBody.tools = [{ type: "web_search_20250305", name: "web_search" }];
          } else {
            delete requestBody.tools;
          }

          const resp = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
              ...(useWebSearch ? { "anthropic-beta": "web-search-2025-03-05" } : {}),
            },
            body: JSON.stringify(requestBody),
          });

          payload = await resp.json().catch(() => ({}));
          if (resp.ok) {
            return {
              text: extractClaudeText(payload),
              usage: extractClaudeUsage(payload),
              modelUsed: candidateModel,
            };
          }
          const msg = payload?.error?.message || payload?.message || `${resp.status} ${resp.statusText}`;
          const err = new Error(sanitizeProviderErrorMessage(msg));
          err.status = resp.status;
          err.payload = payload;
          lastError = err;
        }
      }
    }
    if (lastError) {
      throw lastError;
    }
    throw new Error("Claude gaf geen bruikbare response terug.");
  } catch (err) {
    const safe = sanitizeProviderErrorMessage(err?.message || "");
    const wrapped = new Error("claude_failed");
    wrapped.statusCode = 502;
    wrapped.publicMessage = safe ? `Claude request mislukte: ${safe}` : "Claude request mislukte.";
    wrapped.cause = err;
    throw wrapped;
  }
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return json(res, 405, { error: "Method not allowed" });
    }

    const token = getBearerToken(req);
    if (!token) return json(res, 401, { error: "Unauthorized" });

    const user = await getUserFromAccessToken(token);
    if (!user?.id) return json(res, 401, { error: "Unauthorized" });

    // Token management is best-effort. If service role is missing/misconfigured, we still allow chat to work.
    const serviceRoleKey = getSupabaseServiceRoleKey();
    const tokenOpsEnabled = Boolean(serviceRoleKey);
    if (!tokenOpsEnabled) {
      console.error(
        "Supabase service role key missing (expected SUPABASE_SERVICE_ROLE_KEY or supabase_service_role_key). Token gating disabled."
      );
    }

    // Parse & validate request FIRST so we don't deduct tokens for invalid requests. Larger limit for image attachments.
    let body = {};
    try {
      body = await readJson(req, { maxBytes: 6 * 1024 * 1024 });
    } catch (error) {
      const status = error?.code === "payload_too_large" ? 413 : 400;
      return json(res, status, { error: "Invalid request body" });
    }

    const { messages, model, provider } = body || {};
    const webSearchRequested = Boolean(body?.web_search || body?.webSearch);
    const toolModeRaw = typeof body?.tool_mode === "string" ? body.tool_mode.trim().toLowerCase() : "";
    const toolMode =
      toolModeRaw === "image_generation" ||
      toolModeRaw === "thinking" ||
      toolModeRaw === "deep_research" ||
      toolModeRaw === "shopping_research"
        ? toolModeRaw
        : "none";
    const thinkingModeRaw = typeof body?.thinking_mode === "string" ? body.thinking_mode : "";
    const thinkingMode = normalizeThinkingMode(thinkingModeRaw);
    const modelKey =
      typeof body?.model_key === "string"
        ? body.model_key
        : typeof body?.modelKey === "string"
          ? body.modelKey
          : "";
    const modelLabel =
      typeof body?.model_label === "string"
        ? body.model_label
        : typeof body?.modelLabel === "string"
          ? body.modelLabel
          : "";
    const normalizedMessages = validateAndNormalizeMessages(messages);

    const requestedProvider = typeof provider === "string" ? provider.trim().toLowerCase() : "";
    const inferredProvider =
      requestedProvider ||
      (typeof model === "string" && model.trim().startsWith("gemini-")
        ? "gemini"
        : typeof model === "string" && model.trim().startsWith("grok")
          ? "grok"
          : typeof model === "string" && model.trim().startsWith("claude-")
            ? "anthropic"
            : typeof model === "string" && model.trim().startsWith("deepseek-")
              ? "deepseek"
            : "openai");

    const requestedModel = typeof model === "string" ? model : "";
    const latestUserText = getLatestUserText(normalizedMessages);
    const looksLikeImageIntent =
      /\b(maak|genereer|create|generate)\b[\s\S]{0,80}\b(afbeelding|image|foto|plaatje|illustratie)\b/i.test(
        latestUserText || ""
      );
    const effectiveToolMode =
      toolMode === "none" && looksLikeImageIntent && (inferredProvider === "openai" || inferredProvider === "gemini")
        ? "image_generation"
        : toolMode;
    const webSearchEnabled =
      (webSearchRequested || effectiveToolMode === "deep_research" || effectiveToolMode === "shopping_research") &&
      (inferredProvider === "openai" ||
        inferredProvider === "gemini" ||
        inferredProvider === "grok" ||
        inferredProvider === "anthropic" ||
        inferredProvider === "deepseek");
    const resolvedOpenAIModel = inferredProvider === "openai" ? resolveOpenAIModel(requestedModel) : null;
    const resolvedGeminiModel = inferredProvider === "gemini" ? resolveGeminiModel(requestedModel) : null;
    const resolvedGrokModel = inferredProvider === "grok" ? resolveGrokModel(requestedModel) : null;
    const resolvedClaudeModel = inferredProvider === "anthropic" ? resolveClaudeModel(requestedModel) : null;
    const resolvedDeepSeekModel = inferredProvider === "deepseek" ? resolveDeepSeekModel(requestedModel) : null;
    const tokensRequiredRaw = resolveTokensRequired({
      modelKey,
      modelLabel,
      provider: inferredProvider,
      requestedModel,
      resolvedModel: resolvedOpenAIModel || resolvedGeminiModel || resolvedGrokModel || resolvedClaudeModel || resolvedDeepSeekModel,
    });
    const tokensRequired = Math.max(
      1,
      Math.floor(Number.isFinite(tokensRequiredRaw) ? tokensRequiredRaw : TOKENS_PER_CHAT_DEFAULT)
    );

    // Initialize / read token balance AFTER we know request is valid.
    let appMeta = user?.app_metadata || {};
    const tokensPerEur = getTokensPerEur();
    const requestCostEur = Math.round((tokensRequired / tokensPerEur) * 100) / 100;
    const starterTokens = Math.max(0, Math.round(STARTER_CREDITS_EUR * tokensPerEur));
    const tokenMetaValue = Number(appMeta?.tokens);
    const starterCreditsRecorded = Number(appMeta?.starter_credits_eur || 0);
    const creditsInitialized = Boolean(appMeta?.credits_initialized);

    // Initialize starter credits once for users missing a token balance (best-effort).
    if (tokenOpsEnabled && !Number.isFinite(tokenMetaValue)) {
      try {
        appMeta = {
          ...(appMeta || {}),
          tokens: starterTokens,
          credits_initialized: true,
          starter_credits_eur: STARTER_CREDITS_EUR,
        };
        await supabaseAuthAdmin(`users/${encodeURIComponent(user.id)}`, {
          method: "PUT",
          accessKey: serviceRoleKey,
          body: { app_metadata: appMeta },
        });
      } catch (e) {
        console.error("Token init failed; continuing without token gating.", e?.message || e);
      }
    } else if (
      tokenOpsEnabled &&
      Number.isFinite(tokenMetaValue) &&
      (creditsInitialized || starterCreditsRecorded > 0) &&
      starterCreditsRecorded < STARTER_CREDITS_EUR
    ) {
      try {
        const nextTokens = Math.max(Math.floor(tokenMetaValue), starterTokens);
        appMeta = {
          ...(appMeta || {}),
          tokens: nextTokens,
          credits_initialized: true,
          starter_credits_eur: STARTER_CREDITS_EUR,
        };
        await supabaseAuthAdmin(`users/${encodeURIComponent(user.id)}`, {
          method: "PUT",
          accessKey: serviceRoleKey,
          body: { app_metadata: appMeta },
        });
      } catch (e) {
        console.error("Token upgrade failed; continuing without token gating.", e?.message || e);
      }
    }

    const isPaid = isPaidAppMeta(appMeta);
    if (!isPaid) {
      return json(res, 402, {
        error: "Abonnement vereist om te chatten.",
        subscribe_required: true,
      });
    }
    const limit = CHAT_LIMIT_PAID;

    // Rate limit before deducting tokens.
    const userLimit = rateLimit({ key: `chat:user:${user.id}`, limit, windowMs: CHAT_WINDOW_MS });
    if (!userLimit.ok) {
      return json(res, 429, { error: "Te veel chatverzoeken. Probeer zo opnieuw." }, rateLimitHeaders(userLimit, limit));
    }

    const ip = getClientIp(req);
    const ipLimit = rateLimit({ key: `chat:ip:${ip}`, limit: limit * 2, windowMs: CHAT_WINDOW_MS });
    if (!ipLimit.ok) {
      return json(res, 429, { error: "Te veel verzoeken. Probeer zo opnieuw." }, rateLimitHeaders(ipLimit, limit * 2));
    }

    // Token gating + deduct (stored server-side in app_metadata.tokens) - best-effort.
    const tokenBalance = Number(appMeta?.tokens || 0);
    const monthlyLimit = await getMonthlyLimitEur(serviceRoleKey);
    if (Number.isFinite(monthlyLimit)) {
      const monthSpend = await getMonthSpendEur();
      if (monthSpend + requestCostEur > monthlyLimit) {
        return json(res, 429, {
          error: "Maandlimiet bereikt.",
          monthly_limit_eur: monthlyLimit,
          month_spend_eur: monthSpend,
          request_cost_eur: requestCostEur,
          remaining_eur: Math.max(0, Math.round((monthlyLimit - monthSpend) * 100) / 100),
          topup_required: true,
        });
      }
    }
    if (tokenOpsEnabled) {
      if (!Number.isFinite(tokenBalance) || tokenBalance < tokensRequired) {
        return json(res, 402, {
          error: "Je tokens zijn op. Waardeer je account op om door te chatten.",
          topup_required: true,
          tokens_required: tokensRequired,
          tokens_available: Math.max(0, Number.isFinite(tokenBalance) ? tokenBalance : 0),
        });
      }

      const nextTokens = Math.max(0, Math.floor(tokenBalance - tokensRequired));
      try {
        await supabaseAuthAdmin(`users/${encodeURIComponent(user.id)}`, {
          method: "PUT",
          accessKey: serviceRoleKey,
          body: { app_metadata: { ...(appMeta || {}), tokens: nextTokens } },
        });
      } catch (e) {
        console.error("Token deduct failed; continuing without blocking chat.", e?.message || e);
      }
    }

    const refundTokensBestEffort = async () => {
      if (!tokenOpsEnabled) return;
      try {
        await supabaseAuthAdmin(`users/${encodeURIComponent(user.id)}`, {
          method: "PUT",
          accessKey: serviceRoleKey,
          body: { app_metadata: { ...(appMeta || {}), tokens: tokenBalance } },
        });
      } catch (e) {
        console.error("Token refund failed", e?.message || e);
      }
    };

    try {
      if (inferredProvider === "gemini") {
        if (effectiveToolMode === "image_generation") {
          const prompt = latestUserText;
          if (!prompt) {
            await refundTokensBestEffort();
            return json(res, 400, { error: "Geef eerst een beschrijving voor de afbeelding." });
          }
          try {
            const nanoKey = getNanoBananaApiKey() || getGeminiApiKey();
            if (!nanoKey) {
              await refundTokensBestEffort();
              return json(res, 500, { error: "Missing NANO_BANANA_API_KEY of GEMINI_API_KEY" });
            }
            const nanoModel = getNanoBananaModel() || GEMINI_IMAGE_DEFAULT_MODEL;
            const result = await geminiGenerateImageViaRest({
              apiKey: nanoKey,
              model: nanoModel,
              prompt,
            });
            const usageTokens = Number(result?.usage?.totalTokens || 0);
            const actualTokens = Number.isFinite(usageTokens) && usageTokens > 0 ? usageTokens : tokensRequired;
            void recordUsageEvent({
              userId: user.id,
              provider: "gemini",
              model: nanoModel,
              modelLabel: "Maak een afbeelding",
              tokens: actualTokens,
              tokensPerEur,
              costEur: requestCostEur,
            });
            return json(res, 200, {
              text: result?.text || "Hier is je afbeelding.",
              image_data: result.imageData,
              sources: [],
            });
          } catch (err) {
            await refundTokensBestEffort();
            const safe = sanitizeProviderErrorMessage(err?.message || "");
            const wrapped = new Error("gemini_failed");
            wrapped.statusCode = 502;
            wrapped.publicMessage = safe ? `Gemini afbeelding mislukt: ${safe}` : "Gemini afbeelding mislukt.";
            wrapped.cause = err;
            throw wrapped;
          }
        } else {
          let geminiModel = resolvedGeminiModel || resolveGeminiModel(requestedModel);
          if (thinkingMode === "pro") {
            geminiModel = resolveGeminiModel("gemini-1.5-pro");
          } else if (thinkingMode === "snel") {
            geminiModel = resolveGeminiModel("gemini-1.5-flash");
          }
          const modeInstruction = buildModeInstruction({ toolMode: effectiveToolMode, thinkingMode });
          const geminiMessages = modeInstruction
            ? [...normalizedMessages, { role: "developer", content: modeInstruction }]
            : normalizedMessages;
          const apiKey = getGeminiApiKey();
          console.log(`[gemini] key ${apiKey ? "present" : "missing"}`);
          if (!apiKey) {
            await refundTokensBestEffort();
            return json(res, 500, { error: "Missing GEMINI_API_KEY" });
          }
          // Validate API key format (should start with AIza)
          if (!apiKey.startsWith("AIza")) {
            console.error(`[gemini] Invalid API key format (should start with AIza)`);
            await refundTokensBestEffort();
            return json(res, 500, { error: "Invalid GEMINI_API_KEY format. API key should start with 'AIza'" });
          }
          console.log(`[gemini] Using model: ${geminiModel}, messages: ${geminiMessages.length}, mode: ${thinkingMode}`);
          let result;
          try {
            result =
              effectiveToolMode === "deep_research"
                ? await runGeminiDeepResearch({
                    apiKey,
                    messages: geminiMessages,
                  })
                : await runGeminiChat({
                    apiKey,
                    model: geminiModel,
                    messages: geminiMessages,
                    webSearch: webSearchEnabled,
                  });
          } catch (err) {
            const safe = sanitizeProviderErrorMessage(err?.message || "");
            const wrapped = new Error("gemini_failed");
            wrapped.statusCode = 502;
            wrapped.publicMessage = safe ? `Gemini request mislukte: ${safe}` : "Gemini request mislukte.";
            wrapped.cause = err;
            throw wrapped;
          }
          const usageTokens = Number(result?.usage?.totalTokens || 0);
          const actualTokens = Number.isFinite(usageTokens) && usageTokens > 0 ? usageTokens : tokensRequired;
          const usedModel = result?.modelUsed || (effectiveToolMode === "deep_research" ? GEMINI_DEEP_RESEARCH_AGENT : geminiModel);
          void recordUsageEvent({
            userId: user.id,
            provider: "gemini",
            model: usedModel,
            modelLabel: modelLabel || modelKey || requestedModel || usedModel,
            tokens: actualTokens,
            tokensPerEur,
            costEur: requestCostEur,
          });
          return json(res, 200, { text: result?.text || "", sources: result?.sources || [] });
        }
      }

      if (inferredProvider === "grok") {
        const grokModel = resolvedGrokModel || resolveGrokModel(requestedModel);
        const apiKey = getGrokApiKey();
        console.log(`[grok] key ${apiKey ? "present" : "missing"}, model: ${grokModel}`);
        if (!apiKey) {
          await refundTokensBestEffort();
          return json(res, 500, { error: "Missing GROK_API_KEY" });
        }
        // Validate API key format (should start with xai-)
        const keyPrefix = apiKey.substring(0, 4);
        if (keyPrefix !== "xai-") {
          console.warn(`[grok] API key format may be incorrect (starts with '${keyPrefix}', expected 'xai-')`);
          console.warn(`[grok] Key length: ${apiKey.length}, first 10 chars: ${apiKey.substring(0, 10)}...`);
        }
        if (effectiveToolMode === "image_generation") {
          const prompt = getLatestUserText(normalizedMessages);
          if (!prompt) {
            await refundTokensBestEffort();
            return json(res, 400, { error: "Geef eerst een beschrijving voor de afbeelding." });
          }
          try {
            const result = await runGrokImageGeneration({
              apiKey,
              prompt,
              model: getGrokImageModel() || GROK_IMAGE_DEFAULT_MODEL,
            });
            const usageTokens = Number(result?.usage?.totalTokens || 0);
            const actualTokens = Number.isFinite(usageTokens) && usageTokens > 0 ? usageTokens : tokensRequired;
            const usedModel = result?.modelUsed || getGrokImageModel() || GROK_IMAGE_DEFAULT_MODEL;
            void recordUsageEvent({
              userId: user.id,
              provider: "grok",
              model: usedModel,
              modelLabel: "Maak een afbeelding",
              tokens: actualTokens,
              tokensPerEur,
              costEur: requestCostEur,
            });
            return json(res, 200, {
              text: result?.text || "Hier is je afbeelding.",
              image_data: result.imageData,
              sources: [],
            });
          } catch (err) {
            await refundTokensBestEffort();
            const safe = sanitizeProviderErrorMessage(err?.message || "");
            const status = Number(err?.status || err?.statusCode || 0);
            const accessHint =
              status === 400 || status === 403
                ? " Controleer in xAI Console of je Grok Imagine image model is geactiveerd voor deze API key."
                : "";
            const wrapped = new Error("grok_failed");
            wrapped.statusCode = 502;
            wrapped.publicMessage = safe
              ? `Grok afbeelding mislukt: ${safe}${accessHint}`
              : `Grok afbeelding mislukt.${accessHint}`;
            wrapped.cause = err;
            throw wrapped;
          }
        }
        console.log(`[grok] Using model: ${grokModel}, messages: ${normalizedMessages.length}, key length: ${apiKey.length}`);
        const result = await runGrokChat({
          apiKey,
          model: grokModel,
          messages: normalizedMessages,
          webSearch: webSearchEnabled,
          thinkingMode,
        });
        const usageTokens = Number(result?.usage?.totalTokens || 0);
        const actualTokens = Number.isFinite(usageTokens) && usageTokens > 0 ? usageTokens : tokensRequired;
        const usedModel = result?.modelUsed || grokModel;
        void recordUsageEvent({
          userId: user.id,
          provider: "grok",
          model: usedModel,
          modelLabel: modelLabel || modelKey || requestedModel || usedModel,
          tokens: actualTokens,
          tokensPerEur,
          costEur: requestCostEur,
        });
        return json(res, 200, { text: result?.text || "" });
      }

      if (inferredProvider === "deepseek") {
        const deepSeekModel = resolvedDeepSeekModel || resolveDeepSeekModel(requestedModel);
        const apiKey = getDeepSeekApiKey();
        console.log(`[deepseek] key ${apiKey ? "present" : "missing"}, model: ${deepSeekModel}`);
        if (!apiKey) {
          await refundTokensBestEffort();
          return json(res, 500, { error: "Missing DEEPSEEK_API_KEY" });
        }
        if (effectiveToolMode === "image_generation") {
          await refundTokensBestEffort();
          return json(res, 400, { error: "Afbeeldingen maken wordt nu ondersteund voor ChatGPT, Gemini en Grok." });
        }
        const result = await runDeepSeekChat({
          apiKey,
          model: deepSeekModel,
          messages: normalizedMessages,
          webSearch: webSearchEnabled,
          thinkingMode,
          toolMode: effectiveToolMode,
        });
        const usageTokens = Number(result?.usage?.totalTokens || 0);
        const actualTokens = Number.isFinite(usageTokens) && usageTokens > 0 ? usageTokens : tokensRequired;
        const usedModel = result?.modelUsed || deepSeekModel;
        void recordUsageEvent({
          userId: user.id,
          provider: "deepseek",
          model: usedModel,
          modelLabel: modelLabel || modelKey || requestedModel || usedModel,
          tokens: actualTokens,
          tokensPerEur,
          costEur: requestCostEur,
        });
        return json(res, 200, { text: result?.text || "", sources: result?.sources || [] });
      }

      if (inferredProvider === "anthropic") {
        const claudeModel = resolvedClaudeModel || resolveClaudeModel(requestedModel);
        const apiKey = getClaudeApiKey();
        console.log(`[claude] key ${apiKey ? "present" : "missing"}, model: ${claudeModel}`);
        if (!apiKey) {
          await refundTokensBestEffort();
          return json(res, 500, { error: "Missing CLAUDE_API_KEY" });
        }
        const result = await runClaudeChat({
          apiKey,
          model: claudeModel,
          messages: normalizedMessages,
          webSearch: webSearchEnabled,
          thinkingMode,
        });
        const usageTokens = Number(result?.usage?.totalTokens || 0);
        const actualTokens = Number.isFinite(usageTokens) && usageTokens > 0 ? usageTokens : tokensRequired;
        const usedModel = result?.modelUsed || claudeModel;
        void recordUsageEvent({
          userId: user.id,
          provider: "claude",
          model: usedModel,
          modelLabel: modelLabel || modelKey || requestedModel || usedModel,
          tokens: actualTokens,
          tokensPerEur,
          costEur: requestCostEur,
        });
        return json(res, 200, { text: result?.text || "" });
      }

      if (effectiveToolMode === "image_generation") {
        const prompt = getLatestUserText(normalizedMessages);
        if (!prompt) {
          await refundTokensBestEffort();
          return json(res, 400, { error: "Geef eerst een beschrijving voor de afbeelding." });
        }

        if (inferredProvider === "gemini") {
          try {
            const nanoKey = getNanoBananaApiKey() || getGeminiApiKey();
            if (!nanoKey) {
              await refundTokensBestEffort();
              return json(res, 500, { error: "Missing NANO_BANANA_API_KEY of GEMINI_API_KEY" });
            }
            const nanoModel = getNanoBananaModel() || GEMINI_IMAGE_DEFAULT_MODEL;
            const result = await geminiGenerateImageViaRest({
              apiKey: nanoKey,
              model: nanoModel,
              prompt,
            });
            const usageTokens = Number(result?.usage?.totalTokens || 0);
            const actualTokens = Number.isFinite(usageTokens) && usageTokens > 0 ? usageTokens : tokensRequired;
            void recordUsageEvent({
              userId: user.id,
              provider: "gemini",
              model: nanoModel,
              modelLabel: "Maak een afbeelding",
              tokens: actualTokens,
              tokensPerEur,
              costEur: requestCostEur,
            });
            return json(res, 200, {
              text: result?.text || "Hier is je afbeelding.",
              image_data: result.imageData,
              sources: [],
            });
          } catch (err) {
            await refundTokensBestEffort();
            const safe = sanitizeProviderErrorMessage(err?.message || "");
            const wrapped = new Error("gemini_failed");
            wrapped.statusCode = 502;
            wrapped.publicMessage = safe ? `Gemini afbeelding mislukt: ${safe}` : "Gemini afbeelding mislukt.";
            wrapped.cause = err;
            throw wrapped;
          }
        }

        if (inferredProvider !== "openai") {
          await refundTokensBestEffort();
          return json(res, 400, { error: "Afbeeldingen maken wordt nu ondersteund voor ChatGPT, Gemini en Grok." });
        }
      }

      const openaiModel = resolvedOpenAIModel || resolveOpenAIModel(requestedModel);
      const apiKey = getOpenAIApiKey();
      console.log(`[openai] key ${apiKey ? "present" : "missing"}`);
      if (!apiKey) {
        await refundTokensBestEffort();
        return json(res, 500, { error: "Missing OPEN_AI_KEY" });
      }

      const client = new OpenAI({ apiKey });
      if (effectiveToolMode === "image_generation") {
        const prompt = getLatestUserText(normalizedMessages);
        if (!prompt) {
          await refundTokensBestEffort();
          return json(res, 400, { error: "Geef eerst een beschrijving voor de afbeelding." });
        }
        try {
          const imageResp = await client.images.generate({
            model: "gpt-image-1",
            prompt,
            size: "1024x1024",
          });
          const b64 = imageResp?.data?.[0]?.b64_json || "";
          if (!b64) {
            throw new Error("OpenAI gaf geen afbeelding terug.");
          }
          const imageData = `data:image/png;base64,${b64}`;
          void recordUsageEvent({
            userId: user.id,
            provider: "openai",
            model: "gpt-image-1",
            modelLabel: "Maak een afbeelding",
            tokens: tokensRequired,
            tokensPerEur,
            costEur: requestCostEur,
          });
          return json(res, 200, {
            text: "Hier is je afbeelding.",
            image_data: imageData,
            sources: [],
          });
        } catch (err) {
          await refundTokensBestEffort();
          const safe = sanitizeProviderErrorMessage(err?.message || "");
          const wrapped = new Error("openai_failed");
          wrapped.statusCode = 502;
          wrapped.publicMessage = safe ? `OpenAI afbeelding mislukt: ${safe}` : "OpenAI afbeelding mislukt.";
          wrapped.cause = err;
          throw wrapped;
        }
      }

      let response;
      try {
        if (effectiveToolMode === "deep_research") {
          const deepResult = await runOpenAiDeepResearch({
            client,
            messages: normalizedMessages,
          });
          const usageTokens = Number(deepResult?.usage?.totalTokens || 0);
          const actualTokens = Number.isFinite(usageTokens) && usageTokens > 0 ? usageTokens : tokensRequired;
          const usedModel = deepResult?.modelUsed || resolveOpenAiDeepResearchModel();
          void recordUsageEvent({
            userId: user.id,
            provider: "openai",
            model: usedModel,
            modelLabel: modelLabel || modelKey || requestedModel || usedModel,
            tokens: actualTokens,
            tokensPerEur,
            costEur: requestCostEur,
          });
          return json(res, 200, {
            text: deepResult?.text || "",
            sources: deepResult?.sources || [],
          });
        }

        const modeInstruction = buildModeInstruction({ toolMode: effectiveToolMode, thinkingMode });
        const effectiveMessages = modeInstruction
          ? [...normalizedMessages, { role: "developer", content: modeInstruction }]
          : normalizedMessages;
        const input = effectiveMessages.reduce((acc, message) => {
          const role = message.role === "developer" ? "system" : message.role;
          const content = toOpenAiInputContent(message.content, role);
          if (!content.length) return acc;
          acc.push({ role, content });
          return acc;
        }, []);
        if (!input.length) {
          throw new Error("Geen geldige OpenAI input gevonden.");
        }
        const openAiModes = webSearchEnabled ? [true, false] : [false];
        let lastOpenAiError = null;
        for (const useWebSearch of openAiModes) {
          try {
            const payload = {
              model: openaiModel,
              input,
            };
            if (useWebSearch) {
              payload.tools = [{ type: "web_search_preview" }];
            }
            response = await client.responses.create(payload);
            lastOpenAiError = null;
            break;
          } catch (innerError) {
            lastOpenAiError = innerError;
          }
        }
        if (lastOpenAiError) {
          throw lastOpenAiError;
        }
      } catch (err) {
        await refundTokensBestEffort();
        const safe = sanitizeProviderErrorMessage(err?.message || "");
        const wrapped = new Error("openai_failed");
        wrapped.statusCode = 502;
        wrapped.publicMessage = safe ? `OpenAI request mislukte: ${safe}` : "OpenAI request mislukte.";
        wrapped.cause = err;
        throw wrapped;
      }
      const text = extractResponseText(response);
      const usage = extractOpenAiUsage(response);
      const sources = extractOpenAiSources(response);
      const actualTokens =
        Number.isFinite(usage?.totalTokens) && usage.totalTokens > 0 ? usage.totalTokens : tokensRequired;
      void recordUsageEvent({
        userId: user.id,
        provider: "openai",
        model: openaiModel,
        modelLabel: modelLabel || modelKey || requestedModel || openaiModel,
        tokens: actualTokens,
        tokensPerEur,
        costEur: requestCostEur,
      });
      return json(res, 200, { text: text || "", sources });
    } catch (err) {
      // Refund tokens on any provider/runtime error after deduction.
      await refundTokensBestEffort();
      throw err;
    }
  } catch (error) {
    const status = Number(error?.statusCode) || (error?.code === "payload_too_large" ? 413 : 500);
    if (res.headersSent) return;

    const map = {
      messages_required: "Berichten ontbreken.",
      messages_empty: "Berichten ontbreken.",
      messages_too_many: "Te veel context meegestuurd. Start een nieuw gesprek.",
      message_too_large: "Bericht is te lang.",
      messages_too_large: "Te veel tekst/context meegestuurd.",
      gemini_failed: "Gemini kon geen antwoord geven. Probeer opnieuw.",
      grok_failed: "Grok kon geen antwoord geven. Probeer opnieuw.",
      openai_failed: "OpenAI kon geen antwoord geven. Probeer opnieuw.",
      deepseek_failed: "DeepSeek kon geen antwoord geven. Probeer opnieuw.",
      claude_failed: "Claude kon geen antwoord geven. Probeer opnieuw.",
      supabase_auth_admin_failed: "Tokenbeheer faalde door Supabase. Controleer SUPABASE_SERVICE_ROLE_KEY.",
      token_init_failed: "Tokens konden niet worden geïnitialiseerd. Controleer SUPABASE_SERVICE_ROLE_KEY.",
      token_deduct_failed: "Tokens konden niet worden bijgewerkt. Controleer SUPABASE_SERVICE_ROLE_KEY.",
    };
    const publicMsg = error?.publicMessage || map[error?.message] || "Er ging iets mis. Probeer opnieuw.";
    publicError(res, status, publicMsg, error);
  }
};
