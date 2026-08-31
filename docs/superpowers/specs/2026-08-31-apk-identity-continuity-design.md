# APK Identity Continuity Design

**Status:** P0 Infrastructure Blocker

## Purpose

Ensure every future LIGHTHOUSE Android APK remains the same install lineage on a real device: same package identity, same stable APK signing identity, strictly increasing Android versionCode, and verified in-place upgrade without uninstall or loss of durable application state.

## Root Cause

The current system proves Patch signing strongly, but APK signing continuity was never promoted to a canonical system identity. CI generates the Android project and builds a debug APK, so successful APK build evidence does not prove that successive APK artifacts share one Android signer or can update each other in place.

Patch identity and APK identity are separate trust domains. A valid signed `.lhpatch` cannot preserve Android app sandbox data after uninstall. Therefore Backup/Restore is emergency recovery only and must not be part of the normal APK upgrade path.

## Canonical Invariants

1. Android package ID remains `com.yggdrasil.lighthouse` unless an explicit migration design is approved.
2. One stable APK signing identity is designated for this application lineage.
3. CI must build every distributable APK with that same signer.
4. CI must verify the resulting APK certificate fingerprint against a pinned canonical fingerprint before artifact publication.
5. Android `versionCode` must be explicit, monotonic, and greater for B than A.
6. A release candidate is not accepted solely because Gradle builds or CI is green.
7. Acceptance requires A → B in-place installation on a real Android device with no uninstall.
8. After B replaces A, durable state must survive: Greenfield/Vault business truth, Manual data reachable through that truth, Patch Current/Previous state, and device enrollment/unlock state.
9. Backup/Restore remains an emergency path, not a normal update step.
10. Map/GPS, Notification, Ride Engine, or other new native capabilities remain blocked until this continuity gate passes.

## Trust Boundaries

- **APK signer** proves Android application identity and ownership of the app sandbox/update lineage.
- **Patch signer** proves authenticity of patchable web-layer assets.
- Neither signer substitutes for the other.
- Secrets/private keys are never committed to the repository or printed in CI logs.

## Required Evidence Chain

`Canonical package ID → stable APK signer custody → pinned public certificate fingerprint → explicit versionCode contract → secret-backed CI signing → post-build signer verification → APK A artifact → APK B artifact → physical in-place A→B upgrade → durable state readback after upgrade`

Every boundary must have observable evidence. Unknown or missing evidence is `VERIFY` or `BLOCKED`, never assumed.

## Acceptance Scenario

1. Build APK A with canonical signer and versionCode N.
2. Install A on a real Android device.
3. Complete device enrollment/PIN unlock as applicable.
4. Create representative durable state, including at minimum a Greenfield-backed Manual transaction such as `ข้าว 65` and a known Patch Current/Previous state.
5. Fully close and reopen A and confirm durable readback before upgrade.
6. Build APK B from a newer source revision with the same package ID and signer, and versionCode > N.
7. Install B over A without uninstalling A.
8. Confirm Android accepts the update as an in-place upgrade.
9. Open B and prove the prior durable business record is still readable.
10. Prove Patch state is preserved and the current patch remains coherent.
11. Prove device enrollment/unlock state remains valid and does not silently reset.
12. Record exact APK SHA-256, APK signer certificate SHA-256, versionCode, source commit, and physical-device result for both A and B.

## Non-Scope

- No Map/GPS implementation.
- No Notification implementation.
- No Ride Engine/native feature expansion.
- No change to Patch signing identity unless separately authorized.
- No production deploy or store publication.
- No redesign of Greenfield/Manual business semantics.

## Exit Gate

The blocker is cleared only when APK B installs over APK A on a real Android device without uninstall, both APKs prove the same canonical signing certificate and ordered versionCodes, and Greenfield/Manual/Patch/device-unlock state survives with verified readback.