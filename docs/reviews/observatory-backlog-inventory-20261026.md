# Observatory delivery and backlog audit — 2026-10-26

Read-only audit by delivery subagent. Source facts below were read through the native GitHub connector. This report does not authorize a merge, deployment, signing operation or installation. It audits the existing candidate; root owns subsequent fixes and new exact-head CI evidence.

## Current source and delivery identity

- Metro main: `734a8790948b8e6a1687c4bf32ae492b41d07030` (root independently read branch).
- Existing integrated draft [PR263](https://github.com/pureekangraw-ops/ygph-metropolis/pull/263): `2f81d39c344cb9fddfc2cfb3c4aa5900d4f59fdd`, primary `com.big.gobrowser`, 0.7.4/code20.
- Integrated Browser stack: [259](https://github.com/pureekangraw-ops/ygph-metropolis/pull/259) `c40beec69f1db5f60d4f6a84333f0e9e12c3ebe7` → [260](https://github.com/pureekangraw-ops/ygph-metropolis/pull/260) `7be7d6d376d1b431901f5c6224b2d17a2c53c037`.
- Integrated GOVIEW stack: [261](https://github.com/pureekangraw-ops/ygph-metropolis/pull/261) `6eedb462707945ed0e890598f413900fe3acdd82` → [262](https://github.com/pureekangraw-ops/ygph-metropolis/pull/262) `c484fcd974bb5da921480c87b1793532dd45a70a`.
- Existing 0.7.4 unsigned producer: run `40188657718`, artifact `12596477876`; APK bytes 44,255,303, SHA256 `f07e6bd7d3dcf141db0c9555f7908b686b5aafb3d628a9c471ff0017567de32c`.
- Root retrieved Factory public signing proof: signed APK 44,263,995 bytes, SHA256 `753dbdc527d28cc4ccad3195606ecf5d94dc9350bfd13152d29b55d39ba83339`, expected public signer SHA256 `31bf91b925558771a03bdc81d258cd4d1024a3bb48702bb08534f216e88d0624`; official v2/v3 and alignment checks reported PASS, all160 uncompressed payload entries unchanged. This audit did not download or reverify APK bytes.
- [Factory53](https://github.com/pureekangraw-ops/Factory-District/pull/53) read at `bb3fb4f2cf9eaa064b5eebac3629c3623002b8da`, draft/unmerged. Source executor pins existing source/run/hash/package/version/public certificate, uses official zipalign/keytool/apksigner, private inherited unlock pipes and output refusal/cleanup. Root read newer public signing proof than the PR body's older not-signed checkpoint. Factory remains owner of Assembly/Signing; no Factory source changed here.
- New fixes require a distinct candidate and fresh provenance; old code20 artifacts must not be relabeled. Root selected 0.7.5/code21 for the follow-up. Preserve primary identity, expected historical signer and increasing-version guard.

## All open Metro PRs (21 at initial read time; PR264 is the current continuation)

| PR | Head | Classification and next action |
|---|---|---|
|263|2f81d39c|Current baseline integration; retain exact historical APK evidence. Root's follow-up source/CI supersedes it for new fixes.|
|262|c484fcd9|Included in263; typed selected transfer, separate GeoJSON/Studio. Do not duplicate. Runtime activation and handset proof remain separate.|
|261|6eedb462|Included in263; durable Direct reconnect guard. Follow-up403 fix belongs on current candidate.|
|260|7be7d6d3|Included in263; Browser read revocation and response diagnostics.|
|259|c40beec6|Parent of260 and included263; Browser expiry/revoke guards.|
|256|0a7ed9d2|Earlier Direct validation/401 work preserved by current main/candidate; do not remerge old branch.|
|253|d502efad|Living Map blueprint/reference; real Places/routing provider not implemented. Keep explicit missing status.|
|251|e0df88ae|Studio safe area/zoom dock already present in candidate source (`PhoneLayout.fitSystemBars(host)` and reserved mobile dock). Old branch conflicts; do not merge. Physical Issue249 proof pending.|
|248|22a8c674|Old unsigned-release workflow branch; superseded by current workflow/candidate and0.7.4 artifact.|
|244|34481fa8|Bounded emulator focus diagnostics; draft, conflicts. Reuse only needed test diagnostics after checking current CI; not a new app architecture or a fix for focus loss.|
|237|defe44d7|Historical manual PANTHEON capture stack. Preserve owner-manual sharing intent, not obsolete transport. Do not reintroduce.|
|236|779890d1|Historical Gecko lifecycle/passkey stack; current Browser is remote Cloudflare. Do not restore Gecko/native permission model.|
|235|07db6f86|Historical PANTHEON direct/automatic5s sync, superseded by owner manual sharing and current Hub/Browser decisions. Do not merge.|
|231|3f5617c5|Historical documentation ownership clarification; useful principle, stale Gecko/Metropolis wording must be updated against current sources rather than merge old README.|
|230|fbe4673b|Historical Metropolis Hub Work Inbox, outside current Browser/GOVIEW runtime boundary. Do not revive old authority/registry.|
|225|ece962e5|Historical auto-start sharing; superseded by manual-sharing owner decision and newer runtime. Do not merge.|
|222|b5e6e89|Historical pairing readback diagnosis; current transport/credential owners differ. Retain readback principle, do not merge obsolete pairing path.|
|218|381a6826|Historical Gecko startup regression and CI versions; current launcher differs. Any CI refresh must be evaluated independently, not merge branch.|
|215|666f365f|Historical GeckoView/Metropolis architecture replaced by remote Browser; do not merge.|
|214|2bb5444c|Historical full-app/Metropolis Station stack; native map capabilities evolved in current app, old browser/rail replaced. Do not merge entire stack.|
|213|cc85fcd2|Historical Outside View foundation; current GOVIEW retains evolved local map/journal concepts. Do not remerge foundation.|

All PR links use `https://github.com/pureekangraw-ops/ygph-metropolis/pull/<number>`. Classification does not close or edit them. Historical/superseded means architectural work must not be revived; it does not assert every old line is in main.

## Open issues

- [249](https://github.com/pureekangraw-ops/ygph-metropolis/issues/249): verified owner-phone scroll failure and duplicate chrome on0.7.1/source22a8c674/run40061344938; also Studio insets/zoom concerns. Later comment6384535018 records owner scroll and GO read/scroll acceptance on0.7.2; retain that valid evidence. Source fixes exist in the integrated candidate, while swipe/tap/chrome/Studio acceptance must be repeated for the new compatible APK. CI/emulator cannot close handset evidence.
- [240](https://github.com/pureekangraw-ops/ygph-metropolis/issues/240): archive of earlier LIGHTHOUSE/GO Client/shared queue; historical, outside current Observatory implementation. Do not revive archived work.

## Authorization and release boundary

PR263 explicitly says keep draft, no main merge/deploy/credentials/signing/installation/uninstall/data clearing. Factory53 remains draft and documents separate destination/private-slot approval. The latest user authorizes source/build/internal tests and says follow existing Merge/Deploy authorization if it exists. No positive blanket Merge/Deploy authorization was established by this audit. Repository admin/push permissions are capability, not authorization. Root must keep release guards and prepare a concrete final candidate before requesting only genuinely missing final authorization.

No private key/password/recovery note was accessed or copied by this audit. Do not create a signer, uninstall, clear app data, disable TLS or bypass proxy/network policy. Verify actual installed package/version/public certificate before compatible `adb install -r`/owner installer path.

## Proof still required

1. New final-head build/CI/artifact hash/provenance, after all source fixes and independent-review corrections. Root is collecting this; old263 green CI does not prove the follow-up.
2. Shared Browser invite/read vs control, grant, owner takeover, revoke→regrant stale-command prevention, close and expiry/recovery; source fixtures and remote runtime must remain distinct.
3. Actual GO tool exposure/current Hub topology plus exact typed transfer read/publish/receipt readback. GO22/23 are not current-main deployment proof; preserve active newer Hub work.
4. Android selected capture→upload→GO read→bound proposal→preview→owner Update→durable receipt→GO readback, both map formats, save/reopen, no duplicate apply.
5. Physical handset installed signer/version, in-place upgrade and saved Browser/GOVIEW data continuity; GPS permission/notification stop; viewport/IME/font/insets, real buttons/menus/content gestures.
6. Real Places/routing provider choice/configuration and its actual network proof remain absent; map tiles and synthetic fixtures are not those services. Do not add spending/provider rights without authority.

## Audit limitations

Native PR metadata/source was readable. Local checkouts were stale and git fetch failed because the inherited proxy was unreachable. A later parallel native-tool batch (CI/artifact/Brain authorization read) stalled and was aborted; it supplied no result and must not be described as denied or successful. Parent already has direct exact-head CI/source and public signing-proof reads. This report records what is verified versus inherited parent evidence explicitly; it does not claim physical-device acceptance or release completion.
