# Shailja’s Fitness

A responsive, teal-and-ivory landing page with a button-driven wellness assistant,
email/password accounts, an appointment preview and a server-side Razorpay **TEST**
integration — same design and behaviour as the original Flask version, rebuilt on
**TanStack Start + React + TypeScript**, powered by **Bun** with SQLite kept as the
backend database (`bun:sqlite`, zero extra dependencies).

## Run locally

Install [Bun](https://bun.sh) 1.2+, then from the project root:

```sh
bun install
bun run dev
```

Open **http://localhost:3000**. The SQLite database is created automatically under
`instance/` and is excluded from Git.

No `.env` is needed to explore the page and finish a no-payment demo. To configure
the application, copy `.env.example` to `.env` and fill values locally. Process
environment variables take precedence. Never commit `.env` or paste secrets into
chat, source files, or browser code.

## Production build

```sh
bun run build       # vite build + tsc --noEmit
bun run start       # serves .output/server/index.mjs on port 3000 via Bun
```

Termininate TLS at a properly configured reverse proxy; secure cookies are enabled
automatically when `APP_ENV` is anything other than `development`.

## Migrated from Flask

| Flask (`app.py`) | TanStack Start equivalent |
| --- | --- |
| `templates/index.html` + `static/*.js` | `src/routes/index.tsx` + React components in `src/components/` |
| `static/styles.css` | `src/styles.css` (unchanged, imported by the root route) |
| `static/brand.svg`, `static/images/` | `public/brand.svg`, `public/images/` |
| `studio/config.py` | `src/server/env.ts` |
| `studio/development_data.py` | `src/server/slots.ts` |
| `studio/schema.sql` | `src/server/db.ts` (same schema, `bun:sqlite`) |
| Werkzeug scrypt password hashes | `src/server/password.ts` — the exact `scrypt:32768:8:1` format, so **existing accounts keep signing in** |
| Flask session/CSRF cookie handling | `src/server/session.ts` (same `studio_session` cookie, hashed tokens, per-session CSRF) |
| Flask routes | File routes in `src/routes/api/` (`bootstrap`, `auth/$action`, `availability`, `bookings/demo`, `bookings/$bookingId`, `payments/order`, `payments/verify`, `payments/webhook`) |
| `after_request` security headers / CSP | Nitro `routeRules` in `vite.config.ts` (+ `unsafe-inline` scripts, needed for SSR hydration) |

The client-side booking dialog steps, chatbot knowledge tree, toasts, mobile nav
and scrollspy logic were ported one-for-one into `src/components/BookingDialog.tsx`,
`src/components/ChatWidget.tsx` and `src/lib/knowledge.ts`.

## Configuration

See `.env.example`. The variables are unchanged from the Flask version
(`APP_ENV`, `DEVELOPMENT_AVAILABILITY`, `SECRET_KEY`, `DATABASE`, per-class
`*_TEST_PRICE_PAISE` / `*_DURATION_MINUTES` / `*_TEST_TAX_PAISE`,
`RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET`,
`STUDIO_EMAIL` / `STUDIO_PHONE` / `STUDIO_ADDRESS`).

Generate a deployment secret with `bun -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
Session tokens are opaque, random and hashed in the database; no authentication
data is stored in client-side state.

## Razorpay test setup and limitations

1. Razorpay dashboard → **Test Mode** → generate test API keys. Set
   `RAZORPAY_KEY_ID=rzp_test_...`, `RAZORPAY_KEY_SECRET` and
   `RAZORPAY_WEBHOOK_SECRET` in your private `.env`. Live keys are rejected at startup.
2. Explicitly configure each service’s **test** price and duration. Currency is INR only.
3. Configure a webhook URL ending in `/api/payments/webhook`, subscribe to
   `payment.captured`, and put its signing secret in `RAZORPAY_WEBHOOK_SECRET`.
4. Restart, choose a sample slot, sign in and open **Razorpay TEST Checkout**
   with test instruments only.

Server behaviour is unchanged from the Flask build: orders are created with
trusted configuration, the signature/order/amount/currency/captured-status are
verified server-side, signed raw-body webhooks independently confirm capture,
duplicates cannot produce extra bookings, a browser callback alone never
confirms payment, and pending orders hold their slot until reconciled (manual
reconciliation required if order creation times out).

## Boundaries before production

- Do **not** enable live payments. Live keys are rejected; production shows the
  landing page with empty slot lists and server-blocked booking creation.
- Supply approved prices/durations, policies, contact details, schedules,
  trainer profiles and consented testimonials. Free trials are not claimed.
- Replace the fixture provider with authoritative availability before accepting
  real appointments. The unique slot index conservatively reserves one start
  time across all services — a demo discrete-slot model, **not** a real
  multi-instructor or capacity scheduler.
- Publish privacy/terms before collecting real customer information. There is
  no email verification, password recovery, transactional email or production
  booking confirmation.
- SQLite suits this small single-instance preview; add migrations, backups and
  reconciliation before real operations.

## Files

- `src/routes/index.tsx` — header, hero, programs, about, enquiry sections, Wall
  of Love placeholder, contact, footer, widget/dialog wiring.
- `src/components/BookingDialog.tsx` — class → calendar → review → auth →
  demo/test payment flow.
- `src/components/ChatWidget.tsx` — widget presentation, persistent in-memory
  conversation; `src/lib/knowledge.ts` — verified business knowledge and the
  button-driven decision tree (no AI service; fully deterministic).
- `src/server/` — env config, SQLite schema, sessions/CSRF, scrypt password
  hashes, slot logic, booking reservation, Razorpay client.
- `public/images/` — locally served illustrative Unsplash photography (not
  photos of Shailja’s studio, staff or customers) plus the originally supplied
  reference photographs in `public/images/logo.jpeg` and
  `public/images/example_image1.jpeg`.
- `ASSETS.md` — image credit notes.
