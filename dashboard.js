(() => {
  const STATUS_CLASSES = ["success", "error"];
  const AUTO_REDIRECT_DELAY = 1600;

  const redirectToLogin = () => {
    window.location.href = "login.html";
  };

  const redirectToWorkspace = () => {
    window.location.href = "chat.html";
  };

  const getActiveSession = async (supabase) => {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error("Fout bij ophalen van sessie", error);
        return null;
      }
      return data.session ?? null;
    } catch (err) {
      console.error("Onverwachte fout bij session check", err);
      return null;
    }
  };

  const setStatus = (statusEl, message = "", type = "error") => {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.remove(...STATUS_CLASSES);
    if (message) {
      statusEl.classList.add(type);
    }
  };

  const populateUser = (userEmailEl, user) => {
    if (!userEmailEl) return;
    userEmailEl.textContent = user?.email ?? "onbekend";
  };

  document.addEventListener("DOMContentLoaded", () => {
    const supabase = window.mathijsSupabase;
    if (!supabase) {
      console.error("Supabase client is niet beschikbaar.");
      return;
    }

    const userEmailEl = document.querySelector("#user-email");
    const logoutButton = document.querySelector("#logout-button");
    const statusEl = document.querySelector("#dashboard-status");
    const redirectNoteEl = document.querySelector("#dashboard-redirect-note");
    const workspaceButton = document.querySelector("#workspace-button");
    const params = new URLSearchParams(window.location.search);
    const nextPage = params.get("next");

    const guardRoute = async () => {
      const session = await getActiveSession(supabase);
      if (!session) {
        console.log("Geen geldige sessie, redirect naar login");
        redirectToLogin();
        return;
      }
      populateUser(userEmailEl, session.user);

      if (nextPage === "chat") {
        if (redirectNoteEl) {
          redirectNoteEl.textContent = "Je wordt zo doorgestuurd naar de AI-werkruimte...";
        }
        setTimeout(() => {
          redirectToWorkspace();
        }, AUTO_REDIRECT_DELAY);
      } else if (redirectNoteEl) {
        redirectNoteEl.textContent = "";
      }
    };

    const handleLogout = async () => {
      if (!logoutButton) return;
      setStatus(statusEl, "");
      logoutButton.disabled = true;
      logoutButton.textContent = "Bezig met uitloggen...";
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Uitloggen mislukt", error);
        setStatus(statusEl, error.message || "Uitloggen mislukt.", "error");
        logoutButton.disabled = false;
        logoutButton.textContent = "Uitloggen";
        return;
      }
      setStatus(statusEl, "Je bent uitgelogd, even geduld...", "success");
      redirectToLogin();
    };

    if (workspaceButton) {
      workspaceButton.addEventListener("click", redirectToWorkspace);
    }
    if (logoutButton) {
      logoutButton.addEventListener("click", handleLogout);
    }

    guardRoute();
  });
})();
