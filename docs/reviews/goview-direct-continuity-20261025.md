# GOVIEW Direct and local map continuity checkpoint

## Baseline and ownership

Inspected remote main `734a8790948b8e6a1687c4bf32ae492b41d07030`, open PRs and current source on 2026-10-25. Main already contains the Direct changes described by still-open draft #256 (`0a7ed9d`) and GO browser #258. Browser #259 (`c40beec`) is separate; do not replay or replace those changes. Reviewed `goview-runtime-handoff-20261024.md`, `observatory-delivery-updates-20261024.md`, `go-map-round-one.md`, and B2E verification instructions. No AGENTS.md or .agents/skills exists in this checkout/current main.

Own only outsideview DirectConnection, its Direct client/UI integration and tests, plus this evidence document. No shared transport, build, browser, server, map schema or map data changes.

## Why this fix

On main, the new failed-write/restart regression fails: after a real-shaped synthetic 401, suspension persistence throws; the current coordinator blocks but a fresh coordinator accepts stale `authRejected=false`. Baseline: 17 tests, 1 failure (the new regression).

Persist the existing reconnect guard **before** dispatch, and before saving a validated credential. If arming fails, dispatch nothing. A 401 leaves the committed guard in place without requiring another disk write. Completed successful/non-401 requests clear it; a failed clear, interrupted request or stale response leaves reconnect required. Successful explicit validation is the recovery path. No credential deletion or map writes, no automatic receipt replay. Generation guards still prevent stale responses from changing a newly validated connection.

Tradeoffs: two synchronous preference commits per normal request; polling already runs off the UI thread. An interrupted/cancelled request can conservatively require explicit reconnect even if the server never rejected it. Overlapping requests cannot start while the first holds the guard. This uses the existing preference store, not an atomic transaction with the credential store. The guarantee assumes a successful persistence commit survives restart; it does not claim recovery from disk corruption or hardware lying about durable writes. Already-dispatched remote effects cannot be undone.

## Local evidence

Compiled actual Kotlin sources with Kotlin 2.2.10/JDK21 and JUnit4.13.2 outside Gradle (no Android SDK/Gradle installed locally):

- DirectConnectionTest + DirectRestartTest: **24 passed**. Failed pre-dispatch write sends zero requests; failed writes after 401 survive restart; successful reconnect resumes pending/receipt transport; ambiguous credential save remains blocked after restart; stale/cancelled responses cannot clear the guard.
- Three restart tests launch separate JVM processes using real synthetic guard files. One exits after 401 with subsequent writes disabled; another calls Runtime.halt during dispatch; the third rejects the saved credential during explicit validation. A second JVM checks blocked state and no additional request. Synthetic map bytes are unchanged. These are host process tests, not Android process/Keystore tests.
- GoviewWorkspaceTest, GoviewPackageExchangeTest, MapUpdatePackageTest, GeoJsonImportTest: **28 passed**, using actual file-backed MapStateStore and injected failure backends. Covers reopen, versioned export/import, duplicate/conflict, unrelated-record retention, approval separation, unverified committed-readback failure, backup/rollback and recovery. Android SQLite backend execution is not represented by these results.
- `node --test android-browser/tests/goview-studio.test.mjs android-browser/tests/goview-package-bridge.test.mjs goview-package-bridge/tests/direct-commands.test.mjs`: **28 passed**, actual JS implementations with synthetic storage/transport. Includes exact-byte package roundtrip, immutable version conflict, transfer-ID binding and receipt boundaries.
- `git diff --check`: clean.

## Existing full-flow status and remaining architectural choice

| Phase | Current implementation/evidence | Remaining acceptance |
| --- | --- | --- |
| Local map save/reopen | Existing journal, receipt and recovery tests pass | Android SQLite/actual phone restart |
| Selected Snapshot/export | Explicit selected pins only; no GPS/history; CAPTURED_LOCAL is separate from upload | Real document picker/export readback |
| Upload / GO read | Legacy GoviewPackageExchange deliberately returns BLOCKED. Studio has a distinct versioned road-graph package contract and GO adapter | Authorized deployed contract, GO binding and selected artifact roundtrip; no live test performed |
| Download | Studio checks exact map/version/digest/transfer ID; legacy GeoJSON file reception records DOWNLOAD only | Real selected file/network input on phone |
| Preview / Update | Existing diff, stale/duplicate/conflict rejection and explicit owner approval; source tests pass | Native UI and actual destination readback |
| Receipt / restart / rollback | Separate capture, transfer, update and storage semantics; uncertain commit never claims rollback | Final-head CI and phone force-stop/reopen/backup restore |

No map runtime defect reproduced in these suites, so existing fixes were preserved. Do not claim the full map→GO→phone loop complete. Legacy field-provenance GeoJSON and Studio road graphs are not lossless substitutes. The bounded existing path is owner-selected file export/import. Automatically wiring legacy Snapshot into Studio upload requires an explicit contract/format decision and coordination with GO/transport ownership; it is not achieved by enabling the existing unconfigured adapter. No new service or cost was introduced.

Physical acceptance must use a separately authorized compatible build and synthetic data: verify installed identity/signer without uninstalling or clearing data; save an unrelated record; import/preview/cancel, approve Update, inspect receipt and map; force-stop/reopen; export/import and verify IDs; create backup/edit/restore and verify rollback copy; verify selected Snapshot excludes unselected records and GPS. For Direct, use an authorized synthetic endpoint/credential to observe one 401 then restart and confirm no further dispatch until explicit successful reconnect. Android preference/Keystore fault injection is still needed; JVM results cannot establish it.

No production call, GPS transfer, real credential, APK signing/installation, deployment, release unlock or merge performed. Greenhouse and Vault remain paused. Runtime authorization and device evidence remain pending, not denied or passed.

## Review follow-up: saved-token validation and busy status

The same saved credential can be re-entered in Settings. A new regression against f0066f5 failed (23 tests, 1 failure): validation got 401 but left polling enabled. Validation now arms the durable guard before reading only when the candidate equals the saved token. A different rejected candidate still preserves the unrelated working key. The separate-process validation-401 regression also verifies no reuse after restart, with writes disabled after rejection.

`pollDirect` previously checked requiresReconnect before directFetching, so a slow request could show a false reconnect warning at the next 12-second tick. It now returns for busy fetch/proposal/settings/validation states before displaying the guard. Client request authorization is unchanged. `DirectPollingStateTest` exercises repeated actual Activity ticks with synthetic status and no credential client initialized, proving busy states never read the guard or overwrite status. This Android-only test awaits exact-head emulator execution.

Cancellation/backgrounding during an armed request deliberately requires explicit revalidation. The map remains usable locally; the reconnect status now directs the owner to open GO Direct and reconnect to check the key. A completed successful ordinary poll clears the guard normally. No silent credential retry or map deletion is used as recovery.
