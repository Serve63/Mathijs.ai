(() => {
  const ensureToastContainer = () => {
    let container = document.querySelector(".ui-toast-container");
    if (!container) {
      container = document.createElement("div");
      container.className = "ui-toast-container";
      document.body.appendChild(container);
    }
    return container;
  };

  const toast = (message, { type = "", duration = 2600 } = {}) => {
    const container = ensureToastContainer();
    const toastEl = document.createElement("div");
    toastEl.className = `ui-toast${type ? ` ${type}` : ""}`;
    toastEl.textContent = String(message || "");
    container.appendChild(toastEl);
    const remove = () => {
      toastEl.remove();
      if (!container.childElementCount) container.remove();
    };
    setTimeout(remove, duration);
    return remove;
  };

  const buildModal = ({ title, message, input, confirmText, cancelText, danger }) =>
    new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "ui-modal-overlay";
      const modal = document.createElement("div");
      modal.className = "ui-modal";

      const titleEl = document.createElement("h3");
      titleEl.className = "ui-modal__title";
      titleEl.textContent = title || "Bevestiging";
      modal.appendChild(titleEl);

      const messageEl = document.createElement("p");
      messageEl.className = "ui-modal__message";
      messageEl.textContent = message || "";
      modal.appendChild(messageEl);

      let inputEl = null;
      if (input) {
        inputEl = document.createElement("input");
        inputEl.className = "ui-modal__input";
        inputEl.type = input.type || "text";
        inputEl.value = input.value || "";
        if (input.placeholder) inputEl.placeholder = input.placeholder;
        modal.appendChild(inputEl);
      }

      const actions = document.createElement("div");
      actions.className = "ui-modal__actions";

      const showCancel = cancelText !== null && cancelText !== undefined && cancelText !== "";
      let cancelBtn = null;
      if (showCancel) {
        cancelBtn = document.createElement("button");
        cancelBtn.className = "ui-modal__btn ghost";
        cancelBtn.type = "button";
        cancelBtn.textContent = cancelText || "Annuleren";
      }

      const confirmBtn = document.createElement("button");
      confirmBtn.className = `ui-modal__btn ${danger ? "danger" : "primary"}`;
      confirmBtn.type = "button";
      confirmBtn.textContent = confirmText || "Ok";

      if (cancelBtn) actions.appendChild(cancelBtn);
      actions.appendChild(confirmBtn);
      modal.appendChild(actions);

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      const cleanup = (value) => {
        overlay.remove();
        resolve(value);
      };

      if (cancelBtn) cancelBtn.addEventListener("click", () => cleanup(null));
      confirmBtn.addEventListener("click", () => {
        if (inputEl) {
          cleanup(inputEl.value);
        } else {
          cleanup(true);
        }
      });

      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) cleanup(null);
      });

      document.addEventListener(
        "keydown",
        (event) => {
          if (event.key === "Escape") cleanup(null);
          if (event.key === "Enter") {
            event.preventDefault();
            confirmBtn.click();
          }
        },
        { once: true }
      );

      if (inputEl) {
        setTimeout(() => inputEl.focus(), 0);
      } else {
        setTimeout(() => confirmBtn.focus(), 0);
      }
    });

  const alert = (message, options = {}) =>
    buildModal({
      title: options.title || "Bericht",
      message: String(message || ""),
      confirmText: options.confirmText || "Ok",
      cancelText: "",
    }).then(() => true);

  const confirm = (message, options = {}) =>
    buildModal({
      title: options.title || "Bevestigen",
      message: String(message || ""),
      confirmText: options.confirmText || "Bevestigen",
      cancelText: options.cancelText || "Annuleren",
      danger: options.danger || false,
    }).then((value) => Boolean(value));

  const prompt = (message, options = {}) =>
    buildModal({
      title: options.title || "Invoer",
      message: String(message || ""),
      confirmText: options.confirmText || "Opslaan",
      cancelText: options.cancelText || "Annuleren",
      input: {
        value: options.defaultValue || "",
        placeholder: options.placeholder || "",
        type: options.inputType || "text",
      },
    }).then((value) => (typeof value === "string" ? value : null));

  window.siteUI = { toast, alert, confirm, prompt };

  window.alert = (message) => {
    alert(message);
  };
})();
