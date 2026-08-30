# LIGHTHOUSE Multi-Group First Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect a safe structured Multi-Group first slice that executes supported sale/payment groups atomically and proves durable readback.

**Architecture:** Keep the existing natural-language multi-group gate unchanged. Add a dedicated MultiGroupPlan v1 contract/executor, compile only supported groups to existing Greenfield workflows, and add one bounded runtime atomic-command seam that reuses the existing mutation coordinator and workflow runtime.

**Tech Stack:** Node.js 22, ESM production modules, Node built-in test runner, existing encrypted Greenfield persistence/runtime.

**Spec:** `docs/superpowers/specs/2026-08-29-lighthouse-multi-group-first-slice-design.md`

## Global Constraints
- Base exact reality: `e556f4e2cc8ac9fb8997e6bb047b4830a81eee98`.
- Do not broaden `lighthouse/path-contract.mjs` beyond its existing single-command CREATE/EXPENSE contract in this slice.
- Reuse `createMutationCoordinator`, `executeAtomicWorkflow`, `expectedRevision`, command log, and idempotency keys.
- Supported mutation capabilities only: `CREATE/SALE` and `APPLY/CUSTOMER_PAYMENT`.
- Unsupported group anywhere blocks the whole plan before durable mutation.
- No compensating rollback; external/non-atomic effects are excluded.
- Natural-language multi-group remains `MULTI_GROUP_EXECUTION_NOT_CONNECTED` for MG01.

---

### Task 1: MultiGroupPlan contract and safe reference preflight

**Files:**
- Create: `lighthouse/multi-group-contract.mjs`
- Create: `lighthouse/multi-group-execution.mjs`
- Test: `tests/greenfield-lighthouse-multi-group.test.cjs`

**Interfaces:**
- Produces: `validateMultiGroupPlan(plan)`
- Produces: `prepareMultiGroupPlan(runtime, plan)` returning `{status, reason, groupId, plan, resolvedGroups}` without mutation.
- Reference specs: `EXPLICIT_ID`, `RELATIVE_POINTER`, `QUERY_BASED`, `IMPLICIT_CONTEXT`, `GROUP_RESULT`.

- [ ] Write MG06/unsupported/confirmation/dependency tests first.
- [ ] Push tests and verify targeted CI fails because the new contract/executor does not exist.
- [ ] Implement immutable plan validation, deterministic output allocation, capability support map, dependency checks, snapshot reference resolution, and base-revision check.
- [ ] Verify MG06 and preflight tests pass while no Runtime mutation occurs.
- [ ] Record Task 1 `REVIEW PENDING` in Notion with exact commit + targeted test result.

### Task 2: Atomic runtime seam, stale handling, and retry evidence

**Files:**
- Modify: `greenfield/runtime.mjs`
- Test: `tests/greenfield-lighthouse-multi-group.test.cjs`

**Interfaces:**
- Produces runtime method `executeMultiGroupCommands({ baseRevision, commands })`.
- Returns existing atomic result for a new mutation, `RECOVERED` when all command keys already exist, `VERIFY` for mixed command-log evidence, and `STALE` when the base revision moved before any plan command exists.

- [ ] Add failing MG04/MG05/MG07 tests before runtime changes.
- [ ] Verify CI RED for missing runtime seam/behavior.
- [ ] Implement the bounded runtime method under the existing coordinator.
- [ ] Detect all/some/no idempotency-key evidence before stale comparison.
- [ ] Delegate new mutation exactly once to `executeAtomicWorkflow`.
- [ ] Verify atomic failure writes nothing, identical retry does not duplicate, and stale snapshot is rejected.
- [ ] Record Task 2 `REVIEW PENDING` in Notion with exact commit + evidence.

### Task 3: Supported sale/payment compiler and durable group readback

**Files:**
- Modify: `lighthouse/multi-group-execution.mjs`
- Test: `tests/greenfield-lighthouse-multi-group.test.cjs`

**Interfaces:**
- `executeMultiGroupPlan(runtime, plan)` performs prepare -> compile -> one atomic runtime call -> durable readback.
- `CREATE/SALE` compiles with `buildSaleWorkflow`.
- `APPLY/CUSTOMER_PAYMENT` compiles with `buildReceiveCustomerPaymentWorkflow`.
- Capability outputs include `saleId`, `queueId`, and deterministic ledger transaction IDs where applicable.

- [ ] Add failing MG02 and MG03 tests first.
- [ ] Verify CI RED for missing supported execution/readback behavior.
- [ ] Compile both supported groups into one command array while preserving existing workflow invariants.
- [ ] Namespace command IDs/idempotency keys deterministically by plan/group.
- [ ] Execute once via `runtime.executeMultiGroupCommands`.
- [ ] Read durable state and prove sale/payment required results; mismatch => `VERIFY`.
- [ ] Verify MG02 COMPLETE and MG03 BLOCKED with identical before/after durable state.
- [ ] Record Task 3 `REVIEW PENDING` in Notion with exact commit + readback summary.

### Task 4: Acceptance gate and regression closure

**Files:**
- Test: `tests/greenfield-lighthouse-multi-group.test.cjs`
- Create: `.github/workflows/multi-group-first-slice-verify.yml`
- Modify only if needed for syntax coverage: `package.json`

**Interfaces:**
- CI gate runs targeted MG01-MG07, serial full suite, normal full suite, syntax, and UTF-8 checks on the feature branch.

- [ ] Add/confirm MG01 test against `routeMasterInputText` and verify revision stays unchanged.
- [ ] Ensure MG01-MG07 are individually named and all pass on one exact HEAD.
- [ ] Run serial full test suite and normal full test suite in CI.
- [ ] Run syntax and UTF-8 gates in CI, including any newly added production modules.
- [ ] Review diff for accidental PATH broadening, duplicate transaction machinery, unsupported capability leakage, or non-durable readback.
- [ ] Record Task 4 `REVIEW PENDING` and phase-close evidence in Notion.
- [ ] Mark phase `IMPLEMENTED + VERIFIED / REVIEW PENDING`; do not merge/deploy/production without a separate owner instruction.
