# METROPOLIS 4.2.2 Home Dashboard Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the approved Home Dashboard, three-color Calendar status, cancelled visibility, and visible release version authoritative in production.

**Architecture:** Keep the existing encrypted state and renderer contracts. Correct behavior at two additive boundaries: R5-3 supplies live-only collections before existing renderers run and paints a single three-color Calendar signal; R5-4 owns Home composition and product version. Durable state is restored with `try/finally`, and no schema or money semantics change.

**Tech Stack:** Vanilla JavaScript, CSS, Node `node:test`, Service Worker cache lifecycle.

## Global Constraints

- Product version after this production UI correction: `4.2.2`.
- Service-worker generation: `v4.2.2-20260808-r11-home-authority`.
- Dashboard order: purple → green → yellow → red.
- `CANCELLED` is never shown or counted in live/list views but remains in durable history.
- Calendar/list status colors are only green/yellow/red.
- No schema, IndexedDB, vault, encryption, transaction, or durable-history mutation.

---

### Task 1: Lock the corrected behavior with failing tests

**Files:**
- Modify: `tests/metropolis-4.2.1-home-dashboard.test.cjs`
- Modify: `tests/metropolis-status-signal.test.cjs`

**Interfaces:**
- Consumes: `r54Metrics(state, today)`, `statusSignal(item, today)`, `liveStatusSignal(item, sourceStatus, today)`.
- Produces: regression expectations for Home replacement, outgoing unpaid amount/count, authoritative version, pre-render live filtering, and three-color Calendar pills.

- [ ] **Step 1: Write failing Dashboard tests**

Add assertions that the newest runtime removes `.metropolis-city-hero`, inserts Dashboard before the app section, exports `pendingOutSatang`, writes version text directly as `4.2.2`, and patches the older 4.2 version writer.

- [ ] **Step 2: Write failing status/live-filter tests**

Add assertions that R5-3 wraps Calendar/source renderers with live-only arrays before rendering and applies the same `r53-status-*` class to the Calendar status pill.

- [ ] **Step 3: Verify RED**

Run: `npm test`

Expected: FAIL because current R5-3/R5-4 do not yet satisfy the new assertions.

### Task 2: Make R5-3 the live visibility and status adapter

**Files:**
- Modify: `metropolis-r5-3.js`
- Modify: `metropolis-r5-3.css`

**Interfaces:**
- Consumes: `state`, `findSource`, `renderCalendar`, `renderStore`, `renderRide`, `renderLedger`, `historyHtml`.
- Produces: `withLiveCalendar(callback)`, `withLiveSourceRecords(callback)`, patched renderers, unified Calendar status-pill classes.

- [ ] **Step 1: Add live-only source filtering**

Temporarily replace STORE sales/purchases, RIDE jobs/credit withdrawals, and LEDGER obligations with arrays whose status is not `CANCELLED`; restore originals in `finally`.

- [ ] **Step 2: Wrap renderers before DOM cleanup**

Wrap `renderCalendar`, `renderStore`, `renderRide`, `renderLedger`, and `historyHtml` once so cancelled records never occupy `lastFive` slots or aggregate list rows.

- [ ] **Step 3: Unify Calendar status pill signal**

When painting each queue card, attach the same `r53-status-green|yellow|red` class to both the dot and `.status` pill. CSS overrides old semantic pill palettes inside `#queueList`.

- [ ] **Step 4: Run status tests**

Run: `node --test tests/metropolis-status-signal.test.cjs`

Expected: PASS.

### Task 3: Make R5-4 the Home and visible-version authority

**Files:**
- Modify: `metropolis-r5-4.js`
- Modify: `metropolis-r5-4.css`
- Modify: `tests/metropolis-4.2.1-home-dashboard.test.cjs`

**Interfaces:**
- Consumes: `currentBalanceSatang`, `money`, `queueDirection`, `findSource`.
- Produces: `r54Metrics` returning `{ cashSatang, stockQty, overdue, pendingOut, pendingOutSatang }`; authoritative visible version `4.2.2`.

- [ ] **Step 1: Replace the old Home hero slot**

Remove `.metropolis-city-hero` and insert Dashboard before the existing app section.

- [ ] **Step 2: Compute unpaid outgoing amount and count**

For active outgoing queues, sum `max(0, amountSatang - paidSatang)` into `pendingOutSatang` while retaining `pendingOut` count. Render red card as amount plus item count.

- [ ] **Step 3: Claim visible version authority**

Set `.status-line b` text directly to `METROPOLIS v4.2.2`, set document title/data version, and replace the older `applyProductVersion42` writer with a delegating function that reapplies 4.2.2.

- [ ] **Step 4: Remove CSS pseudo-version workaround**

Delete the `font-size:0` / `::after` version trick from `metropolis-r5-4.css`.

- [ ] **Step 5: Run Dashboard tests**

Run: `node --test tests/metropolis-4.2.1-home-dashboard.test.cjs`

Expected: PASS.

### Task 4: Advance production release metadata and cache generation

**Files:**
- Modify: `RELEASE_MANIFEST.json`
- Modify: `sw.js`
- Modify: tests that pin the release ID/version.

**Interfaces:**
- Produces: release `4.2.2-home-authority`; Service Worker `v4.2.2-20260808-r11-home-authority`.

- [ ] **Step 1: Advance release identifiers**

Update manifest release/note and Service Worker `RELEASE_ID` without changing APP_SHELL contents.

- [ ] **Step 2: Update pinned release tests**

Replace 4.2.1/r10 assertions with 4.2.2/r11 where the test is intended to track the current production generation.

- [ ] **Step 3: Run final deploy gate**

Run: `npm run deploy:gate`

Expected: all tests, syntax checks, and UTF-8 checks pass with no warnings/errors.
