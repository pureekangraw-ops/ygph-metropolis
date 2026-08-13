# METROPOLIS Functional Shell v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Greenfield production shell into a functionally usable METROPOLIS app with HOME / MAKE MONEY / CALENDAR / FINANCE / SYSTEM, a right-thumb rail, a real Calendar month view, daily income goals, money-vs-obligation projections, and a bounded RIDE baseline while preserving existing encrypted data.

**Architecture:** Keep STORE, LEDGER, and CALENDAR ownership intact and add RIDE as a dedicated durable domain through a backward-compatible state migration. Put cross-screen calculations in pure projection/model modules, not duplicated in DOM code. UI remains task-oriented; runtime remains domain-oriented.

**Tech Stack:** Plain ESM JavaScript, IndexedDB encrypted vault, Node `node:test`, static HTML/CSS, GitHub Actions, Cloudflare Worker assets.

## Global Constraints

- Existing database name and vault format remain unchanged.
- Existing schema-1 vaults must unlock without re-importing Evidence.
- Schema migration may add RIDE but must preserve every STORE / LEDGER / CALENDAR record, revision lineage, import verification, and command log.
- Legacy `stock-pocket-secure` remains rollback-only and untouched.
- MAKE MONEY generated income is not the FINANCE spendable balance.
- FINANCE/LEDGER remains the owner of real money and obligations.
- CALENDAR remains the time/action projection and must not manufacture cash truth.
- HOME is projection-only and shows at most three high-priority attention items by default.
- Visual polish is deferred; only hierarchy, touch targets, state distinction, and safe operation are in scope.

---

### Task 1: State schema 2 and safe RIDE migration

**Files:**
- Modify: `greenfield/core.mjs`
- Modify: `greenfield/persistence.mjs`
- Modify: `greenfield/cutover.mjs`
- Modify: `tests/greenfield-core.test.cjs`
- Modify: `tests/greenfield-persistence.test.cjs`

**Interfaces:**
- Produce `GREENFIELD_SCHEMA = 2` and domains `STORE / LEDGER / CALENDAR / RIDE`.
- Produce `migrateGreenfieldState(state)` that converts schema 1 to schema 2 by adding an empty RIDE domain and preserving all existing data.
- `readEncryptedState()` decrypts, migrates, validates, and returns the current state shape.

- [ ] Write tests proving schema-1 state migrates without changing existing domain records, revision, import metadata, or command log.
- [ ] Verify tests fail against current schema-1 implementation.
- [ ] Implement migration and schema-2 validation.
- [ ] Verify existing encrypted persistence and cutover tests still pass.

### Task 2: RIDE domain and owner-safe workflows

**Files:**
- Modify: `greenfield/domain-operations.mjs`
- Modify: `greenfield/business-workflows.mjs`
- Modify: `greenfield/runtime.mjs`
- Create: `tests/greenfield-ride.test.cjs`

**Interfaces:**
- Runtime methods: `rideStartRound`, `rideEndRound`, `rideJob`, `rideExpense`, `rideWithdrawCredit`.
- RIDE owns round/job/credit operational records.
- Cash job -> RIDE record + LEDGER IN.
- Credit job -> RIDE record only until withdrawal.
- Ride expense -> RIDE expense + LEDGER OUT.
- Credit withdrawal -> RIDE withdrawal + LEDGER IN and may not exceed pending credit.

- [ ] Write failing workflow tests for cash, credit, expense, round lifecycle, and credit-withdrawal guard.
- [ ] Implement minimal RIDE commands and workflows.
- [ ] Verify atomic workflow/idempotency behavior remains intact.

### Task 3: Pure functional projections

**Files:**
- Create: `ui/product-model.mjs`
- Create: `tests/greenfield-product-model.test.cjs`

**Interfaces:**
- `dateKey(value)`
- `deriveTimeState(record, today, nearDays=7)` -> `OVERDUE | TODAY | NEAR | FUTURE | COMPLETED | CANCELLED`
- `projectMakeMoney(state, today)` -> store / ride / combined generated income.
- `suggestDailyGoal({dailyIncome, balanceSatang, nearObligations, today})` -> rounded suggested satang target using a robust median-based baseline and uncovered near-term obligation pressure.
- `projectFinance(state, ledgerBalanceSatang, today)` -> spendable balance, today IN/OUT, obligations, monthly due, near-term pressure, payable threshold.
- `projectAttention(...)` -> ranked, max-three deep-linkable HOME items.
- `buildMonthGrid({year, monthIndex, calendarRecords, today})` -> 42 day cells with counts/states.

- [ ] Write failing tests for daily-goal stability inputs, zero-income days, time states, obligation shortfall, payable threshold, collision flag, and HOME ranking.
- [ ] Implement pure functions without DOM/runtime dependencies.
- [ ] Verify all pure tests pass.

### Task 4: Daily goal persistence without a second money truth

**Files:**
- Modify: `greenfield/runtime.mjs`
- Create: `tests/greenfield-daily-goal.test.cjs`

**Interfaces:**
- Store daily goal plan metadata under encrypted `state.meta.dailyGoals[YYYY-MM-DD]`.
- Runtime methods: `ensureDailyGoal({date, suggestedSatang})`, `overrideDailyGoal({date, goalSatang})`.
- Goal metadata changes state revision but never writes LEDGER transactions or rewrites income history.

- [ ] Write failing tests for one goal per day, stable auto goal, manual override for current day only, and no Ledger mutation.
- [ ] Implement coordinated encrypted metadata mutation with durable readback.
- [ ] Verify stale durable revision protection still applies.

### Task 5: Functional navigation shell and Phosphor icon system

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `ui/app.mjs`
- Create: `ui/icons.mjs`
- Create: `tests/greenfield-functional-shell.test.cjs`

**Interfaces:**
- Top destinations: HOME / MAKE MONEY / CALENDAR / FINANCE / SYSTEM.
- Compact mobile navigation: fixed right-thumb rail, icon-only, selected state, accessible `aria-label`.
- MAKE MONEY children: Dashboard / ร้านค้า / วิ่ง.
- Child panels stay collapsed until selected; navigation rail contains no business action.
- Phosphor icon family is used consistently; vendored SVG path data is local/offline.

- [ ] Write static contract tests proving the five destinations, icon-only rail, no legacy flat STORE/LEDGER/RECOVERY peer tabs, and no raw diagnostics on HOME.
- [ ] Implement the shell and minimal hierarchy CSS.
- [ ] Verify touch targets and content do not sit beneath the rail on compact widths.

### Task 6: MAKE MONEY, Store and Ride working screens

**Files:**
- Modify: `index.html`
- Modify: `ui/app.mjs`
- Modify: `styles.css`

- [ ] Render combined generated income, daily target, remaining target, and source split.
- [ ] Allow manual daily-target override.
- [ ] Keep Store sale as primary; hide receive/withdraw/adjust under child management controls.
- [ ] Wire Ride start/end round, job cash/credit, expense, and credit withdrawal to runtime.
- [ ] Keep generated income separate from spendable balance in all labels and values.

### Task 7: FINANCE and money-vs-obligation behavior

**Files:**
- Modify: `index.html`
- Modify: `ui/app.mjs`
- Modify: `styles.css`

- [ ] Show persistent spendable balance, today IN/OUT, monthly due amount, remaining obligations, and near-term pressure.
- [ ] Keep income/expense entry and obligation creation under FINANCE.
- [ ] Surface payable-threshold suggestion but never auto-pay.
- [ ] Route obligation details to relevant Calendar date when useful.

### Task 8: CALENDAR month view and contextual actions

**Files:**
- Modify: `index.html`
- Modify: `ui/app.mjs`
- Modify: `styles.css`

- [ ] Render 7-column month grid with previous / today / next controls.
- [ ] Mark dates with work counts/states without full titles in cells.
- [ ] Tap a date to filter its items below the grid.
- [ ] Keep completed/cancelled history accessible through filters.
- [ ] Reuse owner-safe payment/status workflows for contextual actions.

### Task 9: HOME attention and SYSTEM workbench

**Files:**
- Modify: `index.html`
- Modify: `ui/app.mjs`
- Modify: `styles.css`

- [ ] HOME renders at most three ranked attention items and no edit/business forms.
- [ ] Tapping HOME attention deep-links to the owning screen/date/detail.
- [ ] SYSTEM groups settings, backup/restore, version/system checks, diagnostics Advanced, and lock.
- [ ] Keep raw diagnostics collapsed under Advanced.
- [ ] Require explicit confirmation before restore/high-risk controls.

### Task 10: Publication gate and release metadata

**Files:**
- Modify: `package.json`
- Modify: `RELEASE_MANIFEST.json`
- Modify: `.assetsignore`
- Modify: `sw.js`

- [ ] Add new production modules to syntax, UTF-8, service-worker shell, and publication allowlist.
- [ ] Update manifest to schema 2 / RIDE-aware productization branch identity without changing database/vault identity.
- [ ] Run `npm run deploy:gate` in PR CI.
- [ ] Review diff for ownership leaks, legacy-storage references, duplicate money truth, or accidental production deployment.
