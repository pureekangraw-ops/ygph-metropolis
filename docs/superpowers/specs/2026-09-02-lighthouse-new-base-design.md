# LIGHTHOUSE New Base Design

**Status:** APPROVED DESIGN
**Owner:** BIG
**Working branch:** `codex/lighthouse-new-base-20260902`
**Reference archive:** `reference/lighthouse-1.0.5` (source: `feat/lighthouse-1.0.5-real-app`)

## Purpose
Create a clean LIGHTHOUSE application base inside the existing repository while preserving proven delivery infrastructure. The new base must not inherit legacy UI/navigation as its product structure.

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

### 3. SHARED INFRA — PRESERVE MECHANISM
- `.github/workflows/lighthouse-owner-build.yml`
- GitHub Actions permissions and owner-triggered build pattern
- existing APK signing secret contract
- Android/Capacitor packaging mechanism where still compatible
- updater/release evidence paths where still compatible

Shared infrastructure may be adapted to point at NEW BASE, but signer/secrets are not duplicated or replaced.

### 4. MIGRATION CANDIDATES — VERIFY BEFORE ENTRY
Candidate logic from `greenfield/`, `lighthouse/`, `master-input/`, Android tooling, storage/contracts and domain modules must pass a fit check and tests before NEW BASE depends on it.

### 5. LEGACY UI / NAVIGATION — REFERENCE ONLY
Existing `ui/`, root `app.mjs`, old shells, dashboards and navigation remain outside NEW BASE unless a specific unit is intentionally migrated and tested. Similarity or prior use is not sufficient justification.

### 6. EXPERIMENT / SCRATCH — NO IMPLICIT PROMOTION
Experimental work must not become NEW BASE production code merely because it exists in the repository.

## Initial Architecture
`lighthouse-new-base/` begins as a small independently testable web application package with its own source, tests and staging contract. It will expose a single application entry point and a staging command that can later be consumed by the Android packaging pipeline.

Initial responsibilities:
- `src/app.mjs` — application entry contract, no legacy navigation dependency.
- `src/app-shell.mjs` — minimal shell model for the new base.
- `test/new-base-boundary.test.mjs` — proves NEW BASE does not import legacy UI/navigation.
- `package.json` — local scripts for tests and staging.
- `README.md` — boundary rules and migration policy.

## Data / Behavior Migration Rule
For every migrated unit:
1. identify the concrete behavior needed by NEW BASE;
2. write a failing test in NEW BASE;
3. import or reimplement the smallest compatible unit;
4. make the test pass;
5. verify no forbidden legacy UI/navigation dependency crossed the boundary.

## Build Integration Direction
The owner build workflow remains the delivery mechanism. A later task will change its staging step from `app:stage-existing` to a NEW BASE staging command and update identity/artifact wording. The signing environment variable names remain unchanged.

## Success Criteria
- NEW BASE source is structurally separate from legacy product UI/navigation.
- 1.0.5 remains available as reference and is not modified for new work.
- migration occurs only through tests and explicit dependencies.
- owner APK build continues using the existing signer/secrets contract.
- workflow can build a NEW BASE candidate without packaging the legacy UI tree.
