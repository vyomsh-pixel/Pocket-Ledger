"""
db.py — Database access layer for PocketLedger.

Wraps all raw SQLite access. No business logic lives here — see services.py.
"""

import sqlite3
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    UNIQUE NOT NULL,
    password_hash TEXT    NOT NULL,
    created_at    TEXT    NOT NULL,
    currency      TEXT    DEFAULT '$',
    google_id     TEXT    UNIQUE
);

CREATE TABLE IF NOT EXISTS transactions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date        TEXT    NOT NULL,          -- ISO format YYYY-MM-DD
    type        TEXT    NOT NULL CHECK(type IN ('income', 'expense')),
    category    TEXT    NOT NULL,
    amount      REAL    NOT NULL CHECK(amount > 0),
    note        TEXT    DEFAULT ''
);

CREATE TABLE IF NOT EXISTS budgets (
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category      TEXT    NOT NULL,
    monthly_limit REAL    NOT NULL CHECK(monthly_limit > 0),
    PRIMARY KEY (user_id, category)
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_user_cat ON transactions(user_id, category);
"""


def get_connection(db_path: str = "pocketledger.db") -> sqlite3.Connection:
    """Open (creating if needed) a connection with schema applied and WAL concurrency enabled."""
    if Path(db_path).parent != Path(""):
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")

    # Automatic migration: if legacy tables exist without user_id column, drop legacy tables
    tx_cols = [r["name"] for r in conn.execute("PRAGMA table_info(transactions)").fetchall()]
    if tx_cols and "user_id" not in tx_cols:
        conn.execute("DROP TABLE IF EXISTS transactions;")
        conn.execute("DROP TABLE IF EXISTS budgets;")

    bg_cols = [r["name"] for r in conn.execute("PRAGMA table_info(budgets)").fetchall()]
    if bg_cols and "user_id" not in bg_cols:
        conn.execute("DROP TABLE IF EXISTS budgets;")

    user_cols = [r["name"] for r in conn.execute("PRAGMA table_info(users)").fetchall()]
    if user_cols and "currency" not in user_cols:
        conn.execute("ALTER TABLE users ADD COLUMN currency TEXT DEFAULT '$';")
    if user_cols and "google_id" not in user_cols:
        conn.execute("ALTER TABLE users ADD COLUMN google_id TEXT;")


    if db_path != ":memory:":
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA synchronous = NORMAL;")
    conn.executescript(SCHEMA)
    conn.commit()
    return conn

