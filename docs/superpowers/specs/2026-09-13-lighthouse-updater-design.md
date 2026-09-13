# LIGHTHOUSE Updater Design

**Status:** Proposed for Owner review
**Date:** 2026-09-13

## Decision
Use owner-approved Path B: prove the normal Android install-over path on a physical device first, then implement the in-app updater as a convenience layer over that proven path.

The updater must not introduce a second update authority. Android package identity, signer continuity, monotonic versionCode, final APK hash, and physical install-over behavior remain authoritative.

## Current Proven Baseline
The merged main baseline already passes the repository whole-app gate after Intent and Surface integration: Greenfield tests, syntax and UTF-8 gates, Android shell tests, exact staged LIGHTHOUSE Android payload, staged byte-identity verification, Wrangler validation, production deploy, and production smoke verification.

This automated PASS does not replace physical install-over evidence.

## Phase 1 — Physical Install-Over Gate
Before in-app updater implementation, produce an owner-test APK that preserves application ID com.yggdrasil.lighthouse, the canonical LIGHTHOUSE signer, a versionCode strictly higher than the installed baseline, exact source provenance, and final signed APK SHA-256/size evidence.

Physical acceptance:
1. Start with an existing canonical LIGHTHOUSE installation on the Owner device.
2. Create recognizable local state inside LIGHTHOUSE.
3. Install the higher-version owner-test APK over the existing app without uninstalling it.
4. Confirm Android treats it as an update to the same application.
5. Launch LIGHTHOUSE and confirm the approved CHAT / MANUAL / SETTINGS surface.
6. Confirm PIN entry still works.
7. Read back recognizable local state and confirm it survived the update.
8. Confirm launcher label/icon remain correct.

Result states: PASS permits Phase 2; FAIL or VERIFY blocks Phase 2 until resolved.

## Phase 2 — In-App Updater
Only after Phase 1 PASS.

Reuse release/lighthouse-update.json as the update-channel contract. Required fields: versionName, versionCode, minVersionCode, apkUrl, sha256, sizeBytes. versionCode is the update-order authority; versionName is presentation only.

### User Flow
Settings / App Operations exposes `อัปเดต LIGHTHOUSE`.
1. Fetch update manifest.
2. Validate manifest shape and version policy.
3. If remote versionCode is not newer, report latest version and stop.
4. If newer, show version and package size before download.
5. Download the full APK.
6. Verify exact byte size.
7. Verify SHA-256 against the manifest.
8. Only after both checks pass, hand the APK to Android's installer.
9. Android owns final install confirmation and package/signature enforcement.

No silent installation.

## Failure Behavior
Fail closed. Do not invoke Android installer when manifest fetch/parse fails, required fields are missing, versionCode is invalid, download is incomplete, size mismatches, SHA-256 mismatches, or installer handoff is unavailable. Failure leaves the currently installed LIGHTHOUSE untouched.

## Security and Trust Boundary
The updater is transport/convenience only, not a new trust root. Package ID and signer continuity remain mandatory. Phase 2 uses a full signed APK, not executable patches. Hash verification occurs before installer handoff. Android install confirmation is never bypassed.

## Architecture
- Release manifest: published update metadata.
- Updater core: pure manifest/version/hash validation logic.
- Android transport bridge: APK download/file handoff to native installer.
- Settings UI: explicit user action and status only.
- Release workflow: produces signed APK + hash/size and updates manifest only after release gates pass.

Updater code must not import or modify CHAT Intent, MANUAL business owners, Ledger, Calendar, Store, or Ride domain logic.

## Testing
Use TDD. Automated tests cover versionCode comparison, no-update path, malformed manifest rejection, minimum-version policy, byte-size verification, SHA-256 success/mismatch, installer handoff blocked before verification, Settings isolation from business state, Android artifact identity, and release manifest hash/size correctness.

Physical tests cover Phase 1 install-over/state persistence and, after implementation, Phase 2 manifest check, download, installer handoff, successful update, and post-update state persistence.

## Non-Goals
Patch/delta updater, silent background install, bypassing Android installer confirmation, Play Store integration, changing application ID/signer, or updater-driven business-state migrations.

## Acceptance Criteria
Updater work is complete only when:
1. Phase 1 physical install-over gate is PASS.
2. Updater core has deterministic version/hash/size validation tests.
3. Settings exposes an explicit update action.
4. release/lighthouse-update.json remains the manifest authority.
5. Only a fully downloaded, size-matched, SHA-256-matched APK may reach installer handoff.
6. Android package/signer/version checks remain unchanged.
7. Update from an older canonical LIGHTHOUSE build succeeds on the Owner device.
8. Pre-update local state survives and is read back after update.
