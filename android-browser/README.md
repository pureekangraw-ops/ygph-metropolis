# YGG Observatory — Android GeckoView engine

Standalone Android GeckoView browser for the GO Observer. The Gecko implementation is the production launcher; the former WebView implementation remains only for comparison. This project is intentionally separate from `android-shell` / PRISM.

## Implemented in this slice

- One application-level GeckoRuntime with one GeckoSession per tab; HTTPS-only navigation and fail-closed external URL policy.
- URL bar with back, forward, reload, and new-tab controls.
- Tab store with active-tab selection, encrypted Gecko SessionState restore, crash recovery, popup/session lifecycle hooks, and URL fallback.
- Session restore does not grant control or observer permission.
- Activity lifecycle/power-state check for interactive actions.
- PRISM-reused WebExtension/native-messaging observation with frame-aware targets, freshness, redaction, truncation, and debounce.
- Guarded Gecko command hand with capture/frame/signature checks and no arbitrary transport-supplied JavaScript.
- Encrypted device credential boundary, bounded outbox, configurable HTTPS relay adapter, and transport-only sync pass.
- Foreground Activity wiring: Share → Gecko capture → outbox → relay poll → guarded GeckoSession dispatch → fresh readback → receipt.
- Explicit owner route/WorkContext configuration and local confirmation; no default live connection.
- JVM/Node regression tests and offline WebView/Keystore instrumentation fixtures.

## Not claimed yet

The relay adapter is deliberately route-configurable: no MCP endpoint, Work ID, credential, or owner-specific route is invented here. Live MCP readback, real-handset installation, Xiaomi 15T acceptance, and production signing remain unverified until the owner route, permissions, and a real Android device are available.

## Build

```bash
gradle :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
```

Run `node --test tests/*.test.mjs` for DOM regression tests. CI checks JVM tests, Android lint, instrumentation compilation, and debug APK build. Android build requires a working SDK and dependency access; instrumentation execution requires an emulator/device. See [relay contract](integration/relay-contract.md) for setup and the [verification boundary](integration-verification.md) for limitations.
