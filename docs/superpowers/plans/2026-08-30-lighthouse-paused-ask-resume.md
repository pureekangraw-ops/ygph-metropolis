# Lighthouse PAUSED ASK RESUME Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing Lighthouse recovery flow so unresolved input becomes a lightweight WAITING state with semantic UI directives, can resume from the exact paused point, and drops the old paused work when the owner switches to a new command or cancels.

**Architecture:** Reuse `lighthouse/intent-recovery.mjs` and `lighthouse/master-input-recovery-session.mjs`; do not create a second pause/session subsystem. The recovery session owns lightweight paused state and semantic directives, while `ui/master-input.mjs` renders the owner-facing status as `รอ` and clears the active session before routing a genuinely new input. Provider/AI remains downstream of local parsing/recovery and is not invoked merely to render a waiting choice.

**Tech Stack:** Node.js 22, ES modules, Node test runner, browser DOM UI, GitHub Actions.

**Spec:** Google Drive `Core Engine - PAUSED ASK RESUME Architecture` — file ID `1KQ-n9RgQd0lk21j4dIsd1UVz8JlvFPD6hSM9LbDRc0E`.

## Global Constraints

- Base implementation SHA: `3b4a5b7e08da6ee60442c9d994170318cbcaeef8`.
- Work only on `feature/lighthouse-paused-ask-resume-20260830`; do not modify `main`.
- Reuse the existing in-memory recovery session; no localStorage/sessionStorage/indexedDB persistence.
- Missing parameters and ambiguous targets are WAITING/PAUSED states, not Error telemetry.
- New unrelated input or explicit cancel aborts/drops the old paused work before the new input is routed.
- Correction/fill input patches the original slot and rejoins from the paused point; do not reinterpret the whole original input as a new request.
- Semantic UI types are exactly `CONFIRM_TEXT`, `PICK_DATE`, `SELECT_TARGET`, `ENTER_VALUE`, `CONFIRM_ACTION`.
- User-facing paused state copy is `รอ`; internal states may remain English.
- Do not connect unsupported generic DELETE/UPDATE/Multi-Group natural-language execution as part of this plan.
- No merge, deploy, or production cutover.

---

### Task 1: Lock WAITING and interruption behavior with failing tests

**Files:**
- Modify: `tests/greenfield-lighthouse-phase1-recovery-session.test.cjs`
- Modify: `tests/greenfield-lighthouse-phase1-recovery-frontdoor.test.cjs`
- Modify: `tests/greenfield-lighthouse-intent-recovery.test.cjs`
- Create: `.github/workflows/paused-ask-resume-verify.yml`

**Interfaces:**
- Consumes: existing `classifyIncomingInput`, `applySessionOwnerInput`, `createRecoverySession`.
- Produces: executable contract for WAITING, semantic directives, abort/drop, direct owner answer, and user-facing `รอ`.

- [ ] **Step 1: Add CI for this branch before behavior changes**

Create a workflow that runs Node 22, `npm ci`, targeted Lighthouse recovery tests, serial full tests, normal full tests, syntax, and UTF-8 checks.

- [ ] **Step 2: Change the pending-new-input test to require abort/drop**

Replace the current assertion that a new input preserves the pending session with assertions that the result is `ABORTED`, carries `ABORTED_BY_USER_INTERRUPTION`, invalidates every pending `queueId`, and preserves the new text as the reroutable payload.

- [ ] **Step 3: Add an explicit cancel test**

Assert that `ยกเลิก` aborts the paused session, invalidates pending queue IDs, and produces no reroutable command payload.

- [ ] **Step 4: Add a direct-answer test**

For one recoverable numeric slot, assert that a scalar reply such as `160` is treated as an owner answer/correction to that exact slot instead of a new command.

- [ ] **Step 5: Add semantic directive tests**

Assert the public waiting directive contract accepts only `CONFIRM_TEXT`, `PICK_DATE`, `SELECT_TARGET`, `ENTER_VALUE`, `CONFIRM_ACTION`, and that current numeric recovery produces `ENTER_VALUE` without calling a provider.

- [ ] **Step 6: Add front-door UI source tests**

Assert production UI renders paused recovery with owner-facing `รอ`, consumes `ABORTED` by clearing `activeRecoverySession` before routing the new payload, and keeps WAITING separate from `ERROR`.

- [ ] **Step 7: Push the tests and confirm RED**

Expected failure: assertions fail because current production returns `NEW_INPUT` while retaining the paused session and does not expose the new WAITING/directive contract. Do not proceed to production changes until this RED is observed on the exact test commit.

---

### Task 2: Implement lightweight PAUSED/WAITING session semantics

**Files:**
- Modify: `lighthouse/intent-recovery.mjs`
- Modify: `lighthouse/master-input-recovery-session.mjs`

**Interfaces:**
- Consumes: parsed recovery slots with `slotId`, `role`, `state`, `rawSpan`, existing queue IDs.
- Produces: `ABORTED` interruption result, direct-answer correction result, and semantic waiting directive objects.

- [ ] **Step 1: Extend input classification minimally**

Recognize explicit cancel words as `CANCEL`; keep `แก้ไข ...` as `CORRECTION`, `แทนที่ ...` as `REPLACE`, and all other text as a candidate direct answer or new input.

- [ ] **Step 2: Add paused-session abort helper**

Clone the session, set status `ABORTED`, clear every slot `queueId`, and return reason/tag `ABORTED_BY_USER_INTERRUPTION`. A cancel has no next payload; a new command returns the original incoming text as payload.

- [ ] **Step 3: Accept a direct scalar answer only when routing is unambiguous**

If exactly one recoverable slot is waiting and the incoming reply is a scalar value suitable for that slot, apply it to that slot and clear its queue ID. If there are multiple recoverable slots or the reply is command-like, do not guess; treat it as a new input and abort the old pause.

- [ ] **Step 4: Add semantic waiting directive helpers**

Expose an immutable directive with one of the five approved semantic UI types. Map current numeric/value recovery to `ENTER_VALUE`; support `PICK_DATE`, `SELECT_TARGET`, `CONFIRM_TEXT`, and `CONFIRM_ACTION` as validated contract types for callers that already know those needs. Do not invent unsupported record matches.

- [ ] **Step 5: Run targeted tests**

Run the three Lighthouse recovery suites. Expected: all newly added waiting/interruption tests pass.

---

### Task 3: Wire owner-facing `รอ` and safe interruption into Master Input UI

**Files:**
- Modify: `ui/master-input.mjs`
- Test: `tests/greenfield-lighthouse-phase1-recovery-frontdoor.test.cjs`

**Interfaces:**
- Consumes: recovery result statuses `APPLIED`, `SELECTION_REQUIRED`, `REPLACE`, `ABORTED`; waiting directive type/payload.
- Produces: visible `รอ` state and rerouting of new input only after old paused state is cleared.

- [ ] **Step 1: Add internal WAITING UI state with Thai visible label**

Allow internal `WAITING` while setting `#masterInputState` text to `รอ`. Keep provider `ASK` behavior available for legacy provider responses that are not a paused recovery session.

- [ ] **Step 2: Render current waiting directive without AI**

For `ENTER_VALUE` show the specific ask copy for the unresolved slot. Keep the directive renderer generic enough for the five approved semantic types; only render options/controls when payload data is actually present.

- [ ] **Step 3: Clear paused state on interruption before rerouting**

When the recovery layer returns `ABORTED` with a payload, set `activeRecoverySession = null`, replace the working input text with that payload, then continue through the normal router. For explicit cancel with no payload, clear the session and return to IDLE/WAITING-cleared UI without routing a fake command.

- [ ] **Step 4: Resume corrections from the existing slot/session**

Preserve the current `rejoinRecoverySession` path for `APPLIED` results; do not route the original raw text as a fresh request.

- [ ] **Step 5: Run targeted UI/recovery tests**

Expected: waiting status, abort/drop, direct answer, and resume tests all pass.

---

### Task 4: Exact-HEAD verification and closure

**Files:**
- Modify only if required by verification: `package.json`, `.github/workflows/paused-ask-resume-verify.yml`

**Interfaces:**
- Consumes: implementation from Tasks 1-3.
- Produces: exact-HEAD CI evidence.

- [ ] **Step 1: Run targeted recovery gate**

`node --test --test-concurrency=1 tests/greenfield-lighthouse-*recovery*.test.cjs`

Expected: 0 failures.

- [ ] **Step 2: Run serial full suite**

`node --test --test-concurrency=1 tests/greenfield-*.test.cjs`

Expected: 0 failures.

- [ ] **Step 3: Run normal full suite**

`npm test`

Expected: 0 failures.

- [ ] **Step 4: Run syntax and UTF-8 gates**

`npm run check:syntax && npm run check:utf8`

Expected: exit 0.

- [ ] **Step 5: Verify CI on the same exact branch HEAD**

Confirm the dedicated GitHub Actions run has `status=completed`, `conclusion=success`, and `head_sha` equal to the branch HEAD.

- [ ] **Step 6: Compare against the approved Drive spec**

Confirm: PAUSED/WAITING is not Error; correction resumes; new/cancel aborts; semantic UI contract is present; no new unsupported runtime capability is falsely connected. Report any remaining unconnected semantic controls explicitly rather than calling them complete.