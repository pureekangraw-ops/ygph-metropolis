# METROPOLIS Phase 2A — Ledger + Calendar Command Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route every in-scope Ledger and Calendar durable mutation through one explicit domain-command owner before the existing r26 durable-write gate.

**Architecture:** Keep `app.js` as the existing source of low-level state helpers and UI flows, but introduce one focused `metropolis-domain-commands.js` public owner for Ledger/Calendar commands. Migrate live callers cluster-by-cluster, then remove/privatize redundant direct mutation entry points. The existing `metropolis-command-gate.js` remains the final cross-context lock/read-back authority.

**Tech Stack:** Classic browser JavaScript, Node.js 22 test runner, jsdom runtime harness, IndexedDB/Vault persistence, Service Worker release wiring.

## Global Constraints

- Visible product version remains `4.2.6`.
- State Schema remains `4`.
- IndexedDB remains `stock-pocket-secure` version `1`, store `kv`.
- Vault format remains `1`.
- Money remains integer satang.
- Protected financial history remains append-only with linked reversal semantics.
- No deletion of real financial/history records.
- Store/Ride command migration is out of scope except when they call the new Ledger/Calendar API.
- `metropolis-command-gate.js` remains the durable-write authority; do not replace or bypass it.
- Merge to `main` and production deployment remain separate Owner Gates.

---

### Task 1: Lock the command ownership contract with RED tests

**Files:**
- Create: `tests/domain-command-ownership.test.cjs`
- Read: `tests/queue-actions-runtime.test.cjs`
- Read: `tests/calendar-runtime-lifecycle.test.cjs`
- Read: `tests/runtime-command-gate.test.cjs`

**Interfaces:**
- Consumes: current runtime loaded from `RELEASE_MANIFEST.json`.
- Produces: failing contract expectations for `globalThis.YGPHDomainCommands` and named Ledger/Calendar commands.

- [ ] **Step 1: Add a failing owner-presence test**

Create a runtime test that loads production and asserts:

```js
assert.equal(typeof runtime.window.YGPHDomainCommands, "object");
assert.equal(runtime.window.YGPHDomainCommands.version, "1.0.0");
assert.equal(typeof runtime.window.YGPHDomainCommands.execute, "function");
```

- [ ] **Step 2: Add failing command-shape/precondition tests**

Cover exact command types used by live runtime paths:

```js
const COMMANDS = [
  "LEDGER_ADD_TRANSACTION",
  "LEDGER_REVERSE_SOURCE_TRANSACTIONS",
  "LEDGER_RECONCILE_BALANCE",
  "LEDGER_CREATE_OBLIGATION",
  "CALENDAR_CREATE_QUEUE",
  "CALENDAR_PAY_QUEUE",
  "CALENDAR_EDIT_QUEUE",
  "CALENDAR_CANCEL_QUEUE"
];
```

Assert unknown command type, malformed satang, missing source, illegal protected-history mutation, and duplicate idempotency key fail before `persistAndRender` is called.

- [ ] **Step 3: Add failing atomic payment test**

Use the existing queue fixture shape from `queue-actions-runtime.test.cjs`. Execute one `CALENDAR_PAY_QUEUE` command and assert one result changes both the Ledger transaction list and Calendar/obligation state, while persistence is invoked exactly once.

- [ ] **Step 4: Add failing reversal/append-only test**

Seed one Ledger transaction and reverse it through the command owner. Assert the original remains present, receives `reversedBy`, and exactly one linked reversal record is appended.

- [ ] **Step 5: Run the new test file and confirm RED**

Run:

```bash
node --test tests/domain-command-ownership.test.cjs
```

Expected: FAIL because `YGPHDomainCommands` does not exist yet.

- [ ] **Step 6: Commit the RED contract**

```bash
git add tests/domain-command-ownership.test.cjs
git commit -m "test: define ledger calendar command ownership contract"
```

---

### Task 2: Implement the focused Ledger/Calendar command owner

**Files:**
- Create: `metropolis-domain-commands.js`
- Test: `tests/domain-command-ownership.test.cjs`

**Interfaces:**
- Consumes existing runtime helpers: `parseSatang`, `parseMoneyToSatang`, `findSource`, `findQueue`, `addTransactionToState`, `addQueueToState`, `addAudit`, `persistAndRender`, `renderAll`, `nowIso`, `uid`.
- Produces: `globalThis.YGPHDomainCommands = Object.freeze({ version, execute, supports })`.

- [ ] **Step 1: Define the command registry and public API**

Implement:

```js
const DOMAIN_COMMAND_VERSION = "1.0.0";
const handlers = new Map();

async function execute(command) {
  validateEnvelope(command);
  const handler = handlers.get(command.type);
  if (!handler) throw new Error(`UNSUPPORTED_DOMAIN_COMMAND:${command.type}`);
  return handler(command);
}

function supports(type) {
  return handlers.has(String(type || ""));
}
```

Command envelope fields are `type`, `commandId`, `idempotencyKey`, and `payload`.

- [ ] **Step 2: Centralize pre-mutation checks**

Implement validation that rejects blank IDs, non-object payloads, malformed satang, unresolved source IDs, and duplicate `state.sync.appliedCommandKeys[idempotencyKey]` before any Ledger/Calendar state change.

- [ ] **Step 3: Implement Ledger commands using existing low-level helpers**

Implement `LEDGER_ADD_TRANSACTION`, `LEDGER_REVERSE_SOURCE_TRANSACTIONS`, `LEDGER_RECONCILE_BALANCE`, and `LEDGER_CREATE_OBLIGATION`. Keep existing linked reversal semantics and installment splitting. The owner may call low-level append helpers, but no command should expose those helpers as its public API.

- [ ] **Step 4: Implement Calendar commands using one owner**

Implement `CALENDAR_CREATE_QUEUE`, `CALENDAR_PAY_QUEUE`, `CALENDAR_EDIT_QUEUE`, and `CALENDAR_CANCEL_QUEUE`. `CALENDAR_PAY_QUEUE` must update queue payment state, obligation/installment state when applicable, and Ledger movement before one persistence call.

- [ ] **Step 5: Record command idempotency only on successful mutation plan**

Use the existing `state.sync.appliedCommandKeys` object. Do not advance Schema. The stored entry must include command type and timestamp so duplicate execution becomes a no-op/result reuse rather than a duplicate financial effect.

- [ ] **Step 6: Persist exactly once per durable command**

All durable command handlers call:

```js
await persistAndRender(message, {
  commandId: command.commandId,
  idempotencyKey: command.idempotencyKey,
  commandType: command.type
});
```

No command reports success before the r26 gate returns verified read-back.

- [ ] **Step 7: Run focused tests**

```bash
node --test tests/domain-command-ownership.test.cjs tests/runtime-command-gate.test.cjs
```

Expected: PASS.

- [ ] **Step 8: Commit the command owner**

```bash
git add metropolis-domain-commands.js tests/domain-command-ownership.test.cjs
git commit -m "feat: add ledger calendar domain command owner"
```

---

### Task 3: Migrate live Ledger and Calendar callers to the command owner

**Files:**
- Modify: `app.js`
- Modify: `tests/queue-actions-runtime.test.cjs`
- Modify: `tests/calendar-runtime-lifecycle.test.cjs` only if assertions need to observe the new command boundary without changing user-visible behavior.
- Test: `tests/domain-command-ownership.test.cjs`

**Interfaces:**
- Consumes: `YGPHDomainCommands.execute(command)`.
- Produces: UI/Recovery/Calendar flows that request domain commands instead of directly owning durable Ledger/Calendar mutations.

- [ ] **Step 1: Inventory direct mutation callers before editing**

Search current `app.js` for:

```text
state.ledger.transactions.push
state.ledger.obligations.push
state.calendar.push
addTransaction(
addQueue(
reverseTransactions(
reverseQueuePayments(
openingBalanceSatang =
balanceVerified =
remainingSatang =
paidSatang =
status = "COMPLETED"
status = "CANCELLED"
```

Classify each match as low-level private helper, import/migration path, or live runtime/UI mutation. Only live Ledger/Calendar runtime mutations are migrated in 2A; import/migration code remains governed by its existing validated import owner unless it calls a migrated runtime helper.

- [ ] **Step 2: Migrate balance reconciliation**

Replace the live modal handler’s direct opening-balance/transaction mutation with one `LEDGER_RECONCILE_BALANCE` command request. Preserve current first-verification versus later-adjustment semantics and existing Thai UI messages.

- [ ] **Step 3: Migrate obligation creation**

Replace `state.ledger.obligations.push(...)` plus per-installment `addQueue(...)` in the Add Debt UI with one `LEDGER_CREATE_OBLIGATION` command. The command result returns the obligation ID and created queue IDs.

- [ ] **Step 4: Migrate Calendar primary payment action**

Replace payment modal mutations with `CALENDAR_PAY_QUEUE`. Preserve full-versus-partial behavior from `queue-actions-runtime.test.cjs`: full payment completes queue; smaller valid amount leaves `PARTIAL`; invalid `0`, negative, or above-remaining values mutate nothing.

- [ ] **Step 5: Migrate Calendar edit and cancel actions**

Route plan edits through `CALENDAR_EDIT_QUEUE` and cancellation through `CALENDAR_CANCEL_QUEUE`. Schedule-managed queue edits must still update the linked installment due date and append the same history event.

- [ ] **Step 6: Redirect remaining live transaction/reversal callers**

Any live UI or Recovery caller still invoking public `addTransaction`, `reverseTransactions`, or queue-payment reversal directly must call the domain owner instead. Low-level `addTransactionToState` and `addQueueToState` may remain private implementation helpers.

- [ ] **Step 7: Add static ownership assertions**

Extend `tests/domain-command-ownership.test.cjs` to assert migrated live handler blocks use `YGPHDomainCommands.execute` and no longer contain the prohibited direct state mutation patterns identified in Step 1.

- [ ] **Step 8: Run runtime regression cluster**

```bash
node --test tests/domain-command-ownership.test.cjs tests/queue-actions-runtime.test.cjs tests/calendar-runtime-lifecycle.test.cjs tests/report-semantics.test.cjs tests/runtime-command-gate.test.cjs
```

Expected: PASS with unchanged user-visible queue actions and Calendar lifecycle.

- [ ] **Step 9: Commit migrated callers**

```bash
git add app.js tests/domain-command-ownership.test.cjs tests/queue-actions-runtime.test.cjs tests/calendar-runtime-lifecycle.test.cjs
git commit -m "refactor: route ledger calendar mutations through commands"
```

---

### Task 4: Remove redundant public mutation ownership

**Files:**
- Modify: `app.js`
- Modify: `metropolis-domain-commands.js`
- Test: `tests/domain-command-ownership.test.cjs`

**Interfaces:**
- Consumes: migrated caller set from Task 3.
- Produces: one public Ledger/Calendar mutation owner while preserving private low-level helpers needed by the owner/import routines.

- [ ] **Step 1: Re-scan direct callers**

Repeat the Task 3 inventory. Every remaining direct Ledger/Calendar mutation must be either an explicitly documented private helper or an import/migration owner. Any ownerless live path is a failure.

- [ ] **Step 2: Privatize or remove redundant wrappers**

Remove live/public dependency on wrappers such as `addTransaction`, `addQueue`, and reversal helpers where the command owner now supplies the durable route. Keep only private helpers still required by the command implementation or validated import/migration routines.

- [ ] **Step 3: Prove no duplicate durable effect path**

Add tests that invoke the migrated UI action twice with the same idempotency key and assert one Ledger/Calendar effect and one durable command record.

- [ ] **Step 4: Run full Node suite**

```bash
node --test tests/*.test.cjs
```

Expected: all tests PASS.

- [ ] **Step 5: Commit cleanup**

```bash
git add app.js metropolis-domain-commands.js tests/domain-command-ownership.test.cjs
git commit -m "refactor: remove duplicate ledger calendar mutation ownership"
```

---

### Task 5: Wire the production release atomically

**Files:**
- Modify: `RELEASE_MANIFEST.json`
- Modify: `sw-bootstrap.js`
- Modify: `sw.js`
- Modify: `.assetsignore`
- Modify: `package.json`
- Modify: `SHA256SUMS.txt`
- Test: `tests/runtime-composition.test.cjs`
- Test: `tests/sw-lifecycle.test.cjs`
- Test: `tests/defrag-publication-followthrough.test.cjs`

**Interfaces:**
- Consumes: production `metropolis-domain-commands.js`.
- Produces: one coherent internal release generation containing the new runtime owner.

- [ ] **Step 1: Add runtime order**

Place `metropolis-domain-commands.js` after `app.js` and before extension layers that may request Ledger/Calendar mutations. Keep `metropolis-command-gate.js` last.

- [ ] **Step 2: Advance internal SW generation**

Advance r26 to the next internal generation, using an ID in the form:

```text
v4.2.6-20260812-r27-domain-command-ownership
```

Do not change visible `4.2.6`.

- [ ] **Step 3: Add the new asset everywhere production requires it**

Update `.assetsignore`, offline shell/runtime asset lists, syntax gate inputs, manifest production files, and bootstrap script loading.

- [ ] **Step 4: Run syntax and publication tests**

```bash
npm run deploy:gate
```

Expected: Node tests PASS, syntax PASS including `metropolis-domain-commands.js`, UTF-8 PASS.

- [ ] **Step 5: Seal checksums**

Compute SHA256 for every changed production/release file and replace the matching entries in `SHA256SUMS.txt`. Re-run `npm run deploy:gate` after checksum update.

- [ ] **Step 6: Commit release wiring**

```bash
git add RELEASE_MANIFEST.json sw-bootstrap.js sw.js .assetsignore package.json SHA256SUMS.txt tests/runtime-composition.test.cjs tests/sw-lifecycle.test.cjs tests/defrag-publication-followthrough.test.cjs
git commit -m "chore: publish phase 2a runtime generation"
```

---

### Task 6: Second verification pass and Gate preparation

**Files:**
- Create or update: `METROPOLIS_DEVELOPMENT_LOG.md`
- No production mutation unless verification finds a defect.

**Interfaces:**
- Consumes: completed branch and all Gate evidence.
- Produces: review-ready PR with explicit invariants and development-history entry.

- [ ] **Step 1: Compare branch to exact Phase 2A base**

Compare against base SHA `394a10f8c35d192a9429c2ba4780b46196fd95d0`. Confirm no unrelated files or workflow/deployment-authority changes.

- [ ] **Step 2: Re-run full Gate from final branch head**

```bash
npm run deploy:gate
```

Expected: complete PASS.

- [ ] **Step 3: Verify invariants independently**

Read back final source and confirm:

```text
State Schema = 4
IndexedDB = stock-pocket-secure v1
Vault format = 1
visible product = 4.2.6
protected financial history not deleted
metropolis-command-gate.js still final durable owner
metropolis-domain-commands.js is sole public Ledger/Calendar runtime mutation owner
```

- [ ] **Step 4: Record development history**

Append a Phase 2A entry to `METROPOLIS_DEVELOPMENT_LOG.md` containing base SHA, final branch SHA, problem, ownership changes, removed duplicate paths, test result, internal release ID, and explicit non-changes.

- [ ] **Step 5: Open/update PR and wait for PR Gate**

Create a PR from `hardening/domain-command-ownership-2a` to `main`. PR body must state that production deploy is intentionally skipped on pull-request event and merge/deploy requires a separate Owner Gate.

- [ ] **Step 6: Inspect PR workflow jobs and logs**

Require safety gate `success`. Confirm Cloudflare deploy job is skipped for PR as designed. If any test/gate fails, fix on branch and repeat Steps 1–6.

- [ ] **Step 7: Stop at Gate PASS**

Do not merge to `main`. Do not deploy production. Report final branch SHA, PR number, changed files, test totals, release ID, and verification findings to the Owner.
