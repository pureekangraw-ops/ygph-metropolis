# Observatory Outside View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render evidence-backed Zone → Grid → multiple Pin locally beside Inside View, with durable commands and truthful renderer-confirmed receipts.

**Architecture:** Pure Kotlin models, journal and serial command executor own map state. A native MapLibre adapter owns rendering; a private Activity owns controls/import/cards/navigation. Inside View contributes only a mode entry, never browser permissions or backend authority.

**Tech Stack:** Existing Kotlin/Android SDK 35, Java 17, Gradle 8.9, JUnit 4, org.json, Java NIO atomic file replacement (minSdk 26), MapLibre Android (candidate 13.6.1 verified before pinning), Espresso instrumentation.

**Spec:** `docs/outside-view-codex-handoff.md`.

## Global Constraints

- Isolated feature branch `feat/observatory-outside-view` based on `6af5141c1e06b824b99d8f4a217fb4ab6b8d36b6`; never modify PR #212 branch. While #212 remains unmerged, stack the new PR on `feat/android-browser-foundation`; no automatic merge.
- Preserve applicationId/namespace `com.big.gobrowser`; no new repo, backend, release signing, routing engine or silent rename.
- Observatory/Lyra is separate from Greenhouse/Genome; legacy PRISM/RIDE remains a source reference, not an authority transfer.
- Grid identity: SHA-256 canonical `[zoneId,west,south,east,north]` numeric JSON, prefix `grid:epsg4326:`. Display labels are separate; normalize negative zero.
- Finite numeric coordinates only; exact Pin needs coordinate evidence. Availability timestamps are separate. Grid center never becomes a Pin.
- Local PMTiles only, private `files/maps/`, attribution visible, no network fallback; overlapping semantic Zones allowed and unknown boundaries unrendered.
- Live intake disabled; owner Work/Checkpoint/current route UNKNOWN. Historical RIDE Work is not assigned. Debug fixtures explicitly TEST and unavailable in release.
- APPLIED requires foreground renderer confirmation matching commandId/revision/styleGeneration/token. Navigation reports HANDOFF_STARTED, never arrival.
- Execution method already chosen by BIG: Codex. Written-plan review remains next; no implementation before that review.

## Review Focus

- Negative-zero/equivalent cell bounds retain identity; overlapping Zones do not overwrite each other (Task 1).
- Crash between mutation and render receipt recovers pending state without duplicate mutation (Task 2).
- Truncated/compressed oversized metadata or incompatible vector layers preserve the last working package (Task 3).
- Style recreation/offscreen targets must not accept stale callbacks or falsely assert visibility (Task 4).
- No navigation handler, approximate GPS or mode switching must not invent destination certainty or retain browser sharing grants (Task 5).

---

### Task 1: Typed spatial/evidence contract

**Create:**
- `android-browser/app/src/main/java/com/big/gobrowser/outsideview/MapModels.kt`
- `android-browser/app/src/main/java/com/big/gobrowser/outsideview/MapCommand.kt`
- `android-browser/app/src/main/java/com/big/gobrowser/outsideview/MapCommandCodec.kt`
- `android-browser/app/src/test/java/com/big/gobrowser/outsideview/MapContractTest.kt`

**Interfaces:** `MapCommandCodec.decode(json: JSONObject): MapCommand`; `gridId(zoneId: String, bounds: Bounds): String`; `validate(command: MapCommand, state: MapState, now: Long): List<String>`.

Models define Bounds, Evidence, Zone, Grid, Pin, typed Target, Presentation, MapState(revision), MapCommand(envelope/action/payload), MapReceipt and receipt-status enum. Evidence separates coordinate verification from availability expiry. Commands implement all spec actions; ROUTE rejects explicitly. CLEAR requires scope; parent removal requires explicitly selected subtree.

- [ ] RED: write UNKNOWN/approximate Pin, string/null/NaN/range coordinates, hierarchy/polygon closure, unsupported geometry, missing evidence, equivalent bounds, overlapping Zones and availability tests.

```kotlin
assertEquals(gridId("A", plusZero), gridId("A", minusZero))
assertNotEquals(gridId("A", bounds), gridId("B", bounds))
assertTrue(validate(approximatePin, state, now).isNotEmpty())
```

- [ ] Run `cd android-browser && gradle :app:testDebugUnitTest --tests '*MapContractTest'`; expect failing assertions/missing contracts.
- [ ] GREEN: implement strict decoding and validation; exact points must be inside declared Grid, and Grid intersect known Zone geometry. Preserve observation lineage when resolving.
- [ ] Verify same command passes; malformed multi-target input rejects the complete batch.
- [ ] Commit only Task 1 files: `feat: define Outside View spatial truth contract`.

### Task 2: Durable state and serial receipt lifecycle

**Create:**
- `android-browser/app/src/main/java/com/big/gobrowser/outsideview/MapStateStore.kt`
- `android-browser/app/src/main/java/com/big/gobrowser/outsideview/MapCommandExecutor.kt`
- `android-browser/app/src/main/java/com/big/gobrowser/outsideview/MapRenderer.kt`
- `android-browser/app/src/test/java/com/big/gobrowser/outsideview/MapCommandExecutorTest.kt`

**Interfaces:** `MapStateStore(root: File).load(): MapJournal`; `commit(journal: MapJournal): Unit`. `MapCommandExecutor(store: MapStateStore, renderer: MapRenderer, scope: ExecutionScope, clock: () -> Long).submit(command: MapCommand): MapReceipt`; `resume(): Unit`. `MapRenderer.foregroundReady: Boolean`; `styleGeneration: Long`; `render(request: RenderRequest, callback: (RenderConfirmation) -> Unit): Unit`; `cancel(): Unit`.

Define MapJournal(state,pending,hashes,receipts), ExecutionScope(TEST-only/live-disabled), RenderRequest(commandId,revision,styleGeneration,token,state) and RenderConfirmation(same correlation fields,confirmed featureIds,presentation,camera,error). File replacement uses a synced sibling temporary file and Java NIO atomic move on the same filesystem; fail closed if atomic replacement is unavailable, retaining the prior journal. JVM temp-directory tests exercise real file I/O without Android mock methods. Add version validation and explicit corrupt-state recovery. Serialize canonically for payload-aware dedupe.

- [ ] RED: test pending while inactive, same-payload replay, changed-payload rejection, expired/grant/revision rejection, batch rollback, scoped deletion, failed disk commit and crash recovery.

```kotlin
assertEquals(PENDING, executor.submit(command).status)
assertNotEquals(APPLIED, store.load().receipts[command.commandId]?.status)
renderer.confirm(wrongToken)
assertEquals(PENDING, executor.submit(command).status)
```

- [ ] Run `gradle :app:testDebugUnitTest --tests '*MapCommandExecutorTest'` from `android-browser`; expect RED.
- [ ] GREEN: persist accepted mutation and pending render together; one operation in flight; acknowledge matching foreground confirmation only. Reset correlation on renderer cancellation; recover pending work without reapplying its mutation.
- [ ] Verify tests including independent recommend/highlight/focus and NOTE expectedRevision conflicts.
- [ ] Commit: `feat: journal Outside View commands and render receipts`.

### Task 3: Safe local map import

**Create:**
- `android-browser/app/src/main/java/com/big/gobrowser/outsideview/LocalMapPackageStore.kt`
- `android-browser/app/src/main/java/com/big/gobrowser/outsideview/PmtilesValidator.kt`
- `android-browser/app/src/test/java/com/big/gobrowser/outsideview/PmtilesValidatorTest.kt`
- `android-browser/app/src/androidTest/java/com/big/gobrowser/outsideview/LocalMapImportTest.kt`

**Interfaces:** `PmtilesValidator.inspect(file: File): MapPackage`; `LocalMapPackageStore(context: Context).import(uri: Uri): MapPackage`; `active(): MapPackage?`. MapPackage defines canonical file, SHA-256, attribution, bounds, zoom and vectorLayers.

- [ ] RED: test invalid magic/version/range/tile type, compressed metadata exceeding 4 MiB decoded cap, unsafe paths, missing attribution, unsupported layers and interrupted import retaining active package.
- [ ] Run `gradle :app:testDebugUnitTest --tests '*PmtilesValidatorTest'`; expect RED.
- [ ] GREEN: port focused validator/staging logic from legacy plugin, not Capacitor integration. Limit raw and decoded metadata, validate zoom/bounds and layer schema, sync staged file and activate atomically with rollback.
- [ ] Verify JVM tests; compile/run document import instrumentation on emulator when available. Source-only import cannot count as device proof.
- [ ] Commit: `feat: import validated private PMTiles for Outside View`.

### Task 4: Native renderer and correlated frames

**Create:**
- `android-browser/app/src/main/java/com/big/gobrowser/outsideview/MapLibreOutsideRenderer.kt`
- `android-browser/app/src/main/java/com/big/gobrowser/outsideview/MapFeatureBuilder.kt`
- `android-browser/app/src/test/java/com/big/gobrowser/outsideview/MapFeatureBuilderTest.kt`
- `android-browser/app/src/androidTest/java/com/big/gobrowser/outsideview/OutsideViewRenderTest.kt`
- `android-browser/app/src/androidTest/assets/outside-view/vector-fixture.pmtiles`
- `android-browser/app/src/androidTest/assets/outside-view/provenance.json`

**Modify:** `android-browser/app/build.gradle.kts`; `android-browser/app/src/main/AndroidManifest.xml`.

**Interfaces:** `MapFeatureBuilder.build(state: MapState): MapFeatures` (Zone/Grid/Pin GeoJSON plus styling IDs); renderer implements Task 2 interface using a foreground MapView and Task 3 package.

- [ ] RED: prove three Pins/two Grids/one Zone, Grid uncertainty, no manufactured Zone polygon, independent recommendation/highlight, lng-lat order, stale style token rejection and offscreen visibility distinction.
- [ ] Run JVM feature-builder tests (RED); compile instrumentation against verified MapLibre APIs after dependency pinning.
- [ ] GREEN: generate a minimal licensed vector fixture with documented generator/source/SHA, then separate polygon/point sources, fills/outlines/circles and local labels; focus fits bounds without changing data. Confirm only after fully rendered frame with source-feature/presentation/camera readback; callbacks cancelled on pause/style recreation.
- [ ] Verify actual emulator frame and receipt correlation, not Activity launch. Inspect merged permissions; ACCESS_NETWORK_STATE stays adapter-only, no background location or network map fallback.
- [ ] Commit: `feat: render Outside View spatial layers with correlated ACK`.

### Task 5: Mode entry, cards, notes and navigation

**Create:**
- `android-browser/app/src/main/java/com/big/gobrowser/outsideview/OutsideViewActivity.kt`
- `android-browser/app/src/main/java/com/big/gobrowser/outsideview/PinNavigation.kt`
- `android-browser/app/src/debug/assets/outside-view/test-map-commands.json`
- `android-browser/app/src/androidTest/java/com/big/gobrowser/outsideview/OutsideViewInteractionTest.kt`

**Modify:** `android-browser/app/src/main/java/com/big/gobrowser/browser/BrowserActivity.kt`; `android-browser/app/src/main/AndroidManifest.xml`.

**Interfaces:** `PinNavigation.launch(pin: Pin): NavigationResult` returns HANDOFF_STARTED/REJECTED; Activity owns document picker, MapView lifecycle, Task 2 executor and cards. Register Activity exported=false. Typed local TEST fixture loading is debug-only.

- [ ] RED: test mode transition stops browser sharing, restart recovers map/notes, background intake remains pending, Grid cannot navigate, missing handler rejects, approximate GPS cannot supply destination evidence.
- [ ] Run instrumentation; expect controls/Activity missing before implementation.
- [ ] GREEN: add narrow Outside View entry, visible TEST indicator, import/status, layer toggles, cards/evidence/notes and confirmed-scope remove/clear. Use canonical exact Pin coordinate for `geo:` launch; never dispatch through browser executor. Port optional user-triggered foreground GPS with separate permission flow and visible accuracy; it cannot create verified Pins.
- [ ] Verify notes readback and navigation intent with intercepted test handler; navigation receipt never claims APPLIED/arrival. Return to browser without restored sharing grants.
- [ ] Commit: `feat: expose Outside View beside Inside View`.

### Task 6: Exact-head CI and reviewable evidence

**Create:** `android-browser/docs/outside-view.md`.

**Modify:** `.github/workflows/android-browser.yml`.

**Interfaces:** fixture/provenance supplies Task 4 local vector package; CI exports reports/screenshots/receipts keyed by source SHA, emulator API and journal revision.

- [ ] RED: run baseline suite plus new connected tests; record any actual failure. Verify Task 4 fixture provenance/SHA and explicitly TEST place data; no invented real places.
- [ ] GREEN: add emulator execution and diagnostic upload scoped to Outside View tests, retaining existing browser DOM/JVM/lint/APK checks and PRISM workflow isolation.
- [ ] Verify `gradle :app:testDebugUnitTest :app:lintDebug :app:assembleDebug :app:connectedDebugAndroidTest`; exact-head CI must prove renderer tests executed. If emulator unavailable, report compile-only and device rendering UNKNOWN.
- [ ] Document schema, receipt states, import compatibility, pending recovery and disabled live route; commit `test: verify Outside View render and persistence on Android`.
- [ ] Push isolated branch and create stacked draft PR; attach exact SHA/test/frame/receipt evidence. Review branch as a whole; no merge, production signing or live transport claim.
