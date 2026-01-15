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

    if (heroTitle && data.title) {
      heroTitle.innerHTML = data.title.replace(/\n/g, "<br>");
    }
    if (heroSubtitle && data.description) {
      heroSubtitle.textContent = data.description;
    }
    if (statLessons) {
      statLessons.textContent = String(
        data.lessonCount || lessons.filter((l) => l.category !== "Bonus").length || lessons.length
      );
    }
    if (statHours) statHours.textContent = data.hours || "";
    if (statLevel) statLevel.textContent = data.level || "";

    const renderFilters = () => {
      if (!filterWrap) return;
      filterWrap.innerHTML = "";
      const allBtn = document.createElement("button");
      allBtn.className = "filter-btn active";
      allBtn.dataset.filter = "all";
      allBtn.textContent = "Alles";
      filterWrap.appendChild(allBtn);

      categories.forEach((cat) => {
        const btn = document.createElement("button");
        btn.className = "filter-btn";
        btn.dataset.filter = cat;
        btn.textContent = cat;
        filterWrap.appendChild(btn);
      });
    };

    const renderLessons = () => {
      if (!grid) return;
      grid.innerHTML = "";
      let nonBonusIndex = 0;
      lessons.forEach((lesson, index) => {
        const tile = document.createElement("div");
        tile.className = "lesson-tile";
        tile.dataset.category = lesson.category || "";
        tile.dataset.videoSrc = lesson.videoUrl || "";

        const number = document.createElement("div");
        number.className = "lesson-number";
        if (lesson.category === "Bonus") {
          const bonusIndex = lessons.filter((l) => l.category === "Bonus").indexOf(lesson) + 1;
          number.textContent = `Bonus ${String(bonusIndex).padStart(2, "0")}`;
        } else {
          nonBonusIndex += 1;
          number.textContent = `Les ${String(nonBonusIndex).padStart(2, "0")}`;
        }

        const title = document.createElement("h2");
        title.className = "lesson-title";
        title.textContent = lesson.title || "Les";

        const meta = document.createElement("div");
        meta.className = "lesson-meta";
        meta.textContent = `Duur: ${lesson.duration || "-"} · Niveau: ${lesson.level || "-"}`;

        tile.append(number, title, meta);
        grid.appendChild(tile);
      });
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
        const HOME_URL = "index.html";
        history.pushState({ courseBackGuard: true }, "", location.href);
        window.addEventListener("popstate", () => {
          window.location.replace(HOME_URL);
        });
      } catch (_) {
        // no-op
      }
    };

    renderFilters();
    renderLessons();
    bindFilters();
    initModal();
    initBackGuard();
  };

  init();
})();


