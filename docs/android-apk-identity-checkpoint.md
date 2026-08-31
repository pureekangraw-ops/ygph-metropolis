# LIGHTHOUSE APK Identity Continuity Checkpoint

Status: PAUSED AT PHASE 6.2 — PHYSICAL DEVICE GATE. No production deploy/store publication.

## Phase 0 — Reality Audit — READY

The pre-fix APK chain was:

`checkout → Node/Java setup → android-shell npm install/test → Patch 0.0.5 signing with Patch key-3 → cap add android → cap sync android → Gradle debug build → artifact upload`

Evidence-backed gaps at entry:

- Package ID was already stable at `com.yggdrasil.lighthouse`.
- APK signing identity was not explicitly injected; runner/debug signing owned the distributable artifact.
- Historical Android evidence contained different signer certificate SHA-256 values: `4c40f8a6769bc27347d7676c5acc911b3bf263c0d3fc5e7be2aa758015e5e67d` and `57cf25fae4f49427f415da07af7c995b3398c23b7cc6d737de315c85002e1192`.
- No canonical source-controlled monotonic Android versionCode owner existed.
- No final-byte package/signer/version identity gate existed before artifact upload.
- Prior hardware evidence included fresh installation, not a same-signer/higher-version in-place A→B proof.
- Patch signing was already proven but is a separate trust domain.

Root cause: package ID continuity existed, but Android application identity stopped being controlled at APK signer/versioning and final artifact verification.

## Phase 2.1 — Canonical APK signer established early — READY

Phase 2.1 was intentionally completed before Phase 1 because Phase 1's public identity contract requires a real signer fingerprint and the plan forbids inventing one.

A dedicated APK signing keystore was created under owner authorization, separate from Patch signing. Private material is not committed to this repository.

Canonical public signer certificate SHA-256:

`aae608a7ddab0dbfccc1d35e817c5683b3c64b90ab581a4b74867db54e0351ce`

Primary custody:

`Google Drive/YGGDRASIL/02_OWNER_SOURCES/00_LIGHTHOUSE_KEY_MASTER/lighthouse-apk-release.p12`

GitHub Actions uses APK-specific repository secrets only:

- `LIGHTHOUSE_APK_KEYSTORE_BASE64`
- `LIGHTHOUSE_APK_STORE_PASSWORD`
- `LIGHTHOUSE_APK_KEY_ALIAS`
- `LIGHTHOUSE_APK_KEY_PASSWORD`

Primary custody readback reproduced the same public certificate fingerprint before source pinning.

## Phase 1 — Canonical APK Identity Contract — READY

Public non-secret contract: `android-shell/apk-identity.json`.

Pinned invariants:

- application ID `com.yggdrasil.lighthouse`
- signer certificate SHA-256 `aae608a7ddab0dbfccc1d35e817c5683b3c64b90ab581a4b74867db54e0351ce`
- monotonic integer versionCode policy
- identity schema version 1
- public alias label only; no private key/password fields

TDD evidence:

- RED commit `412ac020ec2257ea28a44871685b8a75a430c479`
- LIGHTHOUSE APK Debug run `33407219530` failed with the identity contract absent.
- Contract was then implemented and the appId drift gate became green.

## Phase 2.2 — Recovery / Custody Continuity — READY

Recovery owner: LIGHTHOUSE owner / BIG.

A second encrypted PKCS12 backup was created at:

`Google Drive/YGGDRASIL/02_OWNER_SOURCES/00_LIGHTHOUSE_KEY_MASTER/BACKUP/lighthouse-apk-release.backup.p12`

Backup readback evidence:

- primary keystore SHA-256: `4435e5c1dc20bc6b70784a2750af475eb550d351dfdda5da166c5ecd8daf734d`
- backup readback SHA-256: `4435e5c1dc20bc6b70784a2750af475eb550d351dfdda5da166c5ecd8daf734d`
- backup readback certificate SHA-256: `aae608a7ddab0dbfccc1d35e817c5683b3c64b90ab581a4b74867db54e0351ce`

No private bytes or passwords are stored in repository evidence.

Key-loss consequence: loss of all recoverable copies of this canonical APK signer breaks the established Android APK update lineage. Backup/Restore of application data does not replace signer continuity.

## Phase 3 — Android Version Contract — READY

Canonical Android version source: `android-shell/version.json`.

Controlled baseline version:

- owner: `ANDROID_APK`
- versionCode: `1001`
- versionName: `1.0.0`
- Patch-derived: false

`android-shell/tools/set-android-version.mjs` applies the canonical values after native project generation and reads the generated Gradle file back. `assertUpgradeVersion` rejects an equal or lower candidate with `APK_VERSION_NOT_MONOTONIC`.

TDD evidence:

- RED commit `2708e593c2979954b084b9bb28ba2ab3004e053f`
- RED run `33407424332`
- implementation commits include `dbcfd30bb3f455c853384e0d75f792704babce20` and `bf85eb2c9fd7baede405ba68b1cdead1604ea709`

## Phase 4 — Stable APK Signing in CI — READY

The canonical distributable rail now:

`tests → existing Patch signing → cap add → cap sync → apply Android version → assembleRelease → temp keystore materialization → zipalign → apksigner sign/verify → final identity verification → artifact upload`

APK keystore bytes exist only in runner temp with restrictive permissions. Patch and APK secret namespaces are independently tested and have no fallback between them.

TDD evidence:

- RED contract commit `d25c53061ef3c592434b9922912aebeaf3b14de6`
- RED run `33407609822`

## Phase 5 — Final-APK Identity Verification / Publication Gate — READY

`android-shell/tools/verify-apk-identity.mjs` proves identity from final APK bytes using Android build tools before upload. It checks:

- package ID
- signer certificate SHA-256
- versionCode
- versionName
- APK SHA-256

Known mismatches fail closed.

TDD evidence:

- verifier RED commit `22bc3db4737d564963eaeaef67e1739fbc77a625`
- RED run `33407690278`
- a second RED run `33408510645` proved evidence initially bound to the synthetic PR merge SHA rather than the real feature-head source commit
- this was corrected so PR builds use `github.event.pull_request.head.sha` through `APK_SOURCE_COMMIT`

Exact-head verification:

- source HEAD `fb5e226c88cfcddf6cc753ad1616b6355847c07d`
- LIGHTHOUSE APK Debug run `33408701504` / run #170: SUCCESS
- Greenfield Deploy Gate run `33408701479` / run #822: SUCCESS
- final signing, final-byte identity verification, and canonical artifact upload all succeeded on the same exact source head

## Phase 6.1 — Controlled APK A Baseline — READY

Canonical APK A is deliberately designated from exact source HEAD `fb5e226c88cfcddf6cc753ad1616b6355847c07d` and CI run `33408701504`.

Identity evidence:

- role: APK A baseline
- package ID: `com.yggdrasil.lighthouse`
- versionCode: `1001`
- versionName: `1.0.0`
- signer certificate SHA-256: `aae608a7ddab0dbfccc1d35e817c5683b3c64b90ab581a4b74867db54e0351ce`
- APK SHA-256: `fe80759f8a7aff9c711ea99ac8a5ca0dea29d87e2eed65704587787326d5c4b1`
- workflow artifact: `lighthouse-canonical-apk`, artifact id `9764284616`
- workflow artifact archive digest: `sha256:b2c7d1b5f0a95528df22dc1dc71046aadbe9d7adc7dbbe568755952610e0272a`

A downloaded copy was independently SHA-256 checked and matched the evidence file exactly.

## Phase 6.2 — Prepare A Device State — PHYSICAL DEVICE GATE

Execution stops here because the plan requires real Android hardware. CI/emulator evidence cannot substitute for this phase.

Required hardware evidence before APK B may be produced:

1. APK A installed as the baseline canonical lineage.
2. First-run enrollment/PIN setup completed if applicable.
3. Known Patch Current/Previous state recorded.
4. Representative durable Greenfield/Manual truth created; minimum `ข้าว 65` durable readback.
5. App fully closed/reopened.
6. Durable record and Patch state proven present before upgrade.

Important lineage boundary: historically installed debug-signed LIGHTHOUSE builds use a different signer from the new canonical APK signer, so Android cannot treat APK A as an in-place update of those old debug-signed builds. Establishing APK A on such a device therefore requires either a clean/spare device/profile or an owner-approved one-time replacement of the old debug-signed installation. That one-time baseline setup is not the Phase 8 proof. The later APK A → APK B test must occur without uninstalling A or clearing its storage.

Do not create APK B before this gate is complete.
