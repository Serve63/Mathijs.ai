const DEFAULT_STAFF_EMAIL_ALLOWLIST = ["servec321@gmail.com", "martijnven123@gmail.com"];

function parseAllowlistEnv(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

const STAFF_EMAIL_ALLOWLIST = new Set([
  ...DEFAULT_STAFF_EMAIL_ALLOWLIST.map((email) => email.toLowerCase()),
  ...parseAllowlistEnv(process.env.STAFF_EMAIL_ALLOWLIST),
]);

const STAFF_USER_ID_ALLOWLIST = new Set(parseAllowlistEnv(process.env.STAFF_USER_ID_ALLOWLIST));

function isAllowlistedStaff(user) {
  const email = (user?.email || "").toLowerCase().trim();
  if (email && STAFF_EMAIL_ALLOWLIST.has(email)) return true;

  const id = String(user?.id || "").trim().toLowerCase();
  if (id && STAFF_USER_ID_ALLOWLIST.has(id)) return true;

  return false;
}

function isStaffUser(user) {
  const appMeta = user?.app_metadata || {};
  const role = String(appMeta.role || "").toLowerCase();
  if (appMeta.is_staff === true || role === "staff") return true;

  return isAllowlistedStaff(user);
}

module.exports = {
  parseAllowlistEnv,
  STAFF_EMAIL_ALLOWLIST,
  STAFF_USER_ID_ALLOWLIST,
  isAllowlistedStaff,
  isStaffUser,
};
