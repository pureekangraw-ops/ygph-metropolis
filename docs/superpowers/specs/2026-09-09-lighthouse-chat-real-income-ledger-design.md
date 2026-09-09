# LIGHTHOUSE CHAT → Real Ledger Income Design

Date: 2026-09-09
Status: Owner-approved design direction, implementation not started
Base: `main` after PR #117

## 1. Goal

Move only **general income** in LIGHTHOUSE CHAT from demo-local mutation to the real Greenfield Ledger.

Example:

`ทิป 59` → CHAT collects/clarifies source → owner confirms → write real `OTHER_INCOME` → read back the Ledger record → only then show `บันทึกแล้ว`.

The app must never claim success from local demo state alone.

## 2. Scope

This phase includes:

- CHAT general-income confirmation.
- Real Greenfield `runtime.otherIncome(...)` mutation through the active runtime session.
- Readback verification of the exact Ledger transaction.
- Retry safety with stable workflow/transaction IDs so a readback failure cannot create duplicate income on retry.
- Runtime-backed finance truth for Home summary fields that come from Ledger: current cash/balance, today's income, today's expense, and net.
- Runtime-backed Manual Ledger history.

This phase does **not** include:

- Store sale mutation or stock changes.
- Sale reversal migration.
- Calendar/obligation migration.
- Expected-income forecasting migration.
- Release manifest/version/APK/store publication work.

Demo Store/Calendar behavior may remain available, but it must not modify or be presented as the source of the Ledger-backed finance totals.

## 3. Existing Truth We Reuse

Greenfield already provides:

- An authenticated active runtime session via `greenfield/runtime-session.mjs`.
- `runtime.otherIncome(...)` backed by `buildOtherIncomeWorkflow(...)`.
- A real Ledger `TRANSACTION` with direction `IN`, subtype `OTHER_INCOME`, amount in satang, title, timestamps, and durable persistence.
- `runtime.readState()` for durable readback.
- `runtime.project().ledgerBalanceSatang` for the real Ledger balance.

LIGHTHOUSE must reuse these paths rather than invent a second finance store.

## 4. New LIGHTHOUSE Boundary

Add one small runtime-ledger adapter under `lighthouse-next/` rather than importing the broad Master Input router.

Reason: PR #117 intentionally kept the packaged LIGHTHOUSE runtime closure narrow. General income needs only the active runtime session plus the existing `otherIncome` workflow. Pulling the whole Master Input router into the bundle would expand scope without adding needed behavior.

The adapter is responsible for only two jobs:

1. `recordOtherIncome(...)`
2. `readLedgerTruth(...)`

It does not parse chat text and does not own UI state.

## 5. Write Flow

When CHAT has a pending general income that is ready for confirmation:

1. Ensure the pending item has a stable `workflowId` and `ledgerTransactionId`.
2. Persist those non-secret IDs with the pending item before the durable mutation.
3. Use `withRuntimeSession(...)` to access the already-unlocked runtime.
4. Call `runtime.otherIncome({ workflowId, ledgerTransactionId, title, amountSatang })`.
5. If the call reports `DUPLICATE_COMMAND:<same idempotency key>`, treat it as a possible retry, not as success.
6. Call `runtime.readState()`.
7. Find the exact Ledger record by `ledgerTransactionId`.
8. Verify all required fields:
   - type = `TRANSACTION`
   - direction = `IN`
   - subtype/detail represents `OTHER_INCOME`
   - amount matches exactly
   - title matches the CHAT source
9. Read `runtime.project().ledgerBalanceSatang`.
10. Only after verification succeeds:
   - clear the pending item,
   - refresh Ledger-backed truth surfaces,
   - show `บันทึกแล้ว ...`.

## 6. Retry / Failure Safety

### Locked runtime

If the app is locked or the active runtime session is unavailable:

- make no mutation,
- keep the pending income,
- do not show success,
- tell the owner to unlock/sign in again.

### Durable write fails before commit

- keep the same pending item and IDs,
- show that the item is not yet saved,
- allow retry.

### Write may have committed but readback fails

This is the critical case.

- keep the same `workflowId` and `ledgerTransactionId`,
- do not say `บันทึกแล้ว`,
- retry with those same IDs.

If the durable command already exists, Greenfield returns a duplicate-command error. LIGHTHOUSE then performs readback using the same transaction ID. If the exact record matches, the retry is recovered without creating a second income transaction.

### Readback mismatch

- fail closed,
- keep the pending item,
- do not change UI finance totals from local guesses,
- do not report success.

## 7. Truth Surfaces

After login and after every successful real income write, LIGHTHOUSE reads Ledger truth from the active runtime.

The runtime-backed snapshot contains:

- `ledgerBalanceSatang` from `runtime.project()`.
- Ledger transactions from `state.domains.LEDGER.records`.
- Today's income: sum of non-cancelled `IN` transactions whose `createdAt` falls on the current Bangkok date.
- Today's expense: sum of non-cancelled `OUT` transactions on the current Bangkok date.
- Net = income - expense.
- Manual Ledger history sorted newest first from real Ledger transactions.

Home uses these values for:

- cash/current balance,
- today income,
- today expense,
- net.

Until their real sources are connected, expected-income and obligation numbers must not be presented as part of this real Ledger truth. They should be disabled/placeholder rather than silently reusing demo money.

Manual Ledger history uses real Ledger records only.

Store/Calendar demo surfaces may remain, but they are separate from the Ledger-backed finance truth in this phase.

## 8. CHAT State Rules

CHAT parsing/clarification stays as it is for this phase.

Only the confirmation boundary changes.

Current pending fields remain, with two added non-secret fields for real-write identity:

- `workflowId`
- `ledgerTransactionId`

These IDs are safe to persist in the existing demo/local pending-state storage because they are not credentials or recovery secrets.

The password, recovery code, and runtime itself remain non-persistent.

## 9. UI Messages

Success is only shown after verified readback.

Examples:

- Success: `บันทึกแล้ว 59 บาท · ทิป`
- Locked: `แอปถูกล็อก กรุณาเข้าสู่ระบบแล้วลองยืนยันอีกครั้ง`
- Write/readback failure: `ยังบันทึกไม่สำเร็จ รายการยังค้างอยู่ ลองอีกครั้งได้`

No failure path may use the success wording.

## 10. Testing Strategy

Use TDD.

Required coverage:

1. RED: general-income confirmation no longer mutates local `cash`, `todayIncome`, or local transaction history as authority.
2. RED: `recordOtherIncome` calls the active runtime with baht converted exactly to satang.
3. RED: success requires exact Ledger readback.
4. RED: locked runtime makes zero mutation and keeps pending state.
5. RED: write failure makes zero success claim.
6. RED: readback mismatch makes zero success claim.
7. RED/GREEN: retry after a simulated durable-write/readback-failure reuses the same IDs and recovers through duplicate-command + readback without creating a second income.
8. Runtime-backed Home finance values come from Ledger truth, not demo defaults.
9. Manual Ledger history comes from Ledger records.
10. Existing CHAT clarification/edit/cancel behavior still passes.
11. Existing Store sale demo behavior remains unchanged in this phase.
12. Android and isolated Web bundle tests prove the new LIGHTHOUSE adapter and any transitive Greenfield dependency are staged identically.
13. Full deploy gate and scope-containment checks remain green.

## 11. Packaging

The new LIGHTHOUSE adapter is a required runtime file and must be included by the shared Web/Android bundle builder from PR #117.

It may import `greenfield/runtime-session.mjs`, which is already in the required Greenfield runtime closure.

Do not add `greenfield/master-input-router.mjs` merely for this feature.

## 12. Scope Guard

Expected implementation changes are limited to the LIGHTHOUSE general-income runtime bridge, truth rendering, focused tests, and shared bundle file list if needed.

Do not modify in this phase:

- `RELEASE_MANIFEST.json`
- `release/lighthouse-update.json`
- `android-shell/version.json`
- `.github/workflows/lighthouse-owner-build.yml`

Do not claim APK/Device Gate/release completion from this work.

## 13. Completion Criteria

This phase is complete only when:

- `ทิป 59` followed by owner confirmation creates one real `OTHER_INCOME` Ledger transaction.
- LIGHTHOUSE verifies that exact durable transaction before saying success.
- Retrying an uncertain result cannot double-credit the Ledger.
- Home cash/income/expense/net are read from real Ledger truth.
- Manual Ledger history is read from real Ledger records.
- Demo money is not used as the authority for those real finance surfaces.
- Store sale remains out of scope and unchanged.
- Web/Android shared packaging and the full repository gates pass.
