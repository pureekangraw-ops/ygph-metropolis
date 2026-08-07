# METROPOLIS 4.2 Status Traffic Light Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce live task status to green/yellow/red and remove cancelled records from live user-facing lists while preserving audit/history data in the encrypted state.

**Architecture:** Keep State Schema 4 unchanged. Add one pure status classifier in `app.js`, use it for Calendar dots/cards, filter `CANCELLED` only at render/list boundaries, and use CSS to hide the now-obsolete cancelled summary/filter controls. Reports and audit data remain unchanged.

**Tech Stack:** Plain JavaScript, CSS, Node `node:test`, existing encrypted Schema 4 vault, GitHub Actions.

## Global Constraints

- Green = `COMPLETED`.
- Red = not completed/cancelled and due date is before today.
- Yellow = every other active state, including OPEN, PARTIAL, VERIFY, today, and future items.
- `CANCELLED` must not appear in live Calendar, month counts/dots, recent lists, or “ดูทั้งหมด” source histories.
- Cancelled records remain stored and remain available to audit/report logic.
- State Schema remains 4.
- No changes to cash, reversal, encryption, or persistence semantics.

---

### Task 1: Status classifier and regression contract

**Files:**
- Modify: `app.js`
- Create: `tests/metropolis-4.2-status-traffic-light.test.cjs`

**Interfaces:**
- Produces: `calendarSignal(item, today) -> "green" | "yellow" | "red" | "hidden"`

- [ ] **Step 1:** Add failing tests for completed=green, future/open=yellow, overdue active=red, cancelled=hidden, and source-level cancelled filtering markers.
- [ ] **Step 2:** Run the focused test and verify RED.
- [ ] **Step 3:** Implement `calendarSignal` and apply it in Calendar month/card rendering.
- [ ] **Step 4:** Filter cancelled source records from latest lists and `historyHtml`, without changing reports/audit.
- [ ] **Step 5:** Run focused tests and verify GREEN.

### Task 2: Three-color visual treatment and obsolete cancelled controls

**Files:**
- Modify: `metropolis-r5-2.css`

**Interfaces:**
- Consumes: `.signal-green`, `.signal-yellow`, `.signal-red` from Calendar rendering.

- [ ] **Step 1:** Add exactly three visual signal colors for Calendar dots/status surfaces.
- [ ] **Step 2:** Hide the cancelled dashboard mini-cards and Calendar CANCELLED filter using existing IDs/data attributes.
- [ ] **Step 3:** Keep layout responsive after the fourth status tile/filter is hidden.

### Task 3: Patch release and integration

**Files:**
- Modify: `metropolis-r5-2.js`
- Modify: `sw.js`
- Modify: `RELEASE_MANIFEST.json`
- Modify: existing version/cache tests if required.

**Interfaces:**
- Product version: `4.2.1`.
- Service Worker release: `v4.2.1-20260808-r6-status`.

- [ ] **Step 1:** Advance user-facing product version to 4.2.1 and SW cache release.
- [ ] **Step 2:** Run `npm run deploy:gate` and require zero test, syntax, or UTF-8 failures.
- [ ] **Step 3:** Review PR changed files for scope, merge to `main`, then read back `app.js` signal logic and `sw.js` release from `main`.
