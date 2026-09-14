# LIGHTHOUSE Unified Behavior Recovery — Design

Date: 2026-09-14
Status: OWNER-APPROVED IMPLEMENTATION DIRECTION

## Goal

Restore the non-flat behavior layer behind LIGHTHOUSE Manual without reviving an old UI shell. Income, Outcome, Calendar, and Ledger remain distinct user destinations but operate on one durable Greenfield truth and one mutation/readback path shared with CHAT.

## Current Reality

The current `lighthouse-next` surface already writes real Expense, Obligation, Obligation Payment, Calendar reschedule/status, and general Income through `runtime-ledger.mjs`, but the behavior is uneven:

- Income exposes only direct general income even though Greenfield already supports Store receivables and partial/full collection.
- Outcome already has expense/obligation/payment behavior and cross-links to Calendar.
- Calendar is a single time surface but owner-controlled payment queues can only defer back to their owner; generic completion/cancel behavior is limited.
- Ledger exists as a visible Manual destination in `index.html` but is not owned by `surface-contract.mjs`, so it does not participate in the same recovered behavior layer.
- Ledger reversal exists at domain-operation level but is not exposed through the current Greenfield runtime facade or lighthouse-next bridge.

## Product Rule

One core, four houses, one truth.

- **Income** owns the user's incoming-money view: real received income plus linked receivable state. Expected money must never inflate cash.
- **Outcome** owns expense and obligation work: create, pay, remaining balance, due date, and completion state.
- **Calendar** owns time/action queue state, not financial truth. It may reschedule work and complete/cancel only actions whose owner semantics allow it. Financial collection/payment queues must execute through their source owner.
- **Ledger** owns real-money readback/history and traceable correction actions. No hard delete of real money.
- **CHAT and MANUAL** must enter the same runtime/domain owners; neither gets a parallel business engine.

## Architecture

Keep `greenfield/` as truth/command authority and `lighthouse-next/runtime-ledger.mjs` as the user-surface bridge. Extend the bridge instead of creating a second state store.

Data flow:

```text
MANUAL or CHAT
  -> owner/runtime command
  -> policy/domain workflow
  -> atomic durable commit
  -> readState / projection readback
  -> Income / Outcome / Calendar / Ledger / Dashboard render
```

## Recovery Scope

### Income

Add `readIncomeTruth()` that returns:

- actual Income Ledger transactions;
- Store SALE receivables where `outstandingSatang > 0`;
- the linked open/partial `RECEIVE_CUSTOMER_PAYMENT` Calendar queue;
- total received today remains sourced from Ledger projection, not receivable face value.

Add `receiveReceivablePayment()` that calls Greenfield `runtime.receiveCustomerPayment()` and verifies all three effects before success:

1. Store sale `receivedSatang/outstandingSatang/status` changed correctly;
2. Ledger received one real IN transaction linked to `STORE/<saleId>`;
3. Calendar queue amount/status changed to PARTIAL or COMPLETED.

### Outcome

Keep existing expense, obligation, and pay-obligation paths. Tighten readback so a payment is only `VERIFIED` when obligation, Calendar queue, and Ledger transaction all agree.

### Calendar

Keep one Calendar surface.

- Reschedule uses existing owner-safe runtime path.
- Generic non-financial queues may be completed/cancelled with `calendarStatus`.
- `PAY_OBLIGATION`, `PAY_OBLIGATION_INSTALLMENT`, and `RECEIVE_CUSTOMER_PAYMENT` remain owner-controlled; Calendar must route the user to the owning behavior instead of mutating money truth directly.
- `CANCELLED` never deletes source history.

### Ledger

Add `reverseLedgerTransaction()` for traceable reversal of direct Ledger-owned transactions.

Greenfield already has `LEDGER_REVERSE_TRANSACTION`; expose it through a workflow/runtime facade and bridge with durable readback. A reversal creates an opposite transaction with `reversalOf` and keeps the original record unchanged.

For owner-linked transactions whose source record also needs semantic reversal (Store/Ride/Obligation payment), do **not** pretend a Ledger-only reversal fully fixed the domain. The bridge must reject unsupported owner-linked reversal until a source-specific atomic reversal workflow exists. This fail-closed rule prevents the historical bug where Ledger changed but domain owner still looked ACTIVE.

### Dashboard / Propagation

After every verified mutation, the surface re-reads truth and refreshes dependent projections. No UI-maintained balance or duplicate Calendar truth.

## Public Bridge Contract

`createLighthouseLedgerBridge()` must expose:

```js
readLedgerTruth()
readIncomeTruth()
readCalendarTruth()
recordOtherIncome(input)
receiveReceivablePayment(input)
recordExpense(input)
createObligation(input)
payObligation(input)
rescheduleCalendar(input)
setCalendarStatus(input)
reverseLedgerTransaction(input)
```

## Error / Safety Rules

- No visible success before durable readback.
- Duplicate-command recovery is allowed only when readback proves the exact requested effect.
- Payment greater than outstanding/remaining fails closed.
- Financial Calendar queues never become completed merely because the Calendar UI button was pressed.
- Unsupported owner-linked reversal returns a specific error and changes nothing.
- Original Ledger transaction history is never hard deleted.

## UI Recovery

`surface-contract.mjs` becomes the behavior owner for all four Manual task cards.

- Income renders real income plus receivables and collection controls.
- Outcome keeps expenses/obligations/payment controls.
- Calendar renders the shared time/action queue with owner-aware controls.
- Ledger renders real transaction history and exposes reversal only where the bridge says the record is safely reversible.

No visual redesign is required in this slice; this is behavior recovery underneath the current LIGHTHOUSE visual rebuild.

## Acceptance

The slice is accepted when tests prove:

1. receivable collection updates Store + Ledger + Calendar atomically and readback matches;
2. expected receivable money never appears in real cash before collection;
3. partial obligation payment updates Outcome + Ledger + Calendar coherently;
4. Calendar reschedule changes only queue time and not financial amount;
5. Ledger direct reversal creates a traceable opposite transaction while preserving original history;
6. owner-linked reversal that lacks a source-specific reverse workflow is rejected without partial mutation;
7. all four Manual task cards route into the same bridge layer;
8. Dashboard truth refreshes only from readback.
