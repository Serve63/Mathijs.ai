(() => {
  const SUPABASE_URL = "https://mengrlsqgshxqcxhirjn.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_PeVTrMXz6UaeMhkPn5Fs-Q_xfJFVRNt";
  const ACTIVE_DAYS = 30;

  let staffMembers = [];
  let accessToken = null;
  let pendingDeleteId = null;

  const totalStaffEl = document.getElementById("stat-total-staff");
  const activeStaffEl = document.getElementById("stat-active-staff");
  const searchInput = document.getElementById("staff-search");
  const tableEl = document.getElementById("staff-table");
  const emptyEl = document.getElementById("staff-empty");

  const addToggleBtn = document.getElementById("staff-add-toggle");
  const addPanel = document.getElementById("staff-add-panel");
  const addForm = document.getElementById("staff-add-form");
  const addFeedback = document.getElementById("staff-add-feedback");
  const addEmailInput = document.getElementById("staff-add-email");
  const addNameInput = document.getElementById("staff-add-name");
  const addPasswordInput = document.getElementById("staff-add-password");
  const addCancelBtn = document.getElementById("staff-add-cancel");
  const addSubmitBtn = document.getElementById("staff-add-submit");

  const dateFmt = new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });

  const createSupabaseClient = () => {
    if (!window.supabase?.createClient) return null;
    if (window.mathijsSupabase) return window.mathijsSupabase;
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    window.mathijsSupabase = client;
    return client;
  };

  const parseDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  };

  const formatDate = (value) => {
    const date = parseDate(value);
    if (!date) return "-";
    return dateFmt.format(date);
  };

  const getDisplayName = (member) => {
    if (member?.name) return member.name;
    if (member?.email) return member.email.split("@")[0];
    return "Onbekend";
  };

  const getInitials = (name) => {
    if (!name) return "";
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  };

  const formatRole = (member) => {
    if (member?.is_allowlisted) return "Personeel (vast)";
    const role = String(member?.role || "staff").toLowerCase();
    return role === "staff" ? "Personeel" : role;
  };

  const isActiveStaff = (member) => {
    const lastSignIn = parseDate(member?.last_sign_in_at);
    if (!lastSignIn) return false;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - ACTIVE_DAYS);
    return lastSignIn >= cutoff;
  };

  const getStatusConfig = (member) => {
    const lastSignIn = parseDate(member?.last_sign_in_at);
    if (lastSignIn && isActiveStaff(member)) {
      return { label: "Actief", className: "active" };
    }
    if (lastSignIn) {
      return { label: "Inactief", className: "trial" };
    }
    return { label: "Nog niet ingelogd", className: "trial" };
  };

  const updateStats = () => {
    const activeCount = staffMembers.filter(isActiveStaff).length;
    if (totalStaffEl) totalStaffEl.textContent = String(staffMembers.length);
    if (activeStaffEl) activeStaffEl.textContent = String(activeCount);
  };

  const getFilteredStaff = () => {
    const query = searchInput ? searchInput.value.trim().toLowerCase() : "";
    if (!query) return staffMembers.slice();
    return staffMembers.filter((member) => {
      const haystack = `${getDisplayName(member)} ${member.email || ""} ${member.role || ""}`.toLowerCase();
      return haystack.includes(query);
    });
  };

  const renderTable = () => {
    if (!tableEl) return;
    const filtered = getFilteredStaff();

    if (!filtered.length) {
      tableEl.innerHTML = "";
      if (emptyEl) emptyEl.hidden = false;
      return;
    }

    if (emptyEl) emptyEl.hidden = true;

    tableEl.innerHTML = filtered
      .map((member) => {
        const name = getDisplayName(member);
        const status = getStatusConfig(member);
        const memberSince = formatDate(member.created_at);
        const lastLogin = member.last_sign_in_at ? formatDate(member.last_sign_in_at) : "-";
        const roleLabel = formatRole(member);
        const locked = Boolean(member.is_allowlisted);
        const isPendingDelete = pendingDeleteId === member.id;

        const actionsMarkup = isPendingDelete
          ? `
              <div class="delete-confirm">
                <span class="delete-confirm__text">Weet je zeker dat je deze medewerker wilt verwijderen?</span>
                <button class="btn tiny danger" data-action="confirm-delete">Verwijderen</button>
                <button class="btn tiny ghost" data-action="cancel-delete">Annuleren</button>
              </div>
            `
          : `
              <button class="btn tiny secondary" data-action="reset-password">Wachtwoord aanpassen</button>
              ${
                locked
                  ? "<button class=\"btn tiny ghost\" type=\"button\" disabled aria-disabled=\"true\">Vast personeel</button>"
                  : "<button class=\"btn tiny ghost\" data-action=\"delete\">Medewerker verwijderen</button>"
              }
            `;

        return `
          <div class="table-row" data-id="${member.id}">
            <div class="cell customer-cell" data-label="Medewerker">
              <div class="customer-avatar">${getInitials(name)}</div>
              <div>
                <p class="customer-name">${name}</p>
                <p class="customer-sub">
                  <span class="customer-subline">${member.email || "-"}</span>
                  <span class="customer-subline">Lid sinds ${memberSince}</span>
                  <span class="customer-subline">Laatste login ${lastLogin}</span>
                </p>
              </div>
            </div>
            <div class="cell" data-label="Rol">${roleLabel}</div>
            <div class="cell" data-label="Status"><span class="status ${status.className}">${status.label}</span></div>
            <div class="cell actions" data-label="Acties">
              ${actionsMarkup}
            </div>
          </div>
        `;
      })
      .join("");
  };

  const setActionLoading = (button, loading) => {
    if (!button) return;
    if (loading) {
      button.dataset.originalLabel = button.textContent;
      button.textContent = "Bezig...";
      button.disabled = true;
    } else {
      button.textContent = button.dataset.originalLabel || button.textContent;
      button.disabled = false;
    }
  };

  const setAddPanelOpen = (open) => {
    if (!addPanel) return;
    addPanel.hidden = !open;
    if (addToggleBtn) addToggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open && addEmailInput) addEmailInput.focus();
  };

  const setAddFeedback = (message, kind = "") => {
    if (!addFeedback) return;
    addFeedback.textContent = message || "";
    addFeedback.classList.remove("error", "success");
    if (kind) addFeedback.classList.add(kind);
  };

  const resetAddForm = () => {
    if (addForm) addForm.reset();
    setAddFeedback("");
  };

  const fetchStaff = async () => {
    const resp = await fetch("/api/staff/team", {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(payload?.error || "Personeel ophalen mislukt.");
    }
    return Array.isArray(payload?.staff) ? payload.staff : [];
  };

  const ensureStaff = async (supabase) => {
    const { data } = await supabase.auth.getSession();
    accessToken = data?.session?.access_token || null;
    if (!accessToken) return false;
    const resp = await fetch("/api/staff/me", {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok || !payload?.staff) {
      await supabase.auth.signOut();
      return false;
    }
    return true;
  };

  const handleTableAction = async (event) => {
    const button = event.target.closest("button");
    if (!button || button.disabled) return;
    const row = button.closest(".table-row");
    if (!row) return;
    const id = row.dataset.id;
    const index = staffMembers.findIndex((member) => member.id === id);
    if (index === -1) return;

    const action = button.dataset.action;
    if (action === "delete") {
      pendingDeleteId = id;
      renderTable();
      return;
    }
    if (action === "cancel-delete") {
      if (pendingDeleteId === id) pendingDeleteId = null;
      renderTable();
      return;
    }

    setActionLoading(button, true);
    try {
      if (action === "confirm-delete") {
        const resp = await fetch("/api/staff/team", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ action: "remove_staff", id }),
        });
        const payload = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(payload?.error || "Verwijderen mislukt.");
        pendingDeleteId = null;
        staffMembers.splice(index, 1);
        updateStats();
        renderTable();
        return;
      }

      if (action === "reset-password") {
        const prompt = window.siteUI?.prompt;
        if (!prompt) {
          throw new Error("Wachtwoord aanpassen is niet beschikbaar.");
        }
        const newPassword = await prompt(
          "Vul een nieuw wachtwoord in voor deze medewerker.",
          {
            title: "Wachtwoord aanpassen",
            placeholder: "Nieuw wachtwoord",
            confirmText: "Opslaan",
            inputType: "password",
          }
        );
        if (newPassword === null) return;
        const trimmed = newPassword.trim();
        if (trimmed.length < 10) {
          throw new Error("Wachtwoord moet minimaal 10 tekens zijn.");
        }

        const resp = await fetch("/api/staff/team", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ action: "update_password", id, password: trimmed }),
        });
        const payload = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(payload?.error || "Wachtwoord aanpassen mislukt.");
        if (window.siteUI?.toast) {
          window.siteUI.toast("Wachtwoord aangepast.", { type: "success" });
        }
        return;
      }
    } catch (err) {
      console.error("Personeel actie mislukt", err);
      alert(err?.message || "Actie mislukt.");
    } finally {
      setActionLoading(button, false);
    }
  };

  const handleAddSubmit = async (event) => {
    event.preventDefault();
    if (!accessToken) {
      setAddFeedback("Sessie verlopen. Ververs de pagina.", "error");
      return;
    }
    const email = (addEmailInput?.value || "").trim();
    const name = (addNameInput?.value || "").trim();
    const password = (addPasswordInput?.value || "").trim();

    if (!email) {
      setAddFeedback("E-mailadres is verplicht.", "error");
      addEmailInput?.focus();
      return;
    }
    if (!password) {
      setAddFeedback("Wachtwoord is verplicht.", "error");
      addPasswordInput?.focus();
      return;
    }
    if (password.length < 10) {
      setAddFeedback("Wachtwoord moet minimaal 10 tekens zijn.", "error");
      addPasswordInput?.focus();
      return;
    }

    if (addSubmitBtn) {
      addSubmitBtn.disabled = true;
      addSubmitBtn.textContent = "Toevoegen...";
    }

    try {
      const resp = await fetch("/api/staff/team", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action: "create_staff",
          email,
          name,
          password,
        }),
      });
      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(payload?.error || "Medewerker toevoegen mislukt.");

      setAddFeedback("Medewerker toegevoegd.", "success");
      const list = await fetchStaff();
      staffMembers = list.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
      updateStats();
      renderTable();
      resetAddForm();
      setAddPanelOpen(false);
    } catch (err) {
      console.error("Medewerker toevoegen mislukt", err);
      setAddFeedback(err?.message || "Medewerker toevoegen mislukt.", "error");
    } finally {
      if (addSubmitBtn) {
        addSubmitBtn.disabled = false;
        addSubmitBtn.textContent = "Medewerker toevoegen";
      }
    }
  };

  const init = async () => {
    const supabase = createSupabaseClient();
    if (!supabase) return;

    const ok = await ensureStaff(supabase);
    if (!ok) {
      window.location.href = "/staff-login";
      return;
    }

    try {
      const list = await fetchStaff();
      staffMembers = list.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
      updateStats();
      renderTable();
    } catch (err) {
      console.error("Personeel laden mislukt", err);
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent = err?.message || "Personeel laden mislukt.";
      }
    }
  };

  if (searchInput) {
    searchInput.addEventListener("input", renderTable);
  }
  if (tableEl) {
    tableEl.addEventListener("click", handleTableAction);
  }
  if (addToggleBtn) {
    addToggleBtn.addEventListener("click", () => {
      const isOpen = addPanel ? !addPanel.hidden : false;
      if (!isOpen) {
        resetAddForm();
      }
      setAddPanelOpen(!isOpen);
    });
  }
  if (addCancelBtn) {
    addCancelBtn.addEventListener("click", () => {
      resetAddForm();
      setAddPanelOpen(false);
    });
  }
  if (addForm) {
    addForm.addEventListener("submit", handleAddSubmit);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
