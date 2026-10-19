# Verification report

## Passed

Commands executed against the final application:

```text
.venv/Scripts/python.exe -m unittest discover -s tests -p 'test_*.py' -v
  22 tests passed

.venv/Scripts/python.exe -m tests.browser_check
  PASS 1440×1000, 1024×768, 768×1024, 390×844, 320×740
  PASS 48 conversation nodes and 187 DOM option clicks
  PASS availability failure/retry and keyboard Escape
  No JavaScript runtime errors

.venv/Scripts/python.exe -m compileall -q app.py studio tests
  Passed
```

### Landing page / browser checks

- Served the actual Flask application over HTTP using an isolated threaded server.
- Branding and seven-year celebration render.
- All local images load.
- No horizontal document or booking-dialog overflow at the five tested viewport sizes.
- Mobile menu opens, navigates to a section and closes.
- Chatbot opens, minimizes and restarts without a text input, textarea or
  contenteditable field.
- Main categories, contextual options, Back, preference summary and booking
  handoff work. The full decision graph has no message-less or option-less nodes.
- All three class options open a calendar.
- Next/previous month buttons work.
- A date and time can be selected and the selection survives registration,
  logout, incorrect credentials and a subsequent successful sign-in.
- Password visibility toggles.
- Unconfigured Razorpay Checkout stays disabled.
- The demo journey saves a server reservation and clearly says it is not a
  real appointment.
- Network-failed availability presents a working Retry action.
- Keyboard Escape closes the native modal.
- Desktop and narrow-mobile screenshots were captured and inspected. On short
  screens, the booking dialog scrolls to the actions below the summary.

### API / database checks

- Anonymous session bootstrap and CSRF enforcement.
- Authentication required for protected booking and payment operations.
- Invalid input types and non-object JSON rejected.
- Email/password validation, duplicate registration and incorrect credentials.
- Scrypt password hashes, session rotation, HttpOnly and SameSite cookie flags.
- Repeated login attempts are limited.
- Sample availability for all three classes; past and invalid times rejected.
- Duplicate demo requests return the existing reservation.
- Simultaneous reservations result in exactly one success and one conflict.
- Other users cannot view a booking or reserve its occupied start time.
- Production mode exposes no sample slots and rejects sample booking/payment creation.
- Missing test credentials and unset service pricing gate order creation.
- Live Razorpay keys rejected.
- Server-controlled amount, including configured test tax; browser amount ignored.
- Repeated requests reuse a pending order rather than create another booking.
- Invalid signatures and mismatched amounts rejected.
- Authorized-but-not-captured payment remains pending.
- Captured test payment verification and repeated confirmation are idempotent.
- Signed webhook verification and duplicate payload handling.
- A second payment cannot overwrite an already confirmed payment.
- Ambiguous gateway timeout leaves a pending, unconfirmed slot for reconciliation.

Payment tests use an injected deterministic gateway; this is not evidence of
successful communication with Razorpay.

## Not run / not verified

- **Razorpay real TEST order, Checkout, capture, webhook delivery and provider
  Content Security Policy compatibility:** no credentials were supplied. Complete
  these on a reachable HTTPS test deployment before enabling customer payments.
- **Ruff lint:** attempted to install Ruff; package downloads timed out and then
  failed DNS/certificate validation. Lint has not been run. Use
  `python -m ruff check app.py studio tests` after installing `requirements-dev.txt`.
- **Frontend production build:** not applicable; no transpiler/bundler is used.
- **Safari, Firefox, physical devices, assistive technology and formal WCAG audit:**
  not tested. Chromium viewport checks are not physical-device or screen-reader tests.
- **Real production availability, policies and business content:** not supplied.
  Production scheduling and live payments intentionally remain blocked.
- **Institutional programs, certifications, trainer claims, free trial offers and
  testimonials:** not verified; no invented specifics are displayed.

Python compilation and browser execution are separate checks, not substitutes
for the missing lint run or external payment end-to-end testing.
