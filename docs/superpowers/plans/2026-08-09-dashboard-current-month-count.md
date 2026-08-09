# Dashboard Current-Month Count Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Change the red Home dashboard card from all active outgoing amount + count to current-month outgoing count only.

**Architecture:** Keep Ledger and Calendar source data unchanged. Change only the R5-4 dashboard projection so it filters active outgoing queue items by `due.slice(0, 7) === today.slice(0, 7)` and renders only the resulting count. Preserve overdue logic and all underlying payment amounts.

**Tech Stack:** Vanilla JavaScript, Node test runner, existing METROPOLIS R5-4 runtime.

## Global Constraints

- Do not mutate Ledger or Calendar records.
- Do not change overdue-card semantics.
- Red card label becomes `ค้างจ่ายเดือนนี้`.
- Red card value becomes `<N> รายการ` only; no baht amount.
- Count only active outgoing Calendar items whose due month equals the current month.
- Release/cache generation must advance together so the UI change reaches production.

---

### Task 1: Dashboard projection and rendering

**Files:**
- Modify: `metropolis-r5-4.js`
- Test: `tests/metropolis-4.2.1-home-dashboard.test.cjs`

**Interfaces:**
- Consumes: `r54Metrics(targetState, today)` and `queueDirection(item)`.
- Produces: `pendingOutThisMonth` count used by `r54SyncDashboard()`.

- [ ] **Step 1: Write a failing regression test**

Add a test fixture with active outgoing items in the current month, next month, and a cancelled/completed item. Assert that the dashboard metric counts only active current-month outgoing items and that the rendered card contract contains no baht amount.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --test tests/metropolis-4.2.1-home-dashboard.test.cjs`
Expected: FAIL because `r54Metrics()` still counts all active outgoing items and the card still renders amount + count.

- [ ] **Step 3: Implement the minimal projection change**

In `r54Metrics(targetState, today)`, compute `monthKey = String(today).slice(0, 7)`, filter outgoing items to `String(item?.due || "").slice(0, 7) === monthKey`, and return that count as the red-card count. Do not alter overdue calculation or Ledger/Calendar state.

Change the red card markup label from `ค้างจ่าย` to `ค้างจ่ายเดือนนี้` and change `r54SyncDashboard()` to render `${metrics.pendingOut.toLocaleString("th-TH")} รายการ` only.

- [ ] **Step 4: Run focused test and verify pass**

Run: `node --test tests/metropolis-4.2.1-home-dashboard.test.cjs`
Expected: PASS.

### Task 2: Release/cache update and final gate

**Files:**
- Modify: `metropolis-r5-4.js`
- Modify: `sw.js`
- Modify: `RELEASE_MANIFEST.json`
- Modify focused release/version tests as required by existing contracts.

- [ ] **Step 1: Advance visible product version and cache generation together**

Bump from 4.2.3 to the next patch release and create a new service-worker `RELEASE_ID` generation describing the dashboard-current-month change.

- [ ] **Step 2: Run the repository safety gate**

Run: `npm run deploy:gate`
Expected: all tests/syntax/UTF-8 checks pass.

- [ ] **Step 3: Open PR and merge only after green gate**

Create a PR from `fix/dashboard-current-month-count` to `main`, verify checks are green, then merge. Production deployment remains the existing main-push workflow.
