# Day Cycle Controls — Design

## Goal
Make the existing manual end-of-day flow produce an observable, durable result, add an explicit Start Day action, and group Start Day / Daily Target / End Day together without duplicating reconciliation controls.

## Current defect
- `metropolis-r5-5.js` already renders Daily Target and End Day.
- End Day currently closes the modal and returns when no obligation is selected, so nothing in durable state changes.
- Maintenance Center exposes a Reconcile menu even though Stock already has its own adjustment action and cash reconciliation already exists in Settings.

## UI design
Use the first safe block in `#maintenanceRecoveryCard` as **Day Control** instead of Reconcile.

The Day Control block contains exactly three actions:
1. `เริ่มวัน`
2. the existing `ตั้ง/แก้เป้า` button, moved here from the Daily Target card
3. the existing `สิ้นวัน` button, moved here from the dashboard

The Daily Target progress card remains on the dashboard as a readout. Its edit button moves to Day Control. The Maintenance Reconcile button is no longer exposed.

## State and ownership
Store the manual day lifecycle under `state.sync.flow.dayCycle` without changing State Schema 4 or IndexedDB version 1:

```js
{
  status: "ACTIVE" | "ENDED",
  date: "YYYY-MM-DD",
  startedAt: ISO_TIMESTAMP | null,
  endedAt: ISO_TIMESTAMP | null
}
```

Daily target stays under the existing `state.settings.dailyTargetSatang` and `state.settings.dailyPassPercent` owners.

## Start Day
Start Day:
- marks today's day cycle `ACTIVE`;
- resets `dailyTargetSatang` to `0` so the new day starts without inheriting yesterday's goal;
- does not create money, delete history, or automatically start a Ride round;
- writes an audit event and persists through the existing durable commit path.

Repeated Start Day on an already-active same-day cycle is `No action`.

## End Day
End Day continues to use the existing summary and optional obligation-payment selection.

On confirmation, **even when no obligation is selected**, it:
- marks today's day cycle `ENDED`;
- resets `dailyTargetSatang` to `0`;
- closes an active Ride round safely by moving it to `state.ride.rounds` with `closeReason = "OWNER_END_DAY"`;
- writes an audit event;
- persists the result.

If obligations are selected, the lifecycle changes are applied before the existing `r55ApplyEndDayPayments()` call so the existing single durable payment commit persists both payment and day-close state.

Repeated End Day on an already-ended same-day cycle is `No action`.

## Counter rule
Do **not** zero or delete source-derived Store, Ride, or Ledger history. Those values are date-derived evidence and naturally start at zero on the next Bangkok calendar date. Manual End Day resets only operational state that must start fresh: daily goal, active Ride round, and manual day-cycle status.

## Reconcile ownership
- Stock truth correction remains at the Store `ปรับสต็อกให้ตรงของจริง` control.
- Current cash reconciliation remains at Settings `กระทบยอดจากเงินจริง`.
- Maintenance Center no longer exposes a second Reconcile entry.

## Runtime integration
Add a small additive `metropolis-day-cycle.js` runtime loaded after existing remaster/maintenance layers. It registers after existing R5 render hooks so moved controls and End Day ownership remain stable after every render.

The new production asset must be added to:
- `sw-bootstrap.js`
- `sw.js` APP_SHELL with a new service-worker release generation
- `RELEASE_MANIFEST.json` runtime order / service-worker assets / production files
- `package.json` syntax gate
- `SHA256SUMS.txt`

## Acceptance
- Start Day visibly changes status and persists.
- Set Daily Target is in the same Day Control block.
- End Day always produces a durable day-close result, even with zero selected obligations.
- An active Ride round is closed, not discarded.
- Daily target resets to 0 on Start Day and End Day.
- Transaction/source history is untouched.
- Maintenance Center has no duplicate Reconcile button.
- Existing cash and stock correction actions remain reachable.
- Full test, syntax, UTF-8, manifest/shell and service-worker gates pass.
