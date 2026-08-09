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

## Architecture constraints — verified against Current
- Do **not** add `metropolis-r5-5.js` or another additive runtime patch layer.
- `flow-era.js` / `FLOW_ICONS` is the single shared SVG geometry authority. Core METROPOLIS and utility icons consume it instead of creating another registry.
- `index.html` owns the single bottom-navigation source structure. It contains exactly Home, Store, Ride, Ledger and Calendar.
- `metropolis-v4.js` owns METROPOLIS shell composition, visible brand hydration, icon consumption, and synchronization of the existing bottom-nav active state. It does not create a second nav.
- `metropolis-r5-1.js` is compatibility-only for the launcher and delegates icon rendering to `FLOW_ICONS`; it no longer owns SVG geometry.
- `metropolis-r5-4.js` continues to own the authoritative Home dashboard metrics and visible release authority; only presentation markup is adjusted there.
- `metropolis-r5-4.css` owns the approved final visual tokens and dashboard/Home/nav skin.
- `flow-era-3.5.js` identifies bottom-nav destinations from `data-page`, not human-language labels.
- Existing `YGPHRuntime` hooks remain the render/update path; no MutationObserver or render wrapper may be reintroduced.
- Existing durable state is read-only from visual helpers. No temporary state swapping.

## Accessibility / practical limits
- Minimum interactive target: 44 px where the existing layout allows it.
- Icons have text labels in navigation; icon alone is not the only affordance.
- SVGs use `aria-hidden="true"` when adjacent text provides the accessible name.
- No remote fonts, images, or libraries; CSP remains self-contained/offline.
- The approved dark treatment is strongest on Home and shared chrome. Existing Store/Ride/Ledger form surfaces are not globally recolored because their proven inputs still use legacy light-field assumptions.
- CSS must work on the current Android/PWA mobile layout and degrade cleanly on desktop.

## Publication
- Keep current production file contract aligned across `RELEASE_MANIFEST.json`, `.assetsignore`, and `sw.js`.
- Production UI changes advance the Service Worker cache/release generation so installed PWAs receive new CSS/JS/icon bytes.
- Product version `4.2.4` remains the visible product release for this visual-only rollout; cache generation advances independently.
- Existing encrypted data release/provenance values are not changed by this UI rollout.

## Verification
- Contract tests cover brand hierarchy, the shared icon authority, single bottom-nav composition, no new runtime observer/wrapper, app-icon dimensions, and publication asset alignment.
- Run full `npm run deploy:gate` before merge.
- Read back the merged `main` files before claiming completion.
