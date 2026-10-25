# Selected transfer implementation contract (development only)

Chosen design B: share a typed, versioned envelope and transfer/receipt lifecycle; keep the existing GeoJSON pin and Studio graph adapters/stores. Existing file formats and Studio HTTP routes remain readable. No deployment, credentials or runtime permission activation is included.

Envelope fields (exact): `schema:"goview.transfer.v1"`, `transferId`, `operation`, `payloadType`, `identity`, `sha256`, `payload` (the exact original UTF-8 JSON string). SHA256 covers original payload bytes. Payload max1MiB; encoded envelope max2MiB+8192. IDs are 8–80 ASCII letters/digits/underscore/hyphen. Unknown fields/types fail closed.

| operation | payloadType | identity | transferId |
|---|---|---|---|
| SNAPSHOT | goview.map-update | captureId, baseVersion | captureId (max71 chars) |
| PROPOSAL | goview.map-update | captureId, baseVersion, snapshotSha256 | captureId + `-proposal` |
| STUDIO | goview.map.package.v1 | mapId, version | explicit immutable ID |

Snapshot payload is the existing exact `MapStateStore.selectedSnapshot` export: explicit-pins-only; strict allowed fields, no notes/category/private evidence/GPS/history. Proposal payload is the existing `{contractVersion:1,operation:"propose-update",sourceCaptureId,baseVersion,package}` file envelope. The server binds proposals to a stored snapshot and its SHA/revision; the phone must independently bind to its local selected snapshot. One immutable proposal per capture; conflicting changes require a fresh explicit capture. Studio uses its existing codec/version guards; no conversion into pins.

`PUT /v1/transfers/{transferId}` conditionally stores immutable identity+bytes and reads them back before returning the full envelope (201 new/200 identical/409 conflict). `GET` returns the envelope. After an uncertain PUT, GET and compare exact identity/hash/bytes before any retry. No listing or deletion route.

Development-only optional binding `ANDROID_UPLOAD_TOKEN` is separate from GO_WRITE_TOKEN and ANDROID_READ_TOKEN; all three must be distinct. Without it the new routes fail closed503 while existing routes remain unchanged. Upload role can PUT SNAPSHOT and GET SNAPSHOT for readback only. GO role can GET transfers and PUT PROPOSAL/STUDIO only. Read role can GET PROPOSAL/STUDIO and POST a device receipt only. No token is embedded or provisioned by this change.

`POST /v1/transfers/{id}/receipt` body exactly: transferId, sha256, operation:"UPDATE", status (`SAVED`, `DUPLICATE`, `COMMITTED_READBACK_UNAVAILABLE`), revision, readbackVerified. SAVED/DUPLICATE require true; uncertain requires false. This is a device report, never independent proof of physical execution. Immutable duplicate receipt returns200; conflict409. GET same receipt path is allowed to GO/read role. Local journal receipt remains authoritative; failed network receipt delivery must not replay Update.

## GO ownership request

Required integration in `Go-Together/worker/goview-direct.mjs`, tool registration in `worker/index.js`, and corresponding tests (await parent assignment; no concurrent edits from this lane):

- `goview_transfer_read({transferId,sha256})`: GET exact envelope; independently validate contract, requested ID and expected payload digest. GO owner obtains these from explicit selected upload receipt. No broad discovery.
- `goview_transfer_publish({envelope})`: GO-role PUT of PROPOSAL/STUDIO; reject SNAPSHOT; verify full envelope readback. For proposals source snapshot digest/revision must match. On uncertainty return an explicit readback-required result; do not automatically repeat mutation.
- `goview_transfer_receipt({transferId})`: GET device receipt; return NOT_OBSERVED on404, not applied. Preserve device-report wording.

Observatory `goview-package-bridge/go-adapter.mjs` receives these same names via existing `GoviewGoBridge.invoke`; no new service binding is required. Source-development permission does not activate runtime bindings/secrets. Native caller uses existing owner-triggered selection → upload → explicit download → preview → owner Update; it never auto-uploads GPS or commits a GO proposal merely upon download.

## Current implementation checkpoint

Worker schema/router, existing GO bridge adapter, native transfer codec/coordinator/client, and owner-triggered Android controls are implemented on a separate branch stacked on PR261. GO public tool registrations in the Go-Together repository remain a coordinated dependency, not claimed complete. Studio typed writes go through the existing versioned storage adapter to preserve its conflict rules; old Studio/Direct routes do not require the optional upload token.

Local evidence at development checkpoint: existing map JVM suites plus four new transfer tests pass (32 total); Worker/legacy package/Direct Node suites pass (22 total). The new cross-runtime test executes the actual Kotlin coordinator against the actual Worker and GoviewGoBridge adapter through a loopback-only HTTP fixture with synthetic credentials and storage. It covers selected upload, GO exact read, bound proposal publish, Android download, unchanged pins before approval, owner Update/readback, separate device receipt and reopened local storage. Additional cases cover private payload rejection before dispatch, wrong source digest, uncertain PUT resolved by GET without replay, and receipt-only retry after process-object recreation. Android UI compile/emulator and independent review remain gates; this is not a production or physical-device pass.

No new service, runtime binding, credential provisioning or deployment was performed. The optional upload authority exists only as fail-closed source configuration. Device readback is a device report; GO receipt tools explicitly return `independentlyVerified:false`.

## Local independent-review corrections (not yet published)

Two deterministic regressions fail against checkpoint2be838f and pass locally:

1. GO publish readback now compares all immutable envelope fields, including operation, payload type and every identity field. Matching payload bytes/hash alone cannot substitute snapshotSha256.
2. A Studio transfer now conditionally reserves the typed ID and reads the winning reservation before touching canonical Studio storage. A different-type loser returns conflict with no canonical version, latest-pointer or legacy transfer-binding write. A Studio reservation alone is not successful transfer evidence: GET reconciles canonical exact bytes, legacy identity/digest binding and a valid latest index. Incomplete state returns TRANSFER_RESERVED_READBACK_REQUIRED; it neither claims success nor frees the ID for another type. An explicit identical PUT can resume the reservation using existing conditional version semantics; GET never replays mutation. A lost response after complete canonical commit resolves through readback.

The tests use promise barriers, not timing sleeps, and confirm existing Studio version-conflict rules remain enforced. No deployed data or credentials were accessed. Remote branch checkpoint remains2be838f while publication approval is pending.
