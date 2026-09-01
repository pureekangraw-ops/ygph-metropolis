# LIGHTHOUSE App Existence Hardening Checkpoint

Status: AUTOMATABLE HARDENING COMPLETE TO CURRENT EVIDENCE; PHYSICAL DEVICE CLAIMS REMAIN GATED. No production deploy/store publication. No APK B before PR #96 Phase 6.2 completes.

This checkpoint records `Reality -> Evidence -> Gap -> Status` for the six App Existence roots. `PROVEN` applies only to the exact claim supported by evidence; a root remains `VERIFY` when required physical evidence is outstanding.

## 1. App Identity — VERIFY

**Reality**

- Canonical application/package ID is `com.yggdrasil.lighthouse` across source identity contract and generated canonical APK rail.
- Canonical APK A final bytes were previously verified as package `com.yggdrasil.lighthouse`, versionCode `1001`, versionName `1.0.0`, canonical signer `aae608a7ddab0dbfccc1d35e817c5683b3c64b90ab581a4b74867db54e0351ce`.

**Evidence**

- `android-shell/apk-identity.json`
- `android-shell/version.json`
- PR #96 exact-head canonical APK A evidence: workflow run `33408701504`, artifact id `9764284616`, APK SHA-256 `fe80759f8a7aff9c711ea99ac8a5ca0dea29d87e2eed65704587787326d5c4b1`.

**Gap**

- Canonical APK A identity is not yet recorded from the physical target device required by Phase 6.2.

**Status:** `VERIFY` overall; source/final-artifact identity contract is `PROVEN`, installed-device canonical identity remains `VERIFY`.

## 2. Signing & Update Identity — VERIFY

**Reality**

- Canonical signer and monotonic Android version owner exist.
- CI signs release APK bytes and verifies package, signer, versionCode, versionName, and APK SHA-256 before artifact upload.
- Historical debug-signed installs are not the canonical signer lineage.

**Evidence**

- canonical signer SHA-256 `aae608a7ddab0dbfccc1d35e817c5683b3c64b90ab581a4b74867db54e0351ce`
- `android-shell/tools/verify-apk-identity.mjs`
- APK A versionCode `1001` / versionName `1.0.0`
- PR #96 identity continuity checkpoint and canonical APK A workflow run `33408701504`.

**Gap**

- Physical APK A baseline must be established first.
- APK A -> APK B same-signer, higher-version in-place update without uninstall/storage clear has not been physically proven.

**Status:** `VERIFY`; signing/version/final-byte rail is `PROVEN`, physical update lineage remains gated.

## 4. Data Survival — VERIFY

**Reality**

- Single IndexedDB writes now resolve at transaction completion rather than request success.
- Multi-entry writes and reset already use transaction outcome semantics.
- A blocked database open fails closed with `GREENFIELD_DB_OPEN_BLOCKED`.
- Existing connections close on `versionchange` so a legitimate schema/database upgrade is not stranded by this connection.
- Existing schema-1 -> schema-2 migration tests preserve existing durable truth.
- Trusted bootstrap integration already proves close/reopen over the same IndexedDB database preserves a committed `ข้าว 65` expense readback.

**Evidence**

- Data-survival tests commit `45293eac99607a7b96ce4039e175b9a32d2795b1`.
- implementation commit `5198a9f5a61191d2be8e97655205b8f530896feb`.
- Greenfield Deploy Gate #847 executed the new tests: transaction completion, `versionchange`, `blocked`, and schema migration all passed; its sole failure was the expected stale service-worker asset revision after changing a production module.
- asset revision synchronized in commit `42e4a42277218cffca48333267e0f226ece95596` to `sha256-068ee3281aa019ab`.
- `android-shell/test/trusted-bootstrap.integration.test.mjs` proves durable reopen/readback using IndexedDB.

**Gap**

- Browser/CI evidence cannot prove physical Android force-stop, process death, reboot, or post-APK-update persistence.
- `strict durability` remains `VERIFY`; it is not promoted to a blocker without direct evidence requiring it.

**Status:** `VERIFY` overall; current automatable transaction/upgrade/reopen/schema claims are `PROVEN`, physical survival claims remain `VERIFY`.

## 3. Lifecycle & Restore — VERIFY

**Reality**

- Trusted bootstrap closes a runtime/store and reconstructs a fresh runtime/store over the same IndexedDB state with the committed expense intact.
- A confirmation that existed only in the old session cannot be executed after reopen; stale `ยืนยัน` fails closed without durable mutation.

**Evidence**

- `android-shell/test/trusted-bootstrap.integration.test.mjs`:
  - durable `ข้าว 65` close/reopen readback
  - reopen while confirmation pending rejects stale execution.

**Gap**

- Real Android force-stop/relaunch, genuine process death/relaunch, device reboot, and post-upgrade reconstruction require physical hardware.

**Status:** `VERIFY`; automatable reconstruction semantics are `PROVEN`, OS lifecycle claims remain `VERIFY`.

## 5. Security Boundary — PROVEN FOR GENERATED RELEASE SURFACE

**Reality**

- Security verification runs against the generated/merged Android release manifest after Capacitor native generation, not against an inferred static manifest.
- Explicit baseline requires backup disabled, cleartext disabled, release not debuggable, expected permissions only, providers private, and exported components fail closed unless specifically proven.
- AndroidX `ProfileInstallReceiver` is accepted only under its exact constrained contract: known class, exported receiver, `android.permission.DUMP`, and known ProfileInstaller actions. Drift fails closed.
- Package-scoped dynamic receiver permission is allowed only with a signature-protected declaration.

**Evidence**

- verifier policy commit `e45113d27b638d7f3b9f5dcbf451ce664cc7dab0`
- verifier negative/positive tests commit `5f5151498f874d54e66cf0da45fd0aae20b09569`
- exact-head CI on `5f515149...`:
  - Greenfield Deploy Gate #845 — SUCCESS
  - LIGHTHOUSE APK Debug #189 — SUCCESS
- generated native security verifier completed successfully again through the relevant security step in later Android runs after Data Survival changes.

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
- Greenfield #847 showed these recovery tests passing while the unrelated asset-revision gate was the sole failure.

**Gap**

- Required physical end-to-end proof remains: current backup -> controlled empty/loss target -> restore with separately held recovery material -> app reopen -> exact durable readback.

**Status:** `VERIFY`; secret boundary and automated recovery behavior are `PROVEN`, physical recovery remains `VERIFY`.

## Physical evidence owner / next gate

Physical execution is defined in `docs/android-app-existence-physical-proof.md` and linked from `docs/android-apk-identity-checkpoint.md`.

The first unresolved hard gate is PR #96 Phase 6.2: establish canonical APK A on real Android hardware, complete enrollment if applicable, record Patch state, create and read back representative durable truth (`ข้าว 65` minimum), fully close/reopen, and prove the truth/Patch state remain present.

Until that is complete:

- do not produce APK B for the A -> B proof;
- do not claim force-stop/process-death/reboot/post-upgrade survival as `PROVEN`;
- do not claim physical backup/recovery as `PROVEN`;
- do not substitute CI/emulator evidence for hardware.

## Review boundary

This branch stops at evidence preparation and physical-gate definition. BIG owns sending the work for external review. Do not mark PR #97 ready, request review, merge, deploy, or publish from this checkpoint.
