# Chat ↔ Manual Context Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect Chat and Manual through one stable record reference while every business fact is resolved from current Ledger/Runtime truth.

**Architecture:** Add a small data-only reference contract, then extend the existing Manual and Master Input modules with reference-based entry points. `ui/app.mjs` coordinates in-memory navigation context; all mutation and readback remain on the existing Manual/Intent → Runtime path.

**Tech Stack:** Node.js ESM, browser DOM modules, Greenfield Runtime, node:test.

**Spec:** `docs/superpowers/specs/2026-09-01-chat-manual-context-bridge-design.md`

## Global Constraints

- Reference crosses; Truth does not copy.
- Reference fields are exactly `version`, `owner`, and `recordId`.
- Supported owners in this phase are `LEDGER` and `CALENDAR`.
- Missing, invalid, stale, and wrong-owner references fail closed without guessing or creating records.
- Chat and Manual mutations must continue through existing facades and Runtime authority.
- No bridge store, new persistence, Chat history, top-level navigation redesign, Reminder, Repeat, or new Manual business function.
- Preserve the originating surface state and reopen the same reference after readback.

---

### Task 1: Stable reference contract

**Files:**
- Create: `greenfield/context-reference.mjs`
- Create: `tests/greenfield-context-reference.test.cjs`
- Modify: `package.json`
- Modify: `RELEASE_MANIFEST.json`
- Modify: `sw.js`

**Interfaces:**
- Produces: `createRecordReference(input) -> frozen {version:1, owner, recordId}`.
- Produces: `resolveRecordReference(manual, input) -> Promise<{reference, record, type}>`.

- [ ] **Step 1: Write failing contract tests**

```js
test('reference carries identity only and is immutable', async () => {
  const ref = createRecordReference({version:1, owner:'LEDGER', recordId:'TX-1'});
  assert.deepEqual(ref, {version:1, owner:'LEDGER', recordId:'TX-1'});
  assert.equal(Object.isFrozen(ref), true);
});

test('reference rejects copied truth and missing records', async () => {
  assert.throws(() => createRecordReference({version:1, owner:'LEDGER', recordId:'TX-1', amountSatang:6500}), /CONTEXT_REFERENCE_INVALID/);
  await assert.rejects(resolveRecordReference({getRecord:async()=>null}, {version:1, owner:'LEDGER', recordId:'TX-X'}), /CONTEXT_REFERENCE_NOT_FOUND/);
});
```

- [ ] **Step 2: Run `node --test tests/greenfield-context-reference.test.cjs` and observe failure because the module is absent.**

- [ ] **Step 3: Implement minimal validation and resolver**

```js
const OWNERS = new Set(['LEDGER','CALENDAR']);
export function createRecordReference(input) {
  if (!input || Object.keys(input).sort().join(',') !== 'owner,recordId,version') throw new Error('CONTEXT_REFERENCE_INVALID');
  if (input.version !== 1 || !OWNERS.has(input.owner) || !String(input.recordId).trim()) throw new Error('CONTEXT_REFERENCE_INVALID');
  return Object.freeze({version:1, owner:input.owner, recordId:String(input.recordId).trim()});
}
export async function resolveRecordReference(manual, input) {
  const reference = createRecordReference(input);
  const record = await manual.getRecord(reference.owner, reference.recordId);
  if (!record) throw new Error('CONTEXT_REFERENCE_NOT_FOUND');
  return Object.freeze({reference, record:Object.freeze(structuredClone(record)), type:record.type});
}
```

- [ ] **Step 4: Add the module to syntax/publication/offline asset gates and rerun the focused test plus `npm run check:syntax`.**

- [ ] **Step 5: Commit `feat: add stable context reference contract`.**

### Task 2: Reference-driven Manual Detail and readback refresh

**Files:**
- Modify: `ui/manual-finance-ui.mjs`
- Create: `tests/greenfield-manual-context-bridge.test.cjs`

**Interfaces:**
- Consumes: `resolveRecordReference(manual, reference)`.
- Produces: `manualUi.openReference(reference)`.
- Produces: `manualUi.peekReference(reference)`.
- Produces: `manualUi.captureContext()` and `manualUi.restoreContext(context)`.

- [ ] **Step 1: Write failing behavior tests proving exact-owner resolve, stale-record failure, and same-Detail refresh after mutation.**

```js
const opened = await ui.openReference({version:1, owner:'LEDGER', recordId:'OBL-1'});
assert.equal(opened.record.recordId, 'OBL-1');
await ui.refreshActiveDetail();
assert.equal(document.getElementById('outcomeDetail').dataset.recordDetail, 'OBL-1');
await assert.rejects(ui.openReference({version:1, owner:'CALENDAR', recordId:'OBL-1'}), /CONTEXT_REFERENCE_NOT_FOUND/);
```

- [ ] **Step 2: Run the focused test and confirm failure because the entry points do not exist.**

- [ ] **Step 3: Replace record-object navigation with canonical reference navigation.**

```js
async function openReference(input) {
  const resolved = await resolveRecordReference(getManual(), input);
  activeReference = resolved.reference;
  if (resolved.reference.owner === 'CALENDAR') return openCalendarDetail(resolved.record);
  if (resolved.type === 'RECEIVABLE') return openReceivableDetail(resolved.record);
  if (resolved.type === 'OBLIGATION') return openOutcomeDetail(resolved.record);
  return openLedgerDetail(resolved.record);
}
```

- [ ] **Step 4: Make every Detail resolver fail on a missing current record instead of `current || record`, and have `mutate()` reopen `activeReference` after `onChanged()` completes.**

- [ ] **Step 5: Add `Ask about this` and bridge-back controls through injected callbacks without adding mutation logic.**

- [ ] **Step 6: Run Manual bridge tests and the existing Manual tests; commit `feat: open manual detail by stable reference`.**

### Task 3: Chat subject context, Peek, and Open

**Files:**
- Modify: `ui/master-input.mjs`
- Modify: `ui/master-input.css`
- Modify: `tests/master-input-ui-fixture.cjs`
- Create: `tests/greenfield-master-input-context-bridge.test.cjs`

**Interfaces:**
- Produces: `configureMasterInputBridge({peek, open, back})`.
- Produces: `setMasterInputSubject({subject, reference})`.
- Produces: `captureMasterInputContext()` and `restoreMasterInputContext(context)`.
- Consumes: fresh Peek result from the Manual bridge callback.

- [ ] **Step 1: Extend the UI fixture and write failing tests for subject context and identity-only interpretation payload.**

```js
setMasterInputSubject({subject:'ค่าบ้าน', reference:{version:1, owner:'LEDGER', recordId:'OBL-HOME'}});
assert.equal(document.getElementById('masterInputSubject').textContent, 'ค่าบ้าน');
await submit('รายการนี้ต้องทำอะไร');
assert.deepEqual(fetchBody.context.reference, {version:1, owner:'LEDGER', recordId:'OBL-HOME'});
assert.equal('amountSatang' in fetchBody.context.reference, false);
```

- [ ] **Step 2: Run the focused test and observe missing exports/surface.**

- [ ] **Step 3: Add one subject strip and in-memory active subject reference to the existing Master Input shell.**

- [ ] **Step 4: Send only `{subject, reference}` in interpreter context and keep local execution authority unchanged.**

- [ ] **Step 5: After proven readback, derive a LEDGER reference from `readback.recordId` or `readback.record.recordId`; render Peek/Open actions only when identity is proven.**

- [ ] **Step 6: Implement Peek as a fresh callback resolve and Open as a reference callback; never retain Peek business data as active Truth.**

- [ ] **Step 7: Run Master Input context and existing phase-one UI tests; commit `feat: carry record context in master input`.**

### Task 4: Composition-root navigation context

**Files:**
- Modify: `ui/app.mjs`
- Modify: `tests/greenfield-chat-manual-context-bridge.test.cjs`

**Interfaces:**
- Consumes: Manual and Master Input bridge APIs from Tasks 2 and 3.
- Produces: exact Chat → Manual → Chat and Manual → Chat → Manual return behavior.

- [ ] **Step 1: Write a failing composition test that rejects route reset to Home and asserts the same reference survives both directions.**

```js
await bridge.openManual(ref);
assert.equal(manualUi.captureContext().reference.recordId, ref.recordId);
bridge.backToChat();
assert.equal(captureMasterInputContext().subject.reference.recordId, ref.recordId);
```

- [ ] **Step 2: Run the focused test and confirm no composition bridge exists.**

- [ ] **Step 3: Configure callbacks in `ui/app.mjs`; retain only current UI origin snapshots in module memory.**

- [ ] **Step 4: Chat Open captures Chat state, activates Finance without resetting unrelated state, and calls `manualUi.openReference(reference)`.**

- [ ] **Step 5: Manual Ask captures Manual state, sets Chat subject, focuses the existing composer, and supports returning to the same Manual reference.**

- [ ] **Step 6: Run bridge composition and navigation regressions; commit `feat: preserve chat manual navigation context`.**

### Task 5: Acceptance proof and release gates

**Files:**
- Modify: `tests/greenfield-chat-manual-context-bridge.test.cjs`
- Create: `docs/chat-manual-context-bridge-checkpoint.md`

**Interfaces:**
- Consumes: all bridge interfaces.
- Produces: exact acceptance evidence bound to the final commit.

- [ ] **Step 1: Prove Chat → Reference → Manual Detail → current Truth.**
- [ ] **Step 2: Prove Manual Detail → Reference → Chat Context.**
- [ ] **Step 3: Prove Action → existing Runtime commit → durable readback → same refreshed Detail.**
- [ ] **Step 4: Prove Back restores the prior context without Home reset.**
- [ ] **Step 5: Add negative assertions for Truth copy, duplicate/wrong record, missing-reference guessing, direct Core access, mutation bypass, bridge persistence, and fake success.**
- [ ] **Step 6: Run `npm test`, `npm run check:syntax`, `npm run check:utf8`, and `git diff --check`.**
- [ ] **Step 7: Record exact test counts and final commit in the checkpoint; commit `docs: record chat manual bridge acceptance`.**
