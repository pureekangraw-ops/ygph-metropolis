# METROPOLIS Maintenance Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add auditable manual stock adjustment plus a four-level Recovery & Reset Center to METROPOLIS 4.2.5 without changing the encrypted DB schema or breaking existing source/ledger history.

**Architecture:** Keep maintenance isolated from `app.js`. Put deterministic validation/planning in `metropolis-maintenance-core.js`, browser integration in `metropolis-maintenance.js`, visual rules in `metropolis-maintenance.css`, and behavior/source-contract coverage in `tests/metropolis-maintenance.test.cjs`. Load the slice after `metropolis-r5-5` and include it in the explicit production/offline shell.

**Tech Stack:** Vanilla JavaScript, browser IndexedDB/Cache/Service Worker APIs, existing METROPOLIS modal/runtime helpers, Node built-in test runner.

## Global Constraints
- Product line remains METROPOLIS 4.2.5; this is a runtime maintenance release, not a schema migration.
- `DB_NAME = stock-pocket-secure`, DB version 1, state schema 4 remain unchanged.
- Manual stock adjustment must not create Ledger transactions automatically.
- Partial reset must not delete durable sales/purchases/jobs/ledger/calendar source history.
- Factory reset is the only operation that destroys the entire local database.
- Full Local Cleanup requires network availability before removing app caches/service worker.
- Every non-destructive state mutation must go through existing encrypted durable commit/readback.
- Production shell, `.assetsignore`, manifest, syntax gate and service-worker release generation must all include the new maintenance assets.

---

### Task 1: Pure maintenance rules — RED/GREEN

**Files:**
- Create: `metropolis-maintenance-core.js`
- Create: `tests/metropolis-maintenance.test.cjs`

**Interfaces:**
- Produces `planStockAdjustment(input)`, `applyStockAdjustmentToState(state, plan)`, `planPartialReset(input)`, `isFactoryConfirmation(value)`, `isFullCleanupConfirmation(value)`, `maintenanceCacheTargets(cacheNames)`.
- Browser runtime consumes these functions through `globalThis.YGPHMaintenanceCore`; Node tests consume `module.exports`.

- [ ] Write failing tests for stock increase/decrease/correction, required reason, bounds, no Ledger mutation, zero-stock value invariant, safe partial reset semantics, confirmation phrases and cache targeting.
- [ ] Run `node --test tests/metropolis-maintenance.test.cjs` and confirm RED because the core module does not exist.
- [ ] Implement the minimum pure module to satisfy tests.
- [ ] Re-run the focused test and confirm GREEN.

### Task 2: Browser maintenance runtime — RED/GREEN

**Files:**
- Create: `metropolis-maintenance.js`
- Modify: `tests/metropolis-maintenance.test.cjs`

**Interfaces:**
- Consumes existing browser globals: `state`, `openModal`, `closeModal`, `toast`, `persistAndRender`, `promptVerifyBalance`, `byId`, `uid`, `nowIso`, `DB_NAME`, `APP_CACHE_PREFIX` semantics via local constants.
- Produces UI entry points injected into Store and Settings; no new global business owner.

- [ ] Add source-contract tests requiring a Store manual-adjust button, Settings Recovery card, use of `persistAndRender`, typed `RESET` / `RESET ALL`, IndexedDB delete handling, cache/SW cleanup and no direct Ledger transaction creation.
- [ ] Run focused test and confirm RED because runtime file does not exist.
- [ ] Implement UI injection and runtime adapters.
- [ ] Re-run focused test and confirm GREEN.

### Task 3: Maintenance UI styles and runtime loader

**Files:**
- Create: `metropolis-maintenance.css`
- Modify: `sw-bootstrap.js`
- Modify: `.assetsignore`
- Modify: `package.json`

**Interfaces:**
- `sw-bootstrap.js` loads core then runtime after r5-5; CSS loads with the maintenance layer.
- `package.json` syntax gate parses both new JS files.

- [ ] Add loader/allowlist/syntax assertions to the maintenance test.
- [ ] Confirm RED.
- [ ] Add assets in deterministic order: CSS → core JS → runtime JS after r5-5.
- [ ] Add files to Cloudflare static-asset allowlist and syntax command.
- [ ] Confirm focused tests GREEN and `node --check` on the two new files passes.

### Task 4: Offline shell / release manifest

**Files:**
- Modify: `sw.js`
- Modify: `RELEASE_MANIFEST.json`
- Modify: `tests/metropolis-maintenance.test.cjs`

**Interfaces:**
- New service-worker release generation: `v4.2.5-20260811-r21-maintenance-center`.
- APP_SHELL includes `metropolis-maintenance.css`, `metropolis-maintenance-core.js`, `metropolis-maintenance.js`.

- [ ] Add tests asserting the three maintenance assets appear in APP_SHELL/manifest and release id advances from r20.
- [ ] Confirm RED.
- [ ] Update service-worker shell and manifest runtime/production asset lists.
- [ ] Confirm focused test GREEN.

### Task 5: Engineering continuation map and bug/fix log

**Files:**
- Create: `docs/engineering/METROPOLIS_MAINTENANCE_NOTES.md`

**Contents:**
- Module map: where pure rules, browser adapters, UI, tests, loader and offline shell live.
- Continuation rule: extend the maintenance slice; do not add another maintenance block to `app.js`.
- Source authority note: 4.2.5 line came from `feat/metro-finalization`, while `main` was still 4.2.4 at discovery.
- Bug records discovered during this work using exact format `Symptom → Root cause → Fix → Prevention/Test`.
- Verification matrix and device-only checks still required.

- [ ] Write the continuation/bug log from evidence observed during implementation.
- [ ] Read it back and check it contains no stale 4.2.4 implementation instruction.

### Task 6: Repository verification and publication

**Files:** all changed files above.

- [ ] Run focused maintenance tests and syntax checks in an isolated local reconstruction.
- [ ] Use GitHub readback to verify exact committed contents on the feature branch.
- [ ] Open PR from `feat/metropolis-maintenance-center` to `main`; PR explicitly includes the pre-existing 4.2.5 finalization commits because `main` was behind.
- [ ] Inspect PR diff for unrelated destructive changes.
- [ ] Merge only after source-contract verification is green.
- [ ] Verify `main` exact merge SHA and production asset paths.
- [ ] Confirm Cloudflare build/deploy from `main`; if connector access to build logs is unavailable, mark deployment verification as pending rather than claiming success.
- [ ] Ask BIG for the final mobile runtime readback only for behaviors that require the physical browser/device: manual stock correction durable readback, Factory Reset first-run Setup, and Full Cleanup rebootstrap.

### Task 7: Durable note in BIG's library

**Destination:** connected Google Drive / notes library.

- [ ] Create/update one current engineering note containing architecture map, decisions, source authority, release/commit evidence, bug/fix records and remaining device checks.
- [ ] Read back the note after writing and report its exact title/link.
