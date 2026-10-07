# Observatory GeckoView full engine

The Observatory launcher now uses `GeckoBrowserActivity`. The former `BrowserActivity`/WebView path remains in the source only as a comparison implementation and is not the production launcher.

## Boundaries

- `GeckoBrowserEngine` owns one process-scoped `GeckoRuntime` and one `GeckoSession` per tab.
- `GeckoBrowserRecovery` stores encrypted Gecko `SessionState` in Android Keystore-backed AES-GCM preferences.
- `GeckoPageObserver` reuses the PRISM WebExtension/native-messaging pattern. The content script runs in every frame and emits `captureId`, `frameId`, URL/title, redacted text, and target signatures without input values.
- `GeckoCommandDispatcher` is native-initiated and only runs after `CommandExecutor`/`CommandGuard` validates device, tab, epoch, revision, capture and frame. The command script re-checks visibility, disabled state, password policy, target presence, and signature.
- `ObserverSession`, `Outbox`, `SyncService`, `RelayClient`, `PermissionStore`, map/outside-view and station/Work contracts remain shared with the Observatory baseline.
- Metropolis connection now starts at the new Hub `/mcp` OAuth/PKCE entry. `MetropolisMcpClient` pins the native client to GO, stores tokens through Android Keystore-backed credentials, and reads `metropolis_identity` plus `metropolis_arrive`. The obsolete `/observatory/pair` flow is not used by the Gecko launcher.

A browser action is not business success. Receipts keep `EXECUTED`, `READBACK`, `REJECTED`, and `UNKNOWN` separate; `BusinessOutcome` remains `UNKNOWN` unless the owner system supplies business evidence.

## CI artifact

The Android workflow runs DOM tests, JVM tests, lint, instrumentation compilation, emulator instrumentation, and debug packaging. The installable debug artifact is named `YGG-Observatory-Gecko.apk`.

## Acceptance boundary

CI and emulator evidence prove only build/runtime behavior in those environments. Xiaomi 15T / Android 16 / HyperOS 3.0.302.0 remains `DEVICE ACCEPTANCE = UNKNOWN` until the APK is installed on that handset and the complete publish → poll → execute → receipt → readback path is observed.

The Hub native client requires the corresponding Metropolis native OAuth client
change to be deployed before production authorization can succeed. OAuth
identity/arrival success alone does not prove browser Work execution or
publish → poll → execute → receipt → readback.
