# LIGHTHOUSE Multi-Group First Implementation Slice Design

**Source of truth:** Core Engine Reality Lock, 2026-08-29.  
**Base reality:** `e556f4e2cc8ac9fb8997e6bb047b4830a81eee98`.

## Goal
Connect the smallest safe Multi-Group execution slice without broadening the existing single-command PATH contract or inventing a second transaction engine.

## Boundaries
- Preserve the current natural-language multi-group gate: text input with 2+ groups still stops as `MULTI_GROUP_EXECUTION_NOT_CONNECTED` in this slice.
- Add a structured `MultiGroupPlan` v1 execution door for a supported atomic subset.
- Reuse Greenfield `MutationCoordinator`, `executeAtomicWorkflow`, command `expectedRevision`, command log, and idempotency keys.
- First supported mutation capabilities are `CREATE/SALE` and `APPLY/CUSTOMER_PAYMENT` only.
- `DELETE`, generic `UPDATE`, appointment-time update, generic `LINK`, and external/non-atomic side effects remain blocked in preflight.
- No compensating rollback. The slice is durable-atomic.

## MultiGroupPlan v1
A plan contains:
- `version: "1"`
- `planId`
- `baseRevision`
- ordered `groups`

Each group contains:
- `groupId`
- `action`
- `object`
- `fields`
- `references`
- `dependsOn`
- `requiredResult`
- `confirmation`

Accepted terminal/pre-execution statuses are `NEEDS_INFO`, `AMBIGUOUS`, `AWAITING_CONFIRMATION`, `BLOCKED`, `COMPLETE`, and `VERIFY`.

## References and dependency binding
Resolution uses one durable snapshot at `baseRevision`.
- `EXPLICIT_ID`: resolve one exact record.
- `RELATIVE_POINTER`: currently `LATEST` over a domain query.
- `QUERY_BASED`: resolve a filtered record set; 0 => `NEEDS_INFO`, >1 => `AMBIGUOUS`.
- `IMPLICIT_CONTEXT`: same safety rule as query-based binding; never guess among multiple records.
- `GROUP_RESULT`: may reference only an earlier dependency group and only capability-declared output fields.

Outputs are allocated before execution. When IDs are not supplied explicitly, they are deterministic from `planId + groupId`, so downstream groups bind concrete values rather than reinterpreting language after execution.

## Capability preflight
Preflight validates the whole plan before durable mutation:
1. plan/group shape and unique IDs
2. dependency order / no forward dependency
3. confirmation state
4. capability support
5. required fields
6. reference resolution against one durable snapshot
7. stale `baseRevision`

Any unsupported or unresolved group blocks the whole mutation plan with `groupId` and reason.

## Compilation
Supported groups compile to existing workflow builders:
- `CREATE/SALE` -> `buildSaleWorkflow`
- `APPLY/CUSTOMER_PAYMENT` -> `buildReceiveCustomerPaymentWorkflow`

Workflow IDs and generated record IDs are deterministic. Compiled command idempotency keys are namespaced by plan/group so retry can prove the same plan without duplicating durable mutation.

The combined command array is executed once through the existing Greenfield atomic workflow under the existing mutation coordinator.

## Durable retry and stale-state rules
Under the mutation lock, the runtime reads durable state before execution.
- If every plan command idempotency key is already present in `commandLog`, execution is not repeated; durable readback decides `COMPLETE` or `VERIFY`.
- If only some keys are present, return `VERIFY`; never attempt to fill the missing half as a new mutation.
- If no plan keys are present and durable revision differs from `baseRevision`, reject as stale before execution.
- If a command throws before the single durable commit, no group is durable and no partial success is reported.

## Readback
After commit or recovered retry, read the durable state again and prove each supported group:
- Sale: total, quantity, received, outstanding, status, linked initial receipt when applicable, and receivable queue when outstanding exists.
- Customer payment: updated sale totals/status, receipt ledger transaction, and queue paid/status.

Only proven durable results return `COMPLETE`; mismatched or incomplete evidence returns `VERIFY`.

## Acceptance gate
- **MG01 Current Gate:** natural-language multi-group remains stopped with no revision change.
- **MG02 Supported Atomic Chain:** create `SALE-104` total 30000 satang, quantity 5, received 18000; then apply 12000 using group-result `saleId/queueId`; readback proves received 30000, outstanding 0, sale + queue completed, and ledger receipts 18000 + 12000. Inventory fixture supplies 5 units because the existing stock invariant must remain true.
- **MG03 Unsupported Whole Plan:** adding DELETE or appointment-time UPDATE blocks before mutation.
- **MG04 Atomic Failure:** a later compiled command failure leaves durable state/revision unchanged.
- **MG05 Retry After Lost Response:** rerunning the identical successful plan creates no duplicate mutations and returns complete from durable evidence.
- **MG06 Reference Safety:** no match => `NEEDS_INFO`; multiple matches => `AMBIGUOUS`; neither mutates durable state.
- **MG07 Stale Snapshot:** durable revision change after planning rejects the old plan before commit.

Phase closes only when MG01-MG07 pass on one exact HEAD, the full regression/syntax/UTF-8 gate is green, and acceptance readback comes from durable state.