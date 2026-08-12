# METROPOLIS Greenfield Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Evidence rev28 initialization an all-or-nothing Greenfield operation that refuses inconsistent Ledger truth before any durable write.

**Architecture:** Cutover composes the existing state constructor, one-time importer, pure Ledger reconciliation, and encrypted persistence. It first checks for an already initialized Greenfield Vault; otherwise it imports in memory, verifies Ledger, commits once, then decrypts durable readback.

**Tech Stack:** JavaScript ES modules, Node.js 22 `node:test`, Web Crypto.

## Global Constraints

- Never read/write/delete `stock-pocket-secure` during this flow.
- Expected Evidence package/revision remains explicit input.
- Ledger mismatch blocks the write.
- Re-running cutover on an initialized Greenfield store is read-only and returns `ALREADY_INITIALIZED`.
- No Production/device cutover in this PR.

### Task 1: Cutover Contract

**Files:** `tests/greenfield-cutover.test.cjs`, `greenfield/cutover.mjs`, `package.json`

- [ ] Write failing test for verified one-time import, RIDE exclusion, encrypted readback, and idempotent second initialization.
- [ ] Write failing test proving Ledger mismatch leaves store empty.
- [ ] Verify RED while `greenfield/cutover.mjs` is absent.
- [ ] Implement in-memory import → Ledger check → encrypted commit → durable readback.
- [ ] Add cutover module to syntax gate.
- [ ] Run full tests and GitHub Actions safety gate.
