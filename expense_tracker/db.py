"""
db.py — Database access layer for PocketLedger.

Wraps raw SQLite access for local dev and PostgreSQL/Supabase for cloud deployment.
"""

import os
import sqlite3
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at    VARCHAR(255) NOT NULL,
    currency      VARCHAR(50) DEFAULT '$',
    google_id     VARCHAR(255) UNIQUE
);

CREATE TABLE IF NOT EXISTS transactions (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date        VARCHAR(50) NOT NULL,
    type        VARCHAR(50) NOT NULL CHECK(type IN ('income', 'expense')),
    category    VARCHAR(255) NOT NULL,
    amount      DOUBLE PRECISION NOT NULL CHECK(amount > 0),
    note        TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS budgets (
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category      VARCHAR(255) NOT NULL,
    monthly_limit DOUBLE PRECISION NOT NULL CHECK(monthly_limit > 0),
    PRIMARY KEY (user_id, category)
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_user_cat ON transactions(user_id, category);
"""


class PgCursorWrapper:
    def __init__(self, cursor, lastrowid=None):
        self.cursor = cursor
        self._lastrowid = lastrowid

    def fetchone(self):
        return self.cursor.fetchone()

    def fetchall(self):
        return self.cursor.fetchall()

    @property
    def lastrowid(self):
        return self._lastrowid

    @property
    def rowcount(self):
        return self.cursor.rowcount


class PgConnWrapper:
    def __init__(self, pg_conn):
        self.conn = pg_conn

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            self.conn.rollback()
        else:
            self.conn.commit()

    def rollback(self):
        self.conn.rollback()

    def execute(self, sql, params=()):
        cur = self.conn.cursor()
        pg_sql = sql.replace("?", "%s")
        if pg_sql.strip().upper().startswith("PRAGMA"):
            return PgCursorWrapper(cur)

        lastrowid = None
        if ("INSERT INTO users" in sql or "INSERT INTO transactions" in sql) and "RETURNING" not in pg_sql:
            pg_sql += " RETURNING id"

        cur.execute(pg_sql, params or ())
        if "RETURNING" in pg_sql:
            try:
                row = cur.fetchone()
                if row:
                    if isinstance(row, dict) and "id" in row:
                        lastrowid = row["id"]
                    elif hasattr(row, "__getitem__"):
                        lastrowid = row[0] if isinstance(row, (tuple, list)) else getattr(row, "id", None)
            except Exception:
                pass
        return PgCursorWrapper(cur, lastrowid=lastrowid)

    def commit(self):
        self.conn.commit()

    def close(self):
        self.conn.close()

    def executescript(self, sql):
        statements = [stmt.strip() for stmt in sql.split(";") if stmt.strip()]
        cur = self.conn.cursor()
        for stmt in statements:
            pg_sql = stmt.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY")
            pg_sql = pg_sql.replace("REAL", "DOUBLE PRECISION")
            pg_sql = pg_sql.replace("TEXT", "VARCHAR(255)")
            pg_sql = pg_sql.replace("?", "%s")
            try:
                cur.execute(pg_sql)
            except Exception:
                pass
        self.conn.commit()


def get_connection(db_path: str = "pocketledger.db"):
    db_url = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL")
    if db_path != ":memory:" and db_url:
        try:
            import psycopg2
            import psycopg2.extras
            if db_url.startswith("postgres://"):
                db_url = db_url.replace("postgres://", "postgresql://", 1)
            conn_kwargs = {"cursor_factory": psycopg2.extras.RealDictCursor, "connect_timeout": 10}
            if "sslmode" not in db_url:
                conn_kwargs["sslmode"] = "prefer"
            pg_conn = psycopg2.connect(db_url, **conn_kwargs)
            conn = PgConnWrapper(pg_conn)
            conn.executescript(SCHEMA)
            return conn
        except Exception as e:
            print("PostgreSQL connection failed, using local/serverless fallback:", e)

    # Vercel Serverless Writable Path Fallback
    if (os.environ.get("VERCEL") or os.environ.get("VERCEL_ENV")) and db_path == "pocketledger.db":
        db_path = "/tmp/pocketledger.db"

    if db_path != ":memory:" and Path(db_path).parent != Path(""):
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")

    # SQLite DDL Schema definition
    SQLITE_SCHEMA = """
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
        date        TEXT    NOT NULL,
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

    if db_path != ":memory:":
        try:
            conn.execute("PRAGMA journal_mode = WAL;")
            conn.execute("PRAGMA synchronous = NORMAL;")
        except Exception:
            pass
    conn.executescript(SQLITE_SCHEMA)
    conn.commit()
    return conn
