# React site → Convex

The existing TanStack Start/React frontend is unchanged. Server routes in
`src/routes/api/` use the server-only Convex client in `src/server/db.ts`.
Browser code never receives the private server key or password hashes.

## Selected development backend

- Deployment: `original-peccary-63`
- URL: `https://original-peccary-63.convex.cloud`
- This is cloud **development**, not production.

The original SQLite snapshot has been imported into this deployment:
**1 user, 33 sessions, 0 attempts, 1 booking, 0 webhook receipts**.
Every original field in all five tables was compared against the cloud records;
the source snapshot was unchanged. The temporary migration key was then removed.
Normal session expiry/cleanup can change the session count after the app runs.
The original SQLite file remains a private backup, not the running database.

```sh
bun install
bun run dev:convex  # one terminal when editing backend functions
bun run dev         # another terminal; website at http://localhost:3000
```

The development launcher uses the URL in the Convex CLI's `.env.local`. If no
`CONVEX_SERVER_KEY` is supplied, it captures `STUDIO_SERVER_KEY` using the
authenticated CLI. This fallback is development-only and does not print or
persist the key. Production must receive `CONVEX_URL`, `CONVEX_SERVER_KEY` and
the other production settings through the hosting provider's private environment.
Never name the secret `VITE_CONVEX_SERVER_KEY`.

## Data and guarantees

The migration preserves all five SQLite tables: users, sessions, attempts,
bookings and webhook receipts. Integer user IDs become strings consistently
across relationships; passwords, opaque session hashes, CSRF values, booking
references, statuses, timestamps and gateway IDs are retained.

Convex transactions enforce email uniqueness, one active booking per start time,
unique gateway order/payment IDs, idempotent booking retries and atomic webhook
receipt/confirmation. Expired holds can be reused; potentially paid pending orders
are never released automatically. Indexed slot lookups do not scan booking history.
The original strict sliding-window attempt limits are retained, including any
imported attempts.

The password verifier supports both Werkzeug's literal salts and the old Bun
port's base64-decoded salts. New hashes use the Werkzeug-compatible format.

## Repeatable SQLite cutover

Do not apply to a database that already serves customers. Stop every SQLite
writer and keep the original file/WAL as a private recovery copy.

```sh
# Dry run: Node 22.13+ (Node 24 recommended), no Python module required.
bun run migrate:sqlite -- instance/studio.sqlite3

# Apply only after selecting the intended empty cloud deployment and configuring
# a separate temporary STUDIO_MIGRATION_KEY there.
bun run migrate:sqlite -- instance/studio.sqlite3 --apply
```

`CONVEX_MIGRATION_KEY` can be provided privately, or the development command can
capture the matching `STUDIO_MIGRATION_KEY` through the authenticated CLI.
`CONVEX_URL` overrides `VITE_CONVEX_URL` for the importer; review the printed
target before applying. Never use an old SQLite backup if new customer records
have since been written into Convex: transfer those Convex records instead.

The importer opens SQLite read-only, checks integrity/foreign keys, reads a
consistent transaction snapshot, and imports into Convex atomically. A snapshot
digest makes retries idempotent. It verifies committed counts and rechecks that
the source did not change during cutover. Sources over 4 MB / 4,000 rows are
refused and need a reviewed batched plan. The source is never deleted.

After checking the data and application, disable `STUDIO_MIGRATION_KEY` on the
same deployment and remove `CONVEX_MIGRATION_KEY` from your environment.

## Verification

```sh
bun run test
bun run build
npx tsc --noEmit
git diff --check
```

The tests use actual Convex functions in `convex-test`, plus the actual React
server route handlers against isolated test storage. They cover migration,
ownership, CSRF, session rotation, password compatibility, competing bookings,
pending-order reuse, order IDs, captured payments and duplicate webhooks.
No real customer data is used by automated tests.

Current automated result: **11 tests passed** (5 backend/migration checks and
6 React-server regression checks). `bun run build` and TypeScript checking passed.
These commands were also run successfully in the actual checkout at
`~/Downloads/Trial_Yoga_Website`, not only the isolated Delta worktree.

The actual site was started with `bun run dev` against the cloud deployment.
HTTP bootstrap, cloud-backed availability and anonymous-booking rejection passed.
Chromium booking-selection/review flows passed at 1440×1000 and 390×844 with no
JavaScript runtime errors. No test accounts or bookings were added to the cloud
database during these browser checks; only normal anonymous sessions were created.

Production build warnings from the TanStack/Nitro bundler about `"use client"`
directives are dependency warnings, not TypeScript or build failures.

## Still separate from this migration

Public website hosting and production Convex deployment are not enabled by the
development database. Production timetable/availability and live Razorpay keys
remain blocked as before. Real payment-provider calls require private Razorpay
test credentials and must be verified separately. This change does not invent
new enquiry forms or subscription-plan workflows absent from the current app.
