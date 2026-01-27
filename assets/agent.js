(() => {
  const onReady = (fn) => {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  };

  onReady(() => {
    const form = document.getElementById("agent-form");
    const input = document.getElementById("agent-input");
    const inbox = document.getElementById("agent-inbox");
    const submitBtn = document.getElementById("agent-submit");

    const escapeHtml = (value) =>
      String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const getSupabaseClient = () => {
      if (window.mathijsSupabase) return window.mathijsSupabase;
      if (!window.supabase || !window.supabase.createClient) return null;
      const SUPABASE_URL = "https://mengrlsqgshxqcxhirjn.supabase.co";
      const SUPABASE_ANON_KEY = "sb_publishable_PeVTrMXz6UaeMhkPn5Fs-Q_xfJFVRNt";
      const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      });
      window.mathijsSupabase = client;
      return client;
    };

    const getAccessToken = async () => {
      const supabase = getSupabaseClient();
      if (!supabase) return null;
      const { data } = await supabase.auth.getSession();
      return data?.session?.access_token || null;
    };

    const apiFetchJson = async (url, { method = "POST", body } = {}) => {
      const token = await getAccessToken();
      if (!token) {
        window.location.href = "/login";
        return { ok: false, status: 401, payload: { error: "Unauthorized" } };
      }
      const resp = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = await resp.json().catch(() => ({}));
      return { ok: resp.ok, status: resp.status, payload };
    };

    const runModel = async ({ provider, model, task, roleLabel }) => {
      const messages = [
        {
          role: "developer",
          content:
            `Je bent ${roleLabel}. Geef beknopte inzichten voor de opdracht. ` +
            "Antwoord in het Nederlands met maximaal 6 bullets, geen lange uitleg.",
        },
        { role: "user", content: task },
      ];
      const resp = await apiFetchJson("/api/chat", {
        method: "POST",
        body: {
          provider,
          model,
          model_key: provider === "openai" ? "chatgpt52" : "gemini3",
          model_label: provider === "openai" ? "GPT-5 mini" : "Gemini 3",
          messages,
        },
      });
      if (!resp.ok) {
        const error = resp.payload?.error || "Model call mislukt.";
        throw new Error(error);
      }
      return resp.payload?.text || "";
    };

    const buildFinalDocument = async ({ task, insights }) => {
      const provider = insights.openai ? "openai" : "gemini";
      const model = provider === "openai" ? "gpt-4o-mini" : "gemini-1.5-flash";
      const content = [
        "Opdracht:",
        task,
        "",
        "Inzichten van modellen:",
        insights.openai ? `OpenAI:\n${insights.openai}` : "",
        insights.gemini ? `Gemini:\n${insights.gemini}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      const messages = [
        {
          role: "developer",
          content:
            "Je bent Mathijs (ChatGPT). Combineer alle inzichten tot één professioneel document. " +
            "Gebruik duidelijke koppen en bullets. Taal: Nederlands.",
        },
        { role: "user", content },
      ];
      const resp = await apiFetchJson("/api/chat", {
        method: "POST",
        body: {
          provider,
          model,
          model_key: provider === "openai" ? "chatgpt52" : "gemini3",
          model_label: provider === "openai" ? "GPT-5 mini" : "Gemini 3",
          messages,
        },
      });
      if (!resp.ok) {
        const error = resp.payload?.error || "Document genereren mislukt.";
        throw new Error(error);
      }
      return resp.payload?.text || "";
    };

    const insertInboxItem = (title, body) => {
      if (!inbox) return null;
      const item = document.createElement("div");
      item.className = "agent-inbox__item";
      const formattedBody = escapeHtml(body).replace(/\n/g, "<br>");
      item.innerHTML = `
        <div class="agent-inbox__title">${escapeHtml(title)}</div>
        <div class="agent-inbox__body">${formattedBody}</div>
      `;
      inbox.prepend(item);
      return item;
    };

    const createPendingItem = (title, body) => {
      if (!inbox) return null;
      const item = document.createElement("div");
      item.className = "agent-inbox__item agent-inbox__item--pending";
      const formattedBody = escapeHtml(body).replace(/\n/g, "<br>");
      item.innerHTML = `
        <div class="agent-inbox__title">
          <span class="agent-spinner" aria-hidden="true"></span>
          ${escapeHtml(title)}
        </div>
        <div class="agent-inbox__body">${formattedBody}</div>
      `;
      inbox.prepend(item);
      return item;
    };

    const resolveItem = (item, title, body) => {
      if (!item) return;
      item.classList.remove("agent-inbox__item--pending");
      const formattedBody = escapeHtml(body).replace(/\n/g, "<br>");
      item.innerHTML = `
        <div class="agent-inbox__title">${escapeHtml(title)}</div>
        <div class="agent-inbox__body">${formattedBody}</div>
      `;
    };

    const setLoading = (isLoading) => {
      if (!submitBtn) return;
      submitBtn.disabled = isLoading;
      submitBtn.textContent = isLoading ? "Bezig..." : "Start";
    };

    if (form && input && inbox) {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const task = input.value.trim();
        if (!task) return;
        input.value = "";
        setLoading(true);

        const masterItem = createPendingItem(
          "Mathijs is gestart",
          "Opdracht ontvangen. Modellen worden aangestuurd..."
        );

        let openaiOk = false;
        let geminiOk = false;
        try {
          const status = await apiFetchJson("/api/provider-status", { method: "GET" });
          if (status.ok) {
            openaiOk = status.payload?.openai === true;
            geminiOk = status.payload?.gemini === true;
          }
        } catch {
          // ignore
        }

        const insights = { openai: null, gemini: null };
        const tasks = [];
        if (openaiOk) {
          const openaiItem = createPendingItem("OpenAI bezig", "Model analyseert je opdracht.");
          tasks.push(
            runModel({
              provider: "openai",
              model: "gpt-4o-mini",
              task,
              roleLabel: "OpenAI specialist",
            })
              .then((text) => {
                insights.openai = text;
                resolveItem(openaiItem, "OpenAI afgerond", "Inzichten ontvangen.");
              })
              .catch((err) => {
                resolveItem(openaiItem, "OpenAI fout", err.message || "OpenAI is niet beschikbaar.");
              })
          );
        }
        if (geminiOk) {
          const geminiItem = createPendingItem("Gemini bezig", "Model analyseert je opdracht.");
          tasks.push(
            runModel({
              provider: "gemini",
              model: "gemini-1.5-flash",
              task,
              roleLabel: "Gemini specialist",
            })
              .then((text) => {
                insights.gemini = text;
                resolveItem(geminiItem, "Gemini afgerond", "Inzichten ontvangen.");
              })
              .catch((err) => {
                resolveItem(geminiItem, "Gemini fout", err.message || "Gemini is niet beschikbaar.");
              })
          );
        }
        if (tasks.length) {
          await Promise.allSettled(tasks);
        }

        if (!insights.openai && !insights.gemini) {
          resolveItem(masterItem, "Geen modellen beschikbaar", "Koppel OpenAI of Gemini om te starten.");
          setLoading(false);
          return;
        }

        try {
          resolveItem(masterItem, "Mathijs verwerkt", "Inzichten worden samengevoegd tot document...");
          const doc = await buildFinalDocument({ task, insights });
          insertInboxItem("Einddocument", doc || "Geen resultaat ontvangen.");
        } catch (err) {
          resolveItem(masterItem, "Document fout", err.message || "Kon einddocument niet maken.");
        } finally {
          setLoading(false);
        }
      });
    }
  });
})();
