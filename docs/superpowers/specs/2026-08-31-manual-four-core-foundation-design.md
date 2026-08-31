# Manual Four-Core Foundation Design

## Goal
Create the Phase 1 foundation for Manual by establishing four explicit homes: INCOME, OUTCOME, LEDGER, and CALENDAR, using only the existing verified Greenfield machinery as anchors.

## Scope
Phase 1 only. No Action Intent, chat routing, UI, new persistence, or new business rules.

## Architecture
Each Manual home is a small immutable descriptor that points to the existing runtime/domain/projection machinery it grows from. The descriptors do not execute mutations and do not become a second source of truth. A registry assembles the four homes and enforces structural invariants.

## Existing anchors
- INCOME: `greenfield/runtime.mjs#otherIncome` -> LEDGER transaction direction IN.
- OUTCOME: `greenfield/runtime.mjs#expense` / `verifiedExpense` -> LEDGER transaction direction OUT.
- LEDGER: LEDGER domain, obligations, balance adjustment, `projectLedgerBalance`.
- CALENDAR: CALENDAR domain, create/reschedule/status/payment, `projectCalendarSummary`.

## Foundation invariants
1. Exactly four homes exist: INCOME, OUTCOME, LEDGER, CALENDAR.
2. All four share `GREENFIELD_RUNTIME` as runtime root and durable truth path; none owns a separate store.
3. INCOME and OUTCOME are Manual homes backed by LEDGER truth, not new persistence domains.
4. LEDGER is the Manual head.
5. CALENDAR remains the existing CALENDAR domain and does not become money truth.
6. Phase 1 descriptors contain anchor metadata only; capability semantics are deferred to Phase 2 Idea/Logic/Function.
7. Manual foundation code must not import Master Input/Intent/Chat/UI modules.

## Files
- `manual/cores/income.mjs`
- `manual/cores/outcome.mjs`
- `manual/cores/ledger.mjs`
- `manual/cores/calendar.mjs`
- `manual/foundation.mjs`
- `tests/greenfield-manual-four-core-foundation.test.cjs`

## Non-goals
- create/edit/delete/adjust API design
- Action Intent vocabulary or routing
- Chat integration
- Manual UI
- report/history UI
- merge/deploy/publish
