# METRO Command Strip + Dashboard Design

**Product:** YGPH METROPOLIS only  
**Scope:** personal Metro shell / navigation / Home projection UX  
**Baseline:** `main` 5.2.6 Greenfield runtime  
**Important boundary:** NormalPocket is a separate general-purpose product and is out of scope.

## Goal

Turn METRO into a compact personal cockpit without changing domain truth, persistence, mutation semantics, or financial ownership.

The visible shell becomes:

- one sticky top command strip anchored to the YGPH brand mark;
- icon-only direct entrances for Store, Ride, Finance, and Settings;
- a small floating Home bubble rather than a permanent Home tab;
- no bottom navigation;
- four Home summary cards that are actionable shortcuts;
- no redundant city-entry block below the dashboard;
- a 7-day real-cash In/Out chart on Home;
- Calendar remains a `CALENDAR` domain internally but its visible surface is embedded inside Finance rather than remaining a top-level destination;
- one theme authority with area-specific accent tokens and red reserved for genuine alerts/errors.

## Architecture Boundary

The change follows existing Greenfield ownership rather than adding a new UI layer over it.

- `index.html` owns the structural shell: command strip, Home bubble, Home dashboard containers, Finance-embedded Calendar surface.
- `ui/app.mjs` remains the composition root and owns global routing, active-area state, Calendar orchestration, and context construction.
- `ui/home-ui.mjs` renders Home projections and chart from data supplied by the composition root. It must not read durable state directly.
- `ui/product-model.mjs` exposes UI-facing projections only.
- `greenfield/calculation-authority.mjs` remains the authority for financial classification. A 7-day cash-flow series must be derived here so UI code does not duplicate transaction direction or balance-adjustment rules.
- `ui/icons.mjs` remains the local icon source. No external icon dependency is added.
- `theme.css` remains the single visual token authority. Area colors are accents inside one theme, not independent city themes.

No change is allowed to Store, Ride, Ledger, Calendar record ownership, vault format, database identity, mutation coordinator, or payment workflow semantics.

## Navigation Root

### Top command strip

The existing app bar becomes the persistent navigation owner. After the YGPH mark it contains four icon-only controls:

1. Store — storefront/cart family icon
2. Ride — running-person icon
3. Finance — wallet icon
4. Settings — gear icon

Every control keeps an accessible `aria-label`; text labels are not visually rendered in the strip. The current work area is indicated with its own area accent and a non-color affordance such as border/indicator/pressed state.

### Home bubble

Home is removed from permanent navigation and becomes a small fixed bubble inside the workspace safe area. It routes directly to Home. It may visually quiet/hide while already on Home, but the Home route itself remains first-class.

### Removed roots

The following are removed rather than merely hidden:

- `#bottomNav` and its event-binding contract;
- `.workspace-toolbar` area-name + Settings row;
- `#cityEntries` Home city-door block.

This prevents duplicate navigation authorities.

## Routing and Calendar / Finance Integration

Visible top-level areas become only:

`home | store | ride | finance`

`CALENDAR` remains a valid domain and routing intent, but not a visible top-level area.

Any route targeting `CALENDAR` must:

1. preserve requested date / record context;
2. activate `finance`;
3. render Calendar state;
4. focus or scroll the embedded Finance schedule section.

The existing Calendar UI (month grid, overdue/near/collision metrics, selected date, filters, queue actions, edit/cancel dialogs) is physically nested inside Finance in the DOM. Calendar action execution continues through the existing `resolveCalendarAction` and runtime methods.

This is a UX ownership change only: Finance hosts the time/queue surface; `CALENDAR` remains the data owner of scheduling/action-queue truth.

## Home Dashboard Shortcuts

The four summary cards remain projections but become buttons with explicit routing:

- **เงินสดคงเหลือ** → Finance
- **สร้างได้วันนี้** → the earning owner selected deterministically from the existing Store/Ride breakdown: route to Ride when Ride generated income is greater than Store; otherwise Store. The card exposes its current destination to assistive text so the route is not hidden behavior.
- **สต็อก** → Store
- **ใกล้ครบกำหนด** → Finance schedule section

The route decision for generated income uses the existing `projectGeneratedIncome` breakdown; no new financial meaning is introduced.

## Cash In / Out Chart

Home gains one wide 7-day chart after the 2×2 summary grid.

Source truth is Ledger `TRANSACTION` records only:

- classify IN/OUT with the same authority already used by financial truth;
- exclude `BALANCE_ADJUSTMENT` from both In and Out;
- group by Bangkok local day;
- return exactly the requested rolling date range, including zero-value days;
- chart uses actual cash movement, not generated income.

The chart shows:

- 7 daily groups;
- In and Out values per day;
- compact totals / legend;
- text fallback / accessible labels so meaning does not rely only on color.

Implementation may use lightweight SVG/CSS only; no chart dependency or canvas library.

## Visual System

Graphite remains the quiet base. Add area accents under the single theme authority:

- Store: green/teal
- Ride: clear blue/cyan
- Finance: violet/amber-neutral accent chosen for strong number contrast without implying “good money”
- System/Settings: neutral graphite/silver
- Home: restrained lime/system accent

Dashboard cards use the accent of their destination owner, with low-saturation/tinted surfaces and high-contrast text. Large saturated fills are prohibited.

### Alert semantics

Red is reserved for actual warning/danger states such as:

- overdue items;
- shortfall / insufficient cash when explicitly flagged;
- validation or runtime errors;
- unresolved integrity conditions that block action.

Near/today informational states may retain warning/amber when they are not failures. Warning text must include textual/state meaning in addition to color.

## Page Headers

Remove only the redundant workspace-level context row. City page headers (`STORE / ร้านค้า`, `RIDE / วิ่งงาน`, `FINANCE / เงินจริงและภาระ`) remain as local page identity but become more compact so the sticky command strip is the global navigation authority.

## Accessibility / Mobile

- command controls and Home bubble: minimum 44px touch target;
- icon-only controls have `aria-label`, `title` where useful, and `aria-current` / `aria-pressed` state;
- floating Home bubble respects safe-area insets and must not cover dialogs or bottom content;
- chart has readable text/ARIA summary;
- area color never becomes the sole indication of current location or danger;
- Thai text and numeric truth maintain strong contrast;
- reduced-motion behavior is preserved.

## Release / Publication

This is a client-visible shell change. Existing production publication closure remains authoritative:

- modify existing production files where possible rather than adding runtime files;
- service-worker asset revision/cache identity must update through the repository's existing release contract;
- `RELEASE_MANIFEST.json`, `.assetsignore`, and service-worker shell must remain closed and consistent;
- PR deploy gate must pass before merge;
- after merge, production deployment and real-device readback are separate verification steps.

## Verification Contract

The change is complete only if tests prove all of the following:

1. Metro top-level navigation is command-strip based and contains Store, Ride, Finance, Settings only.
2. There is no `#bottomNav` and no obsolete `.bottom-nav-btn` event-binding path.
3. Home bubble routes Home and does not create a second navigation system.
4. Calendar is not a top-level `area-page`; it is nested under Finance while `CALENDAR` domain projection/action logic remains intact.
5. `CALENDAR` routes land in Finance schedule with date context preserved.
6. The four Home summary cards have deterministic owner routes.
7. 7-day cash-flow projection classifies real Ledger cash consistently and excludes balance adjustments.
8. Home chart renders from supplied projection data rather than global mutable state.
9. Area accent tokens live in the shared theme authority; real danger/overdue text uses semantic red.
10. Existing Greenfield business, Ride, Store, Finance, Calendar action, persistence, recovery, and service-worker tests remain green.
11. Full `npm run deploy:gate` passes.
12. Diff review confirms no NormalPocket repository/file is involved and no unrelated domain mutation code changed.
13. Production is not called verified until the merged build is deployed and the actual device visibly shows the new Metro shell.
