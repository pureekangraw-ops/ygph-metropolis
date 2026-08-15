# Action/Menu Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Store, Finance, and Calendar use one consistent city-level action entry while preserving all existing business forms, domain logic, and Ride round behavior.

**Architecture:** Extend the existing `ui/action-popups.mjs` routing layer instead of creating a second popup system. Keep city pages as inspection surfaces; one city action launcher opens a lightweight action chooser that delegates to existing task/menu/dialog handlers. Calendar removes only its work-entry select/dropdown, not field-level selects.

**Tech Stack:** HTML, CSS, native dialog, ES modules, Node test runner, service worker asset revision gate.

## Global Constraints
- Store: one `จัดการร้านค้า` launcher replaces scattered Store task launchers.
- Finance: one `จัดการการเงิน` launcher replaces scattered Finance task/menu launchers.
- Calendar: one `จัดการวันที่เลือก` launcher replaces the selected-date work-entry dropdown/select.
- Ride: preserve current active-round and credit-context action behavior unless a regression requires a minimal routing fix.
- Reuse existing forms and existing business handlers; do not clone forms.
- No business/domain/runtime/state/schema/persistence changes.
- Field-level selects remain selects.
- Native dialog focus, cancel, success, and error behavior remain intact.

---

### Task 1: Lock Unified Action-Entry Contract

**Files:**
- Create: `tests/greenfield-action-menu-hierarchy.test.cjs`
- Read: `index.html`
- Read: `ui/action-popups.mjs`

**Interfaces:**
- Consumes: existing form IDs `saleForm`, `purchaseForm`, `withdrawForm`, `adjustForm`, `incomeForm`, `expenseForm`, `obligationForm` and existing popup module.
- Produces: regression assertions for city-level launchers and Calendar dropdown removal.

- [ ] **Step 1: Write the failing regression test**

Create a Node test that reads `index.html` and `ui/action-popups.mjs` and asserts:

```js
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const html = fs.readFileSync('index.html', 'utf8');
const popup = fs.readFileSync('ui/action-popups.mjs', 'utf8');

const count = (text, pattern) => (text.match(pattern) || []).length;

test('Store and Finance expose one city action launcher and Calendar uses a popup action entry', () => {
  assert.match(popup, /'store-actions':\s*\{[^}]*label:'จัดการร้านค้า'/s);
  assert.match(popup, /'finance-actions':\s*\{[^}]*label:'จัดการการเงิน'/s);
  assert.match(popup, /'calendar-actions':\s*\{[^}]*label:'จัดการวันที่เลือก'/s);
  assert.equal(count(popup, /data-city-action-open/g), 1);
  assert.doesNotMatch(html, /<select[^>]*(calendar|selected|action)[^>]*>/i);
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

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test tests/greenfield-action-menu-hierarchy.test.cjs`
Expected: FAIL because city action routing and Calendar popup action entry are not yet present.

- [ ] **Step 3: Commit the RED test**

```bash
git add tests/greenfield-action-menu-hierarchy.test.cjs
git commit -m "test: lock city action menu hierarchy"
```

### Task 2: Add City Action Chooser to Existing Popup Layer

**Files:**
- Modify: `ui/action-popups.mjs`
- Test: `tests/greenfield-action-menu-hierarchy.test.cjs`

**Interfaces:**
- Consumes: existing `TASKS`, `MENUS`, `openTaskDialog(task)`, `openMenuDialog(menu)`.
- Produces: `CITY_ACTIONS` configuration and `openCityActionDialog(city)` routing.

- [ ] **Step 1: Add city action configuration**

Add a frozen map with exact entries:

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
  'calendar-actions': {
    label:'จัดการวันที่เลือก',
    actions:[],
  },
});
```

- [ ] **Step 2: Create one city action chooser dialog**

Build one native `dialog` appended to `workspace` with a title, close button, and action list. Each generated action button sets `data-city-action-choice` and delegates by `kind`:

```js
function runCityAction(action) {
  closeCityActionDialog();
  if (action.kind === 'task') openTaskDialog(action.key);
  if (action.kind === 'menu') openMenuDialog(action.key);
}
```

Do not duplicate validation or submit handling.

- [ ] **Step 3: Add one launcher factory**

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

- [ ] **Step 4: Collapse Store and Finance launchers into one launcher each**

After existing task/menu extraction has collected and moved forms/panes, find the current Store and Finance launcher regions and replace their scattered launchers with `makeCityActionLauncher('store-actions', 'จัดการร้านค้า')` and `makeCityActionLauncher('finance-actions', 'จัดการการเงิน')`. Keep inspection links that are true reading/navigation links.

- [ ] **Step 5: Keep Ride routing unchanged**

Do not wrap `ride-job`, `ride-expense`, or `ride-withdraw` into a city-wide chooser. Their visibility remains controlled by active-round/credit state.

- [ ] **Step 6: Run focused test**

Run: `node --test tests/greenfield-action-menu-hierarchy.test.cjs`
Expected: Store/Finance assertions PASS; Calendar entry may still FAIL until Task 3.

### Task 3: Replace Calendar Work-Entry Dropdown with Popup Launcher

**Files:**
- Modify: `index.html`
- Modify: `ui/action-popups.mjs`
- Test: `tests/greenfield-action-menu-hierarchy.test.cjs`

**Interfaces:**
- Consumes: existing selected-date Calendar controls and handlers in the current DOM/UI layer.
- Produces: one `จัดการวันที่เลือก` launcher and dynamically routed existing Calendar actions.

- [ ] **Step 1: Identify the selected-date work-entry select**

Locate the Calendar control whose purpose is to choose a work action for the selected date. Preserve any select used as a field value inside a form.

- [ ] **Step 2: Replace only that work-entry select with a button anchor**

Use exact markup:

```html
<button id="calendarActionBtn" type="button" class="primary-action city-action-launcher" data-city-action-open="calendar-actions" aria-controls="cityActionDialog">จัดการวันที่เลือก</button>
```

- [ ] **Step 3: Populate Calendar chooser from existing selected-date action buttons/handlers**

When opening `calendar-actions`, inspect the existing selected-date action controls that are currently enabled/visible for the selected date and mirror them as chooser buttons by delegation, not by reimplementing workflows. The chooser button should call `.click()` on the authoritative existing control or invoke the existing UI routing function already bound to that control.

- [ ] **Step 4: Keep Calendar lifecycle semantics unchanged**

Do not alter payment, edit, reschedule, cancel, completion, OPEN/PARTIAL gating, or selected-date calculations.

- [ ] **Step 5: Run focused test and confirm GREEN**

Run: `node --test tests/greenfield-action-menu-hierarchy.test.cjs`
Expected: PASS.

### Task 4: Visual/Responsive Support and Full Regression

**Files:**
- Modify: `styles.css` only if the new chooser needs spacing/layout rules.
- Modify: `RELEASE_MANIFEST.json`
- Modify: `sw.js`

**Interfaces:**
- Consumes: city action launcher/dialog classes.
- Produces: mobile-safe chooser and matching production asset revision.

- [ ] **Step 1: Add minimal chooser styling if needed**

Use existing tokens. Required behavior: full-width action choices on mobile, at least 44px touch height, no new navigation rail.

- [ ] **Step 2: Run full deploy gate before revision update**

Run: `npm run deploy:gate`
Expected: functional tests pass; asset revision gate may fail with an exact new revision because `index.html`, `ui/action-popups.mjs`, or `styles.css` changed.

- [ ] **Step 3: Update release asset revision exactly from gate output**

Set the exact new `serviceWorker.assetRevision` in `RELEASE_MANIFEST.json` and the matching cache identity/revision in `sw.js`. Do not change domain/release authority fields.

- [ ] **Step 4: Run full verification again**

Run: `npm run deploy:gate`
Expected: all Greenfield tests, syntax, UTF-8, publication allowlist, and asset revision checks PASS.

- [ ] **Step 5: Confirm diff scope**

Run: `git diff --name-only main...HEAD`
Expected production source changes limited to `index.html`, `ui/action-popups.mjs`, optionally `styles.css`, `RELEASE_MANIFEST.json`, and `sw.js`; no `greenfield/*.mjs` or business/runtime files.

### Task 5: Review, Merge, and Production Deploy

**Files:**
- No source changes unless verification exposes a defect inside this pass.

**Interfaces:**
- Consumes: verified branch head.
- Produces: production action-menu hierarchy pass.

- [ ] **Step 1: Open/ready PR and inspect diff/review threads**

Require no unresolved review threads and `mergeable=true`.

- [ ] **Step 2: Merge using the verified head SHA**

Do not merge if branch head moved after the green gate.

- [ ] **Step 3: Follow `main` production workflow through completion**

Expected: Greenfield safety gate PASS, then Cloudflare deploy PASS.

- [ ] **Step 4: Record production evidence**

Record merge SHA, workflow run number, changed deployed assets, and Cloudflare Version ID. Direct HTTP readback is UNKNOWN if unavailable from the tool network; do not call it FAIL.
