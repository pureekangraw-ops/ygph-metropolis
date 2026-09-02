# LIGHTHOUSE New Base Design

**Status:** APPROVED DESIGN — PRODUCT IMPLEMENTATION GATED BY SCREEN/ROUTE ACCEPTANCE
**Owner:** BIG
**Working branch:** `codex/lighthouse-new-base-20260902`
**Reference archive:** `reference/lighthouse-1.0.5` (source: `feat/lighthouse-1.0.5-real-app`)
**Screen/Route Acceptance:** `docs/superpowers/specs/2026-09-02-lighthouse-screen-route-acceptance.md`

## Purpose
Create a clean LIGHTHOUSE application base inside the existing repository while preserving proven delivery infrastructure. The new base must not inherit legacy UI/navigation as its product structure.

The primary acceptance criterion is not merely technical success. The assembled application must be the LIGHTHOUSE experience the owner approved.

`Build succeeds` != `Product accepted`.

## Boundaries

### 1. REFERENCE ARCHIVE — READ ONLY
- LIGHTHOUSE 1.0.5 is reference evidence only.
- It may be inspected to recover proven behavior, contracts, assets, or configuration.
- No new product work is authored in the archive branch.

### 2. NEW BASE — PRODUCT SOURCE
- New product code lives under `lighthouse-new-base/`.
- UI/navigation are designed fresh inside this boundary.
- Legacy root UI files are not imported wholesale.
- Migration is explicit, one unit at a time.
- Product UI implementation does not start until the screen/route acceptance contract is reviewed.

### 3. SHARED INFRA — PRESERVE MECHANISM
- `.github/workflows/lighthouse-owner-build.yml`
- GitHub Actions permissions and owner-triggered build pattern
- existing APK signing secret contract
- Android/Capacitor packaging mechanism where still compatible
- updater/release evidence paths where still compatible

Shared infrastructure may be adapted to point at NEW BASE, but signer/secrets are not duplicated or replaced.

### 4. MIGRATION CANDIDATES — VERIFY BEFORE ENTRY
Candidate logic from `greenfield/`, `lighthouse/`, `master-input/`, Android tooling, storage/contracts and domain modules must pass a fit check and tests before NEW BASE depends on it.

Each candidate must be classified as `KEEP`, `ADAPT`, or `REJECT` with a concrete behavior and test. Prior success is not admission evidence.

### 5. LEGACY UI / NAVIGATION — REFERENCE ONLY
Existing `ui/`, root `app.mjs`, old shells, dashboards and navigation remain outside NEW BASE unless a specific unit is intentionally migrated and tested. Similarity or prior use is not sufficient justification.

Legacy `ui/lighthouse-shell.mjs` is explicitly rejected as NEW BASE product structure because it routes Calendar through Finance and combines multiple navigation owners.

### 6. EXPERIMENT / SCRATCH — NO IMPLICIT PROMOTION
Experimental work must not become NEW BASE production code merely because it exists in the repository.

## Product Shape
The canonical product surfaces are:
- CHAT
- MANUAL
- SETTINGS

MANUAL opens to a compact “today status” dashboard with four houses:
- MONEY
- CALENDAR
- STORE
- RIDE

Income, Expense and Ledger are inside MONEY. Calendar is a separate first-class house and must never route through Finance.

Navigation has one authoritative state owner. Bottom navigation, back behavior, page headers and sub-pages may render or request route changes, but they do not own independent competing state.

## Data / Behavior Migration Rule
For every migrated unit:
1. identify the concrete behavior needed by NEW BASE;
2. record KEEP / ADAPT / REJECT;
3. write a failing test in NEW BASE;
4. import or reimplement the smallest compatible unit;
5. make the test pass;
6. verify actual action + durable/readback result where applicable;
7. verify no forbidden legacy UI/navigation dependency crossed the boundary.

## Vertical Slice Rule
Do not assemble all surfaces at once.

Required sequence:
1. central navigation shell and route state;
2. MANUAL today dashboard + one house route;
3. MONEY real behavior/readback;
4. CALENDAR canonical UI;
5. STORE;
6. RIDE;
7. CHAT lifecycle + Quick Capture;
8. SETTINGS;
9. full route walk;
10. Android package/device acceptance;
11. updater continuity candidate.

A slice cannot advance because components merely exist. It advances only after the route can be clicked as a user and the resulting state/data can be read back.

## Copy Boundary
System/runtime words must not leak directly into user-facing surfaces. At minimum, `IDLE`, `WAITING`, `SUCCESS`, `READBACK` and raw interpreter/routing terminology are internal-only.

UI tests must assert rendered/user-visible behavior, not use text labels alone as proof that behavior occurred.

## Build Integration Direction
The owner build workflow remains the delivery mechanism, but it is downstream of product acceptance. A later task will change its staging step from `app:stage-existing` to a NEW BASE staging command and update identity/artifact wording. The signing environment variable names remain unchanged.

## Acceptance Gates
1. **Screen/Route Review** — screen shapes, four houses, Calendar separation and single route owner are reviewed before product UI code.
2. **Migration Admission** — every migrated unit has KEEP/ADAPT/REJECT plus a failing behavior contract.
3. **Vertical Slice Acceptance** — click route, perform real behavior, read back result, inspect copy, review actual surface.
4. **Pre-APK Full Walk** — `CHAT -> MANUAL -> CALENDAR -> Back -> SETTINGS` plus all four houses.
5. **Android Device Acceptance** — install, keyboard, viewport, tap, back/route and real behavior/readback on device.
6. **Updater Acceptance** — next candidate must update over installed NEW BASE; fresh install alone is insufficient.

## Success Criteria
- NEW BASE source is structurally separate from legacy product UI/navigation.
- 1.0.5 remains available as reference and is not modified for new work.
- assembled screens and routes match the owner-approved screen/route contract.
- one central navigation state owns every route.
- Calendar is a separate Manual house, not a Finance sub-route.
- migration occurs only through explicit KEEP/ADAPT/REJECT and behavior/readback tests.
- owner APK build continues using the existing signer/secrets contract.
- Android device acceptance passes.
- updater continuity passes on a second candidate.
