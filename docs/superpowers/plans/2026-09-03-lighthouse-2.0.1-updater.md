# LIGHTHOUSE 2.0.1 Updater Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver signed LIGHTHOUSE 2.0.1 / versionCode 2001 with a real Android updater foundation wired to Settings and preserving existing app data.

**Architecture:** Keep updater state separate from the Greenfield business runtime. Browser Settings delegates to a small JS `UpdateController`; Android native `LighthouseUpdaterPlugin` owns PackageManager identity readback, DownloadManager job persistence, APK trust verification, unknown-source permission, FileProvider install intent, and cleanup/reconciliation.

**Tech Stack:** Existing ESM browser shell, Node test runner, Capacitor 8 Android, Java, Android DownloadManager/PackageManager/FileProvider/SharedPreferences, GitHub Actions owner build.

**Spec:** `docs/superpowers/specs/2026-09-03-lighthouse-2.0.1-updater-design.md`

## Global Constraints

- applicationId/packageName exactly `com.yggdrasil.lighthouse`.
- release identity exactly `versionName=2.0.1`, `versionCode=2001`.
- canonical signer must remain unchanged from 2.0.0.
- updater must not clear/reset/uninstall/rename the app or business data.
- updater state must not become part of Greenfield CHAT/MANUAL data truth.
- only controlled test manifest is used; no public release manifest.
- no end-to-end acceptance claim before a later real-device 2.0.1 -> 2.0.2 proof.

---

### Task 1: Pure updater contract and Settings wiring

**Files:**
- Create: `lighthouse-new-base/src/updater-contract.mjs`
- Create: `lighthouse-new-base/src/update-controller.mjs`
- Create: `lighthouse-new-base/test/updater-contract.test.mjs`
- Create: `lighthouse-new-base/test/update-controller.test.mjs`
- Modify: `lighthouse-new-base/src/browser-app.mjs`
- Modify: `lighthouse-new-base/src/browser-shell.mjs`
- Modify: `lighthouse-new-base/main.mjs`

**Interfaces:**
- `validateUpdateManifest(raw, { packageName }) -> frozen manifest`
- `compareUpdateVersion({ installedVersionCode, candidateVersionCode }) -> 'upgrade'|'same'|'downgrade'`
- `projectDownloadProgress({ downloadedBytes, totalBytes }) -> { indeterminate, percent, downloadedBytes, totalBytes }`
- `createUpdateController({ bridge, manifestUrl, packageName }) -> { checkUpdate, startUpdate, install, retry, reconcile, readStatus }`
- Browser app receives `settings.operations` and calls `checkUpdate` for `[data-settings-action="check-update"]`.

- [ ] Write tests first for required manifest fields, HTTPS/version-specific APK URL, version comparison, unknown total progress, Settings button wiring, truthful status/error projection, and retry.
- [ ] Run NEW BASE tests and observe the updater tests fail for missing implementation.
- [ ] Implement only the pure updater contract/controller and Settings event bridge required by the failing tests.
- [ ] Run NEW BASE tests and keep existing route/copy tests green.

### Task 2: Native Android updater plugin template

**Files:**
- Create: `android-shell/android-template/LighthouseUpdaterPlugin.java`
- Create: `android-shell/android-template/file_paths.xml`
- Create: `android-shell/tools/apply-updater-android.mjs`
- Create: `android-shell/test/updater-android-contract.test.mjs`
- Modify: `android-shell/package.json`
- Modify: `.github/workflows/lighthouse-owner-build.yml`

**Interfaces:**
Native plugin methods exposed to JS/Capacitor:
- `getInstalledIdentity()`
- `enqueueDownload({ url, sha256, sizeBytes, packageName, versionName, versionCode })`
- `readDownloadState()`
- `retryDownload()`
- `verifyDownloadedApk()`
- `canInstallPackages()`
- `requestInstallPermission()`
- `installDownloadedApk()`
- `reconcileInstalledVersion()`
- `cancelUpdate({ permanent })`

- [ ] Write Android contract tests first asserting generated manifest permission/provider, `content://` FileProvider usage, no `file://`, PackageManager signer/version checks, persisted DownloadManager id/state, and no clear/uninstall calls.
- [ ] Run Android shell tests and observe failure before template/apply script exists.
- [ ] Implement template and deterministic patch tool; workflow runs it after `cap add/sync` and before manifest/security verification/build.
- [ ] Run Android shell tests green.

### Task 3: Controlled test manifest and version 2.0.1 identity

**Files:**
- Create: `update-test/manifest.json`
- Modify: `android-shell/version.json`
- Modify: `android-shell/package.json`
- Modify: `lighthouse-new-base/main.mjs`
- Modify: version contract tests as required.

**Interfaces:**
- Manifest URL is a controlled GitHub HTTPS raw URL for `update-test/manifest.json`.
- Current 2.0.1 manifest describes versionCode 2001 so installed 2.0.1 truthfully reports no upgrade until the 2.0.2 round changes the manifest.

- [ ] Write/update version and manifest contract tests first for 2.0.1 / 2001 and required manifest fields.
- [ ] Observe RED against old 2.0.0 identity.
- [ ] Set 2.0.1 / 2001 and controlled manifest wiring.
- [ ] Run tests green.

### Task 4: Whole-app and Android gates

**Files:**
- Existing NEW BASE/Android test suites only unless a missing spec assertion requires a focused existing-scope test.

- [ ] Run whole-app suite once; list any actual failures and group by root cause.
- [ ] Fix only root causes within this updater spec; no unrelated feature work.
- [ ] Run Android shell tests and generated Android contract gate.
- [ ] Stop and report structural boundary if one point requires more than three patch attempts.

### Task 5: Signed owner-test APK and evidence

**Files:**
- Modify only owner build workflow if necessary to produce evidence/artifact names for 2.0.1.

- [ ] Run owner build for canonical branch/source commit.
- [ ] Build unsigned release, sign with canonical stored signer, then verify the signed APK.
- [ ] Produce identity evidence containing applicationId, versionName, versionCode, signerCertificateSha256, apkSha256, sourceCommit.
- [ ] Mechanically compare signer evidence with canonical signer used by 2.0.0.
- [ ] Upload `LIGHTHOUSE-2.0.1-owner-test.apk` plus evidence.

### Task 6: Owner-device acceptance boundary

- [ ] Hand signed APK to BIG for install over existing 2.0.0.
- [ ] BIG verifies Android accepts in-place update and existing data remains present.
- [ ] BIG opens Settings and checks updater reports truthfully against controlled manifest.
- [ ] Record that updater E2E remains OPEN pending 2.0.2; do not claim full updater acceptance.
