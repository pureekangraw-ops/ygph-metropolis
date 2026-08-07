# METROPOLIS 4.2 Schedule Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace new-obligation total-splitting with an amount-per-installment schedule engine that supports weekly/monthly recurrence, preview, safe installment management, payment holidays, and early settlement while preserving all existing Schema 4 data semantics.

**Architecture:** Add a focused `metropolis-r5-2.js/css` layer after the current 4.1 layer. New 4.2 obligations are explicitly tagged `scheduleMode: "PER_INSTALLMENT"`; legacy obligations remain under the existing R5 total-split reconciliation. Patch the existing R5 reconciler only enough to skip 4.2 obligations, and route every persistent mutation through existing state helpers and `persistAndRender`.

**Tech Stack:** Plain JavaScript classic scripts, CSS, Node `node:test`, existing Schema 4 encrypted vault, GitHub Actions, Cloudflare Worker static asset shell.

## Global Constraints

- Repository: `pureekangraw-ops/ygph-metropolis` only.
- User-facing version: `METROPOLIS v4.2.0`.
- Service Worker release: `v4.2.0-20260808-r6-schedule`.
- State Schema remains 4.
- New obligations use amount per installment; existing obligations retain current total-split semantics.
- Money is integer satang.
- Completed/cancelled installments are immutable during schedule edits.
- `ข้ามรอบนี้` shifts dates by one interval; it never forgives debt.
- Early settlement creates linked payment transactions; it never deletes or rewrites protected money history.
- No Site Data clearing.

---

### Task 1: RED schedule-engine contracts

**Files:**
- Create: `tests/metropolis-4.2-schedule.test.cjs`

**Interfaces:**
- Produces required pure exports from `metropolis-r5-2.js`: `METROPOLIS_PRODUCT_VERSION`, `scheduleDueDates(firstDue,count,frequency)`, `totalFromInstallment(installmentSatang,count)`, `shiftDueOneInterval(due,frequency)`, `derivePerInstallmentSchedule(obligation)`.

- [ ] **Step 1: Write focused failing tests** for per-installment totals, weekly/monthly dates, legacy isolation guard, edit/skip/early-settlement source contracts, asset loading, product version, and SW release.
- [ ] **Step 2: Open the PR with tests/docs only and verify RED** because `metropolis-r5-2.js` does not exist and the existing R5 reconciler has no `PER_INSTALLMENT` guard.

### Task 2: Pure schedule engine and new-obligation form

**Files:**
- Create: `metropolis-r5-2.js`
- Create: `metropolis-r5-2.css`
- Modify: `metropolis-r5.js`

**Interfaces:**
- `scheduleDueDates(firstDue,count,frequency) -> string[]`
- `totalFromInstallment(installmentSatang,count) -> integer satang`
- `shiftDueOneInterval(due,frequency) -> ISO date`
- `derivePerInstallmentSchedule(obligation) -> [{number,amountSatang,due}]`

- [ ] **Step 1: Implement pure date/money helpers** with `WEEKLY` = +7 days and `MONTHLY` = clamped calendar months.
- [ ] **Step 2: Add the R5 legacy guard** so `repairMissingInstallments()` skips obligations whose `scheduleMode === "PER_INSTALLMENT"`.
- [ ] **Step 3: Override `addDebtBtn` in the 4.2 layer** with fields for amount per installment, count, frequency, and first due date.
- [ ] **Step 4: Add live preview** showing total and every generated installment in a scrollable preview block.
- [ ] **Step 5: Save new obligations** with `scheduleMode`, `scheduleFrequency`, `installmentAmountSatang`, total `originalSatang`, complete installment metadata, and matching Calendar queues.

### Task 3: 4.2 reconciliation and installment manager

**Files:**
- Modify: `metropolis-r5-2.js`
- Modify: `metropolis-r5-2.css`

**Interfaces:**
- `repairPerInstallmentObligations() -> number of repaired records`
- `openInstallmentManager(queueId) -> modal workflow`
- `applyInstallmentEdit(queueId,{scope,amountSatang,due,frequency})`
- `skipInstallmentInterval(queueId)`
- `settleObligationEarly(queueId)`

- [ ] **Step 1: Implement idempotent 4.2 reconciliation** using installment records as authoritative and recreating only genuinely missing queues/metadata.
- [ ] **Step 2: Decorate active installment queue actions** so the existing `เลื่อน` button becomes `จัดการงวด` for 4.2 obligations.
- [ ] **Step 3: Implement edit-this-installment** and recompute obligation totals/remaining without touching completed/cancelled installments.
- [ ] **Step 4: Implement edit-this-and-future** using the selected due date as the new anchor and applying the chosen frequency/amount to active future installments.
- [ ] **Step 5: Implement `ข้ามรอบนี้`** by shifting the selected and later active installments one interval while preserving all amounts.
- [ ] **Step 6: Implement early settlement** with one standard `OBLIGATION_PAYMENT` transaction per remaining queue and idempotent action keys, then complete all remaining installment queues.
- [ ] **Step 7: Persist each manager action exactly once** through `persistAndRender`, with source/queue revisions and history updated through existing helpers.

### Task 4: Version ownership and offline delivery

**Files:**
- Modify: `metropolis-r5-1.js`
- Modify: `sw-bootstrap.js`
- Modify: `sw.js`
- Modify: `.assetsignore`
- Modify: `package.json`
- Modify: `scripts/verify-utf8.mjs`
- Modify: `RELEASE_MANIFEST.json`

- [ ] **Step 1: Make 4.1 version rendering yield to 4.2** when the 4.2 runtime marker is present, preventing observer version ping-pong.
- [ ] **Step 2: Load `metropolis-r5-2.css/js` after 4.1** in the bootstrap.
- [ ] **Step 3: Add 4.2 assets** to Service Worker APP_SHELL, `.assetsignore`, syntax checks, UTF-8 checks, and release manifest.
- [ ] **Step 4: Advance product/SW release metadata** to 4.2.0 / `v4.2.0-20260808-r6-schedule`.

### Task 5: GREEN verification and integration

- [ ] **Step 1: Run/observe focused tests and full `npm run deploy:gate`.** Expected: all tests, syntax, UTF-8 pass.
- [ ] **Step 2: Review PR changed files** and confirm no unrelated STORE/RIDE/vault changes.
- [ ] **Step 3: Merge the green PR to `main`.**
- [ ] **Step 4: Read back `main`** for `metropolis-r5-2.js` and SW release, then report Cloudflare deployment separately until its build log confirms publication.