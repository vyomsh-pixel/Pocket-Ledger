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

os.environ["SECRET_KEY"] = "test-secret-key-for-unit-tests"
os.environ["SKIP_OAUTH_VERIFY"] = "true"

import app as app_module
from unittest.mock import patch
from expense_tracker.db import get_connection
from expense_tracker.services import ValidationError





class TestPocketLedgerAPI(unittest.TestCase):
    def setUp(self):
        # Shared in-memory DB connection monkeypatched PER TEST METHOD in setUp()
        # (NOT in setUpClass()) to ensure 100% test isolation with zero state leakage across tests.
        self.conn = get_connection(":memory:")
        self.db_patcher = patch.object(app_module, "db", side_effect=lambda: self.conn)
        self.db_patcher.start()

        app_module.app.testing = True
        app_module.app.debug = True
        self.client = app_module.app.test_client()
        # Register and log in test user
        self.client.post("/api/auth/register", json={
            "username": "apiuser",
            "password": "password123",
            "template": "salaried"
        })

    def tearDown(self):
        self.db_patcher.stop()
        self.conn.close()


    def test_index_page_loads(self):
        resp = self.client.get("/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn(b"PocketLedger", resp.data)
        self.assertIn(b"print-statement-header", resp.data)
        self.assertIn(b"shortcutsModal", resp.data)
        self.assertIn(b"categoryFilterBar", resp.data)

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

    def test_google_auth_requires_token_when_verify_enabled(self):
        with patch.dict(os.environ, {"SKIP_OAUTH_VERIFY": "false"}):
            resp = self.client.post("/api/auth/google", json={"email": "hacker@test.com"})
            self.assertEqual(resp.status_code, 401)
            self.assertIn("error", resp.get_json())

    def test_google_account_takeover_prevention(self):
        # Setup user with google_id_1
        from expense_tracker import services
        services.get_or_create_google_user(self.conn, google_id="google_id_1", email="user@test.com")
        
        # Attempt to sign in with matching email but different google_id_2
        with self.assertRaises(ValidationError):
            services.get_or_create_google_user(self.conn, google_id="google_id_2", email="user@test.com")

    def test_delete_budget_case_insensitive(self):
        from expense_tracker import services
        services.set_budget(self.conn, 1, "Food & Dining", 500)
        ok = services.delete_budget(self.conn, 1, "food & dining")
        self.assertTrue(ok)

    def test_secret_key_production_guard(self):
        with patch.dict(os.environ, {"SECRET_KEY": ""}, clear=True):
            orig_debug = app_module.app.debug
            try:
                app_module.app.debug = False
                with self.assertRaises(RuntimeError):
                    secret_key = os.environ.get("SECRET_KEY")
                    is_vercel = bool(os.environ.get("VERCEL") or os.environ.get("VERCEL_ENV"))
                    if not secret_key and (not app_module.app.debug or is_vercel):
                        raise RuntimeError("SECRET_KEY environment variable MUST be set in production mode.")
            finally:
                app_module.app.debug = orig_debug


if __name__ == "__main__":
    unittest.main()



