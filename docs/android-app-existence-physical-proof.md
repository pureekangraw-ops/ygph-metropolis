# LIGHTHOUSE App Existence — Physical Device Proof

Status: PHYSICAL EVIDENCE RUNBOOK + CURRENT HARDWARE RESULTS. CI/emulator evidence must not be promoted into physical claims.

## Status vocabulary

- `PROVEN` — the required physical behavior was executed on hardware and the expected durable result was observed.
- `VERIFY` — implementation/automation evidence exists, but the physical claim is still outstanding or its exact evidence metadata is incomplete.
- `BLOCKED` — the physical proof cannot proceed because a required prerequisite/capability is missing or failed.

For long-term audit retention, capture device/model + Android version, APK identity evidence, timestamp, relevant screen/log capture, action performed, observed result, and status. Lack of metadata does not erase an observed behavior, but it must not be silently invented.

## Current physical evidence — 2026-09-01

The owner executed the current canonical path on real Android hardware.

Observed sequence:

1. Canonical APK A was installed and functioning.
2. One-Tap Patch fetched/verified/activated Patch `0.0.6` from the published GitHub Release.
3. On APK A, `ข้าว 65` was confirmed and immediately read back as durable truth.
4. Canonical APK B (`versionCode 1002`, `versionName 1.0.1`) was installed over APK A with no uninstall and no storage clear.
5. APK B reconstructed prior durable truth and rendered `กู้คืนข้อมูลแล้ว · ข้าว 65 บาท`.
6. A new APK B record `ข้าว 100` was written, the app was normally closed/reopened, and it reconstructed as `กู้คืนข้อมูลแล้ว · ข้าว 100 บาท`.
7. Android Force Stop was performed; after relaunch the same `ข้าว 100` durable truth was still present.
8. The physical device was rebooted; after boot/relaunch the same `ข้าว 100` durable truth was still present.

Current evidence is sufficient to establish the tested behavioral claims below. Device model/Android-version metadata should be added if later needed for audit traceability; do not guess it.

## Gate A — Canonical APK A baseline

Owner: PR #96 Phase 6.2.

Canonical APK A contract:

- package `com.yggdrasil.lighthouse`
- versionCode `1001`
- versionName `1.0.0`
- signer SHA-256 `aae608a7ddab0dbfccc1d35e817c5683b3c64b90ab581a4b74867db54e0351ce`

Physical baseline behavior was established sufficiently to proceed with the in-place APK B proof: APK A was functioning, Patch `0.0.6` activated, representative durable truth `ข้าว 65` was committed/read back, and APK B was subsequently accepted as an in-place update without uninstall/storage clear.

**Status:** `PROVEN` for the tested canonical A→B lineage/behavior path. Exact device identity metadata remains optional evidence enrichment, not a reason to undo the observed result.

## Gate B — Lifecycle survival

### B1 Full close / reopen

Observed on APK B with newly written durable truth `ข้าว 100`.

Expected: durable truth survives; session-only pending work does not become durable.

**Status:** `PROVEN` for durable-truth survival on the tested path.

### B2 Force-stop / relaunch

Android Force Stop was executed, LIGHTHOUSE was relaunched, and `ข้าว 100` remained available from durable state.

**Status:** `PROVEN`.

### B3 Process death / relaunch

No separately instrumented genuine OS/process-kill event has been retained beyond the Force Stop and reboot tests.

**Status:** `VERIFY`. Do not manufacture an additional test merely to duplicate evidence unless a later reviewer specifically requires this distinct claim.

### B4 Device reboot

The physical Android device was rebooted without uninstalling or clearing LIGHTHOUSE storage. After boot and relaunch, `ข้าว 100` remained available from durable state.

**Status:** `PROVEN`.

## Gate C — Backup and recovery

The underlying backup/recovery contract is covered by automated tests, but the current APK does not yet expose a complete physical backup→restore user path suitable for this runbook.

Therefore do **not** clear app data or manufacture a destructive test just to close this row. Adding a new backup product surface solely to obtain physical evidence would expand current scope.

When/if a current-format physical backup flow becomes an authorized app capability, use this proof:

1. Create known durable truth and record its exact readback.
2. Export a current-format backup.
3. Keep required recovery material separately from the backup file.
4. Prove possession of the backup file alone is insufficient to restore/decrypt current-format data.
5. Use a controlled empty target or owner-approved controlled loss/reset; never destroy the only known-good copy.
6. Restore using separately held recovery material.
7. Reopen/reconstruct the app.
8. Read back the original durable truth exactly.
9. Wrong recovery material must fail closed without replacing valid target data.
10. Corrupt backup must fail closed without replacing valid target data.
11. Existing-data restore must require the explicit overwrite decision defined by the recovery contract.

Historical backups carrying embedded recovery material are legacy compatibility only and are not current-format security proof.

**Status:** `VERIFY` / currently not physically runnable from the app surface. This is not authorization to add product capability.

## Gate D — APK A -> APK B in-place update

APK B used for the physical proof:

- package identity: canonical LIGHTHOUSE package
- canonical signer lineage: accepted by Android as an in-place update over APK A
- versionCode `1002` > APK A `1001`
- versionName `1.0.1`
- source head `295264c5aff46a9853cf14cfcdd84b3149a9b5ac`
- canonical artifact id `9782574017`
- artifact digest `sha256:9bc4bcdcd73a4348e58d972ea0ba6e19180c62bc60ea747fa5d80e9477e71701`
- LIGHTHOUSE APK Debug #219 run `33459149529` — SUCCESS

Observed:

1. APK A held durable `ข้าว 65`.
2. APK B was installed over A; no uninstall or storage clear was used.
3. Android accepted the update.
4. APK B reconstructed `กู้คืนข้อมูลแล้ว · ข้าว 65 บาท`.
5. APK B then wrote `ข้าว 100`; normal reopen, Force Stop/relaunch, and device reboot all preserved it.

**Status:** `PROVEN` for the tested in-place canonical update and durable-state survival path.

## Evidence table

| Claim | Current status | Current evidence |
|---|---|---|
| Canonical A→B hardware lineage | PROVEN | Android accepted B over A without uninstall/storage clear; A durable truth survived |
| Full close/reopen | PROVEN | APK B `ข้าว 100` restored after close/reopen |
| Force-stop/relaunch | PROVEN | `ข้าว 100` remained after Android Force Stop |
| Distinct instrumented process death | VERIFY | not separately retained; do not duplicate-test without need |
| Device reboot | PROVEN | `ข้าว 100` remained after full device reboot |
| Current backup restore | VERIFY | underlying contract automated; current physical app path not yet available |
| Wrong-key/corrupt physical restore | VERIFY | same physical-flow limitation |
| APK A -> B in-place update | PROVEN | APK B 1002/1.0.1 installed over A; `ข้าว 65` survived |

## Stop rule

A failed or unavailable physical check does not authorize a workaround that destroys the claim or expands product scope. Record the boundary, preserve evidence, and return to source/reality investigation. Do not uninstall, clear storage, change signer, weaken recovery rules, fabricate CI/device evidence, or add a capability solely to obtain a PASS.
