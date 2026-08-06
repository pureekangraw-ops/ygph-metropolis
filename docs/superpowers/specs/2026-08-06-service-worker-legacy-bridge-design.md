# Service Worker Legacy Cache Rescue

## Problem

Devices that previously opened a `0.1.0-preview.*` release can receive the current
`index.html` from the network while the active legacy service worker serves an old
`app.js` from cache. That mixed runtime fails before the update UI can send
`ACTIVATE_UPDATE`, so the newer waiting service worker never takes control.

## Design

- Give the rescue release a unique cache ID.
- Load a small uncached bootstrap before legacy runtime files so `sw.js` is checked even
  when the cached legacy `app.js` cannot parse, then reload once control changes.
- During install, cache the complete current app shell and verify every response.
- Automatically call `skipWaiting()` only when a legacy preview cache exists and no
  safe-generation lifecycle metadata exists.
- During activation, record the current safe generation first, then delete legacy
  preview caches and claim clients.
- Never register a legacy cache as the rollback generation.
- Keep manual activation behavior for all later safe-generation updates.

## Safety properties

- A failed or incomplete precache cannot take control.
- Unrelated caches cannot trigger automatic activation or be deleted.
- The bridge is one-time because a successful activation writes safe lifecycle state.
- Existing IndexedDB and encrypted vault data are untouched.

## Acceptance

- Regression tests cover trapped legacy, existing safe lifecycle, and unrelated cache cases.
- The full deploy gate and Wrangler dry run pass.
- Production serves the exact committed rescue assets and the app opens, locks, and unlocks.
