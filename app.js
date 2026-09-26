const KEY = "ledger-pro-v1";

const CATEGORIES = {
  income: ["Salario", "Freelance", "Inversiones", "Otros ingresos"],
  expense: ["Vivienda", "Alimentación", "Transporte", "Salud", "Ocio", "Servicios", "Otros gastos"],
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* */ }
  return [];
}

function save(entries) {
  localStorage.setItem(KEY, JSON.stringify(entries));
}

let entries = load();
let chart;

function formatCOP(n) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

function uid() {
  return crypto.randomUUID();
}

function populateCategories(type) {
  const sel = document.getElementById("category-select");
  const list = CATEGORIES[type] || CATEGORIES.expense;
  sel.innerHTML = list.map((c) => `<option value="${c}">${c}</option>`).join("");
}

function totals() {
  let income = 0;
  let expense = 0;
  for (const e of entries) {
    if (e.type === "income") income += e.amount;
    else expense += e.amount;
  }
  return { income, expense, balance: income - expense };
}

function renderStats() {
  const { income, expense, balance } = totals();
  document.getElementById("stat-income").textContent = formatCOP(income);
  document.getElementById("stat-expense").textContent = formatCOP(expense);
  document.getElementById("stat-balance").textContent = formatCOP(balance);
}

function renderTable() {
  const q = (document.getElementById("search").value || "").toLowerCase();
  const tbody = document.getElementById("entries-body");
  let list = [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);
  if (q) {
    list = list.filter(
      (e) =>
        e.category.toLowerCase().includes(q) ||
        (e.description || "").toLowerCase().includes(q)
    );
  }
  if (!list.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Sin movimientos.</td></tr>';
    return;
  }
  tbody.innerHTML = list
    .map(
      (e) => `
    <tr>
      <td>${e.date}</td>
      <td><span class="tag ${e.type}">${e.type === "income" ? "Ingreso" : "Gasto"}</span></td>
      <td>${escapeHtml(e.category)}</td>
      <td>${escapeHtml(e.description || "—")}</td>
      <td class="num">${formatCOP(e.amount)}</td>
      <td><button type="button" class="btn icon" data-del="${e.id}">Eliminar</button></td>
    </tr>`
    )
    .join("");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function monthKey(dateStr) {
  return dateStr.slice(0, 7);
}

function renderChart() {
  const monthInput = document.getElementById("chart-month");
  const ym = monthInput.value || new Date().toISOString().slice(0, 7);
  monthInput.value = ym;

  const byCat = {};
  for (const e of entries.filter((x) => monthKey(x.date) === ym)) {
    const sign = e.type === "income" ? 1 : -1;
    byCat[e.category] = (byCat[e.category] || 0) + sign * e.amount;
  }
  const labels = Object.keys(byCat);
  const data = labels.map((k) => byCat[k]);
  const colors = data.map((v) => (v >= 0 ? "rgba(42, 143, 106, 0.75)" : "rgba(181, 74, 74, 0.75)"));

  const ctx = document.getElementById("month-chart");
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "COP", data, backgroundColor: colors, borderRadius: 6 }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          ticks: {
            callback: (v) => formatCOP(v),
          },
        },
      },
    },
  });
}

function refresh() {
  renderStats();
  renderTable();
  renderChart();
}

document.querySelector('#entry-form select[name="type"]').addEventListener("change", (e) => {
  populateCategories(e.target.value);
});

document.getElementById("entry-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  entries.push({
    id: uid(),
    type: fd.get("type"),
    amount: Number(fd.get("amount")),
    category: fd.get("category"),
    date: fd.get("date"),
    description: String(fd.get("description")).trim(),
    created: Date.now(),
  });
  save(entries);
  e.target.reset();
  document.querySelector('#entry-form input[name="date"]').value = new Date().toISOString().slice(0, 10);
  refresh();
});

document.getElementById("entries-body").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-del]");
  if (!btn) return;
  entries = entries.filter((x) => x.id !== btn.dataset.del);
  save(entries);
  refresh();
});

document.getElementById("search").addEventListener("input", renderTable);
document.getElementById("chart-month").addEventListener("change", renderChart);

document.getElementById("export-csv").addEventListener("click", () => {
  const header = "fecha,tipo,categoria,descripcion,monto_cop\n";
  const rows = entries
    .map(
      (e) =>
        `${e.date},${e.type},${JSON.stringify(e.category)},${JSON.stringify(e.description || "")},${e.amount}`
    )
    .join("\n");
  const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ledger-pro-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

const dateEl = document.querySelector('#entry-form input[name="date"]');
dateEl.value = new Date().toISOString().slice(0, 10);
document.getElementById("chart-month").value = new Date().toISOString().slice(0, 7);
populateCategories("expense");
refresh();
