(() => {
  const SUPABASE_URL = "https://mengrlsqgshxqcxhirjn.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_PeVTrMXz6UaeMhkPn5Fs-Q_xfJFVRNt";

  const setFeedback = (el, msg = "", type = "error") => {
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("error", "success");
    if (msg) el.classList.add(type);
  };

  const init = async () => {
    const form = document.getElementById("staff-login-form");
    const emailEl = document.getElementById("staff-email");
    const passEl = document.getElementById("staff-password");
    const feedbackEl = document.getElementById("staff-login-feedback");
    const btn = document.getElementById("staff-login-btn");

    if (!form || !window.supabase?.createClient) return;
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      setFeedback(feedbackEl, "");

      const email = emailEl?.value?.trim();
      const password = passEl?.value?.trim();
      if (!email || !password) {
        setFeedback(feedbackEl, "Vul je e-mail en wachtwoord in.");
        return;
      }

      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = "Bezig met inloggen...";

      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setFeedback(feedbackEl, error.message || "Inloggen mislukt.");
          return;
        }

        const token = data?.session?.access_token;
        if (!token) {
          await supabase.auth.signOut();
          setFeedback(feedbackEl, "Inloggen gelukt, maar je sessie ontbreekt. Probeer opnieuw.", "error");
          return;
        }

        const verifyResp = await fetch("/api/staff/me", {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });
        const verifyPayload = await verifyResp.json().catch(() => ({}));
        if (!verifyResp.ok || !verifyPayload?.staff) {
          await supabase.auth.signOut();
          setFeedback(feedbackEl, "Geen toegang: alleen personeel.", "error");
          return;
        }

        setFeedback(feedbackEl, "Inloggen gelukt. Doorsturen...", "success");
        window.location.href = "/staff-dashboard";
      } catch (err) {
        console.error(err);
        setFeedback(feedbackEl, "Er ging iets mis. Probeer het opnieuw.");
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    });
  };

  document.addEventListener("DOMContentLoaded", init);
})();
