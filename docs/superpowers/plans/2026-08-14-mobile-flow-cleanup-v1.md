# Mobile Flow Cleanup v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the mobile shell obstruction, complete Calendar edit/reschedule/cancel flow, then flatten Settings into a centered utility dialog.

**Architecture:** Keep Bottom Navigation as the primary shell. Calendar date edits stay inside the CALENDAR owner via one new command/workflow/runtime method. Settings remains a utility and reuses existing auth/recovery element IDs and handlers.

**Tech Stack:** HTML, CSS, ES modules, Node test runner, existing Greenfield runtime.

## Global Constraints
- Preserve active mint Bottom Navigation treatment.
- Calendar Edit v1 changes due date only.
- Cancel is reachable only from Edit and needs confirmation.
- No change to Ledger amounts, obligation amounts, schema, storage format, or backup format.
- Full `npm run deploy:gate` must pass before merge.

### Task 1: App Shell
- [ ] Add failing source contract for non-sticky empty status and safe-area bottom clearance.
- [ ] Verify RED.
- [ ] Update `styles.css` minimally.
- [ ] Verify GREEN.

### Task 2: Calendar Flow
- [ ] Add failing contract for Edit dialogs and reschedule workflow.
- [ ] Verify RED.
- [ ] Add `CALENDAR_RESCHEDULE` domain command, workflow builder, and runtime method.
- [ ] Add due-date Edit dialog and cancellation confirmation dialog.
- [ ] First-surface actions become payment/complete + Edit; remove direct Cancel.
- [ ] Verify functional and full tests.

### Task 3: Settings
- [ ] Add failing contract for centered flat Settings dialog.
- [ ] Verify RED.
- [ ] Replace system area page with `settingsDialog` containing Security, Backup/Restore, and System sections.
- [ ] Preserve existing control IDs and handlers.
- [ ] Verify GREEN.

### Task 4: Release Gate
- [ ] Update service-worker asset revision/manifest required by the exact asset gate.
- [ ] Run `npm run deploy:gate`.
- [ ] Audit diff for scope.
- [ ] Open PR and require standard PR Gate success.
- [ ] Merge under existing owner approval and verify main Gate/deploy.
