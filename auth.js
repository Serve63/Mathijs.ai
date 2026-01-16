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
  });
})();
