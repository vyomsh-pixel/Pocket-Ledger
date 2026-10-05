const API_BASE = "/api";

async function fetchJSON(url, options = {}) {
  const defaults = {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    credentials: "include", // essential for Flask session cookie!
  };
  const res = await fetch(url, { ...defaults, ...options });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const message = (typeof errorData.error === "object" && errorData.error !== null)
      ? errorData.error.message
      : (errorData.error || `Request failed with status ${res.status}`);
    const err = new Error(message);
    err.code = errorData.code;
    err.details = errorData.details;
    throw err;
  }
  return res.json();
}

// --- Auth ---

export async function getAuthMe() {
  try {
    return await fetchJSON(`${API_BASE}/auth/me`);
  } catch {
    return null;
  }
}

export async function loginUser(username, password) {
  return fetchJSON(`${API_BASE}/auth/login`, {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function registerUser(username, password, template = "salaried", currency = "$") {
  return fetchJSON(`${API_BASE}/auth/register`, {
    method: "POST",
    body: JSON.stringify({ username, password, template, currency }),
  });
}

export async function logoutUser() {
  return fetchJSON(`${API_BASE}/auth/logout`, { method: "POST" });
}

export async function updatePreferredCurrency(currency) {
  return fetchJSON(`${API_BASE}/user/currency`, {
    method: "PUT",
    body: JSON.stringify({ currency }),
  });
}

// --- Ledger Core ---

export async function getSummary(month) {
  const query = month ? `?month=${encodeURIComponent(month)}` : "";
  return fetchJSON(`${API_BASE}/summary${query}`);
}

export async function getTransactions(month, category = "") {
  let url = `${API_BASE}/transactions`;
  const params = [];
  if (month) params.push(`month=${encodeURIComponent(month)}`);
  if (category) params.push(`category=${encodeURIComponent(category)}`);
  if (params.length) url += `?${params.join("&")}`;
  return fetchJSON(url);
}

export async function addTransaction(tx) {
  return fetchJSON(`${API_BASE}/transactions`, {
    method: "POST",
    body: JSON.stringify(tx),
  });
}

export async function editTransaction(id, tx) {
  return fetchJSON(`${API_BASE}/transactions/${id}`, {
    method: "PUT",
    body: JSON.stringify(tx),
  });
}

export async function deleteTransaction(id) {
  return fetchJSON(`${API_BASE}/transactions/${id}`, {
    method: "DELETE",
  });
}

export async function duplicateTransaction(id) {
  return fetchJSON(`${API_BASE}/transactions/${id}/duplicate`, {
    method: "POST",
  });
}

// --- Budgets ---

export async function getBudgets(month) {
  const query = month ? `?month=${encodeURIComponent(month)}` : "";
  return fetchJSON(`${API_BASE}/budgets${query}`);
}

export async function setBudget(category, monthly_limit) {
  return fetchJSON(`${API_BASE}/budgets`, {
    method: "POST",
    body: JSON.stringify({ category, monthly_limit }),
  });
}

export async function deleteBudget(category) {
  return fetchJSON(`${API_BASE}/budgets/${encodeURIComponent(category)}`, {
    method: "DELETE",
  });
}
