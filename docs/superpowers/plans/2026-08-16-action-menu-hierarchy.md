# Action/Menu Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Store and Finance use one consistent city-level action entry while preserving Calendar filtering, all existing business forms, domain logic, and Ride round behavior.

**Architecture:** Extend the existing `ui/action-popups.mjs` routing layer instead of creating a second popup system. Keep city pages as inspection surfaces; one city action launcher opens a lightweight action chooser that delegates to existing task/menu/dialog handlers. Calendar `calendarFilter` remains untouched because current evidence proves it is a status filter, not navigation.

**Tech Stack:** HTML, CSS, native dialog, ES modules, Node test runner, service worker asset revision gate.

## Global Constraints
- Store: one `จัดการร้านค้า` launcher replaces scattered Store task launchers.
- Finance: one `จัดการการเงิน` launcher replaces scattered Finance task/menu launchers.
- Calendar: preserve `calendarFilter` exactly as filtering UI; do not reinterpret it as navigation.
- Ride: preserve current active-round and credit-context action behavior.
- Reuse existing forms and handlers; do not clone forms.
- No business/domain/runtime/state/schema/persistence changes.
- Field-level selects and filters remain selects.
- Native dialog focus, cancel, success, and error behavior remain intact.

---

### Task 1: Lock Unified Action-Entry Contract

**Files:**
- Create: `tests/greenfield-action-menu-hierarchy.test.cjs`
- Read: `index.html`
- Read: `ui/action-popups.mjs`

**Interfaces:**
- Consumes: existing form IDs `saleForm`, `purchaseForm`, `withdrawForm`, `adjustForm`, `incomeForm`, `expenseForm`, `obligationForm`, `calendarFilter`, and existing popup routing.
- Produces: regression assertions for Store/Finance city launchers, preserved Calendar filtering, and unchanged Ride task routing.

- [ ] **Step 1: Write the failing regression test**

```js
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const html = fs.readFileSync('index.html', 'utf8');
const popup = fs.readFileSync('ui/action-popups.mjs', 'utf8');
const count = (text, pattern) => (text.match(pattern) || []).length;

test('Store and Finance expose unified city action launchers while Calendar remains a filter', () => {
  assert.match(popup, /'store-actions':\s*\{[^}]*label:'จัดการร้านค้า'/s);
  assert.match(popup, /'finance-actions':\s*\{[^}]*label:'จัดการการเงิน'/s);
  assert.match(popup, /dataset\.cityActionOpen/);
  assert.match(html, /id="calendarFilter"[^>]*aria-label="กรองสถานะ"/);
});

test('existing business forms remain single-instance and Ride task routing stays present', () => {
  for (const id of ['saleForm','purchaseForm','withdrawForm','adjustForm','incomeForm','expenseForm','obligationForm']) {
    assert.equal(count(html, new RegExp(`id=["']${id}["']`, 'g')), 1, `${id} must exist once`);
  }
  assert.match(popup, /'ride-job'/);
  assert.match(popup, /'ride-expense'/);
  assert.match(popup, /'ride-withdraw'/);
});
```

- [ ] **Step 2: Run and confirm RED**

Run: `node --test tests/greenfield-action-menu-hierarchy.test.cjs`
Expected: FAIL because Store/Finance city action routing does not exist yet.

- [ ] **Step 3: Commit RED test**

```bash
git add tests/greenfield-action-menu-hierarchy.test.cjs
git commit -m "test: lock city action menu hierarchy"
```

### Task 2: Add City Action Chooser to Existing Popup Layer

**Files:**
- Modify: `ui/action-popups.mjs`
- Test: `tests/greenfield-action-menu-hierarchy.test.cjs`

**Interfaces:**
- Consumes: existing `TASKS`, `MENUS`, `openTaskDialog(task)`, and `openMenuDialog(menu)`.
- Produces: `CITY_ACTIONS` configuration, one chooser dialog, and Store/Finance unified launchers.

- [ ] **Step 1: Add exact city action configuration**

```js
const CITY_ACTIONS = Object.freeze({
  'store-actions': {
    label:'จัดการร้านค้า',
    actions:[
      { kind:'task', key:'sale', label:'ขายสินค้า', primary:true },
      { kind:'task', key:'purchase', label:'รับสินค้าเข้า' },
      { kind:'task', key:'withdraw', label:'เบิกสินค้า' },
      { kind:'task', key:'adjust', label:'ปรับสต็อก' },
    ],
  },
  'finance-actions': {
    label:'จัดการการเงิน',
    actions:[
      { kind:'task', key:'income', label:'บันทึกรายรับอื่น' },
      { kind:'task', key:'expense', label:'เพิ่มรายจ่าย' },
      { kind:'task', key:'obligation', label:'เพิ่มภาระ' },
      { kind:'menu', key:'finance-obligations', label:'ภาระคงเหลือ' },
      { kind:'menu', key:'finance-ledger', label:'ประวัติเงินจริง' },
    ],
  },
});
```

- [ ] **Step 2: Create one native chooser dialog**

Build one `dialog` appended to `workspace`, with title, close button, and generated action buttons. Delegate only:

```js
function runCityAction(action) {
  closeCityActionDialog();
  if (action.kind === 'task') openTaskDialog(action.key);
  if (action.kind === 'menu') openMenuDialog(action.key);
}
```

- [ ] **Step 3: Add launcher factory**

```js
function makeCityActionLauncher(city, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.cityActionOpen = city;
  button.className = 'primary-action city-action-launcher';
  button.textContent = label;
  button.setAttribute('aria-controls', 'cityActionDialog');
  return button;
}
```

- [ ] **Step 4: Replace Store scattered task launchers with one launcher**

Use the existing extracted Store tasks (`sale`, `purchase`, `withdraw`, `adjust`) and replace only their generated visible launcher region with `จัดการร้านค้า`.

- [ ] **Step 5: Replace Finance scattered task/menu launchers with one launcher**

Use existing Finance tasks (`income`, `expense`, `obligation`) plus existing menu panes (`finance-obligations`, `finance-ledger`) and replace only their generated visible launchers with `จัดการการเงิน`.

- [ ] **Step 6: Preserve Ride and Calendar untouched**

Do not change Ride round/credit routing. Do not change `calendarFilter` or Calendar lifecycle actions.

- [ ] **Step 7: Run focused test and confirm GREEN**

Run: `node --test tests/greenfield-action-menu-hierarchy.test.cjs`
Expected: PASS.

### Task 3: Visual/Responsive Support and Full Regression

**Files:**
- Modify: `styles.css` only if chooser spacing needs a minimal rule.
- Modify: `RELEASE_MANIFEST.json`
- Modify: `sw.js`

**Interfaces:**
- Consumes: city action launcher/dialog classes.
- Produces: mobile-safe chooser and matching production asset revision.

- [ ] **Step 1: Add minimal chooser styling if required**

Use existing design tokens. Action choices must be full-width on mobile and at least 44px high. Do not create a new navigation layer.

- [ ] **Step 2: Run full deploy gate before revision update**

Run: `npm run deploy:gate`
Expected: functional tests pass; asset revision gate may fail with an exact new revision because `ui/action-popups.mjs` and possibly `styles.css` changed.

- [ ] **Step 3: Update asset revision exactly from gate output**

Set `serviceWorker.assetRevision` in `RELEASE_MANIFEST.json` and the matching service-worker cache revision in `sw.js`. Do not change domain/release authority fields.

- [ ] **Step 4: Run full verification**

Run: `npm run deploy:gate`
Expected: all Greenfield tests, syntax, UTF-8, publication allowlist, and asset revision checks PASS.

- [ ] **Step 5: Confirm diff scope**

Expected production source changes limited to `ui/action-popups.mjs`, optionally `styles.css`, `RELEASE_MANIFEST.json`, and `sw.js`; `index.html`, `greenfield/*.mjs`, and runtime/business files must remain untouched.

### Task 4: Review, Merge, and Production Deploy

- [ ] **Step 1: Open/ready PR and inspect diff/review threads**
Require no unresolved review threads and `mergeable=true`.

- [ ] **Step 2: Merge using the verified head SHA**
Do not merge if branch head moved after the green gate.

- [ ] **Step 3: Follow `main` production workflow through completion**
Expected: Greenfield safety gate PASS, then Cloudflare deploy PASS.

- [ ] **Step 4: Record production evidence**
Record merge SHA, workflow run number, changed deployed assets, and Cloudflare Version ID. Direct HTTP readback is UNKNOWN if unavailable from the tool network.
