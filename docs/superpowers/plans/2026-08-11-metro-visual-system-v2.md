# Metro Visual System V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Metro's conflicting r22 presentation with one readable premium-dark mobile visual system while leaving all business logic and durable data unchanged.

**Architecture:** Keep `metropolis-remaster.css` as the single final visual authority and strengthen its selectors only where older `!important` rules currently win. Reuse the existing DOM, icon registry, hook bus and navigation; publish the same stable assets under a new r23 Service Worker generation.

**Tech Stack:** Static HTML/CSS/JavaScript PWA, Node.js built-in test runner, Service Worker offline shell, Cloudflare Worker deployment gate.

## Global Constraints

- Product line stays METROPOLIS `4.2.5`; owner-facing short name is Metro.
- State Schema stays `4`.
- IndexedDB stays `stock-pocket-secure` version `1`.
- Vault format stays `1`.
- Store, Ride, Ledger and Calendar ownership semantics do not change.
- No new global CSS/JS patch asset, navigation tree, page renderer or persistence adapter.
- No business-copy changes solely for visual testing.
- Physical-device readback is required before claiming Production Visual Verified.

## File map

- `tests/metropolis-remaster.test.cjs` — owns V2 visual conflict, component and exact-current release contracts.
- `metropolis-remaster.css` — single final token/component visual authority; rewritten in place.
- `sw.js` — owns current cache generation and offline shell behavior.
- `RELEASE_MANIFEST.json` — owns release metadata, compatibility invariants and production publication intent.
- `docs/engineering/METROPOLIS_VISUAL_REMASTER_NOTES.md` — continuation map, r23 root cause/fix and verification evidence.
- `docs/superpowers/specs/2026-08-11-metro-visual-system-v2-design.md` — approved design authority; no implementation behavior.

---

### Task 1: Lock the device-proven visual failures as RED contracts

**Files:**
- Modify: `tests/metropolis-remaster.test.cjs`
- Read: `flow-era.css`
- Read: `metropolis-v4.css`
- Test: `tests/metropolis-remaster.test.cjs`

**Interfaces:**
- Consumes: existing stable selectors `.metropolis-app-bar`, `.hero-value`, `.flow-calendar-focus`, `.flow-swipe-card`, `.day-cell`.
- Produces: static contracts that the final stylesheet must satisfy without touching runtime state.

- [ ] **Step 1: Add a helper that extracts a CSS rule body**

```js
function cssRule(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 's'));
  assert.ok(match, `missing CSS rule: ${selector}`);
  return match[1];
}
```

- [ ] **Step 2: Add the screenshot-conflict regression**

```js
test('Metro V2 overrides every device-proven light/dark cascade conflict', () => {
  const css = read(cssPath);
  const appBar = cssRule(css, '.metropolis-v4 .metropolis-app-bar');
  const heroValue = cssRule(css, '.metropolis-v4 .hero .hero-value');
  const calendarFocus = cssRule(css, '#calendarPage .flow-calendar-focus');
  const calendarSwipe = cssRule(css, '#calendarPage .flow-swipe-card');

  assert.match(appBar, /background:[^;]*var\(--metro-surface/i);
  assert.match(appBar, /color:var\(--metro-text\)!important/i);
  assert.match(heroValue, /color:var\(--metro-text\)!important/i);
  assert.match(calendarFocus, /background:[^;]*var\(--metro-surface/i);
  assert.match(calendarFocus, /color:var\(--metro-text\)!important/i);
  assert.match(calendarSwipe, /background:[^;]*var\(--metro-surface/i);
});
```

- [ ] **Step 3: Add the complete V2 component contract**

```js
test('Metro V2 defines one mobile hierarchy across chrome, pages, actions, records and calendar', () => {
  const css = read(cssPath);
  for (const token of [
    '--metro-text-secondary', '--metro-store', '--metro-ride',
    '--metro-ledger', '--metro-calendar', '--metro-touch'
  ]) assert.match(css, new RegExp(token.replace('--', '\\-\\-')));

  for (const selector of [
    '.metropolis-v4 .topbar',
    '.metropolis-v4 .metropolis-app-bar',
    '.metropolis-v4 .hero .hero-value',
    '.metropolis-v4 .action-row',
    '.metropolis-v4 .content-card',
    '#calendarPage .flow-calendar-focus',
    '#calendarPage .day-cell',
    '.metropolis-v4 .bottom-nav'
  ]) assert.match(css, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  assert.match(css, /@media\s*\(max-width:420px\)/);
  assert.match(css, /min-height:var\(--metro-touch\)/);
});
```

- [ ] **Step 4: Advance the exact-current test expectation to r23**

```js
assert.equal(
  manifest.serviceWorker.releaseId,
  'v4.2.5-20260811-r23-metro-visual-system'
);
```

- [ ] **Step 5: Run the focused test and verify RED**

Run: `node --test tests/metropolis-remaster.test.cjs`
Expected: FAIL for missing V2 selectors/tokens and the still-r22 manifest release.

- [ ] **Step 6: Commit the RED contract**

```bash
git add tests/metropolis-remaster.test.cjs
git commit -m "test: lock Metro visual system v2 contracts"
```

---

### Task 2: Rebuild the single final visual authority

**Files:**
- Modify: `metropolis-remaster.css`
- Test: `tests/metropolis-remaster.test.cjs`

**Interfaces:**
- Consumes: existing DOM/classes, `data-metropolis-page`, semantic button classes and icon markup.
- Produces: presentation only; no JavaScript API or durable-state interface.

- [ ] **Step 1: Replace the root tokens with the V2 system**

```css
:root{
  --metro-bg:#070c0e;
  --metro-bg-deep:#040809;
  --metro-surface:#10181b;
  --metro-surface-2:#162125;
  --metro-surface-3:#1c292d;
  --metro-border:#2a3a3e;
  --metro-border-strong:#405257;
  --metro-text:#f6faf9;
  --metro-text-secondary:#c2cecb;
  --metro-muted:#91a19d;
  --metro-primary:#25d366;
  --metro-primary-2:#14b87a;
  --metro-gold:#f3bd4f;
  --metro-danger:#ff6857;
  --metro-info:#55a9ff;
  --metro-store:#2dd36f;
  --metro-ride:#55a9ff;
  --metro-ledger:#c69aff;
  --metro-calendar:#62aef7;
  --metro-touch:44px;
  --metro-gutter:clamp(14px,4vw,20px);
  --metro-radius-xl:26px;
  --metro-radius-lg:20px;
  --metro-radius-md:15px;
}
```

- [ ] **Step 2: Rebuild authenticated shell and compact chrome**

Implement scoped rules for `html`, `body`, `.shell`, `.topbar`, brand/status controls, `.metropolis-app-bar`, `.metropolis-back`, `.metropolis-current-icon`, `.metropolis-current-copy` and `.metropolis-linked-badge`. The app bar must use dark surfaces, readable primary/secondary text and the existing page accent; its back/icon controls must meet `--metro-touch`.

```css
.metropolis-v4 .metropolis-app-bar{
  background:linear-gradient(145deg,var(--metro-surface-2),var(--metro-surface))!important;
  border:1px solid var(--metro-border-strong)!important;
  color:var(--metro-text)!important;
  box-shadow:0 14px 32px rgba(0,0,0,.24)!important;
}
.metropolis-v4 .metropolis-current-copy b{color:var(--metro-text)!important}
.metropolis-v4 .metropolis-current-copy span{color:var(--metro-text-secondary)!important}
```

- [ ] **Step 3: Establish one hero and metric hierarchy**

Use a scoped `.metropolis-v4 .hero .hero-value` rule so it outranks the legacy `.hero .hero-value !important` selector. Keep supporting metrics readable and use page ownership only as a narrow accent.

```css
.metropolis-v4 .hero .hero-value{
  color:var(--metro-text)!important;
  font-size:clamp(2rem,8vw,2.75rem);
  line-height:1.05;
  letter-spacing:-.045em;
}
.metropolis-v4 .hero-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
#calendarPage .hero-grid.r53-three-stats{grid-template-columns:repeat(3,minmax(0,1fr))!important}
```

- [ ] **Step 4: Unify actions, cards, lists, forms and modal states**

Define dark elevated surfaces and high-contrast copy for `.content-card`, `.hub-card`, `.source-card`, `.record`, `.queue-item`, `.tx`, `.audit`, `.flow-task-row`, `.flow-tx-row`, forms and modal controls. Define solid primary, bordered peer, gold utility, blue information and red destructive actions. Preserve `focus-visible`, disabled-state opacity plus border differentiation, and reduced motion.

```css
.metropolis-v4 .action-row{gap:10px!important}
.metropolis-v4 button{min-height:var(--metro-touch)}
.metropolis-v4 .balanced-main,
.metropolis-v4 .primary-btn{
  background:linear-gradient(145deg,var(--metro-primary),var(--metro-primary-2))!important;
  color:#06140c!important;
}
@media(prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}
}
```

- [ ] **Step 5: Rebuild Calendar's dark focus and month system**

Override the legacy white `!important` rules with `#calendarPage`-scoped selectors. Cover focus, swipe card, route badge, navigation, month card, weekdays, day cells, selected/today/other states, selected-day strip, queue toolbar and status dots without changing green/yellow/red meaning.

```css
#calendarPage .flow-calendar-focus{
  background:linear-gradient(145deg,var(--metro-surface-2),var(--metro-surface))!important;
  border:1px solid var(--metro-border-strong)!important;
  color:var(--metro-text)!important;
}
#calendarPage .flow-swipe-card{
  background:var(--metro-surface-2)!important;
  border:1px solid var(--metro-border-strong)!important;
  color:var(--metro-text)!important;
}
#calendarPage .day-cell{
  background:#0e171a!important;
  color:var(--metro-text)!important;
  border-color:var(--metro-border)!important;
}
```

- [ ] **Step 6: Add the 420px narrow-screen contract**

At `max-width:420px`, compact header/app-bar spacing, keep hero grids stable, make multi-action rows two columns with the third action spanning, allow Calendar focus copy to wrap, and reserve bottom-nav safe area. At 360px and below, keep Calendar's three statistics but reduce internal padding/gap rather than collapsing labels.

- [ ] **Step 7: Run the focused visual test**

Run: `node --test tests/metropolis-remaster.test.cjs`
Expected: visual selector/token tests PASS; exact-current release test still FAILS until Task 3.

- [ ] **Step 8: Commit the V2 stylesheet**

```bash
git add metropolis-remaster.css
git commit -m "feat: rebuild Metro visual system"
```

---

### Task 3: Publish the r23 visual generation atomically

**Files:**
- Modify: `sw.js`
- Modify: `RELEASE_MANIFEST.json`
- Modify: `docs/engineering/METROPOLIS_VISUAL_REMASTER_NOTES.md`
- Test: `tests/metropolis-remaster.test.cjs`

**Interfaces:**
- Consumes: stable production asset paths and r22 compatibility invariants.
- Produces: exact current release ID `v4.2.5-20260811-r23-metro-visual-system` with unchanged state/database/Vault values.

- [ ] **Step 1: Advance the Service Worker release**

```js
const RELEASE_ID = "v4.2.5-20260811-r23-metro-visual-system";
```

- [ ] **Step 2: Update Release Manifest metadata without changing compatibility**

Set:

```json
"release": "4.2.5-metro-visual-system",
"serviceWorker": {
  "releaseId": "v4.2.5-20260811-r23-metro-visual-system"
}
```

Replace the service-worker note with an r23 description that states this is a presentation-only rebuild and retains State Schema 4, IndexedDB version 1, Vault format 1 and money ownership. Add one safety statement that V2 resolves legacy light/dark cascade conflicts through the existing final visual authority.

- [ ] **Step 3: Extend the engineering note**

Update the current visual release to r23 and add VBUG-005 with:

- symptom: app-bar titles, primary hero values and Calendar focus copy were unreadable on the owner's device;
- root cause: legacy higher-specificity/`!important` light-theme selectors out-ranked or conflicted with r22;
- fix: rebuild `metropolis-remaster.css` in place with scoped V2 selectors and no new layer;
- prevention: static regression contracts plus device screenshot QA.

Record the r22 screenshots as the RED evidence and keep Production Visual Verified open until fresh device readback.

- [ ] **Step 4: Run the focused test**

Run: `node --test tests/metropolis-remaster.test.cjs`
Expected: PASS.

- [ ] **Step 5: Run manifest/publication compatibility tests**

Run: `node --test tests/metropolis-maintenance.test.cjs tests/metropolis-remaster.test.cjs tests/sw-lifecycle.test.cjs`
Expected: PASS.

- [ ] **Step 6: Commit publication metadata**

```bash
git add sw.js RELEASE_MANIFEST.json docs/engineering/METROPOLIS_VISUAL_REMASTER_NOTES.md
git commit -m "chore: publish Metro visual system r23"
```

---

### Task 4: Verify source and bounded visual evidence

**Files:**
- Modify: `docs/engineering/METROPOLIS_VISUAL_REMASTER_NOTES.md` only if verification produces new durable evidence.
- Verify: all production/test files.

**Interfaces:**
- Consumes: completed r23 source and test contracts.
- Produces: reproducible gate output and bounded visual evidence; no Production Visual Verified claim without device readback.

- [ ] **Step 1: Run the complete deployment gate**

Run: `npm run deploy:gate`
Expected: all Node tests pass, every JavaScript syntax check passes, and UTF-8 verifies all manifest-derived production text assets.

- [ ] **Step 2: Check the final diff and compatibility constants**

Run: `git diff --check origin/main...HEAD`
Expected: no whitespace errors.

Run: `git diff --stat origin/main...HEAD`
Expected: changes limited to the design/plan, visual stylesheet, focused visual test, r23 publication metadata and engineering note.

Run: `rg -n '"stateSchema": 4|"version": 1|"vaultFormat": 1' RELEASE_MANIFEST.json`
Expected: all three invariants remain present.

- [ ] **Step 3: Record the detected local-render boundary**

The execution environment has no `chromium`, `chromium-browser` or `google-chrome` binary. Record `LOCAL_VISUAL_RENDER=BLOCKED_NO_BROWSER` in the engineering note. Do not create a synthetic screenshot or replace the required physical-device QA with an inference.

- [ ] **Step 4: Re-run the complete deployment gate after any QA adjustment**

Run: `npm run deploy:gate`
Expected: PASS with the same compatibility constants.

- [ ] **Step 5: Record final source evidence**

Append the exact test count, syntax result, UTF-8 count and local-render status to `docs/engineering/METROPOLIS_VISUAL_REMASTER_NOTES.md`. Keep device verification open.

- [ ] **Step 6: Commit final evidence only when the note changed**

```bash
git add docs/engineering/METROPOLIS_VISUAL_REMASTER_NOTES.md
git commit -m "docs: record Metro visual system verification"
```

---

### Task 5: Publish through the existing review and deployment route

**Files:**
- No new source files.
- Verify: committed branch, pull request, merged `main`, deployment workflow and physical-device readback.

**Interfaces:**
- Consumes: green r23 branch and existing push-to-main Cloudflare workflow.
- Produces: reviewed `main` commit and deployment evidence; Production Visual Verified remains open until owner screenshots pass.

- [ ] **Step 1: Run the final pre-publish gate and inspect branch scope**

Run: `npm run deploy:gate`
Expected: PASS.

Run: `git status --short --branch`
Expected: clean `feat/metro-visual-system-v2` worktree.

Run: `git log --oneline origin/main..HEAD`
Expected: only worktree setup, approved design/plan, RED contract, V2 stylesheet, r23 publication and verification evidence commits.

- [ ] **Step 2: Publish the branch and open a draft pull request**

Use the repository's GitHub publish workflow with:

- branch: `feat/metro-visual-system-v2`;
- title: `feat: rebuild Metro visual system`;
- body: root cause, V2 scope, compatibility invariants, exact verification commands and open physical-device QA;
- base: `main`.

- [ ] **Step 3: Review the complete diff and CI result**

Require the PR diff to contain no business-state/persistence changes and require all available checks to be green. If review or CI exposes a defect, fix only that defect on the feature branch, re-run `npm run deploy:gate`, and update the PR.

- [ ] **Step 4: Merge only the reviewed green PR**

Merge through the repository's normal merge-commit route. Read back `main` and confirm it contains `v4.2.5-20260811-r23-metro-visual-system` in both `sw.js` and `RELEASE_MANIFEST.json`.

- [ ] **Step 5: Verify delivery without overstating it**

Inspect the push-to-main deployment status when available. A green source/CI/deployment result proves publication only. Ask the owner to activate the new app generation and capture the same Home, Store, Ride, Ledger and Calendar views. Compare them against the r22 failures before changing the status to Production Visual Verified.
