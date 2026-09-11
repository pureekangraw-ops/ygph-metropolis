# LIGHTHOUSE Figma → Live App Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt the owner-approved Figma product language into the real `lighthouse-next` app while preserving Auth, Home, Store, Ride, Runtime, Ledger, and Store truth.

**Architecture:** Keep `lighthouse-next` as the only live shell. Add one pure projection/view-model module between real runtime truth and DOM rendering, remove local demo truth from signed-in surfaces, render MANUAL/detail states from durable truth, then align the existing CSS/HTML with the approved Figma hierarchy. Runtime mutation bridges remain authoritative and success remains readback-verified.

**Tech Stack:** Vanilla HTML/CSS/ES modules, Node.js `node:test`, existing Greenfield Runtime modules, existing Android shared bundle staging.

**Spec:** `docs/superpowers/specs/2026-09-11-lighthouse-figma-live-adoption-design.md`

## Global Constraints

- Branch: `feat/lighthouse-real-store-20260910`; continue the existing Draft PR #125, do not merge without explicit owner authorization.
- Figma is a UI/interaction blueprint, not a second runtime or source of truth.
- Ledger remains the sole authority for cash truth.
- Store remains the sole authority for product, stock, and sale truth.
- Local storage may keep only UI/session convenience state: selected root, chat history, pending confirmation state, and current MANUAL view.
- Auth, Home, Store, Ride, runtime-gate, runtime-ledger, and runtime-store must remain functional.
- Never show invented sample money, stock, appointment, or sale values when real truth is absent.
- Mutation success is shown only after durable readback verifies the expected result.
- No fake Backup / Restore / Version action may be added.
- No framework/component-library migration is in scope.
- Keep UTF-8 Thai copy intact.

---

## File Map

- Create `lighthouse-next/live-view-model.mjs` — pure `READY` / `EMPTY` / `UNAVAILABLE` projections for Ledger, Finance, and Store reads.
- Modify `lighthouse-next/app.mjs` — consume projections, delete local demo truth/reversal paths, render real MANUAL/detail summaries, expose explicit committing state.
- Modify `lighthouse-next/index.html` — add stable summary hooks to MANUAL cards; preserve the four live root destinations and real Settings actions.
- Modify `lighthouse-next/owner-polish.css` — align semantic color roles and restrained active-nav/card states with approved Figma.
- Modify `scripts/stage-lighthouse-next-bundle.mjs` — stage the new view model plus all current runtime Store dependencies imported by the live app.
- Modify `package.json` — syntax-check the new live module and current Store bridge/parser modules.
- Create `tests/greenfield-lighthouse-live-view-model.test.cjs` — unit tests for projections.
- Create `tests/greenfield-lighthouse-live-adoption.test.cjs` — structural/runtime-truth regression contract for the adopted live UI.
- Modify `tests/greenfield-lighthouse-finance-shared-truth.test.cjs` — remove stale demo-obligation assumptions.
- Modify `tests/greenfield-lighthouse-next-demo.test.cjs` — remove stale assertions that expect demo Store/local transaction authority.
- Modify `tests/greenfield-lighthouse-figma-polish-sweep.test.cjs` — assert final semantic visual roles.
- Modify `android-shell/test/lighthouse-next-package.test.mjs` — prove all imported LIGHTHOUSE modules are packaged byte-identically.

---

### Task 1: Add Pure Live Truth Projections

**Files:**
- Create: `lighthouse-next/live-view-model.mjs`
- Create: `tests/greenfield-lighthouse-live-view-model.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: the existing shapes returned by `runtime-ledger.mjs::readLedgerTruth()` and `runtime-store.mjs::readStoreTruth()`.
- Produces:
  - `READ_STATUS` with exact values `READY`, `EMPTY`, `UNAVAILABLE`.
  - `projectFinanceView(ledgerTruth)`.
  - `projectLedgerView(ledgerTruth)`.
  - `projectStoreView(storeTruth)`.
  - `projectUnavailableView(reason)`.

- [ ] **Step 1: Write the failing projection tests**

Create `tests/greenfield-lighthouse-live-view-model.test.cjs` with focused assertions like:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const moduleUrl = pathToFileURL(path.join(process.cwd(), 'lighthouse-next/live-view-model.mjs')).href;

test('finance projection is unavailable without Ledger truth and ready with real Ledger truth', async () => {
  const { READ_STATUS, projectFinanceView } = await import(moduleUrl);
  assert.deepEqual(projectFinanceView(null), {
    status: READ_STATUS.UNAVAILABLE,
    balanceSatang: null,
    todayInSatang: null,
    todayOutSatang: null,
    netSatang: null,
  });
  assert.deepEqual(projectFinanceView({
    balanceSatang: 240700,
    todayInSatang: 5000,
    todayOutSatang: 1200,
    netSatang: 3800,
  }), {
    status: READ_STATUS.READY,
    balanceSatang: 240700,
    todayInSatang: 5000,
    todayOutSatang: 1200,
    netSatang: 3800,
  });
});

test('Ledger distinguishes EMPTY from READY while preserving durable transaction order', async () => {
  const { READ_STATUS, projectLedgerView } = await import(moduleUrl);
  assert.equal(projectLedgerView({ transactions: [] }).status, READ_STATUS.EMPTY);
  const latest = { recordId: 'TX-2', direction: 'IN', amountSatang: 5000, title: 'ทิป' };
  const view = projectLedgerView({ transactions: [latest, { recordId: 'TX-1' }] });
  assert.equal(view.status, READ_STATUS.READY);
  assert.equal(view.latest, latest);
  assert.equal(view.transactions.length, 2);
});

test('Store distinguishes EMPTY from READY and reports real inventory totals only', async () => {
  const { READ_STATUS, projectStoreView } = await import(moduleUrl);
  assert.equal(projectStoreView(null).status, READ_STATUS.UNAVAILABLE);
  assert.equal(projectStoreView({ products: [], legacyUnassignedQuantity: 0 }).status, READ_STATUS.EMPTY);
  const view = projectStoreView({
    products: [{ productId: 'P1', quantity: 2 }, { productId: 'P2', quantity: 3 }],
    legacyUnassignedQuantity: 4,
  });
  assert.equal(view.status, READ_STATUS.READY);
  assert.equal(view.productCount, 2);
  assert.equal(view.namedQuantity, 5);
  assert.equal(view.legacyUnassignedQuantity, 4);
});
```

- [ ] **Step 2: Run the new test to verify RED**

Run:

```bash
node --test tests/greenfield-lighthouse-live-view-model.test.cjs
```

Expected: FAIL because `lighthouse-next/live-view-model.mjs` does not exist.

- [ ] **Step 3: Implement the minimal pure projection module**

Create `lighthouse-next/live-view-model.mjs`:

```js
export const READ_STATUS = Object.freeze({
  READY: 'READY',
  EMPTY: 'EMPTY',
  UNAVAILABLE: 'UNAVAILABLE',
});

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function projectFinanceView(ledgerTruth) {
  if (!ledgerTruth) {
    return Object.freeze({
      status: READ_STATUS.UNAVAILABLE,
      balanceSatang: null,
      todayInSatang: null,
      todayOutSatang: null,
      netSatang: null,
    });
  }
  return Object.freeze({
    status: READ_STATUS.READY,
    balanceSatang: finiteOrNull(ledgerTruth.balanceSatang),
    todayInSatang: finiteOrNull(ledgerTruth.todayInSatang),
    todayOutSatang: finiteOrNull(ledgerTruth.todayOutSatang),
    netSatang: finiteOrNull(ledgerTruth.netSatang),
  });
}

export function projectLedgerView(ledgerTruth) {
  if (!ledgerTruth) return Object.freeze({ status: READ_STATUS.UNAVAILABLE, transactions: Object.freeze([]), latest: null });
  const transactions = Array.isArray(ledgerTruth.transactions) ? [...ledgerTruth.transactions] : [];
  return Object.freeze({
    status: transactions.length ? READ_STATUS.READY : READ_STATUS.EMPTY,
    transactions: Object.freeze(transactions),
    latest: transactions[0] || null,
  });
}

export function projectStoreView(storeTruth) {
  if (!storeTruth) {
    return Object.freeze({
      status: READ_STATUS.UNAVAILABLE,
      products: Object.freeze([]),
      productCount: 0,
      namedQuantity: 0,
      legacyUnassignedQuantity: 0,
    });
  }
  const products = Array.isArray(storeTruth.products) ? [...storeTruth.products] : [];
  const namedQuantity = products.reduce((sum, product) => sum + Number(product.quantity || 0), 0);
  const legacyUnassignedQuantity = Number(storeTruth.legacyUnassignedQuantity || 0);
  return Object.freeze({
    status: products.length || legacyUnassignedQuantity > 0 ? READ_STATUS.READY : READ_STATUS.EMPTY,
    products: Object.freeze(products),
    productCount: products.length,
    namedQuantity,
    legacyUnassignedQuantity,
  });
}

export function projectUnavailableView(reason) {
  return Object.freeze({ status: READ_STATUS.UNAVAILABLE, reason: String(reason || 'NOT_CONNECTED') });
}
```

Add `node --check lighthouse-next/live-view-model.mjs` to `check:syntax` in `package.json`.

- [ ] **Step 4: Run focused tests and syntax**

```bash
node --test tests/greenfield-lighthouse-live-view-model.test.cjs
node --check lighthouse-next/live-view-model.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lighthouse-next/live-view-model.mjs tests/greenfield-lighthouse-live-view-model.test.cjs package.json
git commit -m "feat: add LIGHTHOUSE live truth projections"
```

---

### Task 2: Remove Local Demo Truth From the Signed-In App

**Files:**
- Modify: `lighthouse-next/app.mjs`
- Create: `tests/greenfield-lighthouse-live-adoption.test.cjs`
- Modify: `tests/greenfield-lighthouse-finance-shared-truth.test.cjs`
- Modify: `tests/greenfield-lighthouse-next-demo.test.cjs`

**Interfaces:**
- Consumes: `projectFinanceView`, `projectLedgerView`, `projectStoreView`, `projectUnavailableView` from Task 1.
- Produces: local state containing UI-only fields; real finance/store rendering cannot fall back to `state.cash`, `state.products`, `state.transactions`, or demo obligations.

- [ ] **Step 1: Add RED structural tests proving demo truth is gone**

Create/extend `tests/greenfield-lighthouse-live-adoption.test.cjs`:

```js
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const app = () => fs.readFileSync(path.join(process.cwd(), 'lighthouse-next/app.mjs'), 'utf8');

function functionBody(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `missing ${name}`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : source.length;
  assert.notEqual(end, -1, `missing ${nextName}`);
  return source.slice(start, end);
}

test('local state stores presentation state only and does not rehydrate old demo truth', () => {
  const source = app();
  assert.doesNotMatch(source, /const DEFAULT_PRODUCTS\b/);
  assert.doesNotMatch(source, /const DEFAULT_OBLIGATIONS\b/);
  const load = functionBody(source, 'loadState', 'saveState');
  const save = functionBody(source, 'saveState', 'formatBaht');
  for (const forbidden of ['products', 'obligations', 'transactions', 'cash', 'expectedIncome', 'todayIncome', 'todayExpense']) {
    assert.doesNotMatch(load, new RegExp(`\\b${forbidden}\\b`));
    assert.doesNotMatch(save, new RegExp(`\\b${forbidden}\\b`));
  }
});

test('signed-in finance Store Calendar and Ledger surfaces do not read local demo authority', () => {
  const source = app();
  for (const pattern of [/state\.products/, /state\.transactions/, /state\.cash/, /state\.todayIncome/, /state\.todayExpense/, /state\.obligations/]) {
    assert.doesNotMatch(source, pattern);
  }
  assert.match(source, /projectFinanceView\(ledgerTruth\)/);
  assert.match(source, /projectStoreView\(storeTruth\)/);
  assert.match(source, /projectLedgerView\(ledgerTruth\)/);
});

test('legacy local sale reversal path is removed instead of mutating fake cash and stock', () => {
  const source = app();
  assert.doesNotMatch(source, /function confirmSaleReversal\(/);
  assert.doesNotMatch(source, /function requestSaleReversal\(/);
  assert.doesNotMatch(source, /reversalOf/);
});
```

Update the stale finance test so Calendar no longer expects `DEFAULT_OBLIGATIONS` or `state.obligations`. Replace that assertion with a contract that Calendar renders a truthful unavailable/empty state until a real calendar authority exists.

Update `greenfield-lighthouse-next-demo.test.cjs` so it no longer expects MANUAL Store to use `state.products`, no longer expects local `transactions`, and no longer requires the old fake sale-reversal path.

- [ ] **Step 2: Run the focused contracts to verify RED**

```bash
node --test \
  tests/greenfield-lighthouse-live-adoption.test.cjs \
  tests/greenfield-lighthouse-finance-shared-truth.test.cjs \
  tests/greenfield-lighthouse-next-demo.test.cjs \
  tests/greenfield-lighthouse-real-store.test.cjs
```

Expected: the new truth-cleanup assertions FAIL against current `app.mjs`; real Store bridge tests remain useful guards.

- [ ] **Step 3: Replace the local state model and delete demo mutation paths**

At the top of `app.mjs`, import the projection module:

```js
import {
  READ_STATUS,
  projectFinanceView,
  projectLedgerView,
  projectStoreView,
  projectUnavailableView,
} from './live-view-model.mjs';
```

Replace demo defaults with UI-only defaults:

```js
const DEFAULT_STATE = Object.freeze({
  activeRoot: 'home',
  chatHistory: [],
  pendingFlow: null,
  manualView: null,
});

function cloneDefaults() {
  return { activeRoot: 'home', chatHistory: [], pendingFlow: null, manualView: null };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefaults();
    const parsed = JSON.parse(raw);
    return {
      activeRoot: ['home', 'chat', 'manual', 'settings'].includes(parsed.activeRoot) ? parsed.activeRoot : 'home',
      chatHistory: Array.isArray(parsed.chatHistory) ? parsed.chatHistory.slice(-80) : [],
      pendingFlow: normalizeStoredPending(parsed.pendingFlow),
      manualView: typeof parsed.manualView === 'string' ? parsed.manualView : null,
    };
  } catch {
    return cloneDefaults();
  }
}

function saveState() {
  const snapshot = {
    activeRoot: ['home', 'chat', 'manual', 'settings'].includes(state.activeRoot) ? state.activeRoot : 'home',
    chatHistory: state.chatHistory.slice(-80),
    pendingFlow: state.pendingFlow,
    manualView: state.manualView,
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch {}
}
```

Delete `DEFAULT_PRODUCTS`, `DEFAULT_OBLIGATIONS`, `freshProducts`, `freshObligations`, demo normalization helpers, local transaction helpers, and the local sale reversal/dialog functions. Keep the real Store/Ledger mutation functions unchanged except for rendering hooks.

Change `financeSnapshot()` to delegate to real Ledger truth only:

```js
function financeSnapshot() {
  return projectFinanceView(ledgerTruth);
}
```

For Calendar and Ride, use truthful unavailable state rather than `0` or fake obligations until a real runtime contract exists.

- [ ] **Step 4: Run focused tests**

```bash
node --test \
  tests/greenfield-lighthouse-live-adoption.test.cjs \
  tests/greenfield-lighthouse-finance-shared-truth.test.cjs \
  tests/greenfield-lighthouse-next-demo.test.cjs \
  tests/greenfield-lighthouse-real-store.test.cjs \
  tests/greenfield-lighthouse-real-income.test.cjs
```

Expected: PASS, including existing real Store/Income readback contracts.

- [ ] **Step 5: Commit**

```bash
git add lighthouse-next/app.mjs tests/greenfield-lighthouse-live-adoption.test.cjs tests/greenfield-lighthouse-finance-shared-truth.test.cjs tests/greenfield-lighthouse-next-demo.test.cjs
git commit -m "refactor: remove LIGHTHOUSE demo truth from live UI"
```

---

### Task 3: Make MANUAL a Real Summary Hub

**Files:**
- Modify: `lighthouse-next/index.html`
- Modify: `lighthouse-next/app.mjs`
- Modify: `tests/greenfield-lighthouse-live-adoption.test.cjs`

**Interfaces:**
- Consumes: Finance/Store/Ledger projections from Task 1 and durable `ledgerTruth` / `storeTruth`.
- Produces: five MANUAL cards with real summaries or explicit unavailable/empty copy; no second data store.

- [ ] **Step 1: Add RED tests for stable MANUAL summary hooks and real-source rendering**

Add assertions:

```js
test('MANUAL cards expose stable summary hooks for real view-model rendering', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'lighthouse-next/index.html'), 'utf8');
  for (const id of ['finance', 'store', 'ride', 'calendar', 'ledger']) {
    assert.match(html, new RegExp(`data-manual-summary=["']${id}["']`));
  }
});

test('MANUAL summaries are refreshed from real Ledger and Store projections', () => {
  const source = app();
  assert.match(source, /function renderManualSummaries\(/);
  assert.match(source, /projectFinanceView\(ledgerTruth\)/);
  assert.match(source, /projectStoreView\(storeTruth\)/);
  assert.match(source, /projectLedgerView\(ledgerTruth\)/);
  assert.match(source, /renderManualSummaries\(\)/);
});
```

- [ ] **Step 2: Run test to verify RED**

```bash
node --test tests/greenfield-lighthouse-live-adoption.test.cjs
```

Expected: FAIL because the hooks and renderer do not exist yet.

- [ ] **Step 3: Add hooks and renderer**

In each MANUAL card in `index.html`, replace the explanatory `<small>` with a stable summary hook while keeping the card title and button behavior. Example:

```html
<button type="button" class="task-card" data-task="finance">
  ...
  <span><strong>การเงิน</strong><small data-manual-summary="finance">กำลังอ่านข้อมูล…</small></span>
  <b>›</b>
</button>
```

Use the same pattern for `store`, `ride`, `calendar`, and `ledger`.

In `app.mjs`, add:

```js
const manualSummaryNodes = Object.fromEntries(
  [...root.querySelectorAll('[data-manual-summary]')].map(node => [node.dataset.manualSummary, node]),
);

function latestLedgerSummary(transaction) {
  if (!transaction) return 'ยังไม่มีรายการ';
  const title = transaction.title || 'รายการเงิน';
  const direction = transaction.direction === 'OUT' ? '-' : '+';
  return `ล่าสุด ${direction}${formatSatang(transaction.amountSatang)} · ${title}`;
}

function renderManualSummaries() {
  const finance = projectFinanceView(ledgerTruth);
  const store = projectStoreView(storeTruth);
  const ledger = projectLedgerView(ledgerTruth);

  manualSummaryNodes.finance.textContent = finance.status === READ_STATUS.READY
    ? `รับ ${formatSatang(finance.todayInSatang)} · จ่าย ${formatSatang(finance.todayOutSatang)}`
    : 'ยังอ่านข้อมูลการเงินไม่ได้';
  manualSummaryNodes.store.textContent = store.status === READ_STATUS.UNAVAILABLE
    ? 'ยังอ่านข้อมูลร้านค้าไม่ได้'
    : store.status === READ_STATUS.EMPTY
      ? 'ยังไม่มีสินค้า'
      : `${store.productCount} สินค้า · คงเหลือ ${store.namedQuantity} ชิ้น`;
  manualSummaryNodes.ride.textContent = 'ยังไม่เชื่อมข้อมูลจริง';
  manualSummaryNodes.calendar.textContent = 'ยังไม่เชื่อมข้อมูลจริง';
  manualSummaryNodes.ledger.textContent = ledger.status === READ_STATUS.UNAVAILABLE
    ? 'ยังอ่านรายการเงินจริงไม่ได้'
    : latestLedgerSummary(ledger.latest);
}
```

Call `renderManualSummaries()` after successful login/show, when MANUAL opens, and from `refreshTruthSurfaces()` after any verified mutation.

- [ ] **Step 4: Run focused UI truth tests**

```bash
node --test \
  tests/greenfield-lighthouse-live-adoption.test.cjs \
  tests/greenfield-lighthouse-real-store.test.cjs \
  tests/greenfield-lighthouse-real-income.test.cjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lighthouse-next/index.html lighthouse-next/app.mjs tests/greenfield-lighthouse-live-adoption.test.cjs
git commit -m "feat: render real MANUAL summaries"
```

---

### Task 4: Give Finance, Store, Calendar, Ride, and Ledger Explicit Read States

**Files:**
- Modify: `lighthouse-next/app.mjs`
- Modify: `tests/greenfield-lighthouse-live-adoption.test.cjs`

**Interfaces:**
- Consumes: projections and the existing `makeDetailHero` / `makeDetailRow` rendering path.
- Produces: dynamic detail rows with semantic `data-tone` values and truthful READY/EMPTY/UNAVAILABLE copy.

- [ ] **Step 1: Add RED detail-state tests**

Add assertions that the renderer uses projection statuses and never inserts fake zero values for unavailable Ride/Calendar:

```js
test('detail renderers branch on real read status instead of fake zero/default values', () => {
  const source = app();
  assert.match(source, /function renderFinanceDetail\([\s\S]*READ_STATUS\.READY/);
  assert.match(source, /function renderStoreDetail\([\s\S]*READ_STATUS\.UNAVAILABLE/);
  assert.match(source, /function renderHistoryDetail\([\s\S]*READ_STATUS\.EMPTY/);
  assert.match(source, /function renderCalendarDetail\([\s\S]*ยังไม่เชื่อมข้อมูลจริง/u);
  assert.doesNotMatch(source, /ride:\s*\{[\s\S]*\['รายได้วันนี้','฿0'\]/u);
});
```

- [ ] **Step 2: Run test to verify RED**

```bash
node --test tests/greenfield-lighthouse-live-adoption.test.cjs
```

Expected: FAIL on current static detail paths.

- [ ] **Step 3: Implement semantic detail rows and truthful states**

Extend `makeDetailRow`:

```js
function makeDetailRow(label, value, tone = 'neutral') {
  const row = document.createElement('div');
  row.className = 'detail-row';
  row.dataset.tone = tone;
  const left = document.createElement('span');
  left.textContent = label;
  const right = document.createElement('strong');
  right.textContent = value;
  row.append(left, right);
  return row;
}
```

Render Finance from real truth only:

```js
function renderFinanceDetail() {
  const data = manualContent.finance;
  const view = projectFinanceView(ledgerTruth);
  if (view.status !== READ_STATUS.READY) {
    return renderStaticDetail(data, [['สถานะ', 'ยังอ่านข้อมูลการเงินจริงไม่ได้', 'system']]);
  }
  const rows = [
    ['เงินจริง', formatSatang(view.balanceSatang), 'system'],
    ['เงินเข้าวันนี้', formatSatang(view.todayInSatang), 'income'],
    ['เงินออกวันนี้', formatSatang(view.todayOutSatang), 'outcome'],
    ['สุทธิ', `${view.netSatang >= 0 ? '+' : '-'}${formatSatang(Math.abs(view.netSatang))}`, 'net'],
  ];
  renderStaticDetail(data, rows);
}
```

Update `renderStaticDetail` to accept `[label, value, tone]` tuples.

For Store, use `projectStoreView(storeTruth)`: UNAVAILABLE → `ยังอ่านข้อมูลร้านค้าไม่ได้`; EMPTY → `ยังไม่มีสินค้า`; READY → render durable Product identity/quantity plus legacy-unassigned stock separately.

For Ledger, use `projectLedgerView(ledgerTruth)`: UNAVAILABLE → `ยังอ่านรายการเงินจริงไม่ได้`; EMPTY → `ยังไม่มีรายการ`; READY → current durable transaction list.

For Calendar and Ride, render `ยังไม่เชื่อมข้อมูลจริง` without `0 บาท`, fake dates, or fake obligations until real authorities are connected.

- [ ] **Step 4: Run focused tests**

```bash
node --test \
  tests/greenfield-lighthouse-live-adoption.test.cjs \
  tests/greenfield-lighthouse-real-store.test.cjs \
  tests/greenfield-lighthouse-finance-shared-truth.test.cjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lighthouse-next/app.mjs tests/greenfield-lighthouse-live-adoption.test.cjs
git commit -m "feat: add truthful LIGHTHOUSE read states"
```

---

### Task 5: Align the Live Visual Roles With the Approved Figma Language

**Files:**
- Modify: `lighthouse-next/owner-polish.css`
- Modify: `tests/greenfield-lighthouse-figma-polish-sweep.test.cjs`
- Modify: `tests/greenfield-lighthouse-live-adoption.test.cjs`

**Interfaces:**
- Consumes: existing semantic `data-root-target` on nav controls and `data-tone` on detail rows from Task 4.
- Produces: cyan interaction/income, magenta outcome, violet system/settings/calendar, warm-gold brand/manual/primary, and restrained dark active nav pills.

- [ ] **Step 1: Add RED visual-contract assertions**

Extend the polish test to require:

```js
assert.match(css, /--magenta\s*:\s*#EC4899/i);
assert.match(css, /\.detail-row\[data-tone=["']income["']\][\s\S]*var\(--cyan\)/i);
assert.match(css, /\.detail-row\[data-tone=["']outcome["']\][\s\S]*var\(--magenta\)/i);
assert.match(css, /\.nav-item\[data-root-target=["']chat["']\.active[\s\S]*var\(--cyan\)/i);
assert.match(css, /\.nav-item\[data-root-target=["']manual["']\.active[\s\S]*var\(--gold\)/i);
assert.match(css, /\.nav-item\[data-root-target=["']settings["']\.active[\s\S]*var\(--violet\)/i);
```

Also assert the generic active nav background remains dark rather than a saturated solid block.

- [ ] **Step 2: Run visual test to verify RED**

```bash
node --test tests/greenfield-lighthouse-figma-polish-sweep.test.cjs
```

Expected: FAIL because magenta/data-tone/nav-role rules are absent.

- [ ] **Step 3: Add the semantic Figma role styles**

Add to `:root`:

```css
--magenta: #EC4899;
```

Add semantic detail treatment:

```css
.detail-row[data-tone="income"] strong { color: var(--cyan); }
.detail-row[data-tone="outcome"] strong { color: var(--magenta); }
.detail-row[data-tone="net"] { border-color: rgba(245, 158, 11, .30); }
.detail-row[data-tone="system"] { border-color: rgba(139, 92, 246, .28); }
```

Replace the one-color active-nav emphasis with a restrained dark base and per-root role accents:

```css
.nav-item.active {
  background: linear-gradient(180deg, rgba(11, 24, 39, .96), rgba(6, 16, 28, .96));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .025);
}

.nav-item[data-root-target="home"].active,
.nav-item[data-root-target="manual"].active { border-color: rgba(245, 158, 11, .46); }
.nav-item[data-root-target="home"].active .nav-icon,
.nav-item[data-root-target="home"].active small,
.nav-item[data-root-target="manual"].active .nav-icon,
.nav-item[data-root-target="manual"].active small { color: var(--gold); }

.nav-item[data-root-target="chat"].active { border-color: rgba(6, 182, 212, .46); }
.nav-item[data-root-target="chat"].active .nav-icon,
.nav-item[data-root-target="chat"].active small { color: var(--cyan); }

.nav-item[data-root-target="settings"].active { border-color: rgba(139, 92, 246, .46); }
.nav-item[data-root-target="settings"].active .nav-icon,
.nav-item[data-root-target="settings"].active small { color: var(--violet); }
```

Keep existing mobile containment, fixed-nav clearance, touch targets, and owner-approved lighthouse artwork unchanged.

- [ ] **Step 4: Run all visual/mobile contracts**

```bash
node --test \
  tests/greenfield-lighthouse-figma-polish-sweep.test.cjs \
  tests/greenfield-lighthouse-live-visual-adoption.test.cjs \
  tests/greenfield-lighthouse-manual-visual-direction.test.cjs \
  tests/greenfield-lighthouse-mobile-containment.test.cjs \
  tests/greenfield-lighthouse-chat-viewport.test.cjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lighthouse-next/owner-polish.css tests/greenfield-lighthouse-figma-polish-sweep.test.cjs tests/greenfield-lighthouse-live-adoption.test.cjs
git commit -m "style: align live LIGHTHOUSE with Figma roles"
```

---

### Task 6: Make CHAT Commit State Explicit Without Weakening Readback Safety

**Files:**
- Modify: `lighthouse-next/app.mjs`
- Modify: `tests/greenfield-lighthouse-live-adoption.test.cjs`
- Verify unchanged guards in: `tests/greenfield-lighthouse-real-income.test.cjs`, `tests/greenfield-lighthouse-real-store.test.cjs`

**Interfaces:**
- Consumes: existing `realIncomeCommitBusy`, `realStoreCommitBusy`, Ledger/Store bridges.
- Produces: visible `COMMITTING` action state; verified success/failure behavior remains bridge/readback driven.

- [ ] **Step 1: Add RED CHAT state contract**

```js
test('CHAT exposes an explicit committing state and keeps verified success behind bridge readback', () => {
  const source = app();
  assert.match(source, /กำลังบันทึก…/u);
  assert.match(source, /realIncomeCommitBusy\s*\|\|\s*realStoreCommitBusy/);

  const income = functionBody(source, 'confirmGeneralIncome', 'confirmStoreProductAdd');
  assert.ok(income.indexOf('await ledgerBridge.recordOtherIncome') < income.indexOf('บันทึกแล้ว'));

  const sale = functionBody(source, 'confirmStoreSale', 'confirmPending');
  assert.ok(sale.indexOf('await storeBridge.readStoreTruth()') < sale.indexOf('บันทึกแล้ว'));
  assert.ok(sale.indexOf('await ledgerBridge.readLedgerTruth()') < sale.indexOf('บันทึกแล้ว'));
});
```

- [ ] **Step 2: Run CHAT contracts to verify RED**

```bash
node --test \
  tests/greenfield-lighthouse-live-adoption.test.cjs \
  tests/greenfield-lighthouse-real-income.test.cjs \
  tests/greenfield-lighthouse-real-store.test.cjs
```

Expected: new explicit committing-state assertion FAILS; existing readback tests remain green.

- [ ] **Step 3: Render a single disabled committing action while mutation is in flight**

At the start of `renderChatActions()`:

```js
function renderChatActions() {
  if (realIncomeCommitBusy || realStoreCommitBusy) {
    return setChatActions(['กำลังบันทึก…']);
  }
  const pending = state.pendingFlow;
  if (!pending) return setChatActions(['ทิป 59', 'เพิ่มน้ำ 6 ขวด', 'ขายมือถือ 566', 'วันนี้วันที่เท่าไร']);
  if (pending.stage === 'CONFIRM_GENERAL_INCOME' || pending.stage === 'CONFIRM_STORE_SALE' || pending.stage === 'CONFIRM_STORE_PRODUCT_ADD') {
    return setChatActions(['ยืนยัน', 'แก้ไข', 'ยกเลิก']);
  }
  setChatActions(['วันนี้วันที่เท่าไร', 'ยกเลิก']);
}
```

Do not change bridge ordering: commit/readback remains inside `confirmGeneralIncome`, `confirmStoreProductAdd`, and `confirmStoreSale`; only the presentation state changes.

- [ ] **Step 4: Run mutation contracts**

```bash
node --test \
  tests/greenfield-lighthouse-live-adoption.test.cjs \
  tests/greenfield-lighthouse-real-income.test.cjs \
  tests/greenfield-lighthouse-real-store.test.cjs \
  tests/greenfield-lighthouse-runtime-gate.test.cjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lighthouse-next/app.mjs tests/greenfield-lighthouse-live-adoption.test.cjs
git commit -m "feat: show LIGHTHOUSE committing state"
```

---

### Task 7: Package the Real Live Module Graph for Web and Android

**Files:**
- Modify: `scripts/stage-lighthouse-next-bundle.mjs`
- Modify: `android-shell/test/lighthouse-next-package.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: live files imported by `app.mjs`, including real Store bridge/parser and `live-view-model.mjs`.
- Produces: byte-identical staged files for isolated staging and Android; no missing browser module at runtime.

- [ ] **Step 1: Add RED package assertions**

In `android-shell/test/lighthouse-next-package.test.mjs`, assert these files exist after staging and match source bytes:

```js
for (const relative of [
  'runtime-store.mjs',
  'store-product.mjs',
  'store-sale.mjs',
  'live-view-model.mjs',
]) {
  assert.equal(await exists(join(stagedLighthouse, relative)), true, `${relative} must be staged`);
  assert.deepEqual(
    await readFile(join(stagedLighthouse, relative)),
    await readFile(join(repoRoot, 'lighthouse-next', relative)),
  );
}
```

Also assert `greenfield/store-products.mjs` exists in the staged Greenfield closure because `runtime-store.mjs` imports it directly.

- [ ] **Step 2: Run Android package test to verify RED**

```bash
node --test android-shell/test/lighthouse-next-package.test.mjs
```

Expected: FAIL for currently omitted Lighthouse Store/view-model files.

- [ ] **Step 3: Extend the shared staging manifest and syntax gate**

Update `LIGHTHOUSE_RUNTIME_FILES` in `scripts/stage-lighthouse-next-bundle.mjs` to contain:

```js
export const LIGHTHOUSE_RUNTIME_FILES = Object.freeze([
  'index.html',
  'styles.css',
  'owner-polish.css',
  'app.mjs',
  'runtime-gate.mjs',
  'runtime-ledger.mjs',
  'runtime-store.mjs',
  'send-control.mjs',
  'general-income.mjs',
  'store-sale.mjs',
  'store-product.mjs',
  'live-view-model.mjs',
  'bangkok-date.mjs',
  'manifest.webmanifest',
]);
```

Ensure `GREENFIELD_ENTRYPOINTS` explicitly includes `store-products.mjs` in addition to the existing runtime/session/calculation entrypoints so the direct import made by `runtime-store.mjs` is always packaged:

```js
export const GREENFIELD_ENTRYPOINTS = Object.freeze([
  'runtime.mjs',
  'runtime-session.mjs',
  'calculation-authority.mjs',
  'store-products.mjs',
]);
```

In `package.json`, add syntax checks for `lighthouse-next/runtime-store.mjs`, `lighthouse-next/store-product.mjs`, `lighthouse-next/store-sale.mjs`, and `lighthouse-next/live-view-model.mjs`.

- [ ] **Step 4: Run shared staging/package checks**

```bash
node --test android-shell/test/lighthouse-next-package.test.mjs
node --check scripts/stage-lighthouse-next-bundle.mjs
npm run check:syntax
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/stage-lighthouse-next-bundle.mjs android-shell/test/lighthouse-next-package.test.mjs package.json
git commit -m "fix: package complete LIGHTHOUSE live module graph"
```

---

### Task 8: Final Regression Gate on the Actual Head

**Files:**
- Verify all changed files from Tasks 1–7.
- No new feature file should be added in this task unless a failing gate proves a scoped fix is necessary.

**Interfaces:**
- Consumes: final branch head.
- Produces: evidence that the Figma adoption is implementation-ready and did not break real Store/Ledger/Auth/package behavior.

- [ ] **Step 1: Run the complete Greenfield test suite**

```bash
npm test
```

Expected: PASS with zero failing `greenfield-*.test.cjs` tests.

- [ ] **Step 2: Run syntax and UTF-8 gates**

```bash
npm run check:syntax
npm run check:utf8
```

Expected: PASS.

- [ ] **Step 3: Run Android shared bundle tests**

```bash
node --test android-shell/test/*.test.mjs
```

Expected: PASS, including byte-identical LIGHTHOUSE package coverage.

- [ ] **Step 4: Re-run the critical LIGHTHOUSE contracts together**

```bash
node --test \
  tests/greenfield-lighthouse-live-view-model.test.cjs \
  tests/greenfield-lighthouse-live-adoption.test.cjs \
  tests/greenfield-lighthouse-real-income.test.cjs \
  tests/greenfield-lighthouse-real-store.test.cjs \
  tests/greenfield-lighthouse-runtime-gate.test.cjs \
  tests/greenfield-lighthouse-figma-polish-sweep.test.cjs \
  tests/greenfield-lighthouse-mobile-containment.test.cjs
```

Expected: PASS.

- [ ] **Step 5: Inspect final diff and keep PR #125 Draft**

Verify the diff contains only scoped LIGHTHOUSE adoption, staging, tests, and docs. Confirm no GO Client/Worker business behavior or unrelated Greenfield domain code was changed. Update PR #125 description/checklist with final test evidence, but keep it Draft and do not merge until the owner explicitly authorizes merge.

---

## Self-Review Result

- Spec coverage: UI shell adoption, real Ledger/Store truth, Auth preservation, MANUAL hub, READY/EMPTY/UNAVAILABLE states, explicit committing state, Figma color/navigation roles, package completeness, and final gates are each mapped to a task.
- Placeholder scan: no TBD/TODO/"implement later" steps remain.
- Interface consistency: all later tasks consume the exact projection exports defined in Task 1; `data-tone` is introduced before CSS consumes it; `live-view-model.mjs` is created before staging includes it.
- Scope check: this remains one cohesive live-UI adoption plan and does not add a new runtime authority or unrelated domain redesign.
