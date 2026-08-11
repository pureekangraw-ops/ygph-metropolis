# METROPOLIS Visual Remaster — Engineering Notes

Status: WORKING / VERIFY ON DEVICE BEFORE PRODUCTION-VISUAL CLAIM
Product line: METROPOLIS 4.2.5
Visual release: `v4.2.5-20260811-r22-visual-remaster`
Owner / Final Authority: BIG
Publication PR: #30

## Purpose

Unify Home, Store, Ride, Ledger, Calendar, Settings/Recovery and shared navigation under one visual language without changing business logic, durable state, money ownership, State Schema, IndexedDB identity/version or Vault format.

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
- `--metro-primary` / `--metro-primary-2` — METROPOLIS green.
- `--metro-gold` — secondary/warning.
- `--metro-danger` / `--metro-danger-deep` — destructive action only.
- `--metro-info` — informational state/focus.
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

## TDD / verification evidence

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
8. Offline/reload — r22 shell still renders with icons/styles.

The source/CI state must not be described as pixel-matched to the visual concept until physical-device screenshots are reviewed. Expected implementation target is approximately 85% on first device pass, then refine through visual QA.

## Current pointer for the next worker

Start from `main` after PR #30 is merged. Read, in order:

1. `RELEASE_MANIFEST.json`
2. `docs/engineering/METROPOLIS_VISUAL_REMASTER_NOTES.md`
3. `metropolis-remaster-core.js`
4. `metropolis-remaster.js`
5. `metropolis-remaster.css`
6. `tests/metropolis-remaster.test.cjs`

Do not add a new global visual patch layer until these seams are shown insufficient by evidence.
