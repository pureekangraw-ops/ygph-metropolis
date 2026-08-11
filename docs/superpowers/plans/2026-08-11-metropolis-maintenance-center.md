# METROPOLIS Maintenance Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add auditable manual stock adjustment plus a four-level Recovery & Reset Center to METROPOLIS 4.2.5 without changing the encrypted DB schema or breaking existing source/ledger history.

**Architecture:** Keep maintenance isolated from `app.js`. Put deterministic validation/planning in `metropolis-maintenance-core.js`, browser/storage integration in `metropolis-maintenance.js`, historical report integration in `metropolis-maintenance-report.js` through the existing `afterReport` hook, visual rules in `metropolis-maintenance.css`, and behavior/source/publication coverage in `tests/metropolis-maintenance.test.cjs`. Load the slice after `metropolis-r5-5` and include all maintenance assets in the explicit production/offline shell.

**Tech Stack:** Vanilla JavaScript, browser IndexedDB/Cache/Service Worker APIs, existing METROPOLIS modal/runtime helpers and YGPH runtime hook bus, Node built-in test runner.

## Global Constraints
- Product line remains METROPOLIS 4.2.5; this is a runtime maintenance release, not a schema migration.
- `DB_NAME = stock-pocket-secure`, DB version 1, state schema 4 remain unchanged.
- Manual stock adjustment must not create Ledger transactions automatically.
- Historical stock correction must use the latest physical adjustment as an anchor, not assume transaction-derived history was correct before the adjustment.
- Partial reset must not delete durable sales/purchases/jobs/ledger/calendar source history.
- Factory reset is the only operation that destroys the entire local database.
- Full Local Cleanup requires network availability before removing app caches/service worker.
- Every non-destructive state mutation must go through existing encrypted durable commit/readback.
- Production shell, `.assetsignore`, manifest, syntax gate and service-worker release generation must all include the new maintenance assets.
- Only the current release/publication test may own the exact Service Worker generation; historical component tests stay release-agnostic to avoid repeated rewiring.

---

### Task 1: Pure maintenance rules — RED/GREEN

**Files:**
- Create: `metropolis-maintenance-core.js`
- Create: `tests/metropolis-maintenance.test.cjs`

**Interfaces:**
- Produces `planStockAdjustment(input)`, `applyStockAdjustmentToState(state, plan)`, `latestStockAdjustmentAt(adjustments, endDate, dateOf)`, `stockReportCorrectionAt(adjustments, endDate, baseQtyAtDate, dateOf)`, `planPartialReset(input)`, `isFactoryConfirmation(value)`, `isFullCleanupConfirmation(value)`, `maintenanceCacheTargets(cacheNames)`.
- Browser/report runtimes consume these functions through `globalThis.YGPHMaintenanceCore`; Node tests consume `module.exports`.

- [ ] Write failing tests for stock increase/decrease/correction, required reason, bounds, no Ledger mutation, zero-stock value invariant, physical-anchor report correction, safe partial reset semantics, confirmation phrases and cache targeting.
- [ ] Run `node --test tests/metropolis-maintenance.test.cjs` and confirm RED before missing interfaces exist.
- [ ] Implement the minimum pure module to satisfy tests.
- [ ] Re-run the focused test and confirm GREEN.

### Task 2: Browser maintenance runtime — RED/GREEN

**Files:**
- Create: `metropolis-maintenance.js`
- Modify: `tests/metropolis-maintenance.test.cjs`

**Interfaces:**
- Consumes existing browser globals: `state`, `openModal`, `closeModal`, `toast`, `persistAndRender`, `promptVerifyBalance`, `byId`, `uid`, `nowIso`, `DB_NAME` and current persistence/security state.
- Produces UI entry points injected into Store and Settings; no new global business owner.

- [ ] Add source-contract tests requiring a Store manual-adjust button, Settings Recovery card, use of `persistAndRender`, typed `RESET` / `RESET ALL`, IndexedDB delete handling, cache/SW cleanup and no direct Ledger transaction creation.
- [ ] Confirm RED before runtime file exists.
- [ ] Implement UI injection and runtime adapters.
- [ ] Confirm focused test GREEN.

### Task 3: Historical stock report adapter — RED/GREEN

**Files:**
- Create: `metropolis-maintenance-report.js`
- Modify: `tests/metropolis-maintenance.test.cjs`

**Interfaces:**
- Consumes `YGPHRuntime.afterReport`, `YGPHMaintenanceCore.stockReportCorrectionAt`, existing `stockAt(date)`, `state.store.adjustments`, and the current report object.
- Produces corrected `report.snapshot.stockQty`, `report.store.manualAdjustmentCorrectionQty`, and a visible report correction row without modifying `app.js` report implementation.

- [ ] Add a failing divergence case proving naive delta-summing would be wrong when transaction-derived stock had already drifted before the physical correction.
- [ ] Add a source-contract test proving the adapter uses `afterReport` + `stockAt` and does not require an `app.js` patch.
- [ ] Implement latest-adjustment anchor correction and idempotent report mutation.
- [ ] Confirm focused tests GREEN.

### Task 4: Maintenance UI styles and runtime loader

**Files:**
- Create: `metropolis-maintenance.css`
- Modify: `sw-bootstrap.js`
- Modify: `.assetsignore`
- Modify: `package.json`

**Interfaces:**
- `sw-bootstrap.js` loads CSS then core → browser runtime → report runtime after r5-5.
- `package.json` syntax gate parses all three maintenance JS files.

- [ ] Add loader/allowlist/syntax assertions to the maintenance test.
- [ ] Confirm RED before publication wiring is complete.
- [ ] Add all maintenance assets in deterministic order.
- [ ] Add files to Cloudflare static-asset allowlist and syntax command.
- [ ] Confirm focused publication tests GREEN.

### Task 5: Offline shell / release manifest

**Files:**
- Modify: `sw.js`
- Modify: `RELEASE_MANIFEST.json`
- Modify: `tests/metropolis-maintenance.test.cjs`

**Interfaces:**
- New service-worker release generation: `v4.2.5-20260811-r21-maintenance-center`.
- APP_SHELL includes `metropolis-maintenance.css`, `metropolis-maintenance-core.js`, `metropolis-maintenance.js`, `metropolis-maintenance-report.js`.

- [ ] Add tests asserting all maintenance assets appear in APP_SHELL/manifest and current release id is r21.
- [ ] Confirm RED before shell/manifest update.
- [ ] Update service-worker shell and manifest runtime/production asset lists.
- [ ] Confirm focused test GREEN.

### Task 6: Remove duplicated current-release ownership from historical tests

**Files:**
- Modify: `tests/defrag-publication-followthrough.test.cjs`
- Modify: `tests/icon-system.test.cjs`
- Modify: `tests/metropolis-4.2-schedule.test.cjs`
- Modify: `tests/metropolis-4.2.1-home-dashboard.test.cjs`
- Modify: `tests/metropolis-status-signal.test.cjs`

**Interfaces:**
- Exact generation remains owned by the current maintenance publication test.
- Older tests verify component ordering, product-line compatibility and `SW ↔ manifest` consistency without hard-coding r21.

- [ ] Use the failing PR CI run as RED evidence: five unrelated historical tests still expected r20 while runtime/manifest correctly advanced to r21.
- [ ] Replace duplicated exact-generation assertions with manifest agreement or `^v4.2.5-` compatibility assertions.
- [ ] Re-run full deploy gate; no historical layer should require edits solely because a future maintenance generation advances.

### Task 7: Engineering continuation map and bug/fix log

**Files:**
- Create: `docs/engineering/METROPOLIS_MAINTENANCE_NOTES.md`

**Contents:**
- Module map: pure rules, browser adapter, report adapter, UI, tests, loader and offline shell.
- Continuation rule: extend the maintenance slice; do not add another maintenance block to `app.js`.
- Source authority note: 4.2.5 line came from `feat/metro-finalization`, while `main` was still 4.2.4 at discovery.
- Bug records discovered during this work using exact format `Symptom → Root cause → Fix → Prevention/Test`.
- Verification matrix and device-only checks still required.

- [ ] Write/update the continuation/bug log from evidence observed during implementation and CI.
- [ ] Read it back and check it contains no stale 4.2.4 implementation instruction.

### Task 8: Repository verification and publication

**Files:** all changed files above.

- [ ] Use PR CI to run the complete `npm run deploy:gate` on Node 22.
- [ ] Use GitHub readback to verify exact committed contents on the feature branch.
- [ ] Inspect PR diff for unrelated destructive changes.
- [ ] Merge only after full deploy gate is green.
- [ ] Verify `main` exact merge SHA and production asset paths.
- [ ] Confirm Cloudflare build/deploy from `main`; if connected build logs are unavailable, mark deployment verification as pending rather than claiming success.
- [ ] Request only the remaining physical-browser readbacks from BIG: safe stock adjustment/report persistence and destructive reset paths only after backup/test-state preparation.

### Task 9: Durable note in BIG's library

**Destination:** connected Google Drive / notes library.

- [ ] Create/update one current engineering note containing architecture map, decisions, source authority, release/commit evidence, bug/fix records and remaining device checks.
- [ ] Read back the note after writing and report its exact title/link.
