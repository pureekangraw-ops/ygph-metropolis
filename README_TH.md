# YGG Observatory — Shared Browser & GOVIEW

This repository contains **Observatory only**.

## Components

- `android-browser/` — standalone Android Observatory app with Cloudflare shared Browser and native/offline GOVIEW, including tests, docs, and build scripts.
- `remote-browser/` — Cloudflare Browser Run session, invitation/control/revoke and bounded GO tools. Android WebView displays its Live View; GeckoView is historical.
- `goview-package-bridge/` — existing typed selected GeoJSON/Studio transport, with separate role and receipt contracts.
- `observatory-web/worker.mjs` — local-first Observatory map Cloudflare Worker with browser-friendly pin editing and preview-first GeoJSON Point import. Imports remain in browser-local storage; no map upload/sync is added.
- `tests/greenfield-observatory-web.test.cjs`, `tests/geojson-import.test.cjs` — Observatory Web and GeoJSON import regression tests.
- `.github/workflows/android-browser.yml` — Android CI and emulator acceptance.
- `.github/workflows/observatory-web.yml` — Web smoke tests.
- `docs/superpowers/*observatory*` — Observatory engineering design history.

## Test

Run `npm test` for local Node-based tests. Run `cd android-browser && gradle :app:testDebugUnitTest :app:lintDebug :app:assembleDebug` with Android SDK and Gradle installed. Android emulator acceptance runs in CI.

GeoJSON Web Map import behavior and limits: `docs/observatory-web-map-geojson-import.md`.

Current integration and release boundaries: `docs/reviews/observatory-completion-20261026.md` and `docs/reviews/observatory-backlog-inventory-20261026.md`. Source/build/emulator proof is separate from live activation, signing, in-place installation and physical-device acceptance. Map Studio stays a separate design workspace; external Places/routing providers are not yet implemented.

## Deploy

The Android app is built independently from `android-browser/`. Web Map may be deployed manually using `npx wrangler deploy --config wrangler.observatory.jsonc` after confirming Cloudflare account and target. This repository does not automatically deploy a Worker.

## Previous PRISM and LIGHTHOUSE source

The original snapshot is preserved as Git branch `archive/pre-observatory-only-20261014` at commit `cef421d77c428aa0c55590e3982126b55aadc41c`.
Source ZIP archives verified against Git blob hashes are stored in Google Drive:
- PRISM: https://drive.google.com/file/d/1qmmSHwS7wLKwg3AzeNbIWC1f40CbbMKO/view
- LIGHTHOUSE: https://drive.google.com/file/d/1ePWmmNa1bHyWiI87yH-7dNyp9K69jSJ2/view

Previous PRISM and LIGHTHOUSE build/deploy workflows are intentionally absent from the active source tree. Removing these files does **not** uninstall already deployed services or APKs.
