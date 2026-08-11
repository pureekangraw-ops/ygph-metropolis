# METROPOLIS Maintenance — Engineering Notes

Status: WORKING / VERIFY BEFORE PRODUCTION CLAIM
Product line: METROPOLIS 4.2.5
Maintenance release: `v4.2.5-20260811-r21-maintenance-center`
Owner / Final Authority: BIG

## Continuation map

Future workers should extend this slice instead of adding another maintenance block to `app.js`.

- `metropolis-maintenance-core.js` — pure deterministic rules. No DOM, IndexedDB, Cache API, Service Worker or durable-state writes. Node-testable.
- `metropolis-maintenance.js` — browser adapter for Store adjustment UI, Reconcile, Partial Reset, Factory Reset and Full Local Cleanup. Safe state changes route through existing `persistAndRender` durable commit/readback.
- `metropolis-maintenance-report.js` — one report seam using the existing `afterReport` runtime hook. It anchors historical stock snapshots to the latest physical stock adjustment without patching `app.js` report logic.
- `metropolis-maintenance.css` — Maintenance-only UI styling.
- `tests/metropolis-maintenance.test.cjs` — pure behavior plus publication/source-contract gates.
- `sw-bootstrap.js` — deterministic runtime load order after `metropolis-r5-5`.
- `.assetsignore` — Cloudflare production allowlist.
- `sw.js` — offline shell authority and release generation.
- `RELEASE_MANIFEST.json` — publication contract.

### Extension rule

1. Add deterministic business rules to `metropolis-maintenance-core.js` first and test them.
2. Put browser/storage effects in `metropolis-maintenance.js` or a focused adapter, not in the pure core.
3. Use existing YGPH runtime hooks when a cross-cutting view/report extension is sufficient; avoid editing `app.js` unless no stable seam exists.
4. Any new production file must be added together to loader, `.assetsignore`, `package.json` syntax gate, `sw.js` APP_SHELL, `RELEASE_MANIFEST.json`, and regression tests.
5. Advance Service Worker release generation for every production UI/runtime asset change.

## Maintenance behavior

### Manual Stock Adjustment

- Modes: `MANUAL_IN`, `MANUAL_OUT`, `CORRECTION`.
- Evidence: adjustment id, time, actor, reason, note, before qty, delta qty, after qty.
- Durable location: `state.store.adjustments` (optional field; State Schema remains 4).
- Never creates an automatic Ledger transaction.
- Existing sales, purchases and withdrawals are preserved.
- If resulting quantity is zero, existing stock-value invariant sets/keeps stock value at zero.

### Historical stock report seam

The original 4.2.5 report derives stock from Purchase − Sale − Withdrawal. Maintenance does not rewrite that function. The report adapter finds the latest adjustment at/before report end, treats its `afterQty` as a physical-count anchor, compares that to the base `stockAt(anchorDate)`, and applies only that correction to the report snapshot. This is intentionally stronger than blindly summing adjustment deltas because it also repairs reports when the pre-adjustment current stock had already drifted from transaction-derived history.

### Recovery & Reset levels

1. Reconcile — route Stock to Manual Stock Adjustment and Cash to the existing balance verification flow.
2. Partial Reset — safe operational reset only: Store current stock to zero via auditable Correction; Ride current round only; Preferences only. Do not destructively delete Calendar/source-linked history.
3. Factory Reset — typed `RESET`; close IndexedDB; delete entire `stock-pocket-secure` database; verify deletion; clear in-memory references; reload to Setup. Code/app caches remain.
4. Full Local Cleanup — typed `RESET ALL`; requires network; Factory Reset plus delete METROPOLIS app/meta caches and unregister current Service Worker; reload from network.

## Bug / fix log

### BUG-001 — Source authority drift: main behind device-visible 4.2.5
**Symptom:** Device/Cloudflare build showed `metropolis-r5-5` and METROPOLIS 4.2.5 while `main` still resolved to 4.2.4 and did not contain `metropolis-r5-5.js`.

**Root cause:** 4.2.5 finalization existed on `feat/metro-finalization` (17 commits ahead of main) but had not yet been reconciled to `main`.

**Fix:** Base Maintenance work from `feat/metro-finalization`, not stale `main`. Publication PR intentionally includes those pre-existing finalization commits.

**Prevention / test:** Before implementation, compare live/device visible version, `main`, release manifest and runtime assets. Never assume `main` is Current merely because it is the default branch.

### BUG-002 — Cloudflare Worker build token was deleted/rolled
**Symptom:** Build environment initialized, then failed before clone/build with `The build token selected for this build has been deleted or rolled`.

**Root cause:** Worker Builds referenced a stale Cloudflare build token.

**Fix:** Create/select a new `ygph-metropolis` build token in Worker Builds settings, save, retry. Subsequent build cloned repository, installed Wrangler and deployed successfully.

**Prevention / test:** If failure occurs before repository/build command execution, inspect build authentication first; do not patch application code for an auth-layer failure. Preserve current token naming/date so stale credentials are identifiable.

### BUG-003 — Naive stock-adjustment delta would leave historical reports wrong
**Symptom:** Current Store stock can be corrected while a historical report still shows the old transaction-derived stock, especially if current stock had already drifted before the first manual correction.

**Root cause:** Original `stockAt()` knows Purchase/Sale/Withdrawal only. Simply summing new adjustment deltas assumes the pre-adjustment current stock already equaled transaction-derived history.

**Fix:** Add isolated `metropolis-maintenance-report.js` and `stockReportCorrectionAt()`. Use latest physical adjustment as an anchor against `stockAt(anchorDate)` through `afterReport`.

**Prevention / test:** `metropolis-maintenance.test.cjs` includes a divergence case where current/physical correction cannot be represented by naive delta summing.

### BUG-004 — Production asset drift can create partial releases
**Symptom:** A new JS/CSS file may exist in GitHub but be omitted by Cloudflare `.assetsignore`, runtime loader, syntax gate, Service Worker APP_SHELL or Release Manifest, causing online/offline/version mismatch.

**Root cause:** Publication authority is intentionally split across multiple explicit files.

**Fix:** Maintenance publication test requires every new asset across all publication surfaces and advances the Service Worker generation to r21.

**Prevention / test:** Treat loader + allowlist + syntax gate + offline shell + manifest as one atomic publication contract. CI runs `npm run deploy:gate` on every pull request.

### BUG-005 — Factory Reset must remove trusted-device key with the Vault
**Symptom:** Deleting only the Vault key could leave rollback metadata or the trusted-device CryptoKey behind, producing stale device-unlock state after a supposed factory reset.

**Root cause:** Vault, rollback entries and trusted-device key share the same IndexedDB database/store but are separate keys.

**Fix:** Factory Reset deletes the entire `stock-pocket-secure` IndexedDB database instead of deleting individual keys.

**Prevention / test:** Typed confirmation plus whole-database deletion and readback; no per-key Factory Reset implementation.

## Verification matrix

### Covered by repository/CI gates
- Pure stock adjustment rules and bounds.
- No automatic Ledger creation from manual stock adjustment.
- Partial-reset safety boundaries.
- Exact destructive confirmation phrases.
- Report anchor correction rule.
- Runtime source contracts for durable commit, IndexedDB deletion, cache cleanup and SW unregister.
- Loader order, Cloudflare allowlist, syntax gate, offline shell and release manifest publication.
- Existing repository regression/syntax/UTF-8 suite through `npm run deploy:gate` on PR.

### Requires physical/browser runtime readback before calling Production Verified
- Store: perform one harmless/manual correction test and confirm reload preserves the adjusted stock + audit evidence.
- Report: generate a report after a known adjustment and confirm displayed/downloaded stock agrees.
- Reconcile Cash: existing balance verification still opens and persists normally.
- Partial Reset: verify Store/Ride/Preferences each preserve historical records.
- Factory Reset: only on a disposable/test data state or after encrypted backup; confirm reload lands on first-run Setup.
- Full Local Cleanup: only while online; confirm app reboots from network and new Service Worker/cache generation installs.

## Current publication status

Do not label this Maintenance release `PRODUCTION VERIFIED` until CI, merge/deploy, and the required mobile runtime checks above are complete. Source/PR success is not device proof.
