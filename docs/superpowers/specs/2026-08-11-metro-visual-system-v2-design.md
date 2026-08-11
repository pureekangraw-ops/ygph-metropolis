# Metro Visual System V2 Design

Status: OWNER-APPROVED / READY FOR IMPLEMENTATION
Product line: METROPOLIS 4.2.5 (owner-facing short name: Metro)
Owner / Final Authority: BIG
Date: 2026-08-11

## Outcome

Rebuild Metro's complete presentation as one coherent premium dark mobile system while preserving every existing business workflow, durable record, money rule, State Schema, IndexedDB identity/version and Vault format.

The finished interface must make the current page, primary value, supporting metrics and next action immediately readable on a physical phone. It must remove the light-theme remnants and cascade conflicts visible in the r22 device screenshots without creating another global patch layer.

## Evidence and root cause

Physical-device screenshots of Home, Store, Ride, Ledger and Calendar show that the r22 direction is sound but legacy visual layers still win selected cascade conflicts:

- `.metropolis-app-bar` keeps a light surface while its title inherits the remaster's light text;
- the older `.hero .hero-value { color: var(--flow-text) !important; }` selector outranks the current `.hero-value` rule, making the primary value nearly invisible;
- `.flow-calendar-focus` is still forced to white while its copy inherits the new dark-theme text;
- older component rules retain independent light surfaces, spacing and button treatments, so the hierarchy changes from page to page.

This is a presentation ownership problem, not a data or rendering-state failure.

## Chosen approach

Replace the contents of the existing final visual authority, `metropolis-remaster.css`, with a complete V2 token and component system. Reuse the existing HTML, runtime adapters, semantic IDs, icon registry and hook bus. Do not add another stylesheet, navigation tree, page renderer or durable-state adapter.

The final stylesheet may use narrowly scoped, higher-specificity selectors where an earlier production layer uses `!important`. It must not use blanket element rewrites that could change hidden/security behavior.

## Visual system

### Brand and color

- Base: deep charcoal/green-black backgrounds with three dark elevation surfaces.
- Primary: Metro green for the main action and active state.
- Secondary: gold for utility, obligations and bounded warning actions.
- Information: blue for Ride, Calendar focus and non-destructive guidance.
- Danger: orange/red only for destructive or cash-out paths.
- Text: one high-contrast primary token, one readable secondary token and one muted token that remains legible on every dark surface.
- Page accents: Store green, Ride blue, Ledger gold/violet and Calendar blue. Accents identify ownership but do not recolor the whole page.

No white card may remain inside the authenticated application shell. Light surfaces are allowed only where an operating-system control requires them and cannot inherit unreadable text.

### App chrome

- Keep the METROPOLIS brand and existing logo/icon authority.
- Reduce header visual weight while retaining the status line and Settings entry.
- Rebuild `.metropolis-app-bar` as a dark elevated context strip with a readable page title, semantic accent, back control and app icon.
- Keep the existing five-destination bottom navigation as the only navigation source. Use muted inactive states, one clear active capsule and compact safe-area spacing.

### Page hierarchy

Every Store, Ride, Ledger, Calendar, Report, Sync and Settings page follows the same reading order:

1. dark page-context strip;
2. hero with page title and one primary metric or state;
3. supporting metrics in a stable mobile grid;
4. one visually dominant primary action plus quieter peer/destructive actions;
5. records, forms and utilities on dark elevated cards.

Home keeps its current owner-dashboard/data authority but adopts the same tokens, spacing, card hierarchy and icon treatment.

### Components

- Hero: dark layered surface, small ownership accent, explicit contrast for `.hero .hero-value`, and stable 2-column metric cards (3-column only for Calendar's three statuses).
- Actions: solid green primary, bordered dark secondary, gold utility, blue informational and red destructive variants.
- Records and queues: dark cards with readable title/meta/amount and ownership/status accents; no decorative icon should displace core text on narrow screens.
- Calendar: dark focus panel, dark swipe cards, readable route badge, dark month grid and selected-day controls. Green/yellow/red status semantics remain unchanged.
- Forms/modals: dark inputs, labels, placeholders, validation/warnings and confirmation controls with visible focus and disabled states.
- Settings/Recovery: retain Maintenance's four-level hierarchy and stable IDs; Visual Remaster only owns appearance.

### Mobile behavior

- Primary target: the owner's Android viewport represented by the supplied 709×1536 screenshots.
- Support narrow widths down to 340 CSS px without horizontal overflow.
- Preserve safe-area insets and scrolling above the fixed bottom navigation.
- Use responsive type/spacing via bounded `clamp()` values rather than shrinking core copy below readable sizes.
- Keep touch targets at least 44 CSS px where the existing control structure permits.

## Architecture and data flow

The data flow remains unchanged:

`app.js / existing feature layers -> current DOM -> metropolis-remaster.js decoration -> metropolis-remaster.css presentation`

`metropolis-remaster.css` consumes existing classes, semantic IDs and `data-metropolis-page`; it produces presentation only. `metropolis-remaster.js` continues to hydrate icons/classes through existing hooks and must not assign business state, call `persistAndRender`, create transactions or write IndexedDB.

No data migration is required. State Schema stays `4`, IndexedDB stays `stock-pocket-secure` version `1`, and Vault format stays `1`.

## Failure and compatibility behavior

- If the remaster runtime does not hydrate an optional icon, the control text and original event handler remain usable.
- If a legacy selector conflicts, V2 resolves it at the final stylesheet with a scoped selector and a regression assertion; it does not edit historical layer ownership merely for visual convenience.
- `prefers-reduced-motion` disables non-essential motion.
- Focus, disabled, empty and destructive states must remain distinguishable without relying on color alone.
- Existing offline/update/rollback behavior remains authoritative; the visual release advances the Service Worker generation atomically.

## Publication

The change stays within existing production assets. It advances the current release from r22 to r23 and updates the one exact-current release owner across:

- `metropolis-remaster.css`;
- `tests/metropolis-remaster.test.cjs`;
- `sw.js`;
- `RELEASE_MANIFEST.json`;
- `docs/engineering/METROPOLIS_VISUAL_REMASTER_NOTES.md`.

No new runtime asset is introduced, so `sw-bootstrap.js`, `.assetsignore` and `package.json` remain structurally unchanged unless a test proves otherwise.

## Verification

Implementation follows TDD:

1. add failing contracts for the three screenshot-proven conflicts and the V2 component hierarchy;
2. replace the final stylesheet and make those contracts pass;
3. run the focused visual test;
4. run `npm run deploy:gate`;
5. render representative Home, Store, Ride, Ledger and Calendar states at a mobile viewport when a local browser is available;
6. inspect screenshots for readability, overflow, touch hierarchy and absence of light-theme remnants;
7. after deployment, require physical-device readback before claiming Production Visual Verified.

Automated success is all tests/syntax/UTF-8 green with compatibility constants unchanged. Visual success is every supplied failure class rendered readable in a representative mobile render, followed by owner device verification.

## Scope locks

- Do not change business copy merely to satisfy a visual test.
- Do not change Store, Ride, Ledger or Calendar ownership semantics.
- Do not change durable data, migration logic, encryption, trusted-device behavior or reset behavior.
- Do not create a new global CSS/JS patch layer.
- Do not claim pixel match or Production Visual Verified without fresh device evidence.
