# METROPOLIS System Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate METROPOLIS so implemented behavior, calculations, actionability, UI wording, persisted-state compatibility, and end-to-end verification are aligned without silently redefining domain meaning.

**Architecture:** Preserve current owner semantics from the YGPH semantic contract: STORE owns purchase/sale/stock/receivable, LEDGER owns real money and obligations, CALENDAR owns action/queue state and never cash truth. RIDE remains an explicit semantic CONFLICT/VERIFY surface: preserve implemented compatibility behavior but do not use code alone to promote it into owner truth. Keep existing atomic workflows, centralize only calculations already supported by owner truth, strengthen action contracts, and verify persisted-state flows through durable readback.

**Tech Stack:** ES modules, Node.js 22 built-in test runner, IndexedDB/PWA production shell, GitHub Actions.

## Global Constraints

- Preserve STORE / LEDGER / CALENDAR owner semantics exactly.
- Preserve implemented RIDE behavior as compatibility evidence while semantic ownership remains VERIFY; do not add new RIDE semantic authority in this consolidation.
- CALENDAR is Action Hub / queue truth and MUST NOT manufacture real-money truth.
- Queue totals MAY differ from obligation exposure when evidence is incomplete; never force equality automatically.
- Do not invent `safe-to-spend`, reserve policy, forecast, or other financial truth unless an owner-authorized policy exists.
- UI must not manufacture financial truth.
- Every visible consequential action must either have a proven executable contract or be rendered as non-actionable/VERIFY.
- All monetary arithmetic remains integer satang.
- Insufficient evidence returns VERIFY/BLOCKED; never silently repair amount, owner, type, identity, completion, or cash truth.
- Gate must cover persisted-state -> projection -> action -> workflow -> durable readback, limited to invariants actually authorized by the semantic contract.

---

### Task 1: Calculation authority and truthful naming

**Files:**
- Create: `greenfield/calculation-authority.mjs`
- Modify: `ui/product-model.mjs`
- Test: `tests/greenfield-calculation-authority.test.cjs`

**Interfaces:**
- Produces owner-derived views for Ledger cash balance/movements, STORE generated sales/receivables, LEDGER obligation exposure, and CALENDAR due-pressure without converting queue values into cash truth.
- RIDE projections remain delegated to the existing Ride implementation and are explicitly classified as semantic VERIFY in system reconciliation.

- [ ] Write failing tests for Ledger cash vs generated sale, receivable truth, obligation truth, Calendar near-term due, and shortfall as an informational comparison only.
- [ ] Verify RED.
- [ ] Implement authority using existing owner records without mutating state and without reserve/safe-to-spend invention.
- [ ] Delegate existing UI finance/money projections while preserving compatibility fields only where their semantics remain truthful.
- [ ] Verify GREEN.

### Task 2: Reconciliation and conflict classification

**Files:**
- Create: `greenfield/system-reconciliation.mjs`
- Test: `tests/greenfield-system-reconciliation.test.cjs`

**Interfaces:**
- Produces `reconcileSystemState(state, context) -> { status, errors, warnings, truth }`.
- Distinguishes hard contract violations from VERIFY conditions.

- [ ] Write failing tests for orphan/duplicate/conflicting source relations, duplicate actionable money queues, invalid amounts, unsupported completion/cash effects, and valid incomplete installment evidence where queue totals differ from obligation exposure.
- [ ] Add a test that RIDE presence is reported as semantic VERIFY rather than silently promoted or deleted.
- [ ] Verify RED.
- [ ] Implement fail-closed classification without silently rewriting records or forcing cross-domain equality.
- [ ] Verify GREEN.

### Task 3: Action contract completeness

**Files:**
- Modify: `greenfield/action-contract.mjs`
- Modify: `ui/app.mjs`
- Test: `tests/greenfield-actionability-matrix.test.cjs`

**Interfaces:**
- `resolveCalendarAction` remains the authority deciding whether a Calendar record may expose an executable action.

- [ ] Write matrix tests for OPEN/PARTIAL/current implemented compatibility statuses, missing/duplicate/conflicting sources, zero/overpayment, and non-money Calendar completion.
- [ ] Verify RED for uncovered cases.
- [ ] Tighten contract and UI rendering so unproven money actions do not render as executable buttons; show VERIFY instead.
- [ ] Preserve cancellation semantics: cancelling a queue never proves its owner source paid/closed.
- [ ] Verify GREEN.

### Task 4: Reporter copy pass

**Files:**
- Modify: `ui/app.mjs`
- Modify: `index.html`
- Test: `tests/greenfield-copy-contract.test.cjs`

**Interfaces:**
- User-facing labels distinguish Ledger cash, generated sales/activity, receivables, due pressure, and VERIFY states.

- [ ] Write tests preventing misleading labels such as `เงินใช้ได้` when the value is only Ledger balance, or implying generated activity is cash received.
- [ ] Verify RED.
- [ ] Update labels only; do not change domain meaning.
- [ ] Verify GREEN.

### Task 5: Stateful E2E and button inventory gate

**Files:**
- Create/modify: `tests/greenfield-system-e2e.test.cjs`
- Modify: existing button inventory tests if needed.

**Interfaces:**
- Tests execute supported runtime workflows against durable-compatible state and verify readback plus authorized reconciliation.

- [ ] Cover cash sale, receivable partial/full receipt, obligation partial/full payment, overpayment rejection with zero mutation, stock purchase/sale/withdrawal/adjustment, invalid relation fail-closed, and incomplete installment evidence that remains VERIFY rather than auto-repaired.
- [ ] Preserve existing RIDE regression tests but do not use them as semantic ownership proof.
- [ ] Verify every static and generated consequential action has an owner/handler contract.
- [ ] Run complete `npm run deploy:gate` twice, with a fresh second-pass diff review between runs.

### Task 6: Production publication and merge

**Files:**
- Modify: `RELEASE_MANIFEST.json`, `.assetsignore`, `sw.js` only when production module set/revision requires it.

- [ ] Align production allowlist and service-worker asset revision from gate output.
- [ ] Run final gate to success.
- [ ] Review diff against `main` for invented semantic authority, unused wrappers, forced equality, silent repair paths, or misleading copy.
- [ ] Merge only after second-pass gate success.
- [ ] Verify post-merge main gate and deploy success.
