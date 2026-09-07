"""
services.py — Business logic for PocketLedger.

This module implements every functional requirement in the SRS (see
docs/SRS.docx, section 6): adding/editing/deleting/listing transactions,
budgeting, and monthly reporting. It is deliberately kept independent of
any UI (CLI, future GUI, or tests) so it can be exercised directly.
"""
from datetime import datetime
from typing import Optional
from werkzeug.security import generate_password_hash, check_password_hash

from .models import Transaction, Budget, User, today_iso

VALID_TYPES = ("income", "expense")

STARTER_TEMPLATES = {
    "salaried": [
        ("Rent & Housing", 25000.0),
        ("Food & Dining", 15000.0),
        ("Utilities", 5000.0),
        ("Transport", 4000.0),
        ("Shopping", 8000.0),
        ("Investments", 20000.0),
    ],
    "freelance": [
        ("Software & Tools", 5000.0),
        ("Workspace / Office", 10000.0),
        ("Marketing & Ads", 8000.0),
        ("Food & Dining", 12000.0),
        ("Tax Reserves", 15000.0),
    ],
    "minimalist": [
        ("Groceries", 8000.0),
        ("Rent / Living", 15000.0),
        ("Utilities", 3000.0),
        ("Personal Care", 4000.0),
    ],
}


class ValidationError(Exception):
    """Raised when caller-supplied data fails a business rule."""


# ---------------------------------------------------------------------------
# User Authentication & Management
# ---------------------------------------------------------------------------

def create_user(conn, username: str, password: str, template: str = "salaried", currency: str = "$") -> User:
    if not username or not username.strip():
        raise ValidationError("Username cannot be empty.")
    if not password or len(password) < 4:
        raise ValidationError("Password must be at least 4 characters long.")

    username = username.strip().lower()
    currency = (currency or "$").strip()
    if not currency:
        currency = "$"

    existing = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if existing:
        raise ValidationError(f"Username '{username}' is already taken.")

    pwd_hash = generate_password_hash(password)
    now_str = today_iso()
    conn.execute(
        "INSERT INTO users (username, password_hash, created_at, currency) VALUES (?, ?, ?, ?)",
        (username, pwd_hash, now_str, currency),
    )
    conn.commit()

    row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    user = User.from_row(row) if row else None
    if not user:
        raise ValidationError("Failed to create user.")

    return user



def update_user_currency(conn, user_id: int, currency: str) -> User:
    currency = (currency or "$").strip()
    if not currency:
        raise ValidationError("Currency symbol cannot be empty.")
    conn.execute("UPDATE users SET currency = ? WHERE id = ?", (currency, user_id))
    conn.commit()
    user = get_user_by_id(conn, user_id)
    if not user:
        raise ValidationError("User not found.")
    return user


def authenticate_user(conn, username: str, password: str) -> Optional[User]:
    if not username or not password:
        return None
    username = username.strip().lower()
    row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if not row:
        return None
    user = User.from_row(row)
    if check_password_hash(user.password_hash, password):
        return user
    return None


def get_or_create_google_user(conn, google_id: str, email: str, name: str = "", template: str = "salaried", currency: str = "$") -> User:
    if not google_id or not email:
        raise ValidationError("Invalid Google authentication payload.")

    email = email.strip().lower()
    currency = (currency or "$").strip()

    # 1. Look up by google_id
    row = conn.execute("SELECT * FROM users WHERE google_id = ?", (google_id,)).fetchone()
    if row:
        return User.from_row(row)

    # 2. Look up by email / username
    row = conn.execute("SELECT * FROM users WHERE username = ?", (email,)).fetchone()
    if row:
        user = User.from_row(row)
        conn.execute("UPDATE users SET google_id = ? WHERE id = ?", (google_id, user.id))
        conn.commit()
        return get_user_by_id(conn, user.id)

    # 3. Create new user for Google Sign In
    now_str = today_iso()
    pwd_hash = generate_password_hash(f"google_oauth_{google_id}")
    conn.execute(
        "INSERT INTO users (username, password_hash, created_at, currency, google_id) VALUES (?, ?, ?, ?, ?)",
        (email, pwd_hash, now_str, currency, google_id),
    )
    conn.commit()

    row = conn.execute("SELECT * FROM users WHERE google_id = ?", (google_id,)).fetchone()
    if not row:
        row = conn.execute("SELECT * FROM users WHERE username = ?", (email,)).fetchone()
    if not row:
        raise ValidationError("Failed to create Google user.")
    user = User.from_row(row)
    return user


def get_user_by_id(conn, user_id: int) -> Optional[User]:
    try:
        user_id = int(user_id)
    except (ValueError, TypeError):
        return None
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return User.from_row(row) if row else None



def seed_user_starter_template(conn, user_id: int, template_name: str = "salaried"):
    items = STARTER_TEMPLATES.get(template_name.lower(), STARTER_TEMPLATES["salaried"])
    for cat, limit in items:
        set_budget(conn, user_id, cat, limit)



# ---------------------------------------------------------------------------
# Transaction CRUD  (FR-1, FR-2, FR-3, FR-4)
# ---------------------------------------------------------------------------

def add_transaction(conn, user_id: int, *, date: str, type: str, category: str,
                     amount: float, note: str = "") -> Transaction:
    _validate_date(date)
    _validate_type(type)
    _validate_amount(amount)
    if not category or not category.strip():
        raise ValidationError("Category cannot be empty.")

    cur = conn.execute(
        "INSERT INTO transactions (user_id, date, type, category, amount, note) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, date, type, category.strip().title(), amount, note.strip()),
    )
    conn.commit()
    return get_transaction(conn, user_id, cur.lastrowid)


def get_transaction(conn, user_id: int, tx_id: int) -> Optional[Transaction]:
    row = conn.execute(
        "SELECT * FROM transactions WHERE id = ? AND user_id = ?", (tx_id, user_id)
    ).fetchone()
    return Transaction.from_row(row) if row else None


def edit_transaction(conn, user_id: int, tx_id: int, **fields) -> Transaction:
    existing = get_transaction(conn, user_id, tx_id)
    if existing is None:
        raise ValidationError(f"No transaction with id {tx_id}.")

    date = fields.get("date", existing.date)
    type_ = fields.get("type", existing.type)
    category = fields.get("category", existing.category)
    amount = fields.get("amount", existing.amount)
    note = fields.get("note", existing.note)

    _validate_date(date)
    _validate_type(type_)
    _validate_amount(amount)

    conn.execute(
        "UPDATE transactions SET date=?, type=?, category=?, amount=?, note=? "
        "WHERE id=? AND user_id=?",
        (date, type_, category.strip().title(), amount, note, tx_id, user_id),
    )
    conn.commit()
    return get_transaction(conn, user_id, tx_id)


def delete_transaction(conn, user_id: int, tx_id: int) -> bool:
    cur = conn.execute("DELETE FROM transactions WHERE id = ? AND user_id = ?", (tx_id, user_id))
    conn.commit()
    return cur.rowcount > 0


def duplicate_transaction(conn, user_id: int, tx_id: int) -> Transaction:
    existing = get_transaction(conn, user_id, tx_id)
    if existing is None:
        raise ValidationError(f"No transaction with id {tx_id}.")
    note_copy = f"{existing.note} (Copy)".strip() if existing.note else "Copy"
    return add_transaction(
        conn,
        user_id,
        date=existing.date,
        type=existing.type,
        category=existing.category,
        amount=existing.amount,
        note=note_copy,
    )


def list_transactions(conn, user_id: int, *, category: str = None, type: str = None,
                       start_date: str = None, end_date: str = None,
                       keyword: str = None, limit: Optional[int] = None,
                       offset: Optional[int] = None) -> list[Transaction]:
    """FR-2 / FR-5: list with optional filters, search, and pagination."""
    query = "SELECT * FROM transactions WHERE user_id = ?"
    params: list = [user_id]

    if category:
        query += " AND category = ?"
        params.append(category.strip().title())
    if type:
        _validate_type(type)
        query += " AND type = ?"
        params.append(type)
    if start_date:
        query += " AND date >= ?"
        params.append(start_date)
    if end_date:
        query += " AND date <= ?"
        params.append(end_date)
    if keyword:
        query += " AND (note LIKE ? OR category LIKE ?)"
        like = f"%{keyword}%"
        params.extend([like, like])

    query += " ORDER BY date DESC, id DESC"

    if limit is not None and limit > 0:
        query += " LIMIT ?"
        params.append(limit)
        if offset is not None and offset >= 0:
            query += " OFFSET ?"
            params.append(offset)

    rows = conn.execute(query, params).fetchall()
    return [Transaction.from_row(r) for r in rows]


# ---------------------------------------------------------------------------
# Budgeting  (FR-6, FR-7)
# ---------------------------------------------------------------------------

def set_budget(conn, user_id: int, category: str, monthly_limit: float) -> Budget:
    if monthly_limit <= 0:
        raise ValidationError("Monthly limit must be positive.")
    category = category.strip().title()
    conn.execute(
        "INSERT INTO budgets (user_id, category, monthly_limit) VALUES (?, ?, ?) "
        "ON CONFLICT(user_id, category) DO UPDATE SET monthly_limit=excluded.monthly_limit",
        (user_id, category, monthly_limit),
    )
    conn.commit()
    row = conn.execute(
        "SELECT * FROM budgets WHERE user_id = ? AND category = ?", (user_id, category)
    ).fetchone()
    return Budget.from_row(row)


def list_budgets(conn, user_id: int) -> list[Budget]:
    rows = conn.execute("SELECT * FROM budgets WHERE user_id = ? ORDER BY category", (user_id,)).fetchall()
    return [Budget.from_row(r) for r in rows]


def delete_budget(conn, user_id: int, category: str) -> bool:
    c = conn.execute("DELETE FROM budgets WHERE user_id = ? AND category = ?", (user_id, category.strip()))
    conn.commit()
    return c.rowcount > 0


def budget_status(conn, user_id: int, year_month: str = None) -> list[dict]:
    if year_month is None:
        year_month = datetime.today().strftime("%Y-%m")

    results = []
    for budget in list_budgets(conn, user_id):
        spent = conn.execute(
            "SELECT COALESCE(SUM(amount), 0) AS total FROM transactions "
            "WHERE user_id = ? AND type = 'expense' AND category = ? AND date LIKE ?",
            (user_id, budget.category, f"{year_month}%"),
        ).fetchone()["total"]
        results.append({
            "category": budget.category,
            "limit": budget.monthly_limit,
            "spent": spent,
            "remaining": budget.monthly_limit - spent,
            "exceeded": spent > budget.monthly_limit,
            "near_limit": 0.9 * budget.monthly_limit <= spent <= budget.monthly_limit,
        })
    return results


# ---------------------------------------------------------------------------
# Reporting (FR-8)
# ---------------------------------------------------------------------------

def monthly_summary(conn, user_id: int, year_month: str = None) -> dict:
    if year_month is None:
        year_month = datetime.today().strftime("%Y-%m")

    income = conn.execute(
        "SELECT COALESCE(SUM(amount),0) AS t FROM transactions "
        "WHERE user_id = ? AND type='income' AND date LIKE ?", (user_id, f"{year_month}%")
    ).fetchone()["t"]

    expense = conn.execute(
        "SELECT COALESCE(SUM(amount),0) AS t FROM transactions "
        "WHERE user_id = ? AND type='expense' AND date LIKE ?", (user_id, f"{year_month}%")
    ).fetchone()["t"]

    by_category = conn.execute(
        "SELECT category, COALESCE(SUM(amount),0) AS total FROM transactions "
        "WHERE user_id = ? AND type='expense' AND date LIKE ? GROUP BY category ORDER BY total DESC",
        (user_id, f"{year_month}%"),
    ).fetchall()

    return {
        "month": year_month,
        "income": income,
        "expense": expense,
        "net": income - expense,
        "by_category": [{"category": r["category"], "total": r["total"]} for r in by_category],
    }


def get_analytics_data(conn, user_id: int, year_month: str = None, months_count: int = 6) -> dict:
    """Provides high-level KPIs, historical 6-month trends, and financial health score."""
    if year_month is None:
        year_month = datetime.today().strftime("%Y-%m")

    summary = monthly_summary(conn, user_id, year_month)
    inc = summary["income"]
    exp = summary["expense"]
    net = summary["net"]

    savings_rate = round(((inc - exp) / inc * 100), 1) if inc > 0 else 0.0

    # Calculate financial health score (0 - 100 index)
    health_score = 50  # baseline
    if inc > 0:
        if savings_rate >= 30:
            health_score += 30
        elif savings_rate >= 15:
            health_score += 20
        elif savings_rate >= 0:
            health_score += 10
        else:
            health_score -= 20
    if net > 0:
        health_score += 10

    # Check budget adherence for the month
    statuses = budget_status(conn, user_id, year_month)
    if statuses:
        exceeded_count = sum(1 for s in statuses if s["exceeded"])
        if exceeded_count == 0:
            health_score += 10
        else:
            health_score -= (exceeded_count * 5)

    health_score = max(0, min(100, health_score))

    # Generate historical trends for recent months
    historical = []
    try:
        curr_dt = datetime.strptime(f"{year_month}-01", "%Y-%m-%d")
    except ValueError:
        curr_dt = datetime.today()

    for i in range(months_count - 1, -1, -1):
        year = curr_dt.year
        month = curr_dt.month - i
        while month <= 0:
            month += 12
            year -= 1
        m_str = f"{year:04d}-{month:02d}"

        m_inc = conn.execute(
            "SELECT COALESCE(SUM(amount), 0) AS t FROM transactions WHERE user_id = ? AND type='income' AND date LIKE ?",
            (user_id, f"{m_str}%")
        ).fetchone()["t"]
        m_exp = conn.execute(
            "SELECT COALESCE(SUM(amount), 0) AS t FROM transactions WHERE user_id = ? AND type='expense' AND date LIKE ?",
            (user_id, f"{m_str}%")
        ).fetchone()["t"]
        historical.append({
            "month": m_str,
            "income": m_inc,
            "expense": m_exp,
            "net": m_inc - m_exp
        })

    # Calculate category percentages
    total_exp = summary["expense"]
    category_percentages = []
    for item in summary["by_category"]:
        pct = round((item["total"] / total_exp * 100), 1) if total_exp > 0 else 0.0
        category_percentages.append({
            "category": item["category"],
            "total": item["total"],
            "percentage": pct
        })

    return {
        "current_month": year_month,
        "income": inc,
        "expense": exp,
        "net": net,
        "savings_rate": savings_rate,
        "health_score": health_score,
        "category_breakdown": category_percentages,
        "historical_trends": historical
    }


def seed_demo_data(conn) -> int:
    """Populates initial sample transactions & budgets if database is empty."""
    count = conn.execute("SELECT COUNT(*) AS c FROM transactions").fetchone()["c"]
    if count > 0:
        return 0

    today = datetime.today()
    curr_m = today.strftime("%Y-%m")

    # Past month YYYY-MM
    prev_m_dt = datetime(today.year if today.month > 1 else today.year - 1,
                         today.month - 1 if today.month > 1 else 12, 1)
    prev_m = prev_m_dt.strftime("%Y-%m")

    # Sample Budgets
    set_budget(conn, "Food & Dining", 15000)
    set_budget(conn, "Utilities", 8000)
    set_budget(conn, "Shopping", 10000)
    set_budget(conn, "Entertainment", 5000)

    # Sample Transactions (Current Month)
    add_transaction(conn, date=f"{curr_m}-01", type="income", category="Salary", amount=85000, note="Monthly salary credit")
    add_transaction(conn, date=f"{curr_m}-02", type="expense", category="Food & Dining", amount=3450, note="Grocery store haul")
    add_transaction(conn, date=f"{curr_m}-05", type="expense", category="Utilities", amount=4200, note="Electricity & Internet bill")
    add_transaction(conn, date=f"{curr_m}-08", type="expense", category="Shopping", amount=6800, note="New headphones")
    add_transaction(conn, date=f"{curr_m}-10", type="expense", category="Food & Dining", amount=1850, note="Team dinner")
    add_transaction(conn, date=f"{curr_m}-12", type="expense", category="Entertainment", amount=1200, note="Movie tickets")

    # Sample Transactions (Previous Month)
    add_transaction(conn, date=f"{prev_m}-01", type="income", category="Salary", amount=85000, note="Previous month salary")
    add_transaction(conn, date=f"{prev_m}-03", type="expense", category="Food & Dining", amount=12400, note="Month groceries")
    add_transaction(conn, date=f"{prev_m}-10", type="expense", category="Utilities", amount=7500, note="Utility bills")
    add_transaction(conn, date=f"{prev_m}-15", type="expense", category="Shopping", amount=8900, note="Clothes shopping")

    return 10


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------

def _validate_date(value: str) -> None:
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except (ValueError, TypeError):
        raise ValidationError(f"Invalid date '{value}'. Expected YYYY-MM-DD.")


def _validate_type(value: str) -> None:
    if value not in VALID_TYPES:
        raise ValidationError(f"Type must be one of {VALID_TYPES}, got '{value}'.")


def _validate_amount(value) -> None:
    try:
        amount = float(value)
    except (ValueError, TypeError):
        raise ValidationError(f"Amount must be numeric, got '{value}'.")
    if amount <= 0:
        raise ValidationError("Amount must be greater than zero.")
