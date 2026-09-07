"""
db.py — Database access layer for PocketLedger.

Wraps raw SQLite access for local dev and PostgreSQL/Supabase for cloud deployment.
"""

import os
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


class PgCursorWrapper:
    def __init__(self, cursor):
        self.cursor = cursor

    def fetchone(self):
        return self.cursor.fetchone()

    def fetchall(self):
        return self.cursor.fetchall()

    @property
    def lastrowid(self):
        return getattr(self.cursor, "lastrowid", None) or 1

    @property
    def rowcount(self):
        return self.cursor.rowcount


class PgConnWrapper:
    def __init__(self, pg_conn):
        self.conn = pg_conn

    def execute(self, sql, params=()):
        cur = self.conn.cursor()
        pg_sql = sql.replace("?", "%s")
        if pg_sql.strip().upper().startswith("PRAGMA"):
            return PgCursorWrapper(cur)

        if "INSERT INTO users" in sql and "RETURNING" not in pg_sql:
            pg_sql += " RETURNING id"
        elif "INSERT INTO transactions" in sql and "RETURNING" not in pg_sql:
            pg_sql += " RETURNING id"

        cur.execute(pg_sql, params or ())
        if "RETURNING id" in pg_sql:
            row = cur.fetchone()
            if row:
                cur.lastrowid = row["id"]
        return PgCursorWrapper(cur)

    def commit(self):
        self.conn.commit()

    def close(self):
        self.conn.close()

    def executescript(self, sql):
        pg_sql = sql.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY")
        pg_sql = pg_sql.replace("REAL", "DOUBLE PRECISION")
        pg_sql = pg_sql.replace("?", "%s")
        cur = self.conn.cursor()
        cur.execute(pg_sql)
        self.conn.commit()


def get_connection(db_path: str = "pocketledger.db"):
    db_url = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL")
    if db_url:
        try:
            import psycopg2
            import psycopg2.extras
            if db_url.startswith("postgres://"):
                db_url = db_url.replace("postgres://", "postgresql://", 1)
            pg_conn = psycopg2.connect(db_url, cursor_factory=psycopg2.extras.RealDictCursor)
            conn = PgConnWrapper(pg_conn)
            conn.executescript(SCHEMA)
            return conn
        except Exception as e:
            print("PostgreSQL connection error, falling back to SQLite:", e)

    # Local SQLite fallback
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
