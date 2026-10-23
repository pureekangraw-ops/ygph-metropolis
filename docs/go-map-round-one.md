# GOVIEW candidate in Observatory

GOVIEW is the map workspace inside the existing Observatory Android app. GO prepares and analyzes data; GOVIEW reads, displays and edits owner-approved local map data. The candidate reuses MapLibre, the existing command/receipt model and GeckoView app entry. It does not build another app, routing engine or backend.

Base main: `6aba0f5f7465af06e4202b8206614319ad1c69b1`. Work is in a separate scratch copy, not a Git worktree. Original checkout and user data are preserved. Draft PR: https://github.com/pureekangraw-ops/ygph-metropolis/pull/241 . No merge, production deployment, credential/signing changes, installation or new paid service.

## Source inventory and architecture

Existing source lives under `android-browser/app/src/main/java/com/big/gobrowser/outsideview/`: OutsideViewActivity, MapLibreOutsideRenderer, MapFeatureBuilder, MapModels, MapStateStore, MapCommandCodec/Executor, LocalMapPackageStore, ForegroundLocationController, LocationFixPolicy, MapStyleFactory and PinNavigation. GeckoBrowserActivity opens the native map; map imports do not execute through GeckoView or JavaScript. No repository AGENTS.md was found. Historical open map/browser PRs were inspected without merging them.

The existing map renderer and native editing primitives are retained. Platform SQLite is the chosen local database: it adds no dependency, preserves the existing version1 journal representation and uses transactions with SHA-256 readback. The Context constructor now selects this backend after the staged platform suite passed at c68eff5. The File-only constructor remains available for legacy/synthetic copies. This activation still requires its own full app CI run; no actual phone migration has occurred.

All store instances use one process-wide lock per canonical journal path. Command, import, screen and owner-edit read/modify/write transactions coordinate across Activity recreation. IO runs on the existing serialized worker; MapLibre and UI updates stay on main. An old Activity can finish accepted work after destruction, but cannot update its destroyed UI. Foreground refresh detects a later committed revision and reloads an idle recreated screen. This is not cross-process file locking; the app declares no separate map process.

## Local workspace and exchange

Open Observatory → GOVIEW → More → Import GeoJSON. The selected stream is bounded and parsed before a local file receipt is recorded. Receiving a file does not change pins. A preview lists IDs, names, coordinates, revision, added/duplicate counts and conflicts. Only explicit owner approval commits Update; intervening edits invalidate the preview. Cancelling/rotating before approval leaves pins unchanged. A committed import and a failed camera/style refresh have distinct outcomes; retrying the display cannot duplicate records.

Native gestures provide pan/zoom. Existing pin add/delete/focus plus label/coordinate/category editing, search and persistent layer visibility form the workspace. Imported text is native plain text, never HTML or executable code. The field-confirmation checkbox starts unchecked; changing either coordinate clears it. Imported authority strings cannot confer local VERIFIED evidence. Ordinary same-point edits preserve prior evidence; changed coordinates require fresh explicit field confirmation.

Five operations have separate evidence:

| Operation | Candidate behavior | Boundary |
| --- | --- | --- |
| Snapshot | Explicit selection, preview, Capture ID/version and local capture receipt; fsynced selected file | No preselected pins; excludes live GPS, history, viewport, raw properties, notes and unrelated pins |
| Upload | Narrow adapter ships BLOCKED/NOT_CONFIGURED | Synthetic in-memory tests are not live delivery |
| Download | Owner-selected file gets DOWNLOAD/FILE_RECEIVED; proposed transport adapter is separate | Reception never implies Update |
| Update | Validate, detect duplicates/conflicts, preview, owner approve, commit, verify readback, own receipt | No remote commit authority; uncertain post-commit readback is explicit |
| Local Storage | Atomic journal or staged transactional SQLite; local backup, rollback and explicit corrupt-primary recovery | No silent empty fallback or original deletion |

Snapshot file export is not a full backup. Native GeoJSON export preserves stable pin IDs, source properties/evidence and owner notes within the supported envelope, preflighting its own importer before output. Zones/grids/deletion intents are not part of this additive pin exchange. Existing field-confirmed records cannot be silently replaced by unverified research; conflicting IDs abort the batch. Editing existing conflicting records through a remote proposal is not implemented.

Generic stable identity is `geojson:v1:<SHA256(collection name)>:<feature id>`; default collection name is `owner-import`. Keep names/IDs stable between exchanges. Equal coordinates with different IDs remain separate. Exact duplicates add nothing. Renaming a collection creates a different namespace.

Limits: 1MiB UTF-8 input, depth16, 1–1000 Point features per import, finite numeric WGS84 coordinates, 2D Points only (altitude rejected), 128-character IDs, 256-character names, 8192-character properties, 10000 stored pins and 8Mi characters of stored pin text. Fractional/string/unsupported schema versions, nonobject properties except null, duplicate IDs, unsupported geometry and trailing data reject. Property keys are recursively canonicalized for stable duplicate comparison. This is a bounded 2D Point subset, not a generic lossless GeoJSON archive.

Receipts retain operation, ID, correlation, package/version, revision, counts, time and readback state. Update commits an unverified receipt first, reads back, then marks verification. Post-commit read failure returns COMMITTED_READBACK_UNAVAILABLE; it must not be replayed automatically or called unsaved. Display success requires the executor's actual persisted APPLIED receipt; a stale renderer confirmation returning PENDING cannot show saved. The 1000-receipt cap fails closed without evicting history. Disk failure may prevent an error receipt; UI must not claim it persisted.

## Database migration, backup and recovery

SQLite schema1 stores a small metadata row and ordered 256KiB BLOB chunks, avoiding oversized Android CursorWindow rows while retaining accepted capacity and UTF-8 text. Migration validates the old journal, fsyncs immutable `journal.pre-sqlite-v1.json`, retains `journal.json`, and commits schema/data transactionally. Unsupported schemas/checksum failures fail closed. An explicit migration marker distinguishes interrupted first initialization from initialized storage; missing, zero-byte or version0 initialized/recovered targets must never replay stale legacy data.

Backups contain the full journal in a versioned checksum envelope (32MiB maximum; no truncation). Restore previews a verified backup and first fsyncs a rollback copy of current state. Its STORAGE receipt is unverified until readback. Corrupt-primary recovery is a separate owner-confirmed action available from the storage-error status: validate backup independently, fingerprint primary against changes, preserve all original primary files, then recover. SQLite builds a new database and atomically switches a validated recovery pointer; the damaged database and sidecars remain untouched. Its custom corruption handler avoids Android's default database deletion. Invalid/interrupted recovery retains originals and backup. Older releases do not read the SQLite database or preserve new receipt fields; downgrading is not a supported rollback. Use the explicit verified backup/recovery path and retain the installed app/data until signing and upgrade compatibility are checked.

## GPS, basemap and privacy

Existing GPS and NETWORK_PROVIDER fallback is retained. Foreground GPS shows accuracy, last-fix time, stale (>30seconds), denied/revoked and unavailable states. A fix is an ephemeral overlay, not a saved pin. GPS/import recentering is explicit with disclosure: without a local PMTiles package the existing online tile provider may learn the viewed area. The map's existing default remains online=true with PMTiles preferred, otherwise OSM roads; no bundled PMTiles was found. Offline roads are not promised without a package. Android's network provider may use device/network services under existing settings.

Owner-approved background use adds a non-exported location foreground service and the normal FOREGROUND_SERVICE_LOCATION declaration. Start is explicit from the visible map after location and notification consent. The ongoing notification opens the app or stops the session. Only the latest fix lives in RAM: no route history, network transfer, boot start, background-location/all-files permission, battery exemption or automatic restart. Stop, task removal, permission/provider loss and service failure end the session. Switching back to ordinary location clears former session ownership, so a timer cannot overwrite a new foreground result.

Official requirements checked: [foreground-service start restrictions](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start), [location service type](https://developer.android.com/develop/background-work/services/fgs/service-types), [location permissions](https://developer.android.com/develop/sensors-and-location/location/permissions), [foreground-service changes](https://developer.android.com/develop/background-work/services/fgs/changes). Android16 job quotas do not authorize extra work; this service schedules no jobs. Notification consent is an app prerequisite to keep stop controls visible. Xiaomi may terminate background work; no indefinite survival, routing or voice-navigation claim is made.

## GO/PANTHEON contract boundary

Existing read rail: GO Brain `pantheon_observatory` → OwnerBridge `observatory_latest` → GET `/v1/observatory/latest?view=map&round=1`, optional exact device/capture selection. It returns untrusted read-only short-lived observations with capture/sequence/times; NO_FRESH_SNAPSHOT and DEVICE_SELECTION_REQUIRED are explicit. Device observation POST credentials are observe-only, not durable package-write authority. Generic snapshot validation does not establish location privacy; the local explicit allowlist does.

GoviewObservationRead validates the supported envelope using synthetic fixtures. GoviewSandboxContract proposes a file/sandbox envelope with exactly contractVersion=1, operation=propose-update, sourceCaptureId, baseVersion and package. It rejects unknown fields, stale base versions and captures not recorded locally. GoviewPackageExchange separates uploadSelected/downloadProposal; shipping transport returns BLOCKED. Test-only transport receipts are labeled SYNTHETIC. No live snapshot was read/sent, no PANTHEON/GO repository or deployed endpoint was changed, and no credential was added. Manual selected-file exchange is available; live durable delivery remains BLOCKED until contract and transmission authority are verified.

## Evidence and remaining gates

Local:48 Kotlin/JUnit tests and41 Node source/DOM tests pass. Tests cover malformed inputs, duplicate/conflict protection, provenance/export regressions, post-commit failures, shared transactions, separate phases and capture-bound proposals. Targeted Android16 API compilation uses a Robolectric API jar, not a local SDK/build/emulator. Local Gradle/SDK/adb are absent; no new local SDK license was accepted.

Private real-file test: SHA256 `f580b1a4a30ff950bf093779cddd23cd7dea2c5e733d121aa48343a0965268bb`,19043bytes,39 valid distinct IDs. Local parser/export/reimport/reload preserve all39 exact records, including two co-located IDs; duplicate reimport adds0. Source field-confirmation labels remain source claims. The recovered model-generated file is not verified station truth. Neither dataset nor coordinates are in this repository or evidence bundle.

Existing public PR CI (`.github/workflows/android-browser.yml`) builds SDK36 debug/ARM64 APKs, runs JVM/lint/instrumentation compilation, then API35 emulator tests on standard ubuntu-latest. Workflows are unchanged and contain no deployment. Head2df8f4f run39912785917 built successfully; emulator45/46 passed, failing an off-screen owner-pin selector. The corrected adapter-aware selection retains save/focus assertions. SQLite large multibyte migration/reopen/rollback/recovery and GPS notification controls passed there. Headc68eff5 adds empty/version0/absent initialized-target and ordinary-location-after-session regressions; run39915474207 completed SUCCESS (public run page verified after connector status lag). Both build and emulator passed; the recovered job log confirms all50 instrumentation tests completed successfully and the synthetic39-pin screenshot was collected. SQLite is activated in the subsequent candidate change, which must pass a new exact-head run before handoff.

Physical Xiaomi15T Android16 GPS, background battery behavior, permission flows, full B2E and signer-compatible upgrade remain UNKNOWN. Emulator service controls do not prove GNSS fixes. Test APKs have ephemeral signing; do not uninstall or clear the installed app to bypass incompatibility. Follow [handset acceptance](goview-handset-acceptance.md) and record CI, emulator and physical evidence separately. Selected file output is not Upload PASS; Download is not Update PASS.

Local-first motorcycle routing remains a documented follow-on requiring road/access/licensing, offline graph size and battery evaluation. PMTiles supplies display, not a routing graph. No new routing engine, paid service or public/multitenant platform is part of this candidate.
