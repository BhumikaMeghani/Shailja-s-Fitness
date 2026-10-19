"""Minimal server-authoritative booking, authentication, and Razorpay TEST integration."""
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
from base64 import b64encode
from contextlib import closing
from datetime import date
from functools import wraps
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from flask import Flask, g, jsonify, render_template, request
from werkzeug.security import check_password_hash, generate_password_hash

from studio.config import services
from studio.development_data import now_ist, sample_slots

ROOT = Path(__file__).parent


def load_environment():
    """Small .env loader; process environment wins. No secrets are logged."""
    path = ROOT / ".env"
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.strip() and not line.lstrip().startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


load_environment()


def create_app(test_config=None):
    app = Flask(__name__)
    app.config.update(
        APP_ENV=os.getenv("APP_ENV", "development"),
        DATABASE=os.getenv("DATABASE", str(ROOT / "instance" / "studio.sqlite3")),
        SECRET_KEY=os.getenv("SECRET_KEY") or secrets.token_hex(32),
        DEVELOPMENT_AVAILABILITY=os.getenv("DEVELOPMENT_AVAILABILITY", "true").lower() == "true",
        MAX_CONTENT_LENGTH=32 * 1024,
        RAZORPAY_KEY_ID=os.getenv("RAZORPAY_KEY_ID", ""),
        RAZORPAY_KEY_SECRET=os.getenv("RAZORPAY_KEY_SECRET", ""),
        RAZORPAY_WEBHOOK_SECRET=os.getenv("RAZORPAY_WEBHOOK_SECRET", ""),
    )
    if test_config:
        app.config.update(test_config)
    production = app.config["APP_ENV"] != "development"
    if production and len(os.getenv("SECRET_KEY", "")) < 32 and not app.config.get("TESTING"):
        raise RuntimeError("Set a strong SECRET_KEY before production deployment.")
    if app.config["RAZORPAY_KEY_ID"] and not app.config["RAZORPAY_KEY_ID"].startswith("rzp_test_"):
        raise RuntimeError("Only Razorpay TEST keys are supported.")
    Path(app.config["DATABASE"]).parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(app.config["DATABASE"])) as connection:
        connection.executescript((ROOT / "studio" / "schema.sql").read_text())

    def db():
        if "db" not in g:
            g.db = sqlite3.connect(app.config["DATABASE"], timeout=10)
            g.db.row_factory = sqlite3.Row
            g.db.execute("PRAGMA foreign_keys=ON")
        return g.db

    @app.teardown_appcontext
    def close_db(_error):
        if "db" in g:
            g.db.close()

    def fail(message, status=400):
        return jsonify(error=message), status

    def development():
        return app.config["APP_ENV"] == "development" and app.config["DEVELOPMENT_AVAILABILITY"]

    def session():
        if "studio_session" not in g:
            token = request.cookies.get("studio_session", "")
            g.studio_session = db().execute(
                "SELECT * FROM sessions WHERE token_hash=? AND expires>?",
                (hashlib.sha256(token.encode()).hexdigest(), int(time.time())),
            ).fetchone()
        return g.studio_session

    def new_session(user_id=None):
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        old = request.cookies.get("studio_session", "")
        db().execute("DELETE FROM sessions WHERE token_hash=? OR expires<?",
                     (hashlib.sha256(old.encode()).hexdigest(), int(time.time())))
        db().execute("INSERT INTO sessions VALUES(?,?,?,?)",
                     (hashlib.sha256(token.encode()).hexdigest(), user_id, csrf, int(time.time()) + 86400))
        db().commit()
        return token, csrf

    def set_cookie(response, token):
        response.set_cookie("studio_session", token, httponly=True, secure=production,
                            samesite="Lax", max_age=86400, path="/")
        return response

    @app.before_request
    def protect_writes():
        if request.method == "POST" and request.path != "/api/payments/webhook":
            current = session()
            if not current or not hmac.compare_digest(
                request.headers.get("X-CSRF-Token", ""), current["csrf"]
            ):
                return fail("Your session expired. Refresh the page and try again.", 403)
            if not request.is_json:
                return fail("Expected a JSON request.", 415)
            if not isinstance(request.get_json(silent=True), dict):
                return fail("Expected a JSON object.")

    @app.after_request
    def security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self' https://*.razorpay.com; "
            # Checkout injects its overlay styles; scripts remain nonce-free and no-eval.
            "style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
            "frame-src https://*.razorpay.com; "
            "connect-src 'self' https://*.razorpay.com; object-src 'none'; "
            "base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
        )
        if production:
            response.headers["Strict-Transport-Security"] = "max-age=31536000"
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.errorhandler(413)
    def too_large(_error):
        return fail("Request too large.", 413)

    def authenticated(fn):
        @wraps(fn)
        def wrapped(*args, **kwargs):
            if not session() or not session()["user_id"]:
                return fail("Please sign in to continue.", 401)
            return fn(*args, **kwargs)
        return wrapped

    def limited(bucket, maximum=10, window=900):
        now = int(time.time())
        connection = db()
        connection.execute("BEGIN IMMEDIATE")
        connection.execute("DELETE FROM attempts WHERE created<?", (now - 86400,))
        count = connection.execute("SELECT COUNT(*) FROM attempts WHERE bucket=? AND created>?",
                                   (bucket, now - window)).fetchone()[0]
        if count >= maximum:
            connection.commit()
            return True
        connection.execute("INSERT INTO attempts VALUES(?,?)", (bucket, now))
        connection.commit()
        return False

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/api/bootstrap")
    def bootstrap():
        current = session()
        token = None
        if not current:
            token, csrf = new_session()
            user = None
        else:
            csrf = current["csrf"]
            row = db().execute("SELECT email FROM users WHERE id=?", (current["user_id"],)).fetchone()
            user = dict(row) if row else None
        response = jsonify(
            csrf=csrf, user=user, services=services(), development=development(),
            today=now_ist().date().isoformat(), timezone="Asia/Kolkata",
            payments_configured=bool(app.config["RAZORPAY_KEY_ID"] and app.config["RAZORPAY_KEY_SECRET"]
                                     and app.config["RAZORPAY_WEBHOOK_SECRET"]),
            contact={key: os.getenv(f"STUDIO_{key.upper()}", "") for key in ("email", "phone", "address")},
        )
        return set_cookie(response, token) if token else response

    @app.post("/api/auth/<action>")
    def auth(action):
        if action not in ("register", "login"):
            return fail("Unknown authentication action.", 404)
        data = request.get_json(silent=True) or {}
        email, password = data.get("email", ""), data.get("password", "")
        if not isinstance(email, str) or not isinstance(password, str):
            return fail("Enter an email and password.")
        email = email.strip().lower()
        # Rate-limit IP and normalized account independently, including successful attempts.
        ip = request.remote_addr or "unknown"  # Never trust arbitrary X-Forwarded-For.
        if limited("ip:" + ip, 30) or limited("email:" + hashlib.sha256(email.encode()).hexdigest(), 10):
            return fail("Too many attempts. Please try again in 15 minutes.", 429)
        if len(email) > 254 or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
            return fail("Enter a valid email address.")
        if len(password) < 12 or len(password) > 128:
            return fail("Use a password between 12 and 128 characters.")
        if action == "register":
            try:
                result = db().execute("INSERT INTO users(email,password_hash) VALUES(?,?)",
                                      (email, generate_password_hash(password, method="scrypt")))
                db().commit()
                user_id = result.lastrowid
            except sqlite3.IntegrityError:
                db().rollback()
                return fail("Unable to create this account. Try signing in instead.", 409)
        else:
            row = db().execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
            # A real password hash for unknown accounts avoids an obvious timing discrepancy.
            valid = check_password_hash(row["password_hash"] if row else app.config["DUMMY_HASH"], password)
            if not row or not valid:
                return fail("Email or password is incorrect.", 401)
            user_id = row["id"]
        token, csrf = new_session(user_id)
        return set_cookie(jsonify(user={"email": email}, csrf=csrf), token)

    app.config["DUMMY_HASH"] = generate_password_hash(secrets.token_urlsafe(24), method="scrypt")

    @app.post("/api/auth/logout")
    def logout():
        token, csrf = new_session()
        return set_cookie(jsonify(csrf=csrf, user=None), token)

    def release_expired():
        # Pending orders deliberately retain their slot until reconciled. Never reassign
        # a potentially paid slot merely because a customer closed their browser.
        db().execute("UPDATE bookings SET status='expired' WHERE status='held' AND expires<?",
                     (int(time.time()),))
        db().commit()

    @app.get("/api/availability")
    def availability():
        service = request.args.get("service")
        if service not in {s["id"] for s in services()}:
            return fail("Choose a valid class.")
        try:
            day = date.fromisoformat(request.args.get("date", ""))
        except ValueError:
            return fail("Choose a valid date.")
        if not development():
            return jsonify(slots=[], development=False, message="Real studio availability is not connected yet.")
        release_expired()
        taken = {r[0] for r in db().execute(
            "SELECT starts_at FROM bookings WHERE status IN ('demo','held','pending','confirmed')"
        )}
        return jsonify(slots=[{"starts_at": slot, "available": slot not in taken}
                              for slot in sample_slots(service, day)], development=True)

    def selection(data):
        service = next((s for s in services() if s["id"] == data.get("service")), None)
        starts_at = data.get("starts_at")
        if not development():
            raise ValueError("Real availability is not configured. Booking is currently unavailable.")
        if not service or not isinstance(starts_at, str):
            raise ValueError("Choose a class and an available time.")
        try:
            day = date.fromisoformat(starts_at[:10])
        except ValueError:
            raise ValueError("Choose a valid date.") from None
        if starts_at not in sample_slots(service["id"], day):
            raise ValueError("This time is unavailable. Please select another slot.")
        return service, starts_at

    def reserve(data, mode):
        service, starts_at = selection(data)
        if mode == "held" and (not service["price_paise"] or not service["duration_minutes"]):
            raise ValueError("Test price and duration must be explicitly configured first.")
        release_expired()
        connection = db()
        connection.execute("BEGIN IMMEDIATE")
        existing = connection.execute(
            "SELECT * FROM bookings WHERE starts_at=? AND status IN ('demo','held','pending','confirmed')",
            (starts_at,),
        ).fetchone()
        if existing:
            connection.rollback()
            if existing["user_id"] == session()["user_id"] and existing["service"] == service["id"]:
                return dict(existing), False
            raise ValueError("This slot was just reserved. Please choose another time.")
        record = {
            "id": secrets.token_hex(16), "user_id": session()["user_id"], "service": service["id"],
            "starts_at": starts_at, "status": mode,
            "amount": service["price_paise"] + service["tax_paise"] if service["price_paise"] else None,
            "duration": service["duration_minutes"], "currency": "INR",
            "expires": int(time.time()) + 900 if mode == "held" else None, "created": int(time.time()),
        }
        connection.execute(
            """INSERT INTO bookings(id,user_id,service,starts_at,status,amount,duration,currency,expires,created)
               VALUES(:id,:user_id,:service,:starts_at,:status,:amount,:duration,:currency,:expires,:created)""",
            record,
        )
        connection.commit()
        return record, True

    @app.post("/api/bookings/demo")
    @authenticated
    def demo_booking():
        try:
            record, _created = reserve(request.get_json(silent=True) or {}, "demo")
        except ValueError as error:
            return fail(str(error), 409)
        if record["status"] != "demo":
            return fail("A test payment already exists for this slot. Check its status.", 409)
        return jsonify(booking=record["id"], status="demo", message="Demo reservation only. Not a real appointment. No payment taken.")

    def razorpay(method, path, body=None):
        credentials = b64encode(
            f'{app.config["RAZORPAY_KEY_ID"]}:{app.config["RAZORPAY_KEY_SECRET"]}'.encode()
        ).decode()
        req = Request("https://api.razorpay.com/v1/" + path,
                      data=json.dumps(body).encode() if body is not None else None,
                      headers={"Authorization": "Basic " + credentials, "Content-Type": "application/json"},
                      method=method)
        with urlopen(req, timeout=15) as response:
            return json.load(response)

    # Injectable gateway for deterministic tests; actual traffic always uses HTTPS above.
    app.extensions["razorpay"] = razorpay

    @app.post("/api/payments/order")
    @authenticated
    def payment_order():
        if not all(app.config[key] for key in ("RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET")):
            return fail("Razorpay test keys and webhook secret are not configured. Use the demo journey instead.", 503)
        try:
            record, created = reserve(request.get_json(silent=True) or {}, "held")
        except ValueError as error:
            return fail(str(error), 409)
        if not created:
            if record.get("order_id") and record["status"] == "pending":
                return jsonify(order_id=record["order_id"], amount=record["amount"], currency="INR",
                               key_id=app.config["RAZORPAY_KEY_ID"], booking=record["id"])
            return fail("This selection already has a reservation or an order in progress.", 409)
        # Mark pending BEFORE the external call: ambiguous network failures must not
        # release a slot which might have a successfully created Razorpay order.
        db().execute("UPDATE bookings SET status='pending',expires=NULL WHERE id=?", (record["id"],))
        db().commit()
        try:
            order = app.extensions["razorpay"]("POST", "orders", {
                "amount": record["amount"], "currency": "INR", "receipt": record["id"],
                "notes": {"booking_id": record["id"]},
            })
            if order["amount"] != record["amount"] or order["currency"] != "INR":
                raise ValueError("Gateway amount mismatch")
            db().execute("UPDATE bookings SET order_id=? WHERE id=?", (order["id"], record["id"]))
            db().commit()
        except (HTTPError, URLError, TimeoutError, OSError, ValueError, KeyError):
            return fail("Test order could not be completed. The slot is held for reconciliation; no payment is confirmed.", 502)
        return jsonify(order_id=order["id"], amount=record["amount"], currency="INR",
                       key_id=app.config["RAZORPAY_KEY_ID"], booking=record["id"])

    def confirm_payment(record, payment):
        if (payment.get("order_id") != record["order_id"] or payment.get("amount") != record["amount"]
                or payment.get("currency") != "INR" or payment.get("status") != "captured"
                or not isinstance(payment.get("id"), str)):
            raise ValueError("Payment has not been captured for this order and amount.")
        connection = db()
        connection.execute("BEGIN IMMEDIATE")
        try:
            current = connection.execute("SELECT * FROM bookings WHERE id=?", (record["id"],)).fetchone()
            if current["status"] not in ("pending", "confirmed"):
                connection.rollback()
                raise ValueError("This booking cannot be confirmed.")
            if current["payment_id"] and current["payment_id"] != payment["id"]:
                connection.rollback()
                raise ValueError("A different payment has already confirmed this booking.")
            connection.execute(
                "UPDATE bookings SET status='confirmed',payment_id=? WHERE id=? AND status IN ('pending','confirmed')",
                (payment["id"], record["id"]),
            )
            connection.commit()
        except sqlite3.IntegrityError:
            connection.rollback()
            raise ValueError("This payment has already been processed for another booking.") from None

    @app.post("/api/payments/verify")
    @authenticated
    def verify_payment():
        data = request.get_json(silent=True) or {}
        if not isinstance(data.get("booking"), str):
            return fail("A booking reference is required.")
        record = db().execute("SELECT * FROM bookings WHERE id=? AND user_id=?",
                              (data.get("booking"), session()["user_id"])).fetchone()
        if not record or not record["order_id"]:
            return fail("Test order not found.", 404)
        payment_id, signature = data.get("razorpay_payment_id"), data.get("razorpay_signature")
        if (not isinstance(payment_id, str) or not re.fullmatch(r"pay_[A-Za-z0-9_]{1,100}", payment_id)
                or not isinstance(signature, str)):
            return fail("Payment verification details are missing.")
        expected = hmac.new(app.config["RAZORPAY_KEY_SECRET"].encode(),
                            f'{record["order_id"]}|{payment_id}'.encode(), hashlib.sha256).hexdigest()
        if data.get("razorpay_order_id") != record["order_id"] or not hmac.compare_digest(expected, signature):
            return fail("Invalid payment signature. No payment was confirmed.", 400)
        try:
            payment = app.extensions["razorpay"]("GET", "payments/" + payment_id)
            if payment.get("status") != "captured":
                return jsonify(status="pending", message="Awaiting test payment capture. Your booking is not confirmed.")
            confirm_payment(record, payment)
        except (HTTPError, URLError, TimeoutError, OSError):
            return fail("Verification is pending. Check the booking status shortly.", 502)
        except ValueError as error:
            return fail(str(error), 409)
        return jsonify(status="confirmed", message="Razorpay TEST payment verified. This is not a real appointment.")

    @app.get("/api/bookings/<booking_id>")
    @authenticated
    def booking_status(booking_id):
        record = db().execute("SELECT id,status FROM bookings WHERE id=? AND user_id=?",
                              (booking_id, session()["user_id"])).fetchone()
        return jsonify(dict(record)) if record else fail("Booking not found.", 404)

    @app.post("/api/payments/webhook")
    def webhook():
        secret = app.config["RAZORPAY_WEBHOOK_SECRET"]
        if not secret:
            return fail("Webhook is not configured.", 503)
        raw = request.get_data()
        expected = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, request.headers.get("X-Razorpay-Signature", "")):
            return fail("Invalid webhook signature.", 400)
        event = request.get_json(silent=True) or {}
        if not isinstance(event, dict):
            return fail("Expected a webhook object.")
        # Hash the signed payload: cannot be bypassed by changing an unsigned event ID.
        event_id = hashlib.sha256(raw).hexdigest()
        if db().execute("SELECT id FROM webhook_events WHERE id=?", (event_id,)).fetchone():
            return jsonify(received=True)
        if event.get("event") == "payment.captured":
            payment = event.get("payload", {}).get("payment", {}).get("entity", {})
            record = db().execute("SELECT * FROM bookings WHERE order_id=?", (payment.get("order_id"),)).fetchone()
            if not record:
                return fail("Order pending reconciliation. Retry delivery.", 503)
            try:
                confirm_payment(record, payment)
            except ValueError as error:
                return fail(str(error), 409)
        db().execute("INSERT OR IGNORE INTO webhook_events VALUES(?,?)", (event_id, int(time.time())))
        db().commit()
        return jsonify(received=True)

    return app


if __name__ == "__main__":
    create_app().run(host="127.0.0.1", port=5000, debug=False)
