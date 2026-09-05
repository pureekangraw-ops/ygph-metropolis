# Ledger Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route all MANUAL-domain mutations from CHAT and MANUAL through one Ledger Gateway while preserving Store/Ride/Outcome/Calendar ownership, durable readback, and the separate Module Control Plane.

**Architecture:** Add a thin `Ledger Gateway` coordinator over the existing canonical Manual owner and workflow builders. The public MANUAL service becomes a facade that sends every mutation through the gateway while leaving reads on the existing Manual owner; CHAT gains a `LEDGER_COMMAND` route and sends legacy `LOCAL_MULTI_GROUP` mutation traffic through the same gateway. The gateway is internal composition infrastructure, not a ninth app service and not a replacement for Store/Ride/Outcome/Calendar business logic.

**Tech Stack:** Node.js >=22, ESM `.mjs`, `node:test`, canonical encrypted Greenfield runtime, existing Store/Ride workflow builders.

**Spec:** `docs/superpowers/specs/2026-09-05-ledger-gateway-design.md`

## Global Constraints

- Canonical branch: `feat/lighthouse-1.0.0-rebuild`.
- No separate Leader service.
- Flow: `CHAT / MANUAL -> Ledger Gateway -> Store / Ride / Outcome / Calendar -> Runtime -> durable readback -> caller`.
- Module install/remove/enable/disable/purge remains owned by Module Control Plane.
- Store, Ride, Outcome, Calendar keep their domain ownership; Ledger Gateway coordinates and verifies but does not duplicate business logic.
- Posted financial mutation authority remains Ledger-owned.
- Accepted mutation statuses are only `COMMITTED`, `RECOVERED`, and `VERIFIED`.
- Mutation success requires durable readback.
- Do not alter updater, backup, session, Android native packaging/bootstrap, signer, package identity, release manifest, or Device Gate behavior.
- Do not publish/open a candidate manifest and do not claim Device Gate acceptance from source tests.
- Interactive preview is a behavior/understanding witness only; repository tests and runtime readback remain production evidence.

---

## File Structure

- Create `android-shell/app/public/logic/ledger/ledger-gateway.mjs` — one intake/router/readback coordinator. It calls the existing Manual owner for existing Manual mutations and existing Store/Ride workflow builders for domain workflows.
- Create `android-shell/app/public/logic/manual/manual-ledger-facade.mjs` — preserve the existing MANUAL public API while forcing every mutation through Ledger Gateway; add focused Store/Ride methods needed by the approved behavior.
- Modify `android-shell/app/public/logic/chat/chat-service.mjs` — add `LEDGER_COMMAND`; require readback for its successful mutations.
- Modify `android-shell/app/public/app/stable-service-composition.mjs` — compose raw Manual owner -> Ledger Gateway -> public Manual facade; route CHAT multi-group work through gateway; leave Module Control Plane separate.
- Create `android-shell/test/ledger-gateway.test.mjs` — gateway/facade unit contracts and fail-closed tests.
- Create `android-shell/test/ledger-gateway-stable-integration.test.mjs` — canonical encrypted-runtime behavior contract for CHAT, MANUAL, Store, Ride, Outcome, Calendar and module-boundary behavior.
- Modify `android-shell/test/workunit10-stable-cutover.test.mjs` only where the existing CHAT mutation witness needs to prove the gateway path without weakening prior assertions.

---

### Task 1: Ledger Gateway fail-closed core

**Files:**
- Create: `android-shell/test/ledger-gateway.test.mjs`
- Create: `android-shell/app/public/logic/ledger/ledger-gateway.mjs`

**Interfaces:**
- Consumes: raw Manual owner methods from `createManualFourHouses(runtime)` and runtime methods `readState()` / `executeMultiGroupCommands()`.
- Produces:
  - `createLedgerGateway({ manual, runtime })`
  - `gateway.execute({ operation, payload })`
  - `gateway.executeWorkflow(payloadOrCommands)`
  - `MANUAL_MUTATION_OPERATIONS` exported frozen array/set-compatible value for the facade contract.

- [ ] **Step 1: Write the failing gateway contract tests**

Create `android-shell/test/ledger-gateway.test.mjs` with these first tests:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLedgerGateway } from '../app/public/logic/ledger/ledger-gateway.mjs';

function fixture({ manualResult = { status:'VERIFIED', readback:{ recordId:'TX-1' } }, workflowResult = { status:'COMMITTED', state:{ revision:2 } } } = {}) {
  const calls = [];
  const manual = {
    async addIncome(payload) { calls.push(['addIncome', payload]); return structuredClone(manualResult); },
    async addExpense(payload) { calls.push(['addExpense', payload]); return structuredClone(manualResult); },
  };
  const runtime = {
    async executeMultiGroupCommands(commands) { calls.push(['workflow', commands]); return structuredClone(workflowResult); },
    async readState() { calls.push(['readState']); return { revision:3, domains:{} }; },
  };
  return { calls, manual, runtime };
}

test('gateway routes an allowed Manual mutation and returns verified readback', async () => {
  const { calls, manual, runtime } = fixture();
  const gateway = createLedgerGateway({ manual, runtime });
  const result = await gateway.execute({ operation:'addIncome', payload:{ amountSatang:50000 } });
  assert.equal(result.status, 'VERIFIED');
  assert.deepEqual(result.readback, { recordId:'TX-1' });
  assert.deepEqual(calls[0], ['addIncome', { amountSatang:50000 }]);
});

test('gateway rejects an unknown operation instead of falling through', async () => {
  const { manual, runtime } = fixture();
  const gateway = createLedgerGateway({ manual, runtime });
  await assert.rejects(
    () => gateway.execute({ operation:'disableModule', payload:{ moduleId:'ledger' } }),
    /LEDGER_GATEWAY_OPERATION_UNSUPPORTED:disableModule/,
  );
});

test('gateway fails closed on an unverified mutation result', async () => {
  const { manual, runtime } = fixture({ manualResult:{ status:'MYSTERY', readback:{} } });
  const gateway = createLedgerGateway({ manual, runtime });
  await assert.rejects(
    () => gateway.execute({ operation:'addIncome', payload:{} }),
    /LEDGER_GATEWAY_MUTATION_NOT_VERIFIED:MYSTERY/,
  );
});

test('gateway requires mutation readback', async () => {
  const { manual, runtime } = fixture({ manualResult:{ status:'VERIFIED' } });
  const gateway = createLedgerGateway({ manual, runtime });
  await assert.rejects(
    () => gateway.execute({ operation:'addIncome', payload:{} }),
    /LEDGER_GATEWAY_READBACK_REQUIRED/,
  );
});

test('gateway wraps legacy multi-group execution with durable readback', async () => {
  const { calls, manual, runtime } = fixture({ workflowResult:{ status:'COMMITTED' } });
  const gateway = createLedgerGateway({ manual, runtime });
  const result = await gateway.executeWorkflow({ commands:[{ domain:'LEDGER', type:'LEDGER_CREATE_TRANSACTION' }] });
  assert.equal(result.status, 'COMMITTED');
  assert.equal(result.readback.revision, 3);
  assert.deepEqual(calls.at(-1), ['readState']);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run from `android-shell/`:

```bash
node --test test/ledger-gateway.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `logic/ledger/ledger-gateway.mjs`.

- [ ] **Step 3: Implement the minimal gateway core**

Create `android-shell/app/public/logic/ledger/ledger-gateway.mjs` with the exact boundary shape below. Keep Store/Ride custom workflow operations for Task 4; this task only establishes shared validation and existing Manual mutation routing.

```js
const VERIFIED = new Set(['COMMITTED', 'RECOVERED', 'VERIFIED']);

export const MANUAL_MUTATION_OPERATIONS = Object.freeze([
  'addIncome', 'setTarget', 'editTarget', 'createReceivable', 'receiveReceivable',
  'addExpense', 'setCeiling', 'editCeiling', 'createObligation', 'payObligation',
  'refund', 'reverse', 'createCalendarItem', 'editCalendar', 'rescheduleCalendar',
  'completeCalendar', 'cancelCalendar', 'editLedgerMetadata', 'cancelExpected',
]);

function requiredObject(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(code);
  return value;
}

function verifyMutation(result) {
  if (!VERIFIED.has(result?.status)) throw new Error(`LEDGER_GATEWAY_MUTATION_NOT_VERIFIED:${result?.status ?? 'UNKNOWN'}`);
  if (result.readback == null) throw new Error('LEDGER_GATEWAY_READBACK_REQUIRED');
  return result;
}

export function createLedgerGateway({ manual, runtime } = {}) {
  manual = requiredObject(manual, 'LEDGER_GATEWAY_MANUAL_REQUIRED');
  runtime = requiredObject(runtime, 'LEDGER_GATEWAY_RUNTIME_REQUIRED');
  if (typeof runtime.readState !== 'function' || typeof runtime.executeMultiGroupCommands !== 'function') {
    throw new TypeError('LEDGER_GATEWAY_RUNTIME_METHOD_REQUIRED');
  }

  async function execute({ operation, payload = {} } = {}) {
    const name = String(operation || '').trim();
    if (!MANUAL_MUTATION_OPERATIONS.includes(name)) throw new Error(`LEDGER_GATEWAY_OPERATION_UNSUPPORTED:${name || 'EMPTY'}`);
    if (typeof manual[name] !== 'function') throw new Error(`LEDGER_GATEWAY_HANDLER_MISSING:${name}`);
    return verifyMutation(await manual[name](structuredClone(payload)));
  }

  async function executeWorkflow(value) {
    const commands = Array.isArray(value) ? value : value?.commands;
    if (!Array.isArray(commands) || commands.length === 0) throw new Error('LEDGER_GATEWAY_COMMANDS_REQUIRED');
    const raw = await runtime.executeMultiGroupCommands(structuredClone(commands));
    if (!VERIFIED.has(raw?.status)) throw new Error(`LEDGER_GATEWAY_MUTATION_NOT_VERIFIED:${raw?.status ?? 'UNKNOWN'}`);
    const readback = raw?.state ?? await runtime.readState();
    if (readback == null) throw new Error('LEDGER_GATEWAY_READBACK_REQUIRED');
    return { ...raw, readback:structuredClone(readback) };
  }

  return Object.freeze({ execute, executeWorkflow });
}
```

- [ ] **Step 4: Run the focused tests and verify GREEN**

```bash
node --test test/ledger-gateway.test.mjs
```

Expected: all Task 1 tests PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add android-shell/app/public/logic/ledger/ledger-gateway.mjs android-shell/test/ledger-gateway.test.mjs
git commit -m "feat: add fail-closed Ledger gateway"
```

---

### Task 2: Public MANUAL facade uses Ledger Gateway for every mutation

**Files:**
- Create: `android-shell/app/public/logic/manual/manual-ledger-facade.mjs`
- Modify: `android-shell/test/ledger-gateway.test.mjs`

**Interfaces:**
- Consumes: `createLedgerGateway(...).execute(...)`, raw Manual owner.
- Produces: `createManualLedgerFacade({ manual, gateway })`; read methods keep existing signatures, every mutation method listed in `MANUAL_MUTATION_OPERATIONS` delegates to `gateway.execute({ operation:<method>, payload })`.

- [ ] **Step 1: Add the RED facade tests**

Append:

```js
import { createManualLedgerFacade } from '../app/public/logic/manual/manual-ledger-facade.mjs';

const MUTATIONS = [
  'addIncome', 'setTarget', 'editTarget', 'createReceivable', 'receiveReceivable',
  'addExpense', 'setCeiling', 'editCeiling', 'createObligation', 'payObligation',
  'refund', 'reverse', 'createCalendarItem', 'editCalendar', 'rescheduleCalendar',
  'completeCalendar', 'cancelCalendar', 'editLedgerMetadata', 'cancelExpected',
];

test('Manual facade sends every mutation through Ledger Gateway while reads stay on Manual owner', async () => {
  const routed = [];
  const manual = {
    async dashboard() { return { balanceSatang:1254000 }; },
    ...Object.fromEntries(MUTATIONS.map(name => [name, async () => { throw new Error(`BYPASS:${name}`); }])),
  };
  const gateway = {
    async execute(input) { routed.push(structuredClone(input)); return { status:'VERIFIED', readback:{ operation:input.operation } }; },
  };
  const facade = createManualLedgerFacade({ manual, gateway });

  for (const name of MUTATIONS) {
    const result = await facade[name]({ marker:name });
    assert.equal(result.readback.operation, name);
  }
  assert.deepEqual(await facade.dashboard(), { balanceSatang:1254000 });
  assert.deepEqual(routed.map(item => item.operation), MUTATIONS);
});
```

- [ ] **Step 2: Run and verify RED**

```bash
node --test test/ledger-gateway.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `manual-ledger-facade.mjs`.

- [ ] **Step 3: Implement the minimal facade**

Create:

```js
import { MANUAL_MUTATION_OPERATIONS } from '../ledger/ledger-gateway.mjs';

function owner(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(code);
  return value;
}

export function createManualLedgerFacade({ manual, gateway } = {}) {
  manual = owner(manual, 'MANUAL_LEDGER_FACADE_OWNER_REQUIRED');
  gateway = owner(gateway, 'MANUAL_LEDGER_FACADE_GATEWAY_REQUIRED');
  if (typeof gateway.execute !== 'function') throw new TypeError('MANUAL_LEDGER_FACADE_EXECUTE_REQUIRED');

  const facade = { ...manual };
  for (const operation of MANUAL_MUTATION_OPERATIONS) {
    if (typeof manual[operation] !== 'function') throw new Error(`MANUAL_LEDGER_FACADE_METHOD_REQUIRED:${operation}`);
    facade[operation] = payload => gateway.execute({ operation, payload });
  }
  return Object.freeze(facade);
}
```

- [ ] **Step 4: Run focused tests and verify GREEN**

```bash
node --test test/ledger-gateway.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add android-shell/app/public/logic/manual/manual-ledger-facade.mjs android-shell/test/ledger-gateway.test.mjs
git commit -m "feat: route Manual mutations through Ledger gateway"
```

---

### Task 3: CHAT and stable composition share the same Ledger Gateway

**Files:**
- Modify: `android-shell/app/public/logic/chat/chat-service.mjs`
- Modify: `android-shell/app/public/app/stable-service-composition.mjs`
- Create: `android-shell/test/ledger-gateway-stable-integration.test.mjs`

**Interfaces:**
- CHAT adds route `LEDGER_COMMAND` whose payload is `{ operation, payload }` and delegates to `ledger.execute(...)`.
- Existing `DIRECT_COMMAND` remains Module Control Plane only.
- Stable composition creates `manualOwner`, `ledgerGateway`, and public `manual` facade in that order.
- Stable composition passes `multiGroup: ledgerGateway.executeWorkflow` to CHAT so the legacy `LOCAL_MULTI_GROUP` mutation path also crosses the gateway boundary.

- [ ] **Step 1: Write the RED CHAT route test**

In `android-shell/test/ledger-gateway-stable-integration.test.mjs` start with a lightweight CHAT contract:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatService } from '../app/public/logic/chat/chat-service.mjs';

function memoryMetadataStore() {
  const values = new Map();
  return {
    async get(key) { return values.has(key) ? structuredClone(values.get(key)) : null; },
    async put(key, value) { values.set(key, structuredClone(value)); },
  };
}

test('CHAT LEDGER_COMMAND uses Ledger Gateway and requires verified readback', async () => {
  const calls = [];
  const chat = createChatService({
    store:memoryMetadataStore(),
    modules:{ execute:async () => ({ status:'VERIFIED', readback:{} }) },
    ledger:{ execute:async input => { calls.push(structuredClone(input)); return { status:'VERIFIED', readback:{ ledger:true } }; } },
  });
  const response = await chat.dispatch({
    requestId:'REQ-LEDGER-1',
    route:'LEDGER_COMMAND',
    payload:{ operation:'addIncome', payload:{ amountSatang:50000 } },
  });
  assert.equal(response.status, 'SUCCESS');
  assert.equal(response.result.readback.ledger, true);
  assert.deepEqual(calls, [{ operation:'addIncome', payload:{ amountSatang:50000 } }]);
});
```

- [ ] **Step 2: Run and verify RED**

```bash
node --test test/ledger-gateway-stable-integration.test.mjs
```

Expected: FAIL with `CHAT_ROUTE_UNSUPPORTED:LEDGER_COMMAND`.

- [ ] **Step 3: Add `LEDGER_COMMAND` to CHAT**

Make these minimal changes in `chat-service.mjs`:

```js
const ROUTES = new Set(['DIRECT_COMMAND', 'LEDGER_COMMAND', 'LOCAL_QUERY', 'LOCAL_MULTI_GROUP', 'RECOVERY', 'PROVIDER']);
```

Change the factory signature to accept `ledger = null`, then in `executeRoute` insert before `LOCAL_QUERY`:

```js
if (intent.route === 'LEDGER_COMMAND') {
  if (!ledger || typeof ledger.execute !== 'function') throw new Error('CHAT_LEDGER_GATEWAY_REQUIRED');
  return ledger.execute(intent.payload);
}
```

Expand the mutation-readback guard in `successResult`:

```js
if (['DIRECT_COMMAND', 'LEDGER_COMMAND', 'LOCAL_MULTI_GROUP'].includes(intent.route) && raw?.readback == null) {
  throw new Error('CHAT_MUTATION_READBACK_REQUIRED');
}
```

- [ ] **Step 4: Run the CHAT test and verify GREEN**

```bash
node --test test/ledger-gateway-stable-integration.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Wire stable composition through one gateway**

Change composition order to:

```js
import { createLedgerGateway } from '../logic/ledger/ledger-gateway.mjs';
import { createManualLedgerFacade } from '../logic/manual/manual-ledger-facade.mjs';

const manualOwner = createManualFourHouses(runtime);
const ledgerGateway = createLedgerGateway({ manual:manualOwner, runtime });
const manual = createManualLedgerFacade({ manual:manualOwner, gateway:ledgerGateway });
const control = createModuleControlPlane({ store, now });
await control.initialize();
const apps = createBundledModuleServices({ manual });
```

Replace the old direct-runtime `multiGroup` helper with:

```js
const multiGroup = payload => ledgerGateway.executeWorkflow(payload);
```

Pass the gateway into CHAT:

```js
const chat = createChatService({
  store,
  modules,
  ledger:ledgerGateway,
  query,
  multiGroup,
  recovery,
  provider,
  now,
});
```

Do not expose `ledgerGateway` as a ninth app service.

- [ ] **Step 6: Add stable composition integration witnesses**

Extend `ledger-gateway-stable-integration.test.mjs` with the same canonical fixture pattern used by `workunit10-stable-cutover.test.mjs`: `createGreenfieldState`, `createMemoryVaultStore`, `commitEncryptedState`, `createCanonicalGreenfieldRuntime`, external service owners, and `createStableAppServices`.

Add these two assertions:

```js
test('stable CHAT Ledger command and MANUAL addIncome both commit durable Ledger truth', async () => {
  const { runtime } = await canonicalFixture();
  const services = await createStableAppServices({ runtime, ...externalOwners(), now:() => NOW });

  const chat = await services.chat.dispatch({
    requestId:'REQ-GATEWAY-INCOME-1',
    route:'LEDGER_COMMAND',
    payload:{ operation:'addIncome', payload:{
      workflowId:'WF-GATEWAY-CHAT-1',
      recordId:'TX-GATEWAY-CHAT-1',
      title:'ร้านค้า gateway witness',
      amountSatang:50000,
    } },
  });
  assert.equal(chat.status, 'SUCCESS');
  assert.equal(chat.result.readback.recordId, 'TX-GATEWAY-CHAT-1');

  const manual = await services.manual.addIncome({
    workflowId:'WF-GATEWAY-MANUAL-1',
    recordId:'TX-GATEWAY-MANUAL-1',
    title:'manual gateway witness',
    amountSatang:35000,
  });
  assert.equal(manual.status, 'VERIFIED');

  const durable = await runtime.readState();
  assert.equal(durable.domains.LEDGER.records['TX-GATEWAY-CHAT-1']?.record?.amountSatang, 50000);
  assert.equal(durable.domains.LEDGER.records['TX-GATEWAY-MANUAL-1']?.record?.amountSatang, 35000);
});
```

And prove the old multi-group route still returns durable readback after moving behind the gateway:

```js
test('stable CHAT LOCAL_MULTI_GROUP still commits but now returns gateway readback', async () => {
  const { runtime } = await canonicalFixture();
  const services = await createStableAppServices({ runtime, ...externalOwners(), now:() => NOW });
  const workflow = buildOtherIncomeWorkflow({
    workflowId:'WF-GATEWAY-MULTI-1',
    ledgerTransactionId:'TX-GATEWAY-MULTI-1',
    amountSatang:4321,
    title:'legacy multi gateway witness',
  });
  const response = await services.chat.dispatch({
    requestId:'REQ-GATEWAY-MULTI-1',
    route:'LOCAL_MULTI_GROUP',
    payload:{ commands:workflow.commands },
  });
  assert.equal(response.status, 'SUCCESS');
  assert.equal(response.result.readback.domains.LEDGER.records['TX-GATEWAY-MULTI-1']?.record?.amountSatang, 4321);
});
```

- [ ] **Step 7: Run affected tests**

```bash
node --test test/ledger-gateway.test.mjs test/ledger-gateway-stable-integration.test.mjs test/workunit4-chat-service.test.mjs test/workunit10-stable-cutover.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit Task 3**

```bash
git add android-shell/app/public/logic/chat/chat-service.mjs android-shell/app/public/app/stable-service-composition.mjs android-shell/test/ledger-gateway-stable-integration.test.mjs
git commit -m "feat: route Chat and Manual through Ledger gateway"
```

---

### Task 4: Route Store and Ride income through the same gateway without merging their domain owners

**Files:**
- Modify: `android-shell/app/public/logic/ledger/ledger-gateway.mjs`
- Modify: `android-shell/app/public/logic/manual/manual-ledger-facade.mjs`
- Modify: `android-shell/test/ledger-gateway-stable-integration.test.mjs`

**Interfaces:**
- New gateway operations: `storeSale`, `rideStartRound`, `rideJob`, `rideEndRound`.
- Public MANUAL facade exposes methods with those same names.
- Store workflow uses existing `buildSaleWorkflow`.
- Ride workflows use existing `buildRideStartRoundWorkflow`, `buildRideJobWorkflow`, `buildRideEndRoundWorkflow`.
- The gateway executes their command lists through `executeWorkflow`; it does not recreate Store/Ride logic.

- [ ] **Step 1: Write RED Store and Ride integration tests**

Add:

```js
test('Store sale goes through gateway and preserves Store + Ledger ownership', async () => {
  const { runtime } = await canonicalFixture();
  const services = await createStableAppServices({ runtime, ...externalOwners(), now:() => NOW });
  const result = await services.manual.storeSale({
    workflowId:'WF-GATEWAY-STORE-1',
    saleId:'SALE-GATEWAY-1',
    ledgerTransactionId:'TX-GATEWAY-STORE-1',
    title:'ขายสินค้า',
    amountSatang:50000,
    receivedSatang:50000,
    storeCostSatang:0,
    quantity:1,
  });
  assert.ok(['COMMITTED','RECOVERED','VERIFIED'].includes(result.status));
  const state = result.readback;
  assert.equal(state.domains.STORE.records['SALE-GATEWAY-1']?.record?.type, 'SALE');
  assert.equal(state.domains.LEDGER.records['TX-GATEWAY-STORE-1']?.record?.direction, 'IN');
  assert.equal(state.domains.LEDGER.records['TX-GATEWAY-STORE-1']?.record?.sourceRef, 'STORE/SALE-GATEWAY-1');
});

test('Ride job goes through gateway and preserves Ride + Ledger ownership', async () => {
  const { runtime } = await canonicalFixture();
  const services = await createStableAppServices({ runtime, ...externalOwners(), now:() => NOW });
  await services.manual.rideStartRound({ workflowId:'WF-RIDE-START-1', roundId:'ROUND-GATEWAY-1' });
  const result = await services.manual.rideJob({
    workflowId:'WF-RIDE-JOB-1',
    roundId:'ROUND-GATEWAY-1',
    jobId:'JOB-GATEWAY-1',
    ledgerTransactionId:'TX-GATEWAY-RIDE-1',
    amountSatang:35000,
    paymentMode:'CASH',
    note:'รอบเช้า',
  });
  const state = result.readback;
  assert.equal(state.domains.RIDE.records['JOB-GATEWAY-1']?.record?.amountSatang, 35000);
  assert.equal(state.domains.LEDGER.records['TX-GATEWAY-RIDE-1']?.record?.direction, 'IN');
  assert.equal(state.domains.LEDGER.records['TX-GATEWAY-RIDE-1']?.record?.sourceRef, 'RIDE/JOB-GATEWAY-1');
});
```

- [ ] **Step 2: Run and verify RED**

```bash
node --test test/ledger-gateway-stable-integration.test.mjs
```

Expected: FAIL because `storeSale` / `rideStartRound` / `rideJob` are not exposed yet.

- [ ] **Step 3: Add Store/Ride gateway operations using existing builders**

At the top of `ledger-gateway.mjs` import:

```js
import { buildSaleWorkflow } from '../domains/business-workflows.mjs';
import { buildRideStartRoundWorkflow, buildRideJobWorkflow, buildRideEndRoundWorkflow } from '../domains/ride-workflows.mjs';
```

Inside `execute`, before the Manual-operation check, route the custom operations:

```js
if (name === 'storeSale') return executeWorkflow(buildSaleWorkflow(payload).commands);
if (name === 'rideStartRound') return executeWorkflow(buildRideStartRoundWorkflow(payload).commands);
if (name === 'rideJob') return executeWorkflow(buildRideJobWorkflow(payload).commands);
if (name === 'rideEndRound') return executeWorkflow(buildRideEndRoundWorkflow(payload).commands);
```

These operations must still go through the same `verify/status/readback` behavior in `executeWorkflow`.

- [ ] **Step 4: Expose Store/Ride methods on the MANUAL facade**

After overriding existing mutation methods, add:

```js
for (const operation of ['storeSale', 'rideStartRound', 'rideJob', 'rideEndRound']) {
  facade[operation] = payload => gateway.execute({ operation, payload });
}
```

- [ ] **Step 5: Run and verify GREEN**

```bash
node --test test/ledger-gateway.test.mjs test/ledger-gateway-stable-integration.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Add the CHAT-side behavior witness that matches the approved training-ground flow**

Add one integration test using `LEDGER_COMMAND` with `operation:'storeSale'` and assert that the CHAT response readback contains both the Store sale and Ledger transaction. This is the repository acceptance contract for the behavior already agreed in the interactive training ground:

```js
test('CHAT store income witness matches training-ground behavior: Ledger receives, routes Store, returns readback', async () => {
  const { runtime } = await canonicalFixture();
  const services = await createStableAppServices({ runtime, ...externalOwners(), now:() => NOW });
  const response = await services.chat.dispatch({
    requestId:'REQ-TRAINING-STORE-1',
    route:'LEDGER_COMMAND',
    payload:{ operation:'storeSale', payload:{
      workflowId:'WF-TRAINING-STORE-1',
      saleId:'SALE-TRAINING-1',
      ledgerTransactionId:'TX-TRAINING-STORE-1',
      title:'ขายสินค้า',
      amountSatang:50000,
      receivedSatang:50000,
      storeCostSatang:0,
      quantity:1,
    } },
  });
  assert.equal(response.status, 'SUCCESS');
  assert.equal(response.result.readback.domains.STORE.records['SALE-TRAINING-1']?.record?.title, 'ขายสินค้า');
  assert.equal(response.result.readback.domains.LEDGER.records['TX-TRAINING-STORE-1']?.record?.amountSatang, 50000);
});
```

- [ ] **Step 7: Commit Task 4**

```bash
git add android-shell/app/public/logic/ledger/ledger-gateway.mjs android-shell/app/public/logic/manual/manual-ledger-facade.mjs android-shell/test/ledger-gateway-stable-integration.test.mjs
git commit -m "feat: route Store and Ride through Ledger gateway"
```

---

### Task 5: Lock the module boundary and full regression gate

**Files:**
- Modify: `android-shell/test/ledger-gateway.test.mjs`
- Modify: `android-shell/test/workunit10-stable-cutover.test.mjs` only if necessary to preserve the existing cutover witness after composition changes.

**Interfaces:**
- Ledger Gateway has no module lifecycle methods and cannot execute module lifecycle commands.
- `services.modules` continues to be the existing Module Control Plane API.
- `services` remains exactly the eight canonical app owners.

- [ ] **Step 1: Add the module-separation contract**

Append:

```js
test('Ledger Gateway cannot absorb module lifecycle authority', async () => {
  const { manual, runtime } = fixture();
  const gateway = createLedgerGateway({ manual, runtime });
  for (const operation of ['installModule', 'removeModule', 'disableModule', 'enableModule', 'purgeModule']) {
    await assert.rejects(
      () => gateway.execute({ operation, payload:{ moduleId:'ledger' } }),
      new RegExp(`LEDGER_GATEWAY_OPERATION_UNSUPPORTED:${operation}`),
    );
  }
});
```

In the stable integration suite, assert:

```js
assert.deepEqual(Object.keys(services).sort(), ['backup','chat','events','manual','modules','recovery','session','updates']);
assert.equal(typeof services.modules.execute, 'function');
assert.equal(typeof services.manual.storeSale, 'function');
assert.equal(typeof services.manual.rideJob, 'function');
```

- [ ] **Step 2: Run focused affected suites**

```bash
node --test \
  test/ledger-gateway.test.mjs \
  test/ledger-gateway-stable-integration.test.mjs \
  test/manual-four-houses-contract.test.mjs \
  test/workunit3-module-control-plane.test.mjs \
  test/workunit4-chat-service.test.mjs \
  test/workunit7-bundled-modules.test.mjs \
  test/workunit10-stable-cutover.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run the complete Android-shell test suite**

```bash
npm test
```

Expected: all tests PASS; no updater/native/signing files should have been changed by this feature.

- [ ] **Step 4: Run trusted-source staging/import closure checks**

Because `sync-trusted-brain.mjs` recursively copies `android-shell/app/public` to `www/trusted/source/app`, run:

```bash
npm run pretest
node --test test/workunit1-import-closure.test.mjs test/trusted-brain-packaging.test.mjs test/workunit10-canonical-packaging.test.mjs test/workunit10-packaged-entrypoint.test.mjs
```

Expected: PASS and the new gateway/facade imports resolve after canonical source staging.

- [ ] **Step 5: Review the diff against the approved behavior before final commit**

Confirm all of these are true from the diff and test output:

```text
CHAT manual mutation -> Ledger Gateway
MANUAL mutation -> Ledger Gateway
Store remains STORE owner
Ride remains RIDE owner
Outcome remains Ledger OUT transaction path
Calendar remains CALENDAR owner
Ledger verifies mutation/readback
Module lifecycle remains Module Control Plane
No ninth app service
No updater/Android/release-manifest change
```

If any line is false, do not reinterpret the design; fix implementation to match the approved behavior.

- [ ] **Step 6: Commit the final contract/regression changes**

```bash
git add android-shell/test/ledger-gateway.test.mjs android-shell/test/ledger-gateway-stable-integration.test.mjs android-shell/test/workunit10-stable-cutover.test.mjs
git commit -m "test: lock Ledger gateway authority boundaries"
```

---

## Final Verification

Run from `android-shell/`:

```bash
npm run pretest
npm test
```

Then inspect `git diff <pre-feature-head>..HEAD -- android-shell/app/public android-shell/test` and verify the implementation matches the approved training-ground behavior rather than inventing a new flow.

Source/test completion means **IMPLEMENTED / MODULE_VERIFIED at source level only**. It does not mean WU10 accepted, physical-device accepted, updater accepted, or candidate manifest authorized.
