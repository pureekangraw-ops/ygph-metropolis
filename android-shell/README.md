# LIGHTHOUSE Android Shell

Foundation proof for the LIGHTHOUSE Android hybrid shell.

## Build

GitHub Actions workflow: `LIGHTHOUSE APK Debug`

The workflow generates the native Android project from Capacitor configuration, runs `assembleDebug`, and uploads the artifact named `lighthouse-debug-apk`.

The ZIP artifact contains `app-debug.apk`, which can be downloaded from the successful workflow run and installed on an Android device that permits installation from that source.

## Scope

This phase only proves the Android shell and Debug APK build path. It does not include location features, maps, external service keys, deployment, or store publishing.
