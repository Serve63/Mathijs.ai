(() => {
  const API_ENDPOINT = "/api/course-content";

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
      {
        id: "bonus-1",
        title: "Bonus les 1",
        duration: "12 min",
        level: "Pro",
        videoUrl: "https://...",
        category: "Bonus",
      },
      {
        id: "bonus-2",
        title: "Bonus les 2",
        duration: "12 min",
        level: "Pro",
        videoUrl: "https://...",
        category: "Bonus",
      }
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

  const clone = (value) => JSON.parse(JSON.stringify(value));

  const mergeWithDefaults = (incoming) => ({
    ...clone(DEFAULT_COURSE),
    ...(incoming || {}),
  });

  const loadCourseData = async () => {
    try {
      const resp = await fetch(API_ENDPOINT, { method: "GET", credentials: "include" });
      if (!resp.ok) throw new Error(`load_failed:${resp.status}`);
      const payload = await resp.json();
      return mergeWithDefaults(payload?.payload || payload);
    } catch (err) {
      console.warn("[course-data] load failed, using defaults", err);
      return mergeWithDefaults(null);
    }
  };

  const saveCourseData = async (data) => {
    try {
      const resp = await fetch(API_ENDPOINT, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: data }),
      });
      if (!resp.ok) throw new Error(`save_failed:${resp.status}`);
      const payload = await resp.json();
      return mergeWithDefaults(payload?.payload || data);
    } catch (err) {
      console.error("[course-data] save failed", err);
      throw err;
    }
  };

  window.CourseData = {
    load: loadCourseData,
    save: saveCourseData,
    defaults: clone(DEFAULT_COURSE),
  };
})();


