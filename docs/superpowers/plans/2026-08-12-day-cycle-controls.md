# Day Cycle Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Start Day / Daily Target / End Day one coherent durable workflow and remove the duplicate Maintenance Reconcile entry.

**Architecture:** Add one small additive browser/runtime module, `metropolis-day-cycle.js`, rather than rewriting the large R5 finalization or Maintenance adapters. The module owns only manual day lifecycle orchestration and DOM relocation; it reuses existing target editor, end-day payment, audit, Ride-round, and durable persistence functions. Existing source-derived Store/Ride/Ledger history remains authoritative.

**Tech Stack:** Vanilla JavaScript classic scripts, Node `node:test`, existing YGPHRuntime hooks, encrypted local state, service-worker precache.

## Global Constraints

- Keep State Schema `4`, IndexedDB version `1`, and Vault format `1`.
- Do not delete or zero source-derived transaction history.
- Daily target remains `state.settings.dailyTargetSatang` / `dailyPassPercent`.
- Manual day lifecycle is additive at `state.sync.flow.dayCycle`.
- Existing stock correction remains in Store; existing cash reconciliation remains in Settings.
- Every production UI change advances the service-worker release generation.

---

### Task 1: Lock the day-cycle contract with failing tests

**Files:**
- Create: `tests/day-cycle-controls.test.cjs`

**Interfaces:**
- Produces expected public exports from `metropolis-day-cycle.js`: `DAY_CYCLE_VERSION`, `normalizeDayCycle`, `planStartDay`, `planEndDay`, `dayControlMarkup`.

- [ ] **Step 1: Write the failing test**

Create tests that assert:
- the new production module exists and exports the pure day-cycle planners;
- Start Day plans `ACTIVE` for today and End Day plans `ENDED` while preserving a same-day `startedAt`;
- Day Control markup contains Start Day / target / End Day slots and no `maintenanceReconcileBtn`;
- loader, offline shell, manifest, syntax gate and checksums reference the new asset.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/day-cycle-controls.test.cjs`

Expected: FAIL because `metropolis-day-cycle.js` and runtime references do not exist yet.

---

### Task 2: Implement additive day-cycle runtime

**Files:**
- Create: `metropolis-day-cycle.js`
- Modify: `sw-bootstrap.js`
- Modify: `package.json`

**Interfaces:**
- Consumes existing globals: `state`, `clone`, `nowIso`, `localISO`, `addAudit`, `bumpSource`, `persistAndRender`, `renderAll`, `toast`, `closeModal`, `modalHandler`, `r55OpenTargetEditor`, `r55OpenEndDay`, `r55ApplyEndDayPayments`, `YGPHRuntime`.
- Produces `globalThis.YGPHDayCycle` and CommonJS pure helpers for tests.

- [ ] **Step 1: Write minimal implementation**

Implement pure planners and browser runtime that:
- replaces the Maintenance Reconcile block with Day Control;
- moves existing target-edit and End Day buttons into that block;
- adds Start Day;
- persists `state.sync.flow.dayCycle`;
- resets only `dailyTargetSatang` and closes any active Ride round safely;
- wraps End Day confirmation so zero selected obligations still closes the day;
- leaves original obligation-payment mutation owner intact.

- [ ] **Step 2: Load the module after the existing remaster layer**

Append `metropolis-day-cycle.js` in `sw-bootstrap.js` after the current remaster runtime so its render hook runs last.

- [ ] **Step 3: Add syntax coverage**

Append `node --check metropolis-day-cycle.js` to `check:syntax` in `package.json`.

- [ ] **Step 4: Run focused test**

Run: `node --test tests/day-cycle-controls.test.cjs`

Expected: remaining failures are only release/shell metadata until Task 3.

---

### Task 3: Advance release/offline authority

**Files:**
- Modify: `sw.js`
- Modify: `RELEASE_MANIFEST.json`
- Modify: `SHA256SUMS.txt`

**Interfaces:**
- `sw.js APP_SHELL` and manifest production/runtime asset lists must agree on `metropolis-day-cycle.js`.

- [ ] **Step 1: Advance service-worker generation**

Set the release generation to `v4.2.6-20260812-r25-day-cycle-control` and add `metropolis-day-cycle.js` to `APP_SHELL`.

- [ ] **Step 2: Update release manifest**

Keep visible product version 4.2.6 while updating release metadata, runtime order, runtime assets and production files for the day-cycle module. Add safety statements covering durable day close and single Reconcile ownership.

- [ ] **Step 3: Refresh SHA256SUMS**

Recalculate hashes for changed production files and add `metropolis-day-cycle.js`.

- [ ] **Step 4: Run focused test**

Run: `node --test tests/day-cycle-controls.test.cjs`

Expected: PASS.

---

### Task 4: Full verification and publication

**Files:**
- No new source files unless a failing gate identifies a bounded defect.

- [ ] **Step 1: Run full deploy gate**

Run: `npm run deploy:gate`

Expected: all Node tests PASS, syntax PASS, UTF-8 PASS.

- [ ] **Step 2: Verify branch diff**

Confirm no State Schema, DB version, Vault format, transaction history, or unrelated UI behavior changed.

- [ ] **Step 3: Merge only after green**

Merge the reviewed PR to `main`; deployment then remains owned exclusively by `.github/workflows/phase1-deploy-gate.yml`.

- [ ] **Step 4: Verify post-merge workflow/deploy state**

Check the main commit workflow/deploy result. Treat merge success alone as insufficient production proof.
