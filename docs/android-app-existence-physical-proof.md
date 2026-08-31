# LIGHTHOUSE App Existence — Physical Device Proof

Status: PHYSICAL EVIDENCE RUNBOOK. This file defines what must be proven on real Android hardware. CI/emulator evidence must not be promoted into these claims.

## Status vocabulary

- `PROVEN` — the required physical action was executed on hardware and the expected durable result was observed with retained evidence.
- `VERIFY` — implementation/automation evidence exists, but the hardware claim has not yet been executed or retained.
- `BLOCKED` — the physical proof cannot proceed because a required prerequisite is missing or failed.

For every physical claim retain: device/model + Android version, APK identity evidence, timestamp, relevant screen/log capture, action performed, observed result, and resulting status.

## Gate A — Canonical APK A baseline

Owner: PR #96 Phase 6.2.

Prerequisites:

1. Install canonical APK A: package `com.yggdrasil.lighthouse`, versionCode `1001`, versionName `1.0.0`, signer SHA-256 `aae608a7ddab0dbfccc1d35e817c5683b3c64b90ab581a4b74867db54e0351ce`.
2. Do not count an old debug-signed installation as APK A. If the device carries an incompatible historical signer, establish APK A on a clean/spare device/profile or through the owner-approved one-time baseline replacement described by PR #96.
3. Complete first-run enrollment/PIN when applicable.
4. Record Patch Current/Previous state.
5. Create representative durable truth; minimum `ข้าว 65` and confirm durable readback.
6. Fully close and reopen the app, then prove the durable record and Patch state are still present.

Exit: all six items physically observed. Until then APK A hardware baseline remains `VERIFY` or `BLOCKED`.

## Gate B — Lifecycle survival

Run each test from a known APK A baseline with known durable truth already present.

### B1 Full close / reopen

- Close the app completely from normal UI/task flow.
- Relaunch.
- Unlock/reconstruct runtime as normal.
- Read the known durable business record.
- Confirm no stale pending confirmation becomes executable after reconstruction.

Expected: durable truth survives; session-only pending work does not.

### B2 Force-stop / relaunch

- Force-stop LIGHTHOUSE from Android app settings or equivalent OS action.
- Relaunch normally.
- Reconstruct/unlock.
- Read the same durable truth and Patch state.

Expected: durable truth survives; no stale executable session state is resurrected.

### B3 Process death / relaunch

- Establish known durable truth and a clean idle state.
- Cause genuine process death without clearing app storage (OS/process tooling acceptable; do not simulate by merely closing a JS runtime in CI).
- Relaunch.
- Reconstruct/unlock and read the same durable truth.

Expected: durable truth survives process death and the runtime is reconstructed from durable state only.

### B4 Device reboot

- Reboot the physical Android device without uninstalling or clearing LIGHTHOUSE storage.
- Launch LIGHTHOUSE after boot.
- Reconstruct/unlock.
- Read the known durable truth and Patch state.

Expected: durable truth and valid Patch state survive reboot.

## Gate C — Backup and recovery

Prerequisite: current-format backup export with no embedded plaintext usable recovery secret.

1. Create known durable truth and record its exact readback.
2. Export a current-format backup.
3. Keep required recovery material separately from the backup file.
4. Prove possession of the backup file alone is insufficient to restore/decrypt current-format data.
5. Use a controlled empty target or owner-approved controlled loss/reset; do not destroy the only known-good copy.
6. Restore using the separately held recovery material.
7. Reopen/reconstruct the app after restore.
8. Read back the original durable truth exactly.
9. Negative proof: wrong recovery material must fail closed without replacing valid target data.
10. Negative proof: corrupt backup must fail closed without replacing valid target data.
11. Existing-data restore must require the explicit overwrite decision defined by the recovery contract.

Expected: backup + separately held recovery material is sufficient; backup alone is not; corruption/wrong material never silently mutates valid target truth.

Historical backups carrying embedded recovery material are legacy compatibility only and must be identified as legacy evidence, never used as the current-format security proof.

## Gate D — APK A -> APK B in-place update

Hard prerequisite: Gate A complete on hardware. Do not create/use APK B as an A->B proof before APK A hardware baseline has been established.

APK B requirements:

- same package ID as APK A
- same canonical signer as APK A
- versionCode strictly greater than `1001`
- final APK identity verifier green

Procedure:

1. On APK A, record package/version/signer evidence, known durable business truth, enrollment state, and Patch state.
2. Do not uninstall APK A.
3. Do not clear app storage/data/cache as a workaround.
4. Install APK B over APK A through the intended update path.
5. Confirm Android accepted it as an in-place update.
6. Confirm package identity and signer continuity.
7. Confirm versionCode increased.
8. Launch APK B and reconstruct/unlock normally.
9. Read back the exact durable truth created under APK A.
10. Confirm valid Patch Current/Previous state remains coherent after update.
11. Repeat full close/reopen after upgrade and read the same truth again.

Expected: APK B updates APK A in place with no uninstall/storage clear and preserves durable application truth.

## Evidence table

| Claim | Required evidence | Current status |
|---|---|---|
| APK A canonical baseline on hardware | device + APK identity + enrollment + Patch + `ข้าว 65` readback + reopen | VERIFY |
| Full close/reopen | before/after durable readback | VERIFY |
| Force-stop/relaunch | OS force-stop evidence + durable readback | VERIFY |
| Process death/relaunch | process-death evidence + durable readback | VERIFY |
| Device reboot | reboot + post-boot durable readback | VERIFY |
| Current backup restore | separate recovery material + controlled target + exact readback | VERIFY |
| Wrong-key/corrupt fail closed | retained failure evidence + unchanged target | VERIFY |
| APK A -> B in-place update | APK identities + update without uninstall/clear + post-update readback | BLOCKED until APK A baseline completes |

## Stop rule

A failed physical check does not authorize a workaround that destroys the claim being tested. Record the failure as `BLOCKED`, preserve evidence, and return to source/reality investigation. Do not uninstall, clear storage, change signer, weaken recovery rules, or fabricate CI evidence to obtain a PASS.
