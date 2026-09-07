"""
test_services.py — Unit tests for PocketLedger's business logic.

Run with:  python3 -m unittest discover -s tests -v
Uses an in-memory SQLite database so tests never touch disk.
"""

import unittest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from expense_tracker.db import get_connection
from expense_tracker import services
from expense_tracker.services import ValidationError


class TestTransactions(unittest.TestCase):
    def setUp(self):
        self.conn = get_connection(":memory:")
        self.user = services.create_user(self.conn, "testuser", "pass123")

    def test_add_and_get_transaction(self):
        tx = services.add_transaction(self.conn, self.user.id, date="2026-07-01", type="expense",
                                       category="Food", amount=25.50, note="Lunch")
        self.assertIsNotNone(tx.id)
        fetched = services.get_transaction(self.conn, self.user.id, tx.id)
        self.assertEqual(fetched.category, "Food")
        self.assertEqual(fetched.amount, 25.50)

    def test_add_rejects_bad_type(self):
        with self.assertRaises(ValidationError):
            services.add_transaction(self.conn, self.user.id, date="2026-07-01", type="loan",
                                      category="Food", amount=10, note="")

    def test_add_rejects_nonpositive_amount(self):
        with self.assertRaises(ValidationError):
            services.add_transaction(self.conn, self.user.id, date="2026-07-01", type="expense",
                                      category="Food", amount=0, note="")

    def test_add_rejects_bad_date(self):
        with self.assertRaises(ValidationError):
            services.add_transaction(self.conn, self.user.id, date="not-a-date", type="expense",
                                      category="Food", amount=10, note="")

    def test_edit_transaction(self):
        tx = services.add_transaction(self.conn, self.user.id, date="2026-07-01", type="expense",
                                       category="Food", amount=25.50, note="Lunch")
        updated = services.edit_transaction(self.conn, self.user.id, tx.id, amount=30.0)
        self.assertEqual(updated.amount, 30.0)
        self.assertEqual(updated.category, "Food")  # unchanged fields preserved

    def test_delete_transaction(self):
        tx = services.add_transaction(self.conn, self.user.id, date="2026-07-01", type="expense",
                                       category="Food", amount=25.50, note="")
        self.assertTrue(services.delete_transaction(self.conn, self.user.id, tx.id))
        self.assertIsNone(services.get_transaction(self.conn, self.user.id, tx.id))
        self.assertFalse(services.delete_transaction(self.conn, self.user.id, tx.id))

    def test_list_with_filters(self):
        services.add_transaction(self.conn, self.user.id, date="2026-07-01", type="expense",
                                  category="Food", amount=25, note="")
        services.add_transaction(self.conn, self.user.id, date="2026-07-02", type="income",
                                  category="Salary", amount=1000, note="")
        expenses = services.list_transactions(self.conn, self.user.id, type="expense")
        self.assertEqual(len(expenses), 1)
        self.assertEqual(expenses[0].category, "Food")

    def test_duplicate_transaction(self):
        tx = services.add_transaction(self.conn, self.user.id, date="2026-07-01", type="expense",
                                       category="Food", amount=25.50, note="Lunch")
        dup = services.duplicate_transaction(self.conn, self.user.id, tx.id)
        self.assertNotEqual(dup.id, tx.id)
        self.assertEqual(dup.category, "Food")
        self.assertEqual(dup.amount, 25.50)
        self.assertEqual(dup.note, "Lunch (Copy)")

    def test_duplicate_nonexistent_transaction_raises(self):
        with self.assertRaises(ValidationError):
            services.duplicate_transaction(self.conn, self.user.id, 999)


class TestBudgets(unittest.TestCase):
    def setUp(self):
        self.conn = get_connection(":memory:")
        self.user = services.create_user(self.conn, "budgetuser", "pass123")

    def test_set_and_check_budget_status(self):
        services.set_budget(self.conn, self.user.id, "Food", 100)
        services.add_transaction(self.conn, self.user.id, date="2026-07-05", type="expense",
                                  category="Food", amount=120, note="Groceries")
        status = services.budget_status(self.conn, self.user.id, "2026-07")
        self.assertEqual(len(status), 1) # Explicitly set Food budget only
        food_status = next(s for s in status if s["category"] == "Food")
        self.assertTrue(food_status["exceeded"])
        self.assertAlmostEqual(food_status["spent"], 120)

    def test_budget_not_exceeded(self):
        services.set_budget(self.conn, self.user.id, "Food", 100)
        services.add_transaction(self.conn, self.user.id, date="2026-07-05", type="expense",
                                  category="Food", amount=40, note="")
        status = services.budget_status(self.conn, self.user.id, "2026-07")
        food_status = next(s for s in status if s["category"] == "Food")
        self.assertFalse(food_status["exceeded"])
        self.assertFalse(food_status["at_limit"])
        self.assertFalse(food_status["near_limit"])

    def test_budget_at_limit(self):
        services.set_budget(self.conn, self.user.id, "Food", 100)
        services.add_transaction(self.conn, self.user.id, date="2026-07-05", type="expense",
                                  category="Food", amount=100, note="Exact limit")
        status = services.budget_status(self.conn, self.user.id, "2026-07")
        food_status = next(s for s in status if s["category"] == "Food")
        self.assertFalse(food_status["exceeded"])
        self.assertTrue(food_status["at_limit"])
        self.assertFalse(food_status["near_limit"])

    def test_budget_near_limit(self):
        services.set_budget(self.conn, self.user.id, "Food", 100)
        services.add_transaction(self.conn, self.user.id, date="2026-07-05", type="expense",
                                  category="Food", amount=95, note="Near limit")
        status = services.budget_status(self.conn, self.user.id, "2026-07")
        food_status = next(s for s in status if s["category"] == "Food")
        self.assertFalse(food_status["exceeded"])
        self.assertFalse(food_status["at_limit"])
        self.assertTrue(food_status["near_limit"])

    def test_delete_budget(self):
        services.set_budget(self.conn, self.user.id, "Food", 100)
        ok = services.delete_budget(self.conn, self.user.id, "Food")
        self.assertTrue(ok)
        budgets = services.list_budgets(self.conn, self.user.id)
        self.assertFalse(any(b.category == "Food" for b in budgets))


class TestReports(unittest.TestCase):
    def setUp(self):
        self.conn = get_connection(":memory:")
        self.user = services.create_user(self.conn, "reportuser", "pass123")

    def test_monthly_summary(self):
        services.add_transaction(self.conn, self.user.id, date="2026-07-01", type="income",
                                  category="Salary", amount=1000, note="")
        services.add_transaction(self.conn, self.user.id, date="2026-07-02", type="expense",
                                  category="Food", amount=200, note="")
        services.add_transaction(self.conn, self.user.id, date="2026-07-03", type="expense",
                                  category="Transport", amount=100, note="")
        summary = services.monthly_summary(self.conn, self.user.id, "2026-07")
        self.assertEqual(summary["income"], 1000)
        self.assertEqual(summary["expense"], 300)
        self.assertEqual(summary["net"], 700)
        self.assertEqual(len(summary["by_category"]), 2)


class TestAnalytics(unittest.TestCase):
    def setUp(self):
        self.conn = get_connection(":memory:")
        self.user = services.create_user(self.conn, "analyticsuser", "pass123")

    def test_analytics_kpi_and_health_score(self):
        services.add_transaction(self.conn, self.user.id, date="2026-07-01", type="income",
                                  category="Salary", amount=10000, note="")
        services.add_transaction(self.conn, self.user.id, date="2026-07-02", type="expense",
                                  category="Food", amount=2000, note="")
        analytics = services.get_analytics_data(self.conn, self.user.id, "2026-07")
        self.assertEqual(analytics["income"], 10000)
        self.assertEqual(analytics["expense"], 2000)
        self.assertEqual(analytics["savings_rate"], 80.0)
        self.assertGreater(analytics["health_score"], 50)
        self.assertEqual(len(analytics["historical_trends"]), 6)

    def test_list_pagination(self):
        for i in range(10):
            services.add_transaction(self.conn, self.user.id, date="2026-07-10", type="expense",
                                      category="Food", amount=10 + i, note=f"item {i}")
        page1 = services.list_transactions(self.conn, self.user.id, limit=5, offset=0)
        page2 = services.list_transactions(self.conn, self.user.id, limit=5, offset=5)
        self.assertEqual(len(page1), 5)
        self.assertEqual(len(page2), 5)
        self.assertNotEqual(page1[0].id, page2[0].id)

    def test_multi_user_isolation(self):
        other_user = services.create_user(self.conn, "otheruser", "pass123")
        services.add_transaction(self.conn, self.user.id, date="2026-07-01", type="expense",
                                  category="Food", amount=50, note="User 1 tx")
        services.add_transaction(self.conn, other_user.id, date="2026-07-01", type="expense",
                                  category="Food", amount=500, note="User 2 tx")

        user1_txs = services.list_transactions(self.conn, self.user.id)
        user2_txs = services.list_transactions(self.conn, other_user.id)

        self.assertEqual(len(user1_txs), 1)
        self.assertEqual(len(user2_txs), 1)
        self.assertEqual(user1_txs[0].amount, 50)
        self.assertEqual(user2_txs[0].amount, 500)


if __name__ == "__main__":
    unittest.main()
