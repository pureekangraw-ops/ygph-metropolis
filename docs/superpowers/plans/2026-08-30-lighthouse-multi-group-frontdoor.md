# LIGHTHOUSE Multi-Group Frontdoor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect proven natural-language multi-command expense inputs to execution boxes, reuse durable atomic execution, and preserve per-command truth without broadening generic capabilities.

**Architecture:** Add a pure frontdoor compiler that turns existing parsed groups into proven local execution boxes. Extend the existing MultiGroup executor only with the already-connected `CREATE/EXPENSE` capability, then wire `master-input-route` and the Master Input UI to prepare/execute boxes against fresh durable state. Unknown relationships, conditions, and unsupported capabilities fail closed.

**Tech Stack:** Node.js ESM/CJS tests, `node:test`, existing Greenfield encrypted runtime, existing `MultiGroupPlan` v1, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-30-lighthouse-multi-group-frontdoor-design.md`

## Global Constraints
- One input is not automatically one transaction; proven relationship defines each execution box.
- No subset mutation inside a related box.
- Missing/Ambiguous = `WAITING`; unsupported capability = `BLOCKED`; runtime failure = `ERROR`; interruption = `ABORTED`.
- Child command state is authoritative; do not invent an aggregate state that overwrites it.
- Completion requires durable readback.
- Conditions are not invented; unsupported conditions stay blocked.
- Generic `UPDATE`, `DELETE`, and `LINK` remain unconnected.
- Resume must reread current durable revision and re-preflight before mutation.
- No merge to `main`, deploy, or production action.

---

### Task 1: Frontdoor Compiler Contract

**Files:**
- Create: `lighthouse/multi-group-frontdoor.mjs`
- Modify: `tests/greenfield-lighthouse-multi-group-frontdoor.test.cjs`

**Interfaces:**
- Consumes: `parseIntentTask1(rawText)` output and a safe integer `baseRevision`.
- Produces: `compileNaturalLanguageMultiGroup(parsed, { baseRevision, requestIdFactory })` returning `{ status, boxes, commands }`.
- A READY box exposes a valid `MultiGroupPlan` v1 under `box.plan`.

- [ ] **Step 1: Write failing compiler tests**

Add tests that require two resolved self-contained expense groups to compile into two independent READY boxes and require an unsupported condition to remain BLOCKED without provider/runtime calls.

```js
const compiled = compileNaturalLanguageMultiGroup(parsed, {
  baseRevision: 1,
  requestIdFactory: () => 'FD01',
});
assert.equal(compiled.status, 'READY');
assert.deepEqual(compiled.commands.map(x => x.status), ['READY','READY']);
assert.equal(compiled.boxes.length, 2);
assert.ok(compiled.boxes.every(box => box.plan.groups[0].object === 'EXPENSE'));
```

- [ ] **Step 2: Run the focused test and prove RED**

Run: `node --test tests/greenfield-lighthouse-multi-group-frontdoor.test.cjs`

Expected: FAIL because `multi-group-frontdoor.mjs` / `compileNaturalLanguageMultiGroup` does not exist yet.

- [ ] **Step 3: Implement the minimal pure compiler**

Compiler rules:
- inspect existing group slots; do not reparse raw meaning;
- direct COMMAND + no condition + resolved TARGET/MONEY => `CREATE/EXPENSE` group;
- deterministic `planId`/group IDs from the supplied request ID;
- every proven self-contained direct expense is its own independent box in this slice;
- unresolved slot => `WAITING` descriptor;
- condition/prohibition/question/unknown relationship => `BLOCKED` descriptor;
- no runtime mutation and no provider call.

Use exact `requiredResult` shape already expected by the existing expense path:

```js
requiredResult: {
  kind:'LEDGER_TRANSACTION',
  effect:{ direction:'OUT', subtype:'EXPENSE', title, amountSatang, ...(businessDate ? { businessDate } : {}) },
}
```

- [ ] **Step 4: Run focused compiler tests and prove GREEN**

Run: `node --test tests/greenfield-lighthouse-multi-group-frontdoor.test.cjs`

Expected: compiler-focused tests PASS while the legacy route assertion still fails until Task 3.

- [ ] **Step 5: Commit**

Commit: `feat: add multi-group frontdoor compiler`

---

### Task 2: Make Existing Expense Capability Atomic-Plan Eligible

**Files:**
- Modify: `lighthouse/multi-group-execution.mjs`
- Modify: `tests/greenfield-lighthouse-multi-group.test.cjs`

**Interfaces:**
- Existing `prepareMultiGroupPlan(runtime, plan)` and `executeMultiGroupPlan(runtime, plan)` remain unchanged externally.
- Add support for `CREATE/EXPENSE` only.

- [ ] **Step 1: Write failing expense atomic-plan tests**

Add one supported expense plan and one two-expense related plan test. Assert deterministic IDs, exact durable ledger readback, and zero durable change when the later compiled command fails.

Example group:

```js
{
  groupId:'G1', action:'CREATE', object:'EXPENSE',
  fields:{ title:'ข้าว', amountSatang:6500 },
  references:{}, dependsOn:[],
  requiredResult:{ kind:'LEDGER_TRANSACTION', effect:{ direction:'OUT', subtype:'EXPENSE', title:'ข้าว', amountSatang:6500 } },
  confirmation:'NOT_REQUIRED',
}
```

- [ ] **Step 2: Run lower-layer test and prove RED**

Run: `node --test tests/greenfield-lighthouse-multi-group.test.cjs`

Expected: new expense test returns `BLOCKED / CAPABILITY_NOT_CONNECTED`.

- [ ] **Step 3: Implement minimal `CREATE/EXPENSE` support**

In `multi-group-execution.mjs`:
- import `buildExpenseWorkflow`;
- add `CREATE/EXPENSE` to `SUPPORTED`;
- validate title, positive safe-integer amount, optional ISO businessDate, and exact `requiredResult` effect;
- allocate deterministic `workflowId` and `ledgerTransactionId` from `planId + groupId`;
- compile through `buildExpenseWorkflow`;
- extend expected durable readback with LEDGER OUT / EXPENSE transaction fields;
- preserve SALE/PAYMENT behavior unchanged.

- [ ] **Step 4: Run lower-layer tests and prove GREEN**

Run: `node --test tests/greenfield-lighthouse-multi-group.test.cjs`

Expected: all multi-group lower-layer tests PASS, including existing SALE→PAYMENT tests.

- [ ] **Step 5: Commit**

Commit: `feat: support expense in atomic multi-group plans`

---

### Task 3: Replace Legacy Frontdoor Stop with Proven Local Boxes

**Files:**
- Modify: `lighthouse/master-input-route.mjs`
- Modify: `tests/greenfield-lighthouse-multi-group-frontdoor.test.cjs`
- Modify: `tests/greenfield-lighthouse-phase1-final-gate.test.cjs` only if it intentionally asserts the old disconnected reason.

**Interfaces:**
- `routeMasterInputText(...)` gains `route:'LOCAL_MULTI_GROUP'` only when compiler result is proven local.
- The route result carries `boxes` and `commands`; it does not execute mutation.

- [ ] **Step 1: Change the legacy acceptance test first**

Require:

```js
assert.equal(routed.route, 'LOCAL_MULTI_GROUP');
assert.equal(routed.boxes.length, 2);
assert.deepEqual(routed.commands.map(x => x.status), ['READY','READY']);
assert.equal(providerCalls, 0);
assert.deepEqual(await read(), before);
```

Add a condition case that returns STOP/BLOCKED with no provider/mutation.

- [ ] **Step 2: Run frontdoor test and prove RED**

Run: `node --test tests/greenfield-lighthouse-multi-group-frontdoor.test.cjs`

Expected: FAIL at old `STOP / MULTI_GROUP_EXECUTION_NOT_CONNECTED` behavior.

- [ ] **Step 3: Wire compiler into `master-input-route.mjs`**

When `prepareIntentPath` reports `INTERPRET/MULTI_GROUP`:
- use its parsed groups;
- compile with current base revision supplied by caller when available;
- return `LOCAL_MULTI_GROUP` for proven READY boxes;
- return a precise STOP for compiler WAITING/BLOCKED;
- never call `interpretFallback` for locally understood groups.

Keep legacy `MULTI_GROUP_EXECUTION_NOT_CONNECTED` only as a fail-closed fallback for shapes the compiler cannot classify at all.

- [ ] **Step 4: Run frontdoor and final-gate tests**

Run:
`node --test tests/greenfield-lighthouse-multi-group-frontdoor.test.cjs tests/greenfield-lighthouse-phase1-final-gate.test.cjs`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `feat: connect multi-group local frontdoor`

---

### Task 4: Runtime/UI Box Preparation, Child Status, and Recovery Reality

**Files:**
- Modify: `ui/master-input.mjs`
- Modify: `tests/master-input-ui-fixture.cjs` if fixture support is required
- Modify/Create: `tests/greenfield-lighthouse-multi-group-frontdoor.test.cjs` or a focused UI test file using existing fixture conventions
- Modify: `lighthouse/master-input-recovery-session.mjs` only if rejoin needs a new explicit multi-group preflight callback; do not weaken existing pause validation.

**Interfaces:**
- UI stores prepared execution boxes separately from `preparedPathRequest`.
- Each box is prepared against a fresh `runtime.readState()` revision before enabling execution.
- Execution uses `executeMultiGroupPlan(runtime, box.plan)`.

- [ ] **Step 1: Write failing UI/runtime integration tests**

Cover:
- READY child statuses shown separately;
- independent READY boxes may complete independently;
- a related blocked/waiting box performs zero mutation;
- durable readback changes child state to COMPLETE only after proof;
- clear interruption retains existing ABORT semantics;
- resumed box uses current revision, not stale pre-pause revision.

- [ ] **Step 2: Run focused UI/recovery tests and prove RED**

Run the exact focused test files modified in Step 1.

Expected: FAIL because UI has no `LOCAL_MULTI_GROUP` path yet.

- [ ] **Step 3: Implement minimal UI/runtime integration**

Add a `preparedMultiGroupBoxes` holder and render command rows as text such as `ข้าว · READY` / `น้ำมัน · WAITING`; state strings are truth, styling is presentation only.

At preparation/execution:
- reread durable state;
- stamp/rebuild each plan with current `baseRevision` before `prepareMultiGroupPlan`;
- do not execute a box unless preflight returns PREPARED;
- execute a related box once through `executeMultiGroupPlan`;
- update each child from durable result;
- do not collapse child state into a fake overall success.

For recovery, preserve `pauseId/inputId/groupId` and on correction recompile/re-preflight from fresh durable revision.

- [ ] **Step 4: Run focused tests and prove GREEN**

Run all frontdoor, multi-group, and recovery focused tests.

Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `feat: run multi-group boxes from master input`

---

### Task 5: Exact-HEAD Verification Workflow and Regression Gate

**Files:**
- Create: `.github/workflows/multi-group-frontdoor-verify.yml`
- Modify: `package.json` only if syntax gate needs the new module listed
- Modify: `sw.js` and `RELEASE_MANIFEST.json` only if the service-worker cache identity test proves they are stale because production assets changed.

**Interfaces:**
- CI gate must run on the feature branch and exact HEAD.

- [ ] **Step 1: Add workflow**

Run, in order:
1. targeted frontdoor + multi-group + recovery tests;
2. serial full suite (`node --test --test-concurrency=1 tests/greenfield-*.test.cjs`);
3. normal full suite (`npm test`);
4. `npm run check:syntax`;
5. `npm run check:utf8`.

- [ ] **Step 2: Push workflow/config commit and inspect CI**

Expected: if production assets changed, service-worker identity may be the only regression.

- [ ] **Step 3: If and only if cache identity test fails, update both cache identities**

Change `sw.js` and `RELEASE_MANIFEST.json` together to the exact hash expected by the test. Do not change unrelated release metadata.

- [ ] **Step 4: Require a fresh all-green run on the new exact HEAD**

No older green SHA counts after any cache metadata change.

- [ ] **Step 5: Close only after exact-HEAD evidence**

Report branch, exact SHA, focused/full/syntax/UTF-8 results, and explicitly state that `main`, deploy, and prod were untouched.
