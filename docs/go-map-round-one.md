# GOVIEW round-one candidate

GOVIEW is the owned map system inside the existing Observatory app. GO prepares,
analyzes and updates map data; GOVIEW reads, renders and supports interaction with
that data while keeping its primary storage on the device. This name does not
introduce a new graphics engine, application, database or backend. Existing
MapLibre implementation and internal APIs remain unchanged.

Base main: `6aba0f5f7465af06e4202b8206614319ad1c69b1` (read back from GitHub 2026-10-23).
Separate scratch copy; original checkout and all original tracked files preserved. No worktree, new app, database, backend, dependency, manifest change, destructive migration, workflow dispatch, deployment, or paid service. Authorized Draft PR #241 now runs the existing PR-triggered validation; nothing is merged or deployed.

## Existing implementation inspected

`android-browser/app/src/main/java/com/big/gobrowser/outsideview/`:
OutsideViewActivity, MapLibreOutsideRenderer, MapFeatureBuilder, MapModels,
MapStateStore, MapCommandCodec/Executor, LocalMapPackageStore,
ForegroundLocationController, LocationFixPolicy, MapStyleFactory, PinNavigation.
Browser entry: GeckoBrowserActivity opens OutsideViewActivity. GeckoBrowserEngine
owns GeckoView sessions and existing tab storage. Native map data never needs to
pass through GeckoView, HTML, or JavaScript.

No AGENTS.md found. Open PRs include stacked historical map/browser changes
(#213–215, #235–237) and unrelated fixes. They were inspected read-only and not
merged into this candidate; current main already contains the native map stack.

## Candidate behavior

Open existing Observatory → map → More → Import GeoJSON. Android's existing
OPEN_DOCUMENT pattern reads the selected stream on the existing worker. Parse
all features before one journal transaction; then reload the existing renderer
and fit the imported coordinates. Search name/properties through More → Search.
Pin source properties are available in the pin menu as native plain text.
More → Layers toggles zones/grids/pins and retains preferences across restart.
Existing MapLibre gestures provide pan/zoom.

Uses the original `outside-view/journal.json`, journal version 1 and Pin codec.
No records or fields are migrated. Imports carry UNKNOWN coordinate evidence;
field-confirmed/app-confirmed/candidate labels remain original source properties,
not app verification. Existing remote command evidence checks remain unchanged.

Stable identity is `geojson:v1:<SHA256(collection name)>:<feature id>`.
Collection `name` defaults to `owner-import`; feature `id` (or properties.id)
is mandatory. Keep collection name and feature IDs stable for future exchanges.
Exact duplicates add nothing; same coordinate with different IDs stays separate.
Any conflicting ID aborts the entire batch without overwriting existing records.
Updates/deletions need a future explicit conflict-review flow. Renaming a dataset
creates a different namespace; do not rename during an update exchange.

Limits: 1 MiB UTF-8 input, depth 16, 1–1000 Point features/import, numeric finite
WGS84 coordinates, 2D-only Point coordinates (altitude rejected), 128-character IDs, 256-character
names, 8192-character properties, 10,000 total stored pins and 8 Mi characters
of stored pin text. Unsupported geometry, duplicate IDs, trailing JSON and
unsupported schemaVersion fail. The optional schemaVersion must be numeric and exactly 1 (not a fractional or string value). Properties must be an object or null; property object keys are recursively canonicalized for stable reimport comparison. This is a 2D Point import subset, not a generic lossless GeoJSON archive. Persisted
unknown properties survive as JSON text in Pin.note; separate owner notes remain.
Journal commits fsync and atomically replace the original file. Corrupt journals
now block replacement rather than being overwritten with an empty fallback.

GPS remains foreground-only, with accuracy, local last-fix date/time, stale
(after 30 seconds), denied/revoked and unavailable states. Device fixes remain
an ephemeral renderer overlay and never become saved pins. Original GPS and NETWORK_PROVIDER availability/fallback behavior is preserved;
there are no new permissions or provider services. Original map reload default
remains online=true: existing PMTiles is preferred; otherwise existing OSM road
tiles load. No bundled PMTiles was found in this repository/workspace; actual
phone package availability is UNKNOWN. New users see OSM roads with connectivity,
not an offline blank canvas. Explicit existing offline mode still works.
GPS recenter now asks before changing the viewport and discloses that without
PMTiles the existing tile provider may learn that area. Cancel keeps the viewport;
confirm is an explicit user action. The current fix remains an ephemeral overlay.
The existing OS network provider may use device/network location services under
existing settings; this candidate does not claim that Android location acquisition
is wholly offline. No GPS acquisition or external location transmission occurred
in this environment. Existing explicit sharing controls remain unused.

The import parse/transaction/fsync run on the existing single worker. Main-thread
importing/busy gates pause commands and lifecycle rendering during the transaction.
Command submit/confirm, screen preparation/confirmation, loads and imports use a process-wide lock keyed by the canonical journal path (shared by all store instances) so stale pre-import
reads cannot overwrite newly saved pins. Lifecycle screen-load/commit and screen
confirmation also run on that worker. Persistence success is separate from
presentation: a camera failure still attempts style reload, and a later presentation
failure says saved-but-display-needs-retry. Exact reimport remains idempotent.

## Evidence and limits

- VERIFIED local: 26 Kotlin/JUnit tests (10 new import tests plus existing model,
  feature-builder, GPS policy, style-factory and command-executor tests). Initial new tests
  failed compilation because GeoJsonImport/importGeoJson did not exist; final
  tests pass. Disk-write failure, corrupt journal, pending render, unrelated
  records/notes, duplicate and conflicting import, invalid coordinates and byte
  limits, malformed version/properties/altitude, reordered property keys, camera/style failure after commit, and command/import coordination are covered. Tests use synthetic data only.
- VERIFIED local: Node tests 41/41 (3 web + 38 Android source/DOM tests), including five new contracts for unchanged renderer/provider defaults, explicit GPS recenter confirmation and worker/main-thread import boundaries. These contracts are source checks, not device behavior evidence. The default-preservation checks failed before the review fixes and pass afterwards.
- VERIFIED local: modified map renderer, GPS controller, importer and store
  compile against Android 16 Robolectric API jar and actual MapLibre 13.6.1
  classes using Kotlin 2.2.10. This is targeted API compilation, not an APK build;
  OutsideViewActivity and whole-app Android integration still need Gradle.
- VERIFIED local private file: exact SHA-256
  `f580b1a4a30ff950bf093779cddd23cd7dea2c5e733d121aa48343a0965268bb`,
  19,043 bytes. Actual parser imports 39 pins. A second JVM process reloads all
  39 exactly, including properties; feature builder produces 39 records;
  reimport adds zero. IDs 9 and 17 retain distinct identity at shared coordinates.
  Source properties including the two reported corrections are retained exactly.
  The recovered export is model-generated data, not verified station truth.
  Neither the file nor its coordinates are committed or included in deliverables.
- UNKNOWN: Android process restart, actual rendered screen, all-pin viewport,
  search/layer gestures, on-device SAF and GPS on Xiaomi 15T / Android 16.
- BLOCKED here: complete Gradle build/lint/APK and emulator instrumentation:
  Gradle distribution/wrapper, Android SDK and emulator/device are unavailable.
  No APK, emulator screenshot, physical-phone screenshot or full CI result is
  claimed. No GitHub workflow was triggered.

## Required handset acceptance

Use a reviewed build with an upgrade-compatible signer; do not uninstall or
clear Observatory storage. Record source SHA and device/OS. Import synthetic
fixture first, search, pan/zoom, toggle layers and reopen the app. Import private
39-point file locally; inspect count and source labels, force-stop/reopen and
read back 39. Test duplicate and invalid input while retaining existing owner
pins/notes. Verify permission denied, valid GPS accuracy/time, stale timeout,
background/resume and provider disabled. Do not send GPS screenshots or user
locations to external services. Screen/frame evidence and physical GPS must be
recorded separately from JVM evidence.

## Follow-on, not a round-one dependency

Local-first motorcycle routing needs an evaluation of existing offline routing
capabilities, Thai road/access restrictions, data licensing, map size, battery
and update costs before selecting an engine. PMTiles supplies map display, not
routing graphs. The existing navigation handoff rejects UNKNOWN imported pins;
this candidate does not invent verified destinations or build a routing engine.
Future GO updates should exchange versioned GeoJSON with stable dataset/feature
IDs, explicit revisions and conflict review using this journal, without a new
backend. No funding or service purchase is proposed or authorized here.

## Build gap readback after review

Read-only inspection found no Gradle executable/distribution, gradlew wrapper,
Android SDK, sdkmanager, platform-tools/adb, emulator, Android SDK environment
variables, or existing SDK/Gradle caches in the saved environment. Setup logs and
setup-build contain web/Node tooling, not an Android build installation. Java 21
is installed; CI specifies Java 17. The file named android.jar in scratch is the
Maven Central Robolectric `android-all:16-robolectric-13921718` API implementation
JAR downloaded for compiler symbol checks. It is not an installed Android SDK:
there are no SDK platform metadata, build tools, aapt2, d8, zipalign or emulator.
Targeted compilation is not APK compilation or Android runtime validation.

Existing `.github/workflows/android-browser.yml` installs Gradle 8.11.1,
command-line tools 15859902, Android platform 36/build-tools 36.0.0 and platform
tools. It runs JVM tests, lint, instrumentation compilation, debug/ARM64 APK
builds and an API35 emulator. It contains no production deployment. It triggers
on pull_request or push to main, and uploads artifacts; there is no manual
workflow_dispatch path. Runner billing/quota has not been verified, so no remote
run is described as guaranteed free and no workflow was triggered.

Smallest local next step: provide a pre-provisioned, already-licensed Android
SDK (platform36/build-tools36.0.0) plus Gradle8.11.1 and preferably JDK17, then
run the existing Gradle tasks in this scratch candidate. Do not accept licenses,
change original checkout, or create fake SDK metadata. Alternatively, after
explicit review/publishing authorization and cost confirmation, use the existing
non-deploy PR validation path. No new installation/license acceptance or remote
publishing was performed during this follow-up.

## Activity recreation integrity revision

The prior per-instance store lock was insufficient when an old Activity's worker
outlived recreation. All journal IO now uses a process-wide canonical-path lock;
command and screen read-modify-write sequences hold that same lock throughout.
`prepareScreen()` centralizes the screen transaction. The manifest declares no
separate process for this journal's Activities. This is intentionally process-wide
coordination, not a claim of cross-process file locking.

Activity destruction gracefully shuts down its worker, allowing accepted work to
finish, rather than interrupting an uncertain commit. Destruction is volatile and
main-thread callbacks check it before touching UI; imports skip posting UI work
once destruction is observed. A recreated screen whose frame loses a revision
race reloads instead of confirming stale data. Store failures remain explicit.

The lifecycle regression uses two distinct MapStateStore instances (including a
canonical-path alias), an old-screen worker holding its import transaction, and a
new-screen worker attempting prepareScreen. It verifies blocking/serialization,
39 exact synthetic pins and existing notes after reload, rejection of a stale
frame, acceptance of the current frame and absence of a leftover temp journal.
Command/import coordination now also uses separate store instances. Real-file
39-record import and separate-JVM-process readback were rerun successfully.
Actual Android Activity recreation remains an instrumentation/device gate.

Remaining non-destructive display limitation: when a recreated screen finishes
rendering and confirming the old revision before the old worker finishes parsing
and commits an import, that later commit does not notify the already-completed
screen. The pins remain saved and appear after Retry display/reload or reopening.
No new refresh architecture has been added; actual-device behavior remains an
acceptance gate.

## Expanded GOVIEW acceptance: owner edits and versioned batch exchange

Source inventory found existing add-pin, note editing and summary/image sharing,
but no coordinate/label editor or reimportable GeoJSON exporter. GOVIEW retains
the existing renderer and journal: their transaction/revision primitives are
sufficient for this small single-device dataset. No app/module replacement,
SQLite/Room database, app-ID change, signing change or destructive migration is
justified. No user data is deleted or migrated. Journal version1 is retained with
an optional additive `updates` receipt array; old journals decode with an empty
array. Do not downgrade to an older app which would not preserve this new audit
array on its next write.

The pin menu now exposes label/longitude/latitude editing and an explicit owner
checkbox for field confirmation. Saving checks the revision read when the editor
opened; stale edits fail. Original source properties and separate owner notes
remain. Local field confirmation records `owner-field-confirmation`, timestamp,
and VERIFIED coordinate evidence. An imported file's verification claim is not
local field proof; on a new record it becomes UNKNOWN with an imported-claim
source. Matching records already present remain unchanged. Neither batch import
nor generic UPSERT_PIN commands can automatically replace locally field-confirmed
records. Explicit local owner editing is required.

More → Export GeoJSON uses Android ACTION_CREATE_DOCUMENT. It writes a
FeatureCollection with schemaVersion1, goview.format=`goview.map-update` and a
numeric package version equal to the source map revision. Features keep their
stable pin IDs, coordinates, original properties, evidence claims and owner
notes. Source record snapshots are data only; no command execution path is read
from the file. Export is an additive pin exchange, not a full map backup: zones,
grids and deletion intents are not exported. No record is silently truncated;
exports outside the 1000-feature/1MiB import envelope fail explicitly. Files
contain saved pin coordinates, so choose the output document destination
accordingly. Device GPS overlays are never exported. No file is auto-uploaded.

Every accepted import/duplicate and owner field edit receives a durable update
receipt (UUID, content-hash package identity, package version, revision, status,
counts and timestamp). Existing command updates continue using original command
receipts. SAVED means journal persistence, not a rendered frame or device proof.
DUPLICATE adds no pins. UI import parse/conflict failures attempt to persist a
REJECTED receipt without changing map state; disk failure may also prevent that
receipt, and the UI must not claim a durable failure receipt then. More → Update
results displays current revision/pin count and the latest30 receipts; all stored
receipts remain retained. At1000 update receipts new updates fail rather than
silently deleting audit history. Native-package owner-note conflicts also abort
without overwriting notes.

Expanded local tests cover export→parse→fresh-store import→reload, stable IDs,
source properties, owner notes, duplicate receipts, explicit field edits, stale
edit rejection, research overwrite rejection, file verification claims and
rejected-import receipts. Actual Android16 APK launch, gestures, document picker,
rotation, GPS, export/edit round trip and physical phone acceptance still require
CI/emulator/device evidence separately. Future GO exchange is a versioned batch,
not continuous remote phone control.

The Android instrumentation suite now includes GoviewExchangeTest using real Android org.json and isolated synthetic cache storage; it does not touch owner map files or claim physical-device GPS evidence.

### Unified workspace staging (2026-10-23)

The current follow-up fixes imported provenance and export envelope validation: field confirmation is never preselected, editing either coordinate clears confirmation, ordinary save cannot promote imported evidence, and export preflights the receiver before opening an output stream.

Platform SQLite schema v1 is staged behind an explicit backend constructor, **not enabled for the Activity yet**. It stores the existing journal document transactionally with a SHA-256 integrity check. Migration validates the legacy journal first, fsyncs an immutable `journal.pre-sqlite-v1.json` copy, retains `journal.json`, then commits schema and data together. Failed migration/write rolls back; unsupported schema or bad checksum fails closed instead of replacing data. Synthetic Android instrumentation covers migration, retry, rollback, schema rejection, corruption and overlapping store instances. Activation requires these platform tests to pass; local Android API compilation is not SQLite runtime evidence.

Five distinct operations remain the acceptance contract: Snapshot captures explicitly selected map state with Capture ID/version; Upload transfers an explicitly selected file; Download receives a package; Update validates/diffs/previews, obtains owner approval, commits and verifies readback with its own receipt; Local Storage backs up and restores durably. Download success cannot imply Update success. Snapshot tests cannot substitute for transport or update tests. Existing observe-only PANTHEON snapshots and GO Brain read access do not establish an approved map-package upload/download/update-write endpoint. Live package transfer is BLOCKED pending that contract and explicit transmission approval. No new backend, credentials, persistent access or automatic GPS/history transmission is authorized.

The expanded workspace remains staged, not acceptance-ready: selected Snapshot/transfer adapters, explicit Update approval, SQLite activation, full backup/restore, and Android 16 physical-phone B2E remain to complete. The existing CI emulator is API 35; it does not prove Xiaomi 15T GPS or signing-compatible upgrade. Do not install this ephemeral-signed artifact over actual data or uninstall the existing app to work around signing.

### Local workspace follow-up

Candidate UI now separates a local file read (DOWNLOAD/FILE_RECEIVED, explicitly not network delivery) from UPDATE: it validates a package, previews added/duplicate counts and base revision, asks the owner to approve, then commits with a distinct correlated receipt and readback. Conflicts reject instead of overwriting existing records; intervening edits invalidate approval. Cancelling or rotating before approval does not commit pins.

Selected Snapshot starts with no pins selected, previews names and coordinates, captures only explicit IDs/names/coordinates (no original properties, notes, viewport, raw GPS or history), records Capture ID/version and CAPTURED_LOCAL receipt, then uses Android document creation. Writing that file is neither live Upload nor Update success. Reimport of an unchanged selected projection preserves the existing full records. Full-fidelity recovery is through the local backup, not the privacy-limited snapshot.

Local backup/restore validates schema/checksum and previews the target before approval. Restore first preserves the entire current journal in a separate rollback file, then restores the chosen full state with a new revision and STORAGE receipt. Backup files never execute commands. Failed/corrupt storage reads disable writes/sharing and retain the original files.

SQLite remains staged while synthetic platform tests run. The backend now stores 256 KiB BLOB chunks and a small metadata row, avoiding Android CursorWindow limits without reducing accepted journal capacity. A >2 MiB multibyte valid-journal test covers migration, reopen, failed migration and failed replacement.

`GoviewSandboxContract` is a proposed additive file/sandbox contract, not a deployed endpoint. Proposal keys are strictly allowlisted: contractVersion=1, operation=propose-update, sourceCaptureId, baseVersion, package. Unknown fields and stale baseVersion reject. Read/propose do not authorize commit; owner approval remains local. Upload/download adapters return BLOCKED, never simulated success. No patch to GO or PANTHEON repositories is made in this stage.

Confirmed existing read rail: GO Brain `pantheon_observatory` → OwnerBridge `observatory_latest` → GET `/v1/observatory/latest?view=map&round=1`, with optional exact device_id/capture_id. Returns untrusted read-only observation with capture/sequence/capture-time/receive-time/expiry; NO_FRESH_SNAPSHOT and DEVICE_SELECTION_REQUIRED are explicit failures. The device POST observation rail has short retention and observe-only credentials; it is not durable artifact storage or update authority. No live call was made. Existing unselected map snapshot sending is replaced in GOVIEW UI by explicit local selection; browser observation behavior is unchanged.
