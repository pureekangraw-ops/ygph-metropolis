# LIGHTHOUSE CHAT Real Income Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make LIGHTHOUSE CHAT general-income confirmation write one verified real Greenfield Ledger `OTHER_INCOME` transaction, then render Home finance truth and Manual Ledger history from real Ledger state instead of demo money.

**Architecture:** Keep CHAT parsing and Store demo behavior where they are. Add one focused `lighthouse-next/runtime-ledger.mjs` bridge that is the only new LIGHTHOUSE boundary to the active Greenfield runtime session; it writes `runtime.otherIncome(...)`, verifies exact durable readback, and projects finance truth with Greenfield `projectFinancialTruth(...)`. `app.mjs` owns pending CHAT state and stable retry IDs, while the shared Web/Android bundle stages the new bridge plus the calculation-authority dependency byte-identically.

**Tech Stack:** JavaScript ES modules, Node.js 22 `node:test`, Greenfield encrypted runtime/session, Capacitor Android shell, shared deterministic staging bundle, GitHub Actions Greenfield Deploy Gate.

**Spec:** `docs/superpowers/specs/2026-09-09-lighthouse-chat-real-income-ledger-design.md`

## Global Constraints

- Only general income moves to real Ledger in this phase.
- Store sale mutation, stock changes, and sale reversal migration remain out of scope.
- Calendar/obligation mutation migration and expected-income forecasting migration remain out of scope.
- General-income success copy may appear only after exact durable Ledger readback succeeds.
- Retry must reuse stable `workflowId` and `ledgerTransactionId`; an uncertain first attempt must not double-credit the Ledger.
- Home cash/current balance, today income, today expense, and net must come from real Ledger truth.
- Manual Ledger history must come from real Ledger records.
- Greenfield `projectFinancialTruth(...)` remains the authority for today's Ledger in/out values, including exclusion of balance adjustments from daily cash flow.
- Passwords, Recovery Codes, vault passphrases, and runtime objects must never be persisted.
- `RELEASE_MANIFEST.json`, `release/lighthouse-update.json`, `android-shell/version.json`, and `.github/workflows/lighthouse-owner-build.yml` must not change.
- Do not claim APK, Device Gate, release, store publication, or signer success from this work.

---

### Task 1: Add the focused real-Ledger bridge

**Files:**
- Create: `lighthouse-next/runtime-ledger.mjs`
- Create: `tests/greenfield-lighthouse-real-income.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `withRuntimeSession(operation)` from `greenfield/runtime-session.mjs`; `projectFinancialTruth(state, ledgerBalanceSatang, today)` from `greenfield/calculation-authority.mjs`; `runtime.otherIncome(input)`, `runtime.readState()`, and `runtime.project()` from the active Greenfield runtime.
- Produces: `createLighthouseLedgerBridge(deps?)`.
- Produces: `bridge.recordOtherIncome({ workflowId, ledgerTransactionId, source, amountBaht }) -> Promise<{ status:'VERIFIED', recovered:boolean, record, truth }>`.
- Produces: `bridge.readLedgerTruth() -> Promise<{ revision, balanceSatang, todayInSatang, todayOutSatang, netSatang, transactions }>`.

- [ ] **Step 1: Write the failing bridge tests**

Create `tests/greenfield-lighthouse-real-income.test.cjs` with focused tests for exact satang conversion, exact readback, locked-session failure, mismatch failure, duplicate-command recovery, and truth projection:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const root = process.cwd();
const bridgePath = path.join(root, 'lighthouse-next/runtime-ledger.mjs');

async function loadBridge() {
  assert.equal(fs.existsSync(bridgePath), true, 'missing lighthouse-next/runtime-ledger.mjs');
  return import(`${bridgePath}?t=${Date.now()}-${Math.random()}`);
}

function ledgerState(record, revision = 7) {
  return {
    revision,
    domains: {
      LEDGER: { records: record ? { [record.recordId]: { record } } : {} },
      STORE: { records: {} }, CALENDAR: { records: {} }, RIDE: { records: {} },
    },
  };
}

test('recordOtherIncome writes exact satang and requires exact durable readback', async () => {
  const { createLighthouseLedgerBridge } = await loadBridge();
  const calls = [];
  const record = {
    recordId:'TX-LH-1', type:'TRANSACTION', direction:'IN', amountSatang:5925,
    title:'ทิป', detail:'IN:OTHER_INCOME', sourceRef:'LEDGER/MANUAL', status:'COMPLETED',
    createdAt:'2026-09-09T03:00:00.000Z',
  };
  const runtime = {
    async otherIncome(input) { calls.push(input); return { status:'COMMITTED' }; },
    async readState() { return ledgerState(record); },
    project() { return { ledgerBalanceSatang:15925 }; },
  };
  const bridge = createLighthouseLedgerBridge({
    withSession: operation => operation(runtime),
    projectFinancial: () => ({ todayInSatang:5925, todayOutSatang:0 }),
    now: () => new Date('2026-09-09T10:00:00+07:00'),
  });

  const result = await bridge.recordOtherIncome({
    workflowId:'WF-LH-1', ledgerTransactionId:'TX-LH-1', source:'ทิป', amountBaht:59.25,
  });

  assert.deepEqual(calls, [{
    workflowId:'WF-LH-1', ledgerTransactionId:'TX-LH-1', title:'ทิป', amountSatang:5925,
  }]);
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.recovered, false);
  assert.equal(result.truth.balanceSatang, 15925);
});

test('locked runtime fails before any mutation', async () => {
  const { createLighthouseLedgerBridge } = await loadBridge();
  let mutated = false;
  const bridge = createLighthouseLedgerBridge({
    withSession: async () => { throw new Error('RUNTIME_SESSION_LOCKED'); },
    projectFinancial: () => { throw new Error('not used'); },
  });
  await assert.rejects(
    bridge.recordOtherIncome({ workflowId:'WF', ledgerTransactionId:'TX', source:'ทิป', amountBaht:59 }),
    /RUNTIME_SESSION_LOCKED/,
  );
  assert.equal(mutated, false);
});

test('readback mismatch fails closed', async () => {
  const { createLighthouseLedgerBridge } = await loadBridge();
  const bad = {
    recordId:'TX-LH-2', type:'TRANSACTION', direction:'IN', amountSatang:5800,
    title:'ทิป', detail:'IN:OTHER_INCOME', sourceRef:'LEDGER/MANUAL', status:'COMPLETED',
  };
  const runtime = {
    async otherIncome() {},
    async readState() { return ledgerState(bad); },
    project() { return { ledgerBalanceSatang:5800 }; },
  };
  const bridge = createLighthouseLedgerBridge({
    withSession: operation => operation(runtime),
    projectFinancial: () => ({ todayInSatang:5800, todayOutSatang:0 }),
  });
  await assert.rejects(
    bridge.recordOtherIncome({ workflowId:'WF-LH-2', ledgerTransactionId:'TX-LH-2', source:'ทิป', amountBaht:59 }),
    /LIGHTHOUSE_LEDGER_READBACK_MISMATCH/,
  );
});

test('duplicate command retry recovers by readback without a second success path', async () => {
  const { createLighthouseLedgerBridge } = await loadBridge();
  const record = {
    recordId:'TX-LH-3', type:'TRANSACTION', direction:'IN', amountSatang:5900,
    title:'ทิป', detail:'IN:OTHER_INCOME', sourceRef:'LEDGER/MANUAL', status:'COMPLETED',
  };
  const runtime = {
    async otherIncome() { throw new Error('DUPLICATE_COMMAND:WF-LH-3:LEDGER:TX-LH-3'); },
    async readState() { return ledgerState(record); },
    project() { return { ledgerBalanceSatang:5900 }; },
  };
  const bridge = createLighthouseLedgerBridge({
    withSession: operation => operation(runtime),
    projectFinancial: () => ({ todayInSatang:5900, todayOutSatang:0 }),
  });
  const result = await bridge.recordOtherIncome({
    workflowId:'WF-LH-3', ledgerTransactionId:'TX-LH-3', source:'ทิป', amountBaht:59,
  });
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.recovered, true);
});

test('readLedgerTruth delegates daily cash truth to Greenfield calculation authority', async () => {
  const { createLighthouseLedgerBridge } = await loadBridge();
  const oldRecord = { recordId:'TX-OLD', type:'TRANSACTION', direction:'OUT', amountSatang:1000, title:'เก่า', detail:'OUT:EXPENSE', createdAt:'2026-09-08T02:00:00.000Z' };
  const newRecord = { recordId:'TX-NEW', type:'TRANSACTION', direction:'IN', amountSatang:2500, title:'ใหม่', detail:'IN:OTHER_INCOME', createdAt:'2026-09-09T03:00:00.000Z' };
  const state = ledgerState(oldRecord);
  state.domains.LEDGER.records['TX-NEW'] = { record:newRecord };
  const seen = [];
  const runtime = {
    async readState() { return state; },
    project() { return { ledgerBalanceSatang:12345 }; },
  };
  const bridge = createLighthouseLedgerBridge({
    withSession: operation => operation(runtime),
    projectFinancial: (inputState, balance, today) => {
      seen.push({ inputState, balance, today });
      return { todayInSatang:2500, todayOutSatang:1000 };
    },
    now: () => new Date('2026-09-09T15:00:00+07:00'),
  });
  const truth = await bridge.readLedgerTruth();
  assert.equal(seen.length, 1);
  assert.equal(seen[0].balance, 12345);
  assert.equal(truth.todayInSatang, 2500);
  assert.equal(truth.todayOutSatang, 1000);
  assert.equal(truth.netSatang, 1500);
  assert.deepEqual(truth.transactions.map(item => item.recordId), ['TX-NEW','TX-OLD']);
});
```

- [ ] **Step 2: Run the new test file and verify RED**

Run:

```bash
node --test tests/greenfield-lighthouse-real-income.test.cjs
```

Expected: FAIL because `lighthouse-next/runtime-ledger.mjs` does not exist.

- [ ] **Step 3: Implement the minimal runtime bridge**

Create `lighthouse-next/runtime-ledger.mjs`:

```mjs
import { withRuntimeSession } from '../greenfield/runtime-session.mjs';
import { projectFinancialTruth } from '../greenfield/calculation-authority.mjs';

function requiredText(value, code) {
  const output = String(value ?? '').trim();
  if (!output) throw new Error(code);
  return output;
}

function bahtToSatang(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('LIGHTHOUSE_INCOME_AMOUNT_INVALID');
  const satang = Math.round(amount * 100);
  if (!Number.isSafeInteger(satang) || satang <= 0 || Math.abs((satang / 100) - amount) > 1e-9) {
    throw new Error('LIGHTHOUSE_INCOME_AMOUNT_INVALID');
  }
  return satang;
}

function ledgerRecords(state) {
  return Object.values(state?.domains?.LEDGER?.records || {})
    .map(entry => entry?.record)
    .filter(record => record?.type === 'TRANSACTION');
}

function duplicateCommand(error) {
  return String(error?.message || error || '').startsWith('DUPLICATE_COMMAND:');
}

function verifyOtherIncome(state, { ledgerTransactionId, source, amountSatang }) {
  const record = state?.domains?.LEDGER?.records?.[ledgerTransactionId]?.record;
  if (!record || record.type !== 'TRANSACTION' || record.direction !== 'IN' ||
      record.detail !== 'IN:OTHER_INCOME' || Number(record.amountSatang) !== amountSatang ||
      String(record.title || '') !== source || String(record.sourceRef || '') !== 'LEDGER/MANUAL') {
    throw new Error('LIGHTHOUSE_LEDGER_READBACK_MISMATCH');
  }
  return record;
}

function buildTruth(runtime, state, projectFinancial, now) {
  if (!state) throw new Error('LIGHTHOUSE_LEDGER_STATE_REQUIRED');
  const projection = runtime.project();
  const balanceSatang = Number(projection?.ledgerBalanceSatang);
  if (!Number.isSafeInteger(balanceSatang)) throw new Error('LIGHTHOUSE_LEDGER_BALANCE_INVALID');
  const finance = projectFinancial(state, balanceSatang, now());
  const todayInSatang = Number(finance?.todayInSatang);
  const todayOutSatang = Number(finance?.todayOutSatang);
  if (!Number.isSafeInteger(todayInSatang) || !Number.isSafeInteger(todayOutSatang)) {
    throw new Error('LIGHTHOUSE_LEDGER_DAILY_TRUTH_INVALID');
  }
  const transactions = ledgerRecords(state)
    .map(record => structuredClone(record))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return Object.freeze({
    revision: state.revision ?? null,
    balanceSatang,
    todayInSatang,
    todayOutSatang,
    netSatang: todayInSatang - todayOutSatang,
    transactions: Object.freeze(transactions),
  });
}

export function createLighthouseLedgerBridge(deps = {}) {
  const withSession = deps.withSession ?? withRuntimeSession;
  const projectFinancial = deps.projectFinancial ?? projectFinancialTruth;
  const now = deps.now ?? (() => new Date());

  async function readLedgerTruth() {
    return withSession(async runtime => {
      const state = await runtime.readState();
      return buildTruth(runtime, state, projectFinancial, now);
    });
  }

  async function recordOtherIncome({ workflowId, ledgerTransactionId, source, amountBaht } = {}) {
    const workflow = requiredText(workflowId, 'LIGHTHOUSE_WORKFLOW_ID_REQUIRED');
    const transaction = requiredText(ledgerTransactionId, 'LIGHTHOUSE_LEDGER_TRANSACTION_ID_REQUIRED');
    const title = requiredText(source, 'LIGHTHOUSE_INCOME_SOURCE_REQUIRED');
    const amountSatang = bahtToSatang(amountBaht);

    return withSession(async runtime => {
      let recovered = false;
      try {
        await runtime.otherIncome({
          workflowId: workflow,
          ledgerTransactionId: transaction,
          title,
          amountSatang,
        });
      } catch (error) {
        if (!duplicateCommand(error)) throw error;
        recovered = true;
      }

      const state = await runtime.readState();
      if (!state) throw new Error('LIGHTHOUSE_LEDGER_STATE_REQUIRED');
      const record = verifyOtherIncome(state, {
        ledgerTransactionId: transaction,
        source: title,
        amountSatang,
      });
      const truth = buildTruth(runtime, state, projectFinancial, now);
      return Object.freeze({
        status:'VERIFIED',
        recovered,
        record:structuredClone(record),
        truth,
      });
    });
  }

  return Object.freeze({ readLedgerTruth, recordOtherIncome });
}
```

- [ ] **Step 4: Add syntax coverage for the new module**

Modify `package.json` so `check:syntax` includes:

```json
"node --check lighthouse-next/runtime-ledger.mjs"
```

Place it beside the existing `node --check lighthouse-next/runtime-gate.mjs` check.

- [ ] **Step 5: Run bridge tests and syntax check to verify GREEN**

Run:

```bash
node --test tests/greenfield-lighthouse-real-income.test.cjs
node --check lighthouse-next/runtime-ledger.mjs
```

Expected: all tests PASS and syntax check exits 0.

- [ ] **Step 6: Commit Task 1**

```bash
git add lighthouse-next/runtime-ledger.mjs tests/greenfield-lighthouse-real-income.test.cjs package.json
git commit -m "feat: add LIGHTHOUSE real ledger bridge"
```

---

### Task 2: Route CHAT general-income confirmation through the real bridge

**Files:**
- Modify: `lighthouse-next/app.mjs`
- Modify: `tests/greenfield-lighthouse-real-income.test.cjs`
- Modify: `tests/greenfield-lighthouse-next-demo.test.cjs`

**Interfaces:**
- Consumes: `createLighthouseLedgerBridge()` from Task 1.
- Consumes: `bridge.recordOtherIncome({ workflowId, ledgerTransactionId, source, amountBaht })`.
- Produces: stable non-secret `workflowId` and `ledgerTransactionId` stored only inside a pending `GENERAL_INCOME` item.
- Produces: async confirmation flow that keeps the pending item on every failure and clears it only after bridge status `VERIFIED`.

- [ ] **Step 1: Add failing source-contract tests for the real confirmation boundary**

Append tests to `tests/greenfield-lighthouse-real-income.test.cjs` that read `lighthouse-next/app.mjs` and require the bridge, stable IDs, no local finance mutation in `confirmGeneralIncome`, and failure copy:

```js
const appPath = path.join(root, 'lighthouse-next/app.mjs');

test('CHAT general-income confirmation delegates to real Ledger and keeps stable retry identity', () => {
  const app = fs.readFileSync(appPath, 'utf8');
  assert.match(app, /from ['"]\.\/runtime-ledger\.mjs['"]/);
  assert.match(app, /createLighthouseLedgerBridge/);
  assert.match(app, /workflowId/);
  assert.match(app, /ledgerTransactionId/);
  assert.match(app, /await ledgerBridge\.recordOtherIncome\(/);
  assert.match(app, /ยังบันทึกไม่สำเร็จ รายการยังค้างอยู่ ลองอีกครั้งได้/);
  assert.match(app, /แอปถูกล็อก กรุณาเข้าสู่ระบบแล้วลองยืนยันอีกครั้ง/);
});

test('real general-income confirmation no longer mutates demo cash or demo transaction history', () => {
  const app = fs.readFileSync(appPath, 'utf8');
  const body = app.match(/async function confirmGeneralIncome\(pending\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(body, /ledgerBridge\.recordOtherIncome/);
  assert.doesNotMatch(body, /state\.cash\s*\+=/);
  assert.doesNotMatch(body, /state\.todayIncome\s*\+=/);
  assert.doesNotMatch(body, /state\.transactions\.push/);
});
```

Also update the existing `CHAT confirmation and success copy` test in `tests/greenfield-lighthouse-next-demo.test.cjs` so it still checks the same conversational success copy but no longer assumes demo-local mutation is the authority.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
node --test tests/greenfield-lighthouse-real-income.test.cjs tests/greenfield-lighthouse-next-demo.test.cjs
```

Expected: FAIL because `app.mjs` does not import/use the real Ledger bridge and `confirmGeneralIncome` is still synchronous demo mutation.

- [ ] **Step 3: Add bridge state and stable pending identity to `app.mjs`**

Add the import and module state:

```mjs
import { createLighthouseLedgerBridge } from './runtime-ledger.mjs';

const ledgerBridge = createLighthouseLedgerBridge();
let ledgerTruth = null;
let realIncomeCommitBusy = false;
```

Add stable non-secret identity helpers:

```mjs
function newOperationId(prefix) {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function ensureGeneralIncomeIdentity(pending) {
  if (!pending.workflowId) pending.workflowId = newOperationId('WF-LH-INCOME');
  if (!pending.ledgerTransactionId) pending.ledgerTransactionId = newOperationId('TX-LH-INCOME');
  saveState();
  return pending;
}
```

Update `normalizeStoredPending(...)` so `GENERAL_INCOME` restores these fields when present:

```mjs
const workflowId = typeof pending.workflowId === 'string' && pending.workflowId.trim() ? pending.workflowId.trim() : null;
const ledgerTransactionId = typeof pending.ledgerTransactionId === 'string' && pending.ledgerTransactionId.trim() ? pending.ledgerTransactionId.trim() : null;
return {
  kind:'GENERAL_INCOME',
  stage:source ? 'CONFIRM_GENERAL_INCOME' : 'GENERAL_INCOME_SOURCE',
  amount:Number(pending.amount),
  source,
  workflowId,
  ledgerTransactionId,
};
```

- [ ] **Step 4: Replace demo mutation with verified async real-Ledger confirmation**

Replace `confirmGeneralIncome` with:

```mjs
async function confirmGeneralIncome(pending) {
  if (realIncomeCommitBusy) return;
  ensureGeneralIncomeIdentity(pending);
  realIncomeCommitBusy = true;
  renderChatActions();
  try {
    const result = await ledgerBridge.recordOtherIncome({
      workflowId:pending.workflowId,
      ledgerTransactionId:pending.ledgerTransactionId,
      source:pending.source,
      amountBaht:pending.amount,
    });
    ledgerTruth = result.truth;
    state.pendingFlow = null;
    saveState();
    addMessage('app', `บันทึกแล้ว ${pending.amount} บาท · ${pending.source}`);
    refreshTruthSurfaces();
  } catch (error) {
    const code = String(error?.message || error || '');
    addMessage(
      'app',
      code === 'RUNTIME_SESSION_LOCKED'
        ? 'แอปถูกล็อก กรุณาเข้าสู่ระบบแล้วลองยืนยันอีกครั้ง'
        : 'ยังบันทึกไม่สำเร็จ รายการยังค้างอยู่ ลองอีกครั้งได้',
    );
    saveState();
  } finally {
    realIncomeCommitBusy = false;
    renderChatActions();
  }
}
```

Do not add any `state.cash +=`, `state.todayIncome +=`, or `state.transactions.push(...)` inside this function.

- [ ] **Step 5: Make the CHAT call chain await confirmation and guard double taps**

Update the relevant functions so real confirmation can finish before final re-render:

```mjs
async function confirmPending() {
  const pending = state.pendingFlow;
  if (!pending) return addMessage('app','รายการยังไม่พร้อมยืนยัน');
  if (pending.kind === 'GENERAL_INCOME' && pending.stage === 'CONFIRM_GENERAL_INCOME' && pending.source) {
    return confirmGeneralIncome(pending);
  }
  if (pending.kind === 'STORE_SALE' && pending.stage === 'CONFIRM_STORE_SALE' && pending.value && pending.quantity) {
    return confirmStoreSale(pending);
  }
  addMessage('app','รายการยังไม่พร้อมยืนยัน');
}

async function handlePendingInput(text) {
  const pending = state.pendingFlow;
  const clean = text.trim();
  if (clean === 'ยกเลิก') return cancelPending();
  if (clean === 'ยืนยัน') return confirmPending();
  if (clean === 'แก้ไข') return editPending();
  // Keep the existing STORE_SALE and GENERAL_INCOME_SOURCE branches unchanged below this point.
}

async function handleChatInput(text) {
  // Keep current parsing order and side-query behavior; await handlePendingInput(clean) when pending exists.
}

async function submitChatText(text) {
  const clean = String(text || '').trim();
  if (!clean) return;
  addMessage('user', clean);
  renderChat();
  await handleChatInput(clean);
  renderChat();
}
```

Update chat action buttons so they cannot trigger another commit while one is in flight:

```mjs
function setChatActions(labels = []) {
  chatActions.replaceChildren();
  for (const label of labels) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chat-chip';
    button.textContent = label;
    button.disabled = realIncomeCommitBusy;
    button.addEventListener('click', () => { void submitChatText(label); });
    chatActions.append(button);
  }
}
```

Update the form listener to await `submitChatText(value)` while preserving keyboard focus behavior.

- [ ] **Step 6: Run focused CHAT tests to verify GREEN**

Run:

```bash
node --test tests/greenfield-lighthouse-real-income.test.cjs tests/greenfield-lighthouse-next-demo.test.cjs tests/greenfield-lighthouse-runtime-gate.test.cjs
```

Expected: all focused tests PASS; Store parse/confirm source contracts remain green.

- [ ] **Step 7: Commit Task 2**

```bash
git add lighthouse-next/app.mjs tests/greenfield-lighthouse-real-income.test.cjs tests/greenfield-lighthouse-next-demo.test.cjs
git commit -m "feat: route LIGHTHOUSE income to real ledger"
```

---

### Task 3: Replace Home finance and Manual Ledger history with real truth

**Files:**
- Modify: `lighthouse-next/app.mjs`
- Modify: `lighthouse-next/index.html`
- Modify: `tests/greenfield-lighthouse-real-income.test.cjs`
- Modify: `tests/greenfield-lighthouse-next-demo.test.cjs`

**Interfaces:**
- Consumes: `bridge.readLedgerTruth()` and the `truth` returned from successful `recordOtherIncome(...)`.
- Produces: `ledgerTruth` as the only authority for Home cash, today income, today expense, net, and Manual Ledger history.
- Preserves: Store demo state under `state.products`, `state.transactions`, local Store confirm/reversal code, and Calendar demo state; these may not contribute to real finance totals.

- [ ] **Step 1: Write failing truth-surface contracts**

Add/update tests so they require real truth and reject demo authority:

```js
test('Home finance renders from ledgerTruth instead of demo cash defaults', () => {
  const app = fs.readFileSync(appPath, 'utf8');
  assert.match(app, /ledgerTruth\.balanceSatang/);
  assert.match(app, /ledgerTruth\.todayInSatang/);
  assert.match(app, /ledgerTruth\.todayOutSatang/);
  assert.match(app, /ledgerTruth\.netSatang/);
  const renderBody = app.match(/function renderHomeTruth\(\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.doesNotMatch(renderBody, /state\.cash|state\.todayIncome|state\.todayExpense/);
});

test('Manual Ledger history renders real Ledger transactions only', () => {
  const app = fs.readFileSync(appPath, 'utf8');
  const historyBody = app.match(/function renderHistoryDetail\(\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(historyBody, /ledgerTruth\?\.transactions/);
  assert.doesNotMatch(historyBody, /state\.transactions/);
});

test('login loads real Ledger truth before showing the app', () => {
  const app = fs.readFileSync(appPath, 'utf8');
  assert.match(app, /await ledgerBridge\.readLedgerTruth\(\)/);
  assert.match(app, /runtimeGate\.lock\(\)/);
});
```

Update the existing Dashboard and MANUAL tests in `tests/greenfield-lighthouse-next-demo.test.cjs`:

- Dashboard must no longer require `state.cash`, `state.todayIncome`, or `state.todayExpense` in `renderHomeTruth`.
- MANUAL Store must still require `state.products`.
- MANUAL Ledger History must require `ledgerTruth.transactions`, not `state.transactions`.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
node --test tests/greenfield-lighthouse-real-income.test.cjs tests/greenfield-lighthouse-next-demo.test.cjs
```

Expected: FAIL because Home and Manual History still read demo state.

- [ ] **Step 3: Load Ledger truth immediately after successful login and clear it on lock**

Restructure `submitLogin` so the app is shown only after truth loads:

```mjs
async function submitLogin(event) {
  event.preventDefault();
  setAuthBusy(true);
  authStatus.textContent = 'กำลังตรวจรหัส…';
  let unlocked = false;
  try {
    const result = await runtimeGate.login(devicePassword.value);
    if (result.status === 'UNLOCKED') {
      unlocked = true;
      ledgerTruth = await ledgerBridge.readLedgerTruth();
      state.activeRoot = 'home';
      saveState();
      showApp();
    }
  } catch (error) {
    if (unlocked) runtimeGate.lock();
    ledgerTruth = null;
    const code = String(error?.message || error || '');
    showLoginGate(
      code.startsWith('LIGHTHOUSE_LEDGER_') || code === 'RUNTIME_SESSION_LOCKED'
        ? 'ยังอ่านข้อมูลเงินจริงไม่ได้ กรุณาลองใหม่'
        : authMessage(error),
    );
  } finally {
    devicePassword.value = '';
    setAuthBusy(false);
  }
}

function lockApp() {
  runtimeGate.lock();
  ledgerTruth = null;
  devicePassword.value = '';
  clearRecoveryFields();
  showLoginGate('LIGHTHOUSE ถูกล็อกแล้ว');
}
```

- [ ] **Step 4: Make Home finance read only `ledgerTruth`**

Replace the real-money portion of `financeSnapshot()` and `renderHomeTruth()` with satang-backed values:

```mjs
function formatSatang(value) {
  return formatBaht(Number(value || 0) / 100);
}

function financeSnapshot() {
  if (!ledgerTruth) return null;
  return {
    cashSatang:ledgerTruth.balanceSatang,
    todayIncomeSatang:ledgerTruth.todayInSatang,
    todayExpenseSatang:ledgerTruth.todayOutSatang,
    netSatang:ledgerTruth.netSatang,
  };
}

function renderHomeTruth() {
  const snapshot = financeSnapshot();
  homeCashValue.textContent = snapshot ? formatSatang(snapshot.cashSatang) : '—';
  homeIncomeValue.textContent = snapshot ? formatSatang(snapshot.todayIncomeSatang) : '—';
  homeExpenseValue.textContent = snapshot ? formatSatang(snapshot.todayExpenseSatang) : '—';
  homeNetValue.textContent = snapshot
    ? `${snapshot.netSatang >= 0 ? '+' : '-'}${formatSatang(Math.abs(snapshot.netSatang))}`
    : '—';

  homeExpectedValue.textContent = '—';
  homeObligationTitle.textContent = 'ยังไม่เชื่อมข้อมูลจริง';
  homeObligationDue.textContent = '—';
  homeObligationValue.textContent = '—';
  homeGapValue.textContent = '—';
  homeTargetValue.textContent = '—';
}
```

Update the initial text inside `lighthouse-next/index.html` for these Home values to `—` so demo money cannot flash before runtime truth is loaded.

- [ ] **Step 5: Render Manual finance and Ledger history from real truth**

Make `renderFinanceDetail()` use `financeSnapshot()` and show placeholders for obligation/forecast fields that are not migrated.

Replace `renderHistoryDetail()` so it reads real transactions only:

```mjs
function ledgerHistoryValue(transaction) {
  const direction = transaction.direction === 'OUT' ? '-' : '+';
  return `${direction}${formatSatang(transaction.amountSatang)}`;
}

function ledgerHistoryDetail(transaction) {
  if (transaction.detail === 'IN:OTHER_INCOME') return 'รายรับทั่วไป';
  return transaction.direction === 'IN' ? 'เงินเข้า' : 'เงินออก';
}

function renderHistoryDetail() {
  const data = manualContent.ledger;
  const list = document.createElement('div');
  list.className = 'detail-list history-list';
  const transactions = ledgerTruth?.transactions || [];
  if (!transactions.length) list.append(makeDetailRow('ประวัติ','ยังไม่มีรายการ'));
  for (const transaction of transactions) {
    const row = document.createElement('div');
    row.className = 'detail-row history-row';
    const copy = document.createElement('span');
    copy.className = 'history-copy';
    const title = document.createElement('strong');
    title.textContent = transaction.title || 'รายการเงิน';
    const detail = document.createElement('small');
    detail.textContent = ledgerHistoryDetail(transaction);
    copy.append(title, detail);
    const value = document.createElement('strong');
    value.textContent = ledgerHistoryValue(transaction);
    row.append(copy, value);
    list.append(row);
  }
  manualDetailContent.append(makeDetailHero(data), list);
}
```

Keep `renderStoreDetail()`, `confirmStoreSale()`, `confirmSaleReversal()`, and Store demo parsing unchanged in this task.

- [ ] **Step 6: Run focused truth and regression tests to verify GREEN**

Run:

```bash
node --test tests/greenfield-lighthouse-real-income.test.cjs tests/greenfield-lighthouse-next-demo.test.cjs tests/greenfield-lighthouse-runtime-gate.test.cjs
```

Expected: all focused tests PASS; Dashboard/History contracts now point at real truth while Store demo contracts remain green.

- [ ] **Step 7: Commit Task 3**

```bash
git add lighthouse-next/app.mjs lighthouse-next/index.html tests/greenfield-lighthouse-real-income.test.cjs tests/greenfield-lighthouse-next-demo.test.cjs
git commit -m "feat: render LIGHTHOUSE finance from real ledger"
```

---

### Task 4: Stage the real-Ledger bridge identically for Web and Android

**Files:**
- Modify: `scripts/stage-lighthouse-next-bundle.mjs`
- Modify: `tests/greenfield-lighthouse-android-stage-contract.test.cjs`
- Modify: `android-shell/test/lighthouse-next-package.test.mjs`

**Interfaces:**
- Consumes: shared bundle constants `LIGHTHOUSE_RUNTIME_FILES` and `GREENFIELD_ENTRYPOINTS`.
- Produces: staged `lighthouse-next/runtime-ledger.mjs` and `greenfield/calculation-authority.mjs` for both isolated Web and Android.
- Preserves: forbidden-tree exclusions including `greenfield/master-input-router.mjs`.

- [ ] **Step 1: Write failing package/staging expectations**

In `tests/greenfield-lighthouse-android-stage-contract.test.cjs`, add `runtime-ledger.mjs` to `runtimeFiles` and require byte identity for `calculation-authority.mjs`:

```js
const runtimeFiles = [
  'index.html', 'styles.css', 'owner-polish.css', 'app.mjs',
  'runtime-gate.mjs', 'runtime-ledger.mjs', 'send-control.mjs',
  'general-income.mjs', 'store-sale.mjs', 'bangkok-date.mjs',
  'manifest.webmanifest',
];

for (const relative of ['runtime.mjs', 'runtime-session.mjs', 'calculation-authority.mjs']) {
  const source = await fsp.readFile(path.join(root, 'greenfield', relative));
  const staged = await fsp.readFile(path.join(shellRoot, 'www', 'greenfield', relative));
  assert.deepEqual(staged, source, `staged Greenfield bytes drifted for ${relative}`);
}
```

In `android-shell/test/lighthouse-next-package.test.mjs`, add assertions that:

```mjs
assert.equal(await exists(join(stagedLighthouse, 'runtime-ledger.mjs')), true);
assert.equal(await exists(join(stagedGreenfield, 'calculation-authority.mjs')), true);
assert.deepEqual(
  await readFile(join(stagedLighthouse, 'runtime-ledger.mjs')),
  await readFile(join(repoRoot, 'lighthouse-next', 'runtime-ledger.mjs')),
);
assert.deepEqual(
  await readFile(join(stagedGreenfield, 'calculation-authority.mjs')),
  await readFile(join(repoRoot, 'greenfield', 'calculation-authority.mjs')),
);
```

Keep the existing forbidden assertion for `greenfield/master-input-router.mjs`.

- [ ] **Step 2: Run staging tests and verify RED**

Run:

```bash
node --test tests/greenfield-lighthouse-android-stage-contract.test.cjs
cd android-shell && npm test
```

Expected: FAIL because `runtime-ledger.mjs` is not in `LIGHTHOUSE_RUNTIME_FILES` and `calculation-authority.mjs` is not an explicit Greenfield entrypoint.

- [ ] **Step 3: Extend the shared deterministic bundle lists**

Modify `scripts/stage-lighthouse-next-bundle.mjs`:

```mjs
export const LIGHTHOUSE_RUNTIME_FILES = Object.freeze([
  'index.html',
  'styles.css',
  'owner-polish.css',
  'app.mjs',
  'runtime-gate.mjs',
  'runtime-ledger.mjs',
  'send-control.mjs',
  'general-income.mjs',
  'store-sale.mjs',
  'bangkok-date.mjs',
  'manifest.webmanifest',
]);

export const GREENFIELD_ENTRYPOINTS = Object.freeze([
  'runtime.mjs',
  'runtime-session.mjs',
  'calculation-authority.mjs',
]);
```

Do not add `master-input-router.mjs`.

- [ ] **Step 4: Run shared Web/Android staging tests to verify GREEN**

Run:

```bash
node --test tests/greenfield-lighthouse-android-stage-contract.test.cjs
cd android-shell && npm test && npm run app:stage-next
```

Expected: PASS; staged app and Greenfield dependency bytes match source, and forbidden trees stay absent.

- [ ] **Step 5: Commit Task 4**

```bash
git add scripts/stage-lighthouse-next-bundle.mjs tests/greenfield-lighthouse-android-stage-contract.test.cjs android-shell/test/lighthouse-next-package.test.mjs
git commit -m "build: stage LIGHTHOUSE real ledger runtime"
```

---

### Task 5: Full gate, scope containment, and review checkpoint

**Files:**
- Verify only; no product/release source change expected.
- Review: all files changed since `main`.

**Interfaces:**
- Consumes: completed Tasks 1–4.
- Produces: fresh full-test evidence and a reviewable branch/PR; does not merge automatically.

- [ ] **Step 1: Run the complete focused LIGHTHOUSE regression set**

Run:

```bash
node --test \
  tests/greenfield-lighthouse-real-income.test.cjs \
  tests/greenfield-lighthouse-next-demo.test.cjs \
  tests/greenfield-lighthouse-runtime-gate.test.cjs \
  tests/greenfield-lighthouse-android-stage-contract.test.cjs
```

Expected: 0 failures.

- [ ] **Step 2: Run the Android shell test/staging gate**

Run:

```bash
cd android-shell
npm test
npm run app:stage-next
cd ..
```

Expected: all Android shell tests PASS and staging exits 0.

- [ ] **Step 3: Run the repository deploy gate fresh**

Run:

```bash
npm run deploy:gate
```

Expected: `npm test`, syntax checks, and UTF-8 checks all exit 0.

- [ ] **Step 4: Verify scope containment**

Run:

```bash
git diff --name-only main...HEAD
```

Expected changed paths are limited to:

```text
docs/superpowers/specs/2026-09-09-lighthouse-chat-real-income-ledger-design.md
docs/superpowers/plans/2026-09-09-lighthouse-chat-real-income-ledger.md
lighthouse-next/runtime-ledger.mjs
lighthouse-next/app.mjs
lighthouse-next/index.html
scripts/stage-lighthouse-next-bundle.mjs
tests/greenfield-lighthouse-real-income.test.cjs
tests/greenfield-lighthouse-next-demo.test.cjs
tests/greenfield-lighthouse-android-stage-contract.test.cjs
android-shell/test/lighthouse-next-package.test.mjs
package.json
```

Explicitly verify these forbidden files are absent from the diff:

```bash
forbidden='RELEASE_MANIFEST.json|release/lighthouse-update.json|android-shell/version.json|.github/workflows/lighthouse-owner-build.yml'
git diff --name-only main...HEAD | grep -E "$forbidden" && exit 1 || true
```

- [ ] **Step 5: Open or refresh a Draft PR to `main` and wait for CI**

If using GitHub CLI:

```bash
gh pr create \
  --draft \
  --base main \
  --head feat/lighthouse-real-income-ledger-20260909 \
  --title "LIGHTHOUSE real general income ledger" \
  --body "Moves only CHAT general income to verified Greenfield Ledger truth. Home finance and Manual Ledger history read real Ledger state. Store sale remains demo-only. No release/version/APK scope."
```

If the PR already exists, update its body instead of creating a duplicate. If executing through the connected GitHub tool rather than CLI, use the equivalent Draft PR action with the same base, head, title, and body.

Expected: Draft PR is open against `main`; Greenfield Deploy Gate is triggered.

- [ ] **Step 6: Verify the exact PR head CI before reporting checkpoint completion**

Confirm the workflow run head SHA equals the branch head, then require:

```text
Greenfield safety gate: success
Deploy Master Input candidate to staging: success or intentionally skipped according to event type
Isolated LIGHTHOUSE bundle validation/deploy: success where the PR workflow runs it
```

Do not infer success from an older workflow run.

- [ ] **Step 7: Stop for owner review; do not merge**

Report in simple Thai:

```text
Checkpoint ผ่าน/ไม่ผ่าน
- รายรับทั่วไปเขียน Ledger จริงหรือยัง
- อ่านกลับก่อนบอกว่าบันทึกแล้วหรือยัง
- กดซ้ำแล้วเงินไม่ซ้ำหรือยัง
- Home/Manual ใช้เงินจริงหรือยัง
- ขายสินค้ายังเป็นเดโมและไม่ปนยอดเงินจริงหรือยัง
- Web/Android bundle และ full gate ผ่านหรือไม่
- สิ่งที่ยัง UNKNOWN
```

Do not mark the PR ready or merge until the owner explicitly asks.
