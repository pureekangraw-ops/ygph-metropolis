# LIGHT HOUSE PATH Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the LIGHT HOUSE PATH foundation with the deterministic vertical slice `ข้าว 65` → normalized Required Result → Direct Path → existing `runtime.expense()` → durable LEDGER readback → `COMPLETE`, while keeping Pattern/AI/Manual/API/Automation as replaceable peer input adapters.

**Architecture:** Add a small `lighthouse/` layer above the existing Greenfield Runtime. Input adapters only normalize; `source` is provenance, never authority. The deterministic Path Kernel validates a source-neutral PATH Contract, chooses the smallest legal capability, bypasses Gem Processing when transformation is unnecessary, and declares `COMPLETE` only after durable readback proves the Required Result.

**Tech Stack:** Vanilla ES modules, Node.js built-in test runner, existing Greenfield Runtime/Workflow/Persistence APIs.

**Spec:** `docs/superpowers/specs/2026-08-28-lighthouse-path-foundation-design.md` plus owner-approved amendment `docs/superpowers/specs/2026-08-28-lighthouse-path-foundation-owner-amendment.md`.

## Global Constraints

- PATH must not depend structurally on Pattern, AI, Manual, API, or Automation.
- `source` is provenance only and MUST NOT grant routing or execution authority.
- Required Result drives route selection.
- Existing Greenfield Runtime remains legal mutation authority.
- No direct Vault writes from LIGHT HOUSE modules.
- Current durable domains remain only `STORE`, `LEDGER`, `CALENDAR`, `RIDE`.
- Direct Path must bypass Gem Processing completely.
- AI/provider/API-key work is out of scope for this plan.
- No production deployment or Current-pointer promotion from this branch.
- New tests use the existing `tests/greenfield-*.test.cjs` naming gate so `npm test` executes them automatically.

---

### Task 1: Source-neutral PATH Contract

**Files:**
- Create: `lighthouse/path-contract.mjs`
- Test: `tests/greenfield-lighthouse-path-contract.test.cjs`

**Interfaces:**
- Produces: `validatePathRequest(request)` returning a deeply frozen normalized copy.
- Consumes: `{ version, source, action, object, fields, requiredResult }`.
- Foundation accepts `CREATE/EXPENSE` and a `LEDGER_TRANSACTION` Required Result; future objects may be added without changing source semantics.

- [ ] **Step 1: Write failing contract tests**

```js
"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

const base = source => ({
  version:'1', source, action:'CREATE', object:'EXPENSE',
  fields:{ title:'ข้าว', amountSatang:6500 },
  requiredResult:{
    kind:'LEDGER_TRANSACTION',
    effect:{ direction:'OUT', subtype:'EXPENSE', title:'ข้าว', amountSatang:6500 },
  },
});

test('PATH Contract accepts the same required result from Pattern or AI without source authority', async () => {
  const { validatePathRequest } = await import('../lighthouse/path-contract.mjs');
  const pattern = validatePathRequest(base('PATTERN'));
  const ai = validatePathRequest(base('AI'));
  assert.equal(pattern.source, 'PATTERN');
  assert.equal(ai.source, 'AI');
  assert.deepEqual(pattern.requiredResult, ai.requiredResult);
  assert.deepEqual(pattern.fields, ai.fields);
});

test('PATH Contract rejects missing Required Result instead of inferring one', async () => {
  const { validatePathRequest } = await import('../lighthouse/path-contract.mjs');
  const input = base('PATTERN');
  delete input.requiredResult;
  assert.throws(() => validatePathRequest(input), /PATH_REQUIRED_RESULT_REQUIRED/);
});

test('PATH Contract rejects a required effect that disagrees with normalized fields', async () => {
  const { validatePathRequest } = await import('../lighthouse/path-contract.mjs');
  const input = base('PATTERN');
  input.requiredResult.effect.amountSatang = 6600;
  assert.throws(() => validatePathRequest(input), /PATH_REQUIRED_RESULT_MISMATCH/);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/greenfield-lighthouse-path-contract.test.cjs`

Expected: FAIL because `lighthouse/path-contract.mjs` does not exist.

- [ ] **Step 3: Implement minimum validator**

Implement `validatePathRequest()` with explicit source allowlist `PATTERN | AI | MANUAL | API | AUTOMATION`, safe positive integer `amountSatang`, non-empty title, exact `CREATE/EXPENSE` foundation shape, and exact Required Result consistency. Clone before freezing so caller mutation cannot change the accepted request.

- [ ] **Step 4: Run GREEN**

Run: `node --test tests/greenfield-lighthouse-path-contract.test.cjs`

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

Commit message: `feat: add source-neutral LIGHT HOUSE path contract`

---

### Task 2: Replaceable deterministic Pattern adapter

**Files:**
- Create: `lighthouse/pattern-input.mjs`
- Test: `tests/greenfield-lighthouse-pattern-input.test.cjs`

**Interfaces:**
- Produces: `normalizePatternInput(text)`.
- Match result: `{ status:'MATCH', request:<PATH request> }`.
- Non-match result: `{ status:'NO_MATCH', source:'PATTERN' }`.
- The adapter must not execute, select capabilities, or call Path Kernel.

- [ ] **Step 1: Write failing Pattern tests**

```js
"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

test('golden deterministic Pattern normalizes ข้าว 65', async () => {
  const { normalizePatternInput } = await import('../lighthouse/pattern-input.mjs');
  const result = normalizePatternInput('ข้าว 65');
  assert.equal(result.status, 'MATCH');
  assert.equal(result.request.source, 'PATTERN');
  assert.equal(result.request.object, 'EXPENSE');
  assert.equal(result.request.fields.title, 'ข้าว');
  assert.equal(result.request.fields.amountSatang, 6500);
  assert.equal(result.request.requiredResult.effect.amountSatang, 6500);
});

test('unknown title plus amount is NO_MATCH, not guessed expense', async () => {
  const { normalizePatternInput } = await import('../lighthouse/pattern-input.mjs');
  assert.deepEqual(normalizePatternInput('foo 65'), { status:'NO_MATCH', source:'PATTERN' });
  assert.deepEqual(normalizePatternInput('ขาย 800'), { status:'NO_MATCH', source:'PATTERN' });
});

test('unsafe or ambiguous money is NO_MATCH', async () => {
  const { normalizePatternInput } = await import('../lighthouse/pattern-input.mjs');
  for (const input of ['ข้าว 0', 'ข้าว -5', 'ข้าว nope', 'ข้าว 1.234']) {
    assert.deepEqual(normalizePatternInput(input), { status:'NO_MATCH', source:'PATTERN' });
  }
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/greenfield-lighthouse-pattern-input.test.cjs`

Expected: FAIL because `lighthouse/pattern-input.mjs` does not exist.

- [ ] **Step 3: Implement conservative adapter**

Use an explicit Foundation expense-term allowlist containing only `ข้าว`. Accept a positive baht amount with at most two decimal places and convert exactly to satang. Construct the Required Result; do not call Runtime or Path Kernel.

- [ ] **Step 4: Run GREEN**

Run: `node --test tests/greenfield-lighthouse-pattern-input.test.cjs`

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

Commit message: `feat: add replaceable LIGHT HOUSE pattern adapter`

---

### Task 3: Gem Processing boundary without Gem authority

**Files:**
- Create: `lighthouse/gem-contract.mjs`
- Test: `tests/greenfield-lighthouse-gem-contract.test.cjs`

**Interfaces:**
- Produces: `validateGemProcessResult(result)`.
- Export: `GEM_MAX_SUPPORT_HOPS = 1`.
- Valid statuses: `RESOLVED | NEEDS_SUPPORT | UNRESOLVED`.
- This task does not create a Gem Registry and does not connect Gem to Runtime.

- [ ] **Step 1: Write failing Gem contract tests**

```js
"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

test('Gem contract fixes Foundation support depth at one hop', async () => {
  const { GEM_MAX_SUPPORT_HOPS } = await import('../lighthouse/gem-contract.mjs');
  assert.equal(GEM_MAX_SUPPORT_HOPS, 1);
});

test('Gem result rejects execution authority fields', async () => {
  const { validateGemProcessResult } = await import('../lighthouse/gem-contract.mjs');
  assert.throws(() => validateGemProcessResult({
    status:'RESOLVED', proposal:{ object:'EXPENSE' }, runtimeMethod:'expense',
  }), /GEM_EXECUTION_AUTHORITY_FORBIDDEN/);
});
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/greenfield-lighthouse-gem-contract.test.cjs`

Expected: FAIL because `lighthouse/gem-contract.mjs` does not exist.

- [ ] **Step 3: Implement minimum Gem result validator**

Allow only transformation-result fields `status`, `proposal`, `supportRequest`, and `evidence`. Explicitly reject `runtime`, `runtimeMethod`, `capability`, `execute`, or equivalent execution-authority fields. Freeze the returned result.

- [ ] **Step 4: Run GREEN**

Run: `node --test tests/greenfield-lighthouse-gem-contract.test.cjs`

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

Commit message: `feat: define bounded LIGHT HOUSE gem contract`

---

### Task 4: Thin expense capability with durable proof

**Files:**
- Create: `lighthouse/capabilities/expense.mjs`
- Test: `tests/greenfield-lighthouse-expense-capability.test.cjs`

**Interfaces:**
- Produces: `createExpenseCapability({ idFactory })`.
- Capability id: `EXPENSE_CREATE`.
- `matches(request)` returns true only for `CREATE/EXPENSE` + `LEDGER_TRANSACTION` OUT/EXPENSE Required Result.
- `execute({ request, runtime })` calls only existing `runtime.expense()` and then `runtime.readState()` for durable readback.
- Returns `{ evidenceStatus:'PROVEN', readback }` or `{ evidenceStatus:'MISMATCH', reason:'LEDGER_READBACK_MISMATCH' }`.

- [ ] **Step 1: Write failing capability tests**

Use a fake Runtime exposing `expense()` and `readState()` to prove mapping, exact generated IDs, and mismatch behavior. Include an assertion that the capability never calls a direct persistence/Vault API.

- [ ] **Step 2: Run RED**

Run: `node --test tests/greenfield-lighthouse-expense-capability.test.cjs`

Expected: FAIL because `lighthouse/capabilities/expense.mjs` does not exist.

- [ ] **Step 3: Implement thin adapter**

Generate `workflowId` and `ledgerTransactionId` through the injected `idFactory`, call `runtime.expense({ workflowId, ledgerTransactionId, title, amountSatang })`, read durable state, and verify the exact LEDGER record: type `TRANSACTION`, direction `OUT`, subtype `EXPENSE`, exact title, exact amount, expected record id. Do not duplicate workflow business logic.

- [ ] **Step 4: Run GREEN**

Run: `node --test tests/greenfield-lighthouse-expense-capability.test.cjs`

Expected: capability tests pass.

- [ ] **Step 5: Commit**

Commit message: `feat: add LIGHT HOUSE direct expense capability`

---

### Task 5: Deterministic Path Kernel and exact closure

**Files:**
- Create: `lighthouse/path-kernel.mjs`
- Test: `tests/greenfield-lighthouse-path-kernel.test.cjs`

**Interfaces:**
- Produces: `createPathKernel({ capabilities, gemProcessor = null })`.
- Produces: `kernel.run(request, { runtime })`.
- Closure: `{ status:'COMPLETE'|'VERIFY'|'BLOCKED', route:'DIRECT'|null, capabilityId?, source, readback?, reason? }`.
- `source` may be echoed for provenance but must never participate in route selection.

- [ ] **Step 1: Write failing Kernel tests**

Test that identical Required Results from `PATTERN` and `AI` select the same Direct capability; Direct Path does not invoke a supplied Gem spy; no matching capability returns `BLOCKED`; evidence mismatch returns `VERIFY`; only proven durable evidence returns `COMPLETE`.

- [ ] **Step 2: Run RED**

Run: `node --test tests/greenfield-lighthouse-path-kernel.test.cjs`

Expected: FAIL because `lighthouse/path-kernel.mjs` does not exist.

- [ ] **Step 3: Implement minimum deterministic Kernel**

Call `validatePathRequest()` first. Scan the explicit capability list in deterministic order. If a capability matches, execute it directly and map `PROVEN → COMPLETE`, `MISMATCH → VERIFY`. Do not call Gem when a Direct capability exists. If no Direct capability exists in this Foundation, return `BLOCKED` with `NO_LEGAL_PATH`; do not invent a Gem route before Gem Processing is implemented.

- [ ] **Step 4: Run GREEN**

Run: `node --test tests/greenfield-lighthouse-path-kernel.test.cjs`

Expected: Kernel tests pass.

- [ ] **Step 5: Commit**

Commit message: `feat: add deterministic LIGHT HOUSE path kernel`

---

### Task 6: Real Greenfield vertical proof and non-regression gate

**Files:**
- Create: `tests/greenfield-lighthouse-direct-expense.test.cjs`
- Modify: `package.json` (`check:syntax` only) to include the new `lighthouse/*.mjs` modules.

**Interfaces:**
- Uses existing `createMemoryVaultStore()`, `createGreenfieldRuntime()`, and signed test Evidence.
- Uses deterministic id factory so the durable LEDGER record id is known.

- [ ] **Step 1: Write failing vertical integration test**

Test sequence:

```text
"ข้าว 65"
→ normalizePatternInput()
→ Path Kernel
→ EXPENSE_CREATE Direct capability
→ real createGreenfieldRuntime() over createMemoryVaultStore()
→ runtime.expense()
→ durable LEDGER record
→ readback
→ COMPLETE
```

Assertions must include:

```js
assert.equal(result.status, 'COMPLETE');
assert.equal(result.route, 'DIRECT');
assert.equal(result.source, 'PATTERN');
assert.equal(gemCalls, 0);
assert.equal(state.domains.LEDGER.records['TX-LH-1'].record.direction, 'OUT');
assert.equal(state.domains.LEDGER.records['TX-LH-1'].record.subtype, 'EXPENSE');
assert.equal(state.domains.LEDGER.records['TX-LH-1'].record.title, 'ข้าว');
assert.equal(state.domains.LEDGER.records['TX-LH-1'].record.amountSatang, 6500);
```

- [ ] **Step 2: Run focused RED/GREEN as appropriate**

Run: `node --test tests/greenfield-lighthouse-direct-expense.test.cjs`

Expected after Tasks 1–5: PASS; if it fails, repair only the smallest violated contract before continuing.

- [ ] **Step 3: Extend syntax gate**

Append exact `node --check` entries for:

```text
lighthouse/path-contract.mjs
lighthouse/pattern-input.mjs
lighthouse/gem-contract.mjs
lighthouse/path-kernel.mjs
lighthouse/capabilities/expense.mjs
```

Do not alter production manifest, service worker, assets publication, data domains, or deployment target in this Foundation proof.

- [ ] **Step 4: Run full verification**

Run:

```text
npm test
npm run check:syntax
npm run check:utf8
npm run deploy:gate
```

Expected: all green with the existing Greenfield suite plus all LIGHT HOUSE tests.

- [ ] **Step 5: Inspect architecture invariants**

Verify by code review/search:

- no LIGHT HOUSE module imports a Pattern/AI/Manual adapter from `path-kernel.mjs`;
- `source` is not used in capability matching or route selection;
- no LIGHT HOUSE module imports persistence/Vault mutation functions;
- no Gem/AI code calls Runtime;
- current domain list is unchanged;
- PR #82 code is not merged into this branch.

- [ ] **Step 6: Commit**

Commit message: `test: prove LIGHT HOUSE direct expense path`

---

## Stop Condition

Stop Foundation scope when the real test proves:

```text
ข้าว 65
→ deterministic adapter
→ source-neutral PATH Contract
→ Path Kernel
→ Direct expense capability
→ existing Runtime
→ durable LEDGER Reality
→ Readback
→ COMPLETE
```

At that point do not automatically add AI, Manual, more patterns, or more Gems. Observe the result first and choose the next smallest Fit.
