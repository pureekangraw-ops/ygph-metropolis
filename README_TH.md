# YGG Observatory — Android GeckoView & Web Map

This repository contains **Observatory only**.

## Components

- `android-browser/` — standalone Android GeckoView Observatory app, including tests, docs, and build scripts.
- `observatory-web/worker.mjs` — local-first Observatory map Cloudflare Worker.
- `tests/greenfield-observatory-web.test.cjs` — Observatory Web regression tests.
- `.github/workflows/android-browser.yml` — Android CI and emulator acceptance.
- `.github/workflows/observatory-web.yml` — Web smoke tests.
- `docs/superpowers/*observatory*` — Observatory engineering design history.

## Test

Run `npm test` for local Node-based tests. Run `cd android-browser && gradle :app:testDebugUnitTest :app:lintDebug :app:assembleDebug` with Android SDK and Gradle installed. Android emulator acceptance runs in CI.

## Deploy

The Android app is built independently from `android-browser/`. Web Map may be deployed manually using `npx wrangler deploy --config wrangler.observatory.jsonc` after confirming Cloudflare account and target. This repository does not automatically deploy a Worker.

## Previous PRISM and LIGHTHOUSE source

The original snapshot is preserved as Git branch `archive/pre-observatory-only-20261014` at commit `cef421d77c428aa0c55590e3982126b55aadc41c`.
Source ZIP archives verified against Git blob hashes are stored in Google Drive:
- PRISM: https://drive.google.com/file/d/1qmmSHwS7wLKwg3AzeNbIWC1f40CbbMKO/view
- LIGHTHOUSE: https://drive.google.com/file/d/1ePWmmNa1bHyWiI87yH-7dNyp9K69jSJ2/view

Previous PRISM and LIGHTHOUSE build/deploy workflows are intentionally absent from the active source tree. Removing these files does **not** uninstall already deployed services or APKs.
