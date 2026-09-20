# LIGHTHOUSE Live Hub Projector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make LIGHTHOUSE render GO Hub/Centre Board truth live after locked-screen updates and provide a read-only mobile detail view.

**Architecture:** A generated-Android native overlay adds a Capacitor plugin and foreground service. The service owns an authenticated Hub WebSocket plus Board fetch/cache, while JavaScript projects only the native/Hub Board and never mutates it. Existing WebView Control Port mutations and confirmation guards remain separate.

**Tech Stack:** Capacitor 8.5, Android Java, Android Foreground Service, AndroidKeyStore AES-GCM, OkHttp WebSocket/HTTP, ES modules, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-20-lighthouse-live-hub-projector-design.md`

## Global Constraints

- GO Hub/Centre is the sole Board truth owner.
- The projector path is read-only and contains no Board mutation or command-confirmation capability.
- “สด” requires a connected native service and a projection inside the freshness window.
- Existing confirmation-required commands remain pending until approved on-device.
- The updater release manifest remains closed until BIG approves physical-device acceptance.
- Generated Android sources are reproducible from committed overlay inputs.
- No secret session token is returned from native code to JavaScript.

## Review Focus

- Lower Board revisions never replace cached or displayed revisions.
- Same revision with different payload surfaces a consistency fault.
- Expired credentials stop reconnect retries while preserving the last non-secret projection.
- Notification denial or Android force-stop cannot leave the UI claiming a live route.
- Android back closes the work-detail sheet before navigating away from GO.

---

### Task 1: Projector contract and JavaScript adapter

**Files:**
- Create: `lighthouse-next/hub-projector.mjs`
- Modify: `lighthouse-next/capacitor-app.mjs`
- Modify: `scripts/stage-lighthouse-next-bundle.mjs`
- Modify: `package.json`
- Test: `tests/greenfield-lighthouse-hub-projector.test.cjs`

**Interfaces:**
- Produces: `normalizeHubProjection(input, now): HubProjection`
- Produces: `chooseNewestProjection(current, incoming): HubProjection`
- Produces: `projectorFreshness(status, projection, now, maxAgeMs): 'LIVE'|'STALE'|'OFFLINE'|'EMPTY'`
- Produces: `createHubProjectorAdapter(capacitor): HubProjectorAdapter`

- [ ] Write tests for higher/lower/same-revision conflict, freshness, immutable output, and unavailable web adapter.
- [ ] Run `node --test tests/greenfield-lighthouse-hub-projector.test.cjs`; verify RED because the module is absent.
- [ ] Implement a normalized immutable projection containing only `schemaVersion`, `board`, `boardId`, `boardRevision`, `hubUpdatedAt`, `receivedAt`, and `connection`.
- [ ] Reject missing Board ID, unsafe revision, malformed pins, invalid timestamps, lower revision, and same-revision drift.
- [ ] Implement the native-only adapter with `configure/start/stop/status/readBoard/addListener`; expose no credential read or mutation method.
- [ ] Add the module to staged runtime files and syntax checks.
- [ ] Re-run focused tests and syntax checks; verify GREEN.
- [ ] Commit: `feat: add read-only Hub projector contract`.

### Task 2: GO source authority and “ดูข้างใน”

**Files:**
- Modify: `lighthouse-next/app.mjs`
- Modify: `lighthouse-next/index.html`
- Modify: `lighthouse-next/go-board-live.css`
- Modify: `lighthouse-next/android-back.mjs`
- Test: `tests/greenfield-lighthouse-go-board-live.test.cjs`
- Create: `tests/greenfield-lighthouse-live-projector-ui.test.cjs`

**Interfaces:**
- Consumes the Task 1 adapter/projection/freshness functions.
- Produces: `openGoWorkDetail(pin, projectionMeta)` and `closeGoWorkDetail(): boolean`.

- [ ] Write failing tests proving native Hub projection outranks legacy local Board even when the local revision is higher.
- [ ] Write failing tests proving disconnected/stale data cannot render `สด`, the detail sheet exists, and Android back closes it first.
- [ ] Run focused tests; verify RED.
- [ ] After successful pairing, configure native projection with the original bootstrap credential; start only after the owner enables “แสดง Board สดตอนล็อกจอ”.
- [ ] On Hub disconnect/logout stop the service and clear native credentials.
- [ ] On GO entry read native cache first, then request refresh; never replace it with a lower local/WebView revision.
- [ ] Render Board ID/revision, Hub update time, device receive time, and honest freshness.
- [ ] Add a `ดูข้างใน` button per pin and a full-screen read-only sheet using DOM text nodes; missing fields show `—`.
- [ ] Wire Android back to close details before root navigation.
- [ ] Run the focused tests and existing Android-back tests; verify GREEN.
- [ ] Commit: `feat: project live Hub Board with work details`.

### Task 3: Deterministic Android native overlay

**Files:**
- Create: `android-shell/tools/apply-live-projector.mjs`
- Create: `android-shell/tools/verify-live-projector.mjs`
- Create: `android-shell/native-projector/LighthouseProjectorPlugin.java`
- Create: `android-shell/native-projector/LighthouseProjectorService.java`
- Create: `android-shell/native-projector/ProjectorCredentialStore.java`
- Create: `android-shell/native-projector/ProjectorCache.java`
- Create: `android-shell/native-projector/ProjectorProtocol.java`
- Modify: `android-shell/package.json`
- Create: `android-shell/test/live-projector-overlay.test.mjs`
- Create: `android-shell/test/live-projector-security.test.mjs`

**Interfaces:**
- Produces: `applyLiveProjector(androidRoot): OverlayEvidence`.
- Produces native plugin methods matching Task 1 and a non-exported foreground service.

- [ ] Write fixture tests asserting source copying, plugin registration, non-exported service, permissions `FOREGROUND_SERVICE`/`FOREGROUND_SERVICE_DATA_SYNC`/`POST_NOTIFICATIONS`, a pinned OkHttp dependency, idempotence, and fail-closed anchors.
- [ ] Run overlay tests; verify RED.
- [ ] Implement the overlay tool to discover generated package/MainActivity, copy sources, register the plugin, patch manifest and Gradle once, and fail when anchors are missing.
- [ ] Implement verification for exact package, non-exported data-sync service, named permissions, plugin registration, dependency pin, and no exported projector components.
- [ ] Run overlay tests; verify GREEN.
- [ ] Commit: `build: add deterministic Android projector overlay`.

### Task 4: Native foreground projector behavior

**Files:**
- Modify native sources from Task 3.
- Create: `android-shell/test/live-projector-native-contract.test.mjs`.

**Interfaces:**
- Hub WebSocket: `/hub/api/lighthouse-control-port/live`.
- Hub Board fetch: `/hub/api/lighthouse-control-port/board`.
- Sends `AUTH`; consumes `READY`, `BOARD_UPDATED`, and `ERROR`.
- Returns only non-secret projection data.

- [ ] Write failing static contracts proving AndroidKeyStore AES-GCM storage, no token serialization, immediate `startForeground`, no command execution, session headers, no-store fetch, monotonic cache, bounded backoff, auth-stop, and no continuous wake lock.
- [ ] Run native contract tests; verify RED.
- [ ] Implement encrypted credential replace/expiry/clear using AndroidKeyStore.
- [ ] Implement atomic projection cache; reject lower revision and same-revision drift.
- [ ] Implement notification channel `lighthouse_live_board`, foreground WebSocket, authenticated Board fetch, revision/time notification, bounded reconnect, and auth terminal state.
- [ ] Implement plugin bridge events `boardUpdated` and `connectionChanged`; never return secrets.
- [ ] Generate Android, apply overlays/security, verify, and run `./gradlew :app:compileReleaseJavaWithJavac`; verify GREEN.
- [ ] Commit: `feat: keep Hub Board projection live while locked`.

### Task 5: Build gates, owner APK, and Reality

**Files:**
- Modify: `.github/workflows/lighthouse-owner-build.yml`
- Modify: `android-shell/tools/verify-android-security.mjs`
- Modify: `android-shell/test/android-security-verifier.test.mjs`
- Modify: `android-shell/version.json`
- Modify relevant background/owner-build tests.

- [ ] Write failing workflow/security tests enforcing: `cap sync → projector apply → security apply → projector verify → merged manifest → security verify → assemble`.
- [ ] Permit only the three named projector permissions; require non-exported data-sync service.
- [ ] Run focused gates; verify RED.
- [ ] Wire apply/verify commands and include projector evidence in the owner artifact without changing updater distribution.
- [ ] Re-inspect current main and choose the next monotonic owner version/versionCode; then update identity.
- [ ] Run full root tests, syntax, UTF-8, Android tests, staging, native overlay, security verification, and generated Java compile.
- [ ] Open PR, require green CI, merge, read back main, build the signed owner APK, verify identity/checksum, and archive through the governed route.
- [ ] BIG performs the spec’s locked-screen, details, confirmation, offline/recovery, and force-stop Reality tests.
- [ ] Keep `RELEASE_MANIFEST.json` closed until BIG explicitly approves FINAL.
- [ ] Record effects/validation/Reality and return the Work only after Hub and device Board ID/revision match.
