# LIGHTHOUSE In-App APK Updater Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore direct startup and deliver a safe Settings-driven full-APK updater without putting update infrastructure in the app startup path.

**Architecture:** The proven app entry loads `ui/master-input.mjs` and `app.mjs` directly. Snapshot/effective-manifest work remains build evidence only. A focused web updater module validates metadata/download hash and calls a small native Android bridge for package/version/signer inspection, unknown-source permission, and installer handoff after the existing encrypted backup path succeeds.

**Tech Stack:** ES modules, Node 22 tests, Capacitor 8.5, generated Android project, Java/Kotlin Android APIs, GitHub Actions, Gradle release build.

**Spec:** `docs/superpowers/specs/2026-09-02-lighthouse-in-app-apk-updater-design.md`

## Global Constraints
- Package stays `com.yggdrasil.lighthouse`.
- Canonical signer SHA-256 stays `AA:E6:08:A7:DD:AB:0D:BF:CC:C1:D3:5E:81:7C:56:83:B3:C6:4B:90:AB:58:1A:4B:74:86:7D:B5:4E:03:51:CE`.
- Existing storage/import compatibility identifiers containing METROPOLIS are not renamed.
- Update infrastructure never blocks app startup.
- Full APK is the only user-facing update payload; remote JS patch activation is disabled from runtime.
- Android owns final installation confirmation.
- Every behavior change follows RED → GREEN → regression verification.

---

### Task 1: Restore proven direct startup

**Files:**
- Modify: `android-shell/tools/stage-existing-full-app.mjs`
- Modify: `android-shell/test/existing-full-app-package.test.mjs`
- Test: `tests/lighthouse-existing-apk-repair.test.cjs`

**Interfaces:**
- Produces staged `index.html` that directly references `ui/master-input.mjs` and `app.mjs`.
- Retains `sw.js`, `styles/`, patch/effective evidence files as packaged non-entry assets.

- [ ] Write a failing test asserting staged `index.html` contains the two direct module entries and does not contain `patch/canonical-bootstrap.mjs`.
- [ ] Run the package/repair tests and confirm the failure is caused by the current bootstrap rewrite.
- [ ] Remove `installCanonicalBootstrapEntry()` and its call from staging.
- [ ] Run package/repair tests and confirm direct startup passes.
- [ ] Commit the startup restoration.

### Task 2: Freeze snapshot work as release evidence only

**Files:**
- Modify: `tests/greenfield-lighthouse-effective-snapshot.test.cjs`
- Modify: `android-shell/test/effective-base-manifest.test.mjs`
- Keep: `android-shell/www/patch/effective-snapshot.mjs`
- Keep: `android-shell/www/patch/effective-store.mjs`
- Keep: `android-shell/www/patch/canonical-overlay.mjs`
- Keep: `android-shell/tools/build-effective-base-manifest.mjs`

**Interfaces:**
- Produces `effective-base-manifest.json` during staging.
- No runtime entry or Service Worker path reads `CURRENT_SNAPSHOT` to decide which application code starts.

- [ ] Write a failing contract test that rejects any staged runtime entry referencing `canonical-bootstrap` or `CURRENT_SNAPSHOT`.
- [ ] Run the test and confirm RED against the current branch state before Task 1 GREEN.
- [ ] Keep manifest/hash generation intact while removing runtime activation references.
- [ ] Run effective manifest/snapshot tests and direct-entry tests together.
- [ ] Commit evidence-only snapshot semantics.

### Task 3: Add updater domain module and Settings UI

**Files:**
- Create: `ui/app-update.mjs`
- Create: `android-shell/test/app-update.test.mjs`
- Modify: `ui/settings-ui.mjs`
- Modify: `styles/settings-utility.css`

**Interfaces:**
- `validateUpdateMetadata(value, currentVersionCode)` -> normalized metadata or throws stable error code.
- `sha256Blob(blob)` -> lowercase 64-char hex.
- `createAppUpdater({ fetchImpl, nativeBridge, requestBackup, ui })` -> `{ check(), downloadAndInstall(), cancel() }`.
- Settings panel owns user actions only; module has no startup side effects beyond wiring the panel when Settings UI installs.

- [ ] Write failing tests for HTTPS-only metadata, higher versionCode, SHA format, required fields, cancellation, hash mismatch, and no-network failure.
- [ ] Run `node --test android-shell/test/app-update.test.mjs` and verify RED.
- [ ] Implement metadata validation/hash/download state machine minimally.
- [ ] Add `การอัปเดตแอป` Settings panel with current/latest version, size, notes, progress, cancel, check, install controls.
- [ ] Run updater tests and Settings DOM tests; confirm GREEN.
- [ ] Commit updater web layer.

### Task 4: Add deterministic native Android updater bridge

**Files:**
- Create: `android-shell/tools/apply-android-updater.mjs`
- Create: `android-shell/test/android-updater-tool.test.mjs`
- Modify: `.github/workflows/lighthouse-apk-debug.yml`
- Modify: `.github/workflows/lighthouse-owner-build.yml`
- Modify: `android-shell/package.json`

**Interfaces:**
- Tool injects native bridge source into generated Android project after `cap add/sync` and before Gradle build.
- Native bridge methods: `getInstalledIdentity`, `canRequestInstalls`, `openUnknownSourcesSettings`, `inspectApk`, `openInstaller`.
- Manifest receives `android.permission.REQUEST_INSTALL_PACKAGES` plus a scoped FileProvider/cache path when required.

- [ ] Write failing tool tests against a fixture Android project: permission absent, bridge absent, provider absent.
- [ ] Run tests and verify RED.
- [ ] Implement deterministic manifest/provider/source injection with idempotent readback checks.
- [ ] Add workflow step invoking the tool before Android security verification/build.
- [ ] Run tool tests and Android security tests; confirm GREEN.
- [ ] Commit native bridge tooling.

### Task 5: Enforce APK identity/signer/version and backup gate

**Files:**
- Modify: `ui/app-update.mjs`
- Modify: `android-shell/test/app-update.test.mjs`
- Modify: native bridge injected by `apply-android-updater.mjs`
- Modify: `ui/settings-ui.mjs` only for status presentation if needed.

**Interfaces:**
- `inspectApk` returns `{ packageName, versionName, versionCode, signerSha256 }`.
- Installer handoff is allowed only if package, higher versionCode, canonical signer, metadata SHA, and encrypted backup success all match.

- [ ] Write failing tests for wrong package, same/lower version, wrong signer, failed backup, and correct happy path ordering.
- [ ] Run updater tests and verify RED.
- [ ] Implement gate ordering: hash -> native inspect -> package/version/signer -> backup -> install permission -> installer.
- [ ] Verify cancellation/failure never invokes backup or installer prematurely.
- [ ] Run updater + native tool tests and confirm GREEN.
- [ ] Commit safety gates.

### Task 6: Produce release metadata and evidence in CI

**Files:**
- Create: `android-shell/tools/build-update-metadata.mjs`
- Create: `android-shell/test/update-metadata.test.mjs`
- Modify: `.github/workflows/lighthouse-apk-debug.yml`
- Modify: `.github/workflows/lighthouse-owner-build.yml`

**Interfaces:**
- Tool consumes final signed APK evidence and release inputs, writes `lighthouse-update.json` with `versionName`, `versionCode`, `apkUrl`, `sha256`, `required`, `releaseNotes`.
- Workflow artifact includes APK, update JSON, Android identity evidence, and `effective-base-manifest.json`.

- [ ] Write failing metadata-generator tests for invalid HTTP URL, bad hash, missing notes/version, and deterministic valid JSON.
- [ ] Run test and verify RED.
- [ ] Implement generator.
- [ ] Add CI artifact packaging for APK + metadata + effective manifest + identity evidence.
- [ ] Run tests and confirm GREEN.
- [ ] Commit release evidence generation.

### Task 7: Full verification and owner-test APK

**Files:**
- No new production files unless a defect is found.

**Interfaces:**
- Final artifact is a canonical-signed higher-version LIGHTHOUSE APK from the existing-app lineage.

- [ ] Run root deploy gate tests.
- [ ] Run all `android-shell/test/*.test.mjs`.
- [ ] Run existing APK repair verify workflow.
- [ ] Run APK debug build through signer/identity verification and artifact upload.
- [ ] Inspect artifact evidence: package, versionCode, signer, `styles/settings-utility.css`, direct app entries, updater bridge, metadata, effective manifest.
- [ ] Hand APK to owner for physical install-over test: app opens offline, Login works, data remains, Settings updater renders, Android install permission flow opens only on explicit update action.
