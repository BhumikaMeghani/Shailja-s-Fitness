import hashlib
import hmac
import json
import os
import sqlite3
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from datetime import timedelta
from unittest.mock import patch

from app import create_app
from studio.development_data import now_ist, sample_slots


class StudioTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.environment = patch.dict(os.environ, {
            "ONLINE_TEST_PRICE_PAISE": "12000", "ONLINE_DURATION_MINUTES": "45",
            "ONLINE_TEST_TAX_PAISE": "", "STUDIO_TEST_TAX_PAISE": "", "PRIVATE_TEST_TAX_PAISE": "",
            "STUDIO_TEST_PRICE_PAISE": "", "STUDIO_DURATION_MINUTES": "",
            "PRIVATE_TEST_PRICE_PAISE": "", "PRIVATE_DURATION_MINUTES": "",
        })
        self.environment.start()
        self.app = create_app({
            "TESTING": True, "DATABASE": self.temp.name + "/test.sqlite3",
            "APP_ENV": "development", "DEVELOPMENT_AVAILABILITY": True,
            "RAZORPAY_KEY_ID": "rzp_test_fixture", "RAZORPAY_KEY_SECRET": "test_secret",
            "RAZORPAY_WEBHOOK_SECRET": "test_webhook",
        })
        self.client = self.app.test_client()
        self.csrf = self.client.get("/api/bootstrap").json["csrf"]
        day = now_ist().date() + timedelta(days=1)
        while day.weekday() == 6:
            day += timedelta(days=1)
        self.day = day
        self.slot = sample_slots("online", day)[0]
        self.payload = {"service": "online", "starts_at": self.slot}

    def tearDown(self):
        self.environment.stop()
        self.temp.cleanup()

    def post(self, path, data, client=None, csrf=None):
        return (client or self.client).post(path, json=data, headers={"X-CSRF-Token": csrf or self.csrf})

    def register(self, client=None, email="hello@example.com"):
        client = client or self.client
        csrf = client.get("/api/bootstrap").json["csrf"]
        result = self.post("/api/auth/register", {"email": email, "password": "long-secure-password"}, client, csrf)
        self.assertEqual(result.status_code, 200, result.json)
        if client == self.client:
            self.csrf = result.json["csrf"]
        return result.json["csrf"]

    def gateway(self, method, path, body=None):
        if method == "POST":
            self.order_body = body
            return {"id": "order_fixture", "amount": body["amount"], "currency": "INR"}
        return {"id": "pay_fixture", "order_id": "order_fixture", "status": "captured", "amount": 12000, "currency": "INR"}

    def order(self):
        self.register()
        self.app.extensions["razorpay"] = self.gateway
        result = self.post("/api/payments/order", {**self.payload, "amount": 1})
        self.assertEqual(result.status_code, 200, result.json)
        return result.json

    def test_landing_and_anonymous_session(self):
        self.assertEqual(self.client.get("/").status_code, 200)
        result = self.client.get("/api/bootstrap")
        self.assertIsNone(result.json["user"])
        self.assertTrue(result.json["development"])
        self.assertNotIn("test_secret", result.get_data(as_text=True))
        self.assertEqual(result.json["timezone"], "Asia/Kolkata")

    def test_csrf_and_auth_required(self):
        self.assertEqual(self.client.post("/api/auth/register", json={}).status_code, 403)
        self.assertEqual(self.post("/api/bookings/demo", self.payload).status_code, 401)
        self.assertEqual(self.post("/api/payments/order", self.payload).status_code, 401)

    def test_non_object_json_rejected(self):
        self.assertEqual(self.post("/api/auth/register", ["not", "an", "object"]).status_code, 400)
        self.register()
        self.assertEqual(self.post("/api/payments/verify", {"booking": []}).status_code, 400)

    def test_registration_validation_hash_rotation_login_logout(self):
        self.assertEqual(self.post("/api/auth/register", {"email": "bad", "password": "123"}).status_code, 400)
        old_csrf = self.csrf
        self.register()
        self.assertNotEqual(old_csrf, self.csrf)
        with closing(sqlite3.connect(self.app.config["DATABASE"])) as db:
            password_hash = db.execute("SELECT password_hash FROM users").fetchone()[0]
        self.assertTrue(password_hash.startswith("scrypt:"))
        self.assertNotEqual(password_hash, "long-secure-password")
        logout = self.post("/api/auth/logout", {})
        self.csrf = logout.json["csrf"]
        bad = self.post("/api/auth/login", {"email": "hello@example.com", "password": "incorrect-password"})
        self.assertEqual(bad.status_code, 401)
        good = self.post("/api/auth/login", {"email": "hello@example.com", "password": "long-secure-password"})
        self.assertEqual(good.status_code, 200)
        self.assertIn("HttpOnly", good.headers["Set-Cookie"])
        self.assertIn("SameSite=Lax", good.headers["Set-Cookie"])

    def test_repeated_auth_attempts_limited(self):
        for _ in range(10):
            self.post("/api/auth/login", {"email": "unknown@example.com", "password": "incorrect-password"})
        self.assertEqual(self.post("/api/auth/login", {"email": "unknown@example.com", "password": "incorrect-password"}).status_code, 429)

    def test_invalid_types_and_duplicate_registration(self):
        self.assertEqual(self.post("/api/auth/register", {"email": [], "password": {}}).status_code, 400)
        self.register()
        self.assertEqual(self.post("/api/auth/register", {"email": "hello@example.com", "password": "long-secure-password"}).status_code, 409)

    def test_all_class_sample_times_and_past_dates(self):
        for service in ("online", "studio", "private"):
            result = self.client.get(f"/api/availability?service={service}&date={self.day}")
            self.assertEqual(result.status_code, 200)
            self.assertGreater(len(result.json["slots"]), 0)
        yesterday = now_ist().date() - timedelta(days=1)
        self.assertEqual(self.client.get(f"/api/availability?service=online&date={yesterday}").json["slots"], [])
        self.assertEqual(self.client.get("/api/availability?service=online&date=bad").status_code, 400)

    def test_demo_is_idempotent_and_unavailable_to_other_users(self):
        self.register()
        first = self.post("/api/bookings/demo", self.payload)
        again = self.post("/api/bookings/demo", self.payload)
        self.assertEqual(first.json["booking"], again.json["booking"])
        self.assertEqual(first.json["status"], "demo")
        availability = self.client.get(f"/api/availability?service=online&date={self.day}").json
        self.assertFalse(availability["slots"][0]["available"])
        other = self.app.test_client()
        csrf = self.register(other, "other@example.com")
        self.assertEqual(self.post("/api/bookings/demo", self.payload, other, csrf).status_code, 409)
        self.assertEqual(other.get("/api/bookings/" + first.json["booking"]).status_code, 404)

    def test_concurrent_reservations_only_one_wins(self):
        users = []
        for i in range(2):
            client = self.app.test_client()
            csrf = self.register(client, f"concurrent{i}@example.com")
            users.append((client, csrf))
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda pair: self.post("/api/bookings/demo", self.payload, *pair).status_code, users))
        self.assertEqual(sorted(results), [200, 409])

    def test_slot_scope_is_conservative_across_services(self):
        self.register()
        with patch("app.sample_slots", return_value=[self.slot]):
            self.assertEqual(self.post("/api/bookings/demo", self.payload).status_code, 200)
            other = self.app.test_client()
            csrf = self.register(other, "different@example.com")
            result = self.post("/api/bookings/demo", {"service": "private", "starts_at": self.slot}, other, csrf)
            self.assertEqual(result.status_code, 409)

    def test_invalid_or_past_slot_rejected(self):
        self.register()
        self.assertEqual(self.post("/api/bookings/demo", {"service": "online", "starts_at": "2020-01-01T07:00:00+05:30"}).status_code, 409)
        self.assertEqual(self.post("/api/bookings/demo", {"service": "invented", "starts_at": self.slot}).status_code, 409)

    def test_production_cannot_expose_samples_or_book(self):
        self.register()
        self.app.config["APP_ENV"] = "production"
        self.assertFalse(self.client.get("/api/bootstrap").json["development"])
        self.assertEqual(self.client.get(f"/api/availability?service=online&date={self.day}").json["slots"], [])
        self.assertEqual(self.post("/api/bookings/demo", self.payload).status_code, 409)
        self.assertEqual(self.post("/api/payments/order", self.payload).status_code, 409)

    def test_unconfigured_prices_and_keys_gate_payment(self):
        self.register()
        self.app.config["RAZORPAY_KEY_ID"] = ""
        self.assertEqual(self.post("/api/payments/order", self.payload).status_code, 503)
        self.app.config["RAZORPAY_KEY_ID"] = "rzp_test_fixture"
        studio_slot = sample_slots("studio", self.day)[0]
        self.assertEqual(self.post("/api/payments/order", {"service": "studio", "starts_at": studio_slot}).status_code, 409)

    def test_live_keys_rejected(self):
        with self.assertRaises(RuntimeError):
            create_app({"RAZORPAY_KEY_ID": "rzp_live_not_allowed"})

    def test_order_uses_server_price_and_reuses_pending_order(self):
        order = self.order()
        self.assertEqual(self.order_body["amount"], 12000)
        repeated = self.post("/api/payments/order", self.payload)
        self.assertEqual(order["order_id"], repeated.json["order_id"])
        with closing(sqlite3.connect(self.app.config["DATABASE"])) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM bookings").fetchone()[0], 1)

    def test_server_includes_configured_test_tax(self):
        with patch.dict(os.environ, {"ONLINE_TEST_TAX_PAISE": "900"}):
            self.order()
            self.assertEqual(self.order_body["amount"], 12900)

    def test_confirmed_booking_rejects_different_payment(self):
        self.order()
        payload = {"event": "payment.captured", "payload": {"payment": {"entity": self.gateway("GET", "")}}}
        def deliver():
            body = json.dumps(payload).encode()
            signature = hmac.new(b"test_webhook", body, hashlib.sha256).hexdigest()
            return self.client.post("/api/payments/webhook", data=body, content_type="application/json",
                                    headers={"X-Razorpay-Signature": signature})
        self.assertEqual(deliver().status_code, 200)
        payload["payload"]["payment"]["entity"]["id"] = "pay_second"
        self.assertEqual(deliver().status_code, 409)

    def test_signature_capture_amount_and_idempotence(self):
        order = self.order()
        payload = {"booking": order["booking"], "razorpay_order_id": order["order_id"],
                   "razorpay_payment_id": "pay_fixture", "razorpay_signature": "invalid"}
        self.assertEqual(self.post("/api/payments/verify", payload).status_code, 400)
        payload["razorpay_signature"] = hmac.new(b"test_secret", b"order_fixture|pay_fixture", hashlib.sha256).hexdigest()
        for _ in range(2):
            result = self.post("/api/payments/verify", payload)
            self.assertEqual(result.json["status"], "confirmed")
        self.assertEqual(self.client.get("/api/bookings/" + order["booking"]).json["status"], "confirmed")

    def test_authorized_payment_is_pending_not_confirmed(self):
        order = self.order()
        self.app.extensions["razorpay"] = lambda *args: {"status": "authorized"}
        signature = hmac.new(b"test_secret", b"order_fixture|pay_fixture", hashlib.sha256).hexdigest()
        result = self.post("/api/payments/verify", {"booking": order["booking"],
                           "razorpay_order_id": "order_fixture", "razorpay_payment_id": "pay_fixture",
                           "razorpay_signature": signature})
        self.assertEqual(result.json["status"], "pending")

    def test_wrong_capture_amount_not_confirmed(self):
        order = self.order()
        self.app.extensions["razorpay"] = lambda *args: {"id": "pay_fixture", "order_id": "order_fixture", "status": "captured", "amount": 1, "currency": "INR"}
        signature = hmac.new(b"test_secret", b"order_fixture|pay_fixture", hashlib.sha256).hexdigest()
        result = self.post("/api/payments/verify", {"booking": order["booking"],
                           "razorpay_order_id": "order_fixture", "razorpay_payment_id": "pay_fixture",
                           "razorpay_signature": signature})
        self.assertEqual(result.status_code, 409)
        self.assertEqual(self.client.get("/api/bookings/" + order["booking"]).json["status"], "pending")

    def test_signed_webhook_retry_and_duplicates(self):
        order = self.order()
        body = json.dumps({"event": "payment.captured", "payload": {"payment": {"entity": self.gateway("GET", "")}}}).encode()
        self.assertEqual(self.client.post("/api/payments/webhook", data=body, content_type="application/json").status_code, 400)
        signature = hmac.new(b"test_webhook", body, hashlib.sha256).hexdigest()
        for _ in range(2):
            result = self.client.post("/api/payments/webhook", data=body, content_type="application/json",
                                      headers={"X-Razorpay-Signature": signature})
            self.assertEqual(result.status_code, 200)
        self.assertEqual(self.client.get("/api/bookings/" + order["booking"]).json["status"], "confirmed")
        with closing(sqlite3.connect(self.app.config["DATABASE"])) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM webhook_events").fetchone()[0], 1)

    def test_gateway_timeout_is_not_confirmed_or_reassigned(self):
        self.register()
        def timeout(*_args):
            raise TimeoutError()
        self.app.extensions["razorpay"] = timeout
        self.assertEqual(self.post("/api/payments/order", self.payload).status_code, 502)
        with closing(sqlite3.connect(self.app.config["DATABASE"])) as db:
            self.assertEqual(db.execute("SELECT status FROM bookings").fetchone()[0], "pending")


if __name__ == "__main__":
    unittest.main()
