# Store / Ride Truth-Flow v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Store receivable truth, separate Ride round state from credit state, and redesign Store/Ride city surfaces around current truth + short popup actions + deeper inspection without changing domain ownership.

**Architecture:** Keep durable business truth in existing STORE/RIDE/LEDGER/CALENDAR domains. Add pure read projections in `ui/product-model.mjs`, keep mutation paths in existing workflows/runtime, keep `ui/action-popups.mjs` as the only host for short-action forms, and restructure Store/Ride HTML/UI rendering around derived projections. Do not invent product/SKU identity in this version.

**Tech Stack:** Vanilla JavaScript ES modules, Node.js `node:test`, browser `<dialog>`, existing Greenfield command/workflow runtime, GitHub Actions deploy gate.

## Global Constraints

- Base behavior must include PR #45 popup layer semantics from commit `1176e558a1c14b1bc2db8e2860f6a160b0968c28`.
- Store owns sale/stock/receivable source truth; Ride owns round/job/credit operational truth; Ledger owns real money; Calendar owns time queues only.
- Calendar cancellation must never cancel or erase Store/Ledger source truth.
- No product catalog, SKU identity, or per-product stock balance in v1.
- `rideJob` and `rideExpense` require an active round; `rideWithdrawCredit` remains round-independent.
- Generated Ride income must not be labeled or projected as spendable cash.
- Existing popup layer remains the single short-action form host; do not clone forms or business handlers.
- Shell/Home/Bottom Nav are out of scope unless a traced Store/Ride defect requires an explicit follow-up.
- Stop at `READY FOR GATE`; do not run the real Gate unless explicitly authorized.

---

### Task 1: Move Store receivable truth back to Sale source records

**Files:**
- Modify: `ui/product-model.mjs`
- Modify: `tests/greenfield-store-projection.test.cjs`
- Modify: `tests/greenfield-lifecycle.test.cjs`

**Interfaces:**
- Consumes: `recordsForDomain(state, domain)`, existing Sale fields `outstandingSatang`, `receivedSatang`, `totalSatang`, Calendar `detail=STORE/<saleId>`.
- Produces: `projectStoreReceivables(state)` returning `{ totalOutstandingSatang, items }`; each item is `{ saleId, title, outstandingSatang, queueState, queueId }` where `queueState` is `SCHEDULED | UNSCHEDULED | VERIFY_DUPLICATE`.
- Updates: `projectStore(state, today)` so `receivableSatang` equals Sale source outstanding truth, not Calendar queue totals.

- [ ] **Step 1: Write failing receivable truth tests**

Add tests equivalent to:

```js
test('cancelled receive queue does not erase Store receivable truth', async () => {
  const { projectStore, projectStoreReceivables } = await import('../ui/product-model.mjs');
  const state = stateWith(
    [{ recordId:'SALE-1', type:'SALE', title:'ขายสินค้า', totalSatang:100000, receivedSatang:0, outstandingSatang:100000, quantity:1, status:'OPEN' }],
    [{ recordId:'Q-1', type:'RECEIVE_CUSTOMER_PAYMENT', detail:'STORE/SALE-1', amountSatang:100000, status:'CANCELLED', dueDate:'2026-08-15' }],
  );
  assert.equal(projectStore(state, '2026-08-14').receivableSatang, 100000);
  const view = projectStoreReceivables(state);
  assert.equal(view.totalOutstandingSatang, 100000);
  assert.equal(view.items[0].queueState, 'UNSCHEDULED');
});

test('duplicate actionable receive queues are VERIFY_DUPLICATE instead of guessed', async () => {
  const { projectStoreReceivables } = await import('../ui/product-model.mjs');
  const state = stateWith(
    [{ recordId:'SALE-1', type:'SALE', title:'ขายสินค้า', outstandingSatang:50000, quantity:1, status:'PARTIAL' }],
    [
      { recordId:'Q-A', type:'RECEIVE_CUSTOMER_PAYMENT', detail:'STORE/SALE-1', amountSatang:50000, status:'OPEN', dueDate:'2026-08-15' },
      { recordId:'Q-B', type:'RECEIVE_CUSTOMER_PAYMENT', detail:'STORE/SALE-1', amountSatang:50000, status:'PARTIAL', dueDate:'2026-08-16' },
    ],
  );
  assert.equal(projectStoreReceivables(state).items[0].queueState, 'VERIFY_DUPLICATE');
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
node --test tests/greenfield-store-projection.test.cjs tests/greenfield-lifecycle.test.cjs
```

Expected: FAIL because `projectStoreReceivables` does not exist and current `projectStore()` still derives receivables from Calendar queues.

- [ ] **Step 3: Implement the pure Store receivable projection**

Add a pure projection with this behavior:

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

Change `projectStore()` to use `projectStoreReceivables(state).totalOutstandingSatang` for `receivableSatang`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
node --test tests/greenfield-store-projection.test.cjs tests/greenfield-lifecycle.test.cjs
```

Expected: PASS.

- [ ] **Step 5: Add exact partial-payment regression**

Add a projection test where Sale outstanding changes from `100000` to `40000` and Calendar queue amount is `40000`; assert Store receivable total is exactly `40000`, not double-counted.

- [ ] **Step 6: Commit**

```bash
git add ui/product-model.mjs tests/greenfield-store-projection.test.cjs tests/greenfield-lifecycle.test.cjs
git commit -m "fix: derive store receivables from sale truth"
```

---

### Task 2: Build Store truth-first city surfaces without fake product identity

**Files:**
- Modify: `index.html`
- Modify: `ui/app.mjs`
- Modify: `ui/action-popups.mjs` only if launcher placement needs an explicit stable container hook; do not change mutation semantics.
- Modify: `styles.css`
- Create: `tests/greenfield-store-city-flow.test.cjs`

**Interfaces:**
- Consumes: `projectStore(context.state, today)`, `projectStoreReceivables(context.state)`, existing popup launchers `data-task-open="sale|purchase|withdraw|adjust"`.
- Produces: Store overview plus inspection subviews `receivables`, `stock-movements`, `history` using existing records only.

- [ ] **Step 1: Write failing Store city contract tests**

Create `tests/greenfield-store-city-flow.test.cjs` with static/source contracts:

```js
"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

test('Store exposes truth-first overview and inspection routes without per-product claims', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /data-store-view="overview"/);
  assert.match(html, /data-store-view="receivables"/);
  assert.match(html, /data-store-view="stock-movements"/);
  assert.match(html, /data-store-view="history"/);
  assert.doesNotMatch(html, /SKU|productId|สต็อกรายสินค้า/);
});

test('Store keeps short actions in popup layer', () => {
  const popup = fs.readFileSync(path.join(root, 'ui/action-popups.mjs'), 'utf8');
  for (const task of ['sale','purchase','withdraw','adjust']) assert.match(popup, new RegExp(`'${task}'`));
});
```

- [ ] **Step 2: Run Store city test and verify RED**

Run:

```bash
node --test tests/greenfield-store-city-flow.test.cjs
```

Expected: FAIL because Store inspection subviews do not exist.

- [ ] **Step 3: Restructure Store HTML into overview + inspection subviews**

Within the Store area, preserve the existing forms so the popup layer can move them at runtime, but add stable overview/inspection containers:

```html
<div data-store-view="overview">
  <div class="metrics three">...</div>
  <div id="storeAttention" class="attention-list"></div>
  <!-- existing task forms remain in DOM and are transformed by action-popups.mjs -->
  <div class="city-inspection-links">
    <button type="button" data-store-open="receivables">ลูกหนี้ ›</button>
    <button type="button" data-store-open="stock-movements">ความเคลื่อนไหวสต็อก ›</button>
    <button type="button" data-store-open="history">ประวัติร้าน ›</button>
  </div>
</div>
<section data-store-view="receivables" class="hidden">...</section>
<section data-store-view="stock-movements" class="hidden">...</section>
<section data-store-view="history" class="hidden">...</section>
```

Do not add a per-product inventory table.

- [ ] **Step 4: Add Store subview navigation/rendering in `ui/app.mjs`**

Add local UI state only:

```js
let activeStoreView = 'overview';

function setStoreView(view = 'overview') {
  activeStoreView = ['overview','receivables','stock-movements','history'].includes(view) ? view : 'overview';
  document.querySelectorAll('[data-store-view]').forEach(node => node.classList.toggle('hidden', node.dataset.storeView !== activeStoreView));
}
```

Render receivables from `projectStoreReceivables(state)`; show:
- `SCHEDULED` as normal.
- `UNSCHEDULED` as attention text such as `ยังมีลูกหนี้ แต่ไม่มีคิวรับเงินที่ใช้งานได้`.
- `VERIFY_DUPLICATE` as warning/VERIFY and do not route automatically to a guessed queue.

Render stock movements only from `PURCHASE`, `SALE`, `STOCK_WITHDRAWAL`, `STOCK_ADJUSTMENT` records as chronological deltas.

- [ ] **Step 5: Style subviews and back controls without changing global Bottom Nav**

Use existing card/list spacing and add only scoped classes such as `.city-inspection-links`, `.city-subview-head`, `.truth-warning`.

- [ ] **Step 6: Run Store flow tests**

Run:

```bash
node --test tests/greenfield-store-city-flow.test.cjs tests/greenfield-store-projection.test.cjs tests/greenfield-mobile-action-popups.test.cjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add index.html ui/app.mjs ui/action-popups.mjs styles.css tests/greenfield-store-city-flow.test.cjs
git commit -m "feat: make store city truth first"
```

---

### Task 3: Add Ride round-state and round-summary projections

**Files:**
- Modify: `ui/product-model.mjs`
- Modify: `greenfield/runtime.mjs`
- Modify: `tests/greenfield-ride.test.cjs`
- Create: `tests/greenfield-ride-projection.test.cjs`

**Interfaces:**
- Produces: `projectRideState(state, today)` returning `{ activeRound, latestRound, todayRoundState, generatedSatang, cashJobSatang, creditJobSatang, expenseSatang, pendingCreditSatang }`.
- Produces: `projectRideRound(state, roundId)` returning `{ roundId, status, startedAt, endedAt, generatedSatang, cashJobSatang, creditJobSatang, expenseSatang, jobCount }`.
- Runtime `project().ride` should expose the new projection instead of only `{ pendingCreditSatang, activeRound }`.

- [ ] **Step 1: Write failing Ride projection tests**

Create tests covering exact lifecycle:

```js
test('Ride state distinguishes NOT_STARTED ACTIVE and COMPLETED today', async () => {
  const { projectRideState } = await import('../ui/product-model.mjs');
  const blank = stateWith({ ride:[] });
  assert.equal(projectRideState(blank, '2026-08-14').todayRoundState, 'NOT_STARTED');

  const active = stateWith({ ride:[{ recordId:'R1', type:'ROUND', status:'ACTIVE', startedAt:'2026-08-14T01:00:00Z', createdAt:'2026-08-14T01:00:00Z' }] });
  assert.equal(projectRideState(active, '2026-08-14').todayRoundState, 'ACTIVE');

  const closed = stateWith({ ride:[{ recordId:'R1', type:'ROUND', status:'CLOSED', startedAt:'2026-08-14T01:00:00Z', endedAt:'2026-08-14T05:00:00Z', createdAt:'2026-08-14T01:00:00Z', updatedAt:'2026-08-14T05:00:00Z' }] });
  assert.equal(projectRideState(closed, '2026-08-14').todayRoundState, 'COMPLETED');
});

test('Round summary separates generated cash credit and expense', async () => {
  const { projectRideRound } = await import('../ui/product-model.mjs');
  const state = stateWith({ ride:[
    { recordId:'R1', type:'ROUND', status:'CLOSED', startedAt:'2026-08-14T01:00:00Z', endedAt:'2026-08-14T05:00:00Z' },
    { recordId:'J1', type:'JOB', roundId:'R1', status:'COMPLETED', paymentMode:'CASH', amountSatang:12000 },
    { recordId:'J2', type:'JOB', roundId:'R1', status:'COMPLETED', paymentMode:'CREDIT', amountSatang:18000 },
    { recordId:'E1', type:'EXPENSE', roundId:'R1', status:'COMPLETED', amountSatang:5000 },
  ] });
  assert.deepEqual(projectRideRound(state, 'R1'), assert.objectContaining ? undefined : undefined);
});
```

Use explicit assertions in the real test:
`generatedSatang === 30000`, `cashJobSatang === 12000`, `creditJobSatang === 18000`, `expenseSatang === 5000`, `jobCount === 2`.

- [ ] **Step 2: Run focused Ride projection tests and verify RED**

Run:

```bash
node --test tests/greenfield-ride-projection.test.cjs tests/greenfield-ride.test.cjs
```

Expected: FAIL because new projection functions do not exist.

- [ ] **Step 3: Implement pure Ride projections**

Derive from RIDE records only. A round counts as `COMPLETED` for today only when its `endedAt` date equals `today`; otherwise no active round + no closed round today is `NOT_STARTED`.

`pendingCreditSatang` must continue to equal all CREDIT job earnings minus all CREDIT_WITHDRAWAL records, not a per-round value.

- [ ] **Step 4: Replace runtime Ride projection shape**

In `greenfield/runtime.mjs`, keep durable logic unchanged and expose:

```js
ride: projectRideState(lastState, now()),
```

If timezone-sensitive tests use a deterministic `today`, pass a Bangkok date key derived in the projection; do not store new status records.

- [ ] **Step 5: Run Ride projection/workflow tests**

Run:

```bash
node --test tests/greenfield-ride-projection.test.cjs tests/greenfield-ride.test.cjs tests/greenfield-runtime.test.cjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add ui/product-model.mjs greenfield/runtime.mjs tests/greenfield-ride.test.cjs tests/greenfield-ride-projection.test.cjs
git commit -m "feat: project ride round state and summary"
```

---

### Task 4: Restructure Ride city around Current Round and Credit

**Files:**
- Modify: `index.html`
- Modify: `ui/app.mjs`
- Modify: `styles.css`
- Create: `tests/greenfield-ride-city-flow.test.cjs`

**Interfaces:**
- Consumes: `projectRideState(state, today)`, `projectRideRound(state, roundId)`, popup launchers `ride-job`, `ride-expense`, `ride-withdraw`.
- Produces: Ride overview, current/latest round detail, round history, and independent credit surface.

- [ ] **Step 1: Write failing Ride city contract tests**

Create tests asserting:

```js
assert.match(html, /data-ride-section="current-round"/);
assert.match(html, /data-ride-section="credit"/);
assert.match(html, /data-ride-view="round-summary"/);
assert.match(html, /data-ride-view="round-history"/);
```

Also assert source contains conditional UI rules keyed to `todayRoundState`, and credit withdrawal launcher is not nested inside an `ACTIVE`-only block.

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
node --test tests/greenfield-ride-city-flow.test.cjs
```

Expected: FAIL.

- [ ] **Step 3: Restructure Ride HTML**

Use this semantic layout:

```html
<section data-ride-section="current-round">...</section>
<section data-ride-section="credit">...</section>
<div class="city-inspection-links">
  <button data-ride-open="round-summary">สรุปรอบ ›</button>
  <button data-ride-open="round-history">ประวัติรอบ ›</button>
</div>
<section data-ride-view="round-summary" class="hidden">...</section>
<section data-ride-view="round-history" class="hidden">...</section>
```

Keep existing `rideJobForm`, `rideExpenseForm`, `rideWithdrawForm` in DOM for the popup layer.

- [ ] **Step 4: Update `renderRide(context)` state rules**

Rules:
- `NOT_STARTED`: show Start Round; hide/disable job + expense launchers.
- `ACTIVE`: show job + expense launchers and End Round.
- `COMPLETED`: show completed label + Start New Round; no job/expense until a new round is active.
- Credit section is always visible; `ride-withdraw` enabled only when `pendingCreditSatang > 0`, independent of active round.
- Display generated income and pending credit as separate metrics; never label generated total as available cash.

- [ ] **Step 5: Render round summary**

For active or latest round show:
- สร้างได้ในรอบ = generatedSatang
- เงินสดจากงาน = cashJobSatang
- เครดิตจากงาน = creditJobSatang
- ค่าใช้จ่ายรอบ = expenseSatang
- จำนวนงาน = jobCount

Do not subtract expenses and call the result Ledger balance.

- [ ] **Step 6: Run Ride UI/workflow tests**

Run:

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

### Task 5: Lock UI error/visibility behavior to domain truth

**Files:**
- Modify: `ui/action-popups.mjs`
- Modify: `ui/app.mjs`
- Modify: `tests/greenfield-mobile-action-popups.test.cjs`
- Modify: `tests/greenfield-ride-city-flow.test.cjs`

**Interfaces:**
- Consumes: existing form submit/status observer and Ride current state.
- Produces: helper behavior where invalid state prevents opening/submitting impossible actions without duplicating domain validation.

- [ ] **Step 1: Write failing visibility/error tests**

Add source/behavior contracts:
- Ride job/expense launcher is unavailable when there is no active round.
- `ride-withdraw` remains independent from round state.
- Popup remains open on domain error (`RIDE_CREDIT_OVERDRAW`, no active round, stock underflow) and closes only after success.

- [ ] **Step 2: Run focused tests and verify RED if current source violates the new visibility contract**

Run:

```bash
node --test tests/greenfield-mobile-action-popups.test.cjs tests/greenfield-ride-city-flow.test.cjs
```

- [ ] **Step 3: Implement only UI gating, not duplicate business validation**

Use `disabled`/`hidden` state on launchers derived from projection. Keep domain/workflow validation as final authority.

- [ ] **Step 4: Run focused tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/action-popups.mjs ui/app.mjs tests/greenfield-mobile-action-popups.test.cjs tests/greenfield-ride-city-flow.test.cjs
git commit -m "test: lock store ride action state flow"
```

---

### Task 6: Release closure, full regression preflight, and READY FOR GATE stop

**Files:**
- Modify only if required by changed production asset set: `RELEASE_MANIFEST.json`, `sw.js`, `.assetsignore`, `package.json` syntax list.
- Tests: all `tests/*.test.cjs`

**Interfaces:**
- Consumes: final production asset set.
- Produces: exact final branch that is internally consistent and ready for the real Greenfield Gate.

- [ ] **Step 1: Check whether production asset membership changed**

If no new production file was added, do not change allowlists merely for churn. If a new production module was added, add it consistently to manifest, Service Worker offline shell, publication allowlist, and syntax closure.

- [ ] **Step 2: Refresh asset revision only after final production bytes settle**

Compute the project’s existing release asset revision exactly as current tests expect and update `RELEASE_MANIFEST.json` + `sw.js` atomically.

- [ ] **Step 3: Run focused truth-flow regression suite**

Run:

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

- [ ] **Step 4: Run local/preflight project checks without triggering the real deployment Gate**

Run:

```bash
npm test
npm run check:syntax
npm run check:utf8
```

If the repository’s `deploy:gate` script is only a local command and does not itself trigger GitHub deployment, it may be used as preflight; do not dispatch the GitHub `Greenfield Deploy Gate` workflow without user authorization.

- [ ] **Step 5: Audit final diff against base**

Confirm:
- no Vault/persistence/schema/crypto changes unless explicitly required by a proven defect;
- no product/SKU identity added;
- no Calendar cancellation mutation of Sale/Ledger truth;
- popup handler duplication absent;
- Shell/Home/Bottom Nav not changed except scoped CSS required by Store/Ride.

- [ ] **Step 6: Commit release closure**

```bash
git add RELEASE_MANIFEST.json sw.js .assetsignore package.json
git commit -m "chore: close store ride truth-flow release"
```

Skip unchanged files rather than creating no-op edits.

- [ ] **Step 7: Stop and report**

Report exactly:

```text
READY FOR GATE — NOT GATED
```

Include branch head SHA, changed-file audit, focused test counts, and preflight results. Do not merge or deploy.
