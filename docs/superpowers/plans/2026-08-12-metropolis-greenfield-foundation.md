# METROPOLIS Greenfield Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the isolated Greenfield backend foundation for METROPOLIS with three domain owners, one-time Evidence rev28 import, a single command boundary, and a new encrypted persistence identity.

**Architecture:** New modules live under `greenfield/` and do not replace stable Production paths in this batch. State Schema restarts at 1 under a new DB/Vault identity. Imported evidence is preserved with provenance and no RIDE runtime domain.

**Tech Stack:** JavaScript ES modules, Node.js 22 `node:test`, Web Crypto AES-GCM/PBKDF2, GitHub Actions.

## Global Constraints

- Branch: `greenfield/metropolis-vnext`.
- Do not mutate `main`, Production, or `stock-pocket-secure`.
- Current business domains: `STORE`, `LEDGER`, `CALENDAR` only.
- Cutover evidence: `FLOW-1786527289637`, source revision `28`.
- Preserve `UNCONFIRMED` provenance; never auto-promote owner confirmation.
- Final merge/deploy/device cutover requires Owner Final Gate.

---

### Task 1: Lock Greenfield State Contract

**Files:**
- Test: `tests/greenfield-core.test.cjs`
- Create: `greenfield/core.mjs`

**Interfaces:**
- Produces: `createGreenfieldState()`, `validateGreenfieldState()`, `assertGreenfieldState()`, `canonicalStringify()`.

- [ ] Write failing tests proving Schema 1, exactly three domains, and rejection of an unexpected `RIDE` domain.
- [ ] Run `node --test tests/greenfield-core.test.cjs`; expect module-not-found RED before implementation.
- [ ] Implement the minimal state constructor/validator.
- [ ] Run the test and require PASS.

### Task 2: Build One-time Evidence Import

**Files:**
- Test: `tests/greenfield-import.test.cjs`
- Create: `greenfield/import-evidence.mjs`

**Interfaces:**
- Consumes: Greenfield state from Task 1.
- Produces: `importEvidenceSnapshot(state, evidence, options)`.

- [ ] Write failing tests for package/revision lock, STORE/LEDGER/CALENDAR routing, RIDE exclusion, provenance preservation, reconciliation gate, and second-import rejection.
- [ ] Run the isolated test and verify RED before implementation.
- [ ] Implement validation and deterministic record import with no legacy write.
- [ ] Run tests and require PASS.

### Task 3: Establish One Durable Command Boundary

**Files:**
- Test: `tests/greenfield-command.test.cjs`
- Create: `greenfield/command-runtime.mjs`

**Interfaces:**
- Produces: `createCommandRuntime()` with `register(domain, type, handler)` and `execute(state, command)`.

- [ ] Write failing tests for domain/type ownership, stale expected revision, idempotency, and one-revision commit.
- [ ] Verify RED.
- [ ] Implement clone-before-mutate command execution and command log.
- [ ] Verify PASS.

### Task 4: Create New Encrypted Storage Identity

**Files:**
- Test: `tests/greenfield-persistence.test.cjs`
- Create: `greenfield/persistence.mjs`

**Interfaces:**
- Produces: new DB/Vault constants, memory store, encrypted read and verified commit.

- [ ] Write failing tests proving DB/Vault identity differs from `stock-pocket-secure` and durable stale-revision/readback behavior.
- [ ] Verify RED.
- [ ] Implement AES-GCM/PBKDF2 Vault and durable decrypt readback.
- [ ] Verify PASS.

### Task 5: Integrate with Repository Gate

**Files:**
- Modify: `package.json`

- [ ] Extend syntax gate to `node --check greenfield/core.mjs`, `greenfield/import-evidence.mjs`, `greenfield/command-runtime.mjs`, and `greenfield/persistence.mjs`.
- [ ] Run all four Greenfield tests locally.
- [ ] Open a draft PR to trigger the repository safety gate; Production deploy must remain skipped on PR.
- [ ] Require all existing regression tests plus Greenfield tests, syntax, and UTF-8 gates to pass before the next implementation phase.
