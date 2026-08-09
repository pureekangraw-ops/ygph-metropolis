# METROPOLIS × YGPH Visual System — Approved Design

## Goal
Apply the approved production-feasible visual language to the existing YGPH METROPOLIS app without changing money logic, Vault/IndexedDB behavior, state schema, routing contracts, schedule formulas, or durable data semantics.

## Brand hierarchy
- Primary product name: **METROPOLIS**.
- Signature line: **by YGPH — Yggdrasil Personal Helper**.
- Do not replace METROPOLIS with YGPH as the visible product name.
- PWA/app icon uses the approved simplified **M + roof + star** mark. The full YGPH name remains visible in app branding/signature rather than crammed into small navigation icons.

## Visual language
Production-safe dark-first system inspired by the approved concept board:
- Deep Charcoal: `#0F1416`
- Slate: `#1B2326`
- Emerald: `#22C55E`
- Teal: `#14B8A6`
- Gold Accent: `#F5C14A`
- Soft White: `#F7F7F8`

Icons use simple outlined SVG geometry, rounded caps/joins, consistent optical weight, and remain readable at 16/20/24 px. Active navigation uses Emerald; inactive navigation stays muted Soft White/Slate. Gold is an accent, not a status color replacement.

## UI scope
1. Header: compact METROPOLIS title with `by YGPH — Yggdrasil Personal Helper` signature.
2. Home dashboard: retain current four authoritative metrics and their live data sources; restyle cards only.
3. City entry cards: Store, Ride, Ledger, Calendar use the new icon set and compact 2×2 layout.
4. Bottom navigation: Home, Store, Ride, Ledger, Calendar; persistent on app pages, active state clearly indicated.
5. Settings remains accessible from the header/utility path, not promoted into the five-item bottom nav.
6. Utility icons: settings, wallet/balance, stock, task, payment/due and chevrons use the same SVG family where those icons are rendered by the METROPOLIS UI layer.
7. App icon: replace PWA icon artwork with the approved M/roof/star identity while keeping existing icon file names and publication contract.

## Architecture constraints
- Do **not** add `metropolis-r5-5.js` or another additive runtime patch layer.
- `metropolis-v4.js` owns shared METROPOLIS navigation/icon registry and page shell composition.
- `metropolis-r5-4.js` continues to own the authoritative Home dashboard metrics and visible release authority; only presentation markup may be adjusted there.
- `metropolis-r5-4.css` owns the new visual tokens and dashboard/home/nav skin.
- Existing `YGPHRuntime` hooks remain the render/update path; no MutationObserver or render wrapper may be reintroduced.
- Existing durable state is read-only from visual helpers. No temporary state swapping.

## Accessibility / practical limits
- Minimum interactive target: 44 px where the existing layout allows it.
- Icons must have text labels in navigation; icon alone is not the only affordance.
- SVGs use `aria-hidden="true"` when adjacent text provides the accessible name.
- No remote fonts, images, or libraries; CSP remains self-contained/offline.
- CSS must work on the current Android/PWA mobile layout and degrade cleanly on desktop.

## Publication
- Keep current production file contract aligned across `RELEASE_MANIFEST.json`, `.assetsignore`, and `sw.js`.
- Advance the Service Worker release generation when production CSS/JS/icon assets change so installed PWAs receive the new visual system.
- Existing encrypted data release/provenance values are not changed by this UI rollout.

## Verification
- Add contract tests for brand hierarchy, bottom-nav composition, icon registry, no new runtime observer/wrapper, and publication asset alignment.
- Run full `npm run deploy:gate` before merge.
- Read back the merged `main` files before claiming completion.