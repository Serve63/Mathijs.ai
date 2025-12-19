	      const inlineScripts = Array.from(document.querySelectorAll("script:not([src])"))
	        .filter((script) => script.textContent && script.textContent.trim().length);
	      if (inlineScripts.length) {
	        inlineScripts.forEach((script) => script.remove());
	        console.warn("[chat] Inline scripts detected in chat.html. Keep scripts in assets/chat.js to avoid CSP issues.");
	      }

	      const modelSelects = Array.from(document.querySelectorAll(".model-select"));
	      const statusIndicator = null;
	      const sidebar = document.querySelector(".sidebar");
	      const chatHeader = document.querySelector(".chat-header");
	      const chatModelSelector = document.querySelector(".chat-model-selector");

	      const syncSidebarTopOffset = () => {
	        if (!sidebar || !chatHeader) return;
	        const headerHeight = chatHeader.getBoundingClientRect().height || 0;
	        const selectorTop = chatModelSelector ? parseFloat(getComputedStyle(chatModelSelector).top) || 0 : 0;
        const extraOffset = -112;
	        document.documentElement.style.setProperty(
	          "--sidebar-top-offset",
	          `${Math.round(headerHeight + selectorTop + extraOffset)}px`
	        );
	      };

	      const scheduleSidebarTopOffsetSync = () => {
	        requestAnimationFrame(syncSidebarTopOffset);
	      };

	      scheduleSidebarTopOffsetSync();
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
      const toggleWebSearch = document.getElementById("toggle-web-search");
      const webSearchState = document.getElementById("web-search-state");
      const chatSearchIndicator = document.getElementById("chat-search-indicator");
      const chatSearchClose = document.getElementById("chat-search-close");
      const actionStudy = document.getElementById("action-study");
      const actionUpload = document.getElementById("action-upload");
      const actionDeep = document.getElementById("action-deep");
      const actionShopping = document.getElementById("action-shopping");
      const actionImage = document.getElementById("action-image");
      const actionAgent = document.getElementById("action-agent");
      const actionCanvas = document.getElementById("action-canvas");
      const layoutToggleBtn = document.getElementById("layout-toggle");
      const hiddenFileInput = document.createElement("input");
      hiddenFileInput.type = "file";
      hiddenFileInput.style.display = "none";
      document.body.appendChild(hiddenFileInput);
      let connectTimeout;
      const selectionState = {};
      const createSystemMessage = () => ({
        role: "system",
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

      const syncThinkingModeOptions = () => {
        if (!thinkingModeSelect) return;
        const options = thinkingModeOptions[selectedModel] || defaultThinkingOptions;
        const nextMode = options.some((option) => option.value === selectedThinkingMode)
          ? selectedThinkingMode
          : options[0].value;
        selectedThinkingMode = nextMode;
        thinkingModeSelect.innerHTML = "";
        options.forEach((option) => {
          const opt = document.createElement("option");
          opt.value = option.value;
          opt.textContent = option.label;
          thinkingModeSelect.appendChild(opt);
        });
        thinkingModeSelect.value = nextMode;
      };

		      const modelEngineMap = {
		        chatgpt52: "gpt-4o",
		        opus45: "gpt-4o",
		        sonnet4: "gpt-4o",
		        haiku45: "gpt-4o",
		        gemini3: "gemini-3",
		        llama4: "gpt-4o",
		        qwen: "gpt-4o",
		        deepseekv2: "gpt-4o", // Fallback to OpenAI until DeepSeek API is implemented
		        grok4: "gpt-4o", // Fallback to OpenAI until Grok API is implemented
		      };
		      let selectedModel = "chatgpt52";
		      let selectedModelLabel = "ChatGPT 5.2";
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
        selectedModelLabel = label || "ChatGPT 5.2";
        if (label && label.startsWith("Opus 4.5")) {
          selectedModel = "opus45";
        } else if (label && label.startsWith("Sonnet 4")) {
          selectedModel = "sonnet4";
        } else if (label && label.startsWith("Haiku 4.5")) {
          selectedModel = "haiku45";
        } else if (label && label.startsWith("Gemini 3")) {
          selectedModel = "gemini3";
        } else if (label && label.startsWith("Llama 4")) {
          selectedModel = "llama4";
        } else if (label && label.startsWith("QWEN")) {
          selectedModel = "qwen";
        } else if (label && label.startsWith("DeepSeek V2")) {
          selectedModel = "deepseekv2";
        } else if (label && label.startsWith("Grok 4")) {
          selectedModel = "grok4";
        } else {
          selectedModel = "chatgpt52";
        }
        syncThinkingModeOptions();
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
      };

      if (thinkingModeSelect) {
        syncThinkingModeOptions();
        thinkingModeSelect.addEventListener("change", (event) => {
          selectedThinkingMode = event.target.value;
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

      const handleModelChange = (categoryLabel, value) => {
        if (connectTimeout) clearTimeout(connectTimeout);
        setStatus("Verbinding makenâ€¦", "connecting");

        connectTimeout = setTimeout(() => {
          setStatus("Verbonden", "idle");
          appendMessage(`${categoryLabel} ${value} is verbonden en klaar voor prompts.`, "system");
        }, 900);
      };

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

	        trigger.addEventListener("click", () => {
	          const willOpen = !dropdown.classList.contains("active");
	          closeAllDropdowns(willOpen ? dropdown : null);
	          dropdown.classList.toggle("active");
	          trigger.setAttribute("aria-expanded", dropdown.classList.contains("active") ? "true" : "false");
	        });

	        options.forEach((option) => {
	          option.addEventListener("click", (event) => {
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
        const insideControl = event.target.closest(".model-select, .chat-plus");
        if (!insideControl) {
          closeAllDropdowns();
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
          const isOpen = chatPlusMenu.style.display === "block";
          closeAllDropdowns(isOpen ? null : chatPlusMenu);
          chatPlusMenu.style.display = isOpen ? "none" : "block";
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

      if (actionStudy) {
        actionStudy.addEventListener("click", (event) => {
          event.stopPropagation();
          alert("Studeren en leren wordt later toegevoegd.");
          closeAllDropdowns();
        });
      }

      // Add hover effects to menu buttons
      if (chatPlusMenu) {
        const menuButtons = chatPlusMenu.querySelectorAll("button");
        menuButtons.forEach(btn => {
          btn.addEventListener("mouseenter", () => { btn.style.background = "#f5f5f5"; });
          btn.addEventListener("mouseleave", () => { btn.style.background = "none"; });
        });
      }

      const placeholderAction = (msg) => () => {
        alert(msg);
        closeAllDropdowns();
      };

      if (actionUpload) {
        actionUpload.addEventListener("click", (event) => {
          event.stopPropagation();
          hiddenFileInput.click();
          closeAllDropdowns();
        });
      }

      hiddenFileInput.addEventListener("change", () => {
        if (hiddenFileInput.files && hiddenFileInput.files.length) {
          alert(`Bestand geselecteerd: ${hiddenFileInput.files[0].name}`);
        }
      });

      actionDeep?.addEventListener("click", (event) => {
        event.stopPropagation();
        alert("Diepgaand onderzoek wordt later toegevoegd.");
        closeAllDropdowns();
      });

      actionShopping?.addEventListener("click", (event) => {
        event.stopPropagation();
        alert("Winkelonderzoek wordt later toegevoegd.");
        closeAllDropdowns();
      });

      actionImage?.addEventListener("click", (event) => {
        event.stopPropagation();
        alert("Afbeelding genereren wordt later toegevoegd.");
        closeAllDropdowns();
      });

      actionAgent?.addEventListener("click", (event) => {
        event.stopPropagation();
        alert("Agentmodus wordt later toegevoegd.");
        closeAllDropdowns();
      });

      actionCanvas?.addEventListener("click", (event) => {
        event.stopPropagation();
        alert("Canvas wordt later toegevoegd.");
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
      const chatInput = document.querySelector(".chat-input textarea");
      const sendButton = document.querySelector(".chat-input button");
      const newChatButton = document.querySelector(".new-chat");
      const profileNameEl = document.getElementById("profile-name");
      const profileEmailEl = document.getElementById("profile-email");
      const profileInitialsEl = document.querySelector(".profile-avatar__initials");
      const profileNameEditBtn = document.querySelector(".profile-name-edit");

	      const SUPABASE_URL = "https://mengrlsqgshxqcxhirjn.supabase.co";
	      const SUPABASE_ANON_KEY = "sb_publishable_PeVTrMXz6UaeMhkPn5Fs-Q_xfJFVRNt";

	      const getSupabaseClient = () => {
	        if (window.mathijsSupabase) return window.mathijsSupabase;
	        if (!window.supabase || typeof window.supabase.createClient !== "function") {
	          return null;
	        }
	        const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
	          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
	        });
	        window.mathijsSupabase = client;
	        return client;
	      };

	      const supabaseClient = getSupabaseClient();
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

              const fileExt = (file.name.split(".").pop() || "jpg").toLowerCase();
              const safeExt = fileExt.replace(/[^a-z0-9]/g, "") || "jpg";
              const filePath = `avatars/${currentUser.id}-${Date.now()}.${safeExt}`;

              const uploadToBucket = async (bucketName) => {
                const { error: uploadError } = await supabaseClient.storage.from(bucketName).upload(filePath, file, {
                  cacheControl: "3600",
                  upsert: true,
                });
                if (uploadError) throw uploadError;
                const { data } = supabaseClient.storage.from(bucketName).getPublicUrl(filePath);
                if (!data?.publicUrl) throw new Error("Geen public URL ontvangen.");
                return data.publicUrl;
              };

              let publicUrl = null;
              try {
                publicUrl = await uploadToBucket("profile-images");
              } catch (firstError) {
                console.warn("Upload naar profile-images faalde, probeer avatars:", firstError?.message || firstError);
                publicUrl = await uploadToBucket("avatars");
              }

              const { error: updateError } = await supabaseClient.auth.updateUser({ data: { avatar_url: publicUrl } });
              if (updateError) throw updateError;

              const refreshed = await supabaseClient.auth.getUser();
              if (refreshed?.data?.user) {
                currentUser = refreshed.data.user;
              } else {
                currentUser.user_metadata = { ...(currentUser.user_metadata || {}), avatar_url: publicUrl };
              }
              await safeUpsertProfile({ avatar_url: publicUrl });
              updateProfileSidebar(currentUser);
              resetInput();
            } catch (error) {
              console.error("Profielfoto upload mislukt:", error);
              alert(
                "Profielfoto uploaden mislukt. Check of er een Supabase Storage bucket bestaat (bijv. 'profile-images' of 'avatars') en dat je sessie rechten heeft."
              );
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
      };
      const LEGACY_SESSION_ID = "__legacy_session__";

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
        const prefix = sanitized.includes("?") || questionWords.includes(words[0]) ? "vraag" : "chat";
        const snippet = words.slice(0, 5).join(" ");
        return `${prefix} ${snippet}`.trim();
      };

      const upsertSessionEntry = (session) => {
        const existingIndex = sessionState.list.findIndex((item) => item.id === session.id);
        if (existingIndex >= 0) {
          sessionState.list[existingIndex] = { ...sessionState.list[existingIndex], ...session };
        } else {
          sessionState.list.unshift(session);
        }
      };

      const renderSessionList = () => {
        if (!sessionListEl) return;
        sessionListEl.innerHTML = "";
        if (!sessionState.list.length) {
          if (sessionEmptyEl) {
            sessionEmptyEl.style.removeProperty("display");
          }
          return;
        }
        if (sessionEmptyEl) {
          sessionEmptyEl.style.display = "none";
        }
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

          selectBtn.addEventListener("click", async () => {
            await setActiveSession(session.id);
            closeAllMenus();
            if (chatInput) {
              chatInput.focus();
            }
          });

          actions.querySelector(".rename-session").addEventListener("click", (event) => {
            event.stopPropagation();
            actions.classList.remove("is-open");
            const newTitle = prompt("Nieuwe naam voor dit gesprek:", getDisplayTitle(session));
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
            const confirmDelete = confirm("Weet je zeker dat je dit gesprek wilt verwijderen?");
            if (!confirmDelete) return;
            await deleteSession(session.id, session.isLegacy);
          });

          actions.querySelector(".share-session").addEventListener("click", async (event) => {
            event.stopPropagation();
            actions.classList.remove("is-open");
            const shareText = `${window.location.origin}/chat.html?session=${session.id}`;
            try {
              await navigator.clipboard.writeText(shareText);
              alert("Link gekopieerd naar klembord.");
            } catch (e) {
              alert("Kon link niet kopiëren. Kopieer handmatig:\n" + shareText);
            }
          });

          actions.addEventListener("click", (event) => {
            event.stopPropagation();
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

	      const renderEmptySessionMessage = (message = "Nog geen gesprekken. Start je eerste chat.") => {
	        if (!sessionEmptyEl) return;
	        sessionEmptyEl.textContent = message;
	        sessionEmptyEl.style.removeProperty("display");
	        if (sessionListEl) {
	          sessionListEl.innerHTML = "";
	        }
	      };

      const SESSION_TITLE_KEY = "mathijs_session_titles_v1";
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
		        return session.title || "Chat";
		      };

      const createLocalSession = () => {
        const session = {
          id: generateSessionId(),
          title: generateDefaultSessionTitle(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          firstUserMessage: "",
          isLegacy: false,
        };
        upsertSessionEntry(session);
        sessionState.activeId = session.id;
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

		      const requireAccessToken = async () => {
		        if (!supabaseClient) {
		          window.location.href = "login.html";
		          return null;
		        }
		        const { data: sessionData } = await supabaseClient.auth.getSession();
		        const accessToken = sessionData?.session?.access_token;
		        if (!accessToken) {
		          window.location.href = "login.html";
		          return null;
	        }
	        return accessToken;
	      };

		      const apiFetchJson = async (url, { method = "GET", body } = {}) => {
		        const accessToken = await requireAccessToken();
		        if (!accessToken) return { ok: false, status: 401, payload: { error: "Unauthorized" } };
		        const resp = await fetch(url, {
	          method,
	          headers: {
	            "Content-Type": "application/json",
	            Authorization: `Bearer ${accessToken}`,
	          },
	          body: body ? JSON.stringify(body) : undefined,
	        });
		        const payload = await resp.json().catch(() => ({}));
		        return { ok: resp.ok, status: resp.status, payload };
		      };

		      const creditsBalanceEl = document.getElementById("credits-balance");
		      const creditsBalanceValueEl = document.getElementById("credits-balance-value");

		      const refreshCreditsBalance = async () => {
		        if (!creditsBalanceEl || !creditsBalanceValueEl) return;
		        try {
		          const { ok, payload } = await apiFetchJson("/api/billing/balance");
		          if (!ok) {
		            creditsBalanceValueEl.textContent = "--";
		            creditsBalanceEl.title = "Kan tokensaldo niet laden";
		            return;
		          }
		          const tokens = typeof payload?.tokens_available === "number" ? payload.tokens_available : null;
		          creditsBalanceValueEl.textContent = tokens !== null ? String(tokens) : "--";
		          creditsBalanceEl.title = "Je tokensaldo.";
		        } catch (e) {
		          creditsBalanceValueEl.textContent = "--";
		          creditsBalanceEl.title = "Kan tokensaldo niet laden";
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

	          const resp = await apiFetchJson("/api/messages/import-legacy", {
	            method: "POST",
	            body: { sessions },
	          });
	          if (!resp.ok) {
	            console.error("Legacy import failed", resp);
	            return false;
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
		          window.location.href = "login.html";
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

	      const saveMessageToApi = async (sessionId, role, content) => {
	        return await apiFetchJson("/api/messages/add", {
	          method: "POST",
	          body: { session_id: sessionId, role, message_text: content },
	        });
	      };

	      const deleteSession = async (sessionId, isLegacy) => {
	        const user = await requireAuthenticatedUser();
	        if (!user) return;
	        try {
	          const resp = await apiFetchJson("/api/messages/delete-session", {
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
        await refreshSessionsFromSupabase({ goToLatest: true });
        renderEmptyState();
      };

	      const refreshSessionsFromSupabase = async (options = {}) => {
	        const { goToLatest = false } = options;
	        const user = await requireAuthenticatedUser();
	        if (!user?.id) return;
	        try {
	          const { ok, payload } = await apiFetchJson("/api/messages/sessions");
	          if (!ok) {
	            throw new Error(payload?.error || "Kon sessies niet laden");
	          }

	          const data = payload?.sessions || [];
	          if (!Array.isArray(data) || !data.length) {
	            const imported = await tryImportLegacySessions(user.id);
	            if (imported) {
	              // Try again after import.
	              return await refreshSessionsFromSupabase(options);
	            }
	            sessionState.list = [];
	            sessionState.activeId = null;
	            sessionState.untitledCount = 0;
	            renderSessionList();
	            renderEmptySessionMessage("Geen gesprekken gevonden. Probeer opnieuw laden of herstel je geschiedenis.");
	            ensureSessionEmptyActions();
	            return;
	          }

		          const derivedSessions = data.map((session, index) => ({
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
          if (goToLatest || !sessionState.activeId || !hasActiveSession) {
            sessionState.activeId = derivedSessions[0] ? derivedSessions[0].id : null;
          }
	          renderSessionList();
	        } catch (error) {
	          console.error("Sessies ophalen mislukt", error);
	          renderSessionList();
	          renderEmptySessionMessage("Kon gesprekken niet laden. Probeer opnieuw laden.");
	          ensureSessionEmptyActions();
	        }
	      };

	      const loadMessagesForSession = async (sessionId) => {
	        const user = await requireAuthenticatedUser();
	        const activeSession = sessionState.list.find((session) => session.id === sessionId);
	        if (!user || !sessionId || !chatLog || !activeSession) {
	          renderEmptyState();
	          updateNewChatButtonState();
	          return;
	        }
	        chatLog.innerHTML = "";
	        messages = [createSystemMessage()];
	        try {
	          const qs = new URLSearchParams({ session_id: sessionId });
	          const { ok, payload } = await apiFetchJson(`/api/messages/session?${qs.toString()}`);
	          if (!ok) throw new Error(payload?.error || "Kon berichten niet laden");
	          const data = payload?.messages || [];

	          if (!Array.isArray(data) || !data.length) {
	            renderEmptyState();
	            return;
	          }

	          const history = [];
	          data.forEach((entry) => {
	            const normalizedRole = entry.role === "user" ? "user" : "assistant";
	            appendMessage(entry.message_text, normalizedRole, { persist: false });
	            history.push({ role: normalizedRole, content: entry.message_text });
	          });
		          messages = [createSystemMessage(), ...history];
		          updateNewChatButtonState();
		        } catch (error) {
		          console.error("Berichten ophalen mislukt", error);
	          appendMessage(
	            "Berichten konden niet geladen worden. Controleer je verbinding en probeer het opnieuw.",
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
          if (avatarUrl) {
            profileAvatarImage.src = avatarUrl;
            profileAvatar.classList.add("has-image");
          } else {
            profileAvatarImage.removeAttribute("src");
            profileAvatar.classList.remove("has-image");
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
	        if (!supabaseClient) {
	          console.error("Supabase client ontbreekt.");
	          renderEmptyState();
	          renderEmptySessionMessage("Inloggen is nodig om je chats te laden.");
	          ensureSessionEmptyActions();
	          window.location.href = "login.html";
	          return null;
	        }
	        if (currentUser) {
	          return currentUser;
	        }
	        try {
	          const { data, error } = await supabaseClient.auth.getUser();
	          if (error || !data?.user) {
	            console.error("Geen actieve gebruiker gevonden", error);
	            try {
	              await supabaseClient.auth.signOut();
	            } catch {
	              // ignore
	            }
	            window.location.href = "login.html";
	            return null;
	          }
	          currentUser = data.user;
	        } catch (error) {
	          console.error("Kon gebruiker niet ophalen", error);
	          try {
	            await supabaseClient.auth.signOut();
	          } catch {
	            // ignore
	          }
	          renderEmptyState();
	          renderEmptySessionMessage("Kon je login niet controleren. Probeer opnieuw in te loggen.");
	          ensureSessionEmptyActions();
	          window.location.href = "login.html";
	          return null;
	        }
	        titleOverrides = loadTitleOverrides(currentUser.id);
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
            window.location.href = "index.html";
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
        chatLog.scrollTop = chatLog.scrollHeight;
        thinkingIndicator = article;
      };

      const hideThinkingIndicator = () => {
        if (thinkingIndicator && thinkingIndicator.parentElement) {
          thinkingIndicator.parentElement.removeChild(thinkingIndicator);
        }
        thinkingIndicator = null;
      };

      const formatMessageContent = (text) => {
        if (!text) return "";
        const escapeHtml = (value) =>
          value
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
        const escaped = escapeHtml(text);
        const withHeadings = escaped
          .replace(/^###\s*(.+)$/gm, "<strong>$1</strong><br>")
          .replace(/^##\s*(.+)$/gm, "<strong>$1</strong><br>")
          .replace(/^#\s*(.+)$/gm, "<strong>$1</strong><br>");
        const withBold = withHeadings.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
        return withBold.replace(/\n/g, "<br>");
      };

	      const appendMessage = (content, role = "assistant", options = {}) => {
	        if (!chatLog || !content) return;
	        clearEmptyState();
	        const article = document.createElement("article");
	        article.className = "message " + (role === "user" ? "user" : "system");

        const bubble = document.createElement("div");
        bubble.className = "bubble";
        bubble.innerHTML = formatMessageContent(content);

        article.appendChild(bubble);
        chatLog.appendChild(article);
        chatLog.scrollTop = chatLog.scrollHeight;

        if (options.persist === false) {
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
        chatLog.scrollTop = chatLog.scrollHeight;
        return { article, bubble };
      };

		      const workspaceReady = (async () => {
		        try {
		          const user = await requireAuthenticatedUser();
		          if (!user) {
		            return null;
		          }
		          await refreshCreditsBalance();
		          await refreshSessionsFromSupabase({ goToLatest: true });
		          if (sessionState.activeId) {
		            await loadMessagesForSession(sessionState.activeId);
		          } else {
		            createLocalSession();
		          }
		          updateNewChatButtonState();
		          return user;
		        } catch (error) {
		          console.error("Workspace init failed", error);
		          renderEmptyState();
		          renderEmptySessionMessage("Kon gesprekken niet laden. Probeer opnieuw laden of log opnieuw in.");
		          ensureSessionEmptyActions();
		          return null;
		        }
		      })();

	      const sendMessage = async () => {
	        await workspaceReady;
	        if (!chatInput) return;
	        const value = chatInput.value.trim();
	        if (!value) return;

        if (selectedModel === "grok4") {
          alert("Grok 4 is nog niet gekoppeld. Kies ChatGPT 5.2 om verder te chatten.");
          console.log("Grok 4 chat is nog niet geïmplementeerd.");
          return;
        }
        if (selectedModel === "opus45") {
          alert("Opus 4.5 is nog niet gekoppeld. Kies ChatGPT 5.2 om verder te chatten.");
          console.log("Opus 4.5 chat is nog niet geïmplementeerd.");
          return;
        }
        if (selectedModel === "sonnet4") {
          alert("Sonnet 4 is nog niet gekoppeld. Kies ChatGPT 5.2 om verder te chatten.");
          console.log("Sonnet 4 chat is nog niet geïmplementeerd.");
          return;
        }
        if (selectedModel === "haiku45") {
          alert("Haiku 4.5 is nog niet gekoppeld. Kies ChatGPT 5.2 om verder te chatten.");
          console.log("Haiku 4.5 chat is nog niet geïmplementeerd.");
          return;
        }
        if (selectedModel === "llama4") {
          alert("Llama 4 is nog niet gekoppeld. Kies ChatGPT 5.2 om verder te chatten.");
          console.log("Llama 4 chat is nog niet geïmplementeerd.");
          return;
        }
        if (selectedModel === "qwen") {
          alert("QWEN is nog niet gekoppeld. Kies ChatGPT 5.2 om verder te chatten.");
          console.log("QWEN chat is nog niet geïmplementeerd.");
          return;
        }
        if (selectedModel === "gemini25pro") {
          alert("Gemini 2.5 Pro is nog niet gekoppeld. Kies GPT-5 om verder te chatten.");
          console.log("Gemini 2.5 Pro chat is nog niet geïmplementeerd.");
          return;
        }

        const user = await requireAuthenticatedUser();
        if (!user) {
          alert("Je moet ingelogd zijn om een bericht te sturen.");
          return;
        }
        const sessionId = ensureActiveSessionId();
        appendMessage(value, "user");
        chatInput.value = "";
        chatInput.focus();

	        try {
	          const save = await saveMessageToApi(sessionId, "user", value);
	          if (!save.ok) throw new Error(save?.payload?.error || "Opslaan mislukt");
	        } catch (error) {
	          console.error("Gebruikersbericht opslaan mislukt", error);
	          appendMessage("Je bericht kon niet opgeslagen worden. Probeer het opnieuw.", "assistant");
          await refreshSessionsFromSupabase();
          await loadMessagesForSession(sessionId);
          return;
        }

        showThinkingIndicator();

		        let assistantStreamMessage = null;
		        let assistantResponseBuffer = "";

			        try {
		          const engine = modelEngineMap[selectedModel] || "gpt-4o";
		          const accessToken = await requireAccessToken();
		          if (!accessToken) {
		            throw new Error("Je sessie is verlopen. Log opnieuw in.");
		          }
		          const response = await fetch("/api/chat", {
	            method: "POST",
	            headers: {
	              "Content-Type": "application/json",
	              Authorization: `Bearer ${accessToken}`,
	            },
            body: JSON.stringify({
              messages,
              webSearch: webSearchEnabled,
              model: engine,
              thinkingMode: selectedThinkingMode,
            }),
          });

		            if (!response.ok || !response.body) {
		            let errorMessage = "Er ging iets mis bij het ophalen van een antwoord.";
		            try {
		              const errorPayload = await response.json();
		              if (response.status === 402 && errorPayload?.topup_required) {
		                hideThinkingIndicator();
		                openTopupModal({
		                  message: errorPayload?.error || "Je tokens zijn op.",
		                  tokensAvailable:
		                    typeof errorPayload?.tokens_available === "number" ? errorPayload.tokens_available : null,
		                });
		                return;
		              }
		              if (errorPayload && errorPayload.error) {
		                errorMessage = errorPayload.error;
		              }
		            } catch (jsonError) {
	              try {
	                errorMessage = (await response.text()) || errorMessage;
	              } catch (textError) {
	                /* ignore */
	              }
	            }
	            errorMessage = String(errorMessage)
	              .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, "***REDACTED***")
	              .replace(/\b(?:sk_live|rk_live|whsec)_[A-Za-z0-9]{10,}\b/g, "***REDACTED***")
	              .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, "***REDACTED***");
	            if (response.status === 401) {
	              window.location.href = "login.html";
	            }
	            throw new Error(errorMessage);
	          }

          hideThinkingIndicator();
          assistantStreamMessage = createAssistantStreamMessage();
          const targetBubble = assistantStreamMessage?.bubble || null;
          const reader = response.body.getReader();
          const decoder = new TextDecoder();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunkText = decoder.decode(value, { stream: true });
            if (!chunkText) continue;
            assistantResponseBuffer += chunkText;
            if (targetBubble) {
              targetBubble.innerHTML = formatMessageContent(assistantResponseBuffer);
              chatLog.scrollTop = chatLog.scrollHeight;
            }
          }

          const finalContent =
            (assistantResponseBuffer || "").trim() || "Ik heb even geen antwoord. Probeer het later nog eens.";

          if (targetBubble) {
            targetBubble.innerHTML = formatMessageContent(finalContent);
          } else {
            appendMessage(finalContent, "assistant");
          }

	          messages.push({ role: "assistant", content: finalContent });
	          updateSessionMetaAfterMessage("assistant", finalContent);

	          const assistantSave = await saveMessageToApi(sessionId, "assistant", finalContent);
	          if (!assistantSave.ok) {
	            console.error("AI-antwoord opslaan mislukt", assistantSave?.payload?.error || assistantSave);
	          }
	          await refreshSessionsFromSupabase();
			        } catch (error) {
	          console.error("Chat request failed", error);
          console.error("Selected model:", selectedModel);
          console.error("Engine:", modelEngineMap[selectedModel] || "gpt-4o");
          console.error("Error details:", error.message, error.stack);
          const fallbackMessage = `De AI-request mislukte: ${error.message || "Onbekende fout"}. Controleer je verbinding en probeer opnieuw.`;
	          if (assistantStreamMessage?.bubble) {
	            assistantStreamMessage.bubble.innerHTML = formatMessageContent(fallbackMessage);
	          } else {
	            appendMessage(fallbackMessage, "assistant");
	          }
	        } finally {
	          hideThinkingIndicator();
	          await refreshCreditsBalance();
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
    
