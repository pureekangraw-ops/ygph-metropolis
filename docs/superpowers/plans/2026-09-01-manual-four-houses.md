# MANUAL Four Houses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the durable manual lifecycle for Income, Outcome, Calendar, and Ledger without adding duplicate engines or product scope.

**Architecture:** Reuse the existing Greenfield command runtime, atomic workflow executor, domain history, and durable readback. Add only missing domain commands and a thin Manual facade/projection layer; Actual financial truth remains immutable in meaning and corrections are expressed as linked reversal/refund/amendment events rather than deleting history.

**Tech Stack:** Node.js ESM, Greenfield command runtime, atomic workflow runtime, encrypted durable state, node:test.

**Spec:** Owner-approved conversation scope “เฟส MANUAL — 4 บ้าน”.

## Global Constraints

- Reuse existing runtime/workflows first; no new engine.
- Common lifecycle language: Create → View → Edit → Complete → Cancel.
- Future/Expected truth must remain separate from Actual financial truth.
- Actual financial history must not be deleted to correct events.
- Durable actions require readback of the latest truth.
- Compare = Target/Limit → Actual → Delta.
- Settle = Expected → Actual → Remaining.
- Lifecycle = OPEN → PARTIAL → COMPLETED / CANCELLED.
- Reminder/Repeat and nonessential improvements are out of scope.

---

### Task 1: Manual capability contract

**Files:**
- Create: `tests/greenfield-manual-four-houses.test.cjs`

- [ ] Write RED tests covering Income, Outcome, Calendar, Ledger, shared Compare/Settle/Lifecycle, history preservation, and durable readback.
- [ ] Run Greenfield CI and confirm the new tests fail for missing Manual exports/commands.

### Task 2: Missing durable domain commands

**Files:**
- Modify: `greenfield/domain-operations.mjs`

- [ ] Add durable expectation records (`TARGET`, `CEILING`) without affecting Ledger balance.
- [ ] Add generic `RECEIVABLE` lifecycle with partial/full settlement.
- [ ] Add safe metadata edit/cancel for non-actual records with archived history.
- [ ] Add transaction refund/amendment commands that create linked compensating Actual transactions and never delete the original.
- [ ] Add Calendar edit while preserving prior truth.

### Task 3: Manual facade and read projections

**Files:**
- Create: `greenfield/manual-four-houses.mjs`

- [ ] Reuse existing runtime methods for Add Income, Add Expense, Obligation and Calendar operations.
- [ ] Build missing command plans through `executeMultiGroupCommands` using the current durable revision.
- [ ] Implement Get/View/Search/Filter/Summary/Dashboard/Analyze projections.
- [ ] Implement Target/Ceiling comparison and Receivable/Obligation settlement views.
- [ ] Implement related-record traversal through explicit/link fields and existing `sourceRef`.
- [ ] Every mutation rereads durable state and returns verified readback.

### Task 4: Full lifecycle verification

**Files:**
- Test: `tests/greenfield-manual-four-houses.test.cjs`

- [ ] Income: add, search, summary, target edit/progress, receivable partial/full.
- [ ] Outcome: expense, summary, ceiling progress, obligation partial/full, refund/reverse.
- [ ] Calendar: create, today/upcoming/overdue, detail, reschedule, edit, complete, cancel.
- [ ] Ledger: record/history/search/filter/summary/dashboard/edit/cancel-by-meaning/reverse/refund/related/readback/analyze.
- [ ] Confirm Actual corrections preserve originals and create linked compensating truth.
- [ ] Run full Greenfield and Android-shell foundation suites.

### Task 5: Phase checkpoint

**Files:**
- Create: `docs/manual-four-houses-checkpoint.md`

- [ ] Record reused capabilities, new gaps closed, deferred improvements, and exact CI evidence.
- [ ] Stop when the four-house item lifecycle is complete; do not add extra functions for button count.
