# LIGHTHOUSE Unified Logic Recovery Handoff

Branch: `lighthouse-owner-build-trigger-20260913`

## Why this handoff exists
The ChatGPT GitHub connector can read the repository and commit documentation, but executable source/test writes are currently blocked by the connector safety layer. Do not redesign the task; implement the committed spec and plan directly.

## Start here
1. Read `docs/superpowers/specs/2026-09-14-lighthouse-unified-logic-recovery-design.md`.
2. Read `docs/superpowers/plans/2026-09-14-lighthouse-unified-logic-recovery.md`.
3. Work test-first on this branch.

## Current verified repo facts
- `lighthouse-next/runtime-ledger.mjs` currently exposes real Income/Outcome/Calendar bridge pieces but not receivable read/receive behavior or safe Ledger reversal facade.
- `lighthouse-next/surface-contract.mjs` currently routes Income, Outcome, and Calendar; the Ledger card exists in UI but is not handled by the behavior router.
- Greenfield already implements STORE receivable payment, obligation payment, Calendar payment/reschedule/status, and domain command `LEDGER_REVERSE_TRANSACTION`.
- Greenfield runtime already exposes `receiveCustomerPayment`, `obligation`, `payObligation`, `calendarReschedule`, and `calendarStatus`.

## Non-negotiable owner rules
- Outstanding receivable is not real cash.
- Calendar is a time/action surface, not financial truth owner.
- Direct Ledger-owned transactions may use generic traceable reversal after readback verification.
- STORE/RIDE/other owner-linked transactions must not be generically reversed in Ledger until owner propagation is implemented.
- No hard delete of financial history.

## Expected result
Income, Outcome, Calendar, and Ledger behave as one truth-connected system, with CHAT/MANUAL sharing the same runtime/owner paths and every write verified by durable readback.