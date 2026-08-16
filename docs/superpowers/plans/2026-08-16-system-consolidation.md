# METROPOLIS System Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate METROPOLIS so calculations, actionability, UI wording, persisted-state compatibility, and end-to-end behavior share one source of truth and are verified before production.

**Architecture:** Keep existing domain ownership and atomic workflows. Add a calculation authority and system reconciliation contract, make UI projections delegate to them, strengthen action contracts, and verify all important user flows from persisted state through reload.

**Tech Stack:** ES modules, Node.js 22 built-in test runner, IndexedDB/PWA production shell, GitHub Actions.

## Global Constraints

- Preserve STORE / LEDGER / CALENDAR / RIDE ownership.
- Do not add theme work or unrelated features.
- UI must not manufacture financial truth.
- Every visible action must either have a proven executable contract or be rendered as non-actionable/verify state.
- All monetary arithmetic remains integer satang.
- Gate must cover persisted-state -> projection -> action -> workflow -> durable readback -> reconciliation.

---

### Task 1: Calculation authority and naming

**Files:**
- Create: `greenfield/calculation-authority.mjs`
- Modify: `ui/product-model.mjs`
- Test: `tests/greenfield-calculation-authority.test.cjs`

**Interfaces:**
- Produces `projectFinancialTruth(state, ledgerBalanceSatang, today, nearDays)` and `projectGeneratedIncome(state, today)`.
- UI projection functions delegate to this module.

- [ ] Write failing tests for cash balance, generated vs realized cash, obligation totals, receivables, pending Ride credit, near-term due, and shortfall.
- [ ] Verify RED.
- [ ] Implement authority using existing domain records without mutating state.
- [ ] Delegate existing UI projections while preserving public return fields needed by callers.
- [ ] Verify GREEN.

### Task 2: Reconciliation contract

**Files:**
- Create: `greenfield/system-reconciliation.mjs`
- Test: `tests/greenfield-system-reconciliation.test.cjs`

**Interfaces:**
- Produces `reconcileSystemState(state, { ledgerBalanceSatang, today, nearDays }) -> { status, errors, truth }`.

- [ ] Write failing tests for obligation/installment drift, receivable/queue ambiguity, Ride credit overdraw, duplicate money queues, and valid imported compatibility cases.
- [ ] Verify RED.
- [ ] Implement fail-closed reconciliation without repairing data silently.
- [ ] Verify GREEN.

### Task 3: Action contract completeness

**Files:**
- Modify: `greenfield/action-contract.mjs`
- Modify: `ui/app.mjs`
- Test: `tests/greenfield-actionability-matrix.test.cjs`

**Interfaces:**
- `resolveCalendarAction` is the only authority deciding whether Calendar renders an executable action.

- [ ] Write matrix tests for OPEN/PARTIAL/COMPLETED/CANCELLED, missing/duplicate/conflicting sources, zero/overpayment, and non-money Calendar completion.
- [ ] Verify RED for uncovered cases.
- [ ] Tighten contract and UI rendering so unproven actions do not render as executable buttons.
- [ ] Verify GREEN.

### Task 4: Reporter copy pass

**Files:**
- Modify: `ui/app.mjs`
- Modify: `index.html`
- Test: `tests/greenfield-copy-contract.test.cjs`

**Interfaces:**
- User-facing labels distinguish cash truth, generated income, receivables/credit, near-term obligations, and verify states.

- [ ] Write tests preventing misleading labels such as treating Ledger balance as safe-to-spend or generated income as cash received.
- [ ] Verify RED.
- [ ] Update labels only; do not change domain behavior.
- [ ] Verify GREEN.

### Task 5: Stateful E2E and button inventory gate

**Files:**
- Create/modify: `tests/greenfield-system-e2e.test.cjs`
- Modify: existing button inventory tests if needed.

**Interfaces:**
- Tests execute runtime workflows against durable-compatible state and verify readback/reconciliation.

- [ ] Cover cash sale, receivable partial/full receipt, obligation partial/full payment, overpayment rejection with zero mutation, Ride cash/credit/withdrawal, stock purchase/sale/withdrawal/adjustment, and invalid relation fail-closed.
- [ ] Verify every static and generated executable action has an owner/handler contract.
- [ ] Run complete `npm run deploy:gate` twice, with a second review of the diff between runs.

### Task 6: Production publication and merge

**Files:**
- Modify: `RELEASE_MANIFEST.json`, `.assetsignore`, `sw.js` only when production module set/revision requires it.

- [ ] Align production allowlist and service-worker asset revision from gate output.
- [ ] Run final gate to success.
- [ ] Review diff against `main` for unused wrappers, duplicate authorities, or silent repair paths.
- [ ] Merge only after second-pass gate success.
- [ ] Verify post-merge main gate and deploy success.
