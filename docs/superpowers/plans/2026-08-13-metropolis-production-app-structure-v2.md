# METROPOLIS Production App Structure v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the experimental right-rail / Make Money top-level shell with the approved production flow `Unlock → Home → Store/Ride/Finance/Calendar`, preserving all Greenfield security, persistence, and domain contracts.

**Architecture:** Keep runtime/domain workflows unchanged. Recompose only `index.html`, `styles.css`, and `ui/app.mjs`; use existing projections for Home. Settings becomes a utility. GitHub branch `feature/production-app-structure` is the isolated workspace and GitHub Actions is the test runner.

**Tech Stack:** Static HTML/CSS, browser ES modules, Node `node:test`, GitHub Actions deploy gate.

## Global Constraints
- Keep the hardened one-password + Recovery Code contract.
- No DB/Vault/schema/crypto/domain-owner changes.
- Primary destinations: Home, Store, Ride, Finance, Calendar.
- System/Settings is a utility, not a primary navigation item.
- No persistent side rail or right-side width reservation on mobile.
- Home order: attention → summary → city doors → secondary information.
- Home and navigation do not mutate business state.
- Existing Store/Ride/Finance/Calendar workflow method calls remain unchanged.

### Task 1 — RED shell contract
**Modify:** `tests/greenfield-functional-shell.test.cjs`

- [ ] Require `#bottomNav` with exactly five `data-destination` buttons in order `home,store,ride,finance,calendar` and labels `หน้าหลัก,ร้านค้า,วิ่งงาน,การเงิน,ปฏิทิน`.
- [ ] Require no `#thumbRail`, `.rail-btn`, `data-area="money"`, `data-area-page="money"`, `data-money-page`, `moneyChildToggle`, or `moneyChildren`.
- [ ] Require one area page each for `home,store,ride,finance,calendar,system`; require `#settingsBtn` outside primary nav.
- [ ] Require Home ordering `#attentionList` before `#homeSummary` before `#cityEntries`; require `homeBalance`, `homeGenerated`, `homeStock`, `homeDue`; require city doors `store,ride,finance,calendar`; Home contains no business mutation form above those sections.
- [ ] Require CSS `.bottom-nav` fixed to bottom, `.bottom-nav-btn` min-height >=48px, no `.thumb-rail`, and no mobile `padding-right:76px`.
- [ ] Commit tests and open Draft PR. Observe GitHub Actions RED before production UI changes.

### Task 2 — HTML production shell
**Modify:** `index.html`

- [ ] Replace right rail with `#workspaceContext` + `#settingsBtn` toolbar and `#bottomNav`.
- [ ] Expand Home with four compact summary values and four city-entry navigation buttons.
- [ ] Move daily goal display/form to secondary Home content; keep `goalForm`, `moneyGoal`, `moneyRemaining`, `moneyProgress` IDs.
- [ ] Promote existing Store markup from nested Make Money view to `data-area-page="store"`; keep all Store form/list IDs unchanged.
- [ ] Promote existing Ride markup to `data-area-page="ride"`; keep all Ride form/list IDs unchanged.
- [ ] Remove Make Money wrapper/dashboard/child navigation and back-to-money/source controls.
- [ ] Keep Finance, Calendar, and System owner content in place.

### Task 3 — Routing and projections
**Modify:** `ui/app.mjs`

- [ ] Remove `activeMoneyView`, `activateMoneyView`, Make Money child-nav/source listeners, and Make Money dashboard rendering only.
- [ ] `activateArea(area)` manages `.bottom-nav-btn[data-destination]`, area pages, `#workspaceContext`, and Calendar rendering.
- [ ] Map existing deep links: `MAKE_MONEY+store → store`, `MAKE_MONEY+ride → ride`, while HOME/CALENDAR/FINANCE/SYSTEM keep their owner route.
- [ ] Home renders existing projections into `homeBalance`, `homeGenerated`, `homeStock`, `homeDue`, daily goal values, and attention list.
- [ ] Bind city-entry buttons to navigation only; bind `settingsBtn` to `system`.
- [ ] Split old `renderMoney` into `renderStore` and `renderRide`; do not alter any business form submit/runtime method call.

### Task 4 — Mobile shell CSS
**Modify:** `styles.css`

- [ ] Delete `.thumb-rail`, `.rail-btn`, mobile right padding, and wide-screen rail compensation.
- [ ] Add fixed five-column `.bottom-nav` with safe-area bottom padding and >=48px touch targets.
- [ ] Give `.workspace-content` bottom padding for nav, never right reservation.
- [ ] Add compact Home summary/city-door grids; city doors contain labels/meaning, not duplicate numeric dashboards.

### Task 5 — Release truth and GREEN gate
**Modify:** `RELEASE_MANIFEST.json`; `sw.js` only if gate requires asset revision.

- [ ] Set `functionalShell.areas` to `HOME,STORE,RIDE,FINANCE,CALENDAR`, add `utilities:[SYSTEM]`, set `navigation:BOTTOM_NAV`.
- [ ] Run PR Gate. If asset revision fails, use the exact expected `sha256-...` from CI and update manifest + `sw.js`; never guess.
- [ ] Require full `npm run deploy:gate` GREEN.
- [ ] Diff audit allowed production changes only: `index.html`, `styles.css`, `ui/app.mjs`, `RELEASE_MANIFEST.json`, gate-required `sw.js`, the shell test, this plan, and the approved design spec.
- [ ] With BIG's explicit Gate authorization, merge only after GREEN + clean diff, then inspect main/Cloudflare workflow result. Device UI remains separate readback evidence.
