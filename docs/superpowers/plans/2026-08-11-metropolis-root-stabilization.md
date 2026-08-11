# METROPOLIS Root Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize METROPOLIS 4.2.6 at the existing runtime and durable-data roots so production scripts compose safely, Calendar state stays deterministic, queue/forms become simpler, and long-running storage/report behavior is observable without deleting evidence.

**Architecture:** Keep the current State Schema 4, encrypted Vault, source records and business routes. Repair behavior only in the existing owning files: private core IIFEs for shared-realm safety, one Calendar lifecycle seam in `flow-era.js`, one queue contract in `app.js`, winning Store/Obligation handlers in R5/R5-2, integrity rules in Highway/Maintenance, and the final visual authority in `metropolis-remaster.css`. Add a JSDOM production-order harness so runtime composition and real DOM behavior become release gates rather than source-text assumptions.

**Tech Stack:** Vanilla JavaScript, existing IndexedDB/AES-GCM/PBKDF2 Vault, Service Worker app shell, JSDOM 29, Node 22 built-in test runner, current YGPH runtime hook bus.

## Global Constraints

- Target versions are METROPOLIS `4.2.6`, Core/Data `2.1.5`, Highway Gate `2.0.1`, Service Worker `v4.2.6-20260811-r24-root-stabilization`.
- Preserve State Schema `4`, IndexedDB `stock-pocket-secure` version `1`, store `kv`, key `vault`, Vault format `1`, existing KDF/cipher parameters and all durable IDs/history.
- Do not add a production JavaScript or stylesheet layer. Change the existing owner of each behavior.
- Do not auto-delete, compact or archive transactions, Calendar, audit, events, idempotency keys or source evidence.
- Every behavior change begins with a failing runtime or pure-rule test and ends with the focused test green before moving on.
- Run changed focused suites after every task; run the full deployment gate only after focused behavior is stable.
- Do not claim Production Visual Verified from local tests. Record `LOCAL_VISUAL_RENDER=BLOCKED_NO_BROWSER` and require physical-device readback.

---

### Task 1: Make all production scripts safe in one browser realm

**Files:**

- Modify: `package.json`
- Create: `package-lock.json`
- Create: `tests/helpers/metropolis-runtime-harness.cjs`
- Create: `tests/runtime-composition.test.cjs`
- Modify: `metropolis-maintenance-core.js`
- Modify: `metropolis-remaster-core.js`

**Runtime contract:**

- The harness reads the real `index.html`, evaluates its six direct scripts, captures scripts appended by `sw-bootstrap.js`, and executes all production JavaScript in the same JSDOM VM context in DOM order.
- It captures `window.error`, `unhandledrejection`, timer exceptions and script evaluation errors and exposes `loadProductionRuntime()`, `flushRuntime()` and `capturedErrors` to later behavioral tests.
- Test state, storage, crypto and Service Worker stubs live only in the harness; no test-only branch enters production files.
- Both pure cores preserve their browser globals and CommonJS exports while keeping internal lexical names private.

- [ ] Install the one test dependency and commit its exact lock resolution:

```bash
npm install --save-dev jsdom@^29.1.1 --ignore-scripts
```

Expected: `package.json` adds only `jsdom` beside `wrangler`, and `package-lock.json` is created or updated.

- [ ] Implement the harness with a single shared `dom.getInternalVMContext()`. Stub unsupported browser capabilities before evaluating scripts, preserve production script order, and throw one aggregated error that names the source file and captured message.
- [ ] Add tests named `pure extension cores compose in one classic-script realm` and `production manifest loads with zero runtime errors`.
- [ ] Run the focused test before touching the cores:

```bash
node --test tests/runtime-composition.test.cjs
```

Expected RED: `SyntaxError: Identifier 'api' has already been declared`, followed by the remaster adapter reporting that its core is unavailable.

- [ ] Wrap each core in its own strict IIFE. Assign exactly one documented browser global at the end of each closure and assign `module.exports` from inside that same closure. Do not rename public API members.
- [ ] Re-run the focused test.

```bash
node --test tests/runtime-composition.test.cjs
```

Expected GREEN: both named tests pass and `capturedErrors` is empty.

- [ ] Run existing focused core contracts to prove CommonJS compatibility remains intact.

```bash
node --test tests/metropolis-maintenance.test.cjs tests/metropolis-remaster.test.cjs
```

- [ ] Commit the isolated runtime-root repair.

```bash
git add package.json package-lock.json tests/helpers/metropolis-runtime-harness.cjs tests/runtime-composition.test.cjs metropolis-maintenance-core.js metropolis-remaster-core.js
git commit -m "fix: isolate metropolis production script realms"
```

---

### Task 2: Route every Calendar render through one lifecycle

**Files:**

- Create: `tests/calendar-runtime-lifecycle.test.cjs`
- Modify: `flow-era.js`
- Modify: `app.js`
- Modify: `metropolis-r5-2.js`
- Modify: `metropolis-r5-3.js`

**Calendar seam:**

```js
function flowNotifyCalendarRendered(reason) {
  YGPHRuntime.run("afterCalendarRender", {
    reason,
    selectedDate,
    calendarMonth,
    stateRevision: state.revision
  });
}

function flowRenderCalendar(reason = "partial", { notify = true } = {}) {
  renderCalendar();
  if (notify) flowNotifyCalendarRendered(reason);
}
```

The implementation may adapt the names to avoid recursive wrapper calls, but it must preserve these semantics: full `renderAll()` invokes the normal `afterRender` path once; partial Calendar interactions invoke `afterCalendarRender` once; neither path double-decorates.

- [ ] Build fixtures for one completed queue, one future pending queue, one overdue queue, one cancelled queue and one schedule-backed installment. Give each a stable unique queue ID.
- [ ] Add failing runtime assertions for initial full render, direct day tap, filter change, previous/next month, clear-date and FLOW previous/next card controls. After every interaction assert:
  - completed signal is green;
  - future/current pending signal is yellow;
  - overdue signal is red;
  - cancelled queue has no live card;
  - schedule-backed action still reads `จัดการงวด`;
  - each visible card has `data-queue-id` equal to its durable queue ID;
  - the lifecycle hook count increases exactly once for a partial render.
- [ ] Run the new suite before editing production code.

```bash
node --test tests/calendar-runtime-lifecycle.test.cjs
```

Expected RED: direct day/filter/month render reverts status colors, makes the cancelled card visible, and loses schedule action ownership.

- [ ] In the base Calendar card renderer in `app.js`, write `data-queue-id="${esc(item.id)}"` on the queue card. Do not derive identity from an action button.
- [ ] In `flow-era.js`, create one partial-render helper and replace direct Calendar calls from clear day, filter, month, clear-date and FLOW navigation paths. Keep the full `renderAll()` hook single-shot.
- [ ] Register R5-2 schedule actions and R5-3 status decoration on the Calendar-specific lifecycle as well as the existing full-render lifecycle. Make R5-3 `queueApply()` resolve queue identity from `card.dataset.queueId` only.
- [ ] Re-run the focused suite and the existing Calendar/status contracts.

```bash
node --test tests/calendar-runtime-lifecycle.test.cjs tests/metropolis-calendar-dom-contract.test.cjs tests/metropolis-status-signal.test.cjs tests/metropolis-4.2-schedule.test.cjs
```

Expected GREEN: all interaction variants retain the same status/action DOM and no hook is double-counted.

- [ ] Commit the lifecycle repair separately.

```bash
git add tests/calendar-runtime-lifecycle.test.cjs flow-era.js app.js metropolis-r5-2.js metropolis-r5-3.js docs/superpowers/plans/2026-08-11-metropolis-root-stabilization.md
git commit -m "fix: unify calendar render lifecycle"
```

---

### Task 3: Replace duplicated queue buttons with one three-action contract

**Files:**

- Create: `tests/queue-actions-runtime.test.cjs`
- Modify: `tests/calendar-runtime-lifecycle.test.cjs`
- Modify: `tests/metropolis-4.2-schedule.test.cjs`
- Modify: `app.js`
- Modify: `flow-era.js`
- Modify: `metropolis-r5-2.js`
- Modify: `metropolis-r5-3.js`
- Modify: `metropolis-remaster.css`

**Public behavior:**

| Queue state/kind | Primary | Secondary | Destructive |
|---|---|---|---|
| outgoing payment | `จ่าย` | `แก้ไข` | `ยกเลิก` |
| incoming Store payment | `รับ` | `แก้ไข` | `ยกเลิก` |
| other executable | `ดำเนินการ` | `แก้ไข` | `ยกเลิก` |
| local verification | `ยืนยัน` | `แก้ไข` | `ยกเลิก` |
| completed | history only | none | none |
| cancelled | hidden | hidden | hidden |

**Owned interfaces:**

```js
function queueActionSpecs(item) {
  return [
    { action: "primary", label: queuePrimaryLabel(item) },
    { action: "edit", label: "แก้ไข" },
    { action: "cancel", label: "ยกเลิก" }
  ];
}
```

- Every active queue card uses `data-queue-id` and three `data-queue-action` values: `primary`, `edit`, `cancel`.
- The primary payment action opens one amount input prefilled with the exact remaining maximum. Equal-to-maximum is full payment; a positive smaller amount is partial; zero, negative and above-maximum are rejected before state mutation.
- `แก้ไข` owns name, due date, optional note/reminder, schedule management when present and collapsed history. It replaces separate plan-edit and move controls.
- Schedule actions delegate through `globalThis.YGPHMetropolisSchedule`; R5-2 must not rewrite `[data-move]` handlers after rendering.

- [ ] Add runtime tests for each row of the behavior table on both the normal Calendar list and FLOW selected-day card. Assert exactly three primary controls for active queues, no duplicate FLOW edit button, history-only completed queues and no cancelled live queue.
- [ ] Add modal tests proving unchanged maximum completes payment, smaller amount leaves correct outstanding balance/status, invalid amounts leave state/revision/transactions unchanged, and incoming Store payment uses `รับ` while outgoing uses `จ่าย`.
- [ ] Add edit-modal tests proving due/name/note/reminder are saved through the durable owner; schedule history is visible inside collapsed details; schedule changes invoke the named schedule API once.
- [ ] Run RED before implementation.

```bash
node --test tests/queue-actions-runtime.test.cjs
```

Expected RED: five separate controls appear on payment cards, FLOW prepends another edit control, and full/partial payment use separate paths.

- [ ] Centralize queue button markup and event routing in `app.js` using stable queue/action data attributes. Reuse existing payment, cancellation, source lookup, gate and history functions rather than duplicating mutations.
- [ ] Replace full/partial modal branching with one amount modal. Keep integer-satang parsing and existing transaction action keys/idempotency behavior.
- [ ] Add one queue editor in `app.js`; expose only the narrow schedule call surface through `YGPHMetropolisSchedule` from R5-2.
- [ ] Remove FLOW's duplicate plan-edit injection and R5-3's action inference/rewriting. R5-3 may decorate labels/classes but may not own business handlers.
- [ ] Add only narrow final-authority CSS for the three-action group; retain 44×44 targets and do not add blanket `!important` rules.
- [ ] Re-run focused queue, Calendar, schedule and Store suites.

```bash
node --test tests/queue-actions-runtime.test.cjs tests/calendar-runtime-lifecycle.test.cjs tests/metropolis-4.2-schedule.test.cjs tests/store-shipping.test.cjs tests/core-safety.test.cjs
```

Expected GREEN: the table contract holds on every live surface and all payment paths preserve source/ledger topology.

- [ ] Commit the queue contract.

```bash
git add tests/queue-actions-runtime.test.cjs tests/calendar-runtime-lifecycle.test.cjs tests/metropolis-4.2-schedule.test.cjs app.js flow-era.js metropolis-r5-2.js metropolis-r5-3.js metropolis-remaster.css docs/superpowers/plans/2026-08-11-metropolis-root-stabilization.md
git commit -m "refactor: unify calendar queue actions"
```

---

### Task 4: Apply progressive disclosure in the winning Store and Obligation handlers

**Files:**

- Create: `tests/progressive-forms-runtime.test.cjs`
- Modify: `metropolis-r5.js`
- Modify: `metropolis-r5-2.js`
- Modify: `metropolis-r5.css`
- Modify: `metropolis-r5-2.css`
- Modify: `metropolis-remaster.css`

**Sale form contract:**

- Always visible: quantity, unit price and amount received.
- `มีค่าจัดส่ง` reveals/enables shipping amount; unticking it clears and disables that value.
- The computed outstanding amount controls customer and due-date fields. They are hidden and excluded from validation when outstanding is zero; visible and required when outstanding is positive.
- `ดูรายละเอียดเพิ่ม` is a native `<details>` section containing contact and note.
- Existing calculations remain: gross sale is customer bill, shipping is Store cost/cash-out, received amount is Store cash-in, and unpaid balance creates one receivable queue.

**Obligation form contract:**

- Always visible: description, amount per installment, count, frequency and first due date.
- `เพิ่มหมายเหตุ` reveals the optional note input.
- Schedule preview is inside a closed-by-default `<details>` labelled `ดูตารางงวด`; changing amount/count/frequency/date still refreshes its content while collapsed.
- Mandatory adjustment, reconciliation and verification reasons elsewhere remain visible and required.

- [ ] Add real-DOM tests that click the actual `addSaleBtn` and `addDebtBtn`, proving R5 and R5-2 are the final handlers loaded in production order.
- [ ] For Sale, test shipping unchecked/checked/unchecked, paid-in-full versus outstanding transitions, required due date only for outstanding, collapsed optional details, and unchanged transaction/stock/receivable results after submit.
- [ ] For Obligation, test note and schedule sections closed initially, note toggle state, schedule preview updates while collapsed, and unchanged installment/queue dates and amounts after submit.
- [ ] Add accessibility assertions: hidden conditional controls are either absent from tab order or disabled, every toggle has a text label, and reopening a modal starts from a clean default state.
- [ ] Run RED before changing the winning handlers.

```bash
node --test tests/progressive-forms-runtime.test.cjs
```

Expected RED: customer/contact/due/note and schedule preview are all expanded by default.

- [ ] Refactor only `metropolis-r5.js` Sale modal markup/binding. Derive visibility from parsed quantity × price − received, and re-evaluate it on all three input events.
- [ ] Refactor only `metropolis-r5-2.js` Obligation modal markup/binding. Keep its existing pure schedule functions and durable object shape unchanged.
- [ ] Add form-specific layout rules to the owning R5 styles and only final dark-theme/color adjustments to `metropolis-remaster.css`. Retain minimum 44×44 toggle targets.
- [ ] Re-run focused behavior and current Store/schedule contracts.

```bash
node --test tests/progressive-forms-runtime.test.cjs tests/store-shipping.test.cjs tests/metropolis-4.2-schedule.test.cjs tests/runtime-composition.test.cjs
```

Expected GREEN: disclosure follows the contracts and submitted durable records match the pre-change business math.

- [ ] Commit the form simplification.

```bash
git add tests/progressive-forms-runtime.test.cjs metropolis-r5.js metropolis-r5-2.js metropolis-r5.css metropolis-r5-2.css metropolis-remaster.css
git commit -m "refactor: simplify store and obligation forms"
```

---

### Task 5: Add storage-capacity visibility and quota-safe rollback

**Files:**

- Create: `tests/storage-capacity.test.cjs`
- Modify: `metropolis-maintenance-core.js`
- Modify: `metropolis-maintenance.js`
- Modify: `index.html`
- Modify: `app.js`
- Modify: `metropolis-maintenance.css`
- Modify: `metropolis-remaster.css`

**Pure capacity classifier:**

```js
function classifyStorageCapacity({
  usage,
  quota,
  currentVaultBytes = 0,
  nextVaultBytes = currentVaultBytes
} = {}) {
  const supported = Number.isFinite(usage) && Number.isFinite(quota) && quota > 0;
  if (!supported) {
    return { supported: false, ratio: null, projectedRatio: null, level: "UNKNOWN", blocksWrite: false };
  }
  const ratio = Math.max(0, usage / quota);
  const projectedUsage = Math.max(0, usage + Math.max(0, nextVaultBytes - currentVaultBytes));
  const projectedRatio = projectedUsage / quota;
  const level = projectedRatio >= 0.95
    ? "CRITICAL"
    : projectedRatio >= 0.85
      ? "WARNING"
      : projectedRatio >= 0.70
        ? "WATCH"
        : "NORMAL";
  return { supported: true, ratio, projectedRatio, level, blocksWrite: projectedUsage >= quota };
}
```

**Settings capacity card:**

- Shows encrypted Vault bytes, browser usage/quota when supported, and counts for Ledger transactions, Calendar queues, audit records and event envelopes.
- Uses green for `NORMAL`, yellow for `WATCH`, orange/red for `WARNING`/`CRITICAL`, and neutral copy for `UNKNOWN`.
- Offers `ตรวจใหม่`, `ขอเก็บข้อมูลถาวร` and the existing encrypted-backup action.
- It warns and asks for backup; it never deletes or rewrites old evidence.

**Durable failure contract:**

- Before writing, compare current encrypted Vault size, candidate encrypted Vault size and the latest estimate when available.
- A warning threshold never silently drops a valid mutation. If projected bytes exceed quota, stop before `dbPut`, restore the last durable readback to memory/UI and show a direct Thai backup/storage message.
- A real `QuotaExceededError` from `dbPut` follows the same rollback path. The failed candidate must not remain visible and must not increment the durable revision.

- [ ] Add pure boundary tests at 69.99%, 70%, 84.99%, 85%, 94.99%, 95%, 100%, unsupported estimate, and candidate growth crossing a threshold.
- [ ] Add runtime tests with stubbed `navigator.storage.estimate()`/`persist()` and exact Settings card assertions for values, counts, status class and actions.
- [ ] Add failure tests that snapshot durable state, attempt one mutation with projected overflow and one with `dbPut` throwing a named `QuotaExceededError`, then assert durable hash/revision/UI return to the snapshot and the message recommends backup/storage.
- [ ] Run RED.

```bash
node --test tests/storage-capacity.test.cjs
```

Expected RED: classifier/card do not exist and quota errors are reported generically without a capacity view.

- [ ] Export `classifyStorageCapacity` through the existing `YGPHMaintenanceCore`/CommonJS API inside its private IIFE.
- [ ] Add semantic capacity markup to Settings and have `metropolis-maintenance.js` render/refresh it from the real state and Vault record. Feature-detect estimate/persist without treating unsupported APIs as errors.
- [ ] Add candidate-size preflight and named quota handling around the existing encrypt → write → read-back transaction in `commitCurrentState()`. Reuse the existing rollback branch; do not introduce a second persistence path.
- [ ] Add narrow capacity-card styles and preserve dark-surface contrast/44px controls.
- [ ] Re-run capacity, persistence, restore, migration and composition suites.

```bash
node --test tests/storage-capacity.test.cjs tests/persistence.test.cjs tests/restore.test.cjs tests/migration.test.cjs tests/runtime-composition.test.cjs
```

Expected GREEN: thresholds render correctly and both simulated overflow paths leave durable and visible state unchanged.

- [ ] Commit the capacity protection.

```bash
git add tests/storage-capacity.test.cjs metropolis-maintenance-core.js metropolis-maintenance.js index.html app.js metropolis-maintenance.css metropolis-remaster.css
git commit -m "feat: surface vault capacity and quota safety"
```

---

### Task 6: Protect manual stock-adjustment evidence end to end

**Files:**

- Modify: `tests/core-safety.test.cjs`
- Modify: `tests/metropolis-maintenance.test.cjs`
- Create: `tests/stock-adjustment-runtime.test.cjs`
- Modify: `app.js`
- Modify: `highway-gate.js`
- Modify: `metropolis-maintenance-core.js`
- Modify: `metropolis-maintenance.js`

**Adjustment topology:**

```js
{
  adjustmentId,
  beforeQty,
  adjustmentQty,
  afterQty,
  reason,
  note,
  at,
  actor,
  affectsLedger: false,
  affectsValue: false
}
```

- `beforeQty + adjustmentQty === afterQty`, all quantities are safe integers, and `afterQty >= 0`.
- `adjustmentId` is stable immutable identity. Existing adjustment records cannot disappear or mutate during a normal command.
- Normalization always produces `state.store.adjustments` as an array without dropping legacy State Schema 4 fields.
- FLOW exchange includes one `STORE/STOCK_ADJUSTMENT` record per durable adjustment and marks it informational, not an editable financial record.

- [ ] Extend pure tests with malformed topology, duplicate IDs, mutation, deletion and valid append cases. Assert Highway rejects every invalid proposal before encryption.
- [ ] Add a runtime test that creates a manual adjustment through the real Maintenance UI, persists/read-backs it, builds FLOW exchange and finds the exact matching evidence with no Ledger transaction/value effect.
- [ ] Run RED before Highway/normalization/exchange changes.

```bash
node --test tests/core-safety.test.cjs tests/metropolis-maintenance.test.cjs tests/stock-adjustment-runtime.test.cjs
```

Expected RED: Highway does not recognize the collection and FLOW exchange omits the new durable record.

- [ ] Add `store.adjustments` to base normalization in `app.js` and to Highway protected collection metadata using `adjustmentId` as identity and `STORE`/`STOCK_ADJUSTMENT` as source/type.
- [ ] Validate adjustment invariants and immutable fields in Highway. Allow append-only new evidence produced by the Maintenance planner; block deletion and mutation of durable predecessors.
- [ ] Ensure the Maintenance planner always writes explicit `affectsLedger: false` and `affectsValue: false` while preserving existing record compatibility.
- [ ] Add adjustment exchange records in `buildExchange()` with signed quantity, timestamps, reason/detail and a non-editable matched review state.
- [ ] Re-run focused integrity, maintenance, exchange and migration tests.

```bash
node --test tests/core-safety.test.cjs tests/metropolis-maintenance.test.cjs tests/stock-adjustment-runtime.test.cjs tests/migration.test.cjs tests/runtime-contract.test.cjs
```

Expected GREEN: adjustment evidence survives normalize → validate → encrypt/write/read-back → exchange without changing Ledger value.

- [ ] Commit the evidence topology.

```bash
git add tests/core-safety.test.cjs tests/metropolis-maintenance.test.cjs tests/stock-adjustment-runtime.test.cjs app.js highway-gate.js metropolis-maintenance-core.js metropolis-maintenance.js docs/superpowers/plans/2026-08-11-metropolis-root-stabilization.md
git commit -m "fix: protect stock adjustment evidence"
```

---

### Task 7: Correct report dates and reconstruct stock from the durable current anchor

**Files:**

- Create: `tests/report-semantics.test.cjs`
- Modify: `app.js`
- Modify: `metropolis-maintenance-report.js`
- Modify: `tests/metropolis-maintenance.test.cjs`

**Calendar report semantics:**

```js
function queueCreatedDate(item) {
  return dateKey(item.createdAt || item.updatedAt || item.due);
}

function queuePendingAtEnd(item, end) {
  const created = queueCreatedDate(item);
  const completed = item.completedAt ? dateKey(item.completedAt) : null;
  const cancelled = item.cancelledAt ? dateKey(item.cancelledAt) : null;
  return created <= end
    && (!completed || completed > end)
    && (!cancelled || cancelled > end);
}
```

- `calendar.created` counts explicit creation date in the selected range, not due date.
- `pendingQueues` includes a queue created by report end and still live at that end even when its due date is in a future month.
- A queue completed/cancelled after the report end remains pending at that historical end; one completed/cancelled on or before end does not.

**Stock reconstruction:**

- Build a normalized signed movement list from non-restored purchases, sales, withdrawals and manual adjustments with their durable effective dates.
- Compute reconstructed opening quantity as `durable current stockQty - sum(all known signed movements)`.
- Compute report-end stock as `reconstructed opening quantity + sum(movements with date <= end)`.
- Label the basis `RECONSTRUCTED_V2` because unknown pre-migration activity is absorbed into the opening basis rather than invented as dated movements.
- Maintenance report adaptation must detect this basis and avoid applying its historical correction a second time.

- [ ] Add exact Calendar fixtures:
  - created `2026-08-03`, due `2026-09-06`, open at August end → created `1`, pending `1`;
  - created `2026-07-31`, due `2026-08-06`, open at August end → created `0`, pending `1`;
  - created in August and completed September → pending at August end;
  - created in August and cancelled in August → not pending at August end.
- [ ] Add stock fixtures where durable current stock is `5` but transaction-only history previously returned `0`; include a manual adjustment and a returned/cancelled source so the expected end snapshots prove signed movement handling.
- [ ] Add idempotency coverage: applying the Maintenance `afterReport` hook twice to a `RECONSTRUCTED_V2` report must not change stock or add duplicate rows.
- [ ] Run RED.

```bash
node --test tests/report-semantics.test.cjs tests/metropolis-maintenance.test.cjs
```

Expected RED: created/pending use due dates, current stock 5 reports as 0 in the fixture, and the old Maintenance shim would correct a newly reconstructed report twice.

- [ ] Add explicit queue-created/pending helpers in `app.js` and use them only in report calculation; leave live Calendar due-date sorting unchanged.
- [ ] Replace report `stockAt(end)` with a pure `calendarReportSnapshot(start, end, targetState)` result containing `stockQty`, `stockBasis` and movement evidence counts. Keep integer quantities and legacy-date fallback deterministic.
- [ ] Adapt `metropolis-maintenance-report.js`: when `report.snapshot.stockBasis === "RECONSTRUCTED_V2"`, synchronize the visible row without applying arithmetic; keep the old anchor correction only for an older report object without that basis.
- [ ] Re-run report, maintenance, Store and migration suites.

```bash
node --test tests/report-semantics.test.cjs tests/metropolis-maintenance.test.cjs tests/store-shipping.test.cjs tests/migration.test.cjs tests/runtime-composition.test.cjs
```

Expected GREEN: report dates and stock snapshots match every historical fixture, with one correction owner.

- [ ] Commit report semantics separately.

```bash
git add tests/report-semantics.test.cjs tests/metropolis-maintenance.test.cjs app.js metropolis-maintenance-report.js
git commit -m "fix: reconcile report dates and stock basis"
```

---

### Task 8: Make durable actions single-flight and lock the purchase revision contract

**Files:**

- Create: `tests/durable-ui-guard.test.cjs`
- Modify: `app.js`

**Busy-state contract:**

- As soon as a durable commit starts, the app root exposes `aria-busy="true"` and every live app button is temporarily disabled.
- A `WeakMap` preserves each button's prior disabled state. `finally` restores it even after validation, quota, write or read-back failure.
- The existing `durableCommitInProgress` remains the authoritative programmatic guard. The visual guard prevents a second UI handler from mutating the shared in-memory state before that rejection.
- Modal confirmation keeps its existing debounce but participates in the same durable busy state.

- [ ] Add a deferred-write runtime test: trigger one durable action, hold `dbPut`, attempt a second action, and assert only the first proposed mutation/transaction exists, buttons are disabled and `aria-busy` is true.
- [ ] Resolve the first write and assert read-back succeeds, controls restore exactly, and no button that was disabled beforehand becomes enabled.
- [ ] Repeat with rejected write and assert rollback/render, control restoration and ability to retry once.
- [ ] Add a focused purchase-return cancellation fixture and assert the purchase source revision increments exactly once while queue/source revision links remain consistent.
- [ ] Run RED.

```bash
node --test tests/durable-ui-guard.test.cjs
```

Expected RED: a second non-modal click can mutate memory during the first write. Root re-inspection showed the purchase-return branch already has exactly one source bump, so that regression is expected to pass before the UI guard is added.

- [ ] Add `setDurableUiBusy(active)` around the existing `commitCurrentState()` body before its first asynchronous boundary and release it in `finally`. Do not create a separate mutation queue.
- [ ] Preserve pre-disabled states and ignore detached controls safely after `renderAll()`.
- [ ] Keep the existing single source mutation/bump in the `PURCHASE_RETURN_WINDOW` cancellation branch and lock it with the focused regression. Do not add a second owner or change the inventory/cash reversal action keys.
- [ ] Re-run busy, core-safety, Store and persistence suites.

```bash
node --test tests/durable-ui-guard.test.cjs tests/core-safety.test.cjs tests/store-shipping.test.cjs tests/persistence.test.cjs tests/runtime-composition.test.cjs
```

Expected GREEN: concurrent UI input cannot create a second proposal, retries work after failure, and return cancellation advances one revision.

- [ ] Commit the durable-action repair.

```bash
git add tests/durable-ui-guard.test.cjs app.js
git commit -m "fix: guard durable actions against overlap"
```

---

### Task 9: Finish visual ownership, advance release authorities and verify the complete app

**Files:**

- Modify: `metropolis-remaster.css`
- Modify: `metropolis-remaster-core.js`
- Modify: `metropolis-remaster.js`
- Modify: `metropolis-maintenance-core.js`
- Modify: `metropolis-maintenance.js`
- Modify: `metropolis-maintenance-report.js`
- Modify: `metropolis-maintenance.css`
- Modify: `metropolis-r5-5.js`
- Modify: `metropolis-r5-5.css`
- Modify: `app.js`
- Modify: `flow-era.js`
- Modify: `highway-gate.js`
- Modify: `package.json`
- Modify: `sw.js`
- Modify: `RELEASE_MANIFEST.json`
- Modify: `tests/metropolis-finalization.test.cjs`
- Modify: `tests/metropolis-remaster.test.cjs`
- Modify: `tests/defrag-calendar-version-boundary.test.cjs`
- Modify: `tests/defrag-publication-followthrough.test.cjs`
- Modify: `tests/icon-system.test.cjs`
- Modify: `tests/metropolis-4.2-schedule.test.cjs`
- Modify: `tests/metropolis-4.2.1-home-dashboard.test.cjs`
- Modify: `tests/metropolis-maintenance.test.cjs`
- Modify: `tests/metropolis-status-signal.test.cjs`
- Modify: `SHA256SUMS.txt`
- Create: `docs/engineering/METROPOLIS_ROOT_STABILIZATION_NOTES.md`

**Release authority values:**

| Authority | Required value |
|---|---|
| visible product | `4.2.6` |
| Core/Data | `2.1.5` |
| Highway Gate | `2.0.1` |
| Service Worker | `v4.2.6-20260811-r24-root-stabilization` |
| manifest release | `4.2.6-root-stabilization` |

**Visual acceptance:**

- Settings gear visible glyph/chrome is lighter and visually smaller than the current screenshot, while its button hit box remains at least 44×44 CSS pixels.
- Existing cash rows, Ride report, schedule preview, Gate copy, Calendar swipe and Maintenance buttons retain the contrast/touch fixes already in the final remaster layer.
- Queue actions, progressive forms and capacity card use the established Metro tokens; no new global `!important` blanket is introduced.

- [ ] Add/adjust release tests first so the exact new product/Core/Highway/SW/manifest values fail against the current source. Make one current publication test own the exact r24 value; historical layer tests verify compatibility and SW↔manifest agreement rather than stale exact generations.
- [ ] Add visual source/runtime assertions for a 44×44 Settings button and a smaller inner SVG/glyph. Add regression assertions preserving the existing contrast/touch selectors noted above.
- [ ] Run the release/visual tests to capture RED.

```bash
node --test tests/metropolis-finalization.test.cjs tests/metropolis-remaster.test.cjs tests/defrag-calendar-version-boundary.test.cjs
```

Expected RED: current sources still identify 4.2.5 / 2.1.4 / 2.0.0 / r23 and the gear retains its old visible scale.

- [ ] Advance the visible version authority in `metropolis-r5-5.js` to 4.2.6 and update its exported constant/test ownership. Update current-layer release comments in Remaster/Maintenance assets only; do not rewrite historical engineering records or fixture evidence.
- [ ] Advance `CORE_DATA_RELEASE_VERSION`, its safe fallbacks and `package.json` to 2.1.5. Keep legacy migration source strings unchanged because they are evidence.
- [ ] Advance Highway's public version to 2.0.1 without changing schema/DB/Vault identifiers.
- [ ] Set the exact r24 Service Worker release, manifest release fields, notes and asset/test inventory. Keep the app-shell order identical to the runtime loader and include all new test-only files nowhere in production shell.
- [ ] Apply the narrow Settings-gear rule in `metropolis-remaster.css`: minimum 44×44 outer control, approximately 20px inner glyph, no change to click handler or page route.
- [ ] Regenerate `SHA256SUMS.txt` using the repository's established sorted production-file list, then verify every recorded hash against the working tree.
- [ ] Create the engineering note with:
  - root evidence and owner map;
  - the script-realm and Calendar-lifecycle prevention tests;
  - three-action/form/capacity behavior;
  - append-only growth policy and threshold meanings;
  - adjustment/report semantics;
  - exact release values and compatibility locks;
  - bug records in `Symptom → Root cause → Fix → Prevention/Test` form;
  - `LOCAL_VISUAL_RENDER=BLOCKED_NO_BROWSER`;
  - the physical-device checklist below.
- [ ] Run every new runtime suite together before the legacy gate.

```bash
node --test tests/runtime-composition.test.cjs tests/calendar-runtime-lifecycle.test.cjs tests/queue-actions-runtime.test.cjs tests/progressive-forms-runtime.test.cjs tests/storage-capacity.test.cjs tests/stock-adjustment-runtime.test.cjs tests/report-semantics.test.cjs tests/durable-ui-guard.test.cjs
```

Expected: all new root regressions pass with zero captured runtime errors.

- [ ] Run the full repository gate.

```bash
npm run deploy:gate
```

Expected: all Node tests pass, every production JavaScript file parses, and UTF-8 verification passes. Record the fresh exact test/asset counts in the engineering note; do not retain the old `144/144` as completion evidence.

- [ ] Audit release strings, production layering and diff hygiene.

```bash
rg -n '4\.2\.5|2\.1\.4|2\.0\.0|r23|metro-visual-system' --glob '!docs/superpowers/**' --glob '!docs/engineering/METROPOLIS_MAINTENANCE_NOTES.md' --glob '!docs/engineering/METROPOLIS_VISUAL_REMASTER_NOTES.md' .
git diff --check
git status --short
```

Expected: remaining old values are intentionally historical/compatibility fixtures only; `git diff --check` is silent; status lists only planned files.

- [ ] Commit the release closure.

```bash
git add metropolis-remaster.css metropolis-remaster-core.js metropolis-remaster.js metropolis-maintenance-core.js metropolis-maintenance.js metropolis-maintenance-report.js metropolis-maintenance.css metropolis-r5-5.js metropolis-r5-5.css app.js flow-era.js highway-gate.js package.json package-lock.json sw.js RELEASE_MANIFEST.json tests SHA256SUMS.txt docs/engineering/METROPOLIS_ROOT_STABILIZATION_NOTES.md
git commit -m "release: stabilize metropolis 4.2.6 roots"
```

- [ ] Verify the committed tree, not only the pre-commit working tree.

```bash
npm run deploy:gate
git status --short
git log -1 --oneline
```

Expected: deployment gate remains green, `git status --short` is empty, and the last commit is the 4.2.6 release closure.

## Physical-device readback required after source completion

- [ ] Unlock/reload/offline path reaches Home without console-visible failure and reports the exact r24 Service Worker.
- [ ] Home, Store, Ride, Ledger, Calendar and Settings render with no pale-on-pale or clipped core copy.
- [ ] Settings gear looks smaller but remains easy to tap; capacity card reports values and backup/persist actions respond.
- [ ] Calendar direct day tap, filters, month arrows and FLOW swipe retain green/yellow/red status; cancelled stays hidden.
- [ ] One outgoing and one incoming queue each show exactly three actions; maximum amount completes and a smaller amount records partial payment.
- [ ] Sale shipping/outstanding/details and Obligation note/schedule disclosures reveal only when requested.
- [ ] Manual stock adjustment survives reload, appears in exchange/report evidence and does not create a Ledger transaction.
- [ ] Simulated real-device backup is exported before testing any naturally high-storage warning; no destructive cleanup is part of this release.
