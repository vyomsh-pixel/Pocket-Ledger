/* ---------------------------------------------------------------------
   Firebase Config & Initialization
--------------------------------------------------------------------- */
window.FIREBASE_CONFIG = window.FIREBASE_CONFIG || {
  apiKey: "AIzaSyCEuPu8cUu_SEDPJ33XM-n18XTQJ9MRFBk",
  authDomain: "pocketledger-935d4.firebaseapp.com",
  projectId: "pocketledger-935d4",
  storageBucket: "pocketledger-935d4.firebasestorage.app",
  messagingSenderId: "554900514852",
  appId: "1:554900514852:web:b32599599a23e3730250b1",
  measurementId: "G-V7WEK60ET1"
};

if (typeof firebase !== "undefined" && window.FIREBASE_CONFIG.apiKey) {
  try {
    firebase.initializeApp(window.FIREBASE_CONFIG);
  } catch (err) {
    console.warn("Firebase already initialized or error:", err);
  }
}


/* ---------------------------------------------------------------------
   Exchange Rates & Live Currency Engine
--------------------------------------------------------------------- */
const FALLBACK_EXCHANGE_RATES = {
  "$": 1.0,      // USD
  "₹": 94.49,    // INR (September 2026 Market Rate)
  "€": 0.86,     // EUR
  "£": 0.74,     // GBP (150 USD = 110.98 GBP)
  "¥": 155.0,    // JPY
  "₩": 1345.0,   // KRW
  "Fr": 0.81,    // CHF
  "R$": 5.13,    // BRL
  "kr": 9.60,    // SEK
  "zł": 3.71     // PLN
};

const SYMBOL_TO_CODE = {
  "$": "USD",
  "₹": "INR",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  "₩": "KRW",
  "Fr": "CHF",
  "R$": "BRL",
  "kr": "SEK",
  "zł": "PLN"
};

const exchangeRates = { ...FALLBACK_EXCHANGE_RATES };

async function fetchLiveRates() {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.rates) {
      Object.keys(SYMBOL_TO_CODE).forEach((sym) => {
        const code = SYMBOL_TO_CODE[sym];
        if (data.rates[code]) {
          exchangeRates[sym] = data.rates[code];
        }
      });
      if (typeof state !== "undefined" && state.user) {
        refreshAll();
      }
    }
  } catch (_) {
    // Keep fallback rates
  }
}

fetchLiveRates();

const fmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n) => {
  const symbol = state.user?.currency || "$";
  const rate = state.convertFx ? (exchangeRates[symbol] || 1.0) : 1.0;
  const val = (Number(n) || 0) * rate;
  return symbol + fmt.format(val);
};



const DEFAULT_EXPENSE_CATEGORIES = ["Food & Dining", "Utilities", "Shopping", "Entertainment", "Rent & Housing", "Transport", "Healthcare"];
const DEFAULT_INCOME_CATEGORIES = ["Salary", "Freelance", "Investment", "Business", "Gift / Bonus"];

const state = {
  user: null,
  authMode: "login",
  month: new Date().toISOString().slice(0, 7), // "YYYY-MM"
  editingId: null,
  selectedImportFile: null,
  budgetedCategories: [],
  convertFx: localStorage.getItem("pocketledger_fx") === "true", // false by default (Nominal 1:1 direct numbers)
};

const el = (id) => document.getElementById(id);
const monthLabel = () => {
  const [y, m] = state.month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
};

function updateCategorySuggestions() {
  const dropdown = el("categoryCustomDropdown");
  const input = el("categoryInput");
  if (!dropdown || !input) return;

  const query = input.value.trim().toLowerCase();
  const type = entryForm.type ? entryForm.type.value : "expense";

  // Build clean title-cased unique lists
  const budgeted = (state.budgetedCategories || []).map((c) => c.trim()).filter(Boolean);
  const defaults = (type === "expense" ? DEFAULT_EXPENSE_CATEGORIES : DEFAULT_INCOME_CATEGORIES).map((c) => c.trim());

  const allCategories = [...new Set([...budgeted, ...defaults])];
  const filtered = allCategories.filter((c) => c.toLowerCase().includes(query));

  if (filtered.length === 0) {
    dropdown.hidden = true;
    return;
  }

  let html = "";
  if (type === "expense" && budgeted.length > 0) {
    const matchedBudgeted = budgeted.filter((c) => c.toLowerCase().includes(query));
    if (matchedBudgeted.length > 0) {
      html += `<div class="dropdown-group-header">Budgeted Categories</div>`;
      matchedBudgeted.forEach((cat) => {
        html += `<div class="dropdown-item" data-value="${escapeHtml(cat)}"><span>${escapeHtml(cat)}</span><span class="dropdown-badge">budgeted</span></div>`;
      });
    }
  }

  const otherMatches = filtered.filter((c) => !budgeted.includes(c));
  if (otherMatches.length > 0) {
    if (html) html += `<div class="dropdown-group-header">Suggested Categories</div>`;
    otherMatches.forEach((cat) => {
      html += `<div class="dropdown-item" data-value="${escapeHtml(cat)}"><span>${escapeHtml(cat)}</span></div>`;
    });
  }

  dropdown.innerHTML = html;
  if (document.activeElement === input) {
    dropdown.hidden = false;
  }

  dropdown.querySelectorAll(".dropdown-item").forEach((item) => {
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      input.value = item.dataset.value;
      dropdown.hidden = true;
    });
  });
}

// Wire Category Input Events
const categoryInput = el("categoryInput");
if (categoryInput) {
  categoryInput.addEventListener("focus", updateCategorySuggestions);
  categoryInput.addEventListener("input", updateCategorySuggestions);
}

document.addEventListener("click", (e) => {
  const dropdown = el("categoryCustomDropdown");
  const input = el("categoryInput");
  if (dropdown && input && !dropdown.contains(e.target) && e.target !== input) {
    dropdown.hidden = true;
  }
});

// ---------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------
let toastTimer = null;
function toast(message, isAlert = false, action = null) {
  const t = el("toast");
  t.innerHTML = "";

  const span = document.createElement("span");
  span.textContent = message;
  t.appendChild(span);

  if (action && action.text && action.onClick) {
    const btn = document.createElement("button");
    btn.className = "toast-action-btn";
    btn.textContent = action.text;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      action.onClick();
      t.classList.remove("visible");
    });
    t.appendChild(btn);
  }

  t.onclick = isAlert ? () => { switchTab("budgets"); t.classList.remove("visible"); } : null;
  t.classList.toggle("alert", isAlert);
  t.classList.add("visible");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove("visible");
  }, isAlert ? 5000 : action ? 6000 : 2600);
}

// ---------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: opts.body && !(opts.body instanceof FormData) ? { "Content-Type": "application/json" } : undefined,
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function monthRange() {
  const [y, m] = state.month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const endStr = `${state.month}-${String(lastDay).padStart(2, "0")}`;
  return { start: `${state.month}-01`, end: endStr };
}

// ---------------------------------------------------------------------
// Privacy Blur Mode
// ---------------------------------------------------------------------
function applyPrivacy(isPrivate) {
  state.privacy = isPrivate;
  localStorage.setItem("pocketledger_privacy", isPrivate ? "true" : "false");
  document.body.classList.toggle("privacy-mode", isPrivate);
  const btn = el("privacyToggleBtn");
  if (btn) btn.textContent = `privacy: ${isPrivate ? "on" : "off"}`;
}

el("privacyToggleBtn").addEventListener("click", () => applyPrivacy(!state.privacy));

// ---------------------------------------------------------------------
// FX Mode Toggle (Nominal 1:1 vs Live Rate Conversion)
// ---------------------------------------------------------------------
function applyFx(isFxLive) {
  state.convertFx = isFxLive;
  localStorage.setItem("pocketledger_fx", isFxLive ? "true" : "false");
  const btn = el("fxToggleBtn");
  if (btn) btn.textContent = `fx: ${isFxLive ? "live" : "off"}`;
  refreshAll();
}

const fxToggleBtn = el("fxToggleBtn");
if (fxToggleBtn) {
  fxToggleBtn.addEventListener("click", () => {
    applyFx(!state.convertFx);
    toast(state.convertFx ? "FX Live Rate Mode ON" : "Nominal Mode (1:1 direct amounts) ON");
  });
}

// ---------------------------------------------------------------------
// Rendering: summary / hero
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
// Rendering: summary / hero
// ---------------------------------------------------------------------
function updateSummaryDOM(s) {
  state.currentSummary = s;
  el("netBalance").textContent = money(s.net);
  el("totalIncome").textContent = money(s.income);
  el("totalExpense").textContent = money(s.expense);

  const savingsRate = s.income > 0 ? Math.round(((s.income - s.expense) / s.income) * 1000) / 10 : 0;
  el("savingsRateVal").textContent = `${savingsRate}%`;

  // Daily Pace Calculation
  const [y, m] = state.month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const dailyPace = Math.round(s.expense / daysInMonth);
  el("dailyPaceVal").textContent = `${money(dailyPace)}/day`;

  // Sidebar updates
  const sbNet = el("sbNetVal");
  const sbSav = el("sbSavingsVal");
  const sbPace = el("sbPaceVal");
  if (sbNet) sbNet.textContent = money(s.net);
  if (sbSav) sbSav.textContent = `${savingsRate}%`;
  if (sbPace) sbPace.textContent = `${money(dailyPace)}/day`;

  updatePersonaTag(savingsRate);
  renderCategoryBreakdown(s);
}

async function refreshSummary() {
  if (!state.user) return;
  const s = await api(`/api/summary?month=${state.month}`);
  updateSummaryDOM(s);
}

function updatePersonaTag(savingsRate) {
  const tag = el("userPersonaTag");
  if (!tag) return;
  if (savingsRate >= 35) {
    tag.textContent = "Zen Strategist";
  } else if (savingsRate >= 15) {
    tag.textContent = "Capital Builder";
  } else if (savingsRate >= 0) {
    tag.textContent = "Balanced Allocator";
  } else {
    tag.textContent = "Active Restructurer";
  }
}

function renderCategoryBreakdown(summary) {
  const box = el("categoryBreakdown");
  const empty = el("reportEmpty");
  box.innerHTML = "";
  const rows = summary.by_category || [];
  if (rows.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  const max = Math.max(...rows.map((r) => r.total));
  rows.forEach((r) => {
    const div = document.createElement("div");
    div.className = "cat-row";
    div.innerHTML = `
      <div class="cat-row-top"><span>${escapeHtml(r.category)}</span><span class="cat-amount">${money(r.total)}</span></div>
      <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${(r.total / max) * 100}%"></div></div>
    `;
    box.appendChild(div);
  });
}

// ---------------------------------------------------------------------
// Rendering: transactions
// ---------------------------------------------------------------------
function createTxRowElement(tx) {
  const row = document.createElement("div");
  row.className = `tx-row ${tx.type}`;
  row.dataset.id = tx.id;
  const sign = tx.type === "income" ? "+" : "\u2212";

  row.innerHTML = `
    <span class="cell-date">${formatDay(tx.date)}</span>
    <span class="cell-category">
      ${escapeHtml(tx.category)}
      ${tx.note ? `<div class="cell-note-mobile">${escapeHtml(tx.note)}</div>` : ""}
    </span>
    <span class="cell-note">${escapeHtml(tx.note || "")}</span>
    <span class="cell-amount blur-target">${sign}${money(tx.amount)}</span>
    <span class="cell-actions">
      <button class="tx-edit" title="Edit entry" data-id="${tx.id}">✎</button>
      <button class="tx-dup" title="Duplicate entry" data-id="${tx.id}">↻</button>
      <button class="tx-delete" title="Delete" data-id="${tx.id}">&times;</button>
    </span>
  `;

  row.querySelector(".cell-date").addEventListener("click", () => startEdit(tx));
  row.querySelector(".cell-category").addEventListener("click", () => startEdit(tx));
  row.querySelector(".cell-note").addEventListener("click", () => startEdit(tx));
  row.querySelector(".cell-amount").addEventListener("click", () => startEdit(tx));
  row.querySelector(".tx-edit").addEventListener("click", (e) => {
    e.stopPropagation();
    startEdit(tx);
  });
  row.querySelector(".tx-dup").addEventListener("click", (e) => {
    e.stopPropagation();
    duplicateTransaction(tx);
  });
  row.querySelector(".tx-delete").addEventListener("click", (e) => {
    e.stopPropagation();
    deleteTransaction(tx);
  });

  return row;
}

async function refreshTransactions() {
  const { start, end } = monthRange();
  const q = el("searchBox").value.trim();
  const type = el("typeFilter").value;
  const params = new URLSearchParams({ start, end });
  if (q) params.set("q", q);
  if (type) params.set("type", type);

  const rows = await api(`/api/transactions?${params}`);
  const list = el("txList");
  const empty = el("txEmpty");
  list.innerHTML = "";

  if (rows.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  rows.forEach((tx) => {
    list.appendChild(createTxRowElement(tx));
  });
}

function formatDay(iso) {
  const [, m, d] = iso.split("-");
  return `${m}.${d}`;
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

// ---------------------------------------------------------------------
// Entry form: add + edit
// ---------------------------------------------------------------------
const entryForm = el("entryForm");

function startEdit(tx) {
  switchTab("ledger");
  state.editingId = tx.id;
  entryForm.date.value = tx.date;
  entryForm.type.value = tx.type;
  entryForm.category.value = tx.category;
  entryForm.amount.value = tx.amount;
  entryForm.note.value = tx.note || "";
  el("entrySubmit").textContent = "Save changes";
  el("entryCancel").hidden = false;
  entryForm.scrollIntoView({ behavior: "smooth", block: "center" });
}

function resetEntryForm() {
  state.editingId = null;
  entryForm.reset();
  entryForm.date.value = new Date().toISOString().slice(0, 10);
  el("entrySubmit").textContent = "Add entry";
  el("entryCancel").hidden = true;
}

entryForm.type.addEventListener("change", updateCategorySuggestions);
el("entryCancel").addEventListener("click", resetEntryForm);

entryForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const rawAmt = parseFloat(entryForm.amount.value) || 0;
  if (!rawAmt) return;

  const payload = {
    date: entryForm.date.value,
    type: entryForm.type.value,
    category: entryForm.category.value.trim(),
    amount: rawAmt,
    note: entryForm.note.value.trim(),
  };

  const isEdit = Boolean(state.editingId);
  const editId = state.editingId;

  // 1. INSTANT 0ms DOM ROW INSERTION & HERO BALANCE MATH
  const list = el("txList");
  const empty = el("txEmpty");
  if (empty) empty.hidden = true;

  const tempTx = {
    id: editId || ("temp_" + Date.now()),
    date: payload.date,
    type: payload.type,
    category: payload.category.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" "),
    amount: payload.amount,
    note: payload.note,
  };

  if (isEdit) {
    const oldRow = document.querySelector(`.tx-row[data-id="${editId}"]`);
    if (oldRow) {
      const newRow = createTxRowElement(tempTx);
      list.replaceChild(newRow, oldRow);
    }
  } else {
    const newRow = createTxRowElement(tempTx);
    list.insertBefore(newRow, list.firstChild);
  }

  if (state.currentSummary) {
    if (payload.type === "income") {
      state.currentSummary.income += payload.amount;
      state.currentSummary.net += payload.amount;
    } else {
      state.currentSummary.expense += payload.amount;
      state.currentSummary.net -= payload.amount;
    }
    updateSummaryDOM(state.currentSummary);
  }

  resetEntryForm();
  toast(isEdit ? "Entry updated." : "Entry added.");

  // 2. Async backend sync
  try {
    let result;
    if (isEdit) {
      result = await api(`/api/transactions/${editId}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      result = await api("/api/transactions", { method: "POST", body: JSON.stringify(payload) });
    }

    if (result && result.transaction) {
      const tempRow = document.querySelector(`.tx-row[data-id="${tempTx.id}"]`);
      if (tempRow) tempRow.dataset.id = result.transaction.id;
    }

    if (result && result.alert) {
      const a = result.alert;
      const msg = a.exceeded
        ? `Budget alert — ${a.category} is over its limit (${money(a.spent)} / ${money(a.limit)}).`
        : `Heads up — ${a.category} is near its limit (${money(a.spent)} / ${money(a.limit)}).`;
      toast(msg, true, { text: "View Budgets", onClick: () => switchTab("budgets") });
    }
    refreshAll();
  } catch (err) {
    toast(err.message, true);
    refreshAll();
  }
});

async function deleteTransaction(tx) {
  const txId = typeof tx === "object" ? tx.id : tx;
  const deletedTx = typeof tx === "object" ? tx : null;

  // Optimistic UI Removal (0ms instant response)
  const rowEl = document.querySelector(`.tx-row[data-id="${txId}"]`);
  if (rowEl) {
    rowEl.style.transition = "opacity 0.12s ease, transform 0.12s ease";
    rowEl.style.opacity = "0";
    rowEl.style.transform = "translateY(-4px)";
    setTimeout(() => rowEl.remove(), 120);
  }

  if (deletedTx) {
    toast("Entry deleted.", false, {
      text: "Undo",
      onClick: async () => {
        await api("/api/transactions", {
          method: "POST",
          body: JSON.stringify({
            date: deletedTx.date,
            type: deletedTx.type,
            category: deletedTx.category,
            amount: deletedTx.amount,
            note: deletedTx.note || "",
          }),
        });
        toast("Entry restored.");
        refreshAll();
      },
    });
  } else {
    toast("Entry deleted.");
  }

  try {
    await api(`/api/transactions/${txId}`, { method: "DELETE" });
    refreshSummary();
    refreshBudgets();
  } catch (err) {
    toast(err.message, true);
    refreshAll();
  }
}

// ---------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------
const budgetForm = el("budgetForm");

async function refreshBudgets() {
  const rows = await api(`/api/budgets?month=${state.month}`);
  state.budgetedCategories = rows.map((b) => b.category);
  updateCategorySuggestions();

  const sbBudgetCnt = el("sbBudgetCount");
  if (sbBudgetCnt) sbBudgetCnt.textContent = `${rows.length} set`;

  const list = el("budgetList");
  const empty = el("budgetEmpty");
  list.innerHTML = "";
  if (rows.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  rows.forEach((b) => {
    const pct = Math.min(100, (b.spent / b.limit) * 100);
    const actualPct = Math.round((b.spent / b.limit) * 100);
    const cls = b.exceeded ? "over" : b.near_limit ? "near" : "";
    const div = document.createElement("div");
    div.className = "budget-row";
    div.innerHTML = `
      <div class="budget-row-top">
        <span>${escapeHtml(b.category)}</span>
        <span class="amounts">
          <span class="budget-pct ${cls}">${actualPct}% used</span>
          ${money(b.spent)} / ${money(b.limit)}
          <button class="budget-delete" title="Delete budget" data-category="${escapeHtml(b.category)}">&times;</button>
        </span>
      </div>
      <div class="budget-bar-track"><div class="budget-bar-fill ${cls}" style="width:${pct}%"></div></div>
      ${cls ? `<div class="budget-flag ${cls}">${b.exceeded ? "Over budget" : "Near limit"}</div>` : ""}
    `;
    div.querySelector(".budget-delete").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteBudget(b.category);
    });
    list.appendChild(div);
  });
}

async function deleteBudget(category) {
  // Optimistic UI Removal (0ms instant response)
  const rows = document.querySelectorAll("#budgetList .budget-row");
  rows.forEach((r) => {
    const btn = r.querySelector(".budget-delete");
    if (btn && btn.dataset.category === category) {
      r.style.transition = "opacity 0.12s ease, transform 0.12s ease";
      r.style.opacity = "0";
      r.style.transform = "translateY(-4px)";
      setTimeout(() => r.remove(), 120);
    }
  });

  toast(`Budget for '${category}' deleted.`);

  try {
    await api(`/api/budgets/${encodeURIComponent(category)}`, { method: "DELETE" });
    refreshBudgets();
  } catch (err) {
    toast(err.message, true);
    refreshBudgets();
  }
}

budgetForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const cat = budgetForm.category.value.trim();
  const limitVal = parseFloat(budgetForm.monthly_limit.value);
  if (!cat || !limitVal) return;

  // 1. Optimistic DOM Insertion (0ms Instant response)
  const list = el("budgetList");
  const empty = el("budgetEmpty");
  if (empty) empty.hidden = true;

  const formattedCat = cat.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  let existingRow = Array.from(list.querySelectorAll(".budget-row")).find(r => {
    const btn = r.querySelector(".budget-delete");
    return btn && btn.dataset && btn.dataset.category && btn.dataset.category.toLowerCase() === cat.toLowerCase();
  });

  if (existingRow) {
    const amountsEl = existingRow.querySelector(".amounts");
    if (amountsEl) {
      amountsEl.innerHTML = `<span class="budget-pct">0% used</span> ${money(0)} / ${money(limitVal)} <button class="budget-delete" title="Delete budget" data-category="${escapeHtml(formattedCat)}">&times;</button>`;
      amountsEl.querySelector(".budget-delete").addEventListener("click", (ev) => { ev.stopPropagation(); deleteBudget(formattedCat); });
    }
  } else {
    const div = document.createElement("div");
    div.className = "budget-row";
    div.innerHTML = `
      <div class="budget-row-top">
        <span>${escapeHtml(formattedCat)}</span>
        <span class="amounts">
          <span class="budget-pct">0% used</span>
          ${money(0)} / ${money(limitVal)}
          <button class="budget-delete" title="Delete budget" data-category="${escapeHtml(formattedCat)}">&times;</button>
        </span>
      </div>
      <div class="budget-bar-track"><div class="budget-bar-fill" style="width:0%"></div></div>
    `;
    div.querySelector(".budget-delete").addEventListener("click", (ev) => {
      ev.stopPropagation();
      deleteBudget(formattedCat);
    });
    list.appendChild(div);
  }

  const sbBudgetCnt = el("sbBudgetCount");
  if (sbBudgetCnt) {
    const count = list.querySelectorAll(".budget-row").length;
    sbBudgetCnt.textContent = `${count} set`;
  }

  toast("Budget saved.");
  budgetForm.reset();

  // 2. Sync with backend in background
  try {
    await api("/api/budgets", {
      method: "POST",
      body: JSON.stringify({ category: cat, monthly_limit: limitVal }),
    });
    refreshBudgets();
  } catch (err) {
    toast(err.message, true);
    refreshBudgets();
  }
});

// ---------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------
function switchTab(tabId) {
  document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  const tabBtn = document.querySelector(`.tab[data-tab="${tabId}"]`);
  const content = el(`tab-${tabId}`);
  if (tabBtn) tabBtn.classList.add("active");
  if (content) content.classList.add("active");
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

// ---------------------------------------------------------------------
// Month navigation
// ---------------------------------------------------------------------
function shiftMonth(delta) {
  const [y, m] = state.month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  state.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  el("monthLabel").textContent = monthLabel();
  refreshAll();
}
el("prevMonth").addEventListener("click", () => shiftMonth(-1));
el("nextMonth").addEventListener("click", () => shiftMonth(1));

// ---------------------------------------------------------------------
// Search & Filter
// ---------------------------------------------------------------------
let searchTimer = null;
el("searchBox").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(refreshTransactions, 220);
});

el("typeFilter").addEventListener("change", refreshTransactions);

// ---------------------------------------------------------------------
// CSV Import Modal
// ---------------------------------------------------------------------
const importModal = el("importModal");
const dropzone = el("csvDropzone");
const fileInput = el("importFileInput");
const submitImportBtn = el("submitImportBtn");

el("openImportModalBtn").addEventListener("click", () => {
  importModal.hidden = false;
});

el("closeImportModalBtn").addEventListener("click", closeModal);
el("cancelImportBtn").addEventListener("click", closeModal);

function closeModal() {
  importModal.hidden = true;
  clearFile();
}

dropzone.addEventListener("click", () => fileInput.click());

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragover");
});

dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
    handleFileSelect(e.dataTransfer.files[0]);
  }
});

fileInput.addEventListener("change", (e) => {
  if (e.target.files && e.target.files[0]) {
    handleFileSelect(e.target.files[0]);
  }
});

function handleFileSelect(file) {
  if (!file.name.endsWith(".csv")) {
    toast("Please select a valid .csv file.", true);
    return;
  }
  state.selectedImportFile = file;
  el("previewFileName").textContent = file.name;
  el("importFilePreview").hidden = false;
  submitImportBtn.disabled = false;
}

el("clearFileBtn").addEventListener("click", clearFile);

function clearFile() {
  state.selectedImportFile = null;
  fileInput.value = "";
  el("importFilePreview").hidden = true;
  submitImportBtn.disabled = true;
}

submitImportBtn.addEventListener("click", async () => {
  if (!state.selectedImportFile) return;
  const formData = new FormData();
  formData.append("file", state.selectedImportFile);

  try {
    submitImportBtn.disabled = true;
    submitImportBtn.textContent = "Uploading...";
    const result = await fetch("/api/import", { method: "POST", body: formData }).then((r) => r.json());
    
    toast(`Imported ${result.imported} entr${result.imported === 1 ? "y" : "ies"}.${result.errors.length ? " " + result.errors.length + " skipped." : ""}`);
    closeModal();
    await refreshAll();
  } catch (err) {
    toast("Import failed.", true);
  } finally {
    submitImportBtn.disabled = false;
    submitImportBtn.textContent = "Upload & Import";
  }
});

async function duplicateTransaction(tx) {
  toast("Entry duplicated.");
  try {
    const res = await api(`/api/transactions/${tx.id}/duplicate`, { method: "POST" });
    if (res && res.alert) {
      const a = res.alert;
      const msg = a.exceeded
        ? `Budget alert — ${a.category} is over its limit (${money(a.spent)} / ${money(a.limit)}).`
        : `Heads up — ${a.category} is near its limit (${money(a.spent)} / ${money(a.limit)}).`;
      toast(msg, true);
    }
    refreshAll();
  } catch (err) {
    toast(err.message, true);
    refreshAll();
  }
}

// ---------------------------------------------------------------------
// Global Power-User Keyboard Shortcuts
// ---------------------------------------------------------------------
document.addEventListener("keydown", (e) => {
  if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) {
    if (e.key === "Escape") document.activeElement.blur();
    return;
  }
  const key = e.key.toLowerCase();
  if (key === "n") {
    e.preventDefault();
    switchTab("ledger");
    entryForm.date.focus();
  } else if (key === "/") {
    e.preventDefault();
    switchTab("ledger");
    el("searchBox").focus();
  } else if (key === "1") {
    switchTab("ledger");
  } else if (key === "2") {
    switchTab("budgets");
  } else if (key === "p") {
    applyPrivacy(!state.privacy);
  } else if (key === "x") {
    applyFx(!state.convertFx);
  }

});

async function refreshAll() {
  if (!state.user) return;
  await Promise.all([refreshSummary(), refreshTransactions(), refreshBudgets()]);
}

// Quick amount chips listener
document.querySelectorAll(".chip-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const addVal = Number(btn.dataset.add) || 0;
    const currentVal = Number(entryForm.amount.value) || 0;
    entryForm.amount.value = (currentVal + addVal).toFixed(2);
  });
});

// Clickable Month Picker
const monthLabelEl = el("monthLabel");
const monthPickerEl = el("monthPicker");
if (monthLabelEl && monthPickerEl) {
  monthLabelEl.addEventListener("click", () => {
    monthPickerEl.value = state.month;
    try {
      if (typeof monthPickerEl.showPicker === "function") {
        monthPickerEl.showPicker();
      } else {
        monthPickerEl.click();
      }
    } catch (_) {
      monthPickerEl.focus();
    }
  });
  monthPickerEl.addEventListener("change", (e) => {
    if (e.target.value) {
      state.month = e.target.value;
      monthLabelEl.textContent = monthLabel();
      refreshAll();
    }
  });
}

// ---------------------------------------------------------------------
// Auth Handlers & Modal
// ---------------------------------------------------------------------
async function checkAuth() {
  try {
    const res = await api("/api/auth/me");
    if (res.user) {
      state.user = res.user;
      el("authModal").hidden = true;
      const showAuthBtn = el("showAuthBtn");
      if (showAuthBtn) showAuthBtn.hidden = true;
      el("userBadge").hidden = false;
      el("userNameLabel").textContent = res.user.username;

      const currSel = el("userCurrencySelect");
      if (currSel && res.user.currency) {
        currSel.value = res.user.currency;
      }
      await refreshAll();
    } else {
      showAuthModal();
    }
  } catch (_) {
    showAuthModal();
  }
}

function showAuthModal() {
  state.user = null;
  el("userBadge").hidden = true;
  const showAuthBtn = el("showAuthBtn");
  if (showAuthBtn) showAuthBtn.hidden = false;
  el("authModal").hidden = false;
}

const showAuthBtn = el("showAuthBtn");
if (showAuthBtn) {
  showAuthBtn.addEventListener("click", () => {
    el("authModal").hidden = false;
  });
}

const userCurrencySelect = el("userCurrencySelect");
if (userCurrencySelect) {
  userCurrencySelect.addEventListener("change", async (e) => {
    const newCurr = e.target.value;
    if (!state.user) return;
    try {
      const res = await api("/api/user/currency", { method: "PUT", body: JSON.stringify({ currency: newCurr }) });
      state.user.currency = res.user.currency;

      const promptLabel = state.convertFx ? "Switch to 1:1 Direct Amounts" : "Enable Live FX Rates";
      toast(`Currency changed to ${res.user.currency}`, false, {
        text: promptLabel,
        onClick: () => {
          applyFx(!state.convertFx);
        }
      });
      await refreshAll();
    } catch (err) {
      toast(err.message, true);
    }
  });
}

document.querySelectorAll(".auth-tab").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    document.querySelectorAll(".auth-tab").forEach((t) => t.classList.remove("active"));
    btn.classList.add("active");
    state.authMode = btn.dataset.authtab;

    const isReg = state.authMode === "register";
    el("templateSelectGroup").hidden = !isReg;
    const currGrp = el("currencySelectGroup");
    if (currGrp) currGrp.hidden = !isReg;
    el("authSubmitBtn").textContent = isReg ? "Create Account & Open Ledger" : "Sign In to Ledger";
    el("authError").hidden = true;
  });
});

const authForm = el("authForm");
if (authForm) {
  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = el("authUsername").value.trim();
    const password = el("authPassword").value;
    const template = el("authTemplate").value;
    const currency = el("authCurrency") ? el("authCurrency").value : "$";
    const errEl = el("authError");
    errEl.hidden = true;

    try {
      const path = state.authMode === "register" ? "/api/auth/register" : "/api/auth/login";
      const payload = state.authMode === "register" ? { username, password, template, currency } : { username, password };
      const res = await api(path, { method: "POST", body: JSON.stringify(payload) });

      state.user = res.user;
      el("authModal").hidden = true;
      const showBtn = el("showAuthBtn");
      if (showBtn) showBtn.hidden = true;
      el("userBadge").hidden = false;
      el("userNameLabel").textContent = res.user.username;
      const currSel = el("userCurrencySelect");
      if (currSel && res.user.currency) {
        currSel.value = res.user.currency;
      }
      toast(`Welcome, ${res.user.username}!`);
      await refreshAll();
    } catch (err) {
      errEl.textContent = err.message || "Authentication failed.";
      errEl.hidden = false;
    }
  });
}

const googleAuthBtn = el("googleAuthBtn");
if (googleAuthBtn) {
  googleAuthBtn.addEventListener("click", async () => {
    const template = el("authTemplate") ? el("authTemplate").value : "salaried";
    const currency = el("authCurrency") ? el("authCurrency").value : "$";
    const errEl = el("authError");
    if (errEl) errEl.hidden = true;

    try {
      let authPayload = null;

      // 1. Check if Firebase is initialized with real API key
      const isFirebaseConfigured = typeof firebase !== "undefined" && firebase.auth && window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey;


      if (isFirebaseConfigured) {
        toast("Opening Google Sign-In popup...");
        const provider = new firebase.auth.GoogleAuthProvider();
        const result = await firebase.auth().signInWithPopup(provider);
        const fbUser = result.user;
        const idToken = await fbUser.getIdToken();

        authPayload = {
          google_id: fbUser.uid,
          email: fbUser.email,
          name: fbUser.displayName || "",
          idToken: idToken,
          template,
          currency,
        };
      } else {
        // Fallback for testing before Firebase keys are pasted
        const userEmail = prompt("Firebase keys not set yet. Enter your Google Email to sign in (or click OK for default):", "user.google@ledger.internal");
        if (userEmail === null) return;
        const cleanEmail = userEmail.trim() || "user.google@ledger.internal";

        authPayload = {
          google_id: "google_" + btoa(cleanEmail).replace(/=/g, ""),
          email: cleanEmail,
          name: cleanEmail.split("@")[0],
          template,
          currency,
        };
      }

      const res = await api("/api/auth/google", {
        method: "POST",
        body: JSON.stringify(authPayload),
      });

      state.user = res.user;
      el("authModal").hidden = true;
      const showBtn = el("showAuthBtn");
      if (showBtn) showBtn.hidden = true;
      el("userBadge").hidden = false;
      el("userNameLabel").textContent = res.user.username;
      const currSel = el("userCurrencySelect");
      if (currSel && res.user.currency) {
        currSel.value = res.user.currency;
      }
      toast(`Signed in as ${res.user.username}`);
      await refreshAll();
    } catch (err) {
      if (errEl) {
        errEl.textContent = err.message || "Google Authentication failed.";
        errEl.hidden = false;
      }
      toast(err.message || "Google Sign-In failed", true);
    }
  });
}


const logoutBtn = el("logoutBtn");

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
      toast("Logged out.");
    } catch (_) {}
    showAuthModal();
  });
}

applyPrivacy(localStorage.getItem("pocketledger_privacy") === "true");
applyFx(localStorage.getItem("pocketledger_fx") === "true");
resetEntryForm();
el("monthLabel").textContent = monthLabel();
checkAuth();

