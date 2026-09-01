# LIGHTHOUSE Full-APK Updater Design

## Goal
Restore the proven direct application startup path, retain the newly built snapshot/hash work only as release evidence, and add a non-blocking in-app full-APK updater under Settings.

## Locked runtime rule
The current installed app must open and remain usable without network, updater metadata, Service Worker, or update infrastructure. `index.html` loads `ui/master-input.mjs` and `app.mjs` directly. Update logic is never in the critical startup path.

## Existing repair work retained
- `sw.js` is still packaged, but it is not an application bootstrap dependency.
- `styles/` is packaged so every shell asset named by `sw.js` exists.
- display identity remains LIGHTHOUSE through the existing display-only identity code; storage/import compatibility identifiers are unchanged.
- bounded typo aliases remain explicit; no fuzzy correction.
- effective-base manifest, per-file hashes, aggregate hash, immutable snapshot code, and patch-chain metadata remain available as build/release evidence. They no longer choose runtime application files.

## Update UI
Settings gains a dedicated `การอัปเดตแอป` panel with:
- current version
- latest version
- APK size
- release notes
- `ตรวจหาอัปเดต`
- `ดาวน์โหลดและติดตั้ง`
- download progress and cancel
- clear failure/status text

The updater runs only after explicit user action in Settings.

## Update metadata
The updater reads one HTTPS JSON document with this contract:

```json
{
  "versionName": "1.0.4",
  "versionCode": 1005,
  "apkUrl": "https://example.invalid/LIGHTHOUSE-1.0.4.apk",
  "sha256": "64-lowercase-hex",
  "required": false,
  "releaseNotes": "แก้หน้า Login และระบบเริ่มต้น"
}
```

Metadata is untrusted input. HTTPS is required and every field is validated before download.

## Verification gates
Before Android installer is opened, all must pass:
1. downloaded SHA-256 equals metadata
2. APK package is `com.yggdrasil.lighthouse`
3. APK versionCode is greater than installed versionCode
4. APK signer SHA-256 equals the canonical LIGHTHOUSE signer `AA:E6:08:A7:DD:AB:0D:BF:CC:C1:D3:5E:81:7C:56:83:B3:C6:4B:90:AB:58:1A:4B:74:86:7D:B5:4E:03:51:CE`
5. encrypted backup succeeds immediately before install handoff

Any failure stops the update without affecting normal app use.

## Android bridge
A small Capacitor Android bridge owns native-only capabilities:
- report installed package/version/versionCode
- report whether unknown-app install permission is granted
- open Android unknown-app-source settings when needed
- inspect a downloaded APK package/version/signing certificate
- open the Android package installer for the verified APK

The generated Android project is still produced during CI, so the bridge and manifest/provider changes are materialized by deterministic repository tooling before Gradle build. `REQUEST_INSTALL_PACKAGES` is declared. User confirmation remains owned by Android; LIGHTHOUSE never silently installs an APK.

## Download and backup
Web UI owns metadata fetch, streaming download/progress, cancellation, and SHA-256. Native bridge owns APK package/signature inspection and installer handoff. The existing encrypted backup path remains Truth owner; updater requests a real backup and proceeds only after success/readback.

## Failure behavior
- no network / metadata server down: Settings shows failure; app remains usable
- malformed metadata: reject
- cancelled download: remove staged file and remain on current version
- hash/package/version/signer mismatch: reject and remove staged file
- backup failure: reject install
- unknown-source permission denied: keep downloaded verified APK staged and show action to open Android settings
- installer cancelled: current app remains installed and usable

## Release evidence
Each full APK release should emit:
- APK
- SHA-256
- package/version/versionCode/signer evidence
- effective-base manifest and aggregate hash
- release metadata JSON

Snapshot/effective-state modules stay as audit/release evidence only; no remote JS runtime patch activation is part of this design.

## Pass condition
A signed APK built from the proven existing-app lineage installs over the current LIGHTHOUSE, opens Login normally without network, preserves existing data, exposes Settings → การอัปเดตแอป, rejects invalid update artifacts, and hands a valid higher-version same-signer APK to Android installer only after backup succeeds.
