# METRO UI LANGUAGE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the existing MANUAL four-house UI so Income, Outcome, Calendar, and Ledger share one mobile-first List → Detail → Action language without changing business truth or adding capability.

**Architecture:** Keep `greenfield/manual-four-houses.mjs` as the existing business facade and `ui/app.mjs` as the app/runtime owner. Refactor only the MANUAL presentation layer in `ui/manual-finance-ui.mjs` plus minimal shell/CSS/release metadata so rows open details, one primary action is exposed per current state, secondary/dangerous actions are intentional, and short actions use one shared bottom-sheet surface. Durable mutation continues through existing facade methods and `onChanged` durable readback.

**Tech Stack:** Browser ES modules, DOM APIs, Node built-in test runner, existing Greenfield runtime/facade, PWA service worker.

**Spec:** `docs/superpowers/specs/2026-09-01-metro-ui-language-design.md`

## Global Constraints
- Do not change business logic to satisfy UI polish.
- Do not create Functions just to create buttons.
- Income / Outcome / Calendar / Ledger use one shared interaction grammar.
- List is default; cards are exceptional story blocks.
- Tap row opens Detail; one Primary Action is dominant.
- Secondary/dangerous actions live in an intentional secondary area.
- Short actions with few choices use a bottom sheet.
- Commit success must be followed by durable readback before visible success.
- Do not use fake Undo for committed money/durable truth.
- Stop when the five-question completion gate is satisfied across all four houses.

---

### Task 1: Lock the shared UI-language contract

**Files:**
- Create: `tests/greenfield-metro-ui-language.test.cjs`
- Modify: `ui/manual-finance-ui.mjs`
- Modify: `styles.css`

**Interfaces:**
- Consumes: existing `createManualFinanceUi({ documentRef, getManual, onChanged, notify })` and MANUAL facade methods.
- Produces: shared record rows with `data-record-row`, detail surface with `data-record-detail`, one primary action marker `data-primary-action`, secondary menu trigger `data-secondary-actions`, and bottom sheet `manualActionSheet`.

- [ ] **Step 1: Write failing structural tests** asserting list-default rows, tap-to-detail hooks, one primary-action marker, secondary action affordance, bottom sheet markup, and no inline receivable payment controls on list rows.
- [ ] **Step 2: Run `node --test tests/greenfield-metro-ui-language.test.cjs`** and verify RED against the current card/inline-action UI.
- [ ] **Step 3: Refactor `ui/manual-finance-ui.mjs` minimally** to create reusable row/detail/sheet helpers while preserving all existing facade calls and readback callback behavior.
- [ ] **Step 4: Add focused mobile-safe CSS** for tappable rows, detail panel, action hierarchy, bottom sheet, loading/disabled states, and `details` progressive disclosure without changing global visual architecture.
- [ ] **Step 5: Run the focused test** and verify GREEN.
- [ ] **Step 6: Commit** `feat: unify MANUAL list detail action language`.

### Task 2: Apply the language to Income and Outcome

**Files:**
- Modify: `ui/manual-finance-ui.mjs`
- Test: `tests/greenfield-metro-ui-language.test.cjs`
- Test: `tests/greenfield-manual-four-houses-ui.test.cjs`

**Interfaces:**
- Income consumes existing `setTarget`, `createReceivable`, `receiveReceivable`, `incomeSummary`.
- Outcome consumes existing `setCeiling`, existing app Expense/Obligation forms, `outcomeSummary`, and Ledger lifecycle actions already exposed by the facade.

- [ ] **Step 1: Extend RED tests** so Target/Ceiling remain exceptional cards, Receivables are tappable rows, and forms are opened by context actions instead of being permanently mixed with overview content.
- [ ] **Step 2: Run focused tests** and verify the expected failure.
- [ ] **Step 3: Implement progressive disclosure** for Target/Ceiling/Receivable forms and make receivable settlement a Detail primary action using the shared sheet for full/partial choice.
- [ ] **Step 4: Verify successful settlement re-renders from `onChanged` durable readback** and visible remaining truth comes from the refreshed facade state.
- [ ] **Step 5: Run focused tests** and verify GREEN.
- [ ] **Step 6: Commit** `feat: speak shared UI language in income outcome`.

### Task 3: Apply the language to Calendar and Ledger

**Files:**
- Modify: `ui/manual-finance-ui.mjs`
- Test: `tests/greenfield-metro-ui-language.test.cjs`
- Test: `tests/greenfield-manual-four-houses-ui.test.cjs`

**Interfaces:**
- Calendar consumes existing `calendarToday`, `calendarUpcoming`, `calendarOverdue`, `getRecord`, lifecycle/edit/reschedule/cancel methods already in the MANUAL facade.
- Ledger consumes existing `searchLedger`, `getRecord`, `history`, `related`, `editLedgerMetadata`, `cancelExpected`, `refund`, `reverse`.

- [ ] **Step 1: Extend RED tests** for Today/Upcoming/Overdue list rows opening one shared Detail view and Ledger search results following the same interaction pattern.
- [ ] **Step 2: Run focused tests** and verify RED.
- [ ] **Step 3: Implement Calendar and Ledger detail rendering** with current truth first, one primary action when actionable, and History/Related below current truth.
- [ ] **Step 4: Move edit/cancel/refund/reverse out of parallel row buttons** into intentional secondary actions; durable transaction correction remains Refund/Reverse, never Undo.
- [ ] **Step 5: Run focused tests** and verify GREEN.
- [ ] **Step 6: Commit** `feat: unify calendar ledger detail actions`.

### Task 4: Close release gates and verify the UI round

**Files:**
- Modify: `package.json` only if new production syntax coverage is missing.
- Modify: `RELEASE_MANIFEST.json` for exact production allowlist and current asset revision.
- Modify: `sw.js` for exact offline shell and matching asset revision.
- Test: `tests/greenfield-hard-cut.test.cjs`
- Test: `tests/greenfield-service-worker.test.cjs`

**Interfaces:**
- Production manifest, service-worker shell, and repository syntax gate remain exact authorities.

- [ ] **Step 1: Run `npm run deploy:gate`** and capture only real contract drift.
- [ ] **Step 2: Fix exact publication/syntax/asset-revision drift** caused by the UI files; do not weaken gates.
- [ ] **Step 3: Re-run `npm run deploy:gate`** and require full GREEN.
- [ ] **Step 4: Check PR-head workflows** and require Greenfield Deploy Gate plus LIGHTHOUSE APK Debug to complete successfully for the final exact head.
- [ ] **Step 5: Record the UI-language closeout in the MANUAL checkpoint/PR evidence without marking PR ready or merging.**
- [ ] **Step 6: Stop UI polishing and return execution to MANUAL four-house development.**
