# GO Browser — Android foundation

Standalone Android WebView browser for the GO Observer experiment. This project is intentionally separate from `android-shell` / PRISM.

## Implemented in this slice

- HTTPS-only WebView navigation; cleartext and mixed content are disabled.
- URL bar with back, forward, reload, and new-tab controls.
- Tab store with active-tab selection and URL-only session restore.
- Session restore does not grant control or observer permission.
- Activity lifecycle/power-state check for interactive actions.
- JVM test for URL policy and an instrumentation smoke test.

## Not claimed yet

DOM observation, screenshots, command execution, relay transport, MCP integration, and a signed/released APK are not implemented here. Those require the observer/control contracts and a verified backend path from the attached design.

## Build

```bash
gradle :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
```

The current workspace has Java but no Android SDK/emulator or Gradle executable, so local Android build is a tooling-blocked check. CI is configured to run the Android checks when this directory changes.
