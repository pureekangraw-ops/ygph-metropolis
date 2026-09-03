# LIGHTHOUSE 2.0.1 Updater Foundation Design

**Status:** OWNER-APPROVED

**Target:** LIGHTHOUSE 2.0.1 / versionCode 2001

## Goal

Build a real Android updater foundation that installs over LIGHTHOUSE 2.0.0 without changing package identity, signer, or application data. End-to-end updater acceptance remains intentionally open until the subsequent 2.0.2 device proof.

## Fixed identity

- applicationId/packageName: `com.yggdrasil.lighthouse`
- versionName: `2.0.1`
- versionCode: `2001`
- signer: must equal the canonical signer already used by 2.0.0; no signer substitution is allowed.
- data: no clear-data, reset, uninstall, schema reset, or package rename operation is part of this release.

## Architecture

Settings owns only the visible entry point. `UpdateController` owns orchestration and state projection. Android native `LighthouseUpdaterPlugin` owns installed-package reality, DownloadManager integration, persisted updater state, APK verification, unknown-source permission, FileProvider install intent, and installed-version readback. Existing LIGHTHOUSE Greenfield runtime/data owners remain untouched.

Flow:

`CHECK -> VALIDATE MANIFEST -> COMPARE INSTALLED VERSION -> DOWNLOAD JOB -> VERIFY -> READY -> PERMISSION -> ANDROID INSTALLER -> RESUME -> READBACK -> RECONCILE -> CLEANUP`

## Test manifest

The app reads exactly one controlled test manifest URL over HTTPS. This is not the public release manifest. Manifest schema requires:

- `versionName`
- `versionCode`
- `packageName`
- `apkUrl`
- `sha256`
- `sizeBytes`
- `releaseNotes`

`apkUrl` must be a version-specific HTTPS URL, never a floating `latest` URL. Manifest `packageName` must equal `com.yggdrasil.lighthouse`.

For 2.0.1 the controlled manifest may describe versionCode 2001, which correctly results in no install. The later 2.0.2 round will update only this test manifest to a real immutable 2.0.2 APK URL and identity values.

## Version arbitration

Installed package versionCode is read from Android PackageManager, not a JavaScript constant.

- candidate versionCode <= installed versionCode: no install action.
- candidate versionCode > installed versionCode: show candidate version and update action.

Downgrades and same-version reinstallation are rejected by the updater before download/install.

## Download job

Android DownloadManager is the transport owner. Its download id and target metadata are persisted separately from LIGHTHOUSE business data so process death or app switching does not erase progress.

Visible updater states:

- `Downloading`
- `Paused`
- `Retrying`
- `Verifying`
- `Ready to install`
- `Installing`
- `Failed`

Percent and byte totals are shown only when reported by real download metadata. When total size is absent/unknown, the UI uses indeterminate progress and does not invent a percentage.

## Verification before install

Before creating an install intent, native verification must prove all of the following:

1. downloaded file SHA-256 equals manifest `sha256`;
2. APK archive packageName equals manifest and installed package name;
3. APK archive versionCode is greater than current installed versionCode and equals manifest versionCode;
4. APK signing certificate SHA-256 equals the certificate of the currently installed LIGHTHOUSE package.

Failure rejects the candidate, deletes the bad APK, persists `Failed`, and exposes a user-facing Thai reason.

## Android install boundary

Generated Android package must include `REQUEST_INSTALL_PACKAGES`.

Before install request:

- call `PackageManager.canRequestPackageInstalls()`;
- when false, launch `Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES` for `package:<current-package>` and preserve updater state;
- on resume, recheck permission and allow continuation.

APK is exposed through AndroidX `FileProvider` using a `content://` URI and temporary read permission. `file://` is forbidden. The updater starts the standard Android installer UI; silent install is forbidden.

## Readback and cleanup

When LIGHTHOUSE resumes, the controller asks native code for real installed `versionName`/`versionCode`.

- readback equals target versionCode: show `อัปเดตสำเร็จ` and delete the staged APK/state that is no longer needed.
- readback remains old versionCode after an install attempt: show that installation did not complete or was cancelled; never claim success.

Bad APKs and permanently cancelled staged downloads are deleted. Successful staged APKs are deleted after readback success.

## UI

Settings keeps its existing structure and gains real updater status under the `ตรวจอัปเดต` action. The updater status is separate from CHAT/MANUAL/runtime data state. Internal English lifecycle labels may exist in code/tests, while visible copy is user-facing Thai.

## Required tests

Automated coverage must include:

- Settings check-update button wiring;
- manifest validation;
- version comparison and downgrade/same-version rejection;
- download progress and unknown Content-Length behavior;
- SHA/package/signer verification contract;
- unknown-source permission flow;
- FileProvider `content://` install intent + temporary read permission;
- process interruption/resume with persisted download id/state;
- post-install PackageManager readback;
- error and retry behavior;
- Android package configuration includes REQUEST_INSTALL_PACKAGES and FileProvider;
- release version is 2.0.1 / 2001.

## Build evidence

Signed APK handoff must include:

- applicationId;
- versionName;
- versionCode;
- signer certificate SHA-256;
- APK SHA-256;
- source commit.

The 2.0.1 signer must be mechanically compared with the 2.0.0 canonical signer before handoff.

## Acceptance boundary

This round can close when 2.0.1 installs over 2.0.0, preserves existing data in owner device observation, Settings updater entry works truthfully, automated tests/build pass, and signed APK/evidence are delivered.

Do **not** declare updater end-to-end accepted until the later real-device path succeeds:

`2.0.1 -> check update -> discover 2.0.2 -> download -> verify -> Android confirmation -> reopen -> read 2.0.2 -> existing data still present`.
