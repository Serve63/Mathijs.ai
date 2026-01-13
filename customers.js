(() => {
  const customers = Array.isArray(window.customersData)
    ? window.customersData.map((customer) => ({ ...customer }))
    : [];
  const provinceLabels = window.provinceLabels || {};

  const totalCustomersEl = document.getElementById("stat-total-customers");
  const totalPaidEl = document.getElementById("stat-total-paid");
  const activeCustomersEl = document.getElementById("stat-active-customers");
  const freeMonthsEl = document.getElementById("stat-free-months");
  const searchInput = document.getElementById("customer-search");
  const tableEl = document.getElementById("customers-table");
  const emptyEl = document.getElementById("customers-empty");

  const fmtEUR = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
  const dateFmt = new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });

  const formatProvince = (provinceId) => provinceLabels[provinceId] || provinceId || "Onbekend";

  const formatDate = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return dateFmt.format(date);
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

  const updateStats = () => {
    const totalPaid = customers.reduce((sum, customer) => sum + (customer.totalPaid || 0), 0);
    const activeCount = customers.filter((customer) => customer.status === "actief").length;
    const freeMonths = customers.reduce((sum, customer) => sum + (customer.freeMonths || 0), 0);

    if (totalCustomersEl) totalCustomersEl.textContent = String(customers.length);
    if (totalPaidEl) totalPaidEl.textContent = fmtEUR.format(totalPaid);
    if (activeCustomersEl) activeCustomersEl.textContent = String(activeCount);
    if (freeMonthsEl) freeMonthsEl.textContent = String(freeMonths);
  };

  const getStatusConfig = (status) => {
    if (status === "actief") return { label: "actief", className: "active" };
    if (status === "opgezegd") return { label: "opgezegd", className: "cancelled" };
    if (status === "trial") return { label: "trial", className: "trial" };
    return { label: status || "onbekend", className: "trial" };
  };

  const getFilteredCustomers = () => {
    const query = searchInput ? searchInput.value.trim().toLowerCase() : "";
    if (!query) return customers.slice();

    return customers.filter((customer) => {
      const provinceLabel = formatProvince(customer.provinceId);
      const haystack = `${customer.name} ${customer.email} ${customer.plan} ${customer.status} ${provinceLabel}`
        .toLowerCase();
      return haystack.includes(query);
    });
  };

  const renderTable = () => {
    if (!tableEl) return;
    const filtered = getFilteredCustomers();

    if (!filtered.length) {
      tableEl.innerHTML = "";
      if (emptyEl) emptyEl.hidden = false;
      return;
    }

    if (emptyEl) emptyEl.hidden = true;

    tableEl.innerHTML = filtered
      .map((customer) => {
        const provinceLabel = formatProvince(customer.provinceId);
        const status = getStatusConfig(customer.status);
        const lastActive = formatDate(customer.lastActive);
        const lastPayment = formatDate(customer.lastPayment);
        const freeMonths = customer.freeMonths || 0;
        const freeLabel = freeMonths === 1 ? "1 maand" : `${freeMonths} maanden`;

        return `
          <div class="table-row" data-id="${customer.id}">
            <div class="cell customer-cell" data-label="Klant">
              <div class="customer-avatar">${getInitials(customer.name)}</div>
              <div>
                <p class="customer-name">${customer.name}</p>
                <p class="customer-sub">${customer.email} | laatst actief ${lastActive} | betaling ${lastPayment}</p>
              </div>
            </div>
            <div class="cell" data-label="Provincie">${provinceLabel}</div>
            <div class="cell" data-label="Plan">${customer.plan}</div>
            <div class="cell" data-label="Totaal betaald">${fmtEUR.format(customer.totalPaid || 0)}</div>
            <div class="cell" data-label="Gratis maanden"><span class="chip">${freeLabel}</span></div>
            <div class="cell" data-label="Status"><span class="status ${status.className}">${status.label}</span></div>
            <div class="cell actions" data-label="Acties">
              <button class="btn tiny secondary" data-action="grant" data-months="1">+1 maand</button>
              <button class="btn tiny secondary" data-action="grant" data-months="3">+3 maanden</button>
              <button class="btn tiny ghost" data-action="delete">Verwijder</button>
            </div>
          </div>
        `;
      })
      .join("");
  };

  const handleTableAction = (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const row = button.closest(".table-row");
    if (!row) return;
    const id = row.dataset.id;
    const index = customers.findIndex((customer) => customer.id === id);
    if (index === -1) return;

    const action = button.dataset.action;
    if (action === "delete") {
      customers.splice(index, 1);
      updateStats();
      renderTable();
      return;
    }

    if (action === "grant") {
      const months = Number(button.dataset.months) || 1;
      customers[index].freeMonths = (customers[index].freeMonths || 0) + months;
      updateStats();
      renderTable();
    }
  };

  if (searchInput) {
    searchInput.addEventListener("input", renderTable);
  }
  if (tableEl) {
    tableEl.addEventListener("click", handleTableAction);
  }

  updateStats();
  renderTable();
})();
