# LIGHTHOUSE Android Release Architecture Design

**Status:** Owner-approved direction, implementation not started

**Date:** 2026-09-07

## Purpose

Package the owner-approved `lighthouse-next` application as a real Android APK while preserving LIGHTHOUSE's existing Android identity so a later build can update the installed app in place rather than appear as a different application.

The Android layer is infrastructure only. Product behavior, UI, copy, and user-facing logic remain owned by `lighthouse-next/`. Legacy LIGHTHOUSE application code may be used only as a donor for Android packaging, signing, security, and release mechanics.

## Owner Locks

- Application ID remains `com.yggdrasil.lighthouse`.
- APK signer remains the canonical LIGHTHOUSE signer whose certificate SHA-256 is `aae608a7ddab0dbfccc1d35e817c5683b3c64b90ab581a4b74867db54e0351ce`.
- `versionCode` follows a monotonic increasing integer policy.
- App name remains `LIGHTHOUSE`.
- The owner-approved lighthouse artwork in `lighthouse-next/assets/lighthouse-icon.svg` is the product identity and must drive Android launcher icon resources.
- The web visual direction already approved by the Owner must not be redesigned during Android packaging.
- The first Android release must not be blocked on an in-app updater or patch updater. A signed APK that installs over the existing package is the required baseline.
- No production release, merge, or cutover occurs automatically. Physical-device acceptance is an Owner Gate.

## Recommended Architecture

Reuse the existing Android shell from `feat/lighthouse-1.0.0-rebuild` as packaging infrastructure, but migrate that shell onto the current `work/metro-new-20260906` branch and change its web-source contract so it packages `lighthouse-next/` instead of legacy root application assets.

The shell keeps Capacitor, Android security checks, signing verification, APK identity evidence, and build provenance. It must not import legacy application behavior as implementation authority.

The packaged source flow becomes:

`owner-approved lighthouse-next commit -> stage exact lighthouse-next assets -> Capacitor sync -> Android build -> sign -> verify identity -> hash/provenance evidence -> owner-test APK -> physical install-over test`

## Source Boundary

### Product source

The APK web payload comes from `lighthouse-next/` only, including the live files required by the application such as:

- `index.html`
- `styles.css`
- `owner-polish.css`
- `app.mjs`
- focused behavior modules used by `index.html`
- `manifest.webmanifest`
- `assets/` including the approved lighthouse icon artwork

The staging tool must fail closed when a referenced product asset is missing. It must not silently fall back to legacy root `app.mjs`, `styles.css`, `greenfield/`, `lighthouse/`, or other donor UI/application assets.

### Android infrastructure

The migrated `android-shell/` owns only:

- Capacitor configuration and Android project generation/sync
- Android security baseline application and verification
- package identity/version configuration
- signing and signer verification
- APK identity/provenance evidence
- Android launcher/adaptive icon materialization
- owner-test APK artifact production

## Identity and Install-Over Contract

A candidate APK is rejected unless all of these are true:

1. package/application ID equals `com.yggdrasil.lighthouse`;
2. signer certificate SHA-256 equals the canonical signer value above;
3. `versionCode` is greater than the prior installed/released LIGHTHOUSE versionCode;
4. app name is LIGHTHOUSE;
5. source commit/ref is recorded in build evidence;
6. final APK SHA-256 is recorded after signing;
7. launcher icon resources are derived from the approved lighthouse artwork;
8. APK signature verification succeeds.

Package ID and signer continuity are prerequisites for Android to treat a new APK as an update to the same application. Data persistence is not declared PASS from static checks alone; it requires a physical install-over readback test.

## Versioning

The donor shell currently records versionCode `1005`. The migrated current branch must choose the next owner-test versionCode strictly above the latest version already installed/released under the canonical signer. If repository evidence alone cannot prove the latest real installed value, the candidate remains VERIFY until checked against the owner's device or release evidence.

`versionName` is presentation metadata; `versionCode` is the Android update ordering authority.

## App Icon Contract

The approved artwork remains `lighthouse-next/assets/lighthouse-icon.svg`; it must not be redrawn or substituted during packaging.

Android launcher resources must include safe foreground/background treatment appropriate for adaptive icons. The existing web `maskable` asset may inform safe-area placement, but Android launcher resources are separately generated/verified because web manifest behavior does not prove native launcher rendering.

Physical-device checks must verify:

- icon visible on launcher;
- no harmful crop on the owner's launcher shape;
- icon remains recognizable at launcher size;
- app label reads LIGHTHOUSE.

## Build Workflow

The existing `LIGHTHOUSE Owner Build` workflow is retained conceptually but updated so its default/current target builds `work/metro-new-20260906` and its staging step packages `lighthouse-next`.

Required build stages:

1. checkout exact owner-selected ref/commit;
2. print and record exact source commit;
3. install locked Node/Capacitor dependencies;
4. run Android-shell contract tests;
5. stage exact `lighthouse-next` product assets;
6. generate/sync Android project;
7. apply version metadata;
8. apply and verify Android security baseline;
9. build unsigned release APK;
10. materialize canonical signer from repository secrets;
11. zipalign/sign APK;
12. verify signature and identity;
13. compute final APK SHA-256 and provenance evidence;
14. upload owner-test APK plus evidence only if every gate passes.

No step may create a production release automatically.

## Physical Device Gate

Static CI success is necessary but insufficient. Owner-test acceptance requires a real Android device.

Minimum device procedure:

1. have an existing canonical LIGHTHOUSE installation, or install baseline candidate A;
2. create recognizable local test state inside the app;
3. build candidate B with a higher versionCode and the same package/signer;
4. install B over A without uninstalling A;
5. confirm Android treats the operation as update/install-over;
6. launch B;
7. read back the test state and confirm it remains available;
8. confirm approved UI and lighthouse launcher icon;
9. record PASS/FAIL/VERIFY for package, signer, version, install-over, data persistence, icon, and launch behavior.

If install-over fails, signer/package/version mismatch is investigated before any release. If data does not survive, the release remains blocked until the storage/migration cause is understood.

## Updater Scope

### Required for first real release

- signed APK;
- install-over compatibility;
- identity/hash/provenance verification;
- physical-device acceptance.

### Deferred convenience layer

- in-app `อัปเดต LIGHTHOUSE` button;
- patch updater;
- patch manifest/apply/rollback flow.

These deferred features may be designed after the baseline APK update path is proven. They must not weaken package/signature/hash checks.

## Failure Behavior

Build and release tooling fails closed for:

- missing `lighthouse-next` referenced asset;
- wrong package ID;
- wrong signer certificate;
- non-increasing or invalid versionCode;
- signature verification failure;
- missing final hash/provenance evidence;
- launcher identity source not derived from approved artwork;
- Android security verification failure.

A CI PASS does not convert unresolved device-only evidence to PASS; those items remain VERIFY until physically observed.

## Testing Strategy

Implementation uses TDD.

Automated contract tests cover:

- staging only `lighthouse-next` assets and rejecting legacy fallback;
- canonical package ID and signer policy;
- monotonic version policy;
- launcher icon source contract;
- workflow source/ref and artifact evidence requirements;
- absence of automatic production release/cutover behavior.

CI then performs build/sign/identity/security verification. Physical-device testing completes the acceptance gate.

## Non-Goals for This Phase

- redesigning approved LIGHTHOUSE UI;
- importing legacy app product behavior;
- implementing patch updates;
- implementing an in-app updater;
- production release or branch merge without Owner approval;
- claiming data persistence without install-over evidence.

## Acceptance Criteria

This phase is complete only when:

- current branch contains a working Android shell packaging `lighthouse-next` only;
- CI produces a signed owner-test APK with verified canonical package/signer/version/hash/provenance;
- approved lighthouse artwork is used by native launcher resources;
- owner installs a higher-version candidate over a canonical prior install on a real device;
- app launches with approved UI;
- pre-update local test state survives and is read back;
- Owner marks the physical-device gate PASS.
