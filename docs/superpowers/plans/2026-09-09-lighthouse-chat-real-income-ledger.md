# LIGHTHOUSE CHAT Real Income Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make LIGHTHOUSE CHAT general-income confirmation write one verified real Greenfield Ledger `OTHER_INCOME` transaction, then render Home finance truth and Manual Ledger history from real Ledger state instead of demo money.

**Architecture:** Keep CHAT parsing and Store demo behavior where they are. Add one focused `lighthouse-next/runtime-ledger.mjs` bridge as the only new LIGHTHOUSE boundary to the active Greenfield runtime session; it writes `runtime.otherIncome(...)`, verifies exact durable readback, and projects finance truth with Greenfield `projectFinancialTruth(...)`. `app.mjs` owns pending CHAT state and stable retry IDs, while the shared Web/Android bundle stages the new bridge plus `calculation-authority.mjs` byte-identically.

**Tech Stack:** JavaScript ES modules, Node.js 22 `node:test`, Greenfield encrypted runtime/session, Capacitor Android shell, deterministic shared staging bundle, GitHub Actions Greenfield Deploy Gate.

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
- Consumes: `withRuntimeSession(operation)` from `greenfield/runtime-session.mjs`.
- Consumes: `projectFinancialTruth(state, ledgerBalanceSatang, today)` from `greenfield/calculation-authority.mjs`.
- Produces: `createLighthouseLedgerBridge(deps?)`.
- Produces: `bridge.recordOtherIncome({ workflowId, ledgerTransactionId, source, amountBaht }) -> Promise<{ status:'VERIFIED', recovered:boolean, record, truth }>`.
- Produces: `bridge.readLedgerTruth() -> Promise<{ revision, balanceSatang, todayInSatang, todayOutSatang, netSatang, transactions }>`.

- [ ] **Step 1: Write the failing bridge tests**

Create `tests/greenfield-lighthouse-real-income.test.cjs`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const root = process.cwd();
const bridgePath = path.join(root, 'lighthouse-next/runtime-ledger.mjs');
const appPath = path.join(root, 'lighthouse-next/app.mjs');

async function loadBridge() {
  assert.equal(fs.existsSync(bridgePath), true, 'missing lighthouse-next/runtime-ledger.mjs');
  return import(`${bridgePath}?t=${Date.now()}-${Math.random()}`);
}

function ledgerState(records = [], revision = 7) {
  return {
    revision,
    domains: {
      LEDGER: { records:Object.fromEntries(records.map(record => [record.recordId, { record }])) },
      STORE: { records:{} },
      CALENDAR: { records:{} },
      RIDE: { records:{} },
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
    async readState() { return ledgerState([record]); },
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

test('locked runtime fails before a runtime mutation is available', async () => {
  const { createLighthouseLedgerBridge } = await loadBridge();
  const bridge = createLighthouseLedgerBridge({
    withSession: async () => { throw new Error('RUNTIME_SESSION_LOCKED'); },
    projectFinancial: () => { throw new Error('not used'); },
  });
  await assert.rejects(
    bridge.recordOtherIncome({ workflowId:'WF', ledgerTransactionId:'TX', source:'ทิป', amountBaht:59 }),
    /RUNTIME_SESSION_LOCKED/,
  );
});

test('readback mismatch fails closed', async () => {
  const { createLighthouseLedgerBridge } = await loadBridge();
  const bad = {
    recordId:'TX-LH-2', type:'TRANSACTION', direction:'IN', amountSatang:5800,
    title:'ทิป', detail:'IN:OTHER_INCOME', sourceRef:'LEDGER/MANUAL', status:'COMPLETED',
  };
  const runtime = {
    async otherIncome() {},
    async readState() { return ledgerState([bad]); },
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

test('duplicate command retry recovers through exact readback', async () => {
  const { createLighthouseLedgerBridge } = await loadBridge();
  const record = {
    recordId:'TX-LH-3', type:'TRANSACTION', direction:'IN', amountSatang:5900,
    title:'ทิป', detail:'IN:OTHER_INCOME', sourceRef:'LEDGER/MANUAL', status:'COMPLETED',
  };
  const runtime = {
    async otherIncome() { throw new Error('DUPLICATE_COMMAND:WF-LH-3:LEDGER:TX-LH-3'); },
    async readState() { return ledgerState([record]); },
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
  const state = ledgerState([oldRecord, newRecord]);
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

- [ ] **Step 3: Implement the minimal bridge**

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
    revision:state.revision ?? null,
    balanceSatang,
    todayInSatang,
    todayOutSatang,
    netSatang:todayInSatang - todayOutSatang,
    transactions:Object.freeze(transactions),
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
          workflowId:workflow,
          ledgerTransactionId:transaction,
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
        ledgerTransactionId:transaction,
        source:title,
        amountSatang,
      });
      const truth = buildTruth(runtime, state, projectFinancial, now);
      return Object.freeze({ status:'VERIFIED', recovered, record:structuredClone(record), truth });
    });
  }

  return Object.freeze({ readLedgerTruth, recordOtherIncome });
}
```

- [ ] **Step 4: Add syntax coverage**

Add this command to `package.json` `check:syntax`, beside `runtime-gate.mjs`:

```text
node --check lighthouse-next/runtime-ledger.mjs
```

- [ ] **Step 5: Run the bridge tests and syntax check to verify GREEN**

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
- Produces: stable non-secret `workflowId` and `ledgerTransactionId` inside pending `GENERAL_INCOME` state.
- Produces: async confirmation that clears pending state only after `VERIFIED` readback.

- [ ] **Step 1: Add failing source-contract tests**

Append to `tests/greenfield-lighthouse-real-income.test.cjs`:

```js
test('CHAT general-income confirmation delegates to real Ledger with stable retry identity', () => {
  const app = fs.readFileSync(appPath, 'utf8');
  assert.match(app, /from ['"]\.\/runtime-ledger\.mjs['"]/);
  assert.match(app, /createLighthouseLedgerBridge/);
  assert.match(app, /workflowId/);
  assert.match(app, /ledgerTransactionId/);
  assert.match(app, /await ledgerBridge\.recordOtherIncome\(/);
  assert.match(app, /ยังบันทึกไม่สำเร็จ รายการยังค้างอยู่ ลองอีกครั้งได้/);
  assert.match(app, /แอปถูกล็อก กรุณาเข้าสู่ระบบแล้วลองยืนยันอีกครั้ง/);
});

test('real general-income confirmation does not mutate demo finance authority', () => {
  const app = fs.readFileSync(appPath, 'utf8');
  const start = app.indexOf('async function confirmGeneralIncome(pending)');
  const end = app.indexOf('function confirmStoreSale', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const body = app.slice(start, end);
  assert.match(body, /ledgerBridge\.recordOtherIncome/);
  assert.doesNotMatch(body, /state\.cash\s*\+=/);
  assert.doesNotMatch(body, /state\.todayIncome\s*\+=/);
  assert.doesNotMatch(body, /state\.transactions\.push/);
});
```

In `tests/greenfield-lighthouse-next-demo.test.cjs`, keep the conversational-copy assertions exactly as:

```js
assert.match(app, /บาท จาก\$\{pending\.source\} — บันทึกไหม\?/);
assert.match(app, /บันทึกแล้ว \$\{pending\.amount\} บาท · \$\{pending\.source\}/);
assert.doesNotMatch(app, /เดโมบันทึก:/);
```

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
node --test tests/greenfield-lighthouse-real-income.test.cjs tests/greenfield-lighthouse-next-demo.test.cjs
```

Expected: FAIL because `app.mjs` still performs demo-local income mutation.

- [ ] **Step 3: Add bridge state and stable pending identity**

Add to `lighthouse-next/app.mjs`:

```mjs
import { createLighthouseLedgerBridge } from './runtime-ledger.mjs';

const ledgerBridge = createLighthouseLedgerBridge();
let ledgerTruth = null;
let realIncomeCommitBusy = false;

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

Change the `GENERAL_INCOME` return inside `normalizeStoredPending(...)` to preserve IDs:

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

- [ ] **Step 4: Replace general-income demo mutation with verified async write**

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
    addMessage('app', code === 'RUNTIME_SESSION_LOCKED'
      ? 'แอปถูกล็อก กรุณาเข้าสู่ระบบแล้วลองยืนยันอีกครั้ง'
      : 'ยังบันทึกไม่สำเร็จ รายการยังค้างอยู่ ลองอีกครั้งได้');
    saveState();
  } finally {
    realIncomeCommitBusy = false;
    renderChatActions();
  }
}
```

- [ ] **Step 5: Make the CHAT call chain async and block duplicate taps**

Replace `setChatActions`, `confirmPending`, `handlePendingInput`, `handleChatInput`, and `submitChatText` with these exact bodies:

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
  if (pending.kind === 'STORE_SALE') {
    if (pending.stage === 'STORE_SALE_VALUE') {
      const value = parsePositiveMoney(clean);
      if (!value) return addMessage('app','รบกวนบอกเพิ่ม: มูลค่าที่ขาย');
      pending.value = value;
      pending.stage = 'STORE_SALE_QUANTITY';
      saveState();
      return resumeStoreSalePrompt(pending);
    }
    if (pending.stage === 'STORE_SALE_QUANTITY') {
      const quantity = parsePositiveQuantity(clean);
      if (!quantity) return addMessage('app','รบกวนบอกเพิ่ม: จำนวนสินค้า');
      pending.quantity = quantity;
      pending.stage = 'CONFIRM_STORE_SALE';
      saveState();
      return resumeStoreSalePrompt(pending);
    }
  } else if (pending.stage === 'GENERAL_INCOME_SOURCE') {
    const source = normalizePendingSource(clean);
    if (!source || source.length > 80) return addMessage('app','รบกวนบอกเพิ่ม: ที่มาของรายรับ');
    pending.source = source;
    pending.stage = 'CONFIRM_GENERAL_INCOME';
    saveState();
    return resumeGeneralIncomePrompt(pending);
  }
  addMessage('app','เลือก “ยืนยัน”, “แก้ไข” หรือ “ยกเลิก”');
}

async function handleChatInput(text) {
  const clean = text.trim();
  if (!clean) return;
  const sideAnswer = answerLocalSideQuery(clean);
  if (sideAnswer) {
    addMessage('app', sideAnswer);
    if (state.pendingFlow) resumePendingPrompt({ afterSideQuery:true });
    return;
  }
  if (state.pendingFlow) return handlePendingInput(clean);
  const storeSale = parseStoreSale(clean, state.products);
  if (storeSale) return beginStoreSale(storeSale);
  const parsed = parseGeneralIncome(clean);
  if (parsed) {
    state.pendingFlow = {
      kind:'GENERAL_INCOME',
      stage:parsed.source ? 'CONFIRM_GENERAL_INCOME' : 'GENERAL_INCOME_SOURCE',
      amount:parsed.amount,
      source:parsed.source,
      workflowId:null,
      ledgerTransactionId:null,
    };
    saveState();
    return resumePendingPrompt();
  }
  addMessage('app','ตอนนี้สนามนี้รองรับรายรับทั่วไปแบบ “จำนวนเงิน + ที่มา”, การขายสินค้าที่รู้จักแบบ “สินค้า + มูลค่า + จำนวน” และคำถาม “วันนี้วันที่เท่าไร”');
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

Replace the chat form listener with:

```mjs
chatForm.addEventListener('submit', async event => {
  event.preventDefault();
  const value = chatInput.value;
  chatInput.value = '';
  if (chatSend) chatSend.disabled = true;
  await submitChatText(value);
  chatInput.focus({ preventScroll:true });
});
```

- [ ] **Step 6: Run focused CHAT regressions to verify GREEN**

```bash
node --test tests/greenfield-lighthouse-real-income.test.cjs tests/greenfield-lighthouse-next-demo.test.cjs tests/greenfield-lighthouse-runtime-gate.test.cjs
```

Expected: all focused tests PASS; Store sale parse/confirm contracts remain green.

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
- Consumes: `bridge.readLedgerTruth()` and the `truth` returned by Task 2.
- Produces: `ledgerTruth` as the only authority for Home cash, today income, today expense, net, and Manual Ledger history.
- Preserves: Store demo state under `state.products` and `state.transactions`; Store demo values may not feed real finance totals.

- [ ] **Step 1: Add failing truth-surface tests**

Append to `tests/greenfield-lighthouse-real-income.test.cjs`:

```js
test('Home finance renders from ledgerTruth instead of demo cash defaults', () => {
  const app = fs.readFileSync(appPath, 'utf8');
  assert.match(app, /ledgerTruth\.balanceSatang/);
  assert.match(app, /ledgerTruth\.todayInSatang/);
  assert.match(app, /ledgerTruth\.todayOutSatang/);
  assert.match(app, /ledgerTruth\.netSatang/);
  const start = app.indexOf('function renderHomeTruth()');
  const end = app.indexOf('function resetDemoState', start);
  const body = app.slice(start, end);
  assert.doesNotMatch(body, /state\.cash|state\.todayIncome|state\.todayExpense/);
});

test('Manual Ledger history renders real Ledger transactions only', () => {
  const app = fs.readFileSync(appPath, 'utf8');
  const start = app.indexOf('function renderHistoryDetail()');
  const end = app.indexOf('function openManualTask', start);
  const body = app.slice(start, end);
  assert.match(body, /ledgerTruth\?\.transactions/);
  assert.doesNotMatch(body, /state\.transactions/);
});

test('login loads real Ledger truth before showing the app', () => {
  const app = fs.readFileSync(appPath, 'utf8');
  assert.match(app, /ledgerTruth = await ledgerBridge\.readLedgerTruth\(\)/);
  assert.match(app, /if \(unlocked\) runtimeGate\.lock\(\)/);
});
```

Replace the old Dashboard assertion block in `tests/greenfield-lighthouse-next-demo.test.cjs` with:

```js
assert.match(app, /function renderHomeTruth\(/);
assert.match(app, /ledgerTruth/);
assert.doesNotMatch(app, /function renderHomeTruth\([^)]*\)[\s\S]{0,1200}state\.cash/);
```

Replace the MANUAL Store/History assertions with:

```js
assert.match(app, /function renderStoreDetail\(/);
assert.match(app, /state\.products/);
assert.match(app, /function renderHistoryDetail\(/);
assert.match(app, /ledgerTruth\?\.transactions/);
```

- [ ] **Step 2: Run truth-surface tests and verify RED**

```bash
node --test tests/greenfield-lighthouse-real-income.test.cjs tests/greenfield-lighthouse-next-demo.test.cjs
```

Expected: FAIL because Home and Manual History still read demo state.

- [ ] **Step 3: Load Ledger truth after login and clear it on lock**

Replace `submitLogin` and `lockApp` with:

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
    showLoginGate(code.startsWith('LIGHTHOUSE_LEDGER_') || code === 'RUNTIME_SESSION_LOCKED'
      ? 'ยังอ่านข้อมูลเงินจริงไม่ได้ กรุณาลองใหม่'
      : authMessage(error));
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

- [ ] **Step 4: Render Home real-money values from satang truth only**

Replace `financeSnapshot()` and `renderHomeTruth()` with:

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

In `lighthouse-next/index.html`, make the initial value for each of these IDs exactly `—`:

```html
<strong id="home-cash-value">—</strong>
<strong id="home-expected-value">—</strong>
<strong id="home-income-value">—</strong>
<strong id="home-expense-value">—</strong>
<strong id="home-net-value">—</strong>
<strong id="home-obligation-value">—</strong>
<strong id="home-gap-value">—</strong>
<strong id="home-target-value">—</strong>
```

The existing surrounding cards and labels remain in place.

- [ ] **Step 5: Render Manual finance and Ledger history from real truth**

Replace `renderFinanceDetail()` with:

```mjs
function renderFinanceDetail() {
  const data = manualContent.finance;
  const snapshot = financeSnapshot();
  const rows = [
    ['เงินจริง', snapshot ? formatSatang(snapshot.cashSatang) : '—'],
    ['เงินเข้าวันนี้', snapshot ? formatSatang(snapshot.todayIncomeSatang) : '—'],
    ['เงินออกวันนี้', snapshot ? formatSatang(snapshot.todayExpenseSatang) : '—'],
    ['สุทธิ', snapshot ? `${snapshot.netSatang >= 0 ? '+' : '-'}${formatSatang(Math.abs(snapshot.netSatang))}` : '—'],
    ['ภาระใกล้สุด', 'ยังไม่เชื่อมข้อมูลจริง'],
    ['คาดว่าจะเข้า', '—'],
  ];
  renderStaticDetail(data, rows);
}
```

Replace `renderHistoryDetail()` and add its two helpers:

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

Do not change these Store demo functions in Task 3:

```text
renderStoreDetail
confirmStoreSale
confirmSaleReversal
requestSaleReversal
```

- [ ] **Step 6: Run truth and Store regressions to verify GREEN**

```bash
node --test tests/greenfield-lighthouse-real-income.test.cjs tests/greenfield-lighthouse-next-demo.test.cjs tests/greenfield-lighthouse-runtime-gate.test.cjs
```

Expected: all focused tests PASS; Store sale source contracts remain green.

- [ ] **Step 7: Commit Task 3**

```bash
git add lighthouse-next/app.mjs lighthouse-next/index.html tests/greenfield-lighthouse-real-income.test.cjs tests/greenfield-lighthouse-next-demo.test.cjs
git commit -m "feat: render LIGHTHOUSE finance from real ledger"
```

---

### Task 4: Stage the bridge identically for Web and Android

**Files:**
- Modify: `scripts/stage-lighthouse-next-bundle.mjs`
- Modify: `tests/greenfield-lighthouse-android-stage-contract.test.cjs`
- Modify: `android-shell/test/lighthouse-next-package.test.mjs`

**Interfaces:**
- Consumes: `LIGHTHOUSE_RUNTIME_FILES` and `GREENFIELD_ENTRYPOINTS`.
- Produces: staged `lighthouse-next/runtime-ledger.mjs` and `greenfield/calculation-authority.mjs` for both isolated Web and Android.
- Preserves: forbidden exclusion of `greenfield/master-input-router.mjs`.

- [ ] **Step 1: Write failing staging expectations**

Change `runtimeFiles` in `tests/greenfield-lighthouse-android-stage-contract.test.cjs` to:

```js
const runtimeFiles = [
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
];
```

Change its Greenfield byte-identity loop to:

```js
for (const relative of ['runtime.mjs', 'runtime-session.mjs', 'calculation-authority.mjs']) {
  const source = await fsp.readFile(path.join(root, 'greenfield', relative));
  const staged = await fsp.readFile(path.join(shellRoot, 'www', 'greenfield', relative));
  assert.deepEqual(staged, source, `staged Greenfield bytes drifted for ${relative}`);
}
```

Add to the first package test in `android-shell/test/lighthouse-next-package.test.mjs`:

```mjs
assert.equal(await exists(join(stagedLighthouse, 'runtime-ledger.mjs')), true, 'runtime-ledger.mjs must be staged');
assert.equal(await exists(join(stagedGreenfield, 'calculation-authority.mjs')), true, 'calculation-authority.mjs must be staged');
assert.deepEqual(
  await readFile(join(stagedLighthouse, 'runtime-ledger.mjs')),
  await readFile(join(repoRoot, 'lighthouse-next', 'runtime-ledger.mjs')),
);
assert.deepEqual(
  await readFile(join(stagedGreenfield, 'calculation-authority.mjs')),
  await readFile(join(repoRoot, 'greenfield', 'calculation-authority.mjs')),
);
```

- [ ] **Step 2: Run staging tests and verify RED**

```bash
node --test tests/greenfield-lighthouse-android-stage-contract.test.cjs
cd android-shell && npm test
```

Expected: FAIL because the new app bridge and calculation authority are not in the shared staging lists yet.

- [ ] **Step 3: Extend the shared deterministic staging lists**

Change `scripts/stage-lighthouse-next-bundle.mjs` to include:

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

- [ ] **Step 4: Run Web/Android staging tests to verify GREEN**

```bash
node --test tests/greenfield-lighthouse-android-stage-contract.test.cjs
cd android-shell && npm test && npm run app:stage-next
```

Expected: PASS; staged bytes match source and the existing forbidden-tree test still rejects `greenfield/master-input-router.mjs`.

- [ ] **Step 5: Commit Task 4**

```bash
git add scripts/stage-lighthouse-next-bundle.mjs tests/greenfield-lighthouse-android-stage-contract.test.cjs android-shell/test/lighthouse-next-package.test.mjs
git commit -m "build: stage LIGHTHOUSE real ledger runtime"
```

---

### Task 5: Full gate, scope containment, and owner review checkpoint

**Files:**
- Verify only; no release/version source change expected.

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: fresh full-test evidence and a Draft PR against `main`.
- Does not merge automatically.

- [ ] **Step 1: Run the complete focused LIGHTHOUSE regression set**

```bash
node --test \
  tests/greenfield-lighthouse-real-income.test.cjs \
  tests/greenfield-lighthouse-next-demo.test.cjs \
  tests/greenfield-lighthouse-runtime-gate.test.cjs \
  tests/greenfield-lighthouse-android-stage-contract.test.cjs
```

Expected: 0 failures.

- [ ] **Step 2: Run Android shell tests and staging**

```bash
cd android-shell
npm test
npm run app:stage-next
cd ..
```

Expected: all Android shell tests PASS and staging exits 0.

- [ ] **Step 3: Run the repository deploy gate fresh**

```bash
npm run deploy:gate
```

Expected: `npm test`, syntax checks, and UTF-8 checks all exit 0.

- [ ] **Step 4: Verify scope containment**

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

Run this forbidden-file check:

```bash
forbidden='RELEASE_MANIFEST.json|release/lighthouse-update.json|android-shell/version.json|.github/workflows/lighthouse-owner-build.yml'
git diff --name-only main...HEAD | grep -E "$forbidden" && exit 1 || true
```

Expected: no forbidden path is printed.

- [ ] **Step 5: Open or refresh one Draft PR to `main`**

Use this metadata:

```text
base: main
head: feat/lighthouse-real-income-ledger-20260909
title: LIGHTHOUSE real general income ledger
body: Moves only CHAT general income to verified Greenfield Ledger truth. Home finance and Manual Ledger history read real Ledger state. Store sale remains demo-only. No release/version/APK scope.
```

If using GitHub CLI, the equivalent command is:

```bash
gh pr create --draft --base main --head feat/lighthouse-real-income-ledger-20260909 \
  --title "LIGHTHOUSE real general income ledger" \
  --body "Moves only CHAT general income to verified Greenfield Ledger truth. Home finance and Manual Ledger history read real Ledger state. Store sale remains demo-only. No release/version/APK scope."
```

- [ ] **Step 6: Verify CI on the exact Draft PR head**

Require the workflow run head SHA to equal the current branch head. Then require the PR workflow jobs that execute for this event to finish successfully, including Greenfield safety and isolated LIGHTHOUSE staging/deploy validation. Do not use an older run as evidence.

- [ ] **Step 7: Stop for owner review; do not merge**

Report in simple Thai with exactly these facts:

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
