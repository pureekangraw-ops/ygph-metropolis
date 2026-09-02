# LIGHTHOUSE New Base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the owner-approved LIGHTHOUSE experience on a clean product base inside the existing repository, then connect it to the proven APK delivery infrastructure without inheriting legacy UI/navigation.

**Architecture:** Product source is isolated under `lighthouse-new-base/`. One central navigation state owns CHAT, MANUAL, SETTINGS and MANUAL house routing. Existing repo logic is migration-candidate material only. APK build/signing is downstream shared infrastructure, not proof of product correctness.

**Tech Stack:** Node.js 22, native `node:test`, ES modules, browser DOM UI, Capacitor/Android packaging via existing `android-shell`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-02-lighthouse-new-base-design.md`
**Screen/Route Contract:** `docs/superpowers/specs/2026-09-02-lighthouse-screen-route-acceptance.md`

## Global Constraints
- Work only on `codex/lighthouse-new-base-20260902`.
- `reference/lighthouse-1.0.5` is read-only reference evidence.
- Do not extend legacy `ui/` navigation or root `app.mjs` as NEW BASE product source.
- Legacy `ui/lighthouse-shell.mjs` is rejected as product structure.
- Calendar is a first-class MANUAL house and must not route through Finance.
- One central navigation state owns all route transitions.
- Preserve existing APK signer secret names.
- Every migrated unit requires KEEP / ADAPT / REJECT and a failing behavior test before admission.
- No NEW BASE production behavior without a failing test first.
- Component existence and text labels are not acceptance evidence; route/action/readback are.
- Product slice acceptance comes before Android packaging.

---

### Task 0: Owner Screen / Route Gate

**Files:**
- Existing: `docs/superpowers/specs/2026-09-02-lighthouse-screen-route-acceptance.md`

**Produces:** explicit screen and route contract for CHAT, MANUAL dashboard, MONEY, CALENDAR, STORE, RIDE and SETTINGS.

- [x] **Step 1: Capture prior failure lessons as product gates.**
- [x] **Step 2: Draw text wireframes for CHAT, MANUAL dashboard, house detail and SETTINGS.**
- [x] **Step 3: Define canonical route model and Back behavior.**
- [x] **Step 4: Define route matrix with `from -> action -> to -> back`.**
- [ ] **Step 5: Owner reviews the screen/route contract before production UI code starts.**

**STOP:** Tasks 2+ may not begin until Step 5 is satisfied.

### Task 1: Establish the NEW BASE filesystem boundary

**Files:**
- Existing: `tests/lighthouse-new-base-boundary.test.cjs`
- Create after RED evidence: `lighthouse-new-base/README.md`
- Create after RED evidence: `lighthouse-new-base/package.json`

**Produces:** a test-enforced boundary requiring the NEW BASE directory and forbidding direct imports from legacy `ui/` and root `app.mjs`.

- [x] **Step 1: Write the failing boundary test.**
- [x] **Step 2: Open draft PR #108 so GitHub CI can execute the RED boundary test.**
- [ ] **Step 3: Record CI RED evidence showing failure is caused by missing NEW BASE boundary.**
- [ ] **Step 4: Create minimal README/package only after valid RED evidence.**
- [ ] **Step 5: Run/observe boundary test GREEN in PR CI.**

### Task 2: Central Navigation Contract

**Files:**
- Create: `lighthouse-new-base/test/navigation-state.test.mjs`
- Create: `lighthouse-new-base/src/navigation-state.mjs`
- Create: `lighthouse-new-base/src/routes.mjs`

**Produces:** one authoritative state:

```js
{
  top: 'chat' | 'manual' | 'settings',
  manualHouse: null | 'money' | 'calendar' | 'store' | 'ride'
}
```

**Behavior tests must cover:**
- initial route is CHAT;
- CHAT -> MANUAL produces MANUAL dashboard (`manualHouse: null`);
- MANUAL -> CALENDAR produces `{ top:'manual', manualHouse:'calendar' }` directly, never Finance;
- Back from any Manual house resets `manualHouse` to null;
- tapping MANUAL while in a house resets to dashboard;
- SETTINGS and CHAT transitions clear house detail state;
- unknown routes are rejected without mutating current state.

- [ ] Write failing tests for every transition above.
- [ ] Verify RED because navigation module does not exist.
- [ ] Implement the smallest pure state transition API.
- [ ] Verify all navigation tests GREEN.
- [ ] Run repository boundary test to prove no legacy UI imports.

### Task 3: Product Copy Boundary

**Files:**
- Create: `lighthouse-new-base/test/product-copy.test.mjs`
- Create: `lighthouse-new-base/src/product-copy.mjs`

**Produces:** one product-copy contract used by visible UI.

**Tests:**
- visible copy contains no `IDLE`, `WAITING`, `SUCCESS`, `READBACK`;
- raw interpreter/routing labels are not exposed;
- CHAT result states map only to user-level confirmation, actionable problem, or changed result.

- [ ] Write failing copy tests.
- [ ] Verify RED.
- [ ] Implement minimum mapping.
- [ ] Verify GREEN.

### Task 4: MANUAL Dashboard Shell — Today + Four Doors

**Files:**
- Create: `lighthouse-new-base/test/manual-dashboard.test.mjs`
- Create: `lighthouse-new-base/src/manual-dashboard.mjs`
- Create: `lighthouse-new-base/src/app-shell.mjs`

**Produces:** MANUAL dashboard with exactly four top-level doors:
- MONEY
- CALENDAR
- STORE
- RIDE

**Behavior tests:**
- dashboard presents today-status region before house doors;
- four and only four house doors exist;
- Income/Expense/Ledger do not appear as peer houses;
- Calendar door targets `calendar`, not `finance`;
- clicking each door requests central navigation transition; it does not mutate private page state.

- [ ] Write failing tests first.
- [ ] Verify RED.
- [ ] Implement minimal dashboard shell.
- [ ] Verify click behavior and rendered structure GREEN.
- [ ] Review actual rendered/manual surface before Task 5.

### Task 5: MONEY Vertical Slice

**Migration gate:** inspect existing finance/core candidates and classify each used file as KEEP / ADAPT / REJECT before import.

**Behavior:** one concrete user action must flow through MONEY and be read back from real state/data. A visible “success” word is not evidence.

- [ ] Select the smallest concrete MONEY behavior needed for first slice.
- [ ] Record candidate-file decisions and hidden dependencies.
- [ ] Write failing contract/action/readback test independent of legacy DOM/navigation.
- [ ] Migrate/reimplement smallest compatible logic.
- [ ] Verify actual action + readback.
- [ ] Verify Back -> MANUAL dashboard.
- [ ] Review actual MONEY surface before Task 6.

### Task 6: CALENDAR Vertical Slice — One Canonical UI

**Files:** new-base Calendar files only; legacy Finance Calendar UI is reference-only.

**Tests must prove:**
- MANUAL -> CALENDAR route does not invoke Finance route;
- exactly one Calendar UI is mounted for the canonical route;
- Calendar items retain their own domain/source owner;
- Back returns to MANUAL dashboard;
- bottom navigation remains central owner.

- [ ] Write failing route/UI tests.
- [ ] Verify RED.
- [ ] Implement minimal canonical Calendar surface.
- [ ] Verify behavior/readback where Calendar mutation exists.
- [ ] Review actual Calendar surface before Task 7.

### Task 7: STORE Vertical Slice

- [ ] Classify required old store/core candidates KEEP / ADAPT / REJECT.
- [ ] Write failing real-behavior/readback test.
- [ ] Implement smallest STORE path without importing legacy navigation.
- [ ] Verify route/back/readback.
- [ ] Review real surface.

### Task 8: RIDE Vertical Slice

- [ ] Classify required old ride/core candidates KEEP / ADAPT / REJECT.
- [ ] Write failing real-behavior/readback test.
- [ ] Implement smallest RIDE path without importing legacy navigation.
- [ ] Verify route/back/readback.
- [ ] Review real surface.

### Task 9: CHAT + Quick Capture Vertical Slice

**Rule:** Master Input / interpreter may be used only as an internal mechanism. It is not the CHAT page identity.

**Tests must prove:**
- CHAT owns conversation/result area and Quick Capture input;
- interpreter/system event names are not rendered;
- one concrete Quick Capture input causes an actual expected behavior and readback;
- only confirmation, actionable problem, or changed result becomes user-visible;
- CHAT/MANUAL/SETTINGS navigation remains central-state driven.

- [ ] Inspect interpreter candidates; classify KEEP / ADAPT / REJECT.
- [ ] Write failing user-behavior test first.
- [ ] Implement minimal adapter without legacy CHAT shell.
- [ ] Verify action + readback + visible copy.
- [ ] Review actual CHAT surface.

### Task 10: SETTINGS Vertical Slice

**Rule:** SETTINGS is a top-level page, not a dialog with independent route ownership.

- [ ] Write failing navigation/render tests.
- [ ] Implement minimal SETTINGS surface.
- [ ] Add Patch/Rollback only where already owner-authorized and contract-backed.
- [ ] Verify bottom-nav transitions and no competing dialog state.
- [ ] Review actual SETTINGS surface.

### Task 11: Full Product Route Acceptance

**Automated route walk must cover:**

```text
CHAT -> MANUAL -> CALENDAR -> Back -> SETTINGS
```

and MANUAL dashboard -> MONEY / CALENDAR / STORE / RIDE -> Back for every house.

**Evidence:** rendered destination + central route state + actual data/readback for behavior routes.

- [ ] Add route-matrix behavior test.
- [ ] Add dead-end detection for every interactive route button.
- [ ] Verify forbidden internal UI terms absent from rendered surfaces.
- [ ] Review actual assembled web product as a user.

**STOP:** Android integration does not begin until this gate passes.

### Task 12: Deterministic NEW BASE Staging Contract

**Files:**
- Create: `lighthouse-new-base/test/stage.test.mjs`
- Create: `lighthouse-new-base/tools/stage.mjs`
- Modify: `lighthouse-new-base/package.json`

**Tests:** staged package contains NEW BASE assets and contains no copied legacy `ui/` tree or root legacy app marker.

- [ ] Write failing staging test.
- [ ] Verify RED.
- [ ] Implement deterministic staging.
- [ ] Verify GREEN plus full NEW BASE tests.

### Task 13: Android Packaging Adapter

**Files:**
- Create: `android-shell/test/new-base-package.test.mjs`
- Modify smallest required `android-shell` package/tool adapter.

- [ ] Write failing package test proving staged asset marker identifies NEW BASE and legacy bundle is absent.
- [ ] Verify RED.
- [ ] Implement `app:stage-new-base` adapter.
- [ ] Verify package test + all NEW BASE tests GREEN.

### Task 14: Adapt Owner Build Workflow — Preserve Signer

**Files:**
- Create: `tests/lighthouse-owner-build-new-base.test.cjs`
- Modify: `.github/workflows/lighthouse-owner-build.yml`

**Must preserve exactly:**
- `LIGHTHOUSE_APK_KEYSTORE_BASE64`
- `LIGHTHOUSE_APK_STORE_PASSWORD`
- `LIGHTHOUSE_APK_KEY_ALIAS`
- `LIGHTHOUSE_APK_KEY_PASSWORD`

**Must change:**
- staging command from `app:stage-existing` to `app:stage-new-base`;
- legacy package-verification wording;
- artifact name away from `existing-full-app-1.0.3`.

- [ ] Write failing workflow contract test.
- [ ] Verify RED.
- [ ] Make minimal workflow edits while preserving signing and APK identity verification.
- [ ] Run repository deploy gate and workflow contract test GREEN.

### Task 15: Android Device Acceptance

**Acceptance is manual-on-device evidence, not CI.**

Required checks:
- fresh install launches correct NEW BASE;
- CHAT input remains usable with keyboard open;
- critical controls fit viewport;
- tap targets work;
- `CHAT -> MANUAL -> CALENDAR -> Back -> SETTINGS` matches route matrix;
- all four houses open and Back correctly;
- concrete action/readback still works on device.

- [ ] Build owner-selected NEW BASE candidate.
- [ ] Install on actual Android device.
- [ ] Execute device checklist and record pass/fail evidence.
- [ ] Fix product/device failures before updater test.

### Task 16: Updater Continuity Acceptance

Fresh install is not updater proof.

- [ ] Create next candidate with a safe visible version/evidence change.
- [ ] Build with same canonical signer.
- [ ] Update over the installed first NEW BASE candidate without clearing app data.
- [ ] Verify app identity, routes and retained expected data/state.
- [ ] Record updater acceptance evidence.

### Task 17: Completion Verification

- [ ] Run all NEW BASE tests.
- [ ] Run repository deploy gate.
- [ ] Verify draft PR CI is green for branch-caused checks.
- [ ] Confirm Screen/Route, Migration, Slice, Pre-APK, Device and Updater gates are all satisfied.
- [ ] Only then change status from candidate to accepted release.
