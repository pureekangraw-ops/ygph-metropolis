# Observatory continuation — 2026-10-26

## Source and dependency decisions

Owner request authorizes source fixes, unsigned builds and scoped tests, including independent review; it does not itself release merge/deploy, credentials, billing or signing guards. Main remains `734a8790948b8e6a1687c4bf32ae492b41d07030`. This candidate continues PR263 `2f81d39c344cb9fddfc2cfb3c4aa5900d4f59fdd`, which already includes Browser PR259/260 and GOVIEW PR261/262. No AGENTS.md exists in the candidate recursive tree. Workspace checkouts were stale; git fetch failed because the configured proxy refused connection. Candidate files were exported through native GitHub at exact blob SHAs, with untouched bytes checked against the recursive tree. No legacy GeckoView or PANTHEON architecture was restored.

Dependency order: reconcile current source/checkpoints → Browser authorization and Direct regressions → adaptive native UI → paired GO typed integration on active PR25 → independent review → exact-head Android build/emulator → artifact provenance/hash → Factory signing handoff → separate physical-device acceptance. Work is split by files; Factory source is read-only in this lane.

## Requirement coverage and current evidence

| Area | Current implementation/evidence | Remaining boundary |
|---|---|---|
| Browser ordinary click | policy.mjs and actual DOM control classification in worker.mjs; focus/non-submit and bounded GET search submit allowed; sensitive selectors/password/file/reset/important submit denied | Real invited tab and new deployed Worker |
| Invitation, view/control, takeover/revoke | accessVersion binds reads/actions/queued jobs to grant generation; latest-state check prevents an awaited grant overwriting newer revoke; takeover and site revoke bypass provider preflight BUSY | Already-dispatched provider effects cannot be recalled |
| Close, pending/UNKNOWN | Close revokes first and reports BUSY/STOP_JOB_BEFORE_CLOSING until explicit retry finishes actual cleanup; durable DISPATCHING/UNKNOWN no replay preserved | Owner must retry close after work stops; no false CLOSED |
| Expiry/reconnect/diagnostics | PR259/260 retained; exact target, expiry cleanup, HTTP/correlation and error parsing preserved | Production session recovery and owner phone |
| Scroll/duplicate chrome | Existing RemoteSwipeScroll and hideDuplicateChrome retained; Issue249 comment6384535018 records owner acceptance on 0.7.2 | New candidate handset acceptance is separate |
| GOVIEW local state | Existing pin/note/zone/layer/GPS/save/reopen and journal contracts retained; pin tap now opens saved note without writing | Physical GPS, OS lifecycle and saved owner data |
| GO Direct | Existing validated connection and write-ahead guard retained; HTTP403 now keeps guard like401 across restart; explicit reconnect required | Kotlin tests/build via CI; actual rejected credentials not used |
| Both typed formats | PR262 exact selected GeoJSON vs Studio contracts retained, independent stores/preview/owner Update/receipt | Runtime activation and GO→Android→GO real readback |
| GO tools | Separate additive GO candidate on latest PR25, preserving Hub/provider/Factory files; typed read/publish/receipt and bounded public/internal MCP transport | Deployed Hub transport, catalog exposure and service binding not proven |
| Places/routing | Existing Studio shortest-path graph is local design routing; OSM raster is a basemap | No verified real Places or external routing provider. Do not advertise either as delivered; provider choice/activation remains separate |
| Adaptive UI | Owner plan Brain48db96d7 revision1 (2026-10-26T02:32:31.577Z): grouped tasks, live canvas, primary safety, separate Studio; commands scroll independently and reflow by measured dp; all21 map actions retained | Emulator tests first; actual split-screen/IME/font/insets on physical device later |

## Tests and review

Browser `node --test --test-isolation=none remote-browser/tests/*.test.mjs`:89 passed. Independent reviewer reproduced and required fixes for stale grant/revoke races; final independent89 passed. Map/DOM/typed bridge combined61 passed. Paired GO suite101 passed with GOVIEW_CONTRACT_ROOT selecting this candidate's actual Worker/adapter, zero skips. Reviewer found both public MCP and source app MCP size mismatches; both fixed with exact1MiB escaped payload and deny/overflow regressions. Existing suites overlap; counts must not be added into one total. Android/Kotlin build and runtime evidence must be taken from the exact published head; no local SDK/compiler exists here. New BrowserRequestEpoch unit tests and adaptive/menu/pin-note instrumentation are included, not yet claimed executed.

Live read-only Browser status at2026-10-26T11:10:05Z: CONNECTED but LOCKED/OWNER_INVITATION_REQUIRED, no sessionId and no observe grant. No page/action was attempted. Current host exposes no GOVIEW tools. Neither connected status nor fixture results prove live activation.

## Existing APK and new unsigned candidate

Existing0.7.4/code20 source2f81d39, unsigned run40188657718/artifact12596477876: unsigned44,255,303bytes SHA256`f07e6bd7d3dcf141db0c9555f7908b686b5aafb3d628a9c471ff0017567de32c`. Factory PR53 document `docs/observatory-074-real-owner-signing-proof-20261026.md` records signed44,263,995bytes SHA256`753dbdc527d28cc4ccad3195606ecf5d94dc9350bfd13152d29b55d39ba83339`, official v2/v3 and zipalign verification, historical public certificate SHA256`31bf91b925558771a03bdc81d258cd4d1024a3bb48702bb08534f216e88d0624`. This lane read the public source receipt, not private keys or signed bytes. Physical installation/data acceptance remains unproven.

New fixes intentionally advance to0.7.5/code21: the strict updater rejects equal20 and the signed074 candidate already exists. Package remains com.big.gobrowser. No signer/key/migration/storage permission changes; no private-key operations, uninstall, data clearing, release unlock or live deploy. Existing unsigned release workflow must publish exact new source SHA/run/APK hash. Never relabel074 bytes as the new build. Factory remains sole Assembly/Signing executor for any new signed receipt.

## Release/rollback and physical acceptance

Until existing merge/deploy authorization is positively established, keep the candidate draft and preserve production/main. Rollback before release is to retain the existing deployed Worker/app and unsigned/signed074 artifacts. After an installed code21, do not downgrade or uninstall to restore code20; use a compatible higher-version corrective build with the existing signer and retained data. Browser Worker rollback must preserve state schema/default accessVersion0 and exact current binding topology; no credential changes.

Handset acceptance: first independently inspect installed package/version/certificate and compare with the Factory signed receipt; install in-place only after compatibility; retain saved maps/notes/layers. Then verify invited Browser read→grant→ordinary click/type/scroll→takeover→revoke→regrant rejects old commands→close/recovery, and both map formats selected upload→GO exact digest→proposal→Android preview(no write)→owner Update→durable save→restart/reopen→device receipt→GO readback. GPS grant/deny/revoke/stale/continuous notification stop, real keyboard/split resize/font2/insets, and menu/pin-note usability need actual phone evidence. Emulator or CI cannot close these gates.
