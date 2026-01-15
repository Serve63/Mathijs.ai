(() => {
  const data = window.CourseData?.get?.() || null;
  if (!data) return;

  const lessonList = document.getElementById("lesson-list");
  const categoryList = document.getElementById("category-list");
  const addCategoryBtn = document.getElementById("add-category");
  const addLessonBtn = document.getElementById("add-lesson");
  const saveBtn = document.getElementById("save-course");

  const fields = {
    title: document.getElementById("course-title"),
    level: document.getElementById("course-level"),
    lessonCount: document.getElementById("course-lessons"),
    hours: document.getElementById("course-hours"),
    description: document.getElementById("course-description"),
  };

  const createField = (labelText, type, value, key) => {
    const row = document.createElement("div");
    row.className = "row";
    const label = document.createElement("label");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.type = type;
    input.value = value ?? "";
    if (key) input.dataset.field = key;
    row.append(label, input);
    return row;
  };

  const createCategoryRow = (value) => {
    const row = document.createElement("div");
    row.className = "category-item";
    const input = document.createElement("input");
    input.type = "text";
    input.value = value || "";
    input.dataset.category = "true";
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn secondary category-remove";
    removeBtn.textContent = "Verwijder";
    removeBtn.addEventListener("click", () => row.remove());
    row.append(input, removeBtn);
    return row;
  };

  const createLessonItem = (lesson) => {
    const item = document.createElement("div");
    item.className = "lesson-item";
    item.dataset.lessonId = lesson.id || "";

    const meta = document.createElement("div");
    meta.className = "lesson-meta";
    meta.append(
      createField("Titel", "text", lesson.title, "title"),
      createField("Duur", "text", lesson.duration, "duration"),
      createField("Niveau", "text", lesson.level, "level"),
      createField("Video-URL", "url", lesson.videoUrl, "videoUrl")
    );

    const categoryRow = document.createElement("div");
    categoryRow.className = "row";
    const categoryLabel = document.createElement("label");
    categoryLabel.textContent = "Categorie";
    const categorySelect = document.createElement("select");
    categorySelect.dataset.field = "category";
    const categories = getCategories();
    categories.forEach((cat) => {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      if (cat === lesson.category) opt.selected = true;
      categorySelect.appendChild(opt);
    });
    categoryRow.append(categoryLabel, categorySelect);
    meta.append(categoryRow);

    const actions = document.createElement("div");
    actions.className = "actions";
    const replaceBtn = document.createElement("button");
    replaceBtn.className = "btn secondary";
    replaceBtn.type = "button";
    replaceBtn.textContent = "Vervang video";
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn secondary";
    deleteBtn.type = "button";
    deleteBtn.textContent = "Verwijder les";
    deleteBtn.addEventListener("click", () => item.remove());
    actions.append(replaceBtn, deleteBtn);

    item.append(meta, actions);
    return item;
  };

  const renderCategories = () => {
    if (!categoryList) return;
    categoryList.innerHTML = "";
    getCategories().forEach((cat) => categoryList.append(createCategoryRow(cat)));
  };

  const renderLessons = () => {
    if (!lessonList) return;
    lessonList.innerHTML = "";
    data.lessons.forEach((lesson) => lessonList.append(createLessonItem(lesson)));
  };

  const getCategories = () => {
    const base = data.categories?.length ? data.categories : [];
    const unique = Array.from(new Set(base.filter(Boolean)));
    return unique.length ? unique : ["Strategie", "Governance", "Automatisering", "Bonus"];
  };

  const syncLessonCategoryOptions = () => {
    const categories = getCategories();
    lessonList?.querySelectorAll('select[data-field="category"]').forEach((select) => {
      const current = select.value;
      select.innerHTML = "";
      categories.forEach((cat) => {
        const opt = document.createElement("option");
        opt.value = cat;
        opt.textContent = cat;
        if (cat === current) opt.selected = true;
        select.appendChild(opt);
      });
    });
  };

  const readCategories = () => {
    const inputs = Array.from(categoryList?.querySelectorAll('input[data-category="true"]') || []);
    const values = inputs.map((input) => input.value.trim()).filter(Boolean);
    return Array.from(new Set(values));
  };

  const readLessons = () => {
    const items = Array.from(lessonList?.querySelectorAll(".lesson-item") || []);
    return items.map((item, idx) => {
      const getField = (key) => item.querySelector(`[data-field="${key}"]`)?.value?.trim() || "";
      return {
        id: item.dataset.lessonId || `lesson-${idx + 1}`,
        title: getField("title"),
        duration: getField("duration"),
        level: getField("level"),
        videoUrl: getField("videoUrl"),
        category: getField("category") || "Strategie",
      };
    });
  };

  const populateHeaderFields = () => {
    fields.title.value = data.title || "";
    fields.level.value = data.level || "";
    fields.lessonCount.value = data.lessonCount ?? data.lessons.length;
    fields.hours.value = data.hours || "";
    fields.description.value = data.description || "";
  };

  const save = () => {
    const categories = readCategories();
    const lessons = readLessons();
    const payload = {
      ...data,
      title: fields.title.value.trim(),
      level: fields.level.value.trim(),
      lessonCount: Number(fields.lessonCount.value) || lessons.length,
      hours: fields.hours.value.trim(),
      description: fields.description.value.trim(),
      categories,
      lessons,
    };
    window.CourseData.set(payload);
    data.categories = categories;
    data.lessons = lessons;
    syncLessonCategoryOptions();
  };

  const addLesson = () => {
    const nextIndex = (lessonList?.querySelectorAll(".lesson-item").length || 0) + 1;
    const lesson = {
      id: `lesson-${nextIndex}-${Date.now()}`,
      title: `AI les ${nextIndex}`,
      duration: "12 min",
      level: data.level || "Pro",
      videoUrl: "https://...",
      category: getCategories()[0] || "Strategie",
    };
    lessonList?.append(createLessonItem(lesson));
  };

  populateHeaderFields();
  renderCategories();
  renderLessons();

  addCategoryBtn?.addEventListener("click", () => {
    categoryList?.append(createCategoryRow("Nieuwe categorie"));
    syncLessonCategoryOptions();
  });

  addLessonBtn?.addEventListener("click", addLesson);
  saveBtn?.addEventListener("click", save);

  categoryList?.addEventListener("input", () => {
    syncLessonCategoryOptions();
  });
})();


