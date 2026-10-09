# Release verification

- JVM unit tests: run in CI.
- Android lint/debug APK: run in CI.
- Emulator instrumentation: pending available emulator.
- BIG device install/navigation/lock/offline/process-restore: BLOCKED until APK and device access are available.
- Live MCP readback: BLOCKED until the owner relay route and authority contract are verified.
- Production signing: not implemented; this project only builds a debug APK for controlled testing.

- Configurable HTTPS relay adapter: implemented, but not live-verified because owner route/authority is unresolved.
- WebView action handoff: allowlisted and foreground-guarded; every receipt keeps business outcome UNKNOWN until a later observation/readback.
- Keystore credential storage: implemented as a revocable Android Keystore boundary; provisioning is not performed by CI.
