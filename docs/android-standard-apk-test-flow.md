# LIGHTHOUSE Standard APK Test Flow

Status: PERMANENT STANDARD TEST-BUILD PATH

## Operator path

For an ordinary APK test round, the tester does only this:

1. Raise `android-shell/version.json` to the intended canonical Android version.
2. Run the `LIGHTHOUSE APK Debug` workflow (the standard Patch/APK rail).
3. Use the produced `lighthouse-canonical-apk` artifact for testing.

The workflow owns the remaining required work: foundation tests, current Patch source preparation, Patch signing and verification, Patch manifest evidence, Capacitor Android generation/sync, Android security baseline application and verification, canonical Android version application, release build, canonical APK signing, final package/signer/version identity verification, and evidence upload.

## Current Patch release

`android-shell/release/current-patch.json` is the single source-controlled pointer for the Patch release currently consumed by the standard flow. When a new Patch itself is prepared, update that contract and provide its matching `release/front-door-<version>/` source directory. The workflow structure must not be edited merely to change Patch release numbers.

The current contract owns:

- Patch version
- primary base version
- bootstrap base version
- matching release source directory

The generic builder `android-shell/tools/build-current-patch-source.mjs` validates that contract and fails closed if version relations or the release directory are invalid.

## Tester must not do manually

Do not manually alter the APK signer, generated Android manifest, backup/cleartext/debuggable security flags, generated Gradle version fields, signing commands, release build sequence, or final identity verification to make a test APK pass.

If any standard gate fails, keep the run failed and repair the source/contract. Do not bypass the gate in the test procedure.

## Canonical output

A successful standard run publishes:

- `lighthouse-canonical-apk`
  - signed canonical release APK
  - APK identity evidence
  - generated Android security evidence
  - Patch manifest evidence from the same run
- `lighthouse-current-patch`
  - verified current Patch bundles
  - Patch manifest
- `lighthouse-current-patch-signing-sources`
  - generated non-secret Patch signing-source inputs

## Fail-closed boundary

Canonical APK publication must not occur if required tests, Patch signing/verification, generated Android security, release build, canonical signing, or final APK identity/version verification fails.

## Physical proof remains separate

A green standard APK workflow proves the canonical build rail produced the intended artifact. It does **not** prove physical-device A->B update continuity, force-stop/process-death/reboot survival, or post-update durable state survival.

Those claims remain owned by `docs/android-app-existence-physical-proof.md` and require retained evidence from real Android hardware.
