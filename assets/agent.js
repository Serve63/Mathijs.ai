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
    const modelNodes = Array.from(document.querySelectorAll(".agent-node[data-model]"));

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

  const insertInboxHtml = (title, htmlBody) => {
    if (!inbox) return null;
    const item = document.createElement("div");
    item.className = "agent-inbox__item";
    item.innerHTML = `
      <div class="agent-inbox__title">${escapeHtml(title)}</div>
      <div class="agent-inbox__body">${htmlBody}</div>
    `;
    inbox.prepend(item);
    return item;
  };

  const wrapText = (text, maxChars) => {
    const lines = [];
    const paragraphs = String(text || "").split(/\r?\n/);
    paragraphs.forEach((para) => {
      const words = para.trim().split(/\s+/).filter(Boolean);
      if (!words.length) {
        lines.push("");
        return;
      }
      let current = "";
      words.forEach((word) => {
        if (!current) {
          current = word;
          return;
        }
        if ((current + " " + word).length <= maxChars) {
          current += " " + word;
        } else {
          lines.push(current);
          current = word;
        }
      });
      if (current) lines.push(current);
    });
    return lines;
  };

  const pdfEscape = (value) =>
    String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");

  const buildPdfBlob = (text) => {
    const pageWidth = 612;
    const pageHeight = 792;
    const marginX = 56;
    const marginTop = 64;
    const marginBottom = 64;
    const lineHeight = 16;
    const fontSize = 12;
    const maxChars = 92;
    const lines = wrapText(text, maxChars);
    const linesPerPage = Math.max(1, Math.floor((pageHeight - marginTop - marginBottom) / lineHeight));
    const pages = [];
    for (let i = 0; i < lines.length; i += linesPerPage) {
      pages.push(lines.slice(i, i + linesPerPage));
    }

    const encoder = new TextEncoder();
    let output = "%PDF-1.4\n";
    const offsets = [0];

    const addObj = (id, body) => {
      offsets[id] = encoder.encode(output).length;
      output += `${id} 0 obj\n${body}\nendobj\n`;
    };

    const fontId = 3;
    const firstPageId = 4;
    const pageCount = pages.length;
    const totalObjects = 3 + pageCount * 2;

    addObj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    const kids = pages.map((_, idx) => `${firstPageId + idx * 2} 0 R`).join(" ");
    addObj(2, `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`);
    addObj(fontId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

    pages.forEach((pageLines, idx) => {
      const pageId = firstPageId + idx * 2;
      const contentId = pageId + 1;
      const contentLines = [];
      contentLines.push("BT");
      contentLines.push(`/F1 ${fontSize} Tf`);
      contentLines.push(`${lineHeight} TL`);
      contentLines.push(`${marginX} ${pageHeight - marginTop} Td`);
      pageLines.forEach((line) => {
        contentLines.push(`(${pdfEscape(line)}) Tj`);
        contentLines.push("T*");
      });
      contentLines.push("ET");
      const stream = contentLines.join("\n");
      addObj(
        pageId,
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`
      );
      addObj(contentId, `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`);
    });

    const xrefOffset = encoder.encode(output).length;
    output += `xref\n0 ${totalObjects + 1}\n`;
    output += "0000000000 65535 f \n";
    for (let i = 1; i <= totalObjects; i += 1) {
      const offset = offsets[i] || 0;
      output += `${String(offset).padStart(10, "0")} 00000 n \n`;
    }
    output += `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return new Blob([output], { type: "application/pdf" });
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

    const setModelState = (model, state) => {
      modelNodes
        .filter((node) => node.dataset.model === model)
        .forEach((node) => {
          node.classList.remove("is-active", "is-done");
          if (state === "active") node.classList.add("is-active");
          if (state === "done") node.classList.add("is-done");
        });
    };

    const resetModelStates = () => {
      modelNodes.forEach((node) => node.classList.remove("is-active", "is-done"));
    };

    if (form && input && inbox) {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const task = input.value.trim();
        if (!task) return;
        input.value = "";
        setLoading(true);
        resetModelStates();

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
            setModelState("openai", "active");
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
                setModelState("openai", "done");
              })
              .catch((err) => {
                resolveItem(openaiItem, "OpenAI fout", err.message || "OpenAI is niet beschikbaar.");
                setModelState("openai", "done");
              })
          );
        }
        if (geminiOk) {
          const geminiItem = createPendingItem("Gemini bezig", "Model analyseert je opdracht.");
          setModelState("gemini", "active");
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
                setModelState("gemini", "done");
              })
              .catch((err) => {
                resolveItem(geminiItem, "Gemini fout", err.message || "Gemini is niet beschikbaar.");
                setModelState("gemini", "done");
              })
          );
        }
          if (tasks.length) {
            await Promise.allSettled(tasks);
          }
          if (openaiOk && !insights.openai) {
            setModelState("openai", "done");
          }
          if (geminiOk && !insights.gemini) {
            setModelState("gemini", "done");
          }

        if (!insights.openai && !insights.gemini) {
          resolveItem(masterItem, "Geen modellen beschikbaar", "Koppel OpenAI of Gemini om te starten.");
          setLoading(false);
          return;
        }

          try {
            resolveItem(masterItem, "Mathijs verwerkt", "Inzichten worden samengevoegd tot document...");
            const doc = await buildFinalDocument({ task, insights });
            if (!doc) {
              insertInboxItem("Einddocument", "Geen resultaat ontvangen.");
            } else {
            const pdfBlob = buildPdfBlob(doc);
            const url = URL.createObjectURL(pdfBlob);
            const fileName = `Mathijs-document-${Date.now()}.pdf`;
            const linkHtml = `<a href="${url}" download="${fileName}">Download PDF</a>`;
            insertInboxHtml("Einddocument", linkHtml);
          }
        } catch (err) {
          resolveItem(masterItem, "Document fout", err.message || "Kon einddocument niet maken.");
        } finally {
          setLoading(false);
        }
      });
    }
  });
})();
