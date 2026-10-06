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
- JVM tests and an instrumentation smoke test.

## Not claimed yet

The relay adapter is deliberately route-configurable: no MCP endpoint, Work ID, credential, or owner-specific route is invented here. Live MCP readback, device installation, background-service deployment, and production signing remain unverified until the owner route, permissions, and a real Android device are available.

## Build

```bash
gradle :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
```

The current workspace has Java but no Android SDK/emulator or Gradle executable, so local Android build is a tooling-blocked check. CI is configured to run the Android checks when this directory changes.
