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

The repository currently does not contain `android/` or `gradlew`. The next
owner-controlled step is to run `npx cap add android` once the Android SDK and
Gradle Wrapper policy are available, then commit the generated Android project
and wrapper so CI can build reproducibly.

## Identity

- App name: PRISM
- Application ID: `com.yggdrasil.prism`
- Version: `1.0.0-prism.1` (version code 1024)
- Map mode: local-first; no background location is enabled by this lane
