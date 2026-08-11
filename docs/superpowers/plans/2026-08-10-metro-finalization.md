# Metro Finalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Metro's approved daily target, end-day, compact exchange, decimal-input, and UI-cleanup set with no schema migration or accounting rewrite.

**Architecture:** Add a focused r5-5 layer on top of existing Metro runtime. Keep Ledger/source ownership in `app.js`; r5-5 computes derived UI data and invokes existing durable mutation helpers. Load/cache the new layer through existing bootstrap/service-worker paths.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, Node `node:test`, service worker Cache API.

## Global Constraints
- Product version: 4.2.5.
- Core/data release remains 2.1.4.
- State schema remains 4.
- Monetary truth remains integer satang.
- Preserve existing exchange button IDs and event handlers.
- Do not hide safety/verification/backup/security guidance.
- Feature freeze after this set.

---

### Task 1: Finalization contracts
**Files:**
- Create: `tests/metropolis-finalization.test.cjs`
- Create: `metropolis-r5-5.js`

**Interfaces:**
- Produces: `r55DailyEarningsSatang`, `r55DailyTargetProgress`, `r55PercentDelta`, `r55RankObligations`, `r55PaymentPreview`.

- [ ] Write tests for target thresholds, yesterday delta, obligation ranking/top-five, preview subtraction, and product version.
- [ ] Run `node --test tests/metropolis-finalization.test.cjs` and verify RED before implementation.
- [ ] Implement the minimal pure helpers and run the test until GREEN.

### Task 2: Daily target + end-day interaction
**Files:**
- Modify: `metropolis-r5-5.js`

**Interfaces:**
- Consumes existing app globals: `state`, `currentBalanceSatang`, `parseMoneyToSatang`, `persistAndRender`, `findQueue`, `findSource`, integrity/freshness/time gates, Ledger mutation/audit helpers.

- [ ] Add target card and editable target/pass line.
- [ ] Add yesterday comparison from recomputed daily earned revenue.
- [ ] Add end-day summary and ranked top-five obligation selection.
- [ ] Add live non-mutating payment preview.
- [ ] Apply selected full payments in one commit; rollback in-memory state on any precommit failure.
- [ ] Verify syntax and helper tests.

### Task 3: Final visual cleanup
**Files:**
- Create: `metropolis-r5-5.css`
- Modify: `metropolis-r5-5.js`

- [ ] Move existing exchange card into Settings without recreating its action buttons.
- [ ] Compact exchange layout and remove decorative copy only.
- [ ] Patch monetary number inputs to decimal step/inputmode while retaining satang parsing.
- [ ] Fix contrast on light content surfaces and remove Home pseudo-element nub.
- [ ] Verify safety `.flow-note` / `.warning` copy is not globally hidden.

### Task 4: Release wiring
**Files:**
- Modify: `sw-bootstrap.js`
- Modify: `sw.js`
- Modify: `package.json`

- [ ] Load r5-5 CSS/JS after r5-4 from `sw-bootstrap.js`.
- [ ] Add r5-5 CSS/JS to `APP_SHELL` and bump `RELEASE_ID` to `v4.2.5-20260810-r20-metro-finalization`.
- [ ] Add r5-5 to `check:syntax`.
- [ ] Run helper tests, syntax checks, UTF-8/deploy gate where the full repository runner is available.

### Task 5: Review and release
- [ ] Read back changed files from GitHub and compare branch with main.
- [ ] Confirm no schema/accounting/import-path rewrite and no unrelated refactor.
- [ ] Open PR, inspect diff/status, fix failures if any.
- [ ] Merge only after verification passes.
