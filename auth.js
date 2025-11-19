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
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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
        window.location.href = "dashboard.html?next=chat";
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

      if (password.length < 6) {
        setFeedback(feedbackEl, "Wachtwoord moet minimaal 6 tekens zijn.");
        return;
      }

      if (confirmInput && password !== confirmPassword) {
        setFeedback(feedbackEl, "Wachtwoorden komen niet overeen.");
        return;
      }

      console.log("Start signup flow");

      toggleButtonLoading(submitButton, true, "Account aanmaken...");
      try {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username: email,
            },
          },
        });

        if (error) {
          console.error("Registratie mislukt", error);
          setFeedback(feedbackEl, error.message || "Registratie mislukt, probeer het opnieuw.");
          return;
        }

        setFeedback(
          feedbackEl,
          "Account aangemaakt! Controleer je inbox voor bevestiging en log daarna in.",
          "success"
        );
        signupForm.reset();
      } catch (err) {
        console.error("Onverwachte fout tijdens signup", err);
        setFeedback(feedbackEl, "Er ging iets mis, probeer het opnieuw.");
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
