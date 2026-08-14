# Store / Ride Truth-Flow v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Store receivable truth, separate Ride round state from credit state, and redesign Store/Ride city surfaces around current truth + short popup actions + deeper inspection without changing domain ownership.

**Architecture:** Keep durable mutations in existing STORE/RIDE/LEDGER/CALENDAR workflows. Add pure read projections in `ui/product-model.mjs`, keep `ui/action-popups.mjs` as the single host for short-action forms, and restructure Store/Ride pages around overview + inspection subviews. No new durable schema or product identity is introduced.

**Tech Stack:** Vanilla JavaScript ES modules, Node.js `node:test`, browser `<dialog>`, Greenfield runtime/workflows, GitHub Actions.

## Global Constraints

- Base behavior includes popup semantics from PR #45 head `1176e558a1c14b1bc2db8e2860f6a160b0968c28`.
- Store owns sale/stock/receivable source truth; Ride owns round/job/credit operational truth; Ledger owns real money; Calendar owns time queues only.
- Calendar cancellation must never erase Store/Ledger source truth.
- No product catalog, SKU identity, or per-product stock balance in v1.
- `rideJob` and `rideExpense` require an active round; `rideWithdrawCredit` is round-independent.
- Generated Ride income must not be labeled as spendable cash.
- Existing popup layer remains the only short-action form host; no cloned forms/handlers.
- Shell/Home/Bottom Nav remain unchanged except scoped Store/Ride styling.
- Stop at `READY FOR GATE`; do not trigger the real Gate without explicit authorization.

---

### Task 1: Store receivable source truth

**Files:**
- Modify: `ui/product-model.mjs`
- Modify: `tests/greenfield-store-projection.test.cjs`
- Modify: `tests/greenfield-lifecycle.test.cjs`

**Interfaces:**
- Produces `projectStoreReceivables(state)` -> `{ totalOutstandingSatang, items }`.
- Each item -> `{ saleId, title, outstandingSatang, queueState, queueId }`.
- `queueState` -> `SCHEDULED | UNSCHEDULED | VERIFY_DUPLICATE`.
- `projectStore(state,today).receivableSatang` becomes Sale-source outstanding truth.

- [ ] **Step 1: Write failing tests**

```js
test('cancelled queue does not erase Store receivable truth', async () => {
  const { projectStore, projectStoreReceivables } = await import('../ui/product-model.mjs');
  const state = stateWith(
    [{ recordId:'SALE-1', type:'SALE', title:'ขายสินค้า', totalSatang:100000, receivedSatang:0, outstandingSatang:100000, quantity:1, status:'OPEN' }],
    [{ recordId:'Q-1', type:'RECEIVE_CUSTOMER_PAYMENT', detail:'STORE/SALE-1', amountSatang:100000, dueDate:'2026-08-15', status:'CANCELLED' }],
  );
  assert.equal(projectStore(state, '2026-08-14').receivableSatang, 100000);
  const view = projectStoreReceivables(state);
  assert.equal(view.totalOutstandingSatang, 100000);
  assert.equal(view.items[0].queueState, 'UNSCHEDULED');
});

test('duplicate actionable queues are VERIFY_DUPLICATE', async () => {
  const { projectStoreReceivables } = await import('../ui/product-model.mjs');
  const state = stateWith(
    [{ recordId:'SALE-1', type:'SALE', title:'ขายสินค้า', outstandingSatang:50000, quantity:1, status:'PARTIAL' }],
    [
      { recordId:'Q-A', type:'RECEIVE_CUSTOMER_PAYMENT', detail:'STORE/SALE-1', amountSatang:50000, dueDate:'2026-08-15', status:'OPEN' },
      { recordId:'Q-B', type:'RECEIVE_CUSTOMER_PAYMENT', detail:'STORE/SALE-1', amountSatang:50000, dueDate:'2026-08-16', status:'PARTIAL' },
    ],
  );
  const item = projectStoreReceivables(state).items[0];
  assert.equal(item.queueState, 'VERIFY_DUPLICATE');
  assert.equal(item.queueId, null);
});
```

- [ ] **Step 2: Verify RED**

```bash
node --test tests/greenfield-store-projection.test.cjs tests/greenfield-lifecycle.test.cjs
```

Expected: FAIL because `projectStoreReceivables` does not yet exist and current Store receivable total comes from Calendar queues.

- [ ] **Step 3: Implement minimal projection**

```js
export function projectStoreReceivables(state) {
  const sales = recordsForDomain(state, 'STORE').filter(record =>
    record.type === 'SALE' &&
    record.status !== 'CANCELLED' &&
    Number.isSafeInteger(Number(record.outstandingSatang)) &&
    Number(record.outstandingSatang) > 0
  );
  const queues = recordsForDomain(state, 'CALENDAR').filter(record =>
    record.type === 'RECEIVE_CUSTOMER_PAYMENT' && isCalendarActionableStatus(record.status)
  );
  const items = sales.map(sale => {
    const related = queues.filter(queue => String(queue.detail || '') === `STORE/${sale.recordId}`);
    return {
      saleId:sale.recordId,
      title:sale.title || 'ลูกหนี้จากการขาย',
      outstandingSatang:Number(sale.outstandingSatang),
      queueState:related.length === 0 ? 'UNSCHEDULED' : related.length === 1 ? 'SCHEDULED' : 'VERIFY_DUPLICATE',
      queueId:related.length === 1 ? related[0].recordId : null,
    };
  });
  return {
    totalOutstandingSatang:items.reduce((sum, item) => sum + item.outstandingSatang, 0),
    items,
  };
}
```

Update `projectStore()` to use `projectStoreReceivables(state).totalOutstandingSatang`.

- [ ] **Step 4: Verify GREEN and partial-payment exactness**

Add a test with Sale `outstandingSatang:40000` and matching Calendar queue `amountSatang:40000`; assert Store receivable total is exactly `40000`.

```bash
node --test tests/greenfield-store-projection.test.cjs tests/greenfield-lifecycle.test.cjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/product-model.mjs tests/greenfield-store-projection.test.cjs tests/greenfield-lifecycle.test.cjs
git commit -m "fix: derive store receivables from sale truth"
```

---

### Task 2: Store truth-first city

**Files:**
- Modify: `index.html`
- Modify: `ui/app.mjs`
- Modify: `styles.css`
- Create: `tests/greenfield-store-city-flow.test.cjs`

**Interfaces:**
- Consumes `projectStoreReceivables(state)` and existing popup launchers `sale`, `purchase`, `withdraw`, `adjust`.
- Produces Store subviews `overview`, `receivables`, `stock-movements`, `history`.

- [ ] **Step 1: Write failing city contract test**

```js
"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

test('Store exposes overview and inspection subviews without fake product identity', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /data-store-view="overview"/);
  assert.match(html, /data-store-view="receivables"/);
  assert.match(html, /data-store-view="stock-movements"/);
  assert.match(html, /data-store-view="history"/);
  assert.doesNotMatch(html, /SKU|productId|สต็อกรายสินค้า/);
});
```

- [ ] **Step 2: Verify RED**

```bash
node --test tests/greenfield-store-city-flow.test.cjs
```

Expected: FAIL because Store subviews do not exist.

- [ ] **Step 3: Add Store overview + inspection HTML**

```html
<div data-store-view="overview">
  <div id="storeAttention" class="attention-list"></div>
  <div class="city-inspection-links">
    <button type="button" data-store-open="receivables">ลูกหนี้ ›</button>
    <button type="button" data-store-open="stock-movements">ความเคลื่อนไหวสต็อก ›</button>
    <button type="button" data-store-open="history">ประวัติร้าน ›</button>
  </div>
</div>
<section data-store-view="receivables" class="hidden"><button type="button" data-store-back>กลับ</button><div id="storeReceivableList" class="list"></div></section>
<section data-store-view="stock-movements" class="hidden"><button type="button" data-store-back>กลับ</button><div id="storeStockMovementList" class="list"></div></section>
<section data-store-view="history" class="hidden"><button type="button" data-store-back>กลับ</button><div id="storeList" class="list"></div></section>
```

Keep existing forms in DOM so `ui/action-popups.mjs` continues to move the same form nodes into the shared dialog.

- [ ] **Step 4: Add Store subview state/rendering**

```js
let activeStoreView = 'overview';
function setStoreView(view = 'overview') {
  const allowed = new Set(['overview','receivables','stock-movements','history']);
  activeStoreView = allowed.has(view) ? view : 'overview';
  document.querySelectorAll('[data-store-view]').forEach(node => {
    node.classList.toggle('hidden', node.dataset.storeView !== activeStoreView);
  });
}
```

Render:
- `SCHEDULED` normally.
- `UNSCHEDULED` as `ยังมีลูกหนี้ แต่ไม่มีคิวรับเงินที่ใช้งานได้`.
- `VERIFY_DUPLICATE` as `VERIFY: พบคิวรับเงินซ้ำ` and do not guess a queue.
- Stock movement view from `PURCHASE`, `SALE`, `STOCK_WITHDRAWAL`, `STOCK_ADJUSTMENT` only; never aggregate by title as product identity.

- [ ] **Step 5: Style scoped Store subviews**

Add only scoped classes such as:

```css
.city-inspection-links{display:grid;gap:12px}
.city-subview-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
.truth-warning{border:1px solid var(--line);border-radius:16px;padding:14px}
```

Do not change Bottom Nav positioning.

- [ ] **Step 6: Verify Store flow**

```bash
node --test tests/greenfield-store-city-flow.test.cjs tests/greenfield-store-projection.test.cjs tests/greenfield-mobile-action-popups.test.cjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add index.html ui/app.mjs styles.css tests/greenfield-store-city-flow.test.cjs
git commit -m "feat: make store city truth first"
```

---

### Task 3: Ride round-state and summary projections

**Files:**
- Modify: `ui/product-model.mjs`
- Modify: `greenfield/runtime.mjs`
- Create: `tests/greenfield-ride-projection.test.cjs`
- Modify: `tests/greenfield-runtime.test.cjs`

**Interfaces:**
- Produces `projectRideRound(state, roundId)` -> `{ roundId, status, startedAt, endedAt, generatedSatang, cashJobSatang, creditJobSatang, expenseSatang, jobCount }`.
- Produces `projectRideState(state, today)` -> `{ activeRound, latestRound, todayRoundState, generatedSatang, cashJobSatang, creditJobSatang, expenseSatang, pendingCreditSatang }`.
- `todayRoundState` -> `NOT_STARTED | ACTIVE | COMPLETED`.

- [ ] **Step 1: Write failing projection tests**

```js
test('Ride distinguishes NOT_STARTED ACTIVE and COMPLETED today', async () => {
  const { projectRideState } = await import('../ui/product-model.mjs');
  assert.equal(projectRideState(stateWith({ ride:[] }), '2026-08-14').todayRoundState, 'NOT_STARTED');
  assert.equal(projectRideState(stateWith({ ride:[
    { recordId:'R1', type:'ROUND', status:'ACTIVE', startedAt:'2026-08-14T01:00:00Z', createdAt:'2026-08-14T01:00:00Z' },
  ] }), '2026-08-14').todayRoundState, 'ACTIVE');
  assert.equal(projectRideState(stateWith({ ride:[
    { recordId:'R1', type:'ROUND', status:'CLOSED', startedAt:'2026-08-14T01:00:00Z', endedAt:'2026-08-14T05:00:00Z', updatedAt:'2026-08-14T05:00:00Z' },
  ] }), '2026-08-14').todayRoundState, 'COMPLETED');
});

test('Ride round summary separates generated cash credit and expense', async () => {
  const { projectRideRound } = await import('../ui/product-model.mjs');
  const state = stateWith({ ride:[
    { recordId:'R1', type:'ROUND', status:'CLOSED', startedAt:'2026-08-14T01:00:00Z', endedAt:'2026-08-14T05:00:00Z' },
    { recordId:'J1', type:'JOB', roundId:'R1', status:'COMPLETED', paymentMode:'CASH', amountSatang:12000 },
    { recordId:'J2', type:'JOB', roundId:'R1', status:'COMPLETED', paymentMode:'CREDIT', amountSatang:18000 },
    { recordId:'E1', type:'EXPENSE', roundId:'R1', status:'COMPLETED', amountSatang:5000 },
  ] });
  const view = projectRideRound(state, 'R1');
  assert.equal(view.generatedSatang, 30000);
  assert.equal(view.cashJobSatang, 12000);
  assert.equal(view.creditJobSatang, 18000);
  assert.equal(view.expenseSatang, 5000);
  assert.equal(view.jobCount, 2);
});
```

- [ ] **Step 2: Verify RED**

```bash
node --test tests/greenfield-ride-projection.test.cjs
```

Expected: FAIL because the projection functions do not exist.

- [ ] **Step 3: Implement Ride projections**

Use RIDE records only. `pendingCreditSatang` = all CREDIT job amounts minus all CREDIT_WITHDRAWAL amounts. `COMPLETED` means there is no active round and the latest closed round ended on the requested Bangkok date.

- [ ] **Step 4: Expose new projection through runtime**

```js
ride: projectRideState(lastState, now()),
```

Import `projectRideState` into `greenfield/runtime.mjs`; do not create a durable UI-status record.

- [ ] **Step 5: Verify GREEN**

```bash
node --test tests/greenfield-ride-projection.test.cjs tests/greenfield-ride.test.cjs tests/greenfield-runtime.test.cjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add ui/product-model.mjs greenfield/runtime.mjs tests/greenfield-ride-projection.test.cjs tests/greenfield-runtime.test.cjs
git commit -m "feat: project ride round state and summary"
```

---

### Task 4: Ride city split into Current Round and Credit

**Files:**
- Modify: `index.html`
- Modify: `ui/app.mjs`
- Modify: `styles.css`
- Create: `tests/greenfield-ride-city-flow.test.cjs`

**Interfaces:**
- Consumes `projectRideState`/runtime Ride projection and popup tasks `ride-job`, `ride-expense`, `ride-withdraw`.
- Produces Current Round section, independent Credit section, Round Summary view, Round History view.

- [ ] **Step 1: Write failing city test**

```js
test('Ride separates current round from credit', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /data-ride-section="current-round"/);
  assert.match(html, /data-ride-section="credit"/);
  assert.match(html, /data-ride-view="round-summary"/);
  assert.match(html, /data-ride-view="round-history"/);
});
```

- [ ] **Step 2: Verify RED**

```bash
node --test tests/greenfield-ride-city-flow.test.cjs
```

Expected: FAIL.

- [ ] **Step 3: Add Ride semantic layout**

```html
<section data-ride-section="current-round"><div id="rideRoundActions" class="action-row"></div></section>
<section data-ride-section="credit"><b id="ridePendingCredit">0 บาท</b><div id="rideCreditAction"></div></section>
<div class="city-inspection-links">
  <button type="button" data-ride-open="round-summary">สรุปรอบ ›</button>
  <button type="button" data-ride-open="round-history">ประวัติรอบ ›</button>
</div>
<section data-ride-view="round-summary" class="hidden"><button type="button" data-ride-back>กลับ</button><div id="rideRoundSummary"></div></section>
<section data-ride-view="round-history" class="hidden"><button type="button" data-ride-back>กลับ</button><div id="rideRoundHistory" class="list"></div></section>
```

Keep the existing three Ride forms in DOM for the shared popup module.

- [ ] **Step 4: Implement Ride visibility rules**

```js
const ride = context.projection.ride;
const active = ride.todayRoundState === 'ACTIVE';
$('rideStartBtn').classList.toggle('hidden', active);
$('rideEndBtn').classList.toggle('hidden', !active);
```

Additionally:
- `NOT_STARTED`: Start Round visible; job/expense launcher unavailable.
- `ACTIVE`: job/expense + End Round available.
- `COMPLETED`: Start New Round visible; job/expense unavailable until new round starts.
- Credit section always visible.
- Withdraw Credit launcher enabled only when `pendingCreditSatang > 0`; it must not depend on active round.

- [ ] **Step 5: Render summary without money-truth mixing**

Display exact labels:
- `สร้างได้ในรอบ`
- `เงินสดจากงาน`
- `เครดิตจากงาน`
- `ค่าใช้จ่ายรอบ`
- `จำนวนงาน`

Do not label `generatedSatang` as `เงินใช้ได้`, `เงินสด`, or Ledger balance.

- [ ] **Step 6: Verify Ride flow**

```bash
node --test tests/greenfield-ride-city-flow.test.cjs tests/greenfield-ride-projection.test.cjs tests/greenfield-ride.test.cjs tests/greenfield-mobile-action-popups.test.cjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add index.html ui/app.mjs styles.css tests/greenfield-ride-city-flow.test.cjs
git commit -m "feat: separate ride round and credit flows"
```

---

### Task 5: Popup and impossible-action regression lock

**Files:**
- Modify: `ui/action-popups.mjs`
- Modify: `tests/greenfield-mobile-action-popups.test.cjs`
- Modify: `tests/greenfield-ride-city-flow.test.cjs`

**Interfaces:**
- Keeps existing domain validation as authority.
- UI only disables/hides impossible launchers; it must not duplicate mutation logic.

- [ ] **Step 1: Add failing/contract tests**

Assert:
- `ride-job` and `ride-expense` are unavailable without active round.
- `ride-withdraw` has no active-round dependency.
- Domain error leaves popup open.
- Success closes popup and returns to same city.

- [ ] **Step 2: Run focused tests**

```bash
node --test tests/greenfield-mobile-action-popups.test.cjs tests/greenfield-ride-city-flow.test.cjs
```

If existing behavior already satisfies a contract, that assertion should pass; only genuinely missing behavior should be RED.

- [ ] **Step 3: Add minimal launcher state hook**

Expose a function in `ui/action-popups.mjs` only if needed:

```js
export function setTaskEnabled(task, enabled) {
  document.querySelectorAll(`[data-task-open="${task}"]`).forEach(button => {
    button.disabled = !enabled;
    button.setAttribute('aria-disabled', String(!enabled));
  });
}
```

Call it from `renderRide()` using current Ride projection. Do not move workflow checks out of domain/runtime.

- [ ] **Step 4: Verify GREEN**

```bash
node --test tests/greenfield-mobile-action-popups.test.cjs tests/greenfield-ride-city-flow.test.cjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/action-popups.mjs ui/app.mjs tests/greenfield-mobile-action-popups.test.cjs tests/greenfield-ride-city-flow.test.cjs
git commit -m "test: lock store ride action state flow"
```

---

### Task 6: Release closure and preflight

**Files:**
- Modify only if required: `RELEASE_MANIFEST.json`, `sw.js`, `.assetsignore`, `package.json`
- Test: full existing suite plus new Store/Ride tests

**Interfaces:**
- Produces an internally consistent final branch ready for the real Gate.

- [ ] **Step 1: Check production asset membership**

If no new production module is added, do not churn allowlists. If a new module is added, include it consistently in manifest, Service Worker shell, publication allowlist, and syntax closure.

- [ ] **Step 2: Refresh asset revision after production bytes settle**

Update `RELEASE_MANIFEST.json` and `sw.js` together using the repository’s existing asset revision rule so `greenfield-service-worker.test.cjs` remains authoritative.

- [ ] **Step 3: Run focused truth-flow regression**

```bash
node --test \
  tests/greenfield-store-projection.test.cjs \
  tests/greenfield-store-city-flow.test.cjs \
  tests/greenfield-ride.test.cjs \
  tests/greenfield-ride-projection.test.cjs \
  tests/greenfield-ride-city-flow.test.cjs \
  tests/greenfield-mobile-action-popups.test.cjs \
  tests/greenfield-workflow.test.cjs \
  tests/greenfield-workflow-authority.test.cjs
```

Expected: all PASS.

- [ ] **Step 4: Run local/preflight project checks only**

```bash
npm test
npm run check:syntax
npm run check:utf8
```

Do not trigger the GitHub Greenfield Deploy Gate workflow.

- [ ] **Step 5: Audit final diff**

Confirm explicitly:
- no Vault/persistence/schema/crypto changes;
- no SKU/product identity added;
- Calendar cancellation still does not mutate Sale/Ledger truth;
- popup forms/handlers are not cloned;
- Shell/Home/Bottom Nav behavior remains unchanged.

- [ ] **Step 6: Commit release closure if files changed**

```bash
git add RELEASE_MANIFEST.json sw.js .assetsignore package.json
git commit -m "chore: close store ride truth-flow release"
```

If none of those files changed, do not create a no-op commit.

- [ ] **Step 7: Stop before Gate**

Report:

```text
READY FOR GATE — NOT GATED
```

Include branch head SHA, changed-file audit, focused test counts, and preflight results. Do not merge or deploy.
