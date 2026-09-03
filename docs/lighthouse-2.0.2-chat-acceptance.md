# LIGHTHOUSE 2.0.2 — CHAT Vertical Slice Acceptance

Candidate branch: `feat/lighthouse-2.0.2-chat-vertical-slice`

Current release-candidate source commit: `a0de8c1b0552c1d47055f727d28a30a38e01c0d5`

Canonical Android identity:
- package: `com.yggdrasil.lighthouse`
- versionName: `2.0.2`
- versionCode: `2002`
- signer required by identity contract: `aae608a7ddab0dbfccc1d35e817c5683b3c64b90ab581a4b74867db54e0351ce`

## Automated acceptance

| Requirement | Status | Evidence |
| --- | --- | --- |
| raw user message durable before interpretation | PASS | CHAT store/controller tests |
| duplicate submit token cannot duplicate message/work | PASS | CHAT store/controller tests |
| Quick Capture requires explicit confirmation before owner mutation | PASS | CHAT controller/vertical-slice tests |
| edit/cancel affect pending draft only | PASS | CHAT controller tests |
| success requires owner readback | PASS | CHAT controller + expense bridge tests |
| readback failure preserves committed domain execution truth | PASS | CHAT controller/retry tests |
| retry preserves message/work/operation identity | PASS | CHAT recovery + expense bridge tests |
| lifecycle events are durable and restart recovery is supported | PASS | CHAT recovery/events tests |
| product boot recovers CHAT work before first model projection/UI start | PASS | `chat-boot-recovery.test.mjs` |
| CHAT writes through existing Runtime/domain owner | PASS | production wiring tests |
| MANUAL/Outcome/Ledger read the same committed Ledger record | PASS | `chat-manual-integration.test.mjs` |
| conversation UI has real composer/actions and mobile viewport handling | PASS | CHAT UI behavior tests |
| Android app identity is 2.0.2 / 2002 and monotonic from 2.0.1 | PASS | Android packaging/identity tests |
| SETTINGS version comes from installed Android identity, not UI literal | PASS | version-authority test |
| owner-build artifact metadata names 2.0.2 | PASS | owner-build release metadata test |
| Greenfield safety gate | PASS | workflow run `33712952827` |
| NEW BASE Android packaging/identity gate | PASS | workflow run `33712952827` |
| staging provider-disabled health/closed-interpreter gate | PASS | workflow run `33712952827` |

## Release evidence still required

| Requirement | Status | What closes it |
| --- | --- | --- |
| signed 2.0.2 APK | PENDING OWNER BUILD | run `LIGHTHOUSE Owner Build` with an owner-selected immutable target commit |
| final APK package/version/signer verification | PENDING OWNER BUILD | `verify-apk-identity.mjs` evidence from signed artifact |
| final APK SHA-256 and byte size | PENDING OWNER BUILD | measured from the signed artifact |
| immutable 2.0.2 update manifest/provenance | PENDING APK EVIDENCE | publish only after real APK SHA-256/size/release URL exist |
| updater path 2.0.1 -> 2.0.2 on a real Android device | PENDING REAL DEVICE | install 2.0.1, update through controlled manifest, verify installed 2.0.2 identity/data continuity |
| CHAT end-to-end on a real Android device | PENDING REAL DEVICE | send -> draft -> confirm -> durable readback -> MANUAL visibility on device |

## Stop rule

Do not mark LIGHTHOUSE 2.0.2 COMPLETE or ACCEPTED until the owner-build artifact evidence and both real-device paths above are proven. Automated CI proof must not be substituted for real-device proof.
