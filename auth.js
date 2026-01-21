(() => {
  const SUPABASE_URL = "https://mengrlsqgshxqcxhirjn.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_PeVTrMXz6UaeMhkPn5Fs-Q_xfJFVRNt";

	  const initializeClient = () => {
	    if (window.mathijsSupabase) {
	      return window.mathijsSupabase;
	    }
    if (!window.supabase || !window.supabase.createClient) {
      console.error("Supabase library is niet geladen.");
      return null;
    }
	    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
	      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
	    });
	    window.mathijsSupabase = client;
	    return client;
	  };

  const supabase = initializeClient();

  const FEEDBACK_CLASSES = ["error", "success"];

  const setFeedback = (element, message = "", type = "error") => {
    if (!element) return;
    element.textContent = message;
    element.classList.remove(...FEEDBACK_CLASSES);
    if (message) {
      element.classList.add(type);
    }
  };

  const updateAuthHeadline = (config) => {
    if (!config) return;
    const eyebrowEl = document.querySelector("#auth-eyebrow");
    const titleEl = document.querySelector("#auth-title");
    const subtitleEl = document.querySelector("#auth-subtitle");
    if (eyebrowEl) eyebrowEl.textContent = config.eyebrow || "";
    if (titleEl) titleEl.textContent = config.title || "";
    if (subtitleEl) {
      const subtitle = config.subtitle || "";
      subtitleEl.textContent = subtitle;
      subtitleEl.hidden = !subtitle;
    }
  };

  const toggleButtonLoading = (button, isLoading, loadingLabel) => {
    if (!button) return;
    if (isLoading) {
      button.dataset.originalLabel = button.textContent;
      button.textContent = loadingLabel;
      button.disabled = true;
    } else {
      if (button.dataset.originalLabel) {
        button.textContent = button.dataset.originalLabel;
        delete button.dataset.originalLabel;
      }
      button.disabled = false;
    }
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const formatLoginError = (error) => {
    const message = String(error?.message || "").trim();
    if (!message) return "Probeer opnieuw via de login pagina.";
    if (/email not confirmed/i.test(message)) {
      return "Bevestig je e-mail om in te loggen.";
    }
    if (/invalid login credentials/i.test(message)) {
      return "Controleer je e-mailadres en wachtwoord via de login pagina.";
    }
    if (/rate limit|too many requests/i.test(message)) {
      return "Te veel pogingen. Wacht even en probeer opnieuw.";
    }
    return `Melding: ${message}`;
  };

  const signInWithRetry = async (email, password, attempts = 2) => {
    let lastError = null;
    for (let i = 0; i < attempts; i += 1) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (!error) return null;
      lastError = error;
      await sleep(400 * (i + 1));
    }
    return lastError;
  };

  const updateUserLocation = async () => {
    if (!supabase) return;
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) return;
      await fetch("/api/auth/update-location", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.warn("Locatie bijwerken mislukt", err);
    }
  };

  const initLogin = () => {
    const loginForm = document.querySelector("#login-form");
    if (!loginForm || !supabase) return;

    const emailInput = loginForm.querySelector("#login-email");
    const passwordInput = loginForm.querySelector("#login-password");
    const feedbackEl = document.querySelector("#login-feedback");
    const submitButton = loginForm.querySelector('button[type="submit"]');

    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setFeedback(feedbackEl, "");

      const email = emailInput?.value.trim();
      const password = passwordInput?.value.trim();

      if (!email || !password) {
        setFeedback(feedbackEl, "Vul je e-mailadres en wachtwoord in.");
        return;
      }

      console.log("Start login flow");

      toggleButtonLoading(submitButton, true, "Bezig met inloggen...");
      try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          console.error("Login mislukt", error);
          setFeedback(feedbackEl, error.message || "Onjuiste combinatie van e-mail en wachtwoord.");
          return;
        }
        setFeedback(feedbackEl, "Inloggen gelukt, je wordt doorgestuurd...", "success");
        await updateUserLocation();
        window.location.href = "/course";
      } catch (err) {
        console.error("Onverwachte fout tijdens login", err);
        setFeedback(feedbackEl, "Er ging iets mis, probeer het opnieuw.");
      } finally {
        toggleButtonLoading(submitButton, false);
      }
    });
  };

  const initPasswordReset = () => {
    const loginPane = document.querySelector("#login-pane");
    const resetRequestPane = document.querySelector("#reset-request-pane");
    const resetPane = document.querySelector("#reset-pane");
    if (!loginPane || !resetRequestPane || !resetPane || !supabase) return;

    const forgotLink = document.querySelector("#forgot-link");
    const backToLoginRequest = document.querySelector("#back-to-login-request");
    const backToLoginReset = document.querySelector("#back-to-login-reset");
    const resetRequestForm = document.querySelector("#reset-request-form");
    const resetEmailInput = document.querySelector("#reset-email");
    const resetRequestFeedback = document.querySelector("#reset-request-feedback");
    const resetRequestButton = document.querySelector("#reset-request-button");
    const resetForm = document.querySelector("#reset-form");
    const resetPasswordInput = document.querySelector("#reset-password");
    const resetConfirmInput = document.querySelector("#reset-confirm");
    const resetFeedback = document.querySelector("#reset-feedback");
    const resetSaveButton = document.querySelector("#reset-save-button");
    const loginEmailInput = document.querySelector("#login-email");
    const loginFeedback = document.querySelector("#login-feedback");

    const HEADLINES = {
      login: {
        eyebrow: "Welkom terug",
        title: "Log in op Mathijs.ai",
        subtitle: "",
      },
      request: {
        eyebrow: "Wachtwoord vergeten",
        title: "Vraag een reset link aan",
        subtitle: "We sturen je per e-mail een link om je wachtwoord te resetten.",
      },
      reset: {
        eyebrow: "Nieuw wachtwoord",
        title: "Stel een nieuw wachtwoord in",
        subtitle: "Kies een sterk wachtwoord van minimaal 10 tekens.",
      },
    };

    const setView = (view) => {
      loginPane.hidden = view !== "login";
      resetRequestPane.hidden = view !== "request";
      resetPane.hidden = view !== "reset";
      updateAuthHeadline(HEADLINES[view] || HEADLINES.login);
      if (view === "login") {
        setFeedback(resetRequestFeedback, "");
        setFeedback(resetFeedback, "");
      }
      if (view === "request") {
        setFeedback(loginFeedback, "");
        setFeedback(resetFeedback, "");
      }
      if (view === "reset") {
        setFeedback(loginFeedback, "");
        setFeedback(resetRequestFeedback, "");
      }
    };

    const clearHash = () => {
      const cleanUrl = `${window.location.pathname}${window.location.search}`;
      window.history.replaceState({}, document.title, cleanUrl);
    };

    const handleRecoveryLink = async () => {
      if (!window.location.hash) return;
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      if (params.get("type") !== "recovery") return;
      setView("reset");
      let error = null;
      if (typeof supabase.auth.getSessionFromUrl === "function") {
        const resp = await supabase.auth.getSessionFromUrl({ storeSession: true });
        error = resp?.error || null;
      } else {
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        if (accessToken && refreshToken && typeof supabase.auth.setSession === "function") {
          const resp = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          error = resp?.error || null;
        } else {
          error = new Error("Herstellink is ongeldig of verlopen.");
        }
      }
      clearHash();
      if (error) {
        setView("request");
        setFeedback(resetRequestFeedback, "Herstellink ongeldig of verlopen. Vraag een nieuwe link aan.");
      }
    };

    forgotLink?.addEventListener("click", () => {
      setView("request");
      const email = loginEmailInput?.value?.trim();
      if (email && resetEmailInput) resetEmailInput.value = email;
      resetEmailInput?.focus();
    });

    backToLoginRequest?.addEventListener("click", () => {
      setView("login");
    });

    backToLoginReset?.addEventListener("click", () => {
      setView("login");
    });

    resetRequestForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      setFeedback(resetRequestFeedback, "");
      const email = resetEmailInput?.value?.trim();
      if (!email) {
        setFeedback(resetRequestFeedback, "Vul je e-mailadres in.");
        return;
      }
      toggleButtonLoading(resetRequestButton, true, "Link versturen...");
      try {
        const redirectTo = `${window.location.origin}/login`;
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) {
          setFeedback(resetRequestFeedback, error.message || "Kon reset link niet sturen.");
          return;
        }
        setFeedback(resetRequestFeedback, "Check je e-mail voor de reset link.", "success");
      } catch (err) {
        console.error("Reset link versturen mislukt", err);
        setFeedback(resetRequestFeedback, "Er ging iets mis, probeer opnieuw.");
      } finally {
        toggleButtonLoading(resetRequestButton, false);
      }
    });

    resetForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      setFeedback(resetFeedback, "");
      const password = resetPasswordInput?.value?.trim() || "";
      const confirm = resetConfirmInput?.value?.trim() || "";
      if (!password || !confirm) {
        setFeedback(resetFeedback, "Vul beide wachtwoordvelden in.");
        return;
      }
      if (password.length < 10) {
        setFeedback(resetFeedback, "Wachtwoord moet minimaal 10 tekens zijn.");
        return;
      }
      if (password !== confirm) {
        setFeedback(resetFeedback, "Wachtwoorden komen niet overeen.");
        return;
      }
      toggleButtonLoading(resetSaveButton, true, "Opslaan...");
      try {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) {
          setFeedback(resetFeedback, error.message || "Wachtwoord bijwerken mislukt.");
          return;
        }
        await supabase.auth.signOut();
        setView("login");
        setFeedback(loginFeedback, "Wachtwoord aangepast. Log opnieuw in.", "success");
      } catch (err) {
        console.error("Wachtwoord reset mislukt", err);
        setFeedback(resetFeedback, "Er ging iets mis, probeer opnieuw.");
      } finally {
        toggleButtonLoading(resetSaveButton, false);
      }
    });

    handleRecoveryLink();
  };

  const initSignup = () => {
    const signupForm = document.querySelector("#signup-form");
    if (!signupForm || !supabase) return;

    const emailInput = signupForm.querySelector("#signup-email");
    const passwordInput = signupForm.querySelector("#signup-password");
    const confirmInput = signupForm.querySelector("#signup-confirm");
    const feedbackEl = document.querySelector("#signup-feedback");
    const submitButton = signupForm.querySelector('button[type="submit"]');
    const upsertProfile = async (userId, email) => {
      try {
        const { error } = await supabase
          .from("profiles")
          .upsert({ id: userId, email, plan: "free", updated_at: new Date().toISOString() }, { onConflict: "id" });
        if (error) {
          console.warn("Profile upsert warning", error);
        }
      } catch (err) {
        console.warn("Profile upsert failed (ignored)", err);
      }
    };

    signupForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setFeedback(feedbackEl, "");

      const email = emailInput?.value.trim();
      const password = passwordInput?.value.trim();
      const confirmPassword = confirmInput?.value.trim();

      if (!email || !password) {
        setFeedback(feedbackEl, "Vul alle velden in.");
        return;
      }

      if (password.length < 10) {
        setFeedback(feedbackEl, "Wachtwoord moet minimaal 10 tekens zijn.");
        return;
      }

      if (confirmInput && password !== confirmPassword) {
        setFeedback(feedbackEl, "Wachtwoorden komen niet overeen.");
        return;
      }

      console.log("Start signup flow");

      toggleButtonLoading(submitButton, true, "Account aanmaken...");
      try {
        const honeypot = signupForm.querySelector('input[name="company_website"]')?.value || "";
        // Create user server-side as confirmed, so signup doesn't depend on email delivery.
        const adminSignupResp = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, company_website: honeypot }),
        });
        const adminSignupPayload = await adminSignupResp.json().catch(() => ({}));
        if (!adminSignupResp.ok) {
          const msg = adminSignupPayload?.error || `Registratie mislukt (${adminSignupResp.status}).`;
          const canFallback =
            adminSignupResp.status === 401 ||
            /service role key|invalid api key/i.test(msg || "");
          if (!canFallback) {
            throw new Error(msg);
          }

          // Fallback: client-side signup (works if email confirmations are disabled).
          const { data: signupData, error: signupError } = await supabase.auth.signUp({ email, password });
          if (signupError) {
            throw new Error(signupError.message || "Registratie mislukt.");
          }
          if (!signupData?.session) {
            setFeedback(
              feedbackEl,
              "Account aangemaakt. Bevestig je e-mail om in te loggen.",
              "success"
            );
            signupForm.reset();
            return;
          }
        }

        // Direct inloggen zodat de gebruiker meteen kan starten.
        const loginError = await signInWithRetry(email, password);
        if (loginError) {
          console.error("Auto-login na signup mislukt", loginError);
          const detail = formatLoginError(loginError);
          setFeedback(
            feedbackEl,
            `Account aangemaakt, maar inloggen lukt nu niet. ${detail}`,
            "success"
          );
          signupForm.reset();
          return;
        }

        const { data: userData } = await supabase.auth.getUser();
        const userId = userData?.user?.id;
        if (userId) {
          await upsertProfile(userId, email);
        }
        await updateUserLocation();

        setFeedback(feedbackEl, "Account aangemaakt! Je wordt doorgestuurd...", "success");
        signupForm.reset();
        window.location.href = "/subscribe";
      } catch (err) {
        console.error("Onverwachte fout tijdens signup", err);
        setFeedback(feedbackEl, err?.message || "Er ging iets mis, probeer het opnieuw.");
      } finally {
        toggleButtonLoading(submitButton, false);
      }
    });
  };

  document.addEventListener("DOMContentLoaded", () => {
    initLogin();
    initSignup();
    initPasswordReset();
  });
})();
