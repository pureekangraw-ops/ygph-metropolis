# LIGHTHOUSE Unified Logic Recovery Implementation Plan

> Execute test-first. Do not write production code before the focused RED tests fail for the expected missing behavior.

**Goal:** Recover Income, Outcome, Calendar, and Ledger as one coherent runtime-backed behavior layer while preserving domain ownership and durable readback.

**Spec:** `docs/superpowers/specs/2026-09-14-lighthouse-unified-logic-recovery-design.md`

## Global constraints
- No hard delete of financial history.
- Calendar never owns real-money truth.
- CHAT and MANUAL use the same owner/runtime mutation path.
- Owner-linked reversal must fail closed unless propagation-safe.
- Existing Ride/Store owner boundaries remain intact.

## Task 1 — RED tests for Income receivables
Create focused tests proving:
- outstanding receivable does not increase real cash;
- partial receive payment updates STORE sale received/outstanding;
- exactly one Ledger IN transaction is created;
- linked Calendar queue becomes PARTIAL/COMPLETED;
- bridge returns VERIFIED only after durable readback.

Run focused node:test file and confirm RED because `readIncomeTruth` / `receiveReceivablePayment` do not yet exist.

## Task 2 — Recover Income bridge behavior
Modify `lighthouse-next/runtime-ledger.mjs` to expose:
- `readIncomeTruth()`
- `receiveReceivablePayment(input)`

Reuse existing Greenfield `receiveCustomerPayment` runtime path. Do not calculate independent cash truth in the UI.

Run Task 1 tests to GREEN plus existing Outcome contract tests.

## Task 3 — RED tests for safe Ledger reversal
Create tests proving:
- a direct Ledger-owned transaction can be reversed append-only;
- original record remains intact;
- reversal record has opposite direction and `reversalOf` link;
- second reversal is rejected;
- owner-linked STORE/RIDE/other transaction fails closed before mutation.

Run focused test and confirm RED because runtime facade/bridge method is missing.

## Task 4 — Expose reversal workflow safely
Modify:
- `greenfield/business-workflows.mjs`: add workflow that emits `LEDGER_REVERSE_TRANSACTION`.
- `greenfield/runtime.mjs`: expose `reverseLedgerTransaction` via `executePlan`.
- `lighthouse-next/runtime-ledger.mjs`: expose guarded `reverseLedgerTransaction` and durable readback.

Owner-linked transactions must not be reversed via the generic Ledger surface until propagation-safe owner workflows exist.

## Task 5 — RED surface contract for four houses
Add source-level behavior tests proving:
- `surface-contract.mjs` routes Income, Outcome, Calendar, and Ledger;
- Income uses receivable bridge;
- Ledger has a real renderer;
- Calendar payment/receipt queues remain owner-controlled;
- generic Calendar cancellation only affects non-money queues.

## Task 6 — Recover all four Manual surfaces
Modify `lighthouse-next/surface-contract.mjs`:
- Income: show real cash + real income + outstanding receivables; support partial/full receive payment.
- Outcome: preserve existing expense/obligation/payment behavior.
- Calendar: preserve one-owner view, reschedule, complete/cancel non-money queues, route money queues to owner.
- Ledger: render durable transaction history and safe direct-owner reversal.
- Include `ledger` in the Manual task router.

No new independent store/state in the surface layer.

## Task 7 — Regression gates
Run focused tests first, then repository gates:
- existing Lighthouse Outcome contract tests;
- existing business workflow/domain operation/lifecycle tests;
- all tests;
- syntax/UTF-8/deploy gate used by the repository.

Do not claim completion unless all required gates pass and the diff preserves owner/readback rules.