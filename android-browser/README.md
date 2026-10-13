# YGG Observatory — Android GeckoView engine

Standalone Android GeckoView browser for the GO Observer. The Gecko implementation is the production launcher; the former WebView implementation remains only for comparison. This project is intentionally separate from `android-shell` / PRISM.

## Implemented in this slice

- One application-level GeckoRuntime with one GeckoSession per tab; HTTPS-only navigation and fail-closed external URL policy.
- The address bar accepts a bare website (such as `www.google.co.th`) and adds `https://` before validation. Explicit non-HTTPS schemes remain blocked; remote command and relay URLs still require absolute HTTPS URLs.
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

## GO-assisted reading and supervised browser actions (October 2026)

The menu now includes **ส่งหน้าเว็บให้ GO** (owner-approved Android Sharesheet with sanitized URL, visible text and labelled controls) and **ช่วยกรอก / ช่วยกด** (local owner-confirmed fill/click on fresh top-frame Gecko DOM targets). Form values, passwords and authentication codes are never exported by this handoff. The browser validates freshness, exact DOM capture identity and target signature again before execution. Clicking submits **a dispatch**, not proof of a completed business operation. Payments, form submissions, deletions, sending, consent and other high-impact controls are blocked.

The native map now provides **ส่งแผนที่ให้ GO** with owner-confirmed sharing of camera center/zoom and up to 100 saved pins. It also provides **ส่งภาพแผนที่** using a real MapLibre bitmap and an Android chooser backed by a private cache-only FileProvider (temporary read permission). Active Station map snapshots include a current viewport report alongside the stored map state, not an image of all rendered tiles or a GPS verification.

Sharing via Android sends to the app the owner chooses; it is **not automatic delivery to this ChatGPT conversation**. Existing Metropolis Station pairings publish observation snapshots in read-only mode. No remote GO-command poller or server-side action authority is enabled by this change. Browser action UI works locally on the handset even without GO OAuth pairing. Device installation and actual ChatGPT-to-device handoff require separate verification.

## Not claimed yet

The relay adapter is deliberately route-configurable: no MCP endpoint, Work ID, credential, or owner-specific route is invented here. Live MCP readback, real-handset installation, Xiaomi 15T acceptance, and production signing remain unverified until the owner route, permissions, and a real Android device are available.

## Build

```bash
gradle :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
```

Run `node --test tests/*.test.mjs` for DOM regression tests. CI checks JVM tests, Android lint, instrumentation compilation, and debug APK build. Android build requires a working SDK and dependency access; instrumentation execution requires an emulator/device. See [relay contract](integration/relay-contract.md) for setup and the [verification boundary](integration-verification.md) for limitations.

