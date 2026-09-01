# LIGHTHOUSE App Existence Hardening Checkpoint

Status: AUTOMATABLE HARDENING COMPLETE TO CURRENT EVIDENCE; PHYSICAL DEVICE CLAIMS REMAIN GATED. No production deploy/store publication. No APK B before PR #96 Phase 6.2 completes.

This checkpoint records `Reality -> Evidence -> Gap -> Status` for the six App Existence roots. `PROVEN` applies only to the exact claim supported by evidence; a root remains `VERIFY` when required physical evidence is outstanding.

## 1. App Identity — VERIFY

**Reality**

- Canonical application/package ID is `com.yggdrasil.lighthouse` across source identity contract and generated canonical APK rail.
- Canonical APK generation now has a reusable Standard APK Test Flow: update Android version ownership, load the single current Patch release contract, build/sign/verify the Patch, generate/apply/verify Android security, build/sign the release APK, then verify package/signer/version/final bytes before upload.
- The reusable rail is release-number agnostic at workflow level; current Patch release identity is owned by `android-shell/release/current-patch.json` rather than hard-coded in the workflow.

**Evidence**

- `android-shell/apk-identity.json`
- `android-shell/version.json`
- `android-shell/release/current-patch.json`
- `android-shell/tools/build-current-patch-source.mjs`
- `.github/workflows/lighthouse-apk-debug.yml`
- exact head `658ea4fa0afe21085344d8acaafb49302340ad62`
- LIGHTHOUSE APK Debug #208 run `33454225997` — SUCCESS, including final APK identity verification and canonical APK upload.
- canonical artifact id `9780899901`, artifact digest `sha256:fe9bf40114c1c48a1e957092a61d09e4ec025985881a87677f0b5ff70267604f`, bound to exact head `658ea4fa...`.

**Gap**

- Canonical APK identity is not yet recorded from the physical target device required by Phase 6.2.

**Status:** `VERIFY` overall; source/final-artifact identity and reusable canonical generation contract are `PROVEN`, installed-device canonical identity remains `VERIFY`.

## 2. Signing & Update Identity — VERIFY

**Reality**

- Canonical signer and monotonic Android version owner exist.
- Standard APK Test Flow isolates Patch signing and APK signing trust domains and performs both automatically.
- CI signs release APK bytes and verifies package, signer, versionCode, versionName, and APK SHA-256 before artifact upload.
- Workflow fails closed if the current Patch contract cannot be loaded/built/signed/verified, generated security verification fails, APK signing material is invalid, or final APK identity/version does not match the canonical contracts.
- Historical debug-signed installs are not the canonical signer lineage.

**Evidence**

- canonical signer SHA-256 `aae608a7ddab0dbfccc1d35e817c5683b3c64b90ab581a4b74867db54e0351ce`
- `android-shell/tools/verify-apk-identity.mjs`
- `android-shell/test/apk-ci-signing-contract.test.mjs`
- LIGHTHOUSE APK Debug #208 run `33454225997` — SUCCESS on exact head `658ea4fa...`.
- `Verify foundation contract`, `Load current Patch contract`, `Build current Patch signing sources`, `Sign verify and manifest current Patch`, `Verify generated Android security`, `Materialize canonical APK signer`, `Verify final APK identity`, and `Upload canonical APK` all completed successfully in that run.

**Gap**

- Physical canonical APK A baseline must be established first.
- APK A -> APK B same-signer, higher-version in-place update without uninstall/storage clear has not been physically proven.

**Status:** `VERIFY`; signing/version/final-byte rail and reusable test-flow automation are `PROVEN`, physical update lineage remains gated.

## 4. Data Survival — VERIFY

**Reality**

- Single IndexedDB writes resolve at transaction completion rather than request success.
- Multi-entry writes and reset use transaction outcome semantics.
- A blocked database open fails closed with `GREENFIELD_DB_OPEN_BLOCKED`.
- Existing connections close on `versionchange` so a legitimate schema/database upgrade is not stranded by this connection.
- Existing schema-1 -> schema-2 migration tests preserve existing durable truth.
- Trusted bootstrap integration proves close/reopen over the same IndexedDB database preserves a committed `ข้าว 65` expense readback.

**Evidence**

- Data-survival tests commit `45293eac99607a7b96ce4039e175b9a32d2795b1`.
- implementation commit `5198a9f5a61191d2be8e97655205b8f530896feb`.
- exact-head Greenfield Deploy Gate #864 run `33454225972` — SUCCESS on `658ea4fa...`.
- Greenfield suite includes transaction completion, `versionchange`, `blocked`, schema migration, encrypted durable readback, recovery, and lifecycle contracts.
- `android-shell/test/trusted-bootstrap.integration.test.mjs` proves durable reopen/readback using IndexedDB.

**Gap**

- Browser/CI evidence cannot prove physical Android force-stop, process death, reboot, or post-APK-update persistence.
- `strict durability` remains `VERIFY`; it is not promoted to a blocker without direct evidence requiring it.

**Status:** `VERIFY` overall; current automatable transaction/upgrade/reopen/schema claims are `PROVEN`, physical survival claims remain `VERIFY`.

## 3. Lifecycle & Restore — VERIFY

**Reality**

- Trusted bootstrap closes a runtime/store and reconstructs a fresh runtime/store over the same IndexedDB state with the committed expense intact.
- A confirmation that existed only in the old session cannot be executed after reopen; stale `ยืนยัน` fails closed without durable mutation.
- Lifecycle/reopen behavior is now exercised under the same exact-head foundation that produces the canonical APK.

**Evidence**

- `android-shell/test/trusted-bootstrap.integration.test.mjs`:
  - durable `ข้าว 65` close/reopen readback
  - reopen while confirmation pending rejects stale execution.
- exact-head Greenfield Deploy Gate #864 run `33454225972` — SUCCESS.
- exact-head LIGHTHOUSE APK Debug #208 run `33454225997` — SUCCESS.

**Gap**

- Real Android force-stop/relaunch, genuine process death/relaunch, device reboot, and post-upgrade reconstruction require physical hardware.

**Status:** `VERIFY`; automatable reconstruction semantics are `PROVEN`, OS lifecycle claims remain `VERIFY`.

## 5. Security Boundary — PROVEN FOR GENERATED RELEASE SURFACE

**Reality**

- Security verification runs against the generated/merged Android release manifest after Capacitor native generation, not against an inferred static manifest.
- Explicit baseline requires backup disabled, cleartext disabled, release not debuggable, expected permissions only, providers private, and exported components fail closed unless specifically proven.
- AndroidX `ProfileInstallReceiver` is accepted only under its exact constrained contract: known class, exported receiver, `android.permission.DUMP`, and known ProfileInstaller actions. Drift fails closed.
- Package-scoped dynamic receiver permission is allowed only with a signature-protected declaration.
- Standard APK Test Flow applies and verifies this generated security baseline automatically before APK publication.

**Evidence**

- verifier policy commit `e45113d27b638d7f3b9f5dcbf451ce664cc7dab0`
- verifier negative/positive tests commit `5f5151498f874d54e66cf0da45fd0aae20b09569`
- exact-head LIGHTHOUSE APK Debug #208 run `33454225997` — SUCCESS; generated Android security apply and verify steps completed before final APK identity verification/upload.
- exact-head Greenfield Deploy Gate #864 run `33454225972` — SUCCESS.

**Gap**

- This claim is limited to the generated release native surface and verifier contract. It does not manufacture physical runtime/device evidence.

**Status:** `PROVEN` for generated release security surface.

## 6. Backup & Recovery — VERIFY

**Reality**

- Current backup export does not embed a usable plaintext recovery secret.
- Current restore uses separately supplied recovery material.
- Historical embedded-key backups remain explicitly identified as legacy compatibility.
- Wrong recovery material/corruption fails closed before replacing valid target state; overwrite requires the existing explicit decision contract.

**Evidence**

- current backup/recovery tests cover no embedded recovery secret, separate recovery material, wrong material/corruption no-write behavior, overwrite protection, verified restore readback, and legacy embedded-key compatibility.
- exact-head Greenfield Deploy Gate #864 run `33454225972` — SUCCESS on `658ea4fa...`.

**Gap**

- Required physical end-to-end proof remains: current backup -> controlled empty/loss target -> restore with separately held recovery material -> app reopen -> exact durable readback.

**Status:** `VERIFY`; secret boundary and automated recovery behavior are `PROVEN`, physical recovery remains `VERIFY`.

## Physical evidence owner / next gate

Physical execution is defined in `docs/android-app-existence-physical-proof.md` and linked from `docs/android-apk-identity-checkpoint.md`.

The first unresolved hard gate is PR #96 Phase 6.2: establish the canonical APK on real Android hardware, complete enrollment if applicable, record Patch state, create and read back representative durable truth (`ข้าว 65` minimum), fully close/reopen, and prove the truth/Patch state remain present.

After this baseline is captured, later test rounds use the reusable Standard APK Test Flow rather than manual signer/manifest/security/build assembly. Producing a canonical APK from that flow is not itself physical A -> B/state-survival proof.

Until Phase 6.2 is complete:

- do not produce APK B for the A -> B proof;
- do not claim force-stop/process-death/reboot/post-upgrade survival as `PROVEN`;
- do not claim physical backup/recovery as `PROVEN`;
- do not substitute CI/emulator evidence for hardware.

## Review boundary

This branch stops at evidence preparation and physical-gate definition. BIG owns sending the work for external review. Do not mark PR #97 ready, request review, merge, deploy, or publish from this checkpoint.
