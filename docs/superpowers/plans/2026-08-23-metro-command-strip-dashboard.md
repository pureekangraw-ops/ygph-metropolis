# METRO Command Strip + Dashboard Implementation Plan

> Execute root-to-leaf. Do not merge partial UI overlays. Each task must keep the full Greenfield deploy gate green before the next structural step is considered complete.

**Goal:** Replace Metro's bottom navigation and redundant city doors with a sticky brand command strip, Home bubble, owner-routed dashboard cards, Finance-hosted Calendar surface, and real-cash 7-day In/Out chart while preserving all Greenfield truth/mutation contracts.

**Architecture:** `index.html` is structural truth, `ui/app.mjs` is global navigation/composition authority, financial time-series classification lives in `greenfield/calculation-authority.mjs`, `ui/home-ui.mjs` renders supplied projections, and `theme.css` remains the single visual authority. Calendar data remains in the CALENDAR domain and its existing action orchestration remains in `ui/app.mjs`; only its visible top-level ownership changes to Finance.

---

## Task 1 — Add regression contracts before production changes

**Files:**
- Create: `tests/greenfield-command-strip-dashboard.test.cjs`
- Modify only if needed for projection behavior tests: `tests/greenfield-calculation-authority.test.cjs`

**Assertions:**
- expected top command strip structure and icon-only destinations;
- no `#bottomNav`, no `.bottom-nav-btn` runtime selector, no `#cityEntries`;
- Home bubble exists;
- Calendar DOM is Finance-nested rather than top-level area;
- `CALENDAR` routing maps to Finance schedule;
- four summary cards have route ownership metadata;
- chart container exists and Home renderer consumes supplied cash-flow context;
- area token names and semantic overdue/error red rules exist;
- cash-flow projection groups IN/OUT, excludes balance adjustment, fills zero days.

Run `npm run deploy:gate` and confirm RED for the intended missing behaviors.

## Task 2 — Move cash-flow classification to calculation authority

**Files:**
- Modify: `greenfield/calculation-authority.mjs`
- Modify: `ui/product-model.mjs`
- Modify: `ui/app.mjs`
- Tests from Task 1

**Steps:**
1. Add `projectCashFlowSeries(state, today, days=7)` alongside existing financial projections.
2. Reuse internal `ledgerDirection`, `activityDate`, and `isBalanceAdjustment` rules rather than duplicating them.
3. Return ordered day entries `{date,inSatang,outSatang}` with zero days included.
4. Expose through product-model.
5. Add result to `buildContext()` as `cashFlow`.
6. Run projection tests and full gate.

## Task 3 — Replace navigation root structurally

**Files:**
- Modify: `index.html`
- Modify: `ui/app.mjs`
- Modify: `ui/theme-shell.mjs`
- Modify: `ui/icons.mjs` only if an existing icon cannot express the chosen Store/Finance controls

**Steps:**
1. Restructure `.appbar` into YGPH brand + `#commandNav` with Store, Ride, Finance icon buttons and Settings icon button.
2. Remove `.workspace-toolbar` entirely.
3. Remove `#bottomNav` entirely.
4. Add `#homeBubble` inside workspace with house icon and accessible label.
5. Replace `activateArea` bottom-nav selector with command-nav state management.
6. Bind command buttons and Home bubble directly to existing area activation/settings functions.
7. Keep city page identities local; do not manufacture a second header.
8. Run shell/navigation tests and full gate.

## Task 4 — Integrate Calendar visible surface into Finance at the DOM root

**Files:**
- Modify: `index.html`
- Modify: `ui/app.mjs`
- Existing Calendar tests must remain green

**Steps:**
1. Move Calendar metrics/month/list markup physically inside the Finance area as a `#financeSchedule` section.
2. Remove standalone `data-area-page="calendar"` ownership.
3. Keep Calendar dialog IDs and action controls unchanged.
4. Add route normalization so `CALENDAR` intent preserves date/record context, activates Finance, renders Calendar, and focuses `#financeSchedule`.
5. Ensure direct Finance navigation does not automatically jump to schedule.
6. Ensure `financeOpenNextDue`, Home attention, collision, and other existing Calendar targets continue to resolve through the alias.
7. Run Calendar/action/Finance/full gate.

## Task 5 — Turn Home summaries into owner shortcuts and remove duplicate city doors

**Files:**
- Modify: `index.html`
- Modify: `ui/home-ui.mjs`
- Modify: `ui/app.mjs` only for context/route helper if needed

**Steps:**
1. Replace Home summary `article` elements with accessible button-like summary controls while preserving value IDs.
2. Cash → Finance.
3. Generated → deterministic current owner using existing `money.storeSatang` vs `money.rideSatang` (Ride only when Ride is greater; Store otherwise). Expose destination in accessible copy/title.
4. Stock → Store.
5. Near due → Finance schedule.
6. Remove `#cityEntries` from HTML and its event-binding path.
7. Keep attention routing unchanged except for Calendar alias resolution.
8. Run Home/functional/full gate.

## Task 6 — Add the 7-day actual-cash chart

**Files:**
- Modify: `index.html`
- Modify: `ui/home-ui.mjs`
- Modify: `styles.css` and/or `theme.css`

**Steps:**
1. Add a wide Home chart card after the 2×2 summaries.
2. Render lightweight SVG/CSS bars from `context.cashFlow`; no dependency, no canvas.
3. Show In/Out legend and totals plus per-day accessible labels.
4. Handle all-zero data with a quiet but explicit zero-state.
5. Preserve mobile width and avoid horizontal overflow.
6. Run Home/UI/full gate.

## Task 7 — Implement one-authority area accents and warning semantics

**Files:**
- Modify: `theme.css`
- Modify: `styles.css` only for structural layout dimensions
- Modify: `ui/app.mjs` to stamp current area on workspace/body if needed

**Steps:**
1. Add shared tokens for Home, Store, Ride, Finance, System accent identities under `theme.css`.
2. Command nav active state gets destination accent plus structural indicator.
3. Home owner cards use low-saturation destination tint and high-contrast text.
4. Finance schedule uses Finance host identity while Calendar temporal states remain semantically distinct.
5. Apply red to genuine overdue/error/blocking-integrity text; keep near/today warning states non-red unless actually dangerous.
6. Verify text contrast manually from token values and preserve focus-visible treatment.
7. Remove obsolete bottom-nav CSS rather than leaving dead active styles as the apparent authority.
8. Run theme/UI/full gate.

## Task 8 — Publication / Service Worker closure

**Files:**
- Modify: `RELEASE_MANIFEST.json` only if required by existing hash/revision contract
- Modify: `sw.js` asset revision/cache identity as required by deploy gate
- Modify: `.assetsignore` only if publication closure demands it
- Do not add new runtime production files unless unavoidable

**Steps:**
1. Run full `npm run deploy:gate` and inspect exact release/asset-revision failures.
2. Update asset revision/cache identity through the repo's current contract, not an ad-hoc cache bypass.
3. Re-run full gate.
4. Verify manifest/assetsignore/SW closure.

## Task 9 — Final root-to-leaf verification and PR

**Verification:**
- `npm run deploy:gate` fresh PASS.
- Inspect diff: only Metro repo; no NormalPocket files/repo; no unrelated mutation/persistence/domain changes.
- Confirm removed roots are actually gone (`bottomNav`, `cityEntries`, workspace-toolbar nav authority).
- Confirm every removed route has a destination (`CALENDAR` → Finance schedule, Home → bubble, Settings → command strip).
- Confirm four summary cards route to live owners.
- Confirm chart values originate at calculation authority.
- Confirm warning red is semantic, not decorative.
- Open PR from `feat/metro-command-strip-dashboard` to `main` only after all tests pass.
- Wait for Greenfield deploy gate success before merge.
- After merge, read back `main`, verify production deployment separately, then ask for/inspect real-device screenshot before claiming device completion.
