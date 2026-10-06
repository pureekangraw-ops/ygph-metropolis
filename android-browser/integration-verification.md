# Integration verification

Status: **BLOCKED / NOT CLAIMED**

Implemented in this PR:

- `HttpRelayClient` accepts three exact HTTPS URLs from the verified owner contract.
- Device credentials are encrypted with Android Keystore and can be revoked.
- `SyncService` publishes queued snapshots and polls commands but never executes commands.
- Command execution remains a separate, foreground-only, guarded WebView boundary.

Not verified:

- The current owner relay route, WorkContext, authentication scope, MCP tools, or production endpoint.
- A live publish/poll/receipt exchange.
- Installation, foreground/background behavior, or process restore on BIG's device.

No device credential, URL, cookie, authorization header, Work ID, or live MCP endpoint is invented by this project.
