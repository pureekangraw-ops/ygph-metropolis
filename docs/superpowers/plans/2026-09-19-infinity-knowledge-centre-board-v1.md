# INFINITY KNOWLEDGE Centre Board V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a transport-neutral Centre Board contract for live pins, entry/return receipts, optimistic revision safety, and emergency recovery.

**Architecture:** Add small pure ES modules under `lighthouse-next/centre-board/`. They consume and return immutable plain objects and never access Control Port transport or browser storage directly. Existing Hub↔LIGHTHOUSE wiring can adopt these contracts later without this branch touching its files.

**Tech Stack:** JavaScript ES modules, Node.js built-in test runner, CommonJS test files with dynamic import.

**Spec:** `docs/superpowers/specs/2026-09-19-infinity-knowledge-centre-board-v1-design.md`

## Global Constraints

- GO Hub/Centre remains the governed entry and exit.
- LIGHTHOUSE owns live board truth; ChatGPT memory is not authority.
- One board belongs to exactly one Work ID.
- Employee ID uniqueness is checked only against the current live board.
- No realtime transport, Control Port sync, UI, MIMIR, or Notion archive changes.
- No mutation succeeds without expected revision equality.
- No success receipt exists before readback equality.
- Production code follows test-first RED → GREEN → REFACTOR.

## Review Focus

- Duplicate Employee ID on a live pin must be rejected without changing the board.
- Stale expectedRevision must leave the original board byte-equivalent.
- Return attempts on unclaimed pins must fail without partial mutation.
- Emergency recovery against a newer live revision must return conflict and never replay pending changes.
- Malformed evidence/link arrays must be rejected instead of silently normalized into misleading truth.

---

### Task 1: Board and Pin Contract

**Files:**
- Create: `lighthouse-next/centre-board/board-contract.mjs`
- Test: `tests/greenfield-lighthouse-centre-board-contract.test.cjs`

**Interfaces:**
- Produces: `createCentreBoard(input)`, `createCentrePin(input)`, `assertEmployeeIdAvailable(board, employeeId)`, `CENTRE_BOARD_PIN_STATUSES`
- Consumes: no project modules

- [ ] **Step 1: Write failing creation and validation tests**

Test with Node's `node:test` that:
- `createCentreBoard({ boardId:'board-1', workId:'WORK-1', at:'2026-09-19T01:00:00.000Z' })` returns schemaVersion 1, revision 1, empty frozen pins/audit.
- `createCentrePin` rejects an empty Work ID and an unknown status.
- a valid OPEN pin is frozen and starts at revision 1.
- duplicate Employee ID found on a non-ARCHIVED live pin throws `CENTRE_BOARD_EMPLOYEE_ID_CONFLICT:<id>`.
- the same ID appearing only on an ARCHIVED pin remains available.
- malformed evidence or links throws `CENTRE_BOARD_EVIDENCE_INVALID` or `CENTRE_BOARD_LINKS_INVALID`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:
```bash
node --test tests/greenfield-lighthouse-centre-board-contract.test.cjs
```

Expected: FAIL because `board-contract.mjs` does not exist.

- [ ] **Step 3: Implement minimal immutable constructors and validators**

Use exact exports:
```js
export const CENTRE_BOARD_SCHEMA_VERSION = 1;
export const CENTRE_BOARD_PIN_STATUSES = Object.freeze([
  'OPEN', 'DOING', 'VERIFY', 'ARCHIVED', 'REOPENED', 'PENDING_RECOVERY',
]);

export function createCentreBoard(input = {}) {}
export function createCentrePin(input = {}) {}
export function assertEmployeeIdAvailable(board, employeeId) {}
```

Validate required IDs with `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`. Clone inputs with `structuredClone`, freeze returned top-level records and array elements, and never mutate caller-owned values.

- [ ] **Step 4: Run focused test and verify GREEN**

Run the focused command from Step 2. Expected: PASS with no warnings.

- [ ] **Step 5: Commit Task 1**

Commit message: `feat: add centre board and pin contract`

---

### Task 2: Entry Claim and Board Read Receipt

**Files:**
- Create: `lighthouse-next/centre-board/board-session.mjs`
- Test: `tests/greenfield-lighthouse-centre-board-session.test.cjs`

**Interfaces:**
- Consumes: `createCentrePin`, `assertEmployeeIdAvailable` from Task 1
- Produces: `enterCentreBoard(board, input)`, returning `{ board, receipt }`

- [ ] **Step 1: Write failing entry tests**

Test that `enterCentreBoard`:
- requires matching Work ID, Employee ID, exact expectedRevision, and at least one existing pin ID.
- moves claimed OPEN/REOPENED pins to DOING, assigns ownerEmployeeId, adds touchedBy once, increments each changed pin revision and board revision exactly once.
- returns an immutable `BOARD_READ` receipt containing receiptId, Work ID, Employee ID, beforeRevision, afterRevision, claimedPinIds, and readbackRevision.
- rejects duplicate live Employee ID, missing pin, and stale board revision without modifying the input board.
- repeated claim by the same Employee ID and same receiptId is idempotent only when the board already records that receipt in audit; otherwise receipt ID reuse with different input throws `CENTRE_BOARD_RECEIPT_ID_CONFLICT`.

- [ ] **Step 2: Run focused test and verify RED**

Run:
```bash
node --test tests/greenfield-lighthouse-centre-board-session.test.cjs
```

Expected: FAIL because `board-session.mjs` does not exist.

- [ ] **Step 3: Implement minimal entry flow**

Export:
```js
export function enterCentreBoard(board, {
  receiptId, workId, employeeId, pinIds, expectedRevision, at,
} = {}) {}
```

Build the entire next board in memory, validate it, then return it. Do not mutate the input. Append one audit event with type `BOARD_READ`. Verify returned revision and claimed ownership before creating the receipt.

- [ ] **Step 4: Run focused test and verify GREEN**

Run the focused command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Commit message: `feat: add centre board entry receipt`

---

### Task 3: Return Update and Board Return Receipt

**Files:**
- Modify: `lighthouse-next/centre-board/board-session.mjs`
- Modify: `tests/greenfield-lighthouse-centre-board-session.test.cjs`

**Interfaces:**
- Consumes: board produced by `enterCentreBoard`
- Produces: `returnCentreBoard(board, input)`, returning `{ board, receipt }`

- [ ] **Step 1: Add failing return tests**

Test that `returnCentreBoard`:
- accepts updates only for pins owned/touched by the Employee ID.
- requires `result`, `nextAction`, valid evidence array, exact expectedRevision, and a final status in OPEN, DOING, VERIFY, or PENDING_RECOVERY.
- updates only named pins, increments changed pin revisions and board revision once, and appends one BOARD_RETURN audit event.
- creates receipt only after readback confirms changed pin values and revision.
- rejects unclaimed pins, ARCHIVED as a worker-selected final status, malformed evidence, stale revision, and readback mismatch without partial mutation.

- [ ] **Step 2: Run focused test and verify RED**

Run:
```bash
node --test tests/greenfield-lighthouse-centre-board-session.test.cjs
```

Expected: FAIL because `returnCentreBoard` is not exported.

- [ ] **Step 3: Implement minimal return flow**

Export:
```js
export function returnCentreBoard(board, {
  receiptId, workId, employeeId, expectedRevision, updates, at,
} = {}) {}
```

Each update is:
```js
{
  pinId,
  status,
  result,
  nextAction,
  evidence,
}
```

Do all validation before constructing the next board. Receipt type is `BOARD_RETURN`; include updatedPinIds and readbackRevision.

- [ ] **Step 4: Run focused test and verify GREEN**

Run the focused command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit Task 3**

Commit message: `feat: add centre board return receipt`

---

### Task 4: Emergency Capsule and Conflict-Safe Recovery

**Files:**
- Create: `lighthouse-next/centre-board/emergency-capsule.mjs`
- Test: `tests/greenfield-lighthouse-centre-board-emergency.test.cjs`

**Interfaces:**
- Consumes: immutable board and pending return-shaped updates
- Produces: `createEmergencyCapsule(input)`, `recoverEmergencyCapsule(board, capsule, input)`

- [ ] **Step 1: Write failing emergency tests**

Test that:
- capsule requires capsuleId, Work ID, Employee ID, reason, baseBoardRevision, claimedPinIds, pendingChanges, evidence, and at.
- capsule status is PENDING_RECOVERY and the result is deeply immutable enough that caller arrays cannot mutate it.
- fingerprint is deterministic for the same semantic input even when object key order differs.
- secrets are rejected when a key matches pin/password/recovery/vault/secret/token/passphrase.
- recovery returns `{ status:'CONFLICT', reason:'CENTRE_BOARD_RECOVERY_CONFLICT' }` and the unchanged board when current revision differs from baseBoardRevision.
- matching recovery uses the same return validation, applies once, emits RECOVERY receipt, and repeated capsule replay is idempotent.
- readback mismatch keeps the capsule pending and throws `CENTRE_BOARD_READBACK_MISMATCH`.

- [ ] **Step 2: Run focused test and verify RED**

Run:
```bash
node --test tests/greenfield-lighthouse-centre-board-emergency.test.cjs
```

Expected: FAIL because `emergency-capsule.mjs` does not exist.

- [ ] **Step 3: Implement canonical fingerprint and recovery**

Export:
```js
export function createEmergencyCapsule(input = {}) {}
export function recoverEmergencyCapsule(board, capsule, {
  receiptId, at,
} = {}) {}
```

Use a local canonical JSON serializer with sorted object keys. Use Web Crypto `crypto.subtle.digest('SHA-256', ...)` only if the function is async; otherwise store the canonical string fingerprint prefixed `canonical-v1:`. V1 should prefer deterministic synchronous behavior and no dependency.

Recovery delegates semantic update validation to `returnCentreBoard`; it does not directly patch pins.

- [ ] **Step 4: Run focused test and verify GREEN**

Run the focused command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit Task 4**

Commit message: `feat: add centre board emergency recovery`

---

### Task 5: Syntax Gate and Whole-Suite Verification

**Files:**
- Modify: `package.json`
- Test: all three new tests plus existing `tests/greenfield-*.test.cjs`

**Interfaces:**
- Consumes: all V1 contract modules
- Produces: deploy gate coverage for syntax and regressions

- [ ] **Step 1: Write a failing package-contract assertion**

Add to the board contract test an assertion that `package.json` `check:syntax` contains:
- `lighthouse-next/centre-board/board-contract.mjs`
- `lighthouse-next/centre-board/board-session.mjs`
- `lighthouse-next/centre-board/emergency-capsule.mjs`

- [ ] **Step 2: Run contract test and verify RED**

Run:
```bash
node --test tests/greenfield-lighthouse-centre-board-contract.test.cjs
```

Expected: FAIL because the syntax script does not list the new modules.

- [ ] **Step 3: Add all three module paths to check:syntax**

Change only the `check:syntax` script. Do not change dependency versions or unrelated scripts.

- [ ] **Step 4: Run focused and full verification**

Run:
```bash
node --test tests/greenfield-lighthouse-centre-board-*.test.cjs
npm test
npm run check:syntax
npm run check:utf8
```

Expected: all commands exit 0 with no test failures.

- [ ] **Step 5: Inspect the branch diff**

Confirm only these scopes changed:
- `docs/superpowers/specs/`
- `docs/superpowers/plans/`
- `lighthouse-next/centre-board/`
- the three new test files
- `package.json`

- [ ] **Step 6: Commit Task 5**

Commit message: `test: gate centre board contract`
