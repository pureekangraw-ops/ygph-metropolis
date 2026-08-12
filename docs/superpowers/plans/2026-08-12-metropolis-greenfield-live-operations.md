# METROPOLIS Greenfield Live Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe live STORE / LEDGER / CALENDAR operations and an atomic cross-domain workflow without reintroducing shared mutable ownership.

**Architecture:** Built-in handlers run through the Greenfield command runtime and receive only their own domain slice. Cross-domain business effects execute entirely in memory, then the final state is encrypted and committed once against the durable starting revision. Import reconciliation is stored as cutover proof and is no longer confused with the moving live Ledger balance.

**Tech Stack:** JavaScript ES modules, Node.js 22 `node:test`, Web Crypto, GitHub Actions.

## Global Constraints

- STORE / LEDGER / CALENDAR only; no RIDE runtime.
- Protected Ledger transactions are append-only; correction uses a linked opposite transaction.
- Calendar status changes keep the previous snapshot + provenance in history and do not move money themselves.
- Cross-domain workflow failure must write nothing.
- `stock-pocket-secure` remains untouched.
- No merge/deploy/device cutover before Owner Final Gate.

---

### Task 1: Built-in Domain Operations

**Files:** `greenfield/domain-operations.mjs`, `tests/greenfield-domain-operations.test.cjs`

- [ ] Write RED tests for Store record creation, Ledger transaction creation, linked reversal, and Calendar status history.
- [ ] Implement domain-local handlers only.
- [ ] Verify original Ledger transaction remains byte-for-byte unchanged after reversal.
- [ ] Verify Calendar mutation leaves Ledger unchanged.

### Task 2: Atomic Workflow Runtime

**Files:** `greenfield/workflow-runtime.mjs`, `tests/greenfield-workflow.test.cjs`

- [ ] Write RED tests for a STORE + LEDGER workflow and a second-command failure.
- [ ] Read durable Greenfield truth once before execution.
- [ ] Execute all commands against in-memory state with runtime-managed revisions.
- [ ] Commit the final state once against the starting durable revision.
- [ ] Verify any command failure leaves durable state unchanged.

### Task 3: Separate Import Proof from Live Ledger Truth

**Files:** `greenfield/cutover.mjs`, `tests/greenfield-cutover.test.cjs`

- [ ] Write RED test that adds a valid live Ledger transaction after cutover and re-enters initialization.
- [ ] Persist `meta.importVerification` during first cutover.
- [ ] On later initialization, return stored import verification and separately project the current Ledger balance.
- [ ] Never reclassify valid post-import activity as an import mismatch.

### Task 4: Repository Gate

**Files:** `package.json`

- [ ] Add new Greenfield modules to syntax gate.
- [ ] Run full Greenfield suite locally.
- [ ] Run PR Actions gate and require Production deploy to remain skipped.
