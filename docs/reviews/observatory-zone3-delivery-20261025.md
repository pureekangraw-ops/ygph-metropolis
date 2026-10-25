# Observatory integration delivery checkpoint

Source: `072cb9fd2b1b50092942024e036c73d8af457659` — [draft PR263](https://github.com/pureekangraw-ops/ygph-metropolis/pull/263). Base main `734a8790948b8e6a1687c4bf32ae492b41d07030`. Accepted Browser tip `7be7d6d376d1b431901f5c6224b2d17a2c53c037` includes PR259; accepted GOVIEW tip `c484fcd974bb5da921480c87b1793532dd45a70a` includes PR261. Matching GO PR22: `d9eb7ef4ea06f758f05b3edbb1e2ca6e0a96a4d8`. All 33 accepted changed files match their stack tips; no source conflicts or omitted changes. Only the B2E delivery document was added.

Final-head CI: all five checks pass (Android/JVM/lint/instrumentation compilation/debug/preview build, synthetic emulator, unsigned release, web, Worker bundle). Runs: [Android/emulator](https://github.com/pureekangraw-ops/ygph-metropolis/actions/runs/40187381000), [unsigned release](https://github.com/pureekangraw-ops/ygph-metropolis/actions/runs/40187380987), [web/bundle](https://github.com/pureekangraw-ops/ygph-metropolis/actions/runs/40187380985).

Local exact-head evidence: npm 3+58, Worker suites75, paired GO123, focused JVM14; some suites overlap. Six synthetic upgrade-policy cases accept same-signer code17/18→19 and reject equal version, wrong signer, preview package, or wrong APK hash. These do not establish installed-device compatibility.

## Artifacts staged by CI

| Artifact | ID | ZIP/archive bytes | GitHub-reported archive digest (NOT APK digest) |
| --- | --- | ---: | --- |
| [YGG-Observatory-Release-UNSIGNED](https://github.com/pureekangraw-ops/ygph-metropolis/actions/runs/40187380987/artifacts/12597470062) | 12597470062 | 18,336,561 | `sha256:3617d7b4b0092ee041bde0469dd75628bc6a8ea1fbdeb079a226ebffcf60ee42` |
| [YGG-Observatory-Remote](https://github.com/pureekangraw-ops/ygph-metropolis/actions/runs/40187381000/artifacts/12597295562) | 12597295562 | 19,441,391 | `sha256:1e3c3bbbc425564f71f9aafc6d05fdbede73be231940c5b567a2a55799f257e8` |
| [YGG-Observatory-Remote-ARM64-Preview](https://github.com/pureekangraw-ops/ygph-metropolis/actions/runs/40187381000/artifacts/12596491255) | 12596491255 | 7,601,943 | `sha256:6c6f519e9d5b5f9c37991f19558ae274bf170554ab976de9bf771165f9b6d9eb` |

Primary: `com.big.gobrowser`, release `0.7.3`, code19, minSDK26, targetSDK36; unsigned by the successful producer workflow assertion. Code19 advances repository code17/18. Existing About/Updates and its signer/package/version/hash guards are retained unchanged. No owner-compatible release-signing workflow was found or invoked.

Preview: `com.big.gobrowser.preview`, `0.7.3-preview-side-by-side`, code19, ARM64, ephemeral CI test signing. It does not inherit primary app storage and is not a primary upgrade. Existing CI also emits a primary-package debug build; do not install it over the owner's app without signer compatibility evidence.

## Unresolved delivery and activation gates

- **Denied:** download release artifact12597470062 from run40187380987 returned HTTP Forbidden. No binary was saved; no retry/alternate route or credential change. Exact APK size/hash and public certificate reports remain unavailable locally. GitHub archive metadata above must not be substituted for APK metadata.
- **Denied:** fetching logs for run40187380987 returned HTTP Forbidden. No alternate retrieval attempted. Producer success and workflow source establish the package/signing checks; they are not an independent byte inspection.
- **Pending:** compatible owner signing, installed public-signer/version comparison, full APK digest verification and explicit device install. No private signing keys were read/copied; no primary signing, uninstall or data clear occurred.
- **Not activated:** Browser/GOVIEW Worker deployments, typed upload/read/GO roles, storage/service bindings and GO runtime registration. Credentials/production operations remain outside this build task. Parent coordinates runtime authority separately.
- **Not executed:** physical Xiaomi acceptance and live owner+GO B2E. Synthetic emulator pass is separate evidence.

The tracked B2E checklist is `docs/reviews/observatory-zone3-candidate-20261025.md` in PR263: retain owner data, verify candidate/source/signer, Browser same-tab invitation/control/revoke/expiry, selected synthetic map transfer→preview→explicit Update→local receipt→reopen, and restart/uncertain-transfer recovery. No main merge or Worker deploy occurred.

## Read-only signing availability assessment

Inspection scope: the candidate workflow/source/docs at artifact source `072cb9fd2b1b50092942024e036c73d8af457659`, registered Observatory workflow metadata, and PR248 metadata. No secret-value inventory, private key, external Drive key, denied artifact or alternate download route was inspected. The subsequent publication of this document does not change APK/runtime source; the artifact/source pin above remains authoritative.

| Path | Availability, inputs and provenance |
| --- | --- |
| Owner-compatible primary CI signing | **Not configured in the inspected source.** app/build.gradle.kts has no release signingConfig/signingConfigs. Neither relevant workflow references any signing secret name. No owner-signing input/secret-name contract exists here; do not invent names or infer that an unused repository secret exists/does not exist. |
| Observatory Release APK (unsigned), workflow394813901 | Active; .github/workflows/observatory-release-unsigned.yml. workflow_dispatch has no custom inputs. It uses source SHA and run ID from GitHub context; it builds release, verifies package/version and rejects a successfully signed output. Required owner signing secrets: none, because it does not sign. |
| Android Browser Foundation, workflow376127105 | Active; .github/workflows/android-browser.yml. No workflow_dispatch input contract and no signing-secret references. Standard debug signing plus generated ephemeral ARM64 test keystore under RUNNER_TEMP, alias observatorydebug. This is test signing, not owner-compatible release signing. No test/private key was read or copied by this assessment. |
| Owner-kept external signing key | **Not inspected.** [PR248](https://github.com/pureekangraw-ops/ygph-metropolis/pull/248), head22a8c6744b1acd5fcec51dfce46cb178d12aa8c0, describes an unsigned deliverable for owner-managed signing with a dedicated persistent key held privately outside GitHub. Its only changed file is the unsigned workflow. This statement does not establish key availability, certificate identity, installed-app compatibility or a CI signing integration. |
| Installed primary certificate and current candidate certificates | **Not inspected/unknown.** No installed primary public signer fingerprint is recorded in the inspected evidence. Current artifact/log retrieval is Forbidden. These are independent limitations, not evidence that signing material does not exist. |

Historical public reference only: docs/goview-runtime-handoff-20261024.md records preview signer SHA256 `4c754e909632050b3412306334c95e61c341f6e6518556e5b19698e316426be0`, reported by producer run40050416858 for artifact12543336460, package com.big.gobrowser.preview, code17/0.7.1-preview-side-by-side. That is an ephemeral test certificate; the document explicitly says independent artifact download was Forbidden. It must not be used as the owner-primary reference certificate or assumed to match this new candidate/installed device.

## Current installed version remains uncertain

The owner may already have 0.7.3/code19. This lane did not read phone package metadata. Existing UpdatePolicy.verify and AppMaintenanceActivity require candidate versionCode strictly greater than the installed version: code19→code19 is rejected even if the signing certificate matches. Repository code17/18 history proves only that code19 is higher than those historical builds. It does not prove this candidate is newer than the installed app. A later version decision requires the actual installed public package/version/source metadata; no version bump or downgrade bypass is performed in this documentation task.

## Blocker classification and next evidence

- **Source configuration blocker (confirmed):** no owner-compatible primary CI signing path is configured in the inspected source. The primary candidate is unsigned.
- **Executor access blocker (confirmed):** release artifact12597470062 and run40187380987 logs returned Forbidden. No alternate route or retry was used. APK-level checksum/size and current public signer verification remain incomplete despite successful producer CI.
- **Not inspected:** externally held owner key/certificate, installed primary certificate, installed current version, and any out-of-repository signing process. Do not label these nonexistent or compatible.
- **Still separate:** owner-authorized compatible signing and public-certificate comparison; approved delivery/byte verification; real installation without uninstall/data clear; live runtime activation and physical acceptance. No credentials, payment authority, signing operation or deployment is inferred from publication approval.

This is a documentation-only update. Existing PR workflow triggers may run automatically because Android Browser Foundation listens to every pull_request change; no workflow_dispatch, manual extra build, signing invocation or workflow change was requested by this assessment. CI/artifact claims above refer specifically to source072cb9fd, not an automatically generated docs-head artifact.
