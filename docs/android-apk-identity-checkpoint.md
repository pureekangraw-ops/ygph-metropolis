# LIGHTHOUSE APK Identity Continuity Checkpoint

Status: ACTIVE — no production deploy/store publication.

## Phase 0 — Reality Audit

### Current build chain

`checkout → Node/Java setup → android-shell npm install → android-shell tests → Patch 0.0.5 signing/verification with Patch key-3 → npx cap add android → npx cap sync android → ./gradlew assembleDebug → upload app-debug.apk`

### Boundary map

| Boundary | Evidence-backed status |
| --- | --- |
| Package ID | READY — `android-shell/capacitor.config.json` pins `com.yggdrasil.lighthouse` |
| APK signer injection before this work | BLOCKED — existing workflow used the Gradle debug signing path and did not inject an APK-specific stable signer |
| Historical signer continuity | BLOCKED — prior Android evidence recorded different debug certificate SHA-256 values (`4c40f8a6769bc27347d7676c5acc911b3bf263c0d3fc5e7be2aa758015e5e67d` and `57cf25fae4f49427f415da07af7c995b3398c23b7cc6d737de315c85002e1192`) |
| versionCode owner before this work | VERIFY/MISSING — no canonical source-controlled monotonic Android versionCode contract was present |
| Post-build APK identity verification | MISSING — artifact upload followed Gradle build without final-byte identity gate |
| Physical true in-place A→B proof | MISSING — prior proof included fresh install; no same-signer/higher-version pair was established |
| Patch signing | READY but separate — Patch key-3 is an independent trust domain and is not APK signing material |

Root cause: Android application identity continuity stopped being controlled at APK signing/versioning. Package ID was stable, but the distributable APK path depended on runner/debug signing identity and lacked an explicit monotonic version owner and final-byte verifier.

### Gap ownership

- Stable APK signer + custody → Phase 2
- Public identity/fingerprint invariant → Phase 1
- versionCode/versionName → Phase 3
- secret-backed CI signing → Phase 4
- post-build APK verification/publication gate → Phase 5
- controlled A/B artifacts + hardware upgrade → Phases 6–9
- negative gates → Phase 10
- release contract/regression gate → Phases 11–12
- native unblock → Phase 13

Phase 0 result: READY.

## Phase 2.1 — Canonical APK signer established early to unblock Phase 1

Owner-authorized custody created a dedicated APK signing keystore separate from Patch signing. The private material is not committed to this repository. Canonical public certificate SHA-256:

`aae608a7ddab0dbfccc1d35e817c5683b3c64b90ab581a4b74867db54e0351ce`

Custody location: `YGGDRASIL/02_OWNER_SOURCES/00_LIGHTHOUSE_KEY_MASTER` in owner Drive. Repository Actions secrets are configured under APK-specific names:

- `LIGHTHOUSE_APK_KEYSTORE_BASE64`
- `LIGHTHOUSE_APK_STORE_PASSWORD`
- `LIGHTHOUSE_APK_KEY_ALIAS`
- `LIGHTHOUSE_APK_KEY_PASSWORD`

Readback of the custodied keystore reproduced the same public certificate fingerprint before source pinning.

Phase 2.1 result: READY.
