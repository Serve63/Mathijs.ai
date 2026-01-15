const { adminRestFetch } = require("./_lib/supabaseAdmin");
const { json, readJson, checkSameOrigin, publicError } = require("./_lib/security");

const TABLE = "course_content";
const DEFAULT_ID = "default";

const createDefaultLessons = () => {
  const items = [];
  const categories = ["Strategie", "Governance", "Automatisering"];
  for (let i = 1; i <= 50; i += 1) {
    const category = categories[Math.min(Math.floor((i - 1) / 17), categories.length - 1)];
    items.push({
      id: `lesson-${i}`,
      title: `AI les ${i}`,
      duration: "12 min",
      level: "Pro",
      videoUrl: "https://...",
      category,
    });
  }
  items.push(
    { id: "bonus-1", title: "Bonus les 1", duration: "12 min", level: "Pro", videoUrl: "https://...", category: "Bonus" },
    { id: "bonus-2", title: "Bonus les 2", duration: "12 min", level: "Pro", videoUrl: "https://...", category: "Bonus" }
  );
  return items;
};

const DEFAULT_COURSE = {
  title: "Word een AI-Expert in 50 Lessen",
  level: "Pro",
  lessonCount: 50,
  hours: "10+",
  description: "Van strategie tot implementatie. Leer alles over governance, automatisering en adoptie.",
  categories: ["Strategie", "Governance", "Automatisering", "Bonus"],
  lessons: createDefaultLessons(),
  updatedAt: null,
};

async function getRow() {
  const rows = await adminRestFetch(`${TABLE}?id=eq.${DEFAULT_ID}&select=*`);
  return rows?.[0] || null;
}

async function ensureRow() {
  const existing = await getRow();
  if (existing) return existing;
  const [created] = await adminRestFetch(TABLE, {
    method: "POST",
    body: { id: DEFAULT_ID, payload: DEFAULT_COURSE },
  });
  return created || { id: DEFAULT_ID, payload: DEFAULT_COURSE };
}

module.exports = async (req, res) => {
  if (!checkSameOrigin(req)) {
    return json(res, 403, { error: "forbidden" });
  }

  try {
    if (req.method === "GET") {
      const row = await ensureRow();
      return json(res, 200, row || { payload: DEFAULT_COURSE });
    }

    if (req.method === "PUT" || req.method === "POST") {
      const body = await readJson(req);
      const payload = body?.payload || body?.data;
      if (!payload) {
        return json(res, 400, { error: "payload_missing" });
      }

      const existing = await getRow();
      if (existing) {
        const [updated] = await adminRestFetch(`${TABLE}?id=eq.${DEFAULT_ID}`, {
          method: "PATCH",
          body: { payload },
        });
        return json(res, 200, updated || { payload });
      }

      const [created] = await adminRestFetch(TABLE, {
        method: "POST",
        body: { id: DEFAULT_ID, payload },
      });
      return json(res, 200, created || { payload });
    }

    return json(res, 405, { error: "method_not_allowed" });
  } catch (err) {
    return publicError(res, err.statusCode || 500, err.publicMessage || "Er ging iets mis.", err);
  }
};


