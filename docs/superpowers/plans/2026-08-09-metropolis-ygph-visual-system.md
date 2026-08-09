# METROPOLIS × YGPH Visual System Implementation Plan

**Goal:** Put the approved METROPOLIS visual identity and icon system into the real app while preserving all current data/business behavior.

**Verified architecture:** `flow-era.js` / `FLOW_ICONS` owns shared SVG geometry. `index.html` owns the one canonical five-item bottom nav. `metropolis-v4.js` consumes the shared icons, hydrates branding, launcher, header and the existing nav, then synchronizes nav state. `metropolis-r5-1.js` remains compatibility-only and delegates icon rendering. `metropolis-r5-4.js` keeps authoritative dashboard metrics; `metropolis-r5-4.css` owns the final visual skin. Existing production asset and Service Worker contracts remain authoritative.

> The initial draft assumed v4 should create its own icon registry and bottom nav. Root inspection proved both already had owners, so implementation was corrected before production code was finalized. No second registry or second navigation was created.

## Global Constraints

- Primary visible product name: `METROPOLIS`.
- Signature: `by YGPH — Yggdrasil Personal Helper`.
- No `metropolis-r5-5.js`.
- No changes to money formulas, Vault/IndexedDB, state schema, schedule rules, durable state semantics, or Exchange/Audit contracts.
- No MutationObserver or render wrapper.
- Bottom nav: Home, Store, Ride, Ledger, Calendar only.
- Settings stays utility/header route.
- Approved palette: `#0F1416`, `#1B2326`, `#22C55E`, `#14B8A6`, `#F5C14A`, `#F7F7F8`.
- Full `npm run deploy:gate` must pass before merge.

## Completed implementation path

### 1. Contract-first verification
- [x] Added `tests/metropolis-visual-system.test.cjs`.
- [x] Observed RED before implementation.
- [x] Repointed the test to the real owners discovered during root inspection.

### 2. Shared icon authority
- [x] Expanded `FLOW_ICONS` with app, Home, Store, Ride, Ledger, Calendar, Settings, Wallet, Stock, Task, Payment, Chevron and Lock glyphs.
- [x] Changed `metropolis-v4.js` to consume `flowIcon()` rather than own another SVG registry.
- [x] Changed `metropolis-r5-1.js` to delegate to `flowIcon()` and removed its duplicate icon geometry.
- [x] Kept the full YGPH METROPOLIS family name for setup/unlock security context while visible app branding uses METROPOLIS + YGPH signature.

### 3. Existing bottom-nav source
- [x] Kept `index.html` as the only bottom-nav source.
- [x] Reordered it to Home / Store / Ride / Ledger / Calendar.
- [x] Added v4 hydration and `aria-current` / `.is-active` synchronization without observers.
- [x] Changed FLOW 3.5 fallback classification to use `data-page`, not Thai label text.
- [x] Added safe-area bottom padding for Android/PWA.

### 4. Home and shared chrome
- [x] Applied dark approved tokens to shared header, Home dashboard, launcher and bottom nav.
- [x] Preserved `r54Metrics(targetState, today, cashSatang)` behavior and stable dashboard IDs.
- [x] Added shared SVG glyphs to metric cards and compact 2×2 city entry cards.
- [x] Kept Store/Ride/Ledger legacy form surfaces out of the global dark recolor to avoid contrast regressions in proven light input fields.

### 5. App/PWA identity
- [x] Replaced `icon-192.png` and `icon-512.png` using stable filenames.
- [x] Updated `assets/app-icon.svg` to the same M + roof + star source mark.
- [x] Updated `manifest.webmanifest` to `METROPOLIS by YGPH` with Deep Charcoal theme/background.
- [x] Kept manifest/index/offline icon filename contracts unchanged.

### 6. Publication follow-through
- [x] Advanced Service Worker generation to `v4.2.4-20260809-r17-settings-version-authority`.
- [x] Updated `RELEASE_MANIFEST.json` without changing state schema or core data/provenance behavior.
- [x] Updated cache-generation regression tests from r15 to r16 only where the gate identified stale expectations.
- [ ] Run final `npm run deploy:gate` on clean source after temporary transform tools are removed.
- [ ] Inspect full PR diff for unrelated logic changes and confirm no temporary workflow/script remains.
- [ ] Merge only the exact head that passed the full gate.
- [ ] Read back `main` brand, icon authority, nav, dashboard skin, manifest and r16 cache before completion claim.
