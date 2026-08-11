# METROPOLIS Root Stabilization Design

Status: APPROACH A OWNER-APPROVED / WRITTEN SPEC APPROVED
Owner / Final Authority: BIG
Date: 2026-08-11

## Outcome

Stabilize the existing METROPOLIS application at its real runtime roots without replacing the durable data model or adding another production patch layer. The release must preserve the current encrypted Vault and business history while making runtime composition, Calendar status, queue actions, Store/Ledger forms, reports and storage-capacity behavior deterministic.

The target release is METROPOLIS `4.2.6`, Core/Data `2.1.5`, Highway Gate `2.0.1` and Service Worker generation `v4.2.6-20260811-r24-root-stabilization`.

Compatibility remains:

- State Schema `4`;
- IndexedDB `stock-pocket-secure`, version `1`;
- object store `kv` and Vault key `vault`;
- Vault format `1`;
- AES-GCM with the existing PBKDF2 contract;
- existing record IDs, revisions, source links, reversals and event history.

## Root evidence

The design is based on a production-order runtime harness using the real `index.html` DOM and all 17 production scripts.

1. `metropolis-maintenance-core.js` and `metropolis-remaster-core.js` both declare top-level lexical `const api`. Loading them as classic scripts in one global realm throws `SyntaxError: Identifier 'api' has already been declared`. The remaster adapter then fails because its core is unavailable.
2. A full render paints completed/pending Calendar records green/yellow and hides cancelled records. A direct day click calls `renderCalendar()` without post-render hooks, reverting the dots to direction-red, resurrecting a cancelled card and changing `จัดการงวด` back to `เลื่อน`. Re-running `afterRender` restores all three behaviors.
3. The winning Add Obligation handler is owned by `metropolis-r5-2.js`; the winning Sale handler is owned by `metropolis-r5.js`. Earlier handlers remain in `app.js` and R5, so editing the wrong layer has no device effect.
4. The current deployment gate passes `144/144` while the shared-realm syntax failure and Calendar lifecycle failure still occur. Individual `node --check` and source-contract tests do not exercise browser composition.
5. Report evidence shows a durable current stock of 5 can produce a report snapshot of 0. Calendar report counts use `due` through `recordDate()` for both “created” and pending-at-end semantics, so a queue created in August but due in September is reported as neither created nor pending at the end of August.
6. The Vault is append-only for source records, transactions, queues, audits, event envelopes and idempotency keys. A representative workload measured about 2.15 KB of plaintext state growth per command, including a Calendar queue every fifth command. This is a model, not a quota guarantee: at 10 representative commands/day it projects roughly 10 MiB of encrypted Vault JSON/year, and at 30/day roughly 30 MiB/year.
7. `store.adjustments` is added by Maintenance but is absent from Highway Gate's protected collections, base normalization and FLOW exchange records.

## Chosen architecture

Use the existing production files as their owning seams. Do not add a new production JavaScript or stylesheet layer.

### 1. Shared-realm runtime safety

- Wrap both pure extension cores in private IIFEs so their internal lexical declarations cannot leak into the classic-script global environment.
- Preserve only their documented globals: `YGPHMaintenanceCore` and `YGPHMetropolisIcons`.
- Preserve CommonJS exports for Node tests.
- Add a composition regression that loads the production scripts in manifest order in one DOM/global realm and fails on any script-load or scheduled runtime error.

### 2. One Calendar render lifecycle

- Every Calendar-only render must end at one shared post-render seam exactly once.
- Full `renderAll()` continues to run the normal `afterRender` lifecycle once; partial day/filter/month/swipe renders must explicitly use the Calendar lifecycle helper.
- Calendar cards receive stable `data-queue-id` identity. Decorators and selectors must read this identity rather than infer the queue from whichever action button happens to exist.
- The live selector remains authoritative: completed = green, current/future pending = yellow, overdue = red, cancelled = hidden.
- Direct day taps, filters, month navigation, clear-date actions and FLOW swipe navigation must preserve the same status and action decoration.

### 3. One queue-action contract

An active queue exposes at most three primary controls:

| Queue kind | Primary | Secondary | Destructive |
|---|---|---|---|
| Outgoing payment | `จ่าย` | `แก้ไข` | `ยกเลิก` |
| Incoming Store payment | `รับ` | `แก้ไข` | `ยกเลิก` |
| Other executable queue | `ดำเนินการ` | `แก้ไข` | `ยกเลิก` |
| Local verification | `ยืนยัน` | `แก้ไข` | `ยกเลิก` |

- `จ่าย` and `รับ` open one amount modal prefilled with the maximum remaining amount. Leaving it unchanged performs a full payment; entering a smaller valid amount performs a partial payment.
- `แก้ไข` owns display name, due date, optional note/reminder, schedule management where applicable and a collapsed history section.
- Per-installment obligations delegate through one named schedule API instead of rewriting `[data-move]` buttons after render.
- FLOW's selected-day card reuses the same three controls; it must not prepend its own duplicate edit button.
- Completed queues expose history only. Cancelled queues remain hidden from live surfaces but remain in durable history and reports.

### 4. Progressive-disclosure forms

Change the handlers that actually win at runtime.

Sale:

- Always show quantity, unit price and amount received.
- Show shipping amount only when `มีค่าจัดส่ง` is checked.
- Show customer and due date when the computed outstanding amount is greater than zero.
- Put contact and note behind `ดูรายละเอียดเพิ่ม`.
- Keep Store cash-in, shipping cash-out and receivable calculations unchanged.

Obligation:

- Always show description, amount per installment, number of installments, frequency and first due date.
- Put the optional note behind `เพิ่มหมายเหตุ`.
- Put the generated schedule preview in a collapsed `ดูตารางงวด` details section.

Optional notes in other Store dialogs may be collapsed when this does not remove required evidence. Mandatory reconciliation, adjustment and verification reasons remain visible at the point they are required; they are not removed for visual simplicity.

### 5. Capacity protection without deleting evidence

Add one Settings card owned by the existing Settings page. It displays:

- current encrypted Vault size;
- `navigator.storage.estimate()` usage and quota when supported;
- record counts for transactions, Calendar, audit and event envelopes;
- green/yellow/red capacity state;
- actions to refresh the estimate, request persistent storage and export an encrypted backup.

Capacity thresholds are an application warning policy:

- below 70%: normal;
- 70–84.99%: yellow, recommend backup;
- 85–94.99%: orange/red warning, backup strongly required;
- 95% or greater: critical warning before subsequent durable writes.

The release does not auto-delete, compact or archive financial history. A `QuotaExceededError` must restore the durable state already on disk, keep the attempted mutation out of the UI, and show a direct backup/storage message. Destructive compaction requires a future schema/retention design and is outside this release.

### 6. Data integrity and report semantics

- Normalize `store.adjustments` to an array.
- Add adjustments to Highway Gate protected collections with stable `adjustmentId` identity, validate their quantity topology, and include them in FLOW exchange evidence.
- Use explicit creation date for `calendar.created`.
- Define pending-at-end as: created on or before the report end and neither completed nor cancelled on or before that end, regardless of a future due date.
- Reconstruct the report's opening stock basis from durable current stock minus all known stock movements, then apply purchases, sales, withdrawals and manual adjustments through the requested end date. Reports must label reconstructed basis when exact pre-migration timing cannot be known.
- Retire or adapt the Maintenance report shim so stock correction is applied exactly once.
- Remove the duplicate source revision increment in purchase-return cancellation.

### 7. Presentation ownership

- Keep `metropolis-remaster.css` as the final visual authority; do not create another stylesheet.
- Make the Settings gear glyph and visible chrome lighter/smaller while retaining a minimum 44×44 CSS-pixel tap target.
- Preserve the existing dark-surface contrast and 44-pixel Calendar/Maintenance controls.
- Do not add new blanket `!important` rules. New visual contracts must use the narrowest existing owner selector.

## Durable action and failure behavior

- UI handlers continue to propose a state mutation, but the durable commit remains the authority.
- Modal confirmation remains single-flight. Non-modal durable controls must also respect the same busy state so a second action is not silently lost.
- Every successful command still performs encrypt → write → read-back → decrypt → durable hash/event verification.
- Any validation, encryption, write, read-back, quota or runtime-composition failure leaves the previous durable Vault recoverable and produces an actionable Thai message.
- No visual or report adapter may write business state directly.

## Verification design

Implementation follows test-first red/green cycles.

Required new behavioral coverage:

1. both extension cores load in one classic global realm;
2. all production scripts load in manifest order without script or scheduled runtime errors;
3. direct Calendar day/filter/month/swipe renders retain green/yellow/red signals, hide cancelled records and retain schedule action ownership;
4. active payment queues render exactly three controls and one payment modal handles full and partial amounts;
5. FLOW selected-day card does not duplicate queue actions;
6. Sale and Obligation progressive disclosure exposes and validates fields only under the approved conditions;
7. capacity state classifies boundary values at 70%, 85% and 95%, handles unsupported estimates and surfaces quota failure without changing durable state;
8. Highway blocks deletion/mutation of existing stock-adjustment evidence and exchange includes it;
9. reports distinguish created date from due date, include future-due pending records and reconcile migrated current stock;
10. current core persistence, restore, migration, Store shipping, Ride, schedule, Service Worker and UTF-8 suites remain green.

Fresh completion evidence requires:

- focused red/green proof for every confirmed root;
- the full repository deployment gate;
- a production-order DOM runtime test with zero captured errors;
- release manifest, loader, Service Worker shell and release IDs in agreement;
- physical-device readback for Home, Store, Ride, Ledger, Calendar, Settings, the three-button queue, both progressive forms and the capacity card.

Local source/CI success is not Production Visual Verified without the device readback.

## Scope locks

- No database rename, IndexedDB version bump, Vault-format change or State Schema bump.
- No automatic deletion of transactions, audits, events, queues or source records.
- No new production runtime or CSS layer.
- No full modular rewrite in this release.
- No change to shipping-as-Store-cost, integer-satang arithmetic, reversal topology or owner/source routes without separate owner approval.
- No completion claim based only on the existing 144 source/unit tests.
