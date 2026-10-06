# Integration verification

Code integration: **IMPLEMENTED**. Live owner relay/MCP and device execution: **NOT VERIFIED**.

`BrowserActivity` now connects native DOM capture to `ObserverSession`, a bounded `Outbox`, and `SyncService`. A foreground loop captures and synchronizes while the active tab is explicitly shared. Network I/O runs on a serial worker; command guards and WebView dispatch run on the UI thread. Sync itself never executes commands.

The user must provide and confirm the owner relay contract and credential. Commands must match the configured device, actor, Work, checkpoint and explicit action scope, then pass the current capture/revision/epoch and foreground checks. Duplicate commands are reserved before asynchronous dispatch, preventing repeat mutation while the first callback is pending. The 1024-entry process command ledger fails closed when full.

Targets are references to the filtered elements collected by the observer, bound to the capture and page URL. Hidden/password predecessors cannot shift their index. Detached, replaced, hidden, password or semantically changed targets are rejected. Async receipts wait for the dispatch callback and never assert business success. Invalid ACKs retain pending items.

Snapshots and retry receipts are memory-only. They do not survive process death. Stop/pause clears pending tab snapshots and revokes permission; an already started HTTP request cannot be recalled. Receipt retries are limited to 100 queued items. Configuration must be explicitly enabled again after a new process starts. This is a foreground integration, not a deployed background service.

Evidence comes from JVM regression tests, Node DOM fixtures, lint, APK build, and instrumentation compilation in CI. Offline Android instrumentation fixtures are included for actual WebView JSON marshalling/dispatch and Keystore roundtrip/revocation, but compilation is not execution.

Still unverified: owner route ownership and backend authentication/authority; live publish/poll/receipt/readback; installation and lifecycle on BIG's device; emulator instrumentation execution; durable outbox/background service; production signing. No live endpoint or Work identity is invented.
