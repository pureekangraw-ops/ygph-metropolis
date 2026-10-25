# Observatory Zone 3 integration candidate — source and delivery contract

This candidate assembles accepted work for one Android Browser/GOVIEW application. It does not reopen features, merge main, deploy Workers, activate credentials, or assert physical-device acceptance.

## Exact dependency ledger

| Component | Accepted tip |
|---|---|
| Remote main before integration | 734a8790948b8e6a1687c4bf32ae492b41d07030 |
| Browser PR259 (included by PR260) | c40beec69f1db5f60d4f6a84333f0e9e12c3ebe7 |
| Browser PR260 | 7be7d6d376d1b431901f5c6224b2d17a2c53c037 |
| Direct PR261 (included by PR262) | 6eedb462707945ed0e890598f413900fe3acdd82 |
| Typed GOVIEW PR262 | c484fcd974bb5da921480c87b1793532dd45a70a |
| Matching GO PR22 (separate repository/runtime) | d9eb7ef4ea06f758f05b3edbb1e2ca6e0a96a4d8 |

Ancestry checks confirm both stack relationships. The integration merges only PR260 and PR262 into an isolated branch from main; it does not cherry-pick their parent fixes again. Browser changes cover 10 files, map changes 23, with zero overlapping paths. Byte comparisons confirm every changed file equals its accepted tip; the combined source tree has no extra or missing changed files. This document is the only additional tracked change. Existing update/info UI, package identity, storage and build workflows are retained.

## Build and upgrade evidence boundary

Existing package/version: com.big.gobrowser, versionName 0.7.3, versionCode 19, minSdk26, targetSdk36. Repository history identifies 0.7.1/code17 and 0.7.2/code18; code19 advances both and introduces no downgrade. The installed device version and signer must still be read from its About/Updates public metadata. An already-installed code19 cannot be upgraded with an equal code19 under the existing updater; do not bypass its check.

Existing CI `observatory-release-unsigned.yml` builds a primary release, checks exact package/version, verifies it is unsigned, and emits APK SHA256, package badging, source SHA and run ID. That is the primary staged candidate, not an installable signed upgrade. No owner-compatible release-signing workflow was found. Private signing keys are neither requested nor accessed.

Existing Android CI additionally generates debug APKs and an ARM64 com.big.gobrowser.preview test variant signed with an ephemeral test certificate. A fresh test signer is not evidence of compatibility with an installed primary or older preview. The preview has independent storage and does not inherit owner maps/credentials. Its explicit source/run/hash and public signer report must accompany it. No uninstall, data clear, re-signing with a different owner identity, or install is performed here.

The existing updater checks package, increasing version, full APK digest and signer equality before explicit installer consent. A data-preserving primary upgrade remains blocked until the final APK is signed by an authorized signer compatible with the installed app, and the public certificate digests are compared. Metadata comparisons do not establish actual upgrade success.

## Validation and artifact provenance

Local integrated checks: npm test (3 web + 58 Android/DOM/typed-contract tests); remote-browser and goview-package-bridge suites (75 tests); GO full suite against this integrated Worker tree (123 tests, including actual adapter/Worker fixture). Some suites overlap; do not sum them as unique cases. Exact-head Android CI supplies full JVM, lint, instrumentation compile, debug/preview builds and synthetic emulator results; unsigned release CI supplies the release artifact. CI statuses and artifact hashes are recorded in the delivery checkpoint after completion, not assumed here.

APK BuildConfig embeds the exact integration commit and producer run ID. Downloaded artifacts must match the producer SHA256SUMS/provenance before being staged. Final delivery evidence records artifact ID/URL, exact APK bytes/hash, package/version, variant, signing state and public certificate (when present). No source changes should be added after selecting the artifact head without rebuilding.

## Owner Zone 3 B2E checklist — not executed

1. Preserve the current installation and owner data. Read package/version/source and public signer digest through existing About/Updates. Do not share credentials or private keys. Confirm candidate hash/provenance and compatible signing before any in-place install; never uninstall to bypass a mismatch.
2. After authorized compatible upgrade, confirm existing maps, notes and configuration remain, and About/Updates shows the candidate source/run. Confirm Browser and GOVIEW both open; the preview cannot prove primary-data migration.
3. In an authorized isolated Browser runtime with a synthetic site, open one exact owner tab, compare Live View with GO DOM/screenshot, invite read-only GO, delegate permitted click/type/scroll/navigation, and take over/revoke during waits. Verify blocked later reads/actions and explicit expiry recovery. Record redacted correlation IDs, not page bodies or signed URLs.
4. In authorized GOVIEW runtime, select only synthetic pins, upload the selected snapshot, read by exact ID/full hash, publish the bound proposal, download/preview without changing local pins, then explicitly approve Update. Verify local saved/readback receipt and reopen the map. Test wrong revision/hash and Studio 999999/1000000 boundaries. A device report is not independent external business proof.
5. Exercise Direct auth failure/restart/reconnect, interrupted transfer exact-GET recovery, and receipt-only retry without repeating Update. Confirm GeoJSON pins and Studio graph stores remain separate.
6. Record phone model/OS, package/version/source, signer comparison, each expected/observed result and remaining failures. CI emulator tests and synthetic local fixtures are separate evidence, not Xiaomi PASS.

## Runtime activation blockers — separate from APK delivery

No Worker deployments or GO runtime activation are included. Browser requires owner-controlled runtime configuration and distinct owner/GO authority plus actual GO tool/binding registration. Typed GOVIEW routes remain fail-closed without distinct upload/read/GO roles and the existing storage/binding setup; no tokens are provisioned. GO PR22 is source-compatible but not activated by building Android. Parent coordinates reviewed releases and any explicit runtime permissions; do not infer credential/payment authorization from draft publication approval.
