# LIGHTHOUSE Canonical Patch Overlay Design

## Goal
Make Patch update the canonical LIGHTHOUSE web bundle that the real Android app uses, without creating a second app shell or duplicate Chat/Manual/Settings world.

## Reality
Current PR #100 boots the real app through `android-shell/www/index.html -> trusted/bootstrap.mjs -> patch-runtime.mjs`. However the Patch runtime still models a complete independent snapshot made from `ui.html`, `ui.css`, `logic.mjs`, `rules.json`, and `vocabulary.json`. That means Patch mounts its own shell instead of overlaying the canonical web files.

## Design
The APK remains the only app. Patch becomes an overlay store keyed by canonical web paths. The resolver answers one question for every patchable path: use the active verified Patch version if present, otherwise use the packaged APK file.

Canonical flow:

`APK canonical bundle -> Patch Resolver -> canonical app`

Patch lifecycle:

`import/download .lhpatch -> verify signature/hash/version -> validate allowed canonical paths -> stage -> atomic activate -> reload canonical app -> readback -> rollback on failure`

## Patchable boundary
Patch may replace only canonical web-layer files that already exist in the APK and use existing capabilities. Initial allowlist:
- `app/logic.mjs`
- `app/ui.html`
- `app/ui.css`
- `app/rules.json`
- `app/vocabulary.json`
- selected `trusted/source/...` JavaScript modules copied from the canonical source bundle where no native capability is added

Patch must never change AndroidManifest, permissions, package id, signing, Gradle, Activity/Service, native plugins, or introduce a native capability. Those require a new APK.

## One-app invariant
Patch MUST NOT own a separate `ui.html` root or independent app universe. The canonical app root and navigation remain singular. Patch overlays canonical files only.

## Compatibility and Truth
- Existing Runtime/Ledger/Owner remain Truth owners.
- Patch never writes business storage directly.
- Storage/import compatibility identifiers containing METROPOLIS are not display identity and must not be renamed casually.
- Display identity exposed to users is LIGHTHOUSE.
- Trusted Patch signature/hash/version checks remain mandatory.
- Atomic activation + readback + rollback remain mandatory.

## Vocabulary change
Expand the Chat vocabulary/known typo seed in the canonical vocabulary source. Known unambiguous typo forms normalize locally; ambiguous text remains UNKNOWN/recovery and is never guessed.

## sw.js defect
The Android package must not register a service worker path that is absent. Either package a valid `sw.js` used by this runtime or gate service-worker registration so the Android bundle does not request a missing asset. No fake update status.

## Acceptance
1. Canonical app boots without any Patch.
2. Patch containing only one canonical file overrides only that file; all other files fall back to APK originals.
3. No Patch-owned independent Chat/Manual/Settings shell is mounted.
4. Signature/hash/version/path validation rejects invalid bundles before activation.
5. Activation is atomic and readback confirms current version/files.
6. Mount/load failure rolls back to previous active overlay.
7. Display identity visible to users is LIGHTHOUSE; compatibility/storage identifiers are preserved.
8. Chat typo seed expands without globally rewriting ambiguous Thai.
9. No missing `sw.js` request in Android runtime.
10. Existing full-app assembly, Runtime/Truth, Chat->Manual, Manual mutation/readback, Settings return, Patch signing and rollback tests stay green.

## Stop rule
Do not merge, publish, deploy, or create another APK/app shell in this task. Stop at a tested draft PR based on PR #100 head.
