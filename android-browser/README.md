# YGG Observatory — Android Browser + GOVIEW

The Android application exposes two core modes, Browser and GOVIEW, plus a dedicated first-party Standalone Workroom screen. Browser is RemoteBrowserActivity; target websites run in Cloudflare Browser Run, not GeckoView or an on-device website WebView. Android WebView in Browser mode only renders the hosted Live View.

## Browser Mode
The Browser header has address input, navigation, a **Web Map** shortcut to `https://observatory-web.pureekangraw.workers.dev/`, Observe / invite GO, grant GO control, owner takeover, headless audit, and job receipts. The shortcut opens the map inside the owner-initiated Cloudflare Browser Run session, not an on-device website WebView. The Web Map's pins remain in that remote browser's local storage; they do not automatically sync with native GOVIEW records.

The **Updates** section is available from Browser and GOVIEW. It checks an owner-configured HTTPS manifest, verifies package identity, version, SHA-256, and signing certificate, then asks for Android's installer consent. It does not silently install updates. Production signing and a release manifest must be configured and verified before app updates can be delivered.

The **Standalone Workroom** entry opens the Factory District PWA in a separate WebView restricted to its configured HTTPS host. Its task/design `localStorage` is local to that WebView and does not sync with Chrome or another device. The existing PWA handoff/import preview remains the source of truth: JSON handoffs and backups, plus SVG/PNG design exports, are written only after the owner chooses a destination in Android's document picker. JSON import uses the platform picker and the PWA still requires owner preview/confirmation before applying results. The bridge imposes a 4 MiB ceiling and accepts only validated JSON, passive SVG, and PNG data; it grants no general filesystem access. This is file-mediated transfer, not live sync or Cloudflare API access.

The owner may hide the view while a cloud job works. API session and GO permissions are enforced in a standalone Cloudflare Worker with a Durable Object. The owner token is encrypted in Android Keystore and the UI only accepts HTTPS on workers.dev or yggmetro.com. Without the Worker configured the app shows an explicit setup dialog; GOVIEW stays reachable.

Important: tapping 'ให้ GO ทำ' does not automatically register a ChatGPT remote-browser tool. The Worker plus GO tool connection must be deployed/configured and verified before claiming actual GO autonomy. Headless GO_SCRIPT accepts bounded steps with receipts; it is not a natural-language agent.

## GOVIEW
Existing native map, Map Studio, GPS, route engine, local owner data and update preview remain in the same APK. GOVIEW source is stacked from Draft PR #245 and has not been merged or deployed.

## Replacement
Removed obsolete GeckoRuntime/GeckoView dependency and launcher, Gecko observer service, extension assets, and Gecko-only tests. The Cloudflare controller is in remote-browser; do not paste Cloudflare Secrets into the repository or into chat.

## Build / proof
Node tests: from android-browser run node --test tests/*.test.mjs ../remote-browser/tests/*.test.mjs. Android Gradle: testDebugUnitTest, lintDebug, assembleDebug and emulator. Remote Worker: cd remote-browser && npm install && npm test && npx wrangler deploy --dry-run. CI APK is development-signed; never uninstall the installed owner app merely to resolve a signature mismatch. No real Android handset test, live Cloudflare session, deployed Worker, or registered GO tool is claimed from this source-only build.

See docs/observatory-shared-browser-work.md for API, credentials and remaining integration steps.

The same remote Worker now exposes an owner console at /console and seven stateless MCP tools at /mcp. Cloudflare session recording is owner opt-in and off by default. See remote-browser/WORK_HANDOFF.md for the WORK/TEST boundary.
