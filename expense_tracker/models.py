"""
models.py — Plain data structures used across PocketLedger.
"""

from dataclasses import dataclass
from datetime import date
from typing import Optional



@dataclass
class User:
    id: int
    username: str
    password_hash: str
    created_at: str
    currency: str = "$"
    google_id: Optional[str] = None

    @staticmethod
    def from_row(row) -> "User":
        keys = row.keys() if hasattr(row, "keys") else []
        curr = row["currency"] if "currency" in keys else "$"
        gid = row["google_id"] if "google_id" in keys else None
        return User(
            id=row["id"],
            username=row["username"],
            password_hash=row["password_hash"],
            created_at=row["created_at"],
            currency=curr or "$",
            google_id=gid,
        )



@dataclass
class Transaction:
    id: int
    user_id: int
    date: str          # ISO string YYYY-MM-DD
    type: str           # 'income' | 'expense'
    category: str
    amount: float
    note: str = ""

    @staticmethod
    def from_row(row) -> "Transaction":
        return Transaction(
            id=row["id"],
            user_id=row["user_id"],
            date=row["date"],
            type=row["type"],
            category=row["category"],
            amount=row["amount"],
            note=row["note"] or "",
        )


@dataclass
class Budget:
    user_id: int
    category: str
    monthly_limit: float

    @staticmethod
    def from_row(row) -> "Budget":
        return Budget(
            user_id=row["user_id"],
            category=row["category"],
            monthly_limit=row["monthly_limit"],
        )


def today_iso() -> str:
    return date.today().isoformat()
