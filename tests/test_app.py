"""
test_app.py — Tests for the Flask presentation layer.

These complement tests/test_services.py (which already covers the
business logic exhaustively) by checking that the web layer wires HTTP
requests to that logic correctly: status codes, JSON shapes, and the
budget-alert payload.
"""

import os
import sys
import unittest
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app as app_module


class TestPocketLedgerAPI(unittest.TestCase):
    def setUp(self):
        self.tmp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.tmp_db.close()
        app_module.DB_PATH = self.tmp_db.name
        app_module.app.testing = True
        self.client = app_module.app.test_client()
        # Register and log in test user
        self.client.post("/api/auth/register", json={
            "username": "apiuser",
            "password": "password123",
            "template": "salaried"
        })

    def tearDown(self):
        if os.path.exists(self.tmp_db.name):
            os.unlink(self.tmp_db.name)

    def test_index_page_loads(self):
        resp = self.client.get("/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn(b"PocketLedger", resp.data)

    def test_add_and_list_transaction(self):
        resp = self.client.post("/api/transactions", json={
            "date": "2026-09-01", "type": "income", "category": "Salary",
            "amount": 50000, "note": "Sept salary",
        })
        self.assertEqual(resp.status_code, 201)
        self.assertIsNone(resp.get_json()["alert"])

        resp = self.client.get("/api/transactions")
        rows = resp.get_json()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["category"], "Salary")

    def test_invalid_transaction_returns_400(self):
        resp = self.client.post("/api/transactions", json={
            "date": "not-a-date", "type": "expense", "category": "Food", "amount": 10,
        })
        self.assertEqual(resp.status_code, 400)
        self.assertIn("error", resp.get_json())

    def test_budget_alert_fires_on_breach(self):
        self.client.post("/api/budgets", json={"category": "Food", "monthly_limit": 100})
        self.client.post("/api/transactions", json={
            "date": "2026-09-05", "type": "expense", "category": "Food", "amount": 60,
        })
        resp = self.client.post("/api/transactions", json={
            "date": "2026-09-06", "type": "expense", "category": "Food", "amount": 60,
        })
        alert = resp.get_json()["alert"]
        self.assertIsNotNone(alert)
        self.assertTrue(alert["exceeded"])
        self.assertFalse(alert["at_limit"])
        self.assertFalse(alert["near_limit"])

    def test_budget_alert_at_limit(self):
        self.client.post("/api/budgets", json={"category": "Food", "monthly_limit": 100})
        resp = self.client.post("/api/transactions", json={
            "date": "2026-09-05", "type": "expense", "category": "Food", "amount": 100,
        })
        alert = resp.get_json()["alert"]
        self.assertIsNotNone(alert)
        self.assertFalse(alert["exceeded"])
        self.assertTrue(alert["at_limit"])
        self.assertFalse(alert["near_limit"])

    def test_budget_alert_near_limit(self):
        self.client.post("/api/budgets", json={"category": "Food", "monthly_limit": 100})
        resp = self.client.post("/api/transactions", json={
            "date": "2026-09-05", "type": "expense", "category": "Food", "amount": 95,
        })
        alert = resp.get_json()["alert"]
        self.assertIsNotNone(alert)
        self.assertFalse(alert["exceeded"])
        self.assertFalse(alert["at_limit"])
        self.assertTrue(alert["near_limit"])

    def test_edit_and_delete_transaction(self):
        add = self.client.post("/api/transactions", json={
            "date": "2026-09-01", "type": "expense", "category": "Food", "amount": 20,
        }).get_json()["transaction"]

        edit = self.client.put(f"/api/transactions/{add['id']}", json={"amount": 35}).get_json()
        self.assertEqual(edit["transaction"]["amount"], 35)

        delete = self.client.delete(f"/api/transactions/{add['id']}")
        self.assertEqual(delete.status_code, 200)

        missing = self.client.delete(f"/api/transactions/{add['id']}")
        self.assertEqual(missing.status_code, 404)

    def test_summary_endpoint(self):
        self.client.post("/api/transactions", json={
            "date": "2026-09-01", "type": "income", "category": "Salary", "amount": 1000,
        })
        self.client.post("/api/transactions", json={
            "date": "2026-09-02", "type": "expense", "category": "Food", "amount": 200,
        })
        summary = self.client.get("/api/summary?month=2026-09").get_json()
        self.assertEqual(summary["income"], 1000)
        self.assertEqual(summary["expense"], 200)
        self.assertEqual(summary["net"], 800)

    def test_export_csv(self):
        self.client.post("/api/transactions", json={
            "date": "2026-09-01", "type": "income", "category": "Salary", "amount": 1000,
        })
        resp = self.client.get("/api/export")
        self.assertEqual(resp.status_code, 200)
        self.assertIn(b"Salary", resp.data)

    def test_analytics_endpoints(self):
        analytics_resp = self.client.get("/api/analytics")
        self.assertEqual(analytics_resp.status_code, 200)
        data = analytics_resp.get_json()
        self.assertIn("savings_rate", data)
        self.assertIn("health_score", data)
        self.assertIn("historical_trends", data)

    def test_duplicate_transaction_endpoint(self):
        add = self.client.post("/api/transactions", json={
            "date": "2026-09-01", "type": "expense", "category": "Food", "amount": 20, "note": "Snack",
        }).get_json()["transaction"]

        dup_resp = self.client.post(f"/api/transactions/{add['id']}/duplicate")
        self.assertEqual(dup_resp.status_code, 201)
        data = dup_resp.get_json()
        self.assertEqual(data["transaction"]["category"], "Food")
        self.assertEqual(data["transaction"]["amount"], 20.0)
        self.assertEqual(data["transaction"]["note"], "Snack (Copy)")

        invalid_resp = self.client.post("/api/transactions/99999/duplicate")
        self.assertEqual(invalid_resp.status_code, 400)

    def test_privacy_blur_elements_rendered(self):
        resp = self.client.get("/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn(b'id="privacyToggleBtn"', resp.data)
        self.assertIn(b'blur-target', resp.data)

    def test_unauthenticated_requests_redirect(self):
        # Create unauthenticated client
        unauth_client = app_module.app.test_client()
        resp = unauth_client.get("/api/transactions")
        self.assertEqual(resp.status_code, 401)
        self.assertTrue(resp.get_json()["auth_required"])


if __name__ == "__main__":
    unittest.main()
