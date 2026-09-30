# PRISM APK lane

This Android shell packages the existing METROPOLIS runtime as **PRISM**.
The runtime preserves the GO Hub / Work / LIGHT contracts while changing the
mobile application identity to `com.yggdrasil.prism`.

## Prepare the web package

```bash
npm install
npm run app:stage-prism
```

The staging step writes the ignored `android-shell/www/` bundle and applies the
PRISM app branding to the mobile entrypoint. It does not rename internal
compatibility paths such as `lighthouse-next/`; those paths remain stable for
runtime imports and evidence continuity.

## Android build gate

```bash
npm run android:prepare
cd android
./gradlew assembleDebug
```

The repository intentionally does not commit the generated `android/` tree.
The PR safety gate creates it with `npx cap add android`, syncs the PRISM web
bundle, applies the native map/security overlays, and builds with the generated
Gradle Wrapper. A physical-device acceptance pass is still required after CI.

## Identity

- App name: PRISM
- Application ID: `com.yggdrasil.prism`
- Version: `1.0.0-prism.1` (version code 1023)
- Map mode: local-first; no background location is enabled by this lane
