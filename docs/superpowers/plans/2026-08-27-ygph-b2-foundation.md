# YGPH B2 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the approved B2 foundation real: AI interpretation exits through an Output Gate, canonical App Language crosses to a Manual Gate that only chooses a destination, and the Manual surface reuses existing Runtime/Workflow behavior for the first vertical slice `ข้าว 65`.

**Architecture:** Add three small foundation modules with strict boundaries: `output-gate.mjs` translates validated semantic intent to canonical App Language, `manual-gate.mjs` only resolves `target` to a registered Manual area, and `manual-runtime.mjs` owns area execution against the existing Runtime. Add one B2 UI module that runs inside the already-unlocked app Runtime session and exposes AI + Manual surfaces without deleting legacy engine code. Existing STORE/RIDE/LEDGER/CALENDAR domains remain unchanged.

**Tech Stack:** Vanilla ES modules, browser DOM, Node.js 22 built-in test runner, existing Greenfield Runtime/Workflow APIs.

**Spec:** `docs/superpowers/specs/2026-08-27-ygph-ai-manual-foundation-design.md`

## Global Constraints

- Do not add INCOME or OUTCOME to `GREENFIELD_DOMAINS`.
- Output Gate answers only “can this leave as canonical App Language?”; it does not run business logic.
- Manual Gate answers only “which Manual area does this target go to?”; it does not re-interpret or re-validate business meaning.
- Runtime/domain validation remains the authority for real mutations.
- Manual areas are a registry that can be added/removed later without schema migration.
- Reuse `runtime.otherIncome()` for INCOME and `runtime.expense()` for OUTCOME.
- Keep STORE/RIDE engine code intact during Foundation.
- Do not change production Current pointer or deploy production from this branch.
- First acceptance slice is `ข้าว 65` → OUTCOME → `runtime.expense()` → LEDGER readback.

---

### Task 1: Canonical Output Gate

**Files:**
- Create: `foundation/output-gate.mjs`
- Test: `tests/greenfield-b2-output-gate.test.cjs`

**Interfaces:**
- Consumes: semantic intent returned by `/api/v1/interpret` in the existing shape `{ version, status, action, object, fields }`.
- Produces: `translateIntentToAppLanguage(intent)` returning frozen `{ version:'1', action:'CREATE', target:'OUTCOME'|'INCOME', fields:{ title, amountSatang } }` for the Foundation create slice.

- [ ] **Step 1: Write the failing tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { resolve } = require('node:path');

const load = path => import(pathToFileURL(resolve(path)).href);

test('Output Gate translates EXPENSE to canonical OUTCOME App Language', async () => {
  const { translateIntentToAppLanguage } = await load('foundation/output-gate.mjs');
  const result = translateIntentToAppLanguage({
    version:'1', status:'READY', action:'CREATE', object:'EXPENSE',
    fields:{ title:'ข้าว', amountSatang:6500, paymentMode:null, note:null },
  });
  assert.deepEqual(result, {
    version:'1', action:'CREATE', target:'OUTCOME',
    fields:{ title:'ข้าว', amountSatang:6500 },
  });
});

test('Output Gate translates OTHER_INCOME to canonical INCOME App Language', async () => {
  const { translateIntentToAppLanguage } = await load('foundation/output-gate.mjs');
  const result = translateIntentToAppLanguage({
    version:'1', status:'READY', action:'CREATE', object:'OTHER_INCOME',
    fields:{ title:'เงินคืน', amountSatang:50000, paymentMode:null, note:null },
  });
  assert.equal(result.target, 'INCOME');
  assert.equal(result.fields.amountSatang, 50000);
});

test('Output Gate stops instead of guessing unsupported meaning', async () => {
  const { translateIntentToAppLanguage } = await load('foundation/output-gate.mjs');
  assert.throws(() => translateIntentToAppLanguage({
    version:'1', status:'READY', action:'CREATE', object:'SALE',
    fields:{ title:'ขาย', amountSatang:80000, paymentMode:null, note:null },
  }), /OUTPUT_GATE_UNSUPPORTED_OBJECT:SALE/);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/greenfield-b2-output-gate.test.cjs`

Expected: FAIL because `foundation/output-gate.mjs` does not exist.

- [ ] **Step 3: Implement the minimum Output Gate**

```js
const CREATE_TARGET = Object.freeze({ EXPENSE:'OUTCOME', OTHER_INCOME:'INCOME' });

function text(value, code) {
  const output = String(value ?? '').trim();
  if (!output) throw new Error(code);
  return output;
}

function amount(value) {
  const output = Number(value);
  if (!Number.isSafeInteger(output) || output <= 0) throw new Error('OUTPUT_GATE_INVALID_AMOUNT');
  return output;
}

export function translateIntentToAppLanguage(intent) {
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) throw new Error('OUTPUT_GATE_INVALID_INTENT');
  if (String(intent.version) !== '1') throw new Error('OUTPUT_GATE_UNSUPPORTED_VERSION');
  if (intent.status !== 'READY') throw new Error(`OUTPUT_GATE_NOT_READY:${String(intent.status || 'UNKNOWN')}`);
  if (intent.action !== 'CREATE') throw new Error(`OUTPUT_GATE_UNSUPPORTED_ACTION:${String(intent.action || 'UNKNOWN')}`);
  const object = text(intent.object, 'OUTPUT_GATE_INVALID_OBJECT').toUpperCase();
  const target = CREATE_TARGET[object];
  if (!target) throw new Error(`OUTPUT_GATE_UNSUPPORTED_OBJECT:${object}`);
  return Object.freeze({
    version:'1',
    action:'CREATE',
    target,
    fields:Object.freeze({
      title:text(intent.fields?.title, 'OUTPUT_GATE_TITLE_REQUIRED'),
      amountSatang:amount(intent.fields?.amountSatang),
    }),
  });
}
```

- [ ] **Step 4: Run GREEN**

Run: `node --test tests/greenfield-b2-output-gate.test.cjs`

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

`git commit -m "feat: add B2 output gate"`

---

### Task 2: Manual Area Registry and Manual Gate

**Files:**
- Create: `foundation/manual-gate.mjs`
- Test: `tests/greenfield-b2-manual-gate.test.cjs`

**Interfaces:**
- Produces `createManualGate(areas)` where `areas` is an array of `{ id, label }` and returned gate exposes `list()` and `route(appLanguage)`.
- `route()` returns the registered area descriptor only; it never calls Runtime.

- [ ] **Step 1: Write failing tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { resolve } = require('node:path');
const load = path => import(pathToFileURL(resolve(path)).href);

test('Manual Gate routes by target and keeps areas replaceable', async () => {
  const { createManualGate } = await load('foundation/manual-gate.mjs');
  const gate = createManualGate([
    { id:'INCOME', label:'Income' },
    { id:'OUTCOME', label:'Outcome' },
    { id:'LEDGER', label:'Ledger' },
    { id:'CALENDAR', label:'Calendar' },
  ]);
  assert.equal(gate.route({ version:'1', action:'CREATE', target:'OUTCOME', fields:{} }).id, 'OUTCOME');
  assert.deepEqual(gate.list().map(x => x.id), ['INCOME','OUTCOME','LEDGER','CALENDAR']);
});

test('Manual Gate reports an unknown destination without guessing', async () => {
  const { createManualGate } = await load('foundation/manual-gate.mjs');
  const gate = createManualGate([{ id:'OUTCOME', label:'Outcome' }]);
  assert.throws(() => gate.route({ target:'SAVING' }), /MANUAL_GATE_DESTINATION_NOT_FOUND:SAVING/);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/greenfield-b2-manual-gate.test.cjs`

Expected: FAIL because `foundation/manual-gate.mjs` does not exist.

- [ ] **Step 3: Implement the minimum gate**

```js
export function createManualGate(areas) {
  if (!Array.isArray(areas) || areas.length === 0) throw new Error('MANUAL_GATE_AREAS_REQUIRED');
  const registry = new Map();
  for (const area of areas) {
    const id = String(area?.id || '').trim().toUpperCase();
    if (!id || registry.has(id)) throw new Error(`MANUAL_GATE_INVALID_AREA:${id || 'EMPTY'}`);
    registry.set(id, Object.freeze({ ...area, id }));
  }
  return Object.freeze({
    list:() => Object.freeze([...registry.values()]),
    route(appLanguage) {
      const target = String(appLanguage?.target || '').trim().toUpperCase();
      const area = registry.get(target);
      if (!area) throw new Error(`MANUAL_GATE_DESTINATION_NOT_FOUND:${target || 'EMPTY'}`);
      return area;
    },
  });
}
```

- [ ] **Step 4: Run GREEN**

Run: `node --test tests/greenfield-b2-manual-gate.test.cjs`

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

`git commit -m "feat: add B2 manual gate"`

---

### Task 3: Manual Runtime Adapter and Vertical Slice

**Files:**
- Create: `foundation/manual-runtime.mjs`
- Test: `tests/greenfield-b2-vertical-slice.test.cjs`

**Interfaces:**
- Produces `FOUNDATION_MANUAL_AREAS` as the starter registry.
- Produces `executeManualAppLanguage({ runtime, appLanguage, makeId })`.
- OUTCOME delegates to `runtime.expense()`; INCOME delegates to `runtime.otherIncome()`; LEDGER/CALENDAR remain view/audit areas in the Foundation and reject direct mutation.

- [ ] **Step 1: Write failing vertical-slice tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { resolve } = require('node:path');
const load = path => import(pathToFileURL(resolve(path)).href);

test('OUTCOME reaches existing runtime.expense with canonical fields', async () => {
  const { executeManualAppLanguage } = await load('foundation/manual-runtime.mjs');
  const calls = [];
  const runtime = { expense: async input => { calls.push(input); return { status:'OK' }; } };
  const result = await executeManualAppLanguage({
    runtime,
    appLanguage:{ version:'1', action:'CREATE', target:'OUTCOME', fields:{ title:'ข้าว', amountSatang:6500 } },
    makeId: prefix => `${prefix}-TEST`,
  });
  assert.equal(result.area, 'OUTCOME');
  assert.deepEqual(calls, [{ workflowId:'WF-OUTCOME-TEST', ledgerTransactionId:'TX-OUTCOME-TEST', title:'ข้าว', amountSatang:6500 }]);
});

test('INCOME reaches existing runtime.otherIncome', async () => {
  const { executeManualAppLanguage } = await load('foundation/manual-runtime.mjs');
  let input;
  const runtime = { otherIncome: async value => { input = value; return { status:'OK' }; } };
  await executeManualAppLanguage({
    runtime,
    appLanguage:{ version:'1', action:'CREATE', target:'INCOME', fields:{ title:'เงินคืน', amountSatang:50000 } },
    makeId: prefix => `${prefix}-TEST`,
  });
  assert.equal(input.amountSatang, 50000);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/greenfield-b2-vertical-slice.test.cjs`

Expected: FAIL because `foundation/manual-runtime.mjs` does not exist.

- [ ] **Step 3: Implement the minimum adapter**

```js
import { createManualGate } from './manual-gate.mjs';

export const FOUNDATION_MANUAL_AREAS = Object.freeze([
  Object.freeze({ id:'INCOME', label:'Income', mode:'execute' }),
  Object.freeze({ id:'OUTCOME', label:'Outcome', mode:'execute' }),
  Object.freeze({ id:'LEDGER', label:'Ledger', mode:'view' }),
  Object.freeze({ id:'CALENDAR', label:'Calendar', mode:'view' }),
]);

const gate = createManualGate(FOUNDATION_MANUAL_AREAS);

export async function executeManualAppLanguage({ runtime, appLanguage, makeId }) {
  if (!runtime || typeof makeId !== 'function') throw new Error('MANUAL_RUNTIME_INVALID_CONTEXT');
  const area = gate.route(appLanguage);
  if (appLanguage?.action !== 'CREATE') throw new Error(`MANUAL_RUNTIME_UNSUPPORTED_ACTION:${String(appLanguage?.action || 'UNKNOWN')}`);
  if (area.id === 'OUTCOME') {
    const result = await runtime.expense({
      workflowId:makeId('WF-OUTCOME'), ledgerTransactionId:makeId('TX-OUTCOME'),
      title:appLanguage.fields.title, amountSatang:appLanguage.fields.amountSatang,
    });
    return { area:area.id, result };
  }
  if (area.id === 'INCOME') {
    const result = await runtime.otherIncome({
      workflowId:makeId('WF-INCOME'), ledgerTransactionId:makeId('TX-INCOME'),
      title:appLanguage.fields.title, amountSatang:appLanguage.fields.amountSatang,
    });
    return { area:area.id, result };
  }
  throw new Error(`MANUAL_RUNTIME_AREA_READ_ONLY:${area.id}`);
}
```

- [ ] **Step 4: Run GREEN plus existing runtime tests**

Run: `node --test tests/greenfield-b2-vertical-slice.test.cjs tests/greenfield-runtime.test.cjs tests/greenfield-business-workflows.test.cjs`

Expected: all selected tests pass.

- [ ] **Step 5: Commit**

`git commit -m "feat: connect B2 manual areas to runtime"`

---

### Task 4: B2 UI Surface Inside the Existing Unlocked Runtime Session

**Files:**
- Create: `ui/b2-foundation.mjs`
- Create: `ui/b2-foundation.css`
- Modify: `index.html`
- Modify: `ui/app.mjs`
- Modify: `package.json`
- Test: `tests/greenfield-b2-ui.test.cjs`

**Interfaces:**
- `createB2FoundationUi({ getById, makeId, formatSatang })` returns `{ open, refresh }`.
- It uses `withRuntimeSession()` to borrow the app-owned Runtime; it never opens a second Runtime.
- AI submit: POST `/api/v1/interpret` → `translateIntentToAppLanguage()` → preview only.
- Explicit send button: `executeManualAppLanguage()` → runtime readback → refresh Manual lists.
- Manual area tabs are rendered from `FOUNDATION_MANUAL_AREAS`, not hardcoded routing branches.

- [ ] **Step 1: Write failing UI contract test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('B2 shell exposes AI and Manual surfaces and loads the B2 module', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const app = fs.readFileSync('ui/app.mjs', 'utf8');
  assert.match(html, /id="b2Workspace"/);
  assert.match(html, /data-b2-page="ai"/);
  assert.match(html, /data-b2-page="manual"/);
  assert.match(html, /id="b2AiForm"/);
  assert.match(html, /id="b2ManualAreas"/);
  assert.match(app, /createB2FoundationUi/);
  assert.match(app, /b2Ui\.open\(\)/);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/greenfield-b2-ui.test.cjs`

Expected: FAIL because the B2 shell and module are absent.

- [ ] **Step 3: Add the minimum B2 shell**

Add to `index.html` after the existing login/recovery gate and before the legacy workspace:

```html
<section id="b2Workspace" class="b2-workspace hidden" aria-label="YGPH Personal Helper">
  <nav class="b2-tabs" aria-label="โหมดทำงาน">
    <button type="button" data-b2-tab="ai" class="active">AI</button>
    <button type="button" data-b2-tab="manual">Manual</button>
  </nav>
  <section data-b2-page="ai" class="b2-page active">
    <h1>Personal Helper</h1>
    <div id="b2Conversation" class="b2-conversation"></div>
    <form id="b2AiForm"><input name="text" autocomplete="off" placeholder="พิมพ์ เช่น ข้าว 65" required><button>ตีความ</button></form>
    <pre id="b2AppLanguage" class="b2-code"></pre>
    <button id="b2SendToManual" type="button" disabled>ส่งเข้า Manual</button>
  </section>
  <section data-b2-page="manual" class="b2-page">
    <h1>Manual</h1>
    <div id="b2ManualAreas" class="b2-area-tabs"></div>
    <div id="b2ManualResult"></div>
    <details><summary>Audit</summary><pre id="b2Audit" class="b2-code"></pre></details>
  </section>
  <p id="b2Status" class="status" aria-live="polite"></p>
</section>
```

Load `ui/b2-foundation.css` in the document head.

- [ ] **Step 4: Implement `ui/b2-foundation.mjs`**

The module must import:

```js
import { withRuntimeSession } from '../greenfield/runtime-session.mjs';
import { translateIntentToAppLanguage } from '../foundation/output-gate.mjs';
import { FOUNDATION_MANUAL_AREAS, executeManualAppLanguage } from '../foundation/manual-runtime.mjs';
```

Its `open()` must show `#b2Workspace`, render area tabs from `FOUNDATION_MANUAL_AREAS`, and default to AI. AI form calls `/api/v1/interpret` with `{ version:'1', text, context:{} }`; it previews returned semantic meaning and canonical App Language. `#b2SendToManual` explicitly executes the pending App Language through `withRuntimeSession(runtime => executeManualAppLanguage(...))`, reads state back, updates audit, then refreshes Manual projection.

Manual projection rules for Foundation:
- INCOME: LEDGER `TRANSACTION` records with `direction === 'IN'`.
- OUTCOME: LEDGER `TRANSACTION` records with `direction === 'OUT'`.
- LEDGER: all LEDGER records.
- CALENDAR: all CALENDAR records.

No STORE/RIDE UI is added to the B2 surface.

- [ ] **Step 5: Wire to existing app-owned Runtime**

In `ui/app.mjs`:

```js
import { createB2FoundationUi } from './b2-foundation.mjs';
```

After existing helpers exist, create:

```js
const b2Ui = createB2FoundationUi({ getById:$, makeId, formatSatang });
```

At the end of successful `openWorkspace()` after Runtime session activation:

```js
await b2Ui.open();
document.body.classList.add('b2-foundation-active');
```

At the end of `refresh()` after `state = await runtime.readState()`:

```js
await b2Ui.refresh();
```

CSS must hide the legacy workspace and old command nav only while `.b2-foundation-active` is present; legacy DOM stays mounted so existing engine/UI bindings do not break:

```css
.b2-foundation-active #workspace,
.b2-foundation-active #commandNav { display:none !important; }
```

- [ ] **Step 6: Add syntax gate entries**

Add these to `check:syntax` in `package.json`:

```text
node --check foundation/output-gate.mjs
node --check foundation/manual-gate.mjs
node --check foundation/manual-runtime.mjs
node --check ui/b2-foundation.mjs
```

- [ ] **Step 7: Run GREEN and deploy gate**

Run:

```bash
node --test tests/greenfield-b2-ui.test.cjs tests/greenfield-b2-output-gate.test.cjs tests/greenfield-b2-manual-gate.test.cjs tests/greenfield-b2-vertical-slice.test.cjs
npm run deploy:gate
```

Expected: all tests, syntax checks, and UTF-8 checks pass.

- [ ] **Step 8: Commit**

`git commit -m "feat: add YGPH B2 AI and Manual foundation UI"`

---

### Task 5: Review the Whole Slice Without Promoting Production

**Files:**
- No production file changes unless review finds a defect.

**Interfaces:**
- Acceptance path: `ข้าว 65` → semantic EXPENSE → Output Gate OUTCOME → Manual Gate OUTCOME → `runtime.expense()` → LEDGER OUT/EXPENSE → readback.

- [ ] **Step 1: Run full gate**

Run: `npm run deploy:gate`

Expected: exit 0.

- [ ] **Step 2: Inspect PR diff for forbidden drift**

Confirm:
- `greenfield/core.mjs` still has only STORE / LEDGER / CALENDAR / RIDE domains.
- no direct business logic exists in Output Gate or Manual Gate.
- no production deployment trigger/current pointer was changed.
- old STORE/RIDE engine files were not removed.

- [ ] **Step 3: Keep PR in review state**

Do not merge or deploy production until device acceptance is explicitly reported.

## Self-Review

- Spec coverage: B2 flow, two distinct gates, replaceable Manual area registry, reuse of Runtime workflows, first `ข้าว 65` slice, UI foundation, Settings deferred, STORE/RIDE preserved below surface, and no production promotion are all mapped to tasks.
- Placeholder scan: no TBD/TODO or unspecified implementation step remains.
- Type consistency: `translateIntentToAppLanguage`, `createManualGate`, `FOUNDATION_MANUAL_AREAS`, `executeManualAppLanguage`, and `createB2FoundationUi` use the same names throughout the plan.
