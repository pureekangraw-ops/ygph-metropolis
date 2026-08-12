# METROPOLIS Phase 2A — Ledger + Calendar Command Ownership Design

## Goal

Move Ledger and Calendar mutations behind one explicit domain-command ownership boundary before durable persistence, using the existing r26 command runtime gate as the final durable-write guard rather than adding another parallel mutation layer.

## Why this phase exists

r26 now protects the durable-write boundary against stale cross-context writes and verifies read-back, but Ledger and Calendar business state can still be mutated directly by UI/event handlers before that boundary. Phase 2A removes that ownership ambiguity for the two highest-risk money/schedule domains first.

## Scope

In scope:
- Ledger transaction creation, reversal, balance reconciliation, obligation mutation, and payment effects.
- Calendar queue creation, status transitions, payment-linked updates, cancellation/completion effects, and source-link verification.
- A named command contract for Ledger + Calendar mutations.
- Removal or consolidation of direct mutation paths that become redundant after migration.
- Regression coverage proving one owner, one command path, one durable result.
- Release/runtime wiring only when production code changes require it.

Out of scope:
- Store and Ride command migration (Phase 2B).
- Day Cycle ownership migration except where it calls Ledger/Calendar through their new public command boundary.
- Full r5 patch-layer defragmentation (Phase 2C).
- State Schema changes.
- IndexedDB version changes.
- Vault format changes.
- Deletion of real financial or historical records.
- Merge to main or production deployment without a separate Owner Gate.

## Canonical ownership rule

For Phase 2A:

`UI / Recovery / Day Cycle -> Domain Command API -> Ledger/Calendar owner validation -> in-memory mutation -> existing r26 durable gate -> Vault commit/read-back -> event/audit -> render`

No UI, Recovery, or compatibility layer may directly own a durable Ledger or Calendar business mutation once that command has been migrated.

## Architecture

### 1. Domain command API

Add a focused command module for Ledger + Calendar. The module owns command parsing, preconditions, mutation planning, and application. It exposes named commands rather than raw state mutation helpers.

Candidate command names:
- `LEDGER_ADD_TRANSACTION`
- `LEDGER_REVERSE_SOURCE_TRANSACTIONS`
- `LEDGER_RECONCILE_BALANCE`
- `LEDGER_CREATE_OBLIGATION`
- `CALENDAR_CREATE_QUEUE`
- `CALENDAR_APPLY_PAYMENT`
- `CALENDAR_COMPLETE_QUEUE`
- `CALENDAR_CANCEL_QUEUE`

The final set must be derived from actual current handlers and tests; do not invent commands with no live caller.

### 2. One mutation owner

Existing helpers such as transaction/queue state appenders may remain as private implementation details, but direct callers outside the domain command owner must be removed or redirected. The command owner becomes the only public mutation route for Ledger/Calendar durable state.

### 3. r26 remains the durable authority

Do not replace `metropolis-command-gate.js`. Phase 2A calls into the existing persistence path after domain validation/mutation. The r26 stale-context lock/read-back protection remains the final write authority.

### 4. Recovery remains an orchestrator

Recovery may request Ledger/Calendar commands but cannot directly rewrite their durable business state. If Recovery needs a correction, it delegates to the domain owner and records the resulting evidence.

## Data and invariants

Must remain unchanged:
- State Schema: 4
- IndexedDB database: `stock-pocket-secure`, version 1
- Store: `kv`
- Vault key: `vault`
- Vault format: 1
- Money unit: integer satang
- Protected financial history: append-only with linked reversal semantics
- Calendar source linkage must remain resolvable or be explicitly quarantined/VERIFY by existing rules
- One durable command advances state revision exactly once
- Successful durable commands require read-back success through the r26 gate

## Error handling

Before mutation:
- reject invalid command shape
- reject invalid money/schedule values
- reject duplicate/idempotent command keys where applicable
- reject missing or ambiguous source ownership
- reject illegal history deletion or mutation of protected completed evidence

After mutation but before success:
- any persistence/read-back failure must roll visible/in-memory state back to the last durable truth through the existing r26 recovery behavior
- no command may report success without durable read-back

## Migration strategy

Use strangler migration, not a big-bang rewrite.

1. Inventory live Ledger and Calendar mutation callers.
2. Add RED tests for the first command owner boundary.
3. Implement the minimal command owner.
4. Redirect one coherent mutation cluster at a time.
5. Delete or privatize the old direct mutation path only after regression proves no live caller depends on it.
6. Repeat until all in-scope Ledger/Calendar durable mutations have one owner.

## Testing strategy

Required tests:
- direct Ledger mutation from migrated UI/runtime paths is absent or blocked
- direct Calendar mutation from migrated UI/runtime paths is absent or blocked
- command preconditions fail before durable write
- duplicate/idempotent effects do not create extra transactions or queues
- payment updates Ledger + Calendar atomically through one command result
- reversal semantics remain linked and append-only
- one command advances revision exactly once
- existing source links remain intact
- r26 stale-context protection still blocks cross-context stale writes
- all existing regression tests continue to pass
- syntax and UTF-8 gates pass

## Release rule

If production runtime files change, advance the internal service-worker release generation and update manifest/checksum/runtime wiring atomically. The visible product version remains 4.2.6 unless a separate product-version decision is made.

## Gate / stop condition

Phase 2A is complete only when:
- all in-scope Ledger + Calendar mutation paths have one named domain owner
- redundant direct mutation paths are removed or made private
- full regression, syntax, UTF-8, release wiring, and checksum gates pass
- a second verification pass confirms no Schema/DB/Vault-format drift and no protected-history deletion
- PR is ready for review

Stop there. Do not merge to `main` and do not deploy production without a separate Owner Gate.

## Development log

After Phase 2A reaches Gate PASS, record the completed work in a separate METROPOLIS development-history file (for example `METROPOLIS_DEVELOPMENT_LOG.md`) rather than mixing phase history into the Current Pointer or user-facing operating guide.
