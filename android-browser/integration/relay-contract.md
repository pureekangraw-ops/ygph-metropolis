# Relay contract boundary

Owner route and live MCP status: **UNRESOLVED / NOT LIVE VERIFIED**.

The device user opens **Relay**, pastes the owner contract JSON and device bearer token, reviews the three routes and scope, then chooses **Connect**. Connecting does not start sharing. **Share** enables the active foreground tab; **Stop**, pause, navigation or switching away revokes its epoch and clears queued snapshots. Navigation can start a fresh observer session while the foreground tab remains shared. A request already in flight cannot be recalled.

Configuration is explicitly entered each process session. There are no default endpoints, device identity, WorkContext or authority grants for a live connection. Local configuration checks do not prove backend authorization; the owner must still verify the contract.

Required configuration fields:

| Field | Meaning |
| --- | --- |
| `publishSnapshots` | Exact absolute HTTPS snapshot POST URL |
| `pollCommands` | Exact absolute HTTPS command GET URL |
| `publishReceipts` | Exact absolute HTTPS receipt POST URL |
| `deviceId` | Owner-provisioned device identity |
| `workId` | Current owner Work identity |
| `checkpointId` | Current checkpoint identity |
| `actor` | Authorized actor |
| `authorities` | Explicit list such as `browser.click`, matching the command action |

The token is supplied separately, encrypted with Android Keystore, and never put in snapshots or diagnostics. **Disconnect** revokes the local credential and sharing session. Server-side token revocation remains the owner's responsibility. Redirects are rejected so bearer credentials are not forwarded to another endpoint.

Snapshot payloads include `deviceId`, `tabId`, `captureId`, `revision`, `sequence`, `epoch`, `capturedAtEpochMs`, `appVersion`, `schema`, URL without query/fragment, text, targets and truncation status. The command must refer to the exact capture, tab, revision and epoch and match the configured device, actor, Work, checkpoint and action scope. Command JSON follows `Command` field names; `parameters` contains strings. The poll response is an array or an object with a `commands` array.

Every snapshot POST must return JSON containing an exact matching `id` (capture ID), `sequence`, and a positive integral `acceptedAtEpochMs`. Receipt POST responses use the command ID, `sequence: 0`, and the same timestamp requirement. Empty, incomplete or mismatched ACKs do not remove queued items. POST retries may happen after a lost ACK, so the owner must deduplicate snapshots by capture ID and receipts by command ID.

WebView dispatch returns an `ACCEPTED` action receipt after the native callback, or a rejection/unknown outcome. An actual subsequent DOM capture may provide `afterCaptureId`; a dispatch or navigation start is not evidence of business completion. Business outcome remains `UNKNOWN`.

Before claiming live operation, verify route ownership, token provisioning/revocation, WorkContext/authority mapping, publish → poll → dispatch → receipt → owner readback, stale/revoked/duplicate behavior, and lifecycle behavior on the real device. Unit tests and compiled instrumentation are not live MCP evidence.
