# LIGHTHOUSE App Existence Hardening Checkpoint

Status: AUTOMATABLE HARDENING + CURRENT HARDWARE PATH VERIFIED TO AVAILABLE CAPABILITY. No production deploy/store publication. Backup/recovery remains a future physical VERIFY because the current APK does not expose a complete physical backup/restore path.

This checkpoint records `Reality -> Evidence -> Gap -> Status` for the six App Existence roots. `PROVEN` applies only to the exact claim supported by evidence. Missing evidence does not authorize scope expansion.

## 1. App Identity — PROVEN FOR CURRENT CANONICAL PATH

**Reality**

- Canonical application/package ID is `com.yggdrasil.lighthouse` across source identity contract and generated canonical APK rail.
- Standard APK Test Flow owns generated security, release build, canonical signing, and final package/signer/version verification.
- APK B was produced as `versionCode 1002`, `versionName 1.0.1` from exact source head `295264c5aff46a9853cf14cfcdd84b3149a9b5ac`.
- Android accepted APK B over the existing canonical APK A without uninstall or storage clear.

**Evidence**

- `android-shell/apk-identity.json`
- `android-shell/version.json`
- `.github/workflows/lighthouse-apk-debug.yml`
- LIGHTHOUSE APK Debug #219 run `33459149529` — SUCCESS.
- canonical APK B artifact id `9782574017`
- APK B digest `sha256:9bc4bcdcd73a4348e58d972ea0ba6e19180c62bc60ea747fa5d80e9477e71701`
- physical in-place A→B acceptance on Android hardware with durable state retained.

**Gap**

- Exact physical device/model/Android-version metadata is not yet retained in-repo. Do not guess it.

**Status:** `PROVEN` for the current canonical source→artifact→installed update path. Device metadata is evidence enrichment, not a blocker to the observed behavior.

## 2. Signing & Update Identity — PROVEN FOR A→B PATH

**Reality**

- Canonical signer SHA-256 is `aae608a7ddab0dbfccc1d35e817c5683b3c64b90ab581a4b74867db54e0351ce`.
- Android version ownership is monotonic and independent from Patch versioning.
- Standard APK Test Flow isolates Patch and APK signing trust domains and fails closed on identity/security/signing mismatch.
- APK B `1002/1.0.1` was installed over APK A without uninstall/storage clear and Android accepted it as an in-place update.

**Evidence**

- `android-shell/tools/verify-apk-identity.mjs`
- `android-shell/test/apk-ci-signing-contract.test.mjs`
- LIGHTHOUSE APK Debug #219 run `33459149529` — SUCCESS through final APK identity verification/upload.
- physical A→B update preserved durable `ข้าว 65` into APK B.

**Gap**

- Historical debug-signed installs remain outside canonical lineage and are not promoted into this claim.

**Status:** `PROVEN` for the tested canonical A→B signer/version/update lineage.

## 4. Data Survival — PROVEN FOR TESTED DURABLE PATH

**Reality**

- Single IndexedDB writes resolve at transaction completion rather than request success.
- Multi-entry writes/reset use transaction outcome semantics.
- Blocked DB open fails closed with `GREENFIELD_DB_OPEN_BLOCKED`.
- Existing connections close on `versionchange`.
- Existing schema migration preserves durable truth.
- Trusted bootstrap reads durable state after reconstruction and exposes a truthful restore witness rather than pretending chat transcript history is durable.
- Durable truth created under APK A survived A→B update.
- New durable truth created under APK B survived normal close/reopen, Android Force Stop/relaunch, and full device reboot.

**Evidence**

- Data-survival RED commit `45293eac99607a7b96ce4039e175b9a32d2795b1`.
- implementation commit `5198a9f5a61191d2be8e97655205b8f530896feb`.
- restore-witness integration test/implementation verified by LIGHTHOUSE APK Debug #218 run `33458949065` — SUCCESS and Greenfield Deploy Gate #874 run `33458949038` — SUCCESS.
- APK B head `295264c5aff46a9853cf14cfcdd84b3149a9b5ac`; Greenfield Deploy Gate #875 run `33459149489` — SUCCESS; LIGHTHOUSE APK Debug #219 run `33459149529` — SUCCESS.
- physical observations:
  - APK A `ข้าว 65` survived into APK B and rendered `กู้คืนข้อมูลแล้ว · ข้าว 65 บาท`.
  - APK B `ข้าว 100` survived normal close/reopen.
  - the same `ข้าว 100` survived Force Stop/relaunch.
  - the same `ข้าว 100` survived device reboot.

**Gap**

- `strict durability` remains an unpromoted standards nuance; no current evidence shows it is required to close this tested path.
- A separately instrumented OS process-kill case is not retained beyond stronger practical Force Stop and reboot observations.

**Status:** `PROVEN` for the tested durable expense path across commit, reopen, canonical APK update, Force Stop, and reboot.

## 3. Lifecycle & Restore — PROVEN FOR AVAILABLE TESTED PATH

**Reality**

- Trusted bootstrap reconstructs runtime from durable state after reopen.
- Session-only pending confirmation is not resurrected as executable stale work.
- Cold-start restore witness is derived from decrypted durable state, not persisted fake chat history.
- Physical close/reopen, Force Stop/relaunch, and device reboot all reconstructed the latest durable truth.

**Evidence**

- `android-shell/test/trusted-bootstrap.integration.test.mjs` covers durable reopen/readback, stale pending rejection, and restore-witness behavior.
- LIGHTHOUSE APK Debug #218 run `33458949065` — SUCCESS.
- physical APK B restore witness:
  - `กู้คืนข้อมูลแล้ว · ข้าว 65 บาท` after A→B update.
  - `กู้คืนข้อมูลแล้ว · ข้าว 100 บาท` after a new B write and cold reopen.
  - `ข้าว 100` retained after Force Stop/relaunch.
  - `ข้าว 100` retained after full device reboot.

**Gap**

- No separately instrumented process-death test has been retained. Do not add duplicate ceremony unless a reviewer requires that exact distinct claim.

**Status:** `PROVEN` for normal reconstruction, Force Stop/relaunch, reboot, and post-upgrade restore on the tested path; distinct instrumented process death remains `VERIFY` only as a narrower untested claim.

## 5. Security Boundary — PROVEN FOR GENERATED RELEASE SURFACE

**Reality**

- Security verification runs against generated/merged Android release output after Capacitor native generation.
- Baseline requires backup disabled, cleartext disabled, release not debuggable, expected permissions only, providers private, and exported components fail closed unless explicitly proven.
- AndroidX `ProfileInstallReceiver` is allowed only under the exact constrained contract already encoded by the verifier.
- Package-scoped dynamic receiver permission is allowed only when signature-protected.
- Standard APK Test Flow applies and verifies this security baseline before final APK publication.

**Evidence**

- verifier policy commit `e45113d27b638d7f3b9f5dcbf451ce664cc7dab0`
- verifier tests commit `5f5151498f874d54e66cf0da45fd0aae20b09569`
- LIGHTHOUSE APK Debug #219 run `33459149529` — SUCCESS through generated Android security verification and final APK identity.

**Gap**

- Claim remains intentionally limited to generated release/native surface and verifier contract; it does not invent runtime exploit testing.

**Status:** `PROVEN` for generated release security surface.

## 6. Backup & Recovery — VERIFY, NO SCOPE EXPANSION

**Reality**

- Underlying current-format backup contract does not embed a usable plaintext recovery secret.
- Current restore contract uses separately supplied recovery material.
- Historical embedded-key backups remain explicit legacy compatibility.
- Wrong recovery material/corruption fails closed before replacing valid target state; overwrite requires explicit decision.
- The current APK does not yet expose a complete physical backup→restore path suitable for end-to-end hardware proof.

**Evidence**

- Greenfield backup/recovery tests cover no embedded recovery secret, separate recovery material, wrong-material/corruption no-write behavior, overwrite protection, verified restore readback, and legacy compatibility.
- Greenfield Deploy Gate #875 run `33459149489` — SUCCESS on APK B source head.

**Gap**

- Physical current backup → controlled empty/loss target → restore → reopen/readback is not runnable from the current app surface.

**Status:** `VERIFY` for physical recovery. Automated secret-boundary/recovery contracts are `PROVEN`. Do **not** add a backup product capability solely to turn this row green; return when that capability is independently authorized and present.

## Physical evidence checkpoint

Current real-device proof is recorded in `docs/android-app-existence-physical-proof.md`.

Closed physical claims for the tested path:

- canonical APK A→B in-place update without uninstall/storage clear
- APK A durable truth surviving into APK B
- APK B new durable write surviving normal close/reopen
- APK B durable truth surviving Android Force Stop/relaunch
- APK B durable truth surviving full device reboot
- One-Tap Patch activation to `0.0.6` on hardware

Still intentionally open:

- separately instrumented process-death claim, only if later review requires it
- physical backup/recovery, because the current app surface does not yet provide the complete capability

## Review boundary

PR #97 remains Draft. BIG owns external review handoff. Do not mark ready, request review, merge, deploy, or publish from this checkpoint without explicit owner instruction.
