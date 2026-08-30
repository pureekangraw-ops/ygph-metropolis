# LIGHTHOUSE Multi-Group Frontdoor Design

**Base reality:** `9011d00ebd2b3bda4c01b8151801961614ddf6f6` (closed PAUSED → ASK → RESUME slice).  
**Phase:** Multi-Group Frontdoor Connection.  
**Owner decisions:** 2026-08-30 conversation lock.

## Goal
Connect natural-language inputs containing multiple command groups to safe execution without treating one text input as one transaction by default, without partial mutation inside a related box, and without inventing unsupported meaning.

## Owner-locked behavior
1. **Language and relationship define the box.** One text input is not automatically one atomic plan. Split by understood command homes/owners/relationships. Clearly independent commands may execute as separate boxes; related/dependent commands stay in one box.
2. **Atomic Stop is per related box.** If any command inside a related box is waiting, ambiguous, unsupported, or otherwise not ready, no command in that box mutates durable state. Never run only the passing subset because the stopped command may carry the main meaning.
3. **No aggregate status may hide child truth.** Each command keeps its own status. Atomic Stop is an execution rule, not a synthetic group status that overwrites child states.
4. **State meanings stay distinct.** Missing/Ambiguous = `WAITING`; unsupported capability = `BLOCKED`; runtime failure = `ERROR`; explicit interruption/cancel/new intent = `ABORTED`.
5. **Condition truth is not an error.** When a supported condition is false, the downstream command is not executed and must report a direct not-matched state/reason rather than `ERROR`. Unsupported conditions remain `BLOCKED`; no evaluator authority is invented in this phase.
6. **Upstream resolves downstream meaning.** When a supported upstream result triggers a downstream action, upstream produces a concrete command/reference for downstream. Never pass raw result data to a later group and ask it to reinterpret the user's meaning.
7. **Success requires durable readback.** A command or box becomes complete only when durable state proves the required result. “Code returned without throwing” is not completion.
8. **Resume revalidates reality.** A waiting related box resumes from the existing pause, reads current durable state, verifies revision/references/capability again, and re-preflights the whole related box before mutation.

## Current code reality
- `master-input-route.mjs` currently converts parsed `MULTI_GROUP` input to `STOP / MULTI_GROUP_EXECUTION_NOT_CONNECTED`.
- `intent-path-adapter.mjs` currently connects one natural-language `CREATE/EXPENSE` command to the local PATH.
- `multi-group-execution.mjs` already provides durable atomic plan preparation/execution, stale-revision protection, deterministic IDs, references, idempotency, and readback, but its connected capabilities are currently `CREATE/SALE` and `APPLY/CUSTOMER_PAYMENT`.
- The natural-language parser currently understands expense-like command homes (`ข้าว`, `น้ำมัน`, etc.) and does not yet produce structured SALE/PAYMENT dependency semantics.
- Condition parsing preserves meaning but current condition evaluation is intentionally unsupported.

## Chosen implementation approach
Use a narrow **Frontdoor Compiler + Execution Boxes** layer rather than teaching the lower runtime to reinterpret language.

### 1. Frontdoor compiler
Create `lighthouse/multi-group-frontdoor.mjs`.

It consumes the existing parsed groups and returns ordered execution boxes plus per-command states. It may compile only semantics already proven by the parser/adapter.

For this slice, a group is independently executable only when all of these are true:
- command intent, not a question/reference/prohibition;
- no condition or unresolved semantic dependency;
- TARGET and MONEY are resolved;
- the existing single-command adapter can deterministically produce `CREATE/EXPENSE` with its exact `requiredResult`.

Such self-contained direct expenses have no cross-group reference and therefore may be separate execution boxes. Any group whose relationship cannot be proven independent is not split optimistically; it stays stopped/blocked until relationship semantics are explicit.

### 2. Existing expense capability becomes atomic-plan eligible
Extend `multi-group-execution.mjs` with `CREATE/EXPENSE` by compiling through the existing `buildExpenseWorkflow` behavior and verifying the same durable ledger facts used by the existing expense capability.

This is **not** generic capability expansion. `UPDATE`, `DELETE`, generic `LINK`, and unsupported conditions remain blocked. It only makes an already connected single-command capability usable inside the existing atomic multi-group executor.

Generated workflow/transaction IDs must be deterministic from `planId + groupId` so retries do not duplicate expense mutations.

### 3. Boxes, not input-wide atomicity
The compiler returns one or more boxes:
- independent self-contained commands => separate boxes;
- related/dependent commands => one shared box once relationship evidence exists;
- uncertain relationship => fail closed, never guess independence.

Each box has its own `baseRevision`, ordered groups, and child states. A blocked/waiting child blocks only its own related box. It does not create a fake input-wide status.

Because current NL semantics cannot yet prove cross-group SALE/PAYMENT or numeric condition dependencies, this slice does not fabricate them. The existing structured `MultiGroupPlan` door continues to cover proven dependency chains.

### 4. Frontdoor routing contract
Replace the blanket `MULTI_GROUP_EXECUTION_NOT_CONNECTED` stop with a concrete local frontdoor result when compilation is proven:
- `route: 'LOCAL_MULTI_GROUP'`
- `boxes`: ordered compiled boxes
- `commands`: per-input-group status/readback descriptors
- provider is not called for locally understood groups

If the compiler cannot prove a legal local mapping, return `STOP` with the precise child reason (`WAITING`, `BLOCKED`, condition unsupported, relationship unresolved, etc.) and no mutation.

### 5. Runtime/UI integration
`ui/master-input.mjs` prepares each READY box against a fresh runtime snapshot and executes only boxes that are independent and READY. A related box is executed through one `executeMultiGroupPlan` call after whole-box preflight.

UI must preserve child statuses rather than replacing them with one aggregate status. Minimal first-slice copy may be textual; color remains presentation only and must never drive runtime logic.

For mixed independent boxes, a READY box may complete even when a separate unrelated box is waiting/blocked. For a related box, one waiting/blocked child prevents all mutation in that box.

### 6. Pause/resume boundary
A waiting box uses the existing PAUSED contract. A correction is inserted into its original group/home. Clear new intent/cancel aborts that paused box as already locked.

On resume, current durable revision is read again and the box is recompiled/re-preflighted. A stale pre-pause plan is never executed.

The existing `SINGLE_ACTIVE_PAUSE` rule remains. If one input creates more than one independent waiting box, only one may be active at a time; the next unresolved box is surfaced only after the active one is resolved/aborted. No second hidden pause session is created.

## Status contract for this phase
Per command:
- `READY` — semantics and capability proven; no mutation yet
- `WAITING` — missing/ambiguous user information
- `BLOCKED` — meaning understood but legal capability/condition/relationship path not connected
- `RUNNING` — runtime execution in progress
- `COMPLETE` — durable readback proved required result
- `VERIFY` — mutation/retry state exists but durable evidence is not sufficient for COMPLETE
- `ERROR` — runtime execution actually failed
- `ABORTED` — user interrupted/cancelled/replaced the waiting work
- `CONDITION_NOT_MATCHED` — reserved for a future supported evaluator returning false; no mutation and not an error

## Safety invariants
- No AI/provider call when local parsing is sufficient.
- No mutation during parsing, compilation, waiting, ambiguity resolution, capability preflight, or relationship classification.
- No subset mutation inside a related box.
- No raw upstream result is reinterpreted downstream.
- No stale plan execution after pause/resume or durable revision change.
- No completion claim without durable readback.
- No `main` merge, deployment, or production action in this phase.

## Acceptance tests
1. **FD01 Local direct multi-expense:** `ลงข้าว65 แล้วลงน้ำมัน500` no longer stops at the legacy disconnected gate; compiler produces proven local execution boxes without provider usage.
2. **FD02 Independent boxes:** two self-contained expense groups are represented separately; one box’s status does not overwrite the other’s child status.
3. **FD03 Related Atomic Stop:** a related/proven shared plan containing one unsupported or waiting child performs zero durable mutation for that box.
4. **FD04 Missing/Ambiguous:** unresolved child remains `WAITING`; no mutation occurs for its related box; recovery homes/group IDs are preserved.
5. **FD05 Unsupported:** unsupported action/condition is `BLOCKED`, not `ERROR`, and cannot leak partial mutation inside its box.
6. **FD06 Expense atomic capability:** `CREATE/EXPENSE` compiles to deterministic commands and durable readback proves exact title/amount/subtype/direction after complete.
7. **FD07 Runtime failure:** a later command failure in a related atomic expense box leaves durable revision/state unchanged and reports runtime failure, not success.
8. **FD08 Resume reality:** correction resumes the original waiting home, rereads revision, re-preflights the whole related box, and never executes a stale plan.
9. **FD09 Interruption:** clear cancel/new intent aborts the waiting box and does not mutate it.
10. **FD10 Regression:** previous structured SALE→CUSTOMER_PAYMENT multi-group behavior, single expense PATH, recovery, full suite, syntax, and UTF-8 remain green on the exact same HEAD.

## Non-goals
- Generic `UPDATE`, `DELETE`, or `LINK` capability expansion.
- Inventing a condition evaluator.
- Guessing cross-group reference/dependency semantics not represented by current parsing evidence.
- Multiple simultaneous hidden pause sessions.
- Merge/deploy/prod.
