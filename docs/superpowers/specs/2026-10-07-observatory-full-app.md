# Observatory installable app

BIG requests the full Observatory Android app, rather than redistributing the existing TEST-only APK. Continue from PR213 cc85fcd; preserve guarded browser relay contracts. No new backend, Worker, fabricated route, Work or authority.

## Result
An installable APK labelled YGG Observatory with HTTPS browsing, usable tab controls, native MapLibre road map, local PMTiles rendering, owner-selected pins/notes/navigation handoff, and Lyra chat alongside the active browser/map. Native toolbar must fit a phone. Lyra uses the captured/redacted context, never a page-provided native bridge; a separately configured HTTPS model connection supplies live replies. The app must distinguish absent credentials, HTTP errors and live readback.

## Architecture
Use MapLibre Android 13.6.1, local vector PMTiles sources and an online OSM raster style. Display attribution, identify app network requests and honour HTTP caching; no bulk download. Preserve journal/executor/receipt boundaries and add LOCAL_OWNER execution distinct from TEST and remote execution. Confirm overlay revision after the SDK source and fully rendered frame agree, not after View.post.

Lyra runs the existing pinned Greenhouse policy/prompts/runtime in a separate trusted asset WebView dialog; public browser WebViews get no native bridge. The native model transport accepts an owner-specified OpenAI-compatible HTTPS endpoint, model and credential, stores credentials in Android Keystore and returns only a bounded reply. Context is obtained natively immediately for each request; model replies cannot execute actions. Expose the existing owner relay setup, without asserting those routes are available merely because the MCP entrance responds.

## Verification
Node policy/bridge regressions; all Android JVM tests, lint, instrumentation compilation and APK build. Add an emulator smoke workflow for native app/navigation/Lyra. Device acceptance on BIG's phone remains an observed result to obtain after installation. Existing production signing ownership is UNKNOWN; do not present a debug-signed binary as a production signature.
