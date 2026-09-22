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

const CAT_PALETTE = [
  "#C25E3E", // Terracotta Clay
  "#6C8B74", // Sage Matcha
  "#D99B56", // Ochre / Warm Sand
  "#58728C", // Indigo Slate
  "#8E5B75", // Muted Plum
  "#8B6D55", // Raw Umber
  "#5C7B88", // Ocean Mineral
  "#7A8B67", // Olive Moss
];

const state = {
  user: null,
  authMode: "login",
  month: new Date().toISOString().slice(0, 7), // "YYYY-MM"
  editingId: null,
  selectedImportFile: null,
  budgetedCategories: [],
  categoryFilter: null,
  selectedTxIndex: -1,
  currentSummary: null,
  convertFx: localStorage.getItem("pocketledger_fx") === "true", // false by default (Nominal 1:1 direct numbers)
};

function animateValue(elem, start, end, duration = 400, formatFn = money) {
  if (!elem) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || isNaN(start) || start === end) {
    elem.textContent = formatFn(end);
    elem._currentVal = end;
    return;
  }
  const startTime = performance.now();
  const change = end - start;
  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    const current = start + change * ease;
    elem.textContent = formatFn(current);
    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      elem.textContent = formatFn(end);
      elem._currentVal = end;
    }
  }
  requestAnimationFrame(step);
}

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

let selectedSuggestionIndex = -1;

// Wire Category Input Events
const categoryInput = el("categoryInput");
if (categoryInput) {
  categoryInput.addEventListener("focus", updateCategorySuggestions);
  categoryInput.addEventListener("input", updateCategorySuggestions);
  categoryInput.addEventListener("keydown", (e) => {
    const dropdown = el("categoryCustomDropdown");
    if (!dropdown || dropdown.hidden) return;
    const items = dropdown.querySelectorAll(".dropdown-item");
    if (items.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedSuggestionIndex = (selectedSuggestionIndex + 1) % items.length;
      items.forEach((it, idx) => it.classList.toggle("active", idx === selectedSuggestionIndex));
      items[selectedSuggestionIndex]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedSuggestionIndex = (selectedSuggestionIndex - 1 + items.length) % items.length;
      items.forEach((it, idx) => it.classList.toggle("active", idx === selectedSuggestionIndex));
      items[selectedSuggestionIndex]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && selectedSuggestionIndex >= 0) {
      e.preventDefault();
      const selItem = items[selectedSuggestionIndex];
      if (selItem && selItem.dataset.value) {
        categoryInput.value = selItem.dataset.value;
        dropdown.hidden = true;
      }
    } else if (e.key === "Escape") {
      dropdown.hidden = true;
    }
  });
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
  if (btn) {
    btn.textContent = `privacy: ${isPrivate ? "on" : "off"}`;
    btn.classList.toggle("active", isPrivate);
  }
}

el("privacyToggleBtn").addEventListener("click", () => applyPrivacy(!state.privacy));

// ---------------------------------------------------------------------
// FX Mode Toggle (Nominal 1:1 vs Live Rate Conversion)
// ---------------------------------------------------------------------
function applyFx(isFxLive) {
  state.convertFx = isFxLive;
  localStorage.setItem("pocketledger_fx", isFxLive ? "true" : "false");
  const btn = el("fxToggleBtn");
  if (btn) {
    btn.textContent = `fx: ${isFxLive ? "live" : "off"}`;
    btn.classList.toggle("active", isFxLive);
  }
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

  const prevNet = typeof el("netBalance")._currentVal === "number" ? el("netBalance")._currentVal : s.net;
  const prevInc = typeof el("totalIncome")._currentVal === "number" ? el("totalIncome")._currentVal : s.income;
  const prevExp = typeof el("totalExpense")._currentVal === "number" ? el("totalExpense")._currentVal : s.expense;

  animateValue(el("netBalance"), prevNet, s.net, 400, money);
  animateValue(el("totalIncome"), prevInc, s.income, 400, money);
  animateValue(el("totalExpense"), prevExp, s.expense, 400, money);

  const savingsRate = s.income > 0 ? Math.round(((s.income - s.expense) / s.income) * 1000) / 10 : 0;
  const prevSav = typeof el("savingsRateVal")._currentVal === "number" ? el("savingsRateVal")._currentVal : savingsRate;
  animateValue(el("savingsRateVal"), prevSav, savingsRate, 400, (v) => `${(Math.round(v * 10) / 10).toFixed(1)}%`);

  // Daily Pace Calculation
  const [y, m] = state.month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const dailyPace = Math.round(s.expense / daysInMonth);
  const prevPace = typeof el("dailyPaceVal")._currentVal === "number" ? el("dailyPaceVal")._currentVal : dailyPace;
  animateValue(el("dailyPaceVal"), prevPace, dailyPace, 400, (v) => `${money(v)}/day`);

  // Sidebar updates with ticker
  const sbNet = el("sbNetVal");
  const sbSav = el("sbSavingsVal");
  const sbPace = el("sbPaceVal");
  if (sbNet) animateValue(sbNet, prevNet, s.net, 400, money);
  if (sbSav) animateValue(sbSav, prevSav, savingsRate, 400, (v) => `${(Math.round(v * 10) / 10).toFixed(1)}%`);
  if (sbPace) animateValue(sbPace, prevPace, dailyPace, 400, (v) => `${money(v)}/day`);

  // Print Statement updates
  const pNet = el("printNet");
  const pMonth = el("printMonth");
  const pUser = el("printUser");
  const pSavings = el("printSavings");
  const pDate = el("printStatementDate");
  if (pNet) pNet.textContent = money(s.net);
  if (pMonth) pMonth.textContent = monthLabel();
  if (pUser) pUser.textContent = state.user?.username || "Authorized User";
  if (pSavings) pSavings.textContent = `${savingsRate}%`;
  if (pDate) pDate.textContent = `Generated on ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  const heroEl = document.querySelector(".balance-hero");
  if (heroEl) {
    heroEl.classList.remove("positive", "negative");
    if (s.net > 0) heroEl.classList.add("positive");
    else if (s.net < 0) heroEl.classList.add("negative");
  }

  updatePersonaTag(savingsRate);
  renderCategoryBreakdown(s);
}

async function refreshSummary() {
  if (!state.user) return;
  const s = await api(`/api/summary?month=${state.month}`);
  updateSummaryDOM(s);
}

function updatePersonaTag(savingsRate) {
  const textEl = el("userPersonaText");
  const tag = el("userPersonaTag");
  if (!tag) return;
  let persona = "Balanced Allocator";
  if (savingsRate >= 35) {
    persona = "Zen Strategist";
  } else if (savingsRate >= 15) {
    persona = "Capital Builder";
  } else if (savingsRate >= 0) {
    persona = "Balanced Allocator";
  } else {
    persona = "Active Restructurer";
  }
  if (textEl) {
    textEl.textContent = persona;
  } else {
    tag.textContent = persona;
  }
}

function toggleCategoryFilter(catName) {
  if (state.categoryFilter && state.categoryFilter.toLowerCase() === catName.toLowerCase()) {
    state.categoryFilter = null;
  } else {
    state.categoryFilter = catName;
    switchTab("ledger");
  }
  if (state.currentSummary) renderCategoryBreakdown(state.currentSummary);
  refreshTransactions();
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

  const totalSpent = rows.reduce((sum, r) => sum + r.total, 0);

  // 1. Interactive SVG Donut Chart
  const donutWrap = document.createElement("div");
  donutWrap.className = "donut-wrap";

  const radius = 58;
  const circ = 2 * Math.PI * radius; // ~364.425
  let runningOffset = 0;

  let segmentsSvg = "";
  rows.forEach((r, idx) => {
    const color = CAT_PALETTE[idx % CAT_PALETTE.length];
    const pct = totalSpent > 0 ? r.total / totalSpent : 0;
    const dash = pct * circ;
    const offset = runningOffset * circ;
    runningOffset += pct;

    const isActive = state.categoryFilter && state.categoryFilter.toLowerCase() === r.category.toLowerCase();
    segmentsSvg += `
      <circle
        cx="80" cy="80" r="${radius}"
        stroke="${color}"
        stroke-width="16"
        fill="none"
        stroke-dasharray="${dash} ${circ}"
        stroke-dashoffset="-${offset}"
        class="donut-segment ${isActive ? "cat-active" : ""}"
        data-cat="${escapeHtml(r.category)}"
        data-amount="${r.total}"
      />
    `;
  });

  const activeRow = state.categoryFilter ? rows.find((r) => r.category.toLowerCase() === state.categoryFilter.toLowerCase()) : null;
  const initialLabel = activeRow ? activeRow.category.slice(0, 11) : "EXPENSES";
  const initialVal = activeRow ? money(activeRow.total) : money(totalSpent);

  donutWrap.innerHTML = `
    <svg class="donut-svg" viewBox="0 0 160 160">
      <circle class="donut-bg" cx="80" cy="80" r="${radius}" stroke-width="16" fill="none" />
      <g transform="rotate(-90 80 80)">
        ${segmentsSvg}
      </g>
      <text x="80" y="74" text-anchor="middle" class="donut-center-label" id="donutCenterLabel">${escapeHtml(initialLabel)}</text>
      <text x="80" y="94" text-anchor="middle" class="donut-center-val blur-target" id="donutCenterVal">${initialVal}</text>
    </svg>
  `;

  box.appendChild(donutWrap);

  const centerLabel = donutWrap.querySelector("#donutCenterLabel");
  const centerVal = donutWrap.querySelector("#donutCenterVal");

  function resetCenter() {
    const currentActive = state.categoryFilter ? rows.find((r) => r.category.toLowerCase() === state.categoryFilter.toLowerCase()) : null;
    if (centerLabel) centerLabel.textContent = currentActive ? currentActive.category.slice(0, 11) : "EXPENSES";
    if (centerVal) centerVal.textContent = currentActive ? money(currentActive.total) : money(totalSpent);
  }

  // Hover & click listeners on donut segments
  donutWrap.querySelectorAll(".donut-segment").forEach((seg) => {
    seg.addEventListener("mouseenter", () => {
      if (centerLabel) centerLabel.textContent = seg.dataset.cat.slice(0, 11);
      if (centerVal) centerVal.textContent = money(Number(seg.dataset.amount));
    });
    seg.addEventListener("mouseleave", resetCenter);
    seg.addEventListener("click", () => {
      toggleCategoryFilter(seg.dataset.cat);
    });
  });

  // 2. Category list items below donut
  const max = Math.max(...rows.map((r) => r.total));
  rows.forEach((r, idx) => {
    const color = CAT_PALETTE[idx % CAT_PALETTE.length];
    let pct, cls;
    if (r.limit && r.limit > 0) {
      pct = Math.min(100, (r.total / r.limit) * 100);
      cls = r.exceeded ? "over" : r.at_limit ? "at" : r.near_limit ? "near" : "";
    } else {
      pct = max > 0 ? (r.total / max) * 100 : 0;
      cls = "";
    }
    const isActive = state.categoryFilter && state.categoryFilter.toLowerCase() === r.category.toLowerCase();
    const div = document.createElement("div");
    div.className = `cat-row ${isActive ? "cat-active" : ""}`;
    div.title = `Click to filter transactions by ${r.category}`;
    div.innerHTML = `
      <div class="cat-row-top">
        <span class="cat-name-wrap">
          <span class="cat-color-dot" style="background:${color}"></span>
          <span>${escapeHtml(r.category)}</span>
        </span>
        <span class="cat-amount ${cls} blur-target">
          ${money(r.total)}${r.limit ? ` <span class="cat-limit">/ ${money(r.limit)}</span>` : ""}
        </span>
      </div>
      <div class="cat-bar-track"><div class="cat-bar-fill ${cls}" style="width:${pct}%; ${!cls ? `background:${color};` : ""}"></div></div>
    `;

    div.addEventListener("click", () => {
      toggleCategoryFilter(r.category);
    });
    div.addEventListener("mouseenter", () => {
      if (centerLabel) centerLabel.textContent = r.category.slice(0, 11);
      if (centerVal) centerVal.textContent = money(r.total);
    });
    div.addEventListener("mouseleave", resetCenter);

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

  const filteredRows = state.categoryFilter
    ? rows.filter((tx) => tx.category && tx.category.toLowerCase() === state.categoryFilter.toLowerCase())
    : rows;

  const filterBar = el("categoryFilterBar");
  if (filterBar) {
    if (state.categoryFilter) {
      filterBar.hidden = false;
      const catNameEl = el("catFilterName");
      if (catNameEl) catNameEl.textContent = state.categoryFilter;
    } else {
      filterBar.hidden = true;
    }
  }

  state.selectedTxIndex = -1;

  if (filteredRows.length === 0) {
    empty.hidden = false;
    const desc = empty.querySelector(".empty-state-desc");
    if (desc) {
      desc.textContent = state.categoryFilter
        ? `No transactions found under "${state.categoryFilter}". Press Esc or click clear.`
        : "Record your first entry above or press N to begin.";
    }
    return;
  }
  empty.hidden = true;

  filteredRows.forEach((tx) => {
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
        : a.at_limit
        ? `Heads up — ${a.category} has reached its limit (${money(a.spent)} / ${money(a.limit)}).`
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
    const cls = b.exceeded ? "over" : b.at_limit ? "at" : b.near_limit ? "near" : "";
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
      ${cls ? `<div class="budget-flag ${cls}">${b.exceeded ? "Over budget" : b.at_limit ? "At limit" : "Near limit"}</div>` : ""}
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
        : a.at_limit
        ? `Heads up — ${a.category} has reached its limit (${money(a.spent)} / ${money(a.limit)}).`
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
function updateSelectedTx(newIndex) {
  const rows = document.querySelectorAll("#txList .tx-row");
  if (rows.length === 0) {
    state.selectedTxIndex = -1;
    return;
  }
  rows.forEach((r) => r.classList.remove("keyboard-selected"));
  if (newIndex < 0) newIndex = 0;
  if (newIndex >= rows.length) newIndex = rows.length - 1;
  state.selectedTxIndex = newIndex;
  const target = rows[newIndex];
  if (target) {
    target.classList.add("keyboard-selected");
    target.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

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
  } else if (key === "j") {
    e.preventDefault();
    updateSelectedTx(state.selectedTxIndex + 1);
  } else if (key === "k") {
    e.preventDefault();
    updateSelectedTx(state.selectedTxIndex - 1);
  } else if (key === "e") {
    if (state.selectedTxIndex >= 0) {
      e.preventDefault();
      const rows = document.querySelectorAll("#txList .tx-row");
      const target = rows[state.selectedTxIndex];
      if (target) {
        const editBtn = target.querySelector(".tx-edit");
        if (editBtn) editBtn.click();
      }
    }
  } else if (key === "c") {
    if (state.selectedTxIndex >= 0) {
      e.preventDefault();
      const rows = document.querySelectorAll("#txList .tx-row");
      const target = rows[state.selectedTxIndex];
      if (target) {
        const dupBtn = target.querySelector(".tx-dup");
        if (dupBtn) dupBtn.click();
      }
    }
  } else if (key === "d" || e.key === "Delete" || e.key === "Backspace") {
    if (state.selectedTxIndex >= 0) {
      e.preventDefault();
      const rows = document.querySelectorAll("#txList .tx-row");
      const target = rows[state.selectedTxIndex];
      if (target) {
        const delBtn = target.querySelector(".tx-delete");
        if (delBtn) delBtn.click();
      }
    }
  } else if (e.key === "?" || (e.shiftKey && key === "/")) {
    e.preventDefault();
    const sm = el("shortcutsModal");
    if (sm) sm.hidden = !sm.hidden;
  } else if (e.key === "Escape") {
    const sm = el("shortcutsModal");
    const im = el("importModal");
    const am = el("authModal");
    if (sm && !sm.hidden) {
      sm.hidden = true;
    } else if (im && !im.hidden) {
      im.hidden = true;
    } else if (am && !am.hidden && state.user) {
      am.hidden = true;
    } else if (state.categoryFilter) {
      state.categoryFilter = null;
      if (state.currentSummary) renderCategoryBreakdown(state.currentSummary);
      refreshTransactions();
    } else if (state.selectedTxIndex >= 0) {
      state.selectedTxIndex = -1;
      document.querySelectorAll("#txList .tx-row").forEach((r) => r.classList.remove("keyboard-selected"));
    }
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
function applyUserToUI(user) {
  state.user = user;
  const authModal = el("authModal");
  if (authModal) authModal.hidden = true;
  const showAuthBtn = el("showAuthBtn");
  if (showAuthBtn) showAuthBtn.hidden = true;
  const userBadge = el("userBadge");
  if (userBadge) userBadge.hidden = false;

  const nameLabel = el("userNameLabel");
  if (nameLabel) {
    nameLabel.textContent = user.username;
    nameLabel.title = user.username;
  }

  const initialEl = el("userAvatarInitial");
  if (initialEl) {
    const raw = (user.username || "U").trim();
    initialEl.textContent = raw.charAt(0).toUpperCase() || "U";
  }

  const currSel = el("userCurrencySelect");
  if (currSel && user.currency) {
    currSel.value = user.currency;
  }
}

async function checkAuth() {
  try {
    const res = await api("/api/auth/me");
    if (res.user) {
      applyUserToUI(res.user);
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

      applyUserToUI(res.user);
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


      const isLocalhost = ["localhost", "127.0.0.1"].includes(window.location.hostname);

      if (isFirebaseConfigured) {
        toast("Opening Google Sign-In popup...");
        const provider = new firebase.auth.GoogleAuthProvider();
        const result = await firebase.auth().signInWithPopup(provider);
        const fbUser = result.user;
        const idToken = await fbUser.getIdToken();

        authPayload = {
          idToken: idToken,
          google_id: fbUser.uid,
          email: fbUser.email,
          template,
          currency,
        };
      } else if (isLocalhost) {
        // Local Dev Mode Fallback
        const userEmail = prompt("Local Dev Mode: Enter Google Email for test sign-in:", "dev@ledger.internal");
        if (!userEmail) return;
        const cleanEmail = userEmail.trim();

        authPayload = {
          google_id: "google_" + btoa(cleanEmail).replace(/=/g, ""),
          email: cleanEmail,
          template,
          currency,
        };
      } else {
        toast("Google Sign-In is unavailable because Firebase is not configured.", true);
        return;
      }


      const res = await api("/api/auth/google", {
        method: "POST",
        body: JSON.stringify(authPayload),
      });

      applyUserToUI(res.user);
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

const catFilterClearBtn = el("catFilterClearBtn");
if (catFilterClearBtn) {
  catFilterClearBtn.addEventListener("click", () => {
    state.categoryFilter = null;
    if (state.currentSummary) renderCategoryBreakdown(state.currentSummary);
    refreshTransactions();
  });
}

const closeShortcutsModalBtn = el("closeShortcutsModalBtn");
if (closeShortcutsModalBtn) {
  closeShortcutsModalBtn.addEventListener("click", () => {
    const sm = el("shortcutsModal");
    if (sm) sm.hidden = true;
  });
}

applyPrivacy(localStorage.getItem("pocketledger_privacy") === "true");
applyFx(localStorage.getItem("pocketledger_fx") === "true");
resetEntryForm();
el("monthLabel").textContent = monthLabel();
checkAuth();

