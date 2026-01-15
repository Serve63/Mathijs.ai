(() => {
  const STORAGE_KEY = "mathijs.course.data.v1";

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

  const getCourseData = () => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const fresh = clone(DEFAULT_COURSE);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
        return fresh;
      }
      const parsed = JSON.parse(raw);
      return { ...clone(DEFAULT_COURSE), ...parsed };
    } catch (_) {
      return clone(DEFAULT_COURSE);
    }
  };

  const setCourseData = (data) => {
    try {
      const payload = { ...data, updatedAt: new Date().toISOString() };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      return payload;
    } catch (_) {
      return data;
    }
  };

  window.CourseData = {
    get: getCourseData,
    set: setCourseData,
    defaults: clone(DEFAULT_COURSE),
  };
})();


