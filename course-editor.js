(() => {
  const list = document.getElementById("lesson-list");
  if (!list) return;

  const lessons = [];
  for (let i = 1; i <= 50; i += 1) {
    lessons.push({
      title: `AI les ${i}`,
      duration: "12 min",
      level: "Pro",
      videoUrl: "https://...",
    });
  }
  lessons.push(
    { title: "Bonus les 1", duration: "12 min", level: "Pro", videoUrl: "https://..." },
    { title: "Bonus les 2", duration: "12 min", level: "Pro", videoUrl: "https://..." }
  );

  const createField = (labelText, type, value) => {
    const row = document.createElement("div");
    row.className = "row";
    const label = document.createElement("label");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.type = type;
    input.value = value;
    row.append(label, input);
    return row;
  };

  lessons.forEach((lesson) => {
    const item = document.createElement("div");
    item.className = "lesson-item";

    const meta = document.createElement("div");
    meta.className = "lesson-meta";
    meta.append(
      createField("Titel", "text", lesson.title),
      createField("Duur", "text", lesson.duration),
      createField("Niveau", "text", lesson.level),
      createField("Video-URL", "url", lesson.videoUrl)
    );

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
    actions.append(replaceBtn, deleteBtn);

    item.append(meta, actions);
    list.append(item);
  });
})();


