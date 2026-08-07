# METROPOLIS 4.2 Schedule Engine Design

## Scope

Build the next owner-approved scheduling phase in `pureekangraw-ops/ygph-metropolis` without changing State Schema 4 or reinterpreting data that is already in use.

## New obligation input

New obligations created by METROPOLIS 4.2 use **amount per installment** as the primary money input.

Fields:
- description
- optional note
- amount per installment
- installment count, 1–120
- frequency: `WEEKLY` or `MONTHLY`
- first due date

The form shows a live preview before save:
- `amount per installment × count = total obligation`
- every generated due date and installment amount

New records store additive scheduling metadata:
- `scheduleMode: "PER_INSTALLMENT"`
- `scheduleFrequency: "WEEKLY" | "MONTHLY"`
- `installmentAmountSatang`
- `originalSatang = installmentAmountSatang * installmentCount`

All money stays integer satang.

## Date rules

- `WEEKLY`: every 7 days from the first due date.
- `MONTHLY`: same day-of-month when possible; clamp to the last valid day of shorter months.
- Schedule generation is deterministic and pure.

## Legacy compatibility

Existing obligations that do not have `scheduleMode: "PER_INSTALLMENT"` retain the current legacy interpretation: the stored `originalSatang` is the total obligation and the existing R5 monthly split/reconciliation behavior remains authoritative.

METROPOLIS 4.2 must never divide or reinterpret an already-saved legacy obligation as amount-per-installment.

The existing R5 reconciliation must explicitly skip `PER_INSTALLMENT` obligations. The 4.2 layer owns reconciliation for those records and treats their installment records as authoritative after edits.

## Installment management

For active LEDGER installment queues, replace the simple `เลื่อน` action with `จัดการงวด`.

The manager supports:

### Edit this installment
- edit due date
- edit installment amount
- reject an amount below money already paid on that installment
- update the matching Calendar queue and obligation installment record
- recompute obligation total and remaining balance from installment amounts

### Edit this and future installments
- choose amount per installment
- choose frequency
- choose the selected installment's new due date as the anchor
- update the selected and later unpaid installments only
- completed or cancelled installments are immutable

### Skip one schedule interval
`ข้ามรอบนี้` means a payment holiday, not debt forgiveness. Move the selected installment and every later unpaid installment forward by exactly one current schedule interval. Amounts and total debt do not change.

### Early settlement
`ปิดภาระทั้งหมด` pays every remaining active installment now.
- create one ordinary linked `OBLIGATION_PAYMENT` transaction per remaining queue
- use an idempotent queue-scoped action key
- complete every remaining queue and installment
- set the obligation remaining balance to zero and status to `COMPLETED`
- preserve transaction history; no protected money record is deleted or rewritten

## Reconciliation

For 4.2 obligations:
- existing installment records are authoritative for amount and due date
- a genuinely missing Calendar queue is recreated from its installment record
- if an installment record itself is missing, derive it from the obligation's amount-per-installment, frequency, first due date, and installment number
- completed/cancelled queues count as existing and are never recreated
- reconciliation is idempotent

## UI and version

- User-facing product version becomes `METROPOLIS v4.2.0`.
- Add a focused runtime/style layer `metropolis-r5-2.js` / `metropolis-r5-2.css` after the current 4.1 layer.
- The 4.1 observer must yield version ownership when the 4.2 layer is present.
- The schedule preview is compact and scrollable on mobile.
- No new app tile is added.

## Delivery

- State Schema remains 4.
- Existing IndexedDB/vault data remains untouched except through the current encrypted `persistAndRender` commit path.
- Add 4.2 assets to bootstrap loading, Service Worker shell, syntax gate, UTF-8 gate, and asset allow-list.
- Advance Service Worker release to `v4.2.0-20260808-r6-schedule`.
- Do not clear browser Site Data.

## Acceptance

- 3 installments at 3,000 baht create a 9,000-baht obligation, not three 1,000-baht installments.
- Weekly example from 2026-08-09 creates 2026-08-09, 2026-08-16, 2026-08-23.
- Monthly example from 2026-08-31 clamps February correctly while returning to the original day when possible.
- Legacy obligations keep their old total-split behavior.
- Edit-one, edit-future, skip-interval, early-settlement, and 4.2 reconciliation have focused regression tests.
- Full `npm run deploy:gate` passes before merge.