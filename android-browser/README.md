# GO Browser — Android foundation

Standalone Android WebView browser for the GO Observer experiment. This project is intentionally separate from `android-shell` / PRISM.

## Implemented in this slice

- HTTPS-only WebView navigation; cleartext and mixed content are disabled.
- URL bar with back, forward, reload, and new-tab controls.
- Tab store with active-tab selection and URL-only session restore.
- Session restore does not grant control or observer permission.
- Activity lifecycle/power-state check for interactive actions.
- Native-initiated DOM observation with freshness, redaction, truncation, and debounce.
- Guarded command model plus allowlisted WebView action dispatcher (no arbitrary JavaScript).
- Encrypted device credential boundary, bounded outbox, configurable HTTPS relay adapter, and transport-only sync pass.
- Foreground Activity wiring: Share → capture → outbox → relay poll → guarded asynchronous WebView dispatch → receipt.
- Explicit owner route/WorkContext configuration and local confirmation; no default live connection.
- JVM/Node regression tests and offline WebView/Keystore instrumentation fixtures.

## Not claimed yet

The relay adapter is deliberately route-configurable: no MCP endpoint, Work ID, credential, or owner-specific route is invented here. Live MCP readback, device installation, background-service deployment, and production signing remain unverified until the owner route, permissions, and a real Android device are available.

## Build

```bash
gradle :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
```

Run `node --test tests/*.test.mjs` for DOM regression tests. CI checks JVM tests, Android lint, instrumentation compilation, and debug APK build. Android build requires a working SDK and dependency access; instrumentation execution requires an emulator/device. See [relay contract](integration/relay-contract.md) for setup and the [verification boundary](integration-verification.md) for limitations.
