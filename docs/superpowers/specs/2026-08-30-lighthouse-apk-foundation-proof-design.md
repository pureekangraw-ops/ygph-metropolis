# LIGHTHOUSE APK Foundation Proof Design

## Goal
Create an isolated Android hybrid-shell proof for LIGHTHOUSE that produces an installable Debug APK artifact without changing the existing LIGHTHOUSE Intent, Multi-Group, or Runtime work in PR #84.

## Scope
- Create the shell under `android-shell/`.
- Use Capacitor 8.5.0 with app id `com.yggdrasil.lighthouse` and app name `LIGHTHOUSE`.
- Package a minimal local proof page from `android-shell/www/`.
- Generate the native Android project during CI, build `assembleDebug`, and upload `app-debug.apk` as a GitHub Actions artifact.
- Build from a separate branch based on `main`.

## Explicit non-scope
- No location features.
- No maps.
- No external service keys.
- No deployment or store publishing.
- No edits to Intent, Multi-Group, PAUSED/ASK/RESUME, or Runtime implementation from PR #84.

## Architecture
`android-shell/` is a self-contained Capacitor package. The native `android/` directory is generated ephemerally in GitHub Actions from `capacitor.config.json`, keeping the proof small and isolated. A dedicated workflow installs the pinned Capacitor packages, runs the foundation contract tests, generates/syncs Android, invokes Gradle `assembleDebug`, and uploads the resulting APK.

## Acceptance
1. Contract tests verify the package id, app name, web directory, pinned Capacitor versions, and artifact workflow.
2. GitHub Actions completes the Debug APK job on the APK branch/PR.
3. The workflow exposes `lighthouse-debug-apk` containing `app-debug.apk`.
4. Branch diff contains only APK-foundation files/docs/workflow and no PR #84 runtime files.
