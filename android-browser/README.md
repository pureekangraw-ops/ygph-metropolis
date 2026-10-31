# YGG Observatory — Android Browser + GOVIEW

The Android launcher opens `GoviewHomeActivity`, which reports Android-validated Internet and a read-only public Hub `/health` response separately from owner authentication and provider state. Hub sign-in, work details, and approvals open in the Hub's first-party top-level browser page; the app does not send Hub credentials or make native approval API calls. The existing Browser and GOVIEW Map activities remain available from Home. Target websites run in Cloudflare Browser Run, not GeckoView or an on-device website WebView; the existing Android WebView only renders the hosted Live View.

## Browser Mode
The Browser header has address input, navigation, Observe / invite GO, grant GO control, owner takeover, headless audit, and job receipts. The owner may hide the view while a cloud job works. API session and GO permissions are enforced in a standalone Cloudflare Worker with a Durable Object. The owner token is encrypted in Android Keystore and the UI only accepts HTTPS on workers.dev or yggmetro.com. Without the Worker configured the app shows an explicit setup dialog; GOVIEW stays reachable.

Important: tapping 'ให้ GO ทำ' does not automatically register a ChatGPT remote-browser tool. The Worker plus GO tool connection must be deployed/configured and verified before claiming actual GO autonomy. Headless GO_SCRIPT accepts bounded steps with receipts; it is not a natural-language agent.

## GOVIEW
Existing native map, Map Studio, GPS, route engine, local owner data and update preview remain in the same APK. GOVIEW source is stacked from Draft PR #245 and has not been merged or deployed.

## Replacement
Removed obsolete GeckoRuntime/GeckoView dependency and launcher, Gecko observer service, extension assets, and Gecko-only tests. The Cloudflare controller is in remote-browser; do not paste Cloudflare Secrets into the repository or into chat.

## Build / proof
Node tests: from android-browser run node --test tests/*.test.mjs ../remote-browser/tests/*.test.mjs. Android Gradle: testDebugUnitTest, lintDebug, assembleDebug and emulator. Remote Worker: cd remote-browser && npm install && npm test && npx wrangler deploy --dry-run. CI APK is development-signed; never uninstall the installed owner app merely to resolve a signature mismatch. No real Android handset test, live Cloudflare session, deployed Worker, or registered GO tool is claimed from this source-only build.

See docs/observatory-shared-browser-work.md for API, credentials and remaining integration steps.

The same remote Worker now exposes an owner console at /console and seven stateless MCP tools at /mcp. Cloudflare session recording is owner opt-in and off by default. See remote-browser/WORK_HANDOFF.md for the WORK/TEST boundary.
