# LIGHTHOUSE Unified Logic Recovery Design

Date: 2026-09-14

## Goal
Restore the behavioral depth of Income, Outcome, Calendar, and Ledger as one coherent runtime-backed system without restoring the old visual shell.

## Owner model
- Income: real inflow, receivables, receive payment.
- Outcome: expense, obligation, obligation payment.
- Calendar: one time/action surface; never owns real-money truth.
- Ledger: real-money truth, durable readback, traceable reversal/correction.
- CHAT and MANUAL: two entry points into the same owner/runtime mutation paths.
- Dashboard: projection only; never creates independent state.

## Required flows
1. Receivable remains outside real cash until collected.
2. Partial/full receivable collection updates STORE + LEDGER + CALENDAR atomically and is verified by durable readback.
3. Obligation payment keeps existing LEDGER owner + CALENDAR queue behavior.
4. Generic Calendar complete/cancel is allowed only for non-money queues. Owner-controlled payment/receipt queues must route to their owner action.
5. Ledger reversal is traceable and append-only. Direct Ledger-owned transactions may be reversed through a workflow. Owner-linked records fail closed until a propagation-safe owner workflow exists.
6. All four Manual house cards must route through surface-contract.mjs and real services.

## Safety and consistency constraints
- No hard delete for financial history.
- No expected income in real cash.
- No duplicate Calendar truth.
- No Chat-only business engine.
- Every mutation: command -> atomic workflow -> persist -> durable readback -> dependent projections.
- Owner-linked reversal must not mutate Ledger alone.
- Existing Ride/Store domain ownership must not be silently reassigned by the surface layer.

## Existing reusable implementation
Greenfield already contains receivable workflows, obligation workflows, Calendar payment/reschedule/status logic, durable state, and LEDGER_REVERSE_TRANSACTION. Recovery should expose these through the LIGHTHOUSE bridge/runtime instead of reimplementing domain truth in UI.

## Files expected to change
- greenfield/business-workflows.mjs
- greenfield/runtime.mjs
- lighthouse-next/runtime-ledger.mjs
- lighthouse-next/surface-contract.mjs
- focused contract tests under tests/

## Acceptance
- Income shows real cash separately from outstanding receivables.
- Partial receivable payment changes outstanding/received, adds exactly one Ledger IN transaction, and updates the linked Calendar queue.
- Outcome obligation flows still pass.
- Calendar cannot falsely complete an owner-controlled money queue.
- Ledger house renders real transactions and supports safe traceable reversal only where owner consistency is guaranteed.
- Full repository gates remain green.