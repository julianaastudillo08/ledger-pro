const KEY = "ledger-pro-v2";
const THEME_KEY = "ledger-pro-theme";

const CATEGORIES = {
  income: ["Salario", "Freelance", "Inversiones", "Otros ingresos"],
  expense: ["Vivienda", "Alimentación", "Transporte", "Salud", "Ocio", "Servicios", "Otros gastos"],
};

function defaultData() {
  return { entries: [], budgets: {}, recurring: [] };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
    const legacy = localStorage.getItem("ledger-pro-v1");
    if (legacy) {
      const entries = JSON.parse(legacy);
      const data = { entries, budgets: {}, recurring: [] };
      save(data);
      return data;
    }
  } catch { /* */ }
  return defaultData();
}

function save(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

let data = load();
let compareChart;
let monthChart;
let sparkChart;

function entries() {
  return data.entries;
}

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

function monthKey(dateStr) {
  return dateStr.slice(0, 7);
}

function getFocusMonth() {
  return document.getElementById("focus-month").value || new Date().toISOString().slice(0, 7);
}

function setFocusMonth(ym) {
  document.getElementById("focus-month").value = ym;
  const [y, m] = ym.split("-").map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  document.getElementById("month-display").textContent = label.charAt(0).toUpperCase() + label.slice(1);
}

function shiftMonth(delta) {
  const ym = getFocusMonth();
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  setFocusMonth(next);
  refresh();
}

function populateCategories(type) {
  const sel = document.getElementById("category-select");
  const list = CATEGORIES[type] || CATEGORIES.expense;
  sel.innerHTML = list.map((c) => `<option value="${c}">${c}</option>`).join("");
}

function monthTotals(ym) {
  let income = 0;
  let expense = 0;
  for (const e of data.entries.filter((x) => monthKey(x.date) === ym)) {
    if (e.type === "income") income += e.amount;
    else expense += e.amount;
  }
  return { income, expense, balance: income - expense };
}

function applyRecurringForMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  let added = 0;
  for (const r of data.recurring) {
    const day = Math.min(r.day || 1, lastDay);
    const date = `${ym}-${String(day).padStart(2, "0")}`;
    const exists = data.entries.some(
      (e) => e.recurringId === r.id && e.date === date
    );
    if (!exists) {
      data.entries.push({
        id: uid(),
        type: r.type,
        amount: r.amount,
        category: r.category,
        date,
        description: r.description || "Recurrente",
        created: Date.now(),
        recurringId: r.id,
      });
      added++;
    }
  }
  if (added) save(data);
  return added;
}

function forecastBalance(ym) {
  const { income, expense, balance } = monthTotals(ym);
  const [y, m] = ym.split("-").map(Number);
  const today = new Date();
  const isCurrent = today.getFullYear() === y && today.getMonth() + 1 === m;
  const daysInMonth = new Date(y, m, 0).getDate();
  const dayOfMonth = isCurrent ? today.getDate() : daysInMonth;
  const dailyNet = dayOfMonth > 0 ? balance / dayOfMonth : 0;
  const projected = isCurrent ? dailyNet * daysInMonth : balance;
  return { projected, isCurrent, dailyNet };
}

function renderStats() {
  const ym = getFocusMonth();
  applyRecurringForMonth(ym);
  const { income, expense, balance } = monthTotals(ym);
  const { projected, isCurrent } = forecastBalance(ym);

  document.getElementById("stat-income").textContent = formatCOP(income);
  document.getElementById("stat-expense").textContent = formatCOP(expense);
  document.getElementById("stat-balance").textContent = formatCOP(balance);
  document.getElementById("stat-forecast").textContent = formatCOP(Math.round(projected));
  document.getElementById("forecast-note").textContent = isCurrent
    ? "Proyección según ritmo actual del mes"
    : "Balance cerrado del mes seleccionado";
}

function renderSparkline() {
  const ym = getFocusMonth();
  const [y, m] = ym.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  let running = 0;
  const points = [];
  for (let d = 1; d <= days; d++) {
    const date = `${ym}-${String(d).padStart(2, "0")}`;
    for (const e of data.entries.filter((x) => x.date === date)) {
      running += e.type === "income" ? e.amount : -e.amount;
    }
    points.push(running);
  }
  const ctx = document.getElementById("balance-spark");
  if (sparkChart) sparkChart.destroy();
  sparkChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: points.map((_, i) => i + 1),
      datasets: [{
        data: points,
        borderColor: "rgba(61, 153, 112, 0.9)",
        backgroundColor: "rgba(61, 153, 112, 0.12)",
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { display: false }, y: { display: false } },
    },
  });
}

function renderCompareChart() {
  const ym = getFocusMonth();
  const [y, m] = ym.split("-").map(Number);
  const prev = new Date(y, m - 2, 1);
  const prevYm = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  const cur = monthTotals(ym);
  const previous = monthTotals(prevYm);

  const ctx = document.getElementById("compare-chart");
  if (compareChart) compareChart.destroy();
  compareChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Ingresos", "Gastos", "Balance"],
      datasets: [
        {
          label: "Mes anterior",
          data: [previous.income, previous.expense, previous.balance],
          backgroundColor: "rgba(120, 140, 130, 0.45)",
          borderRadius: 6,
        },
        {
          label: "Mes actual",
          data: [cur.income, cur.expense, cur.balance],
          backgroundColor: ["rgba(42, 143, 106, 0.8)", "rgba(181, 74, 74, 0.75)", "rgba(31, 107, 82, 0.85)"],
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } },
      scales: {
        y: { ticks: { callback: (v) => formatCOP(v) } },
      },
    },
  });
}

function renderMonthChart() {
  const ym = getFocusMonth();
  const byCat = {};
  for (const e of data.entries.filter((x) => monthKey(x.date) === ym)) {
    const sign = e.type === "income" ? 1 : -1;
    byCat[e.category] = (byCat[e.category] || 0) + sign * e.amount;
  }
  const labels = Object.keys(byCat);
  const values = labels.map((k) => byCat[k]);
  const colors = values.map((v) => (v >= 0 ? "rgba(42, 143, 106, 0.75)" : "rgba(181, 74, 74, 0.75)"));

  const ctx = document.getElementById("month-chart");
  if (monthChart) monthChart.destroy();
  monthChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "COP", data: values, backgroundColor: colors, borderRadius: 6 }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { ticks: { callback: (v) => formatCOP(v) } } },
    },
  });
}

function renderBudgets() {
  const ym = getFocusMonth();
  const list = document.getElementById("budget-list");
  const expenseCats = CATEGORIES.expense;
  const spent = {};
  for (const e of data.entries.filter((x) => monthKey(x.date) === ym && x.type === "expense")) {
    spent[e.category] = (spent[e.category] || 0) + e.amount;
  }

  list.innerHTML = expenseCats
    .map((cat) => {
      const goal = data.budgets[cat] || 0;
      const used = spent[cat] || 0;
      const pct = goal > 0 ? Math.min(100, Math.round((used / goal) * 100)) : 0;
      const over = goal > 0 && used > goal;
      return `<div class="budget-row">
        <span class="budget-cat">${escapeHtml(cat)}</span>
        <input type="number" min="0" step="1000" data-budget-cat="${escapeHtml(cat)}" value="${goal || ""}" placeholder="Meta COP" />
        <div class="budget-bar"><div class="budget-fill ${over ? "over" : ""}" style="width:${pct}%"></div></div>
        <span class="budget-spent">${formatCOP(used)}${goal ? ` / ${formatCOP(goal)}` : ""}</span>
      </div>`;
    })
    .join("");
}

function renderTable() {
  const ym = getFocusMonth();
  const q = (document.getElementById("search").value || "").toLowerCase();
  const tbody = document.getElementById("entries-body");
  const emptyEl = document.getElementById("empty-entries");
  let list = data.entries
    .filter((e) => monthKey(e.date) === ym)
    .sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);
  if (q) {
    list = list.filter(
      (e) =>
        e.category.toLowerCase().includes(q) ||
        (e.description || "").toLowerCase().includes(q)
    );
  }
  if (!list.length) {
    tbody.innerHTML = "";
    emptyEl.hidden = !q;
    if (q) emptyEl.textContent = "Sin coincidencias en este mes.";
    else emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;
  tbody.innerHTML = list
    .map(
      (e) => `
    <tr class="animate-row">
      <td>${e.date}</td>
      <td><span class="tag ${e.type}">${e.type === "income" ? "Ingreso" : "Gasto"}</span>${e.recurringId ? ' <span class="tag recur">↻</span>' : ""}</td>
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

function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { el.hidden = true; }, 2800);
}

function refresh() {
  renderStats();
  renderSparkline();
  renderCompareChart();
  renderMonthChart();
  renderBudgets();
  renderTable();
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || "dark";
  document.documentElement.dataset.theme = saved;
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem(THEME_KEY, next);
  refresh();
}

document.getElementById("theme-toggle").addEventListener("click", toggleTheme);
document.getElementById("month-prev").addEventListener("click", () => shiftMonth(-1));
document.getElementById("month-next").addEventListener("click", () => shiftMonth(1));
document.getElementById("focus-month").addEventListener("change", () => {
  setFocusMonth(getFocusMonth());
  refresh();
});

document.querySelector('#entry-form select[name="type"]').addEventListener("change", (e) => {
  populateCategories(e.target.value);
});

document.getElementById("entry-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const entry = {
    id: uid(),
    type: fd.get("type"),
    amount: Number(fd.get("amount")),
    category: fd.get("category"),
    date: fd.get("date"),
    description: String(fd.get("description")).trim(),
    created: Date.now(),
  };
  data.entries.push(entry);

  if (fd.get("recurring") === "on") {
    const day = Number(String(entry.date).slice(8, 10));
    data.recurring.push({
      id: uid(),
      type: entry.type,
      amount: entry.amount,
      category: entry.category,
      description: entry.description,
      day,
    });
    showToast("Movimiento y regla recurrente guardados.");
  } else {
    showToast("Movimiento guardado.");
  }

  save(data);
  e.target.reset();
  document.querySelector('#entry-form input[name="date"]').value = new Date().toISOString().slice(0, 10);
  populateCategories("expense");
  refresh();
});

document.getElementById("entries-body").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-del]");
  if (!btn) return;
  data.entries = data.entries.filter((x) => x.id !== btn.dataset.del);
  save(data);
  refresh();
});

document.getElementById("search").addEventListener("input", renderTable);

document.getElementById("save-budgets").addEventListener("click", () => {
  document.querySelectorAll("[data-budget-cat]").forEach((input) => {
    const cat = input.dataset.budgetCat;
    const val = Number(input.value);
    if (val > 0) data.budgets[cat] = val;
    else delete data.budgets[cat];
  });
  save(data);
  renderBudgets();
  showToast("Metas de presupuesto actualizadas.");
});

document.getElementById("export-csv").addEventListener("click", () => {
  const header = "fecha,tipo,categoria,descripcion,monto_cop\n";
  const rows = data.entries
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

document.getElementById("import-csv").addEventListener("click", () => {
  document.getElementById("csv-file").click();
});

document.getElementById("csv-file").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const lines = text.trim().split(/\r?\n/).slice(1);
  let count = 0;
  for (const line of lines) {
    const parts = line.match(/("([^"]|"")*"|[^,]+)/g);
    if (!parts || parts.length < 5) continue;
    const clean = (s) => s.replace(/^"|"$/g, "").replace(/""/g, '"');
    const date = clean(parts[0]);
    const type = clean(parts[1]);
    if (type !== "income" && type !== "expense") continue;
    data.entries.push({
      id: uid(),
      type,
      category: clean(parts[2]),
      description: clean(parts[3]),
      amount: Number(clean(parts[4])),
      date,
      created: Date.now(),
    });
    count++;
  }
  save(data);
  e.target.value = "";
  refresh();
  showToast(`${count} movimientos importados.`);
});

document.getElementById("print-report").addEventListener("click", () => window.print());

const dateEl = document.querySelector('#entry-form input[name="date"]');
dateEl.value = new Date().toISOString().slice(0, 10);
setFocusMonth(new Date().toISOString().slice(0, 7));
populateCategories("expense");
initTheme();
refresh();
