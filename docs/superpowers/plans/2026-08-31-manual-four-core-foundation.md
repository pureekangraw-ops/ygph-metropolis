# Manual Four-Core Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish four explicit Manual foundation homes from existing Greenfield anchors without adding new business logic, intent, UI, or persistence.

**Architecture:** Add four immutable core descriptors plus one registry. The descriptors identify existing runtime/domain/projection anchors only; Greenfield Runtime remains the sole execution and durable-truth root. Phase 2 will later define Idea/Logic/Function on top of these homes.

**Tech Stack:** Node.js ESM, `node:test`, existing Greenfield Runtime/domain/projection modules.

**Spec:** `docs/superpowers/specs/2026-08-31-manual-four-core-foundation-design.md`

## Global Constraints

- Phase 1 only: no Action Intent, chat routing, UI, new persistence, or new business rules.
- Exactly four homes: INCOME, OUTCOME, LEDGER, CALENDAR.
- `GREENFIELD_RUNTIME` remains shared runtime root and durable truth path.
- LEDGER is Manual head; CALENDAR is not money truth.
- No merge, deploy, or patch publication.

---

### Task 1: Foundation contract

**Files:**
- Create: `tests/greenfield-manual-four-core-foundation.test.cjs`

**Interfaces:**
- Consumes: future exports from `manual/foundation.mjs`.
- Produces: structural contract for the four homes and their existing anchors.

- [ ] **Step 1: Write the failing test**

Create a test that imports `MANUAL_CORE_IDS`, `MANUAL_CORES`, and `getManualCore`, requires exactly four homes, checks shared runtime root/no separate store, verifies LEDGER head/CALENDAR domain, and confirms the anchor names already present in `greenfield/runtime.mjs` and `greenfield/projections.mjs`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/greenfield-manual-four-core-foundation.test.cjs`
Expected: FAIL because `manual/foundation.mjs` does not exist.

### Task 2: Four home descriptors

**Files:**
- Create: `manual/cores/income.mjs`
- Create: `manual/cores/outcome.mjs`
- Create: `manual/cores/ledger.mjs`
- Create: `manual/cores/calendar.mjs`
- Create: `manual/foundation.mjs`

**Interfaces:**
- Produces: immutable descriptor objects and registry exports `MANUAL_CORE_IDS`, `MANUAL_CORES`, `getManualCore`.

- [ ] **Step 1: Implement the minimal descriptors**

Each descriptor exports only foundation metadata: `id`, `manualRole`, `runtimeRoot`, `truthDomain`, `storageOwner`, `runtimeAnchors`, and `projectionAnchors`. No mutation functions are added.

- [ ] **Step 2: Implement the registry**

`manual/foundation.mjs` imports the four descriptors, validates exact IDs/uniqueness/shared root/no separate storage, freezes the registry, and provides `getManualCore(id)` with fail-closed unknown-ID behavior.

- [ ] **Step 3: Run focused tests**

Run: `node --test tests/greenfield-manual-four-core-foundation.test.cjs`
Expected: PASS.

- [ ] **Step 4: Run project gates**

Run: `npm test && npm run check:utf8` and syntax-check the new Manual files explicitly with `node --check`.
Expected: PASS.
