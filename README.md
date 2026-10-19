# Shailja’s Fitness

A responsive, teal-and-ivory landing page with a button-driven wellness assistant,
email/password accounts, an appointment preview and a server-side Razorpay **TEST**
integration. This repository was empty at inspection (no framework, backend, or
package manifest). Python 3.11+ / Flask / SQLite with plain browser JavaScript
keeps the implementation small; no Node, bundler, AI provider, or external database
is required.

## Run locally

```sh
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# macOS / Linux instead:
# source .venv/bin/activate
python -m pip install -r requirements.txt
python app.py
```

Open **http://127.0.0.1:5000**. The SQLite database is created automatically under
`instance/` and is excluded from Git. Use Python's installed executable or `py`
if your Windows `python` command points to the Microsoft Store alias.

No `.env` is needed to explore the page and finish a no-payment demo. To configure
the application, copy `.env.example` to `.env` and fill values locally. Process
environment variables take precedence. Never commit `.env` or paste secrets into
chat, source files, or browser code.

## Owner demonstration

1. Explore Programs and the other in-page navigation links.
2. Open the bottom-right wellness companion. It has **no message input**. All
   seven main categories have contextual submenus, Back, Main menu, and Restart.
3. Follow Trial & Appointment Enquiries → class → time preference → day preference.
   The preference summary is not a booking or a promise of a free trial.
4. Continue to booking, choose a sample date/time, and review. The calendar shows
   IST regardless of the visitor's computer time zone.
5. Create an account with **email and password only** (12–128 character password),
   or sign in. Your booking selection stays in the dialog's in-memory state.
6. Choose **Finish demo · No payment**. A persistent, server-reserved demo record
   is saved, explicitly **not a real appointment**. Refreshing the page clears
   the in-progress frontend selection; the account session persists for 24 hours.

All three class options work. Sample times are generated for the next 60 days
except Sundays. Past dates/times are disabled or rejected. A reserved time is
unavailable to other users. Dialogs scroll on shorter viewports.

## Configuration

| Variable | Purpose |
| --- | --- |
| `APP_ENV` | `development` locally. Every other value disables sample bookings. |
| `DEVELOPMENT_AVAILABILITY` | Explicit fixture switch, additionally requires development mode. |
| `SECRET_KEY` | Set a random value of at least 32 characters for deployment. |
| `DATABASE` | SQLite file path; default `instance/studio.sqlite3`. |
| `ONLINE_TEST_PRICE_PAISE`, `STUDIO_TEST_PRICE_PAISE`, `PRIVATE_TEST_PRICE_PAISE` | Explicit positive test amounts in INR paise; unset means **not payable**, not free. |
| `ONLINE_DURATION_MINUTES`, `STUDIO_DURATION_MINUTES`, `PRIVATE_DURATION_MINUTES` | Positive configured durations; unset shows “To be confirmed”. |
| `ONLINE_TEST_TAX_PAISE`, `STUDIO_TEST_TAX_PAISE`, `PRIVATE_TEST_TAX_PAISE` | Optional positive test tax/additional charge amounts; unset means none configured. Included in server-calculated total. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Private test configuration; only public key ID is returned to Checkout. Live keys are rejected at startup. |
| `RAZORPAY_WEBHOOK_SECRET` | Server-only webhook signing secret. Required to enable test Checkout. |
| `STUDIO_EMAIL`, `STUDIO_PHONE`, `STUDIO_ADDRESS` | Owner-verified contact information. Omitted values are not invented. |

Generate a deployment secret with `python -c "import secrets; print(secrets.token_hex(32))"`
and set it in your private environment. The secret isn't used to place authentication
data in a client cookie: session tokens are opaque, random, hashed in the database.

## Razorpay test setup and limitations

1. In the Razorpay dashboard, select **Test Mode** and generate test API keys.
   Set `RAZORPAY_KEY_ID=rzp_test_...` and `RAZORPAY_KEY_SECRET` in your private `.env`.
2. Explicitly configure each service's **test** price and duration. None are
   supplied as assumed genuine prices. Currency is restricted to INR.
3. Configure a webhook URL ending in `/api/payments/webhook` on a reachable HTTPS
   staging deployment. Subscribe to `payment.captured`; put its signing secret in
   `RAZORPAY_WEBHOOK_SECRET`. Do not expose your development server or use real
   customer credentials as part of this demo.
4. Restart the app, choose a sample slot, sign in and open **Razorpay TEST
   Checkout**. Use only test instruments from Razorpay's current documentation.
5. Test successful capture, failed payment, dismissal, pending authorization,
   refresh/status checks and duplicate webhook delivery before approval.

The server creates the order using trusted service configuration. The stored
order ID, payment ID and HMAC-SHA256 signature are verified server-side; a gateway
payment lookup must match the order, total, INR currency and `captured` status.
Signed raw-body webhooks provide independent capture confirmation. Duplicate
callbacks/webhooks cannot create additional bookings. A browser callback alone
never confirms payment.

Pending orders keep their slot reserved, including cancelled checkout, failed
attempts and ambiguous network timeouts. This deliberately favours safety over
automatic reuse. Reopen the same pending order to retry. If order creation
times out before the ID is saved, **manual reconciliation** is required: use the
booking reference in Razorpay's order receipt/notes; verify the order and all
payments before releasing a slot. Unrecognized signed capture webhooks return
503 so delivery can retry after reconciliation. No reconciliation/admin portal,
refund system or automated order-expiry worker is included.

**No actual Razorpay account credentials were available during implementation.
The API tests use a deterministic gateway double; real Checkout, network order
creation, real test capture and webhook delivery have NOT been tested.**

Razorpay documentation:
- https://razorpay.com/docs/payments/server-integration/python/integration-steps/
- https://razorpay.com/docs/webhooks/validate-test/

## Boundaries before production

- Do **not** enable live payments. This application intentionally rejects live
  keys and provides no production timetable. Production can display the landing
  page, but slot lists are empty and booking creation is blocked server-side.
- Supply approved prices/durations, policies, contact details, schedules,
  trainer profiles, promotions and consented testimonials. Free trials are not
  claimed. Bootcamp, Institutions and Certification are honest enquiry sections,
  not invented services.
- Replace the fixture provider with authoritative availability and add scheduling
  resource/capacity and interval-overlap rules. Current uniqueness conservatively
  reserves one matching start time across all services; this is a demo discrete-slot
  model, **not** a real multi-instructor or capacity scheduler.
- Publish privacy/terms before collecting real customer information. There is no
  email verification, password recovery, profile collection, transactional email,
  or production booking confirmation. Password recovery is deliberately not faked.
- Serve with HTTPS and a production WSGI server, not Flask's development server:
  `waitress-serve --host=127.0.0.1 --port=5000 --call app:create_app`.
  Terminate TLS at a properly configured reverse proxy. Secure cookies require
  HTTPS outside development. Never expose debug mode.
- SQLite is appropriate for this small single-instance preview. Use migrations,
  backups, monitoring, operational reconciliation and deployment-appropriate
  limits/database infrastructure before accepting real appointments.

## Files and extension points

- `templates/index.html`: header, hero, programs, about, enquiry sections,
  Wall of Love placeholder, contact, footer, dialog/widget containers.
- `static/styles.css`: responsive visual system, modal, calendar and chatbot.
- `static/brand.svg`: clean teal figure approximation of the supplied signboard.
- `public/images/`: the original supplied reference photographs, preserved.
- `static/images/`: locally served illustrative Unsplash photography. These are
  **not** photos of Shailja’s studio, staff or customers. See `ASSETS.md`.
- `static/app.js`: shared HTTP/CSRF state, mobile navigation, contact rendering.
- `static/booking.js`: class → calendar → review → auth → demo/test payment flow.
- `static/chatbot.js`: widget presentation and persistent in-memory conversation.
- `static/knowledge.js`: verified business knowledge and button-driven decision tree.
  No AI service is claimed; the guided fallback is fully deterministic.
- `studio/config.py`: one source for class names, test prices, taxes and durations.
- `studio/development_data.py`: isolated, explicitly non-production availability.
- `studio/schema.sql`: persistent users, sessions, attempt limits, bookings and events.
- `app.py`: server validation, scrypt password hashing, sessions, CSRF, API,
  transactional slot reservation and Razorpay test payment verification.

### Requirement conflicts resolved

The request contains two conflicting chatbot specifications. The later, strict
button-only spec takes precedence: **no composer, no free-form messages**,
**bottom-right** launcher. The original business identity and teal/ivory palette
remain; the reference studio's blue branding, trainers, policies and free offers
are not copied. Both supplied images are the same signboard, so the reference
site is used for general layout/context only, never as Shailja’s business data.

## Checks

```sh
python -m pip install -r requirements-dev.txt
python -m playwright install chromium
python -m unittest discover -s tests -p "test_*.py" -v
python -m tests.browser_check
python -m compileall -q app.py studio tests
python -m ruff check app.py studio tests
git diff --check
```

No frontend build is necessary: Flask serves checked-in browser-ready files.
The browser script starts/stops an isolated actual HTTP server, uses a temporary
SQLite database, and saves screenshots in `test-results/` (or the Delta scratch
directory when present). No real user records are modified.

See `TESTING.md` for the actual results and remaining manual checks.
