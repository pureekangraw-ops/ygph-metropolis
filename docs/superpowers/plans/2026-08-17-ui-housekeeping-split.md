# UI Housekeeping Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split Home, Store, and Finance rendering out of `ui/app.mjs` while preserving behavior exactly.

**Architecture:** `ui/app.mjs` remains the composition root and owns runtime/global state. Three focused UI factories receive DOM/formatting/navigation dependencies and render from the existing context object. No domain or calculation ownership moves into UI.

**Tech Stack:** Browser ES modules, DOM APIs, Node.js test runner, existing Greenfield deploy gate.

## Global Constraints
- No user-visible behavior changes.
- No business logic, workflow, persistence, calculation, or domain changes.
- No theme changes.
- Existing Thai copy, DOM IDs, routes, ordering, and VERIFY states stay identical.
- New production imports must be represented in publication manifest, allowlist, and offline shell.

---

### Task 1: Lock renderer extraction contract

**Files:**
- Create: `tests/greenfield-ui-housekeeping.test.cjs`

**Interfaces:**
- Consumes: repository source files.
- Produces: structural assertions for `createHomeUi`, `createStoreUi`, `createFinanceUi` and `ui/app.mjs` delegation.

- [ ] Write a failing Node test that asserts the three new files exist, export their factory names, are imported by `ui/app.mjs`, and that `ui/app.mjs` no longer defines `renderHome`, `renderStore`, or `renderFinance`.
- [ ] Push test and confirm Greenfield gate fails before implementation.

### Task 2: Extract Home renderer

**Files:**
- Create: `ui/home-ui.mjs`
- Modify: `ui/app.mjs`

**Interfaces:**
- Consumes: `getById`, `formatSatang`, `bahtText`, `routeTo`, `projectAttention`.
- Produces: `createHomeUi(deps)` returning `{ renderHome(context) }`.

- [ ] Move Home rendering byte-for-byte in behavior into `home-ui.mjs`.
- [ ] Instantiate once from `ui/app.mjs` and delegate `homeUi.renderHome(context)`.

### Task 3: Extract Store renderer

**Files:**
- Create: `ui/store-ui.mjs`
- Modify: `ui/app.mjs`

**Interfaces:**
- Consumes: `getById`, `getState`, `bahtText`, `simpleItem`, `setStoreView`, `projectStoreReceivables`.
- Produces: `createStoreUi(deps)` returning `{ renderStore(context) }`.

- [ ] Move Store receivable/stock/history rendering without changing copy, sort order, or VERIFY behavior.
- [ ] Delegate Store rendering from `ui/app.mjs`.

### Task 4: Extract Finance renderer

**Files:**
- Create: `ui/finance-ui.mjs`
- Modify: `ui/app.mjs`

**Interfaces:**
- Consumes: `getById`, `numberText`, `bahtText`, `simpleItem`, `routeTo`.
- Produces: `createFinanceUi(deps)` returning `{ renderFinance(context) }`.

- [ ] Move Finance balance/pressure/obligation/history rendering without changing copy or routing.
- [ ] Delegate Finance rendering from `ui/app.mjs`.

### Task 5: Publication closure and Gate

**Files:**
- Modify: `RELEASE_MANIFEST.json`
- Modify: `.assetsignore`
- Modify: `sw.js`

**Interfaces:**
- Consumes: production import-closure gate.
- Produces: complete production asset set with revised asset hash.

- [ ] Add the three modules to production publication files, allowlist, and service-worker shell.
- [ ] Run the Greenfield deploy gate and use its calculated asset revision if only the expected cache hash fails.
- [ ] Re-run the full gate on the exact same commit after green.
- [ ] Review PR diff for scope creep, duplicated renderer code, and accidental copy/logic changes.
- [ ] Merge only after repeated Greenfield gate success; then verify post-merge gate and production deploy.
