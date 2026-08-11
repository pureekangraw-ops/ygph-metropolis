# METROPOLIS Visual Remaster — Engineering Notes

Status: WORKING / VERIFY ON DEVICE BEFORE PRODUCTION-VISUAL CLAIM
Product line: METROPOLIS 4.2.5
Visual release: `v4.2.5-20260811-r23-metro-visual-system`
Owner / Final Authority: BIG
Publication PR: pending from `feat/metro-visual-system-v2`

## Purpose

Unify Home, Store, Ride, Ledger, Calendar, Settings/Recovery and shared navigation under Metro Visual System V2 without changing business logic, durable state, money ownership, State Schema, IndexedDB identity/version or Vault format.

The approved direction is a dark premium METROPOLIS system with green as the primary/action color, gold as the secondary/warning color, orange/red reserved for destructive paths and blue for informational state.

## Continuation map — do not rewire the app

Future visual work should extend this slice instead of stacking another general-purpose CSS/runtime layer or inserting icon markup into `app.js`.

- `metropolis-remaster-core.js` — pure icon geometry authority. 24×24 viewBox, 1.8 stroke, rounded caps/joins. No DOM or state access.
- `metropolis-remaster.js` — UI-only hydration/adapter. Uses existing DOM and `YGPHRuntime` hooks; it must not write durable data or call persistence APIs.
- `metropolis-remaster.css` — final visual token/component layer for all major pages.
- `tests/metropolis-remaster.test.cjs` — visual architecture, publication and compatibility contracts.
- `flow-era.js / FLOW_ICONS` — legacy compatibility registry. The remaster adapter synchronizes production glyphs into it; do not create a second navigation tree.
- `sw-bootstrap.js` — load remaster after Maintenance so the final visual layer can style Maintenance-generated DOM.
- `.assetsignore` + `package.json` + `sw.js` + `RELEASE_MANIFEST.json` — atomic publication contract.
- `scripts/verify-utf8.mjs` — derives text assets from `RELEASE_MANIFEST.json`; do not restore a hard-coded production filename list.

## Icon contract

- Grid: `0 0 24 24`.
- Stroke: `1.8`.
- Caps / joins: round.
- Active navigation: green icon + green-tinted container.
- Inactive navigation: muted neutral.
- Gold is for secondary/utility/warning semantics, not every icon.
- Orange/red is reserved for danger/destructive actions.
- Do not use emoji as the authoritative icon for a remastered control when a registry icon exists.
- New reusable glyphs belong in `metropolis-remaster-core.js`; consumers request them by semantic name.

Current semantic families include navigation, wallet/stock/task/payment, Store operations, customer/report/notification, reset/security/info/help, cash direction, and the four Recovery levels.

## Visual token contract

Primary tokens live in `metropolis-remaster.css`:

- `--metro-bg`, `--metro-bg-deep` — application background.
- `--metro-surface`, `--metro-surface-2`, `--metro-surface-3` — component elevation.
- `--metro-text`, `--metro-text-secondary`, `--metro-muted` — readable content hierarchy on every dark surface.
- `--metro-primary` / `--metro-primary-2` — METROPOLIS green.
- `--metro-gold` — secondary/warning.
- `--metro-danger` — destructive action only.
- `--metro-info` — informational state/focus.
- `--metro-store`, `--metro-ride`, `--metro-ledger`, `--metro-calendar` — page identity without changing shared component structure.
- `--metro-touch` and `--metro-gutter` — minimum touch target and responsive mobile spacing.
- Shared border, radius, shadow and glow tokens keep cards/buttons visually related.

Every major page is explicitly covered: Home, Store, Ride, Ledger, Calendar, Settings, Report and Sync. The bottom navigation is one shared visual component.

## Runtime boundary

`metropolis-remaster.js` is presentation-only.

Allowed:
- replace/hydrate icon markup;
- add visual classes/data markers;
- use existing `YGPHRuntime` post-render/page/report hooks;
- synchronize the compatibility icon registry;
- decorate controls already owned by existing business/Maintenance code.

Not allowed:
- assign or replace business `state`;
- call `persistAndRender` or write IndexedDB;
- create Ledger/Store/Ride/Calendar transactions;
- duplicate source text/business rules from Maintenance merely to style them;
- create another bottom-navigation source.

## Recovery visual hierarchy

Recovery remains owned functionally by Maintenance. Visual Remaster only decorates its stable IDs/structure.

1. Reconcile — green, safest/default path.
2. Partial Reset — gold, bounded operational reset.
3. Factory Reset — orange, destructive local-data reset.
4. Full Local Cleanup — red, strongest local cleanup.

This solves the previous low-contrast / visually-drooping Settings screen without moving reset business logic into the visual layer.

## Publication rule

Any new production visual asset must be wired atomically through:

1. runtime loader (`sw-bootstrap.js`),
2. Cloudflare allowlist (`.assetsignore`),
3. syntax gate where applicable (`package.json`),
4. Service Worker `APP_SHELL`,
5. `RELEASE_MANIFEST.json`,
6. regression tests.

UTF-8 coverage follows `RELEASE_MANIFEST.json.productionFiles` automatically for text assets.

## Bug / fix log

### VBUG-001 — Visual contract duplicated Recovery copy

**Symptom:** First GREEN implementation still failed one visual test because the test required the literal text `Recovery & Reset` inside the visual adapter.

**Root cause:** The test accidentally made the visual layer a second owner of content already owned by Maintenance. Copying the phrase into the adapter would satisfy the test but create duplicate ownership and future drift.

**Fix:** Bind the visual contract to stable Maintenance structure/IDs (`maintenanceRecoveryCard` and action button IDs), not copied prose.

**Prevention:** Content/business semantics stay with their owning module. Visual tests assert stable integration seams, not duplicated user-facing copy from another owner.

### VBUG-002 — UTF-8 gate gave false confidence with a stale 21-file list

**Symptom:** A full PR gate passed 141 tests and syntax, but the UTF-8 log still reported only `21 production files` even though later R5, Maintenance and Remaster assets existed.

**Root cause:** `scripts/verify-utf8.mjs` contained a manually maintained hard-coded filename array from an older release.

**Fix:** Derive UTF-8 text assets from `RELEASE_MANIFEST.json.productionFiles`, filter text extensions, deduplicate, and verify the Release Manifest itself before parsing it.

**Prevention:** Release Manifest is now the filename authority. Adding/removing a production text asset changes UTF-8 coverage automatically. Regression explicitly rejects a literal hard-coded production list.

### VBUG-003 — UTF-8 regression initially rejected the correct dynamic array

**Symptom:** After VBUG-002 was fixed correctly, the new regression still failed because it rejected any `const productionFiles = [` syntax, including `[...new Set(manifest.productionFiles...)]`.

**Root cause:** The negative regex described JavaScript syntax rather than the actual failure mode (a literal filename list).

**Fix:** Narrow the regression to reject only a literal string array after `productionFiles`, while positively requiring `manifest.productionFiles` and `TEXT_ASSET_PATTERN`.

**Prevention:** Tests should encode the undesirable behavior, not incidental syntax used by the correct implementation.

### VBUG-004 — Historical Maintenance test could become a second Current-release owner

**Symptom:** Advancing the Service Worker from r21 Maintenance to r22 Visual Remaster would make an old exact-r21 publication assertion fail even though Maintenance assets remained valid.

**Root cause:** A historical layer test owned the exact Current release generation in addition to the latest publication test — the same class of release-ownership drift previously observed in Maintenance BUG-006.

**Fix:** Maintenance now asserts its assets/order plus `SW ↔ manifest` consistency and the compatible 4.2.5 line. The exact r22 id is owned by the current Visual Remaster publication test.

**Prevention:** Exactly one test owns the exact Current generation; older layers verify only their own contracts and ordering.

### VBUG-005 — Legacy light surfaces and final dark text produced unreadable device screens

**Symptom:** Physical-device screenshots from r22 showed a white page app bar with a nearly invisible Thai title, primary hero values that blended into the dark card, a white Ride round panel, and a white Calendar focus/swipe surface carrying light text.

**Root cause:** The app loads several historical visual layers before `metropolis-remaster.css`. Legacy rules still used light backgrounds and some used `!important` with selectors more specific than the r22 remaster rules. In particular, `.metropolis-app-bar` remained light, `.hero .hero-value` overruled the generic remaster value color, `.flow-round-panel` kept its legacy white Ride surface, and `flow-era.css` forced the Calendar focus/swipe cards back to light surfaces.

**Fix:** Rebuild the existing final `metropolis-remaster.css` authority as Metro Visual System V2. Add scoped final rules for `.metropolis-v4 .metropolis-app-bar`, `.metropolis-v4 .hero .hero-value`, `.metropolis-v4 #ridePage .flow-round-panel`, `#calendarPage .flow-calendar-focus` and `#calendarPage .flow-swipe-card`, then apply the same token hierarchy to chrome, cards, actions, records, forms, Calendar and navigation. No additional global CSS/runtime layer was created.

**Prevention:** Device-proven conflicts are regression-locked by selector-level contracts. Removing any scoped final override must fail the remaster test before publication. The r22 screenshots are retained as RED evidence, not as proof of the r23 result.

## TDD / verification evidence

- r23 RED reproduced the device failures as three contract failures: missing scoped app-bar authority, missing V2 tokens/hierarchy, and the still-r22 release id.
- Metro Visual System V2 made the cascade and hierarchy contracts GREEN; the release-id test intentionally remained RED until r23 publication metadata was advanced.
- A second authenticated-shell audit closed nested legacy surfaces in Ride rounds, End-day modal rows, audit summaries, import review, queue metadata and technical pipeline cards. Checkbox/radio sizing is explicitly exempted from the full-width text-field rule.
- Local CSS/source inspection passed without whitespace errors or forbidden light `background:#fff` declarations in the final authority.
- `LOCAL_VISUAL_RENDER=BLOCKED_NO_BROWSER`: this environment has no installed Chromium/Chrome/Firefox binary. Do not substitute source inspection for physical-device evidence.
- Fresh r23 deployment gate: `144/144` tests passed, `0` failed; the complete production JavaScript syntax chain passed; UTF-8 verified `32 production text assets + RELEASE_MANIFEST.json`.
- Compatibility constants rechecked after the gate: State Schema `4`, IndexedDB `stock-pocket-secure` version `1`, Vault format `1`, and money unit `INTEGER_SATANG`.
- Historical r22 evidence follows:
- Initial contract-only RED: new visual tests failed because remaster files/publication wiring did not exist yet.
- First implementation GREEN reached 141/141 tests, but review caught stale UTF-8 coverage from the log; this was not accepted as final.
- UTF-8 manifest-derived regression was added and observed RED before the production verifier was changed.
- After verifier implementation, an over-broad test regex produced VBUG-003 and was corrected at the test layer.
- Fresh gate on the corrected head: `142/142` tests passed, `0` failed; full syntax chain passed; UTF-8 verified `32 production text assets + RELEASE_MANIFEST.json`.

## Device visual QA required before claiming the mockup target is achieved

After deployment/activation, capture and inspect at least:

1. Home — dashboard cards, header brand, bottom navigation.
2. Store — dark hero, sale/purchase/withdraw/reconcile actions, latest list.
3. Ride — hero/action controls/list hierarchy.
4. Ledger — balance/readability/in-out action colors.
5. Calendar — month grid, status signals, selected day, bottom navigation.
6. Settings/Recovery — title contrast and four-level green/gold/orange/red hierarchy.
7. Modals — forms, destructive confirmation, focus/disabled states.
8. Offline/reload — r23 shell still renders with icons/styles.

The source/CI state must not be described as pixel-matched or Production Visual Verified until fresh r23 physical-device screenshots are reviewed. Expected implementation target is approximately 85% on first device pass, then refine through visual QA.

## Current pointer for the next worker

While r23 is in review, start from `feat/metro-visual-system-v2`; after merge, start from `main`. Read, in order:

1. `RELEASE_MANIFEST.json`
2. `docs/engineering/METROPOLIS_VISUAL_REMASTER_NOTES.md`
3. `metropolis-remaster-core.js`
4. `metropolis-remaster.js`
5. `metropolis-remaster.css`
6. `tests/metropolis-remaster.test.cjs`

Do not add a new global visual patch layer until these seams are shown insufficient by evidence.
