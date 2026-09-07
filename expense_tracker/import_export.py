"""
import_export.py — CSV import/export (FR-9, FR-10).
"""

import csv
from . import services

FIELDS = ["date", "type", "category", "amount", "note"]


def export_csv(conn, user_id: int, filepath: str) -> int:
    """Write every transaction for user_id to a CSV file. Returns the row count."""
    rows = services.list_transactions(conn, user_id)
    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        for tx in rows:
            writer.writerow({
                "date": tx.date, "type": tx.type, "category": tx.category,
                "amount": tx.amount, "note": tx.note,
            })
    return len(rows)


def import_csv(conn, user_id: int, filepath: str, atomic: bool = False) -> tuple[int, list[str]]:
    """Import transactions for user_id from a CSV file.

    If atomic=True, any row error causes a complete rollback (0 inserted).
    Otherwise, valid rows are committed and individual row errors are returned.
    """
    successes = 0
    errors = []
    parsed_rows = []

    with open(filepath, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader, start=2):
            try:
                amt = float(row["amount"])
                parsed_rows.append((i, row["date"], row["type"], row["category"], amt, row.get("note", "")))
            except (KeyError, ValueError) as e:
                errors.append(f"Line {i}: Invalid data or missing field - {e}")

    if atomic and errors:
        return 0, errors

    # Use a transaction block for atomic commit/rollback
    try:
        with conn:
            for item in parsed_rows:
                i, dt, tp, cat, amt, nt = item
                try:
                    services.add_transaction(conn, user_id, date=dt, type=tp, category=cat, amount=amt, note=nt)
                    successes += 1
                except services.ValidationError as e:
                    errors.append(f"Line {i}: {e}")
                    if atomic:
                        raise e
    except services.ValidationError:
        if atomic:
            return 0, errors

    return successes, errors
