# LIGHTHOUSE Unified Behavior Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore Income, Outcome, Calendar, and Ledger as one coherent durable behavior layer with owner-safe cross-domain readback.

**Architecture:** Keep Greenfield as the only durable truth. Extend `lighthouse-next/runtime-ledger.mjs`, expose the existing Ledger reversal command through `greenfield/runtime.mjs`, and make `surface-contract.mjs` own all four Manual destinations.

**Tech Stack:** JavaScript ES modules, Node built-in test runner, Greenfield runtime/workflow engine, lighthouse-next DOM surface.

**Spec:** `docs/superpowers/specs/2026-09-14-lighthouse-unified-behavior-recovery-design.md`

## Global Constraints

- No second state store or UI-owned truth.
- No hard delete of history.
- Expected receivables never inflate real cash before collection.
- Every mutation reports success only after durable readback.
- Calendar owns queue/time state, not financial truth.
- UI and CHAT keep the same runtime/domain owner paths.
- Owner-linked reversal fails closed unless source-owner reversal is atomic.

---

### Task 1: Income receivable bridge

**Files:**
- Create: `tests/greenfield-lighthouse-unified-income-contract.test.cjs`
- Modify: `lighthouse-next/runtime-ledger.mjs`

- [ ] Write failing tests for `readIncomeTruth()` and `receiveReceivablePayment()`.
- [ ] Run `node --test tests/greenfield-lighthouse-unified-income-contract.test.cjs` and confirm RED.
- [ ] Implement receivable projection from Store SALE + linked Calendar queue without adding outstanding value to cash.
- [ ] Route collection through `runtime.receiveCustomerPayment()` and verify Store + Ledger + Calendar readback.
- [ ] Run the focused test and confirm GREEN.

### Task 2: Ledger reversal runtime

**Files:**
- Modify: `greenfield/business-workflows.mjs`
- Modify: `greenfield/runtime.mjs`
- Modify: `tests/greenfield-business-workflows.test.cjs`
- Create: `tests/greenfield-lighthouse-ledger-reversal-runtime.test.cjs`

- [ ] Write failing tests for `buildReverseLedgerTransactionWorkflow()` and `runtime.reverseLedgerTransaction()`.
- [ ] Run the focused tests and confirm RED.
- [ ] Add a one-command workflow using existing `LEDGER_REVERSE_TRANSACTION`.
- [ ] Expose it from `createGreenfieldRuntime()`.
- [ ] Re-run tests and confirm GREEN.

### Task 3: Ledger bridge safety

**Files:**
- Modify: `lighthouse-next/runtime-ledger.mjs`
- Create: `tests/greenfield-lighthouse-unified-ledger-contract.test.cjs`

- [ ] Write failing tests for direct Ledger reversal readback.
- [ ] Write a failing test that owner-linked records reject with `LIGHTHOUSE_OWNER_REVERSAL_REQUIRED` before mutation.
- [ ] Implement `reverseLedgerTransaction()` in the bridge.
- [ ] Verify opposite direction, same amount, `reversalOf`, preserved original history, and fresh truth.
- [ ] Run focused tests and confirm GREEN.

### Task 4: Four-house surface recovery

**Files:**
- Modify: `lighthouse-next/surface-contract.mjs`
- Create: `tests/greenfield-lighthouse-four-houses-recovery.test.cjs`

- [ ] Write failing source-contract tests proving all four cards route through the adapter.
- [ ] Confirm RED because Ledger is not currently handled and Income lacks receivable controls.
- [ ] Upgrade Income to render receivables and collection actions.
- [ ] Keep Outcome on the existing owner bridge.
- [ ] Keep Calendar owner-aware; generic complete/cancel only for non-financial queue types.
- [ ] Add Ledger history + safe reversal UI; never hard delete.
- [ ] Include `ledger` in task routing.
- [ ] Run focused tests and confirm GREEN.

### Task 5: Cross-house regression

**Files:**
- Create: `tests/greenfield-lighthouse-unified-behavior-regression.test.cjs`

- [ ] Prove receivable appears in Income/Calendar but not cash before collection.
- [ ] Prove partial collection updates Store/Ledger/Calendar coherently.
- [ ] Prove obligation payment updates Outcome/Ledger/Calendar coherently.
- [ ] Prove Calendar reschedule does not change Ledger balance.
- [ ] Prove direct reversal is traceable and owner-linked unsupported reversal changes nothing.
- [ ] Run `npm test`, `npm run check:syntax`, `npm run check:utf8`, and `npm run deploy:gate`.
- [ ] Open a PR against `main` only after the gates pass.
