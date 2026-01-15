// Public billing config (safe to expose to frontend)
// Requires env:
// - STRIPE_PUBLISHABLE_KEY

const { json } = require("../_lib/security");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return json(res, 405, { error: "Method not allowed" });
  }
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey) {
    return json(res, 500, { error: "Missing STRIPE_PUBLISHABLE_KEY" });
  }
  return json(res, 200, { publishableKey });
};

