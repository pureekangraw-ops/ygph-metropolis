# METROPOLIS Greenfield Runtime Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Greenfield from re-creating cross-domain coupling, add browser storage access for the new DB only, and prove imported Ledger truth through a pure projection.

**Architecture:** Domain handlers receive only their own mutable domain slice. Ledger calculations are pure projections over imported/live records and never rewrite Evidence. Browser IndexedDB access is isolated behind a new-identity adapter.

**Tech Stack:** JavaScript ES modules, Node.js 22 `node:test`, IndexedDB adapter, GitHub Actions.

## Global Constraints

- `STORE`, `LEDGER`, `CALENDAR` remain the only Greenfield domains.
- `stock-pocket-secure` remains untouched.
- Browser adapter must open `ygph-metropolis-greenfield-secure` only.
- Ledger mismatch is reported, never silently corrected.
- PR remains draft; Production deploy stays skipped.

---

### Task 1: Domain Mutation Isolation

**Files:** `greenfield/command-runtime.mjs`, `tests/greenfield-command.test.cjs`, `tests/greenfield-domain-boundary.test.cjs`

- [ ] Write failing test proving handler context has `domainState` and no whole mutable `state`.
- [ ] Verify RED against current command runtime.
- [ ] Pass only the selected domain slice plus immutable command context to handlers.
- [ ] Verify STORE command leaves LEDGER and CALENDAR unchanged.

### Task 2: Ledger Projection/Reconciliation

**Files:** `greenfield/projections.mjs`, `tests/greenfield-projections.test.cjs`

- [ ] Write failing tests for IN/OUT transaction projection, cancelled-record exclusion, opening balance, PASS and MISMATCH snapshot checks.
- [ ] Verify RED while module is absent.
- [ ] Implement pure projection without mutating imported records.
- [ ] Verify synthetic tests and run against owner Evidence rev28; expected Ledger balance is `464200` satang and snapshot reconciliation `PASS`.

### Task 3: Browser Greenfield Store

**Files:** `greenfield/browser-store.mjs`, `tests/greenfield-browser-store.test.cjs`, `package.json`

- [ ] Write failing tests for IndexedDB-unavailable rejection and new DB/store get/put behavior.
- [ ] Verify RED while module is absent.
- [ ] Implement IndexedDB adapter using only Greenfield DB constants.
- [ ] Add new modules to syntax gate.
- [ ] Run full repository Gate on PR and require Production deploy to remain skipped.
