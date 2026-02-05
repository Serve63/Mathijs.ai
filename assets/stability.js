(() => {
  try {
    const ensurePreconnect = (href, withCrossOrigin = false) => {
      if (!href) return;
      if (document.querySelector(`link[rel="preconnect"][href="${href}"]`)) return;
      const link = document.createElement("link");
      link.rel = "preconnect";
      link.href = href;
      if (withCrossOrigin) link.crossOrigin = "anonymous";
      document.head.appendChild(link);
    };

    ensurePreconnect("https://mengrlsqgshxqcxhirjn.supabase.co", true);

    const params = new URLSearchParams(window.location.search);
    const force =
      params.has("stable") ||
      params.get("stable") === "1" ||
      params.has("stability") ||
      params.get("stability") === "1";

    if (force) {
      try {
        window.localStorage.setItem("stability-mode", "1");
      } catch {
        // Ignore storage errors.
      }
    }

    let stored = false;
    try {
      stored = window.localStorage.getItem("stability-mode") === "1";
    } catch {
      stored = false;
    }

    const cores = Number(navigator.hardwareConcurrency || 0);
    const memory = Number(navigator.deviceMemory || 0);
    const lowPower = (cores && cores <= 4) || (memory && memory <= 4);

    if (force || stored || lowPower) {
      document.documentElement.classList.add("stability-mode");
    }
  } catch (err) {
    console.warn("Stability mode init failed", err);
  }
})();
