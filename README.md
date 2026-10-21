# Shailja’s Fitness

A responsive, teal-and-ivory landing page with a button-driven wellness assistant,
email/password accounts, an appointment preview and a server-side Razorpay **TEST**
integration — same design and behaviour as the original Flask version, rebuilt on
**TanStack Start + React + TypeScript**, powered by **Bun** with **Convex cloud**
as the database. The React frontend is preserved; accounts, sessions, rate limits,
bookings and payment/webhook records are stored transactionally in Convex.

## Run locally

Install [Bun](https://bun.sh) 1.2+, then from the project root:

```sh
bun install
# Separate terminal, while developing Convex functions:
bun run dev:convex
# Website terminal:
bun run dev
```

Open **http://localhost:3000**. `bun run dev` reads the configured cloud URL from
`.env.local` and captures the development server key from the signed-in Convex CLI
if it is not already in your process environment. Secrets are never printed or
written into source files. There is no SQLite connection or fallback in the app.

The cloud deployment must have `STUDIO_SERVER_KEY` configured; production servers
must receive its matching `CONVEX_SERVER_KEY` through their private environment.
`.env.example` lists other settings. Process environment takes precedence over
`.env`, then `.env.local`; the development launcher uses the URL selected by
the Convex CLI to avoid a stale manually exported URL. Never expose private
keys using a `VITE_` prefix. An unavailable database returns HTTP 503.

See [CONVEX_SETUP.md](CONVEX_SETUP.md) for migration, verification and deployment.

## Production build

```sh
bun run build       # vite build + tsc --noEmit
bun run start       # serves .output/server/index.mjs on port 3000 via Bun
```

Termininate TLS at a properly configured reverse proxy; secure cookies are enabled
automatically when `APP_ENV` is anything other than `development`.

Sample availability and demo/test bookings are opt-in through `DEVELOPMENT_AVAILABILITY`
(unset defaults to `true` only in development). On a deployed `APP_ENV=production`
server, set `DEVELOPMENT_AVAILABILITY=true` to show the preview calendar; leave it
unset to keep real-looking sample times off the public site. Existing production
booking/availability gates are unchanged; sample slots are still labelled
previews, not a real studio timetable.

## Performance checks and image maintenance

Original photos in `public/images/` and `public/yoga-poses/` are preserved.
The site uses responsive WebP copies from `public/optimized/`, falling back to
the originals if needed. After changing a source photo, regenerate the copies
and manifest with `python3 scripts/optimize-images.py` (requires Pillow >= 12).
Commit the generated copies and `src/lib/image-manifest.json` together. No image
processing dependency is needed on the production server.

Validation:

```sh
npm ci
npm test
npm run build
python3 scripts/check-performance.py
python3 scripts/check-bootstrap-compatibility.py
```

The browser checks require Python Playwright with its Chromium browser installed.
The performance check starts/stops the production Node server, checks mobile/desktop layouts,
responsive image selection, original-image fallback, cache headers and real
PDF/Word downloads. It uses explicit browser API fixtures, **not a live database**.
Screenshots, downloaded files and byte measurements go under `test-results/`
(or `$DELTA_SCRATCH_DIR` when set).

The bootstrap compatibility check uses the real web server and Convex HTTP client
against a local older-backend fixture. It verifies that booking classes load when
the optimized query is not deployed, and that database outages still fail closed.
It does not access a live database.

The route/backend tests use `convex-test` and cover fresh availability after
booking, expired holds, reservation conflicts, session isolation, credentials,
database failures, CSRF and payment verification. Availability and account data
are not response-cached; only simultaneous browser bootstrap calls are shared.

When authorized to release, deploy the schema and Convex functions **before** the
website, and verify `studio:linkClerkAccount` exists on the website's configured
deployment before releasing the updated sign-in route. Bootstrap uses
`studio:getSessionContext` when available and falls back
to the existing session/user queries if that function has not been deployed yet.
Authentication and connection failures still fail closed; they do not trigger
this compatibility path. Account-linking writes do not fall back to the old
email-only bridge.

`clerk_accounts` records retain their existing `id` (`clerk:user_...`). The new
optional `user_id` points to the logical `users.id`; existing id-only rows remain
valid without a backfill. After Clerk verifies the signed-in user's primary
email, sign-in atomically links a matching local user or creates a new local user
and mapping. Existing passwords, sessions and bookings are preserved. New
Clerk-only users have a disabled local password. Once linked, the Clerk identity
keeps the same local user even if its email changes; local email changes/account
merges require a separate explicit flow. No Clerk passwords or tokens are copied
into Convex. This records users when they complete the booking sign-in bridge,
not every Clerk signup via a webhook.

## Migrated from Flask

| Flask (`app.py`) | TanStack Start equivalent |
| --- | --- |
| `templates/index.html` + `static/*.js` | `src/routes/index.tsx` + React components in `src/components/` |
| `static/styles.css` | `src/styles.css` (unchanged, imported by the root route) |
| `static/brand.svg`, `static/images/` | `public/brand.svg`, `public/images/` |
| `studio/config.py` | `src/server/env.ts` |
| `studio/development_data.py` | `src/server/slots.ts` |
| `studio/schema.sql` | `convex/schema.ts`; server-to-server transport in `src/server/db.ts` |
| Werkzeug scrypt password hashes | `src/server/password.ts` — the exact `scrypt:32768:8:1` format, so **existing accounts keep signing in** |
| Flask session/CSRF cookie handling | `src/server/session.ts` (same `studio_session` cookie, hashed tokens, per-session CSRF) |
| Flask routes | File routes in `src/routes/api/` (`bootstrap`, `auth/$action`, `availability`, `bookings/demo`, `bookings/$bookingId`, `payments/order`, `payments/verify`, `payments/webhook`) |
| `after_request` security headers / CSP | Nitro `routeRules` in `vite.config.ts` (+ `unsafe-inline` scripts, needed for SSR hydration) |

The client-side booking dialog steps, chatbot knowledge tree, toasts, mobile nav
and scrollspy logic were ported one-for-one into `src/components/BookingDialog.tsx`,
`src/components/ChatWidget.tsx` and `src/lib/knowledge.ts`.

## Configuration

See `.env.example`. Database settings are now `CONVEX_URL` (or locally
`VITE_CONVEX_URL`) and private `CONVEX_SERVER_KEY`. Other variables remain
`APP_ENV`, `DEVELOPMENT_AVAILABILITY`, `SECRET_KEY`, per-class
`*_TEST_PRICE_PAISE` / `*_DURATION_MINUTES` / `*_TEST_TAX_PAISE`,
`RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET`,
`STUDIO_EMAIL` / `STUDIO_PHONE` / `STUDIO_ADDRESS`.

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
- Use a production Convex deployment, backups, monitoring and reconciliation
  before real operations. The current cloud target is a development deployment.

## Files

- `src/routes/index.tsx` — header, hero, programs, about, enquiry sections, Wall
  of Love placeholder, contact, footer, widget/dialog wiring.
- `src/components/BookingDialog.tsx` — class → calendar → review → auth →
  demo/test payment flow.
- `src/components/ChatWidget.tsx` — widget presentation, persistent in-memory
  conversation; `src/lib/knowledge.ts` — verified business knowledge and the
  button-driven decision tree (no AI service; fully deterministic).
- `src/server/` — env config, Convex transport, sessions/CSRF, compatible scrypt
  hashes, slot validation and Razorpay client.
- `convex/` — validated tables, indexed reads, atomic reservations, payment and
  webhook confirmation, and empty-target migration.
- `scripts/migrate-sqlite.mjs` — read-only, one-time legacy importer; SQLite
  is used only by this cutover command, never by the running website.
- `public/images/` — locally served illustrative Unsplash photography (not
  photos of Shailja’s studio, staff or customers) plus the originally supplied
  reference photographs in `public/images/logo.jpeg` and
  `public/images/example_image1.jpeg`.
- `ASSETS.md` — image credit notes.
