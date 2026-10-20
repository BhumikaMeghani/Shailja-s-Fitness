# BP + weight wellness tool (TanStack Start + Convex)

## What changed

The home-page `#programs` gallery is replaced by an inline adult BP + weight
tool. The hero button scrolls to it. `/programs`, booking/contact features,
branding, and the older goal-based planner's source are preserved. The older
planner is no longer the home-page hero flow, so it cannot bypass this tool's
required readings or safety gates.

## Why Convex, with a versioned seed

This application already uses Convex. Its `wellness_catalog` table is the
**runtime content source**, with three bounded route documents: normal, low,
and high. Each contains exactly three poses, diet Do’s/Don’ts and route safety
copy. The index is `by_version_and_route`.

`convex/wellnessSeed.json` is a reviewable, version-controlled initial seed,
not a browser JSON fallback. `internal.wellness.seedCatalog` is operator-only
and idempotent: it inserts absent version/route pairs and never overwrites
existing or professionally reviewed records. Later content changes should use a
new version and a reviewed migration, not silently rewrite active content.
Missing, wrong-version or structurally mismatched content fails closed.

Deployment to the **already selected development** backend:

```sh
bunx convex dev --once
bunx convex run wellness:seedCatalog '{}'
bun run dev
```

Do not substitute a production deployment flag without release approval.
The seed is marked `pending_professional_review`, not clinically approved.

## Safety and privacy

`src/lib/wellness/bpEngine.ts` is the shared validation/classification rule.
`POST /api/wellness/recommend` applies it on the TanStack server, after the
existing anonymous session/CSRF guard. Login is not required.

- Systolic, diastolic, weight and explicit kg/lb unit are required.
- Supported entry ranges: systolic 50–260, diastolic 30–160 mmHg; systolic must
  exceed diastolic. Weight is 20–400 kg or equivalent pounds. These are
  entry-error limits, not clinical healthy ranges, and require professional
  review. Invalid entries prompt checking/re-measuring, not recommendations.
- Emergency symptoms override every routine. Above 180 systolic **or** above
  120 diastolic suppresses yoga and prompts recheck after at least one minute
  and immediate clinician contact. Symptoms require emergency help without
  waiting for a recheck.
- High Stage 2/Stage 1 values explicitly take precedence over a low value.
  Symptomatic low BP suppresses yoga. Clinician exercise restrictions suppress
  yoga on all ordinary routes.
- Normal and elevated use the same fixed normal set; both high categories use
  the fixed gentle high-BP set. No random selection or BP/weight medical formula.
- Weight/unit are acknowledged, and a goal or neutral default chooses general
  wellness habit copy. Weight never changes classification, poses, or diet
  route. No height, BMI, weight diagnosis, target weight, or promised weight loss.
- Every input change removes old results. Request revision checks discard late
  responses. Immediate symptom/severe warnings are available in the browser
  even if the server or Convex is unavailable.

**Health readings stay out of Convex.** Convex receives only content route and
version. BP, weight, goal and symptoms are processed in a same-origin POST body
on the TanStack server and returned with `Cache-Control: no-store`. No health
profile, persistent history, analytics, URL parameters, localStorage or
sessionStorage is added. Clear readings removes values/results from the page.
Existing anonymous session storage contains session credentials, not readings.
Operators must avoid logging request/response bodies in hosting/APM systems.

## Before public launch (not completed by implementation)

- Have a healthcare professional validate thresholds, precedence, symptom and
  restriction gates, entry ranges, diet advice, and follow-up/emergency wording.
- Have a qualified yoga instructor and clinician review all nine poses, four
  steps per pose, original illustrations, adaptations and safety notes.
- Review the adult-only/non-pregnancy scope and localise emergency contacts.
  The page labels 112 for India and otherwise says local emergency number.
- Review accessibility with assistive technology and physical devices.
- Verify deployment privacy/logging. No implementation/test constitutes clinical
  approval. The page and seed visibly retain their preview/review-required state.

References are linked in the tool: AHA BP ranges and 2025 guideline key points,
NHS hypotension, and NCCIH hypertension/complementary approaches. Implementation
follows the supplied product specification. NHS content was accessible during
the initial research; direct AHA retrieval returned HTTP 403 and is not claimed
as independently verified clinical review.

## Verification

```sh
bun run test
bun run build
npx tsc --noEmit
npx tsc --noEmit -p convex/tsconfig.json
git diff --check -- src/routes/index.tsx src/routes/__root.tsx convex/schema.ts vitest.config.ts convex/react.test.ts ASSETS.md
python scripts/check-bp-browser.py
```

The browser script needs Python Playwright/Chromium and a running site
(`BP_SITE_URL`, default `http://localhost:3000`). It uses ordinary anonymous
sessions, not account registration, bookings, payments or contact submissions.
The tests exercise the actual Convex functions against isolated `convex-test`
storage, server route handlers, all category boundaries/mixed readings, every
emergency symptom, weight/goal invariance, and fixed local image/card contracts.

Use `python scripts/check-bp-browser.py --start-server` to launch and stop an
isolated dev-server process automatically. This still uses the selected Convex
development backend for anonymous sessions and content.

### Implementation verification

- `bun run test`: **64 tests passed** (including the existing 18 goal-planner
  tests and the booking/contact/Convex regression tests).
- `bun run build`: passed, including its `tsc --noEmit` step.
- `npx tsc --noEmit`: passed.
- `npx tsc --noEmit -p convex/tsconfig.json`: passed. Convex's runtime config
  excludes `*.test.ts`; the root configuration still checks those tests with
  TanStack/Node types and `~` aliases.
- `bunx convex dev --once --typecheck enable --run wellness:seedCatalog`:
  succeeded against the configured **development**, not production, deployment;
  inserted three route records for `bp-wellness-v1`.
- `python scripts/check-bp-browser.py --start-server`: passed against the real
  TanStack/Convex application at 1440×1000, 1024×768, 768×1024, 390×844 and 320×740.
  Checked all ordinary/safety routes, required fields, mixed BP readings,
  goal/lb copy, responsive layout, local image fallback, request failure/retry,
  stale-response suppression, clearing/reloading readings, and desktop/mobile
  booking-dialog and chatbot smoke flows. No JavaScript runtime errors.
- Desktop results and mobile form screenshots were inspected. The targeted
  tracked-file `git diff --check` passed.

The initial full-suite run exposed an existing contact-test isolation problem:
it used local SMTP configuration and reported one synthetic test email delivered.
The test environment now explicitly sets `SMTP_USER` and `SMTP_APP_PASSWORD` to
empty values before application imports; subsequent tests cannot use local SMTP
credentials. Browser checks did not submit contact queries, accounts, bookings
or payments.

The build emits dependency-level `"use client"` bundler warnings and a chunk
timing-name advisory; these did not fail build or TypeScript checks.
Clinical/instructor review, production rollout, real payment-provider testing,
formal accessibility/assistive-technology audits, Safari/Firefox and physical
device testing were **not** completed.
