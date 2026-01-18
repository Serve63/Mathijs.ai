(() => {
  const init = async () => {
    const data = await window.CourseData?.load?.();
    if (!data) return;

    const heroTitle = document.querySelector(".hero-content h1");
    const heroSubtitle = document.querySelector(".hero-subtitle");
    const statLessons = document.getElementById("course-stat-lessons");
    const statHours = document.getElementById("course-stat-hours");
    const statLevel = document.getElementById("course-stat-level");
    const filterWrap = document.querySelector(".section-filter");
    const grid = document.getElementById("lesson-grid");

    const lessons = Array.isArray(data.lessons) ? data.lessons : [];
    const categories = Array.isArray(data.categories) ? data.categories : [];

    const setText = (el, value) => {
      if (!el || value == null) return;
      if (el.textContent !== value) el.textContent = value;
    };

    const normalizeText = (value) =>
      String(value || "")
        .replace(/\s+/g, " ")
        .trim();

    const getHeroTitleLines = () => {
      if (!heroTitle) return [];
      const lineEls = heroTitle.querySelectorAll(".hero-title-line");
      if (lineEls.length) {
        return Array.from(lineEls)
          .map((el) => normalizeText(el.textContent))
          .filter(Boolean);
      }
      return (heroTitle.innerText || "")
        .split(/\n+/)
        .map((line) => normalizeText(line))
        .filter(Boolean);
    };

    const formatHeroTitleLines = (value, fallbackLines) => {
      const raw = String(value || "").trim();
      if (!raw) return [];
      const normalized = raw.replace(/<br\s*\/?>/gi, "\n");
      const parts = normalized
        .split(/\n+/)
        .map((line) => normalizeText(line))
        .filter(Boolean);
      if (parts.length > 1) return parts;

      const single = parts[0] || normalizeText(normalized);
      if (fallbackLines.length >= 2) {
        const firstLine = fallbackLines[0];
        if (single.startsWith(firstLine)) {
          const rest = single.slice(firstLine.length).trim();
          if (rest) return [firstLine, rest];
        }
      }

      const words = single.split(" ").filter(Boolean);
      if (words.length <= 3) return [single];
      const midpoint = Math.ceil(words.length / 2);
      return [words.slice(0, midpoint).join(" "), words.slice(midpoint).join(" ")];
    };

    const updateHeroTitle = () => {
      if (!heroTitle || !data.title) return;
      const existingLines = getHeroTitleLines();
      const nextLines = formatHeroTitleLines(data.title, existingLines);
      if (!nextLines.length) return;
      const isSame =
        existingLines.length === nextLines.length &&
        existingLines.every((line, idx) => normalizeText(line) === normalizeText(nextLines[idx]));
      if (isSame) return;

      const frag = document.createDocumentFragment();
      nextLines.forEach((line) => {
        const span = document.createElement("span");
        span.className = "hero-title-line";
        span.textContent = line;
        frag.appendChild(span);
      });
      heroTitle.replaceChildren(frag);
    };

    updateHeroTitle();
    const setTextNormalized = (el, value) => {
      if (!el || value == null) return;
      if (normalizeText(el.textContent) !== normalizeText(value)) {
        el.textContent = value;
      }
    };

    if (heroSubtitle && data.description) {
      setTextNormalized(heroSubtitle, data.description);
    }
    if (statLessons) {
      setText(
        statLessons,
        String(data.lessonCount || lessons.filter((l) => l.category !== "Bonus").length || lessons.length)
      );
    }
    if (statHours) setText(statHours, data.hours || "");
    if (statLevel) setText(statLevel, data.level || "");

    const expectedFilters = ["Alles", ...categories];

    const buildTile = (lesson, label) => {
      const tile = document.createElement("div");
      tile.className = "lesson-tile";
      tile.dataset.category = lesson.category || "";
      tile.dataset.videoSrc = lesson.videoUrl || "";

      const number = document.createElement("div");
      number.className = "lesson-number";
      number.textContent = label;

      const title = document.createElement("h2");
      title.className = "lesson-title";
      title.textContent = lesson.title || "Les";

      const meta = document.createElement("div");
      meta.className = "lesson-meta";
      meta.textContent = `Duur: ${lesson.duration || "-"} · Niveau: ${lesson.level || "-"}`;

      tile.append(number, title, meta);
      return tile;
    };

    const renderFilters = () => {
      if (!filterWrap) return;
      const frag = document.createDocumentFragment();
      const allBtn = document.createElement("button");
      allBtn.className = "filter-btn active";
      allBtn.dataset.filter = "all";
      allBtn.textContent = "Alles";
      frag.appendChild(allBtn);

      categories.forEach((cat) => {
        const btn = document.createElement("button");
        btn.className = "filter-btn";
        btn.dataset.filter = cat;
        btn.textContent = cat;
        frag.appendChild(btn);
      });
      filterWrap.replaceChildren(frag);
    };

    const hydrateFilters = () => {
      if (!filterWrap) return;
      const buttons = Array.from(filterWrap.querySelectorAll(".filter-btn"));
      const labels = buttons.map((btn) => btn.textContent.trim());
      const isMatch =
        labels.length === expectedFilters.length &&
        expectedFilters.every((label, idx) => label === labels[idx]);

      if (!isMatch) {
        const height = filterWrap.offsetHeight;
        if (height) filterWrap.style.minHeight = `${height}px`;
        renderFilters();
        filterWrap.style.minHeight = "";
      }

      const updatedButtons = Array.from(filterWrap.querySelectorAll(".filter-btn"));
      updatedButtons.forEach((btn, idx) => {
        btn.dataset.filter = idx === 0 ? "all" : expectedFilters[idx];
      });
    };

    const renderLessons = () => {
      if (!grid) return;
      const frag = document.createDocumentFragment();
      let nonBonusIndex = 0;
      let bonusIndex = 0;
      lessons.forEach((lesson) => {
        const label =
          lesson.category === "Bonus"
            ? `Bonus ${String((bonusIndex += 1)).padStart(2, "0")}`
            : `Les ${String((nonBonusIndex += 1)).padStart(2, "0")}`;
        frag.appendChild(buildTile(lesson, label));
      });
      grid.replaceChildren(frag);
    };

    const hydrateLessons = () => {
      if (!grid) return;
      const tiles = Array.from(grid.querySelectorAll(".lesson-tile"));
      if (tiles.length === lessons.length && tiles.length > 0) {
        let nonBonusIndex = 0;
        let bonusIndex = 0;
        lessons.forEach((lesson, idx) => {
          const tile = tiles[idx];
          const label =
            lesson.category === "Bonus"
              ? `Bonus ${String((bonusIndex += 1)).padStart(2, "0")}`
              : `Les ${String((nonBonusIndex += 1)).padStart(2, "0")}`;

          tile.dataset.category = lesson.category || "";
          tile.dataset.videoSrc = lesson.videoUrl || "";
          setText(tile.querySelector(".lesson-number"), label);
          setText(tile.querySelector(".lesson-title"), lesson.title || "Les");
          setText(
            tile.querySelector(".lesson-meta"),
            `Duur: ${lesson.duration || "-"} · Niveau: ${lesson.level || "-"}`
          );
        });
      } else {
        const height = grid.offsetHeight;
        if (height) grid.style.minHeight = `${height}px`;
        renderLessons();
        grid.style.minHeight = "";
      }
    };

    const bindFilters = () => {
      if (!filterWrap || !grid) return;
      filterWrap.addEventListener("click", (e) => {
        const btn = e.target.closest(".filter-btn");
        if (!btn) return;
        const filter = btn.dataset.filter;
        filterWrap.querySelectorAll(".filter-btn").forEach((el) => el.classList.remove("active"));
        btn.classList.add("active");

        grid.querySelectorAll(".lesson-tile").forEach((tile) => {
          const match = filter === "all" || tile.dataset.category === filter;
          tile.style.display = match ? "" : "none";
        });
      });
    };

    const initModal = () => {
      const DEFAULT_VIDEO_SRC = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
      const modal = document.getElementById("lesson-modal");
      const titleEl = document.getElementById("lesson-modal-title");
      const video = document.getElementById("lesson-video");
      const closeBtn = document.getElementById("lesson-modal-close");
      if (!grid || !modal || !titleEl || !video || !closeBtn) return;

      const open = (title, src) => {
        titleEl.textContent = title || "Les";
        video.src = src || DEFAULT_VIDEO_SRC;
        modal.classList.remove("is-hidden");
        document.body.style.overflow = "hidden";
      };

      const close = () => {
        modal.classList.add("is-hidden");
        document.body.style.overflow = "";
        try {
          video.pause();
        } catch (_) {}
        video.removeAttribute("src");
        video.load();
      };

      grid.addEventListener("click", (e) => {
        const tile = e.target.closest(".lesson-tile");
        if (!tile) return;
        const title = tile.querySelector(".lesson-title")?.textContent?.trim() || "Les";
        const src = tile.dataset.videoSrc || DEFAULT_VIDEO_SRC;
        open(title, src);
      });

      closeBtn.addEventListener("click", close);
      modal.addEventListener("click", (e) => {
        if (e.target === modal) close();
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !modal.classList.contains("is-hidden")) {
          close();
        }
      });
    };

    const initBackGuard = () => {
      try {
        const HOME_URL = "/staff-dashboard";
        history.pushState({ courseBackGuard: true }, "", location.href);
        window.addEventListener("popstate", () => {
          window.location.replace(HOME_URL);
        });
      } catch (_) {
        // no-op
      }
    };

    hydrateFilters();
    hydrateLessons();
    bindFilters();
    initModal();
    initBackGuard();
  };

  init();
})();
