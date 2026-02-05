	      const inlineScripts = Array.from(document.querySelectorAll("script:not([src])"))
	        .filter((script) => script.textContent && script.textContent.trim().length);
	      if (inlineScripts.length) {
	        inlineScripts.forEach((script) => script.remove());
	        console.warn("[chat] Inline scripts detected in /chat. Keep scripts in assets/chat.js to avoid CSP issues.");
	      }

      const appLoader = document.getElementById("app-loader");
      const APP_LOADER_MIN_MS = 1000;
      const appLoaderStart = Date.now();
      let appLoaderHidden = false;
      const hideAppLoader = async (waitFor = null) => {
        if (!appLoader || appLoaderHidden) return;
        if (waitFor) {
          try {
            await waitFor;
          } catch {
            // ignore loader wait failures
          }
        }
        const elapsed = Date.now() - appLoaderStart;
        const delay = Math.max(0, APP_LOADER_MIN_MS - elapsed);
        setTimeout(() => {
          if (!appLoader || appLoaderHidden) return;
          appLoader.classList.add("is-hidden");
          appLoaderHidden = true;
          setTimeout(() => {
            appLoader.remove();
          }, 400);
        }, delay);
      };

      const modelSelects = Array.from(document.querySelectorAll(".model-select"));
      const modelSwipe = document.getElementById("model-swipe");
      const modelSwipeTrack = document.getElementById("model-swipe-track");
      const modelSwipeViewport = document.getElementById("model-swipe-viewport");
      const modelSwipePrev = document.getElementById("model-swipe-prev");
      const modelSwipeNext = document.getElementById("model-swipe-next");
      const modelSwipeItems = modelSwipeTrack ? Array.from(modelSwipeTrack.querySelectorAll(".model-swipe__item")) : [];
      const statusIndicator = null;
      const sidebarTop = document.querySelector(".sidebar-top");
      const newChatButton = document.querySelector(".new-chat");

      let sidebarOffsetRevealed = false;
      const revealSidebarOffset = () => {
        if (sidebarOffsetRevealed) return;
        sidebarOffsetRevealed = true;
        document.documentElement.classList.remove("sidebar-offset-pending");
        document.documentElement.classList.add("sidebar-offset-ready");
      };

      const syncSidebarTopOffset = () => {
        document.documentElement.style.setProperty("--sidebar-top-offset", "0px");
      };

      const scheduleSidebarTopOffsetSync = () => {
        requestAnimationFrame(syncSidebarTopOffset);
      };

      syncSidebarTopOffset();
      scheduleSidebarTopOffsetSync();
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
          syncSidebarTopOffset();
          revealSidebarOffset();
        });
      } else {
        revealSidebarOffset();
      }
      setTimeout(() => {
        if (!sidebarOffsetRevealed) {
          syncSidebarTopOffset();
          revealSidebarOffset();
        }
      }, 1200);
	      window.addEventListener("resize", scheduleSidebarTopOffsetSync, { passive: true });
	      window.addEventListener("load", scheduleSidebarTopOffsetSync, { passive: true });
      const profileAvatar = document.querySelector(".profile-avatar");
      const profileAvatarImage = profileAvatar ? profileAvatar.querySelector(".profile-avatar__image") : null;
      const profileAvatarInput = document.getElementById("profile-avatar-input");
      const profileMenuButton = document.querySelector(".profile-menu");
      const profileModal = document.getElementById("profile-modal");
      const profileModalClose = document.querySelector(".profile-modal__close");
      const profileModalDialog = profileModal ? profileModal.querySelector(".profile-modal__dialog") : null;
      const chatPlus = document.getElementById("chat-plus");
      const chatPlusMenu = document.getElementById("chat-plus-menu");
      const thinkingModeSelect = document.getElementById("thinking-mode-select");
      const thinkingModeTrigger = document.getElementById("thinking-mode-trigger");
      const thinkingModeMenu = document.getElementById("thinking-mode-menu");
      const thinkingModeValue = document.getElementById("thinking-mode-value");
      const thinkingModeWrap = document.querySelector(".chat-mode-select");
      const toggleWebSearch = document.getElementById("toggle-web-search");
      const webSearchState = document.getElementById("web-search-state");
      const chatSearchIndicator = document.getElementById("chat-search-indicator");
      const chatSearchClose = document.getElementById("chat-search-close");
      const actionUpload = document.getElementById("action-upload");
      const actionGeneratePhoto = document.getElementById("action-generate-photo");
      const actionGenerateVideo = document.getElementById("action-generate-video");
      const actionGenerateVideoLabel = actionGenerateVideo
        ? actionGenerateVideo.querySelector(".chat-plus__label-text")
        : null;
      const actionGenerateVideoInfo = actionGenerateVideo
        ? actionGenerateVideo.querySelector(".chat-plus__info")
        : null;
      const actionGeneratePhotoLabel = actionGeneratePhoto
        ? actionGeneratePhoto.querySelector(".chat-plus__label-text")
        : null;
      const actionGeneratePhotoInfo = actionGeneratePhoto
        ? actionGeneratePhoto.querySelector(".chat-plus__info")
        : null;
      const TOOLTIP_UPDATE_DATE = "2025-12-21";
      const layoutToggleBtn = document.getElementById("layout-toggle");
      const hiddenFileInput = document.createElement("input");
      hiddenFileInput.type = "file";
      hiddenFileInput.style.display = "none";
      document.body.appendChild(hiddenFileInput);
      let connectTimeout;
      const selectionState = {};
      let activeModelIndex = 0;
      let workspaceBooted = false;
      let modelSessionMap = {};
      let modelStateHydratedForUserId = null;
      let touchStartX = 0;
      let touchEndX = 0;
      const createSystemMessage = () => ({
        role: "developer",
        content: "Je bent een behulpzame AI-assistent in de AI-leeromgeving van Mathijs.ai. Je helpt ondernemers kiezen en toepassen wanneer ze welk model gebruiken.",
      });
      let messages = [createSystemMessage()];
      let webSearchEnabled = false;
      let selectedThinkingMode = "instantly";

      const defaultThinkingOptions = [
        { value: "snel", label: "Snel" },
        { value: "denken", label: "Denken" },
      ];
      const thinkingModeOptions = {
        chatgpt52: [
          { value: "instantly", label: "Instantly" },
          { value: "thinking", label: "Thinking" },
        ],
        gemini3: [
          { value: "snel", label: "Snel" },
          { value: "denken", label: "Denken" },
        ],
        deepseekv2: [
          { value: "snel", label: "Snel" },
          { value: "diepdenken", label: "Diepdenken" },
        ],
        grok4: [
          { value: "snel", label: "Snel" },
          { value: "expert", label: "Expert" },
        ],
      };
      const noThinkingModels = new Set(["opus45", "sonnet45", "haiku45", "llama4"]);

      const updateToolMenuLabels = () => {
        let photoInfoText = "";
        if (selectedModel === "chatgpt52") {
          photoInfoText = `Foto model: GPT Image 1.5\nLaatste update: ${TOOLTIP_UPDATE_DATE}`;
        } else if (selectedModel === "gemini3") {
          photoInfoText = `Foto model: Imagen 3\nLaatste update: ${TOOLTIP_UPDATE_DATE}`;
        } else if (selectedModel === "grok4") {
          photoInfoText = `Foto model: grok-2-image\nLaatste update: ${TOOLTIP_UPDATE_DATE}`;
        } else if (selectedModel === "qwen") {
          photoInfoText = `Foto model: qwen-image-plus\nLaatste update: ${TOOLTIP_UPDATE_DATE}`;
        }
        if (actionGeneratePhotoLabel) {
          actionGeneratePhotoLabel.textContent = "Foto maken";
        }
        if (actionGeneratePhotoInfo) {
          actionGeneratePhotoInfo.dataset.tooltip = photoInfoText;
          actionGeneratePhotoInfo.removeAttribute("title");
          actionGeneratePhotoInfo.style.display = photoInfoText ? "inline-flex" : "none";
        }

        if (!actionGenerateVideoLabel || !actionGenerateVideoInfo) return;
        let videoInfoText = "";
        if (selectedModel === "gemini3") {
          videoInfoText = "Veo 3.1";
        } else if (selectedModel === "chatgpt52") {
          videoInfoText = "Sora 1";
        } else if (selectedModel === "qwen") {
          videoInfoText = "wan2.6-t2v";
        }
        actionGenerateVideoLabel.textContent = "Video maken";
        const videoTooltip = videoInfoText
          ? `Video model: ${videoInfoText}\nLaatste update: ${TOOLTIP_UPDATE_DATE}`
          : "";
        actionGenerateVideoInfo.dataset.tooltip = videoTooltip;
        actionGenerateVideoInfo.removeAttribute("title");
        actionGenerateVideoInfo.style.display = videoTooltip ? "inline-flex" : "none";
      };

      const updateToolMenuVisibility = () => {
        if (toggleWebSearch) {
          toggleWebSearch.style.display = "flex";
        }
        if (actionGeneratePhoto) {
          const showPhoto =
            selectedModel === "chatgpt52" ||
            selectedModel === "gemini3" ||
            selectedModel === "grok4" ||
            selectedModel === "qwen";
          actionGeneratePhoto.style.display = showPhoto ? "flex" : "none";
        }
        if (actionGenerateVideo) {
          const showVideo = selectedModel === "chatgpt52" || selectedModel === "gemini3" || selectedModel === "qwen";
          actionGenerateVideo.style.display = showVideo ? "flex" : "none";
        }
        if (chatPlus) {
          chatPlus.style.display = selectedModel === "llama4" ? "none" : "";
        }
      };

      [actionGeneratePhotoInfo, actionGenerateVideoInfo].forEach((infoEl) => {
        if (!infoEl) return;
        infoEl.addEventListener("click", (event) => {
          event.stopPropagation();
        });
      });

      let currentThinkingOptions = defaultThinkingOptions;

      const updateThinkingModeLabel = (options, value) => {
        if (!thinkingModeValue) return;
        const match = options.find((option) => option.value === value);
        thinkingModeValue.textContent = match ? match.label : value;
      };

      const renderThinkingModeMenu = (options, activeValue) => {
        if (!thinkingModeMenu) return;
        thinkingModeMenu.innerHTML = "";
        options.forEach((option) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "chat-mode-option";
          btn.setAttribute("role", "option");
          btn.setAttribute("data-value", option.value);
          btn.textContent = option.label;
          if (option.value === activeValue) {
            btn.classList.add("is-active");
            btn.setAttribute("aria-selected", "true");
          } else {
            btn.setAttribute("aria-selected", "false");
          }
          btn.addEventListener("click", () => {
            selectedThinkingMode = option.value;
            if (thinkingModeSelect) {
              thinkingModeSelect.value = option.value;
              thinkingModeSelect.dispatchEvent(new Event("change", { bubbles: true }));
            }
            updateThinkingModeLabel(options, option.value);
            renderThinkingModeMenu(options, option.value);
            closeThinkingMenu();
          });
          thinkingModeMenu.appendChild(btn);
        });
      };

      const syncThinkingModeOptions = () => {
        if (!thinkingModeSelect) return;
        const options = thinkingModeOptions[selectedModel] || defaultThinkingOptions;
        const nextMode = options.some((option) => option.value === selectedThinkingMode)
          ? selectedThinkingMode
          : options[0].value;
        selectedThinkingMode = nextMode;
        currentThinkingOptions = options;
        thinkingModeSelect.innerHTML = "";
        options.forEach((option) => {
          const opt = document.createElement("option");
          opt.value = option.value;
          opt.textContent = option.label;
          thinkingModeSelect.appendChild(opt);
        });
        thinkingModeSelect.value = nextMode;
        updateThinkingModeLabel(options, nextMode);
        renderThinkingModeMenu(options, nextMode);
      };

      const OPENAI_MODEL_LABEL_MAP = {
        // UI labels are marketing; API models are stable OpenAI IDs.
        "ChatGPT 5.2": "gpt-4o",
        "GPT-5.2": "gpt-4o",
        "GPT-5 mini": "gpt-4o-mini",
      };
      const GEMINI_MODEL_LABEL_MAP = {
        "Gemini 3": "gemini-1.5-flash",
      };
      const GROK_MODEL_LABEL_MAP = {
        "Grok 4": "grok-4-0709",
      };
      const CLAUDE_MODEL_LABEL_MAP = {
        "Opus 4.5": "claude-opus-4-5",
        "Sonnet 4.5": "claude-sonnet-4-5",
        "Haiku 4.5": "claude-haiku-4-5",
      };
      const MODEL_PROVIDER_MAP = {
        chatgpt52: "openai",
        opus45: "anthropic",
        sonnet45: "anthropic",
        haiku45: "anthropic",
        gemini3: "gemini",
        qwen: "qwen",
        deepseekv2: "deepseek",
        grok4: "grok",
      };
      const getSelectedProvider = () => MODEL_PROVIDER_MAP[selectedModel] || "unknown";
      const getSelectedOpenAIModel = () => OPENAI_MODEL_LABEL_MAP[selectedModelLabel] || null;
      const getSelectedGeminiModel = () => GEMINI_MODEL_LABEL_MAP[selectedModelLabel] || null;
      const getSelectedGrokModel = () => GROK_MODEL_LABEL_MAP[selectedModelLabel] || null;
      const getSelectedClaudeModel = () => CLAUDE_MODEL_LABEL_MAP[selectedModelLabel] || null;
		      let selectedModel = "chatgpt52";
		      let selectedModelLabel = "GPT-5 mini";
		      let thinkingIndicator = null;

	      // Toggle fullscreen chat (hide header + sidebar)
	      if (layoutToggleBtn) {
	        layoutToggleBtn.addEventListener("click", () => {
	          const isFullscreen = document.body.classList.toggle("chat-fullscreen");
	          const label = isFullscreen ? "Verlaat fullscreen" : "Vergroot chat";
	          layoutToggleBtn.setAttribute("aria-label", label);
	          layoutToggleBtn.setAttribute("title", label);
	        });
	      }

      const updateSelectedModel = (label) => {
        selectedModelLabel = label || "GPT-5 mini";
        if (label && label.startsWith("Opus 4.5")) {
          selectedModel = "opus45";
        } else if (label && label.startsWith("Sonnet 4.5")) {
          selectedModel = "sonnet45";
        } else if (label && label.startsWith("Haiku 4.5")) {
          selectedModel = "haiku45";
        } else if (label && label.startsWith("Gemini 3")) {
          selectedModel = "gemini3";
        } else if (label && label.startsWith("Qwen3-MAX")) {
          selectedModel = "qwen";
        } else if (label && label.startsWith("DeepSeek V2")) {
          selectedModel = "deepseekv2";
        } else if (label && label.startsWith("Grok 4")) {
          selectedModel = "grok4";
        } else {
          selectedModel = "chatgpt52";
        }
        syncThinkingModeOptions();
        updateToolMenuLabels();
        updateToolMenuVisibility();
        updateThinkingModeVisibility();
      };

      let activeCategory = "chat";

      const getCategoryLabel = (categoryKey) => {
        const select = modelSelects.find((item) => item.getAttribute("data-category") === categoryKey);
        return select ? select.getAttribute("data-label") || categoryKey : categoryKey;
      };

      const updateActiveSelectStyles = () => {
        modelSelects.forEach((select) => {
          const key = select.getAttribute("data-category") || "model";
          const isActive = key === activeCategory;
          select.classList.toggle("is-active", isActive);
          const activator = select.querySelector(".model-select__activator");
          if (activator) {
            activator.setAttribute("aria-pressed", isActive ? "true" : "false");
          }
        });
      };

      function closeThinkingMenu() {
        if (!thinkingModeMenu || !thinkingModeTrigger) return;
        thinkingModeMenu.classList.remove("is-open");
        thinkingModeTrigger.setAttribute("aria-expanded", "false");
      }

      const updateThinkingModeVisibility = () => {
        if (!thinkingModeWrap) return;
        const shouldShow = !noThinkingModels.has(selectedModel);
        thinkingModeWrap.style.display = shouldShow ? "inline-flex" : "none";
        if (!shouldShow) {
          closeThinkingMenu();
        }
      };

      const closeAllDropdowns = (exception = null) => {
        modelSelects.forEach((select) => {
          const dropdown = select.querySelector(".model-dropdown");
          const trigger = select.querySelector(".model-select__trigger");
          if (!dropdown || !trigger || dropdown === exception) return;
          dropdown.classList.remove("active");
          trigger.setAttribute("aria-expanded", "false");
        });
        if (chatPlusMenu && exception !== chatPlusMenu) {
          chatPlusMenu.style.display = "none";
          if (chatPlus) chatPlus.setAttribute("aria-expanded", "false");
        }
        if (thinkingModeMenu && exception !== thinkingModeMenu) {
          closeThinkingMenu();
        }
      };

      if (thinkingModeSelect) {
        syncThinkingModeOptions();
        updateToolMenuLabels();
        updateToolMenuVisibility();
        updateThinkingModeVisibility();
        thinkingModeSelect.addEventListener("change", (event) => {
          selectedThinkingMode = event.target.value;
          updateThinkingModeLabel(currentThinkingOptions, selectedThinkingMode);
          renderThinkingModeMenu(currentThinkingOptions, selectedThinkingMode);
        });
      }

      if (thinkingModeTrigger && thinkingModeMenu) {
        thinkingModeTrigger.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const isOpen = thinkingModeMenu.classList.contains("is-open");
          closeAllDropdowns(isOpen ? null : thinkingModeMenu);
          if (isOpen) {
            closeThinkingMenu();
          } else {
            thinkingModeMenu.classList.add("is-open");
            thinkingModeTrigger.setAttribute("aria-expanded", "true");
          }
        });
      }

      const setStatus = (label, state = "idle") => {
        if (!statusIndicator) return;
      };

      const setActiveCategory = (categoryKey) => {
        if (!categoryKey) return;
        if (categoryKey === activeCategory) {
          updateActiveSelectStyles();
          return;
        }
        activeCategory = categoryKey;
        updateActiveSelectStyles();
      };

      const initialActiveSelect = modelSelects.find((select) => {
        const activator = select.querySelector(".model-select__activator");
        return activator && activator.getAttribute("aria-pressed") === "true";
      });

      if (initialActiveSelect) {
        activeCategory = initialActiveSelect.getAttribute("data-category") || "chat";
      } else if (modelSelects.length > 0) {
        activeCategory = modelSelects[0].getAttribute("data-category") || "chat";
      }

      updateActiveSelectStyles();

      const handleModelChange = async (categoryLabel, value, options = {}) => {
        const { silent = false } = options;
        if (connectTimeout) clearTimeout(connectTimeout);
        const provider = categoryLabel.toLowerCase() === "model" ? getSelectedProvider() : "unknown";
        const status = await refreshProviderStatus();

        const connected =
          (provider === "openai" && status.openai === true) ||
          (provider === "gemini" && status.gemini === true) ||
          (provider === "grok" && status.grok === true) ||
          (provider === "anthropic" && status.claude === true);
        const statusLabel = connected ? "Verbonden" : "Niet gekoppeld";
        setStatus(statusLabel, "idle");

        let message = `${categoryLabel} ${value} is nog niet gekoppeld.`;
        if (connected) {
          if (provider === "gemini") {
            message = `${categoryLabel} ${value} is verbonden via Gemini.`;
          } else if (provider === "grok") {
            message = `${categoryLabel} ${value} is verbonden via Grok.`;
          } else if (provider === "anthropic") {
            message = `${categoryLabel} ${value} is verbonden via Claude.`;
          } else {
            message = `${categoryLabel} ${value} is verbonden via OpenAI.`;
          }
        } else if (provider === "gemini") {
          message = `${categoryLabel} ${value} is nog niet gekoppeld. Voeg GEMINI_API_KEY toe om Gemini te gebruiken.`;
        } else if (provider === "grok") {
          message = `${categoryLabel} ${value} is nog niet gekoppeld. Voeg GROK_API_KEY toe om Grok te gebruiken.`;
        } else if (provider === "anthropic") {
          message = `${categoryLabel} ${value} is nog niet gekoppeld. Voeg CLAUDE_API_KEY toe om Claude te gebruiken.`;
        }

        if (!silent) {
          appendMessage(message, "system", { persist: false });
        }
      };

      const normalizeModelIndex = (index) => {
        if (!modelSwipeItems.length) return 0;
        const total = modelSwipeItems.length;
        return ((index % total) + total) % total;
      };

      const getModelIndexByLabel = (label) =>
        modelSwipeItems.findIndex((item) => (item.getAttribute("data-model") || "").trim() === String(label || "").trim());

      const syncModelSwipeUI = () => {
        if (!modelSwipeTrack || !modelSwipeItems.length) return;
        const index = normalizeModelIndex(activeModelIndex);
        activeModelIndex = index;
        modelSwipeTrack.style.transform = `translateX(-${index * 100}%)`;
        modelSwipeItems.forEach((item, idx) => {
          const isSelected = idx === index;
          item.classList.toggle("is-selected", isSelected);
          item.setAttribute("aria-selected", isSelected ? "true" : "false");
        });
      };

      const MODEL_SELECTION_KEY = "mathijs_selected_model_v1";
      const loadSavedModelLabel = (userId) => {
        if (!userId) return null;
        try {
          const raw = localStorage.getItem(MODEL_SELECTION_KEY);
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          const value = parsed[userId];
          return typeof value === "string" && value.trim() ? value : null;
        } catch {
          return null;
        }
      };

      const saveModelLabel = (userId, label) => {
        if (!userId || !label) return;
        try {
          const raw = localStorage.getItem(MODEL_SELECTION_KEY);
          const parsed = raw ? JSON.parse(raw) : {};
          parsed[userId] = label;
          localStorage.setItem(MODEL_SELECTION_KEY, JSON.stringify(parsed));
        } catch {
          // ignore
        }
      };

      const MODEL_SESSION_KEY = "mathijs_model_session_map_v1";
      const loadModelSessionMap = (userId) => {
        if (!userId) return {};
        try {
          const raw = localStorage.getItem(MODEL_SESSION_KEY);
          if (!raw) return {};
          const parsed = JSON.parse(raw);
          return parsed[userId] && typeof parsed[userId] === "object" ? parsed[userId] : {};
        } catch {
          return {};
        }
      };

      const saveModelSessionMap = (userId, map) => {
        if (!userId || !map || typeof map !== "object") return;
        try {
          const raw = localStorage.getItem(MODEL_SESSION_KEY);
          const parsed = raw ? JSON.parse(raw) : {};
          parsed[userId] = map;
          localStorage.setItem(MODEL_SESSION_KEY, JSON.stringify(parsed));
        } catch {
          // ignore
        }
      };

      const sanitizeModelSessionMap = (rawMap) => {
        if (!rawMap || typeof rawMap !== "object") return {};
        return Object.entries(rawMap).reduce((acc, [modelKey, sessionId]) => {
          if (typeof modelKey !== "string") return acc;
          if (typeof sessionId !== "string" || !sessionId.trim()) return acc;
          acc[modelKey] = sessionId.trim();
          return acc;
        }, {});
      };

      const getModelSessionKeyByLabel = (label) => {
        const normalized = String(label || "").trim();
        return normalized || null;
      };

      const getCurrentModelSessionKey = () => getModelSessionKeyByLabel(selectedModelLabel);

      const getLegacyModelSessionKey = () => {
        const normalized = String(selectedModel || "").trim();
        return normalized || null;
      };

      const hydrateModelStateForUser = async (userId) => {
        if (!userId || modelStateHydratedForUserId === userId) return;
        modelSessionMap = sanitizeModelSessionMap(loadModelSessionMap(userId));
        const savedLabel = loadSavedModelLabel(userId);

        if (modelSwipeItems.length) {
          const preferredIndex = getModelIndexByLabel(savedLabel || selectedModelLabel);
          activeModelIndex = preferredIndex >= 0 ? preferredIndex : normalizeModelIndex(activeModelIndex);
          syncModelSwipeUI();
          const label = modelSwipeItems[activeModelIndex]?.getAttribute("data-model") || selectedModelLabel;
          updateSelectedModel(label);
          saveModelLabel(userId, label);
        } else if (savedLabel) {
          updateSelectedModel(savedLabel);
          saveModelLabel(userId, savedLabel);
        }

        modelStateHydratedForUserId = userId;
      };

      const bindCurrentModelToSession = (sessionId) => {
        const userId = currentUser?.id;
        if (!userId || !sessionId) return;
        const key = getCurrentModelSessionKey();
        if (!key) return;
        modelSessionMap[key] = sessionId;
        saveModelSessionMap(userId, modelSessionMap);
      };

      const ensureModelSessionForSelectedModel = async ({ createIfMissing = true, bindActiveFallback = false } = {}) => {
        const userId = currentUser?.id;
        const modelSessionKey = getCurrentModelSessionKey();
        if (!modelSessionKey) return null;
        let mappedSessionId = modelSessionMap[modelSessionKey];
        if (!mappedSessionId) {
          const legacyKey = getLegacyModelSessionKey();
          if (legacyKey && modelSessionMap[legacyKey]) {
            mappedSessionId = modelSessionMap[legacyKey];
            modelSessionMap[modelSessionKey] = mappedSessionId;
            if (userId) {
              saveModelSessionMap(userId, modelSessionMap);
            }
          }
        }
        const mappedSessionExists =
          typeof mappedSessionId === "string" && sessionState.list.some((session) => session.id === mappedSessionId);
        if (mappedSessionExists) {
          if (sessionState.activeId !== mappedSessionId) {
            await setActiveSession(mappedSessionId);
          }
          return mappedSessionId;
        }

        if (bindActiveFallback && sessionState.activeId) {
          bindCurrentModelToSession(sessionState.activeId);
          return sessionState.activeId;
        }

        if (createIfMissing) {
          const session = createLocalSession();
          bindCurrentModelToSession(session.id);
          return session.id;
        }
        return null;
      };

      const selectModelByIndex = async (index, options = {}) => {
        const { silent = true, switchSession = true } = options;
        if (!modelSwipeItems.length) return;
        const normalizedIndex = normalizeModelIndex(index);
        const targetItem = modelSwipeItems[normalizedIndex];
        if (!targetItem) return;
        const nextLabel = targetItem.getAttribute("data-model") || "";
        if (!nextLabel) return;

        const isSameSelection = nextLabel === selectedModelLabel;
        activeModelIndex = normalizedIndex;
        syncModelSwipeUI();
        updateSelectedModel(nextLabel);
        saveModelLabel(currentUser?.id, nextLabel);

        if (!isSameSelection) {
          await handleModelChange("Model", nextLabel, { silent });
          if (switchSession && workspaceBooted) {
            await ensureModelSessionForSelectedModel({ createIfMissing: true, bindActiveFallback: false });
          }
        }
      };

      const moveModelBy = async (delta) => {
        if (!modelSwipeItems.length) return;
        const nextIndex = normalizeModelIndex(activeModelIndex + delta);
        await selectModelByIndex(nextIndex, { silent: true, switchSession: true });
      };

      if (modelSwipeItems.length) {
        const initialIndex = getModelIndexByLabel(selectedModelLabel);
        activeModelIndex = initialIndex >= 0 ? initialIndex : 0;
        syncModelSwipeUI();
        updateSelectedModel(modelSwipeItems[activeModelIndex].getAttribute("data-model") || selectedModelLabel);

        modelSwipePrev?.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          moveModelBy(-1);
        });

        modelSwipeNext?.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          moveModelBy(1);
        });

        modelSwipeItems.forEach((item, idx) => {
          item.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            selectModelByIndex(idx, { silent: true, switchSession: true });
          });
        });

        if (modelSwipe) {
          modelSwipe.addEventListener("keydown", (event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              moveModelBy(-1);
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              moveModelBy(1);
            }
          });
        }

        if (modelSwipeViewport) {
          modelSwipeViewport.addEventListener(
            "touchstart",
            (event) => {
              touchStartX = event.changedTouches[0]?.clientX || 0;
              touchEndX = touchStartX;
            },
            { passive: true }
          );
          modelSwipeViewport.addEventListener(
            "touchmove",
            (event) => {
              touchEndX = event.changedTouches[0]?.clientX || touchEndX;
            },
            { passive: true }
          );
          modelSwipeViewport.addEventListener(
            "touchend",
            () => {
              const delta = touchEndX - touchStartX;
              if (Math.abs(delta) < 38) return;
              if (delta < 0) {
                moveModelBy(1);
              } else {
                moveModelBy(-1);
              }
            },
            { passive: true }
          );
        }
      }

	      modelSelects.forEach((select) => {
	        const trigger = select.querySelector(".model-select__trigger");
	        const activator = select.querySelector(".model-select__activator");
	        const dropdown = select.querySelector(".model-dropdown");
	        const options = dropdown ? Array.from(dropdown.querySelectorAll(".model-option")) : [];
	        const selectedLabel = trigger ? trigger.querySelector(".selected-label") : null;
	        const categoryKey = select.getAttribute("data-category") || "model";
	        const categoryLabel = select.getAttribute("data-label") || categoryKey;

        if (!trigger || !dropdown || options.length === 0 || !selectedLabel) {
          return;
        }

        const syncButtonLabel = (value) => {
          selectedLabel.textContent = value;
        };

        const setActiveOption = (option) => {
          options.forEach((opt) => opt.setAttribute("aria-selected", opt === option ? "true" : "false"));
          const value = option.getAttribute("data-model") || "";
          selectionState[categoryKey] = value;
          syncButtonLabel(value);
          if (categoryKey === "chat") {
            updateSelectedModel(value);
          }
	        };

	        let activeOption = dropdown.querySelector(".model-option[aria-selected='true']");
	        if (!activeOption) activeOption = options[0] || null;
	        if (activeOption) setActiveOption(activeOption);

	        trigger.addEventListener("click", (event) => {
	          event.stopPropagation();
	          const willOpen = !dropdown.classList.contains("active");
	          closeAllDropdowns(willOpen ? dropdown : null);
	          dropdown.classList.toggle("active");
	          trigger.setAttribute("aria-expanded", dropdown.classList.contains("active") ? "true" : "false");
	        });

	        options.forEach((option) => {
	          option.addEventListener("click", (event) => {
	            event.preventDefault();
	            event.stopPropagation();
	            const value = option.getAttribute("data-model");
	            if (selectionState[categoryKey] === value) {
	              closeAllDropdowns();
	              return;
            }
            setActiveOption(option);
            setActiveCategory(categoryKey);
            closeAllDropdowns();
	            handleModelChange(categoryLabel, value);
	          });
	        });

	        if (activator) {
	          activator.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            console.log("Activator clicked:", categoryKey);
            if (categoryKey === activeCategory) {
              closeAllDropdowns();
              return;
            }
            setActiveCategory(categoryKey);
            closeAllDropdowns();
          });
        }
      });

      setActiveCategory(activeCategory);

      document.addEventListener("click", (event) => {
        const insideControl = event.target.closest(".model-select, .model-swipe, .chat-plus, .chat-mode-select");
        if (!insideControl) {
          closeAllDropdowns();
        }
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          closeThinkingMenu();
        }
      });

      const toggleWebBadge = (state) => {
        if (chatSearchIndicator) {
          chatSearchIndicator.classList.toggle("visible", state);
        }
        if (webSearchState) {
          webSearchState.textContent = state ? "Zoeken op internet ✓" : "Zoeken op internet";
        }
        if (toggleWebSearch) {
          toggleWebSearch.classList.toggle("is-active", state);
        }
        webSearchEnabled = state;
      };

      if (chatPlus && chatPlusMenu) {
        chatPlus.addEventListener("click", (event) => {
          event.stopPropagation();
          const isOpen = chatPlusMenu.style.display === "flex";
          closeAllDropdowns(isOpen ? null : chatPlusMenu);
          chatPlusMenu.style.display = isOpen ? "none" : "flex";
          chatPlus.setAttribute("aria-expanded", !isOpen ? "true" : "false");
          
          // Adjust position to keep menu fully visible
          if (!isOpen) {
            setTimeout(() => {
              const menuRect = chatPlusMenu.getBoundingClientRect();
              const viewportHeight = window.innerHeight;
              const minSpaceFromBottom = 20;
              
              // If menu extends below viewport, move it up
              if (menuRect.bottom > viewportHeight - minSpaceFromBottom) {
                const chatPlusRect = chatPlus.getBoundingClientRect();
                const menuHeight = menuRect.height;
                // Position menu so bottom edge is 20px from viewport bottom
                const newBottom = viewportHeight - chatPlusRect.top - menuHeight - minSpaceFromBottom;
                chatPlusMenu.style.bottom = `${Math.max(newBottom, 10)}px`;
              } else {
                // Reset to default position
                chatPlusMenu.style.bottom = "calc(100% + 10px)";
              }
            }, 0);
          }
        });
      }

      if (toggleWebSearch) {
        toggleWebSearch.addEventListener("click", (event) => {
          event.stopPropagation();
          toggleWebBadge(!webSearchEnabled);
          closeAllDropdowns();
        });
      }

      if (chatSearchClose) {
        chatSearchClose.addEventListener("click", (event) => {
          event.stopPropagation();
          toggleWebBadge(false);
        });
      }

      if (actionUpload) {
        actionUpload.addEventListener("click", (event) => {
          event.stopPropagation();
          hiddenFileInput.accept = "";
          hiddenFileInput.click();
          closeAllDropdowns();
        });
      }

      hiddenFileInput.addEventListener("change", () => {
        if (hiddenFileInput.files && hiddenFileInput.files.length) {
          alert(`Bestand geselecteerd: ${hiddenFileInput.files[0].name}`);
        }
      });

      actionGeneratePhoto?.addEventListener("click", (event) => {
        event.stopPropagation();
        alert("Foto's maken wordt later toegevoegd.");
        closeAllDropdowns();
      });

      actionGenerateVideo?.addEventListener("click", (event) => {
        event.stopPropagation();
        alert("Video's maken wordt later toegevoegd.");
        closeAllDropdowns();
      });

      if (profileAvatar && profileAvatarInput && profileAvatarImage) {
        profileAvatar.addEventListener("click", () => {
          console.log("Profile avatar clicked");
          profileAvatarInput.click();
        });

        profileAvatarInput.addEventListener("change", (event) => {
          const file = event.target.files && event.target.files[0];
          if (!file || !file.type.startsWith("image/")) {
            profileAvatarInput.value = "";
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            profileAvatarImage.src = reader.result;
            profileAvatar.classList.add("has-image");
            profileAvatar.setAttribute("aria-label", "Profielfoto wijzigen");
            profileAvatarInput.value = "";
          };
          reader.readAsDataURL(file);
        });
      }

      if (profileMenuButton && profileModal) {
        const openProfileModal = () => {
          profileModal.classList.add("is-visible");
          profileMenuButton.setAttribute("aria-expanded", "true");
          document.body.style.overflow = "hidden";
        };

        const closeProfileModal = () => {
          profileModal.classList.remove("is-visible");
          profileMenuButton.setAttribute("aria-expanded", "false");
          document.body.style.removeProperty("overflow");
        };

        profileMenuButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          console.log("Profile menu clicked");
          if (profileModal.classList.contains("is-visible")) {
            closeProfileModal();
          } else {
            openProfileModal();
          }
        });

        if (profileModalClose) {
          profileModalClose.addEventListener("click", (event) => {
            event.preventDefault();
            closeProfileModal();
          });
        }

        profileModal.addEventListener("click", (event) => {
          if (event.target === profileModal) {
            closeProfileModal();
          }
        });

        if (profileModalDialog) {
          profileModalDialog.addEventListener("click", (event) => {
            event.stopPropagation();
          });
        }

        document.addEventListener("keydown", (event) => {
          if (event.key === "Escape" && profileModal.classList.contains("is-visible")) {
            closeProfileModal();
          }
        });
      }

      // Edit credentials modal
      const editCredentialsButton = document.getElementById("edit-credentials-button");
      const editCredentialsModal = document.getElementById("edit-credentials-modal");
      if (editCredentialsButton && editCredentialsModal) {
        const editEmailInput = document.getElementById("edit-email-input");
        const editPasswordInput = document.getElementById("edit-password-input");
        const editPasswordConfirmInput = document.getElementById("edit-password-confirm-input");
        const editCredentialsClose = document.querySelector(".edit-credentials-modal__close");
        const editCredentialsCancel = document.querySelector(".edit-credentials-modal__cancel");
        const editCredentialsSave = document.querySelector(".edit-credentials-modal__save");

        const openEditCredentialsModal = () => {
          if (!editCredentialsModal) return;
          if (currentUser?.email && editEmailInput) {
            editEmailInput.value = currentUser.email;
          }
          if (editPasswordInput) editPasswordInput.value = "";
          if (editPasswordConfirmInput) editPasswordConfirmInput.value = "";
          editCredentialsModal.classList.add("is-visible");
          document.body.style.overflow = "hidden";
          setTimeout(() => {
            if (editEmailInput) editEmailInput.focus();
          }, 100);
        };

        const closeEditCredentialsModal = () => {
          if (!editCredentialsModal) return;
          editCredentialsModal.classList.remove("is-visible");
          document.body.style.removeProperty("overflow");
          if (editEmailInput) editEmailInput.value = "";
          if (editPasswordInput) editPasswordInput.value = "";
          if (editPasswordConfirmInput) editPasswordConfirmInput.value = "";
        };

        const saveCredentials = async () => {
          if (!supabaseClient || !currentUser) {
            alert("Je moet ingelogd zijn om je gegevens te wijzigen.");
            return;
          }

          const newEmail = editEmailInput?.value.trim();
          const newPassword = editPasswordInput?.value;
          const confirmPassword = editPasswordConfirmInput?.value;

          // Validate email
          if (!newEmail || !newEmail.includes("@")) {
            alert("Voer een geldig e-mailadres in.");
            if (editEmailInput) editEmailInput.focus();
            return;
          }

          // Validate password if provided
          if (newPassword) {
	            if (newPassword.length < 10) {
	              alert("Wachtwoord moet minimaal 10 tekens lang zijn.");
	              if (editPasswordInput) editPasswordInput.focus();
	              return;
	            }
            if (newPassword !== confirmPassword) {
              alert("Wachtwoorden komen niet overeen.");
              if (editPasswordConfirmInput) editPasswordConfirmInput.focus();
              return;
            }
          }

          if (editCredentialsSave) {
            editCredentialsSave.disabled = true;
            editCredentialsSave.textContent = "Opslaan...";
          }

          try {
            const updateData = {};
            if (newEmail && newEmail !== currentUser.email) {
              updateData.email = newEmail;
            }
            if (newPassword) {
              updateData.password = newPassword;
            }

            if (Object.keys(updateData).length === 0) {
              alert("Geen wijzigingen om op te slaan.");
              if (editCredentialsSave) {
                editCredentialsSave.disabled = false;
                editCredentialsSave.textContent = "Opslaan";
              }
              return;
            }

            const { error } = await supabaseClient.auth.updateUser(updateData);
            if (error) throw error;

            // Refresh user data
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (user) {
              currentUser = user;
              updateProfileSidebar(currentUser);
            }

            alert("Inloggegevens succesvol bijgewerkt!");
            closeEditCredentialsModal();
          } catch (error) {
            console.error("Inloggegevens bijwerken mislukt:", error);
            alert(error.message || "Inloggegevens bijwerken mislukt. Probeer het opnieuw.");
          } finally {
            if (editCredentialsSave) {
              editCredentialsSave.disabled = false;
              editCredentialsSave.textContent = "Opslaan";
            }
          }
        };

        editCredentialsButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          openEditCredentialsModal();
        });

        if (editCredentialsClose) {
          editCredentialsClose.addEventListener("click", closeEditCredentialsModal);
        }

        if (editCredentialsCancel) {
          editCredentialsCancel.addEventListener("click", closeEditCredentialsModal);
        }

        if (editCredentialsSave) {
          editCredentialsSave.addEventListener("click", saveCredentials);
        }

        if (editCredentialsModal) {
          editCredentialsModal.addEventListener("click", (event) => {
            if (event.target === editCredentialsModal) {
              closeEditCredentialsModal();
            }
          });

          document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && editCredentialsModal.classList.contains("is-visible")) {
              closeEditCredentialsModal();
            }
          });
        }
      }

      const chatLog = document.querySelector(".chat-log");
      const chatScrollContainer = document.querySelector(".chat-content-wrapper");
      const chatFooter = document.querySelector(".chat-footer");
      const chatInput = document.querySelector(".chat-input textarea");
      const sendButton = document.querySelector('.chat-input__inner > button[aria-label="Stuur bericht"]');
      const profileNameEl = document.getElementById("profile-name");
      const profileEmailEl = document.getElementById("profile-email");
      const profileInitialsEl = document.querySelector(".profile-avatar__initials");
      const profileNameEditBtn = document.querySelector(".profile-name-edit");
      let avatarSignedFallbackUsed = false;

      // Sticky auto-scroll: keep pinned to bottom until user scrolls up.
      const AUTO_SCROLL_THRESHOLD_PX = 80;
      let autoScrollEnabled = true;
      const isNearBottom = () => {
        if (!chatScrollContainer) return true;
        const distance = chatScrollContainer.scrollHeight - (chatScrollContainer.scrollTop + chatScrollContainer.clientHeight);
        return distance <= AUTO_SCROLL_THRESHOLD_PX;
      };
      const syncAutoScrollFromUserScroll = () => {
        autoScrollEnabled = isNearBottom();
      };
      if (chatScrollContainer) {
        chatScrollContainer.addEventListener("scroll", syncAutoScrollFromUserScroll, { passive: true });
      }
      const scrollToBottomIfPinned = () => {
        if (!chatScrollContainer) return;
        if (!autoScrollEnabled) return;
        requestAnimationFrame(() => {
          chatScrollContainer.scrollTop = chatScrollContainer.scrollHeight;
        });
      };

      const decodeCodeAttr = (value) => {
        try {
          return decodeURIComponent(value || "");
        } catch {
          return value || "";
        }
      };

      const isLikelyHtml = (lang, code) => {
        if (lang === "html" || lang === "htm") return true;
        const sample = String(code || "").toLowerCase();
        return /<!doctype|<html|<head|<body|<div|<section|<style/.test(sample);
      };

      let previewOverlay = null;
      const closePreview = () => {
        if (previewOverlay) {
          previewOverlay.remove();
          previewOverlay = null;
        }
      };
      const openCodePreview = ({ code, lang }) => {
        closePreview();
        const overlay = document.createElement("div");
        overlay.className = "code-preview-overlay";
        overlay.innerHTML = `
          <div class="code-preview">
            <div class="code-preview__header">
              <div class="code-preview__title">Preview${lang ? ` · ${lang.toUpperCase()}` : ""}</div>
              <button type="button" class="code-preview__close" aria-label="Sluiten">✕</button>
            </div>
            <div class="code-preview__body"></div>
          </div>
        `;
        const body = overlay.querySelector(".code-preview__body");
        const closeBtn = overlay.querySelector(".code-preview__close");
        const shouldRender = isLikelyHtml(lang, code);
        if (shouldRender) {
          const frame = document.createElement("iframe");
          frame.className = "code-preview__frame";
          frame.setAttribute("sandbox", "");
          frame.srcdoc = code;
          body.appendChild(frame);
        } else {
          const note = document.createElement("div");
          note.className = "code-preview__note";
          note.textContent = "Preview niet beschikbaar voor deze taal.";
          const pre = document.createElement("pre");
          const codeEl = document.createElement("code");
          codeEl.textContent = code;
          pre.appendChild(codeEl);
          body.appendChild(note);
          body.appendChild(pre);
        }
        overlay.addEventListener("click", (event) => {
          if (event.target === overlay) closePreview();
        });
        if (closeBtn) closeBtn.addEventListener("click", closePreview);
        document.addEventListener(
          "keydown",
          (event) => {
            if (event.key === "Escape") closePreview();
          },
          { once: true }
        );
        document.body.appendChild(overlay);
        previewOverlay = overlay;
      };

      if (chatLog) {
        chatLog.addEventListener("click", (event) => {
          const button = event.target.closest(".code-block__btn");
          if (!button) return;
          const block = button.closest(".code-block");
          if (!block) return;
          const action = button.getAttribute("data-action");
          const code = decodeCodeAttr(block.getAttribute("data-code"));
          const lang = (block.getAttribute("data-lang") || "").trim();
          if (action === "copy") {
            if (!code) return;
            if (navigator.clipboard?.writeText) {
              navigator.clipboard
                .writeText(code)
                .then(() => {
                  if (window.siteUI?.toast) {
                    window.siteUI.toast("Code gekopieerd", { type: "success" });
                  }
                })
                .catch(() => {
                  if (window.siteUI?.toast) {
                    window.siteUI.toast("Kopieren mislukt", { type: "error" });
                  }
                });
              return;
            }
            const temp = document.createElement("textarea");
            temp.value = code;
            temp.setAttribute("readonly", "");
            temp.style.position = "absolute";
            temp.style.left = "-9999px";
            document.body.appendChild(temp);
            temp.select();
            document.execCommand("copy");
            temp.remove();
            if (window.siteUI?.toast) {
              window.siteUI.toast("Code gekopieerd", { type: "success" });
            }
            return;
          }
          if (action === "preview") {
            openCodePreview({ code, lang });
          }
        });
      }

	      const SUPABASE_URL = "https://mengrlsqgshxqcxhirjn.supabase.co";
	      const SUPABASE_ANON_KEY = "sb_publishable_PeVTrMXz6UaeMhkPn5Fs-Q_xfJFVRNt";

      const syncChatFooterGap = () => {
        if (!chatScrollContainer || !chatFooter) return;
        const footerHeight = chatFooter.getBoundingClientRect().height || 0;
        const extraGap = 56;
        const paddingBottom = Math.max(footerHeight + extraGap, extraGap);
        chatScrollContainer.style.paddingBottom = `${paddingBottom}px`;
        chatScrollContainer.style.scrollPaddingBottom = `${paddingBottom}px`;
      };
      if (chatScrollContainer && chatFooter) {
        syncChatFooterGap();
        if (window.ResizeObserver) {
          const footerObserver = new ResizeObserver(syncChatFooterGap);
          footerObserver.observe(chatFooter);
        }
        window.addEventListener("resize", syncChatFooterGap);
      }

      const isPaidUser = (user) => {
        const appMeta = user?.app_metadata || {};
        const plan = String(appMeta.plan || "").toLowerCase();
        if (appMeta.lifetime_free === true || plan === "standard" || plan === "lifetime" || plan === "trial") return true;
        const freeMonths = Number(appMeta.free_months || 0);
        if (Number.isFinite(freeMonths) && freeMonths > 0) return true;
        const totalPaid = Number(appMeta.total_paid_eur || 0);
        if (Number.isFinite(totalPaid) && totalPaid > 0) return true;
        const lastPaid = Number(appMeta.last_payment_amount_eur || 0);
        if (Number.isFinite(lastPaid) && lastPaid > 0) return true;
        if (typeof appMeta.last_payment_at === "string" && appMeta.last_payment_at.trim()) return true;
        return false;
      };

      const getSupabaseClient = () => {
        if (window.mathijsSupabase) {
          console.log("Hergebruik bestaande Supabase client");
          return window.mathijsSupabase;
        }
        if (!window.supabase || typeof window.supabase.createClient !== "function") {
          console.warn("Supabase library nog niet geladen");
          return null;
        }
        try {
          console.log("Aanmaken nieuwe Supabase client");
          const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
          });
          window.mathijsSupabase = client;
          console.log("Supabase client aangemaakt");
          return client;
        } catch (error) {
          console.error("Fout bij aanmaken Supabase client:", error);
          return null;
        }
      };

      // Wait for Supabase library to load
      const waitForSupabase = async (maxWait = 10000) => {
        const start = Date.now();
        while (Date.now() - start < maxWait) {
          if (window.supabase && typeof window.supabase.createClient === "function") {
            const client = getSupabaseClient();
            if (client) {
              console.log("Supabase client succesvol geïnitialiseerd");
              return client;
            }
          }
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        console.error("Supabase library laadt niet binnen", maxWait, "ms");
        console.error("window.supabase:", window.supabase);
        console.error("window.supabase?.createClient:", typeof window.supabase?.createClient);
        return null;
      };

      let supabaseClient = getSupabaseClient();
      let currentUser = null;
      let profileEnhancementsInitialized = false;

      const safeUpsertProfile = async (fields = {}) => {
        if (!supabaseClient || !currentUser?.id) return;
        try {
          await supabaseClient
            .from("profiles")
            .upsert({ id: currentUser.id, ...fields, updated_at: new Date().toISOString() }, { onConflict: "id" });
        } catch (error) {
          // profiles schema differs per environment; ignore to avoid breaking chat
          console.warn("Profile upsert skipped:", error?.message || error);
        }
      };

      const initProfileEnhancements = () => {
        if (profileEnhancementsInitialized) return;
        if (!supabaseClient || !currentUser) return;
        profileEnhancementsInitialized = true;

        // Name edit (stored in Supabase Auth user_metadata.username)
        if (profileNameEditBtn && profileNameEl) {
          const editNameModal = document.getElementById("edit-name-modal");
          const editNameInput = document.getElementById("edit-name-input");
          const editNameClose = document.querySelector(".edit-name-modal__close");
          const editNameCancel = document.querySelector(".edit-name-modal__cancel");
          const editNameSave = document.querySelector(".edit-name-modal__save");

          const openEditNameModal = () => {
            if (!editNameModal || !editNameInput) return;
            const existingName = (currentUser?.user_metadata?.username || profileNameEl.textContent || "").trim();
            editNameInput.value = existingName;
            editNameModal.classList.add("is-visible");
            document.body.style.overflow = "hidden";
            setTimeout(() => editNameInput.focus(), 100);
          };

          const closeEditNameModal = () => {
            if (!editNameModal) return;
            editNameModal.classList.remove("is-visible");
            document.body.style.removeProperty("overflow");
            editNameInput.value = "";
          };

          const saveName = async () => {
            if (!editNameInput || !editNameModal) return;
            const trimmed = editNameInput.value.trim();
            const existingName = (currentUser?.user_metadata?.username || profileNameEl.textContent || "").trim();
            
            if (!trimmed || trimmed === existingName) {
              closeEditNameModal();
              return;
            }

            editNameSave.disabled = true;
            editNameSave.textContent = "Opslaan...";

            try {
              const { error } = await supabaseClient.auth.updateUser({ data: { username: trimmed } });
              if (error) throw error;

              // refresh local user
              const refreshed = await supabaseClient.auth.getUser();
              if (refreshed?.data?.user) {
                currentUser = refreshed.data.user;
              } else {
                currentUser.user_metadata = { ...(currentUser.user_metadata || {}), username: trimmed };
              }
              await safeUpsertProfile({ username: trimmed });
              updateProfileSidebar(currentUser);
              closeEditNameModal();
            } catch (error) {
              console.error("Naam bijwerken mislukt:", error);
              alert("Naam aanpassen mislukt. Probeer het opnieuw.");
            } finally {
              editNameSave.disabled = false;
              editNameSave.textContent = "Opslaan";
            }
          };

          profileNameEditBtn.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            openEditNameModal();
          });

          if (editNameClose) {
            editNameClose.addEventListener("click", closeEditNameModal);
          }

          if (editNameCancel) {
            editNameCancel.addEventListener("click", closeEditNameModal);
          }

          if (editNameSave) {
            editNameSave.addEventListener("click", saveName);
          }

          if (editNameModal) {
            editNameModal.addEventListener("click", (event) => {
              if (event.target === editNameModal) {
                closeEditNameModal();
              }
            });

            if (editNameInput) {
              editNameInput.addEventListener("keydown", (event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  saveName();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  closeEditNameModal();
                }
              });
            }
          }

          document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && editNameModal?.classList.contains("is-visible")) {
              closeEditNameModal();
            }
          });
        }

        // Avatar upload (stored in Supabase Storage + user_metadata.avatar_url)
        if (profileAvatar && profileAvatarInput) {
          profileAvatar.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            profileAvatarInput.click();
          });

          profileAvatarInput.addEventListener("change", async () => {
            const file = profileAvatarInput.files?.[0];
            if (!file) return;

            const resetInput = () => {
              try {
                profileAvatarInput.value = "";
              } catch (_) {}
            };

            try {
              if (!file.type.startsWith("image/")) {
                alert("Kies een afbeelding (jpg/png/webp).");
                resetInput();
                return;
              }
              if (file.size > 5 * 1024 * 1024) {
                alert("Afbeelding te groot (max 5MB).");
                resetInput();
                return;
              }

              const readFileAsDataUrl = (sourceFile) =>
                new Promise((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(reader.result);
                  reader.onerror = () => reject(reader.error || new Error("Bestand lezen mislukt."));
                  reader.readAsDataURL(sourceFile);
                });

              let apiPayload = null;
              try {
                if (!supabaseClient) throw new Error("Supabase client ontbreekt.");
                const { data: sessionData } = await supabaseClient.auth.getSession();
                const accessToken = sessionData?.session?.access_token;
                if (!accessToken) throw new Error("Geen geldige sessie.");
                const dataUrl = await readFileAsDataUrl(file);
                const resp = await fetch("/api/avatar-upload", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                  },
                  body: JSON.stringify({
                    fileName: file.name,
                    contentType: file.type,
                    dataUrl,
                  }),
                });
                const payload = await resp.json().catch(() => ({}));
                if (!resp.ok) {
                  const apiError = new Error(payload?.error || payload?.message || "Avatar upload mislukt.");
                  apiError.detail = payload;
                  throw apiError;
                }
                apiPayload = payload;
              } catch (error) {
                console.warn("Server avatar upload faalde:", error?.message || error);
              }

              if (apiPayload?.avatar_url) {
                const refreshed = await supabaseClient.auth.getUser();
                if (refreshed?.data?.user) {
                  currentUser = refreshed.data.user;
                } else {
                  currentUser.user_metadata = {
                    ...(currentUser.user_metadata || {}),
                    avatar_url: apiPayload.avatar_url,
                    avatar_bucket: apiPayload.avatar_bucket,
                    avatar_path: apiPayload.avatar_path,
                  };
                }
                updateProfileSidebar(currentUser);
                resetInput();
                return;
              }

              const fileExt = (file.name.split(".").pop() || "jpg").toLowerCase();
              const safeExt = fileExt.replace(/[^a-z0-9]/g, "") || "jpg";
              const timestamp = Date.now();
              const fileName = `${timestamp}.${safeExt}`;
              const candidatePaths = [`${currentUser.id}/${fileName}`, `avatars/${currentUser.id}-${fileName}`];
              const candidateBuckets = ["profile-images", "avatars"];

              const uploadToBucket = async (bucketName, path) => {
                const { error: uploadError } = await supabaseClient.storage.from(bucketName).upload(path, file, {
                  cacheControl: "3600",
                  upsert: true,
                });
                if (uploadError) throw uploadError;
                const { data } = supabaseClient.storage.from(bucketName).getPublicUrl(path);
                if (!data?.publicUrl) throw new Error("Geen public URL ontvangen.");
                return { publicUrl: data.publicUrl, bucketName, path };
              };

              let publicUrl = null;
              let bucketUsed = null;
              let pathUsed = null;
              let lastUploadError = null;
              try {
                for (const bucketName of candidateBuckets) {
                  for (const path of candidatePaths) {
                    try {
                      const result = await uploadToBucket(bucketName, path);
                      publicUrl = result.publicUrl;
                      bucketUsed = result.bucketName;
                      pathUsed = result.path;
                      break;
                    } catch (uploadError) {
                      lastUploadError = uploadError;
                    }
                  }
                  if (publicUrl) break;
                }
                if (!publicUrl) throw lastUploadError || new Error("Upload mislukt.");
              } catch (error) {
                console.warn("Upload avatar faalde:", error?.message || error);
                throw error;
              }

              const { error: updateError } = await supabaseClient.auth.updateUser({
                data: { avatar_url: publicUrl, avatar_bucket: bucketUsed, avatar_path: pathUsed },
              });
              if (updateError) throw updateError;

              const refreshed = await supabaseClient.auth.getUser();
              if (refreshed?.data?.user) {
                currentUser = refreshed.data.user;
              } else {
                currentUser.user_metadata = {
                  ...(currentUser.user_metadata || {}),
                  avatar_url: publicUrl,
                  avatar_bucket: bucketUsed,
                  avatar_path: pathUsed,
                };
              }
              await safeUpsertProfile({ avatar_url: publicUrl, avatar_bucket: bucketUsed, avatar_path: pathUsed });
              updateProfileSidebar(currentUser);
              resetInput();
            } catch (error) {
              console.error("Profielfoto upload mislukt:", error);
              const message =
                error?.message ||
                "Profielfoto uploaden mislukt. Check of er een Supabase Storage bucket bestaat (bijv. 'profile-images' of 'avatars') en dat je sessie rechten heeft.";
              alert(message);
              resetInput();
            }
          });
        }
      };
      const sessionListEl = document.getElementById("session-list");
      const sessionEmptyEl = document.getElementById("session-empty");
      const sessionState = {
        list: [],
        activeId: null,
        untitledCount: 0,
        loading: true,
      };
      const LEGACY_SESSION_ID = "__legacy_session__";
      const SESSION_LOADING_MESSAGE = "Chats laden...";
      const SESSION_EMPTY_MESSAGE = "Nog geen gesprekken. Start je eerste chat.";

      const generateSessionId = () => {
        if (window.crypto && crypto.randomUUID) {
          return crypto.randomUUID();
        }
        return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      };

      const getActiveSessionEntry = () => {
        if (!sessionState.activeId) return null;
        return sessionState.list.find((session) => session.id === sessionState.activeId) || null;
      };

	      const generateDefaultSessionTitle = () => {
	        sessionState.untitledCount += 1;
	        return "Chat";
	      };

      const generateSessionTitleFromPrompt = (text) => {
        if (!text) return "";
        const sanitized = text.trim().replace(/\s+/g, " ");
        if (!sanitized) return "";
        const normalized = sanitized.toLowerCase().replace(/[^a-z0-9\s]/gi, "");
        const words = normalized.split(" ").filter(Boolean);
        if (!words.length) return "";
        const questionWords = ["wat", "hoe", "waarom", "wanneer", "welke", "wie", "waar", "kan", "mag", "is"];
        const prefix = sanitized.includes("?") || questionWords.includes(words[0]) ? "vraag" : "";
        const snippet = words.slice(0, 5).join(" ");
        return prefix ? `${prefix} ${snippet}`.trim() : snippet;
      };

      const upsertSessionEntry = (session) => {
        const existingIndex = sessionState.list.findIndex((item) => item.id === session.id);
        if (existingIndex >= 0) {
          sessionState.list[existingIndex] = { ...sessionState.list[existingIndex], ...session };
        } else {
          sessionState.list.unshift(session);
        }
      };

      const removeSessionEmptyActions = () => {
        const actionsEl = document.getElementById("session-empty-actions");
        if (actionsEl) actionsEl.remove();
      };

      const renderSessionList = () => {
        if (!sessionListEl) return;
        sessionListEl.innerHTML = "";
        if (!sessionState.list.length) {
          if (sessionEmptyEl) {
            sessionEmptyEl.textContent = sessionState.loading ? SESSION_LOADING_MESSAGE : SESSION_EMPTY_MESSAGE;
            sessionEmptyEl.style.removeProperty("display");
          }
          removeSessionEmptyActions();
          return;
        }
        if (sessionEmptyEl) {
          sessionEmptyEl.style.display = "none";
        }
        // Verwijder de actieknoppen als er sessies zijn
        removeSessionEmptyActions();
        sessionState.list.forEach((session) => {
          const row = document.createElement("div");
          row.className = `session-row${session.id === sessionState.activeId ? " is-active" : ""}`;
          row.setAttribute("data-session-id", session.id);

          const selectBtn = document.createElement("button");
          selectBtn.type = "button";
          selectBtn.className = "session-select";
          selectBtn.textContent = getDisplayTitle(session);

          const menuButton = document.createElement("button");
          menuButton.type = "button";
          menuButton.className = "session-menu";
          menuButton.setAttribute("aria-label", "Sessiemenu");
          menuButton.innerHTML = `<span class="session-menu__icon">⋯</span>`;

          const actions = document.createElement("div");
          actions.className = "session-actions";
          actions.innerHTML = `
            <button type="button" class="rename-session">Naam wijzigen</button>
            <button type="button" class="share-session">Delen</button>
            <button type="button" class="delete-session danger">Verwijderen</button>
          `;

          const closeAllMenus = () => {
            document.querySelectorAll(".session-actions.is-open").forEach((el) => el.classList.remove("is-open"));
          };

          menuButton.addEventListener("click", (event) => {
            event.stopPropagation();
            const isOpen = actions.classList.contains("is-open");
            closeAllMenus();
            if (!isOpen) actions.classList.add("is-open");
          });

          selectBtn.addEventListener("click", async (event) => {
            event.stopPropagation();
            await setActiveSession(session.id);
            closeAllMenus();
            if (chatInput) {
              chatInput.focus();
            }
          });

          actions.querySelector(".rename-session").addEventListener("click", async (event) => {
            event.stopPropagation();
            actions.classList.remove("is-open");
            const defaultTitle = getDisplayTitle(session);
            if (!window.siteUI?.prompt) return;
            const newTitle = await window.siteUI.prompt("Nieuwe naam voor dit gesprek:", { defaultValue: defaultTitle });
            if (newTitle && newTitle.trim()) {
              const trimmed = newTitle.trim();
              titleOverrides[session.id] = trimmed;
              saveTitleOverride(currentUser?.id || "anon", session.id, trimmed);
              session.title = trimmed;
              renderSessionList();
            }
          });

          actions.querySelector(".delete-session").addEventListener("click", async (event) => {
            event.stopPropagation();
            actions.classList.remove("is-open");
            if (!window.siteUI?.confirm) return;
            const confirmDelete = await window.siteUI.confirm("Weet je zeker dat je dit gesprek wilt verwijderen?", { danger: true });
            if (!confirmDelete) return;
            await deleteSession(session.id, session.isLegacy);
          });

          actions.querySelector(".share-session").addEventListener("click", async (event) => {
            event.stopPropagation();
            actions.classList.remove("is-open");
            const shareText = `${window.location.origin}/chat?session=${session.id}`;
            try {
              await navigator.clipboard.writeText(shareText);
              if (window.siteUI?.toast) {
                window.siteUI.toast("Link gekopieerd naar klembord.", { type: "success" });
              } else {
                alert("Link gekopieerd naar klembord.");
              }
            } catch (e) {
              if (window.siteUI?.alert) {
                window.siteUI.alert(`Kon link niet kopiëren. Kopieer handmatig:\n${shareText}`);
              } else {
                alert("Kon link niet kopiëren. Kopieer handmatig:\n" + shareText);
              }
            }
          });

          actions.addEventListener("click", (event) => {
            event.stopPropagation();
          });

          row.addEventListener("click", async (event) => {
            if (event.target.closest(".session-menu") || event.target.closest(".session-actions")) {
              return;
            }
            await setActiveSession(session.id);
            closeAllMenus();
            if (chatInput) {
              chatInput.focus();
            }
          });

          document.addEventListener("click", closeAllMenus);

          row.appendChild(selectBtn);
          row.appendChild(menuButton);
          row.appendChild(actions);
          sessionListEl.appendChild(row);
        });
      };

      const bumpSessionToTop = (sessionId) => {
        const index = sessionState.list.findIndex((session) => session.id === sessionId);
        if (index > 0) {
          const [session] = sessionState.list.splice(index, 1);
          sessionState.list.unshift(session);
        }
      };

      const updateSessionMetaAfterMessage = (role, content) => {
        const session = getActiveSessionEntry();
        if (!session) {
          return;
        }
        session.updatedAt = new Date().toISOString();
        if (role === "user" && !session.firstUserMessage) {
          const generated = generateSessionTitleFromPrompt(content);
          if (generated) {
            session.title = generated;
            session.firstUserMessage = content;
          }
        }
        bumpSessionToTop(session.id);
        renderSessionList();
      };

	      const renderEmptySessionMessage = (message = SESSION_EMPTY_MESSAGE) => {
	        if (!sessionEmptyEl) return;
	        sessionEmptyEl.textContent = message;
	        sessionEmptyEl.style.removeProperty("display");
	        if (sessionListEl) {
	          sessionListEl.innerHTML = "";
	        }
	      };

      const setSessionsLoading = (loading) => {
        sessionState.loading = loading;
        if (loading) {
          renderEmptySessionMessage(SESSION_LOADING_MESSAGE);
          removeSessionEmptyActions();
        }
      };

      const SESSION_TITLE_KEY = "mathijs_session_titles_v1";
      const LAST_ACTIVE_SESSION_KEY = "mathijs_last_active_session_v1";
      const loadTitleOverrides = (userId) => {
        try {
          const raw = localStorage.getItem(SESSION_TITLE_KEY);
          if (!raw) return {};
          const parsed = JSON.parse(raw);
          return parsed[userId] || {};
        } catch (e) {
          console.warn("Kon sessietitels niet laden", e);
          return {};
        }
      };

      const saveTitleOverride = (userId, sessionId, title) => {
        try {
          const raw = localStorage.getItem(SESSION_TITLE_KEY);
          const parsed = raw ? JSON.parse(raw) : {};
          parsed[userId] = parsed[userId] || {};
          parsed[userId][sessionId] = title;
          localStorage.setItem(SESSION_TITLE_KEY, JSON.stringify(parsed));
        } catch (e) {
          console.warn("Kon sessietitel niet opslaan", e);
        }
      };

      const deleteTitleOverride = (userId, sessionId) => {
        try {
          const raw = localStorage.getItem(SESSION_TITLE_KEY);
          if (!raw) return;
          const parsed = JSON.parse(raw);
          if (parsed[userId]) {
            delete parsed[userId][sessionId];
            localStorage.setItem(SESSION_TITLE_KEY, JSON.stringify(parsed));
          }
        } catch (e) {
          console.warn("Kon sessietitel niet verwijderen", e);
        }
      };

      const loadLastActiveSessionId = (userId) => {
        if (!userId) return null;
        try {
          const raw = localStorage.getItem(LAST_ACTIVE_SESSION_KEY);
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          const value = parsed[userId];
          return typeof value === "string" && value.trim() ? value : null;
        } catch (e) {
          console.warn("Kon laatste sessie niet laden", e);
          return null;
        }
      };

      const saveLastActiveSessionId = (userId, sessionId) => {
        if (!userId || !sessionId) return;
        try {
          const raw = localStorage.getItem(LAST_ACTIVE_SESSION_KEY);
          const parsed = raw ? JSON.parse(raw) : {};
          parsed[userId] = sessionId;
          localStorage.setItem(LAST_ACTIVE_SESSION_KEY, JSON.stringify(parsed));
        } catch (e) {
          console.warn("Kon laatste sessie niet opslaan", e);
        }
      };

      const clearLastActiveSessionId = (userId, sessionId) => {
        if (!userId) return;
        try {
          const raw = localStorage.getItem(LAST_ACTIVE_SESSION_KEY);
          if (!raw) return;
          const parsed = JSON.parse(raw);
          if (!parsed[userId]) return;
          if (!sessionId || parsed[userId] === sessionId) {
            delete parsed[userId];
            localStorage.setItem(LAST_ACTIVE_SESSION_KEY, JSON.stringify(parsed));
          }
        } catch (e) {
          console.warn("Kon laatste sessie niet verwijderen", e);
        }
      };

      const getPreferredSessionId = (userId) => {
        try {
          const params = new URLSearchParams(window.location.search);
          const fromUrl = (params.get("session") || params.get("session_id") || "").trim();
          if (fromUrl) return fromUrl;
        } catch (e) {
          // ignore URL parsing issues
        }
        return loadLastActiveSessionId(userId);
      };

	      let titleOverrides = {};

	      function countConversationMessages() {
	        if (!Array.isArray(messages)) return 0;
	        return messages.filter((m) => m && (m.role === "user" || m.role === "assistant") && String(m.content || "").trim()).length;
	      }

	      function isActiveSessionEmpty() {
	        return countConversationMessages() === 0;
	      }

	      function updateNewChatButtonState() {
	        if (!newChatButton) return;
	        const disabled = isActiveSessionEmpty();
	        newChatButton.disabled = disabled;
	        newChatButton.setAttribute("aria-disabled", disabled ? "true" : "false");
	        newChatButton.title = disabled
	          ? "Je zit al in een leeg gesprek. Stuur eerst een bericht of kies een bestaande chat."
	          : "Start nieuw gesprek";
	      }

      const getDisplayTitle = (session) => {
        if (!session) return "";
        if (titleOverrides[session.id]) return titleOverrides[session.id];
        const rawTitle = session.title || "Chat";
        const cleaned = rawTitle.replace(/^chat\s+/i, "").trim();
        return cleaned || rawTitle;
      };

      const createLocalSession = () => {
        const session = {
          id: generateSessionId(),
          title: selectedModelLabel || generateDefaultSessionTitle(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          firstUserMessage: "",
          isLegacy: false,
        };
        upsertSessionEntry(session);
        sessionState.activeId = session.id;
        bindCurrentModelToSession(session.id);
        saveLastActiveSessionId(currentUser?.id, session.id);
        renderSessionList();
	        if (chatInput) {
	          chatInput.value = "";
	        }
	        renderEmptyState();
	        messages = [createSystemMessage()];
	        updateNewChatButtonState();
	        return session;
	      };

      const ensureActiveSessionId = () => {
        if (sessionState.activeId) {
          return sessionState.activeId;
        }
        const session = createLocalSession();
        return session.id;
      };

      const getStoredAuthSession = () => {
        try {
          const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
          const key = `sb-${ref}-auth-token`;
          const raw = localStorage.getItem(key);
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          if (!parsed) return null;
          if (parsed.access_token) return parsed;
          if (parsed.currentSession?.access_token) return parsed.currentSession;
          return null;
        } catch (error) {
          console.warn("getStoredAuthSession: kon sessie niet lezen", error);
          return null;
        }
      };

		      const requireAccessToken = async () => {
		        // Ensure Supabase client is loaded
		        if (!supabaseClient) {
		          supabaseClient = await waitForSupabase();
		        }
		        if (!supabaseClient) {
		          console.error("requireAccessToken: Supabase client ontbreekt");
		          return null;
		        }
		        try {
		          const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
		          if (sessionError) {
		            console.error("requireAccessToken: getSession error", sessionError);
		            const storedSession = getStoredAuthSession();
		            if (storedSession?.access_token) {
		              console.warn("requireAccessToken: fallback op lokale sessie");
		              return storedSession.access_token;
		            }
		            return null;
		          }
		          const accessToken = sessionData?.session?.access_token;
		          if (!accessToken) {
		            console.warn("requireAccessToken: geen access token in sessie, sessie expired?");
		            // Probeer te refreshen
		            const { data: refreshData, error: refreshError } = await supabaseClient.auth.refreshSession();
		            if (refreshError || !refreshData?.session?.access_token) {
		              console.error("requireAccessToken: refresh mislukt", refreshError);
		              const storedSession = getStoredAuthSession();
		              if (storedSession?.access_token) {
		                console.warn("requireAccessToken: fallback op lokale sessie");
		                return storedSession.access_token;
		              }
		              return null;
		            }
		            console.log("requireAccessToken: sessie succesvol gerefreshed");
		            return refreshData.session.access_token;
		          }
		          return accessToken;
		        } catch (error) {
		          console.error("requireAccessToken: fout bij ophalen", error);
		          return null;
		        }
	      };

	      const apiFetchJson = async (url, { method = "GET", body } = {}) => {
	        const buildOptions = (token) => ({
	          method,
	          headers: {
	            "Content-Type": "application/json",
	            Authorization: `Bearer ${token}`,
	          },
	          body: body ? JSON.stringify(body) : undefined,
	        });
	        let accessToken = await requireAccessToken();
	        if (!accessToken) {
	          console.warn("apiFetchJson: geen access token beschikbaar voor", url);
	          return { ok: false, status: 401, payload: { error: "Unauthorized - geen access token" } };
	        }
	        try {
	          let resp = await fetch(url, buildOptions(accessToken));
	          if (resp.status === 401) {
	            const { error: refreshError } = await supabaseClient?.auth?.refreshSession();
	            if (refreshError) {
	              console.warn("apiFetchJson: refreshSession faalde", refreshError);
	            } else {
	              accessToken = await requireAccessToken();
	              if (accessToken) {
	                resp = await fetch(url, buildOptions(accessToken));
	              }
	            }
	          }
	          const payload = await resp.json().catch(() => ({}));
	          if (!resp.ok) {
	            console.warn("apiFetchJson: API error", url, resp.status, payload?.error);
	          }
	          return { ok: resp.ok, status: resp.status, payload };
	        } catch (error) {
	          console.error("apiFetchJson: fetch error", url, error);
	          return { ok: false, status: 0, payload: { error: error?.message || "Network error" } };
	        }
	      };

      const normalizeIso = (value) => {
        if (!value) return null;
        const text = String(value).trim();
        if (!text) return null;
        const date = new Date(text);
        if (Number.isNaN(date.getTime())) return null;
        return date.toISOString();
      };

      const buildSessionsFromRows = (rows) => {
        if (!Array.isArray(rows) || !rows.length) return [];
        const sessionMap = new Map();
        rows.forEach((entry) => {
          if (!entry) return;
          const sessionId = entry.session_id || LEGACY_SESSION_ID;
          const createdAt = entry.created_at || null;
          const existing = sessionMap.get(sessionId);
          if (!existing) {
            sessionMap.set(sessionId, {
              id: sessionId,
              createdAt,
              updatedAt: createdAt,
              firstUserMessage: entry.role === "user" ? entry.message_text : "",
              isLegacy: !entry.session_id,
            });
            return;
          }
          if (createdAt) {
            if (!existing.updatedAt || new Date(createdAt) > new Date(existing.updatedAt)) {
              existing.updatedAt = createdAt;
            }
            if (!existing.createdAt || new Date(createdAt) < new Date(existing.createdAt)) {
              existing.createdAt = createdAt;
            }
          }
          if (!existing.firstUserMessage && entry.role === "user") {
            existing.firstUserMessage = entry.message_text || "";
          }
        });
        return Array.from(sessionMap.values()).sort(
          (a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
        );
      };

      const fetchSessionsDirect = async (userId) => {
        if (!supabaseClient || !userId) {
          console.warn("fetchSessionsDirect: geen supabaseClient of userId", { hasClient: !!supabaseClient, userId });
          return { ok: false, sessions: [], reason: "no_client_or_user" };
        }
        try {
          console.log("fetchSessionsDirect: ophalen voor user", userId);
          const { data, error } = await supabaseClient
            .from("messages")
            .select("session_id,role,message_text,created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(5000);
          if (error) {
            console.warn("Directe sessielading mislukt", error);
            return { ok: false, sessions: [], reason: error?.message || "query_error" };
          }
          console.log("fetchSessionsDirect: gevonden", data?.length || 0, "berichten");
          return { ok: true, sessions: buildSessionsFromRows(data) };
        } catch (error) {
          console.warn("Directe sessielading faalde", error);
          return { ok: false, sessions: [], reason: error?.message || "exception" };
        }
      };

      const fetchMessagesDirect = async (userId, sessionId) => {
        if (!supabaseClient || !userId || !sessionId) return { ok: false, messages: [] };
        try {
          let query = supabaseClient
            .from("messages")
            .select("role,message_text,created_at,session_id")
            .eq("user_id", userId)
            .order("created_at", { ascending: true })
            .limit(5000);
          if (sessionId === LEGACY_SESSION_ID) {
            query = query.is("session_id", null);
          } else {
            query = query.eq("session_id", sessionId);
          }
          const { data, error } = await query;
          if (error) {
            console.warn("Directe berichtenlading mislukt", error);
            return { ok: false, messages: [] };
          }
          return { ok: true, messages: Array.isArray(data) ? data : [] };
        } catch (error) {
          console.warn("Directe berichtenlading faalde", error);
          return { ok: false, messages: [] };
        }
      };

      const insertMessageDirect = async (userId, sessionId, role, content, provider = null) => {
        if (!supabaseClient || !userId) return { ok: false };
        const payload = {
          user_id: userId,
          session_id: sessionId === LEGACY_SESSION_ID ? null : sessionId,
          role,
          message_text: content,
        };
        if (provider === "gemini" || provider === "openai" || provider === "grok" || provider === "anthropic") {
          payload.provider = provider;
        }
        try {
          const { error } = await supabaseClient.from("messages").insert(payload);
          if (error) {
            // If error is about unknown column (provider), try without provider
            const isColumnError = 
              (error.message && error.message.includes("provider")) ||
              (error.code === "42703") || // PostgreSQL undefined_column
              (error.hint && error.hint.includes("provider"));
            
            if (isColumnError && payload.provider) {
              // Retry without provider column
              delete payload.provider;
              const { error: retryError } = await supabaseClient.from("messages").insert(payload);
              if (retryError) {
                console.warn("Direct bericht opslaan mislukt (zonder provider)", retryError);
                return { ok: false };
              }
              return { ok: true };
            }
            console.warn("Direct bericht opslaan mislukt", error);
            return { ok: false };
          }
          return { ok: true };
        } catch (error) {
          console.warn("Direct bericht opslaan faalde", error);
          return { ok: false };
        }
      };

      const importLegacySessionsDirect = async (userId, sessions) => {
        if (!supabaseClient || !userId) return false;
        if (!Array.isArray(sessions) || !sessions.length) return false;
        const rows = [];
        sessions.forEach((session) => {
          if (rows.length >= 5000) return;
          const sessionId = typeof session?.id === "string" && session.id.trim() ? session.id.trim() : null;
          const msgs = Array.isArray(session?.messages) ? session.messages : [];
          msgs.forEach((msg) => {
            if (rows.length >= 5000) return;
            const role = msg?.role === "user" ? "user" : "assistant";
            const text =
              typeof msg?.content === "string"
                ? msg.content
                : typeof msg?.message_text === "string"
                ? msg.message_text
                : "";
            const trimmed = text.trim();
            if (!trimmed) return;
            const createdAt = normalizeIso(msg?.created_at || msg?.createdAt);
            const row = {
              user_id: userId,
              session_id: sessionId,
              role,
              message_text: trimmed,
            };
            if (createdAt) row.created_at = createdAt;
            rows.push(row);
          });
        });
        if (!rows.length) return false;
        const chunkSize = 500;
        for (let i = 0; i < rows.length; i += chunkSize) {
          const slice = rows.slice(i, i + chunkSize);
          const { error } = await supabaseClient.from("messages").insert(slice);
          if (!error) continue;
          const withoutCreatedAt = slice.map(({ created_at, ...rest }) => rest);
          const fallback = await supabaseClient.from("messages").insert(withoutCreatedAt);
          if (fallback.error) {
            console.warn("Directe legacy import mislukt", fallback.error);
            return false;
          }
        }
        return true;
      };

      const PROVIDER_STATUS_TTL_MS = 120000;
      let providerStatusCache = { openai: null, gemini: null, grok: null, claude: null, fetchedAt: 0 };
      let providerStatusInFlight = null;
      const refreshProviderStatus = async ({ force = false } = {}) => {
        const now = Date.now();
        const hasCache =
          providerStatusCache.openai !== null ||
          providerStatusCache.gemini !== null ||
          providerStatusCache.grok !== null ||
          providerStatusCache.claude !== null;
        const isFresh = hasCache && now - providerStatusCache.fetchedAt < PROVIDER_STATUS_TTL_MS;
        if (!force && isFresh) {
          return providerStatusCache;
        }
        if (providerStatusInFlight) {
          return hasCache && !force ? providerStatusCache : providerStatusInFlight;
        }
        providerStatusInFlight = (async () => {
          try {
            const { ok, payload } = await apiFetchJson("/api/provider-status");
            if (ok) {
              providerStatusCache = {
                openai: payload?.openai === true,
                gemini: payload?.gemini === true,
                grok: payload?.grok === true,
                claude: payload?.claude === true,
                fetchedAt: Date.now(),
              };
            }
          } catch {
            // keep existing cache
          } finally {
            providerStatusInFlight = null;
          }
          return providerStatusCache;
        })();
        return hasCache && !force ? providerStatusCache : providerStatusInFlight;
      };

		      const creditsBalanceEl = document.getElementById("credits-balance");
		      const creditsBalanceValueEl = document.getElementById("credits-balance-value");

      const CREDITS_BALANCE_TTL_MS = 30000;
      let creditsBalanceCache = { value: null, fetchedAt: 0 };
      let creditsBalanceInFlight = null;
      const refreshCreditsBalance = async ({ force = false } = {}) => {
        if (!creditsBalanceEl || !creditsBalanceValueEl) return;
        const now = Date.now();
        const hasCache = Number.isFinite(creditsBalanceCache.value);
        const isFresh = hasCache && now - creditsBalanceCache.fetchedAt < CREDITS_BALANCE_TTL_MS;
        if (!force && isFresh) {
          creditsBalanceValueEl.textContent = String(creditsBalanceCache.value);
          creditsBalanceEl.title = "Je tokensaldo.";
          return;
        }
        if (creditsBalanceInFlight) {
          return creditsBalanceInFlight;
        }
        try {
          creditsBalanceInFlight = (async () => {
            const { ok, payload } = await apiFetchJson("/api/billing/balance");
            if (!ok) {
              creditsBalanceValueEl.textContent = "--";
              creditsBalanceEl.title = "Kan tokensaldo niet laden";
              return;
            }
            const tokens = typeof payload?.tokens_available === "number" ? payload.tokens_available : null;
            if (tokens !== null) {
              creditsBalanceCache = { value: tokens, fetchedAt: Date.now() };
            }
            creditsBalanceValueEl.textContent = tokens !== null ? String(tokens) : "--";
            creditsBalanceEl.title = "Je tokensaldo.";
          })();
          await creditsBalanceInFlight;
        } catch (e) {
          creditsBalanceValueEl.textContent = "--";
          creditsBalanceEl.title = "Kan tokensaldo niet laden";
        } finally {
          creditsBalanceInFlight = null;
        }
      };

		      const LEGACY_SESSIONS_KEY_PREFIX = "mathijs_sessions_";
		      const LEGACY_MIGRATION_KEY = "mathijs_sessions_migrated_v1";
		      let legacyImportInFlight = false;

		      const findLegacyLocalSessionCandidates = () => {
		        try {
		          const candidates = [];
		          for (let i = 0; i < localStorage.length; i += 1) {
		            const key = localStorage.key(i);
		            if (!key || !key.startsWith(LEGACY_SESSIONS_KEY_PREFIX)) continue;
		            const raw = localStorage.getItem(key);
		            if (!raw) continue;
		            const parsed = JSON.parse(raw);
		            const list = Array.isArray(parsed?.list) ? parsed.list : [];
		            if (!list.length) continue;
		            candidates.push({ key, parsed, count: list.length });
		          }
		          candidates.sort((a, b) => (b.count || 0) - (a.count || 0));
		          return candidates;
		        } catch {
		          return [];
		        }
		      };

		      const loadLegacyLocalSessions = (userId) => {
		        if (!userId) return null;
		        const key = `${LEGACY_SESSIONS_KEY_PREFIX}${userId}`;
		        try {
		          const raw = localStorage.getItem(key);
	          if (!raw) return null;
	          const parsed = JSON.parse(raw);
	          if (!parsed || !Array.isArray(parsed.list)) return null;
	          return parsed;
	        } catch {
	          return null;
	        }
	      };

	      const hasMigratedLegacy = (userId) => {
	        try {
	          return localStorage.getItem(`${LEGACY_MIGRATION_KEY}:${userId}`) === "1";
	        } catch {
	          return false;
	        }
	      };

	      const markMigratedLegacy = (userId) => {
	        try {
	          localStorage.setItem(`${LEGACY_MIGRATION_KEY}:${userId}`, "1");
	        } catch {
	          // ignore
	        }
	      };

		      const tryImportLegacySessions = async (userId, { force = false } = {}) => {
		        if (!userId) return false;
		        if (legacyImportInFlight) return false;
		        if (!force && hasMigratedLegacy(userId)) return false;
		        let legacy = loadLegacyLocalSessions(userId);
		        let legacyList = Array.isArray(legacy?.list) ? legacy.list : [];
		        if (!legacyList.length) {
		          const candidates = findLegacyLocalSessionCandidates();
		          if (candidates.length) {
		            legacy = candidates[0].parsed;
		            legacyList = Array.isArray(legacy?.list) ? legacy.list : [];
		          }
		        }
		        if (!legacyList.length) return false;

	        legacyImportInFlight = true;
	        try {
	          const sessions = legacyList
	            .filter((s) => s && s.id && Array.isArray(s.messages) && s.messages.length)
	            .map((s) => ({
	              id: String(s.id),
	              messages: s.messages.map((m) => ({
	                role: m?.role,
	                content: m?.content || m?.message_text || "",
	                created_at: m?.created_at || m?.createdAt || null,
	              })),
	            }));

	          if (!sessions.length) return false;

          const resp = await apiFetchJson("/api/messages?action=import-legacy", {
            method: "POST",
            body: { sessions },
          });
          if (!resp.ok) {
            console.error("Legacy import failed", resp);
            const directImported = await importLegacySessionsDirect(userId, sessions);
            if (!directImported) return false;
            markMigratedLegacy(userId);
            return true;
          }
          markMigratedLegacy(userId);
          return true;
	        } finally {
	          legacyImportInFlight = false;
	        }
	      };

		      const ensureSessionEmptyActions = () => {
		        if (!sessionEmptyEl) return;
		        if (document.getElementById("session-empty-actions")) return;

	        const wrap = document.createElement("div");
	        wrap.id = "session-empty-actions";
	        wrap.style.display = "flex";
	        wrap.style.flexWrap = "wrap";
	        wrap.style.gap = "10px";
	        wrap.style.marginTop = "12px";

	        const reloadBtn = document.createElement("button");
	        reloadBtn.type = "button";
	        reloadBtn.textContent = "Opnieuw laden";
	        reloadBtn.style.padding = "10px 12px";
	        reloadBtn.style.borderRadius = "12px";
	        reloadBtn.style.border = "1px solid #dedede";
	        reloadBtn.style.background = "#fff";
	        reloadBtn.style.cursor = "pointer";

		        const restoreBtn = document.createElement("button");
		        restoreBtn.type = "button";
		        restoreBtn.textContent = "Herstel geschiedenis";
		        restoreBtn.style.padding = "10px 12px";
		        restoreBtn.style.borderRadius = "12px";
		        restoreBtn.style.border = "1px solid #dedede";
		        restoreBtn.style.background = "#fff";
		        restoreBtn.style.cursor = "pointer";

		        const reloginBtn = document.createElement("button");
		        reloginBtn.type = "button";
		        reloginBtn.textContent = "Opnieuw inloggen";
		        reloginBtn.style.padding = "10px 12px";
		        reloginBtn.style.borderRadius = "12px";
		        reloginBtn.style.border = "1px solid #dedede";
		        reloginBtn.style.background = "#fff";
		        reloginBtn.style.cursor = "pointer";

		        reloadBtn.addEventListener("click", async () => {
		          await refreshSessionsFromSupabase({ goToLatest: true });
		          if (sessionState.activeId) {
		            await loadMessagesForSession(sessionState.activeId);
	          }
	        });

		        restoreBtn.addEventListener("click", async () => {
		          const user = await requireAuthenticatedUser();
		          if (!user?.id) return;
		          const imported = await tryImportLegacySessions(user.id, { force: true });
	          if (!imported) {
	            renderEmptySessionMessage("Geen lokale geschiedenis gevonden om te herstellen.");
	            ensureSessionEmptyActions();
	            return;
	          }
	          await refreshSessionsFromSupabase({ goToLatest: true });
		          if (sessionState.activeId) {
		            await loadMessagesForSession(sessionState.activeId);
		          }
		        });

		        wrap.appendChild(reloadBtn);
		        wrap.appendChild(restoreBtn);
		        wrap.appendChild(reloginBtn);
		        sessionEmptyEl.insertAdjacentElement("afterend", wrap);

		        reloginBtn.addEventListener("click", async () => {
		          try {
		            await supabaseClient?.auth?.signOut();
		          } catch {
		            // ignore
		          }
		          window.location.href = "/login";
		        });
		      };

	      let topupModalEl = null;
	      const openTopupModal = ({ message = "", tokensAvailable = null } = {}) => {
	        if (topupModalEl) {
	          topupModalEl.classList.add("is-visible");
	          const msgEl = topupModalEl.querySelector("[data-topup-message]");
	          if (msgEl) {
	            const suffix = tokensAvailable !== null ? ` (saldo: ${tokensAvailable})` : "";
	            msgEl.textContent = `${message || "Je tokens zijn op."}${suffix}`;
	          }
	          return;
	        }

	        const overlay = document.createElement("div");
	        overlay.className = "topup-modal is-visible";
	        overlay.setAttribute("role", "dialog");
	        overlay.setAttribute("aria-modal", "true");

	        const dialog = document.createElement("div");
	        dialog.className = "topup-modal__dialog";
	        dialog.addEventListener("click", (e) => e.stopPropagation());

	        const header = document.createElement("div");
	        header.className = "topup-modal__header";
	        const title = document.createElement("div");
	        title.className = "topup-modal__title";
	        title.textContent = "Tokens opwaarderen";
	        const closeBtn = document.createElement("button");
	        closeBtn.type = "button";
	        closeBtn.className = "topup-modal__close";
	        closeBtn.setAttribute("aria-label", "Sluiten");
	        closeBtn.textContent = "✕";
	        header.appendChild(title);
	        header.appendChild(closeBtn);

	        const body = document.createElement("div");
	        body.className = "topup-modal__body";

	        const msg = document.createElement("div");
	        msg.className = "topup-modal__message";
	        msg.setAttribute("data-topup-message", "true");
	        const suffix = tokensAvailable !== null ? ` (saldo: ${tokensAvailable})` : "";
	        msg.textContent = `${message || "Je tokens zijn op. Waardeer je account op om door te chatten."}${suffix}`;

	        const row = document.createElement("div");
	        row.className = "topup-modal__row";
	        const label = document.createElement("label");
	        label.className = "topup-modal__label";
	        label.textContent = "Bedrag (€)";
	        label.setAttribute("for", "topup-amount");
	        const input = document.createElement("input");
	        input.id = "topup-amount";
	        input.type = "number";
	        input.min = "1";
	        input.step = "1";
	        input.value = "10";
	        input.className = "topup-modal__input";
	        input.inputMode = "decimal";
	        row.appendChild(label);
	        row.appendChild(input);

	        const feedback = document.createElement("div");
	        feedback.className = "topup-modal__feedback";

	        const actions = document.createElement("div");
	        actions.className = "topup-modal__actions";
	        const cancel = document.createElement("button");
	        cancel.type = "button";
	        cancel.className = "topup-modal__btn secondary";
	        cancel.textContent = "Annuleren";
	        const confirm = document.createElement("button");
	        confirm.type = "button";
	        confirm.className = "topup-modal__btn primary";
	        confirm.textContent = "Opwaarderen";
	        actions.appendChild(cancel);
	        actions.appendChild(confirm);

	        body.appendChild(msg);
	        body.appendChild(row);
	        body.appendChild(actions);
	        body.appendChild(feedback);

	        dialog.appendChild(header);
	        dialog.appendChild(body);
	        overlay.appendChild(dialog);

	        const close = () => overlay.classList.remove("is-visible");
	        overlay.addEventListener("click", close);
	        closeBtn.addEventListener("click", close);
	        cancel.addEventListener("click", close);
	        document.addEventListener("keydown", (e) => {
	          if (e.key === "Escape") close();
	        });

	        confirm.addEventListener("click", async () => {
	          feedback.textContent = "";
	          const amountEur = Number(String(input.value || "").replace(",", "."));
	          if (!Number.isFinite(amountEur) || amountEur <= 0) {
	            feedback.textContent = "Vul een geldig bedrag in.";
	            return;
	          }
	          confirm.disabled = true;
	          confirm.textContent = "Bezig...";
	          try {
	            const resp = await apiFetchJson("/api/billing/topup-create-session", {
	              method: "POST",
	              body: { amount_eur: amountEur },
	            });
	            if (!resp.ok || !resp.payload?.url) {
	              throw new Error(resp?.payload?.error || "Opwaarderen kon niet worden gestart.");
	            }
	            window.location.href = resp.payload.url;
	          } catch (e) {
	            feedback.textContent = e?.message || "Opwaarderen mislukt. Probeer later opnieuw.";
	            confirm.disabled = false;
	            confirm.textContent = "Opwaarderen";
	          }
	        });

	        document.body.appendChild(overlay);
	        topupModalEl = overlay;
	        setTimeout(() => input.focus(), 50);
	      };

	      const saveMessageToApi = async (sessionId, role, content, provider = null) => {
	        const body = { session_id: sessionId, role, message_text: content };
	        if (provider) {
	          body.provider = provider;
	        }
	        const resp = await apiFetchJson("/api/messages?action=add", {
	          method: "POST",
	          body,
	        });
          if (resp.ok) return resp;
          const userId = currentUser?.id;
          const direct = await insertMessageDirect(userId, sessionId, role, content, provider);
          if (direct.ok) {
            return { ok: true, status: 200, payload: { ok: true, fallback: true } };
          }
          return resp;
	      };

	      const deleteSession = async (sessionId, isLegacy) => {
	        const user = await requireAuthenticatedUser();
	        if (!user) return;
	        try {
	          const resp = await apiFetchJson("/api/messages?action=delete-session", {
	            method: "POST",
	            body: { session_id: isLegacy ? LEGACY_SESSION_ID : sessionId },
	          });
	          if (!resp.ok) {
	            throw new Error(resp?.payload?.error || "Kon sessie niet verwijderen");
	          }
	        } catch (err) {
	          console.error("Verwijderen van sessie mislukt", err);
	          alert("Kon het gesprek niet verwijderen. Probeer later opnieuw.");
	          return;
        }
        deleteTitleOverride(user.id, sessionId);
        titleOverrides = loadTitleOverrides(user.id);
        clearLastActiveSessionId(user.id, sessionId);
        await refreshSessionsFromSupabase({ goToLatest: true });
        renderEmptyState();
      };

	      const refreshSessionsFromSupabase = async (options = {}) => {
	        const { goToLatest = false, preferredSessionId = null } = options;
	        const user = await requireAuthenticatedUser();
	        if (!user?.id) return;
	        setSessionsLoading(true);
	        const applySessions = (data) => {
	          setSessionsLoading(false);
	          const derivedSessions = data.map((session) => ({
	            ...session,
	            title:
	              titleOverrides[session.id] ||
	              generateSessionTitleFromPrompt(session.firstUserMessage) ||
	              "Chat",
	          }));

	          derivedSessions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
	          sessionState.list = derivedSessions;
	          sessionState.untitledCount = derivedSessions.length;
	          const hasActiveSession = derivedSessions.some((session) => session.id === sessionState.activeId);
	          const hasPreferredSession =
	            preferredSessionId && derivedSessions.some((session) => session.id === preferredSessionId);
	          const hasLocalMessages = countConversationMessages() > 0;
	          const preserveActive = hasLocalMessages && sessionState.activeId;
	          if (!preserveActive) {
	            if (hasPreferredSession) {
	              sessionState.activeId = preferredSessionId;
	            } else if (goToLatest || !sessionState.activeId || !hasActiveSession) {
	              sessionState.activeId = derivedSessions[0] ? derivedSessions[0].id : null;
	            }
	          }
	          if (sessionState.activeId) {
	            saveLastActiveSessionId(user.id, sessionState.activeId);
	          }
	          renderSessionList();
	        };
	        const tryDirectSessions = async () => {
	          console.log("tryDirectSessions: proberen direct te laden voor user", user.id);
	          const direct = await fetchSessionsDirect(user.id);
	          console.log("tryDirectSessions: resultaat", { ok: direct.ok, count: direct.sessions?.length, reason: direct.reason });
	          if (direct.ok && direct.sessions.length) {
	            applySessions(direct.sessions);
	            return true;
	          }
	          return false;
	        };
	        try {
	          console.log("refreshSessionsFromSupabase: ophalen via API");
	          const { ok, payload } = await apiFetchJson("/api/messages?action=sessions");
	          console.log("refreshSessionsFromSupabase: API resultaat", { ok, sessionsCount: payload?.sessions?.length });
	          if (!ok) {
	            console.warn("refreshSessionsFromSupabase: API mislukt, probeer direct", payload?.error);
	            const recovered = await tryDirectSessions();
	            if (recovered) return;
	            throw new Error(payload?.error || "Kon sessies niet laden");
	          }

	          const data = payload?.sessions || [];
	          if (!Array.isArray(data) || !data.length) {
	            console.log("refreshSessionsFromSupabase: geen sessies van API, probeer legacy import");
	            const imported = await tryImportLegacySessions(user.id);
	            if (imported) {
	              // Try again after import.
	              return await refreshSessionsFromSupabase(options);
	            }
	            console.log("refreshSessionsFromSupabase: geen legacy, probeer direct");
	            const recovered = await tryDirectSessions();
	            if (recovered) return;
	          console.log("refreshSessionsFromSupabase: geen sessies gevonden - dit kan normaal zijn voor nieuwe gebruikers");
	          sessionState.list = [];
	          sessionState.activeId = null;
	          sessionState.untitledCount = 0;
	          clearLastActiveSessionId(user.id);
	          setSessionsLoading(false);
	          renderSessionList();
	          // Geen actieknoppen tonen als dit een nieuwe gebruiker is zonder chat geschiedenis
	          // (de "Nieuw gesprek" knop is al beschikbaar)
	          return;
	        }

	        applySessions(data);
	      } catch (error) {
	        console.error("Sessies ophalen mislukt", error);
	        const recovered = await tryDirectSessions();
	        if (recovered) return;
	        setSessionsLoading(false);
	        renderSessionList();
	        renderEmptySessionMessage("Kon gesprekken niet laden. Probeer opnieuw laden.");
	        ensureSessionEmptyActions();
	      }
	    };

      let sessionsRefreshTimer = null;
      const scheduleSessionsRefresh = (options = {}) => {
        if (sessionsRefreshTimer) return;
        sessionsRefreshTimer = setTimeout(async () => {
          sessionsRefreshTimer = null;
          try {
            await refreshSessionsFromSupabase({ preferredSessionId: sessionState.activeId, ...options });
          } catch (e) {
            console.warn("Sessies verversen mislukt (achtergrond).", e?.message || e);
          }
        }, 1200);
      };

      const loadMessagesForSession = async (sessionId) => {
        const user = await requireAuthenticatedUser();
        const activeSession = sessionState.list.find((session) => session.id === sessionId);
        if (!user || !sessionId || !chatLog || !activeSession) {
          renderEmptyState();
          updateNewChatButtonState();
          return;
        }
        saveLastActiveSessionId(user.id, sessionId);
        chatLog.innerHTML = "";
        messages = [createSystemMessage()];
	        const applyMessages = (data) => {
	          const history = [];
	          data.forEach((entry) => {
	            const normalizedRole = entry.role === "user" ? "user" : "assistant";
	            appendMessage(entry.message_text, normalizedRole, { persist: false });
	            history.push({ role: normalizedRole, content: entry.message_text });
	          });
	          messages = [createSystemMessage(), ...history];
	          updateNewChatButtonState();
	        };
	        try {
	          const qs = new URLSearchParams({ session_id: sessionId });
	          const { ok, payload } = await apiFetchJson(`/api/messages?action=session&${qs.toString()}`);
	          if (!ok) throw new Error(payload?.error || "Kon berichten niet laden");
	          let data = payload?.messages || [];

	          if (!Array.isArray(data) || !data.length) {
	            const direct = await fetchMessagesDirect(user.id, sessionId);
	            if (direct.ok && direct.messages.length) {
	              data = direct.messages;
	            } else {
	              renderEmptyState();
	              return;
	            }
	          }

	          applyMessages(data);
	        } catch (error) {
	          console.error("Berichten ophalen mislukt", error);
	          const direct = await fetchMessagesDirect(user.id, sessionId);
	          if (direct.ok && direct.messages.length) {
	            applyMessages(direct.messages);
	            return;
	          }
	          const errorMsg = error?.message || "Onbekende fout";
	          console.error("Fout details:", errorMsg, error);
	          appendMessage(
	            `Berichten konden niet geladen worden: ${errorMsg}. Controleer je verbinding en probeer het opnieuw.`,
	            "assistant",
	            { persist: false }
	          );
	          updateNewChatButtonState();
	        }
	      };

      const setActiveSession = async (sessionId) => {
        if (!sessionId) {
          return;
        }
        if (sessionId !== sessionState.activeId) {
          sessionState.activeId = sessionId;
        }
        bindCurrentModelToSession(sessionId);
        renderSessionList();
        await loadMessagesForSession(sessionId);
        updateNewChatButtonState();
      };

      const updateProfileSidebar = (user) => {
        if (!user) return;
        const username = (user.user_metadata && user.user_metadata.username) || (user.email ? user.email.split("@")[0] : "Account");
        if (profileNameEl) {
          profileNameEl.textContent = username;
        }
        if (profileEmailEl) {
          profileEmailEl.textContent = user.email || "";
          profileEmailEl.title = user.email || "";
        }
        if (profileInitialsEl) {
          const initials = username
            .split(" ")
            .map((part) => part.charAt(0).toUpperCase())
            .slice(0, 2)
            .join("") || "MA";
          profileInitialsEl.textContent = initials;
        }
        if (profileAvatar && profileAvatarImage) {
          const avatarUrl = user.user_metadata && user.user_metadata.avatar_url;
          const avatarBucket = user.user_metadata && user.user_metadata.avatar_bucket;
          const avatarPath = user.user_metadata && user.user_metadata.avatar_path;

          const setAvatarSrc = (src) => {
            if (!src) return;
            profileAvatarImage.src = src;
            profileAvatar.classList.add("has-image");
          };

          const clearAvatar = () => {
            profileAvatarImage.removeAttribute("src");
            profileAvatar.classList.remove("has-image");
          };

          const loadSignedAvatar = async () => {
            if (!supabaseClient || !avatarBucket || !avatarPath) return;
            try {
              const { data, error } = await supabaseClient.storage
                .from(avatarBucket)
                .createSignedUrl(avatarPath, 60 * 60 * 24 * 365);
              if (error) throw error;
              if (data?.signedUrl) {
                setAvatarSrc(data.signedUrl);
                avatarSignedFallbackUsed = true;
              }
            } catch (error) {
              console.warn("Signed avatar URL failed:", error);
            }
          };

          if (avatarUrl) {
            setAvatarSrc(avatarUrl);
            avatarSignedFallbackUsed = false;
            profileAvatarImage.onerror = () => {
              if (avatarSignedFallbackUsed) return;
              loadSignedAvatar();
            };
          } else if (avatarBucket && avatarPath) {
            loadSignedAvatar();
          } else {
            clearAvatar();
          }
        }
      };

      const getGreetingName = () => {
        if (!currentUser) return "daar";
        const username =
          (currentUser.user_metadata && currentUser.user_metadata.username) ||
          (currentUser.email ? currentUser.email.split("@")[0] : "");
        if (!username) return "daar";
        const first = username.split(/[\s._-]+/)[0] || username;
        return first.charAt(0).toUpperCase() + first.slice(1);
      };

      const getTimeGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return "Goedemorgen";
        if (hour < 18) return "Goedemiddag";
        return "Goedeavond";
      };

      const renderEmptyState = () => {
        if (!chatLog) return;
        chatLog.innerHTML = "";
        const emptyState = document.createElement("div");
        emptyState.className = "empty-state";
        const greeting = document.createElement("h2");
        greeting.className = "empty-hero__title";
        greeting.textContent = `${getTimeGreeting()}, ${getGreetingName()}.`;
        emptyState.appendChild(greeting);
        chatLog.appendChild(emptyState);
      };

      const clearEmptyState = () => {
        if (!chatLog) return;
        const empty = chatLog.querySelector(".empty-state");
        if (empty) {
          empty.remove();
        }
      };

	      const requireAuthenticatedUser = async () => {
	        // Ensure Supabase client is loaded
	        if (!supabaseClient) {
	          console.log("requireAuthenticatedUser: Supabase client ontbreekt, wachten...");
	          supabaseClient = await waitForSupabase();
	        }
	        if (!supabaseClient) {
	          console.error("requireAuthenticatedUser: Supabase client kon niet worden geïnitialiseerd");
	          renderEmptyState();
	          renderEmptySessionMessage("Fout bij verbinden met Supabase. Ververs de pagina.");
	          ensureSessionEmptyActions();
	          return null;
	        }
        if (currentUser) {
          if (!isPaidUser(currentUser)) {
            window.location.href = "/subscribe";
            return null;
          }
          await hydrateModelStateForUser(currentUser.id);
          console.log("requireAuthenticatedUser: gebruiker al bekend", currentUser.id, currentUser.email);
          return currentUser;
        }
	        try {
	          console.log("requireAuthenticatedUser: ophalen gebruiker via getUser()");
	          const { data, error } = await supabaseClient.auth.getUser();
	          if (error || !data?.user) {
	            console.error("requireAuthenticatedUser: geen actieve gebruiker", error);
	            try {
	              await supabaseClient.auth.signOut();
	            } catch {
	              // ignore
	            }
	            window.location.href = "/login";
	            return null;
	          }
          currentUser = data.user;
          if (!isPaidUser(currentUser)) {
            window.location.href = "/subscribe";
            return null;
          }
          console.log("requireAuthenticatedUser: gebruiker gevonden", currentUser.id, currentUser.email);
	        } catch (error) {
	          console.error("requireAuthenticatedUser: kon gebruiker niet ophalen", error);
	          try {
	            await supabaseClient.auth.signOut();
	          } catch {
	            // ignore
	          }
	          renderEmptyState();
	          renderEmptySessionMessage("Kon je login niet controleren. Probeer opnieuw in te loggen.");
	          ensureSessionEmptyActions();
	          window.location.href = "/login";
	          return null;
	        }
	        titleOverrides = loadTitleOverrides(currentUser.id);
	        await hydrateModelStateForUser(currentUser.id);
	        updateProfileSidebar(currentUser);
	        initProfileEnhancements();
	        initLogoutButton();
	        return currentUser;
	      };
      
      const initLogoutButton = () => {
        if (!supabaseClient) return;

        const buttons = [
          document.getElementById("sidebar-logout-btn"),
          document.getElementById("header-logout-btn"),
        ].filter(Boolean);

        if (!buttons.length) return;

        buttons.forEach((btn) => {
          btn.addEventListener("click", () => {
            window.location.href = "/";
          });
        });
      };


      const showThinkingIndicator = () => {
        if (!chatLog || thinkingIndicator) return;
        const article = document.createElement("article");
        article.className = "message system thinking";

        const bubble = document.createElement("div");
        bubble.className = "bubble thinking-bubble";

        const dots = document.createElement("div");
        dots.className = "thinking-dots";
        for (let i = 0; i < 3; i++) {
          const dot = document.createElement("span");
          dot.className = "dot";
          dots.appendChild(dot);
        }

        const label = document.createElement("span");
        label.className = "thinking-label";
        const currentModel = selectedModelLabel || "AI";
        label.textContent = `${currentModel} is aan het nadenken...`;

        bubble.appendChild(dots);
        bubble.appendChild(label);
        article.appendChild(bubble);
        chatLog.appendChild(article);
        scrollToBottomIfPinned();
        thinkingIndicator = article;
      };

      const hideThinkingIndicator = () => {
        if (thinkingIndicator && thinkingIndicator.parentElement) {
          thinkingIndicator.parentElement.removeChild(thinkingIndicator);
        }
        thinkingIndicator = null;
      };

      const escapeHtml = (value) =>
        String(value || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");

      const sanitizeUrl = (value) => {
        const trimmed = String(value || "").trim();
        if (!trimmed) return null;
        if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
        return null;
      };

      const formatInline = (value) => {
        if (!value) return "";
        const inlineCode = [];
        let output = value.replace(/`([^`]+?)`/g, (_, code) => {
          const token = `__INLINE_CODE_${inlineCode.length}__`;
          inlineCode.push(code);
          return token;
        });
        output = output.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
        output = output.replace(/(^|[^*])\*([^*]+?)\*(?!\*)/g, "$1<em>$2</em>");
        output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url) => {
          const safeUrl = sanitizeUrl(url);
          if (!safeUrl) return label;
          return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${label}</a>`;
        });
        output = output.replace(/__INLINE_CODE_(\d+)__/g, (match, index) => {
          const idx = Number(index);
          return Number.isFinite(idx) && inlineCode[idx] !== undefined ? `<code>${inlineCode[idx]}</code>` : match;
        });
        return output;
      };

      const formatMessageContent = (text) => {
        if (!text) return "";
        const normalized = String(text).replace(/\r\n/g, "\n");
        const codeBlocks = [];
        const withCodeTokens = normalized.replace(/```([a-z0-9_-]+)?\s*\n([\s\S]*?)```/gi, (_, lang, code) => {
          const safeLang = String(lang || "").toLowerCase().replace(/[^a-z0-9_-]/g, "");
          const token = `__CODE_BLOCK_${codeBlocks.length}__`;
          const className = safeLang ? ` class="language-${safeLang}"` : "";
          const encoded = encodeURIComponent(code);
          const label = safeLang ? safeLang.toUpperCase() : "CODE";
          const toolbar = `
            <div class="code-block__toolbar">
              <span class="code-block__label">${label}</span>
              <div class="code-block__actions">
                <button type="button" class="code-block__btn" data-action="preview">Preview</button>
                <button type="button" class="code-block__btn" data-action="copy">Kopieer</button>
              </div>
            </div>
          `;
          codeBlocks.push(
            `<div class="code-block" data-lang="${safeLang}" data-code="${encoded}">${toolbar}<pre><code${className}>${escapeHtml(code)}</code></pre></div>`
          );
          return token;
        });

        const escaped = escapeHtml(withCodeTokens);
        const lines = escaped.split("\n");
        const html = [];
        let paragraph = [];
        let listType = null;
        let quoteLines = [];

        const flushParagraph = () => {
          if (!paragraph.length) return;
          html.push(`<p>${paragraph.join("<br>")}</p>`);
          paragraph = [];
        };

        const closeList = () => {
          if (!listType) return;
          html.push(`</${listType}>`);
          listType = null;
        };

        const flushQuote = () => {
          if (!quoteLines.length) return;
          const content = quoteLines.map((line) => formatInline(line)).join("<br>");
          html.push(`<blockquote>${content}</blockquote>`);
          quoteLines = [];
        };

        const pushBlock = (block) => {
          flushParagraph();
          flushQuote();
          closeList();
          html.push(block);
        };

        lines.forEach((line) => {
          if (line.includes("__CODE_BLOCK_")) {
            pushBlock(line);
            return;
          }

          if (!line.trim()) {
            flushParagraph();
            flushQuote();
            closeList();
            return;
          }

          const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
          if (headingMatch) {
            const level = headingMatch[1].length;
            const tag = level === 1 ? "h2" : level === 2 ? "h3" : "h4";
            pushBlock(`<${tag}>${formatInline(headingMatch[2])}</${tag}>`);
            return;
          }

          if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
            pushBlock("<hr>");
            return;
          }

          const quoteMatch = line.match(/^>\s?(.*)$/);
          if (quoteMatch) {
            flushParagraph();
            closeList();
            quoteLines.push(quoteMatch[1] || "");
            return;
          }
          flushQuote();

          const unorderedMatch = line.match(/^\s*[-*+]\s+(.+)$/);
          if (unorderedMatch) {
            flushParagraph();
            flushQuote();
            if (listType && listType !== "ul") closeList();
            if (!listType) {
              html.push("<ul>");
              listType = "ul";
            }
            html.push(`<li>${formatInline(unorderedMatch[1])}</li>`);
            return;
          }

          const orderedMatch = line.match(/^\s*\d+\.\s+(.+)$/);
          if (orderedMatch) {
            flushParagraph();
            flushQuote();
            if (listType && listType !== "ol") closeList();
            if (!listType) {
              html.push("<ol>");
              listType = "ol";
            }
            html.push(`<li>${formatInline(orderedMatch[1])}</li>`);
            return;
          }

          if (listType) {
            closeList();
          }

          paragraph.push(formatInline(line));
        });

        flushParagraph();
        flushQuote();
        closeList();

        let output = html.join("");
        output = output.replace(/__CODE_BLOCK_(\d+)__/g, (match, index) => {
          const idx = Number(index);
          return Number.isFinite(idx) && codeBlocks[idx] ? codeBlocks[idx] : match;
        });
        return output;
      };

	      const appendMessage = (content, role = "assistant", options = {}) => {
	        if (!chatLog || !content) return;
	        clearEmptyState();
	        const article = document.createElement("article");
	        article.className = "message " + (role === "user" ? "user" : "system");

        const bubble = document.createElement("div");
        bubble.className = "bubble";
        bubble.innerHTML = formatMessageContent(content);
        enhanceCodeBlocks(bubble);

        article.appendChild(bubble);
        chatLog.appendChild(article);
        scrollToBottomIfPinned();

        const shouldPersist =
          options.persist !== false && (role === "user" || role === "assistant" || role === "developer");
        if (!shouldPersist) {
          return;
        }
	        messages.push({ role, content });
	        updateSessionMetaAfterMessage(role, content);
	        updateNewChatButtonState();
	      };

      const createAssistantStreamMessage = () => {
        if (!chatLog) return null;
        clearEmptyState();
        const article = document.createElement("article");
        article.className = "message system";
        const bubble = document.createElement("div");
        bubble.className = "bubble";
        bubble.innerHTML = "";
        article.appendChild(bubble);
        chatLog.appendChild(article);
        scrollToBottomIfPinned();
        return { article, bubble };
      };

      const buildCodeToolbar = (langLabel = "CODE") => {
        const toolbar = document.createElement("div");
        toolbar.className = "code-block__toolbar";
        const label = document.createElement("span");
        label.className = "code-block__label";
        label.textContent = langLabel;
        const actions = document.createElement("div");
        actions.className = "code-block__actions";
        const previewBtn = document.createElement("button");
        previewBtn.type = "button";
        previewBtn.className = "code-block__btn";
        previewBtn.setAttribute("data-action", "preview");
        previewBtn.textContent = "Preview";
        const copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.className = "code-block__btn";
        copyBtn.setAttribute("data-action", "copy");
        copyBtn.textContent = "Kopieer";
        actions.appendChild(previewBtn);
        actions.appendChild(copyBtn);
        toolbar.appendChild(label);
        toolbar.appendChild(actions);
        return toolbar;
      };

      const enhanceCodeBlocks = (container) => {
        if (!container) return;
        const blocks = Array.from(container.querySelectorAll("pre > code"));
        blocks.forEach((codeEl) => {
          const pre = codeEl.parentElement;
          if (!pre) return;
          if (pre.closest(".code-block")) return;
          const className = codeEl.className || "";
          const match = className.match(/language-([a-z0-9_-]+)/i);
          const lang = match ? match[1].toLowerCase() : "";
          const label = lang ? lang.toUpperCase() : "CODE";
          const wrapper = document.createElement("div");
          wrapper.className = "code-block";
          wrapper.setAttribute("data-lang", lang);
          wrapper.setAttribute("data-code", encodeURIComponent(codeEl.textContent || ""));
          const toolbar = buildCodeToolbar(label);
          pre.replaceWith(wrapper);
          wrapper.appendChild(toolbar);
          wrapper.appendChild(pre);
        });
      };

      const streamAssistantMessage = async (content) => {
        if (!content) return;
        const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
        const MAX_STREAM_CHARS = 900;
        if (prefersReduced || content.length > MAX_STREAM_CHARS) {
          appendMessage(content, "assistant");
          return;
        }

        const stream = createAssistantStreamMessage();
        if (!stream) return;

        const { bubble } = stream;
        const step = 48;
        let index = 0;
        const nextFrame = () =>
          new Promise((resolve) => {
            if (window.requestAnimationFrame) {
              requestAnimationFrame(() => resolve());
            } else {
              setTimeout(resolve, 16);
            }
          });

        while (index < content.length) {
          index = Math.min(index + step, content.length);
          bubble.textContent = content.slice(0, index);
          scrollToBottomIfPinned();
          await nextFrame();
        }

        bubble.innerHTML = formatMessageContent(content);
        enhanceCodeBlocks(bubble);
        messages.push({ role: "assistant", content });
        updateSessionMetaAfterMessage("assistant", content);
        updateNewChatButtonState();
      };

		      const workspaceReady = (async () => {
            let initialLoadPromise = null;
		        try {
		          // Ensure Supabase client is loaded
		          if (!supabaseClient) {
		            supabaseClient = await waitForSupabase();
		          }
		          if (!supabaseClient) {
		            console.error("Kan Supabase client niet initialiseren");
		            renderEmptyState();
		            renderEmptySessionMessage("Fout bij laden. Probeer de pagina te verversen.");
		            ensureSessionEmptyActions();
		            return null;
		          }
		          const user = await requireAuthenticatedUser();
		          if (!user) {
		            return null;
		          }
		          refreshProviderStatus();
		          refreshCreditsBalance();
		          const preferredSessionId = getPreferredSessionId(user.id);
		          renderEmptyState();
		          updateNewChatButtonState();
		          initialLoadPromise = refreshSessionsFromSupabase({ preferredSessionId })
		            .then(async () => {
		              const hasMessages = countConversationMessages() > 0;
		              if (!hasMessages && sessionState.activeId) {
		                await loadMessagesForSession(sessionState.activeId);
		              } else if (!hasMessages && !sessionState.activeId) {
		                createLocalSession();
		              }
                  workspaceBooted = true;
                  await ensureModelSessionForSelectedModel({ createIfMissing: true, bindActiveFallback: true });
		              updateNewChatButtonState();
		            })
		            .catch((error) => {
		              console.error("Sessies laden mislukt (achtergrond)", error);
		            });
		          return user;
		        } catch (error) {
		          console.error("Workspace init failed", error);
		          renderEmptyState();
		          renderEmptySessionMessage("Kon gesprekken niet laden. Probeer opnieuw laden of log opnieuw in.");
		          ensureSessionEmptyActions();
		          return null;
		        } finally {
              await hideAppLoader(initialLoadPromise);
            }
		      })();

      const MAX_REQUEST_MESSAGES = 24;
      const MAX_REQUEST_CHARS = 16000;

      const buildRequestMessages = () => {
        const cleaned = (messages || [])
          .filter(
            (message) =>
              message &&
              typeof message.content === "string" &&
              message.content.trim() &&
              (message.role === "user" || message.role === "assistant" || message.role === "developer")
          )
          .map((message) => ({ role: message.role, content: message.content }));

        const developer = cleaned.filter((m) => m.role === "developer");
        const convo = cleaned.filter((m) => m.role !== "developer");

        // Keep latest N conversational messages
        let tail = convo.slice(-MAX_REQUEST_MESSAGES);

        // Enforce char budget from the end (keep most recent)
        let total = 0;
        const kept = [];
        for (let i = tail.length - 1; i >= 0; i -= 1) {
          const msg = tail[i];
          const len = (msg?.content || "").length;
          if (!len) continue;
          if (total + len > MAX_REQUEST_CHARS && kept.length) break;
          total += len;
          kept.push(msg);
        }
        kept.reverse();

        // Build system message with provider information
        const provider = getSelectedProvider();
        const providerName =
          provider === "gemini"
            ? "Google Gemini"
            : provider === "openai"
              ? "OpenAI"
              : provider === "anthropic"
                ? "Claude (Anthropic)"
                : provider === "grok"
                  ? "Grok"
                  : "een AI-model";
        const baseSystemMessage = "Je bent een behulpzame AI-assistent in de AI-leeromgeving van Mathijs.ai. Je helpt ondernemers kiezen en toepassen wanneer ze welk model gebruiken.";
        const providerInfo = `\n\nBelangrijk: Je wordt momenteel uitgevoerd via ${providerName}. Wanneer gebruikers vragen welke tool, API of model er gebruikt wordt, moet je duidelijk aangeven dat je ${providerName} gebruikt.`;
        
        const systemMessage = baseSystemMessage + providerInfo;
        const sys = [{ role: "developer", content: systemMessage }];
        return [...sys, ...kept];
      };

	      const sendMessage = async () => {
	        await workspaceReady;
	        if (!chatInput) return;
	        const value = chatInput.value.trim();
	        if (!value) return;

        const provider = getSelectedProvider();
        let status = await refreshProviderStatus();
        // Als de gekozen provider nog niet als verbonden staat, één keer verse status ophalen
        // (eerste ophaal kan zijn mislukt of vóór login gedaan)
        const providerKey = provider === "openai" ? "openai" : provider === "gemini" ? "gemini" : provider === "grok" ? "grok" : provider === "anthropic" ? "claude" : null;
        if (providerKey && status[providerKey] !== true) {
          const freshStatus = await refreshProviderStatus({ force: true });
          if (freshStatus && typeof freshStatus === "object") status = freshStatus;
        }

        if (provider === "openai" && status.openai !== true) {
          appendMessage("OpenAI is niet gekoppeld. Voeg OPEN_AI_KEY toe om te chatten.", "assistant", { persist: false });
          return;
        }
        if (provider === "gemini" && status.gemini !== true) {
          appendMessage("Gemini is niet gekoppeld. Voeg GEMINI_API_KEY toe om te chatten.", "assistant", { persist: false });
          return;
        }
        if (provider === "grok" && status.grok !== true) {
          appendMessage("Grok is niet gekoppeld. Voeg GROK_API_KEY toe om te chatten.", "assistant", { persist: false });
          return;
        }
        if (provider === "anthropic" && status.claude !== true) {
          appendMessage("Claude is niet gekoppeld. Voeg CLAUDE_API_KEY toe om te chatten.", "assistant", { persist: false });
          return;
        }
        if (provider !== "openai" && provider !== "gemini" && provider !== "grok" && provider !== "anthropic") {
          appendMessage("Provider nog niet gekoppeld. Kies ChatGPT, Gemini, Grok of Claude om te chatten.", "assistant", { persist: false });
          return;
        }

        const openaiModel = provider === "openai" ? getSelectedOpenAIModel() : null;
        const geminiModel = provider === "gemini" ? getSelectedGeminiModel() : null;
        const grokModel = provider === "grok" ? getSelectedGrokModel() : null;
        const claudeModel = provider === "anthropic" ? getSelectedClaudeModel() : null;
        const selectedApiModel = openaiModel || geminiModel || grokModel || claudeModel;
        if (!selectedApiModel) {
          appendMessage("Ongeldig model geselecteerd. Kies opnieuw.", "assistant", { persist: false });
          return;
        }

        const user = await requireAuthenticatedUser();
        if (!user) {
          alert("Je moet ingelogd zijn om een bericht te sturen.");
          return;
        }
        const sessionId = ensureActiveSessionId();
        bindCurrentModelToSession(sessionId);
        appendMessage(value, "user");
        chatInput.value = "";
        chatInput.focus();
        const userSavePromise = saveMessageToApi(sessionId, "user", value, provider).then((save) => {
          if (!save.ok) {
            console.error("Gebruikersbericht opslaan mislukt", save?.payload?.error || save);
            if (window.siteUI?.toast) {
              window.siteUI.toast("Je bericht kon niet opgeslagen worden. Probeer het opnieuw.", { type: "error" });
            }
            scheduleSessionsRefresh({ goToLatest: true });
          }
          return save;
        });

        showThinkingIndicator();

		                try {
          const accessToken = await requireAccessToken();
          if (!accessToken) {
            throw new Error("Je sessie is verlopen. Log opnieuw in.");
          }
          const requestMessages = buildRequestMessages();
          const response = await fetch("/api/chat", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              provider,
              model: selectedApiModel,
              model_key: selectedModel,
              model_label: selectedModelLabel,
              messages: requestMessages,
            }),
          });

          let payload = null;
          try {
            payload = await response.json();
          } catch {
            payload = null;
          }

          if (!response.ok) {
            let errorMessage = payload?.error || "Er ging iets mis bij het ophalen van een antwoord.";
            errorMessage = String(errorMessage)
              .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, "***REDACTED***")
              .replace(/\b(?:sk_live|rk_live|whsec)_[A-Za-z0-9]{10,}\b/g, "***REDACTED***")
              .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, "***REDACTED***")
              .replace(/\bxai-[A-Za-z0-9_-]{20,}\b/g, "***REDACTED***");
            if (response.status === 401) {
              window.location.href = "/login";
            }
            if (response.status === 402 || response.status === 429) {
              openTopupModal({
                message: errorMessage,
                tokensAvailable: Number.isFinite(payload?.tokens_available) ? payload.tokens_available : null,
              });
            }
            throw new Error(errorMessage);
          }

          const finalContent = (payload?.text || "").trim() || "Ik heb even geen antwoord. Probeer het later nog eens.";
          // Hide indicator as soon as we have the answer, before any extra work.
          hideThinkingIndicator();
          await streamAssistantMessage(finalContent);

          // Ensure the user message save is at least attempted; we don't block UI on it.
          await userSavePromise;
          const assistantSave = await saveMessageToApi(sessionId, "assistant", finalContent, provider);
          if (!assistantSave.ok) {
            console.error("AI-antwoord opslaan mislukt", assistantSave?.payload?.error || assistantSave);
          }
          scheduleSessionsRefresh();
	        } catch (error) {
	          console.error("Chat request failed", error);
          console.error("Selected model:", selectedModelLabel);
          console.error("OpenAI model:", openaiModel);
          console.error("Error details:", error.message, error.stack);
          hideThinkingIndicator();
          const fallbackMessage = `De AI-request mislukte: ${error.message || "Onbekende fout"}. Controleer je verbinding en probeer opnieuw.`;
          appendMessage(fallbackMessage, "assistant", { persist: false });
	        } finally {
	          refreshCreditsBalance();
	        }
	      };

      if (sendButton && chatInput) {
        sendButton.addEventListener("click", sendMessage);
        chatInput.addEventListener("keydown", (event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
          }
        });
      }

	      if (newChatButton) {
	        newChatButton.addEventListener("click", async () => {
	          await workspaceReady;
	          if (isActiveSessionEmpty()) {
	            if (chatInput) chatInput.focus();
	            return;
	          }
	          createLocalSession();
	          if (chatInput) {
	            chatInput.focus();
	          }
	        });
	      }
    
