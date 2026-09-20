# LIGHTHOUSE Live Hub Projector Design

**Date:** 2026-09-20  
**Work ID:** `WORK-LIGHTHOUSE-BACKGROUND-AUTOSYNC-20260919`  
**Checkpoint:** `CP-LIGHTHOUSE-BACKGROUND-AUTOSYNC-001`

## Outcome

GO Hub/Centre is the sole owner of Board truth. LIGHTHOUSE is a read-only projector that continues receiving and caching the latest Hub Board revision while the Android screen is locked, then renders that same revision immediately when opened. Each projected work card has a read-only “ดูข้างใน” action.

Success means a real Hub Board revision created while the device is locked is observed by the native Android projector service without opening LIGHTHOUSE, and the same Board ID/revision is rendered after unlock. No local code may invent, advance, or reconcile an authoritative Board revision.

## Current failure

The current live transport is WebSocket code inside the Capacitor WebView. Android suspends that execution after the activity becomes inactive. A read-only `board.read` probe remained `QUEUED` and undelivered while the screen was locked. Existing lifecycle hooks flush on backgrounding and reconcile on resume; they do not provide locked-screen live delivery.

The current app also has two Board concepts:

- local Centre Board working memory used by legacy Control Port capabilities;
- GO Hub/Centre Board returned by the Hub projection endpoint.

The GO screen must project only the GO Hub/Centre Board. Local working memory must never override the Hub projection or its freshness label.

## Authority boundary

- GO Hub/Centre owns Board identity, pins, status, revision, audit truth, and timestamps.
- LIGHTHOUSE native service may authenticate, subscribe to Hub signals, fetch the current Board projection, validate the response, and cache it.
- LIGHTHOUSE UI may render the cached projection and request a fresh Hub read.
- LIGHTHOUSE must not create a Board, change a pin, claim work, return work, increment revisions, or mark a command complete from the projector path.
- Commands requiring owner confirmation remain pending. The projector service does not execute commands.
- Existing mutation and confirmation paths remain separate and unchanged.

## Android architecture

### Build-time native overlay

The repository generates the Capacitor Android project during CI. Native projector sources and manifest changes therefore live as deterministic overlay inputs under `android-shell/native-projector/`, applied by a Node tool after `cap sync android`. The build workflow verifies the overlay before assembling the APK.

### Native projector service

A foreground service named `LighthouseProjectorService` owns locked-screen projection transport.

It:

1. starts only after the user pairs LIGHTHOUSE and explicitly enables live projection;
2. displays a persistent Android notification while active;
3. maintains the authenticated Hub live connection independently of WebView execution;
4. reacts only to connection events and `BOARD_UPDATED`;
5. fetches the latest Board from the existing Hub Board endpoint after a signal;
6. validates the Board envelope and monotonic revision;
7. stores the newest valid projection atomically;
8. reconnects with bounded exponential backoff after network loss;
9. stops and clears credentials on disconnect, logout, or explicit disable.

The service never keeps a wake lock continuously. Android foreground-service lifecycle is the durability mechanism; network reconnect is bounded to avoid a tight battery-draining loop.

### Native credential and projection store

The existing pairing flow passes the Hub origin, session ID, session token, expiry, and device label to a Capacitor plugin named `LighthouseProjector`.

The plugin stores secrets in Android-encrypted preferences. Projection cache is stored separately and contains:

- Board envelope;
- Board ID and revision;
- Hub `updatedAt`;
- device `receivedAt`;
- connection state;
- last transport error code, if any.

Secrets are never returned to JavaScript. JavaScript receives only service status and the cached Board projection.

### Capacitor bridge

The `LighthouseProjector` plugin exposes:

- `configure(pairing)` — securely replace native pairing data;
- `start()` — start the foreground projector;
- `stop({ clearCredentials })`;
- `status()`;
- `readBoard()`;
- listener `boardUpdated`;
- listener `connectionChanged`.

On web/non-native builds, a JavaScript adapter reports `UNAVAILABLE` and the existing foreground WebSocket path remains available.

## Data flow

### Pairing

1. Existing pairing succeeds in the WebView.
2. The app configures the native projector with the same governed session.
3. The user enables live projection.
4. Android starts the service and shows the persistent notification.

If native configuration fails, pairing remains valid for foreground use, but the GO page must show that locked-screen live projection is unavailable.

### Locked-screen update

1. GO Hub/Centre commits a new Board revision.
2. Hub emits `BOARD_UPDATED`.
3. The native service receives the signal while the activity is stopped.
4. It fetches the complete Board projection from Hub.
5. It accepts only a valid projection whose revision is not lower than the cached revision.
6. It writes the projection atomically and updates the notification revision/time.
7. It records connection/freshness metadata. It does not mutate Hub or local Board state.

### Resume and foreground update

1. When LIGHTHOUSE opens, the GO page reads native cache before rendering Board cards.
2. It then requests a network refresh.
3. A newer valid Hub response replaces cache and UI.
4. An older or invalid response is rejected and surfaced as a transport error.
5. The UI never replaces a newer native revision with older WebView/local data.

## Honest freshness

The GO page uses these states:

- **สด** — native service is connected and the projection was received within the configured freshness window.
- **กำลังเชื่อมต่อ** — service is starting or reconnecting.
- **ข้อมูลล่าสุด** — a valid cached projection exists but the live route is not currently connected or is outside the freshness window.
- **ออฟไลน์** — no live route; cached projection may still be shown with its receipt time.
- **ยังไม่มีข้อมูล** — no valid Hub projection has ever been cached.

Every non-empty Board display shows Board ID, revision, Hub update time, and device receive time. “สด” is forbidden unless both connection and freshness conditions are true.

## “ดูข้างใน” interaction

Each projected work card includes a `ดูข้างใน` button. It opens a mobile full-screen detail sheet with:

- title and current status;
- Work ID and Pin ID;
- current owner/employee;
- task detail;
- result and next action;
- checkpoint/route references when supplied by Hub;
- evidence and links;
- pin revision and Board revision;
- Hub update time and device receive time;
- freshness/connection state.

The sheet is read-only. Android back closes it before navigating away from the GO root. Missing fields display “—”; unknown fields are not invented.

## Error handling

- Invalid Board envelope: retain last valid projection and show `ข้อมูลล่าสุด` plus an error reason.
- Lower revision than cache: reject it as stale.
- Same revision with different payload: retain cache and report a consistency fault.
- Expired or rejected session: stop network retries, show `ต้องเชื่อม Hub ใหม่`, and keep only the last non-secret projection.
- Network loss: retain projection, change freshness immediately, and reconnect with bounded backoff.
- Device reboot: service does not silently restart unless live projection was enabled and Android permits the configured boot path; any boot receiver must start a compliant foreground service immediately.
- App force-stop: Android prevents automatic restart. The UI must state that live projection is paused until LIGHTHOUSE is opened again.
- Notification permission denied on Android versions that require it: do not claim locked-screen live operation; show setup guidance.

## Compatibility and migration

- Existing GO Hub pairing remains the source session; migration copies it into native secure storage only after a successful native configure call.
- Existing local Centre Board data is not deleted, because legacy Control Port operations may still depend on it. It is excluded from the GO Hub projector rendering path.
- Existing confirmation guards and mutation capabilities are unchanged.
- Web deployment continues using the existing WebSocket projection and honest fallback states.
- Android owner version and versionCode are bumped only when producing the acceptance APK.

## Testing

### Automated

- Native overlay materializes service, plugin, manifest declarations, permissions, notification channel, and deterministic build inputs.
- Projector cache accepts a higher revision.
- Projector cache rejects a lower revision.
- Same revision with changed content raises a consistency error.
- Session expiry stops retry and preserves only non-secret projection.
- UI reads native projection before local/WebView sources.
- UI cannot label stale or disconnected data as `สด`.
- Detail button opens the correct pin and renders read-only Hub fields.
- Android back closes detail first.
- Projector path contains no Board mutation or command-confirmation capability.
- Existing Control Port and confirmation tests remain green.

### Device acceptance

1. Install the new owner APK without enabling release manifest distribution.
2. Pair Hub and enable live projection.
3. Confirm persistent notification and connected state.
4. Record the displayed Board ID/revision.
5. Lock the screen.
6. Create a legitimate Centre state change through its normal governed route.
7. Verify Hub Board revision advances.
8. Verify native service receipt/notification advances while the screen remains locked.
9. Unlock and open LIGHTHOUSE.
10. Verify the GO page renders the same Board ID/revision without manual Sync.
11. Open `ดูข้างใน` and verify details match Hub readback.
12. Queue a confirmation-required command and verify it remains pending.
13. Disable network, verify honest cached/offline state, restore network, and verify recovery.
14. Force-stop the app and verify the UI does not falsely claim continuous live service afterward.

## Release gate

The implementation is not complete until automated checks pass, CI builds the owner APK, Hub/native receipts prove the locked-screen revision change, and BIG confirms the displayed Board and detail sheet on the physical device. The updater manifest remains closed until that device acceptance is explicitly approved.
