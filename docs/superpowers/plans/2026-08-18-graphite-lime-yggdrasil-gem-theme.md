# Graphite Lime × YGGDRASIL Gem Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved Graphite Lime × YGGDRASIL Gem visual identity to METRO without changing layout, workflows, business logic, or data authority.

**Architecture:** Keep `styles.css` as the single production theme authority and extend it with one token layer plus shared component/state treatments. Keep `ui/icons.mjs` as the icon owner, replace duplicated destination metaphors with one coherent icon family, and add a geometric METRO brand mark without a tree. System/Settings receives clarity-first presentational grouping only.

**Tech Stack:** HTML, CSS custom properties, vanilla ESM, Node test runner, existing Greenfield deploy gate.

**Spec:** `docs/superpowers/specs/2026-08-18-graphite-lime-yggdrasil-gem-theme-design.md`

## Global Constraints

- Preserve current layout, button placement, destination order, workflow, business logic, formulas, and data authority.
- Graphite is the default surface language; lime means active/selected/ready/verified/actionable/success only.
- Warning remains amber; danger remains red.
- No tree icon.
- One production stylesheet authority; no city-local palette ownership.
- Respect `prefers-reduced-motion`.
- Keep five bottom destinations in order: Home, Store, Ride, Finance, Calendar.
- Existing Greenfield tests, syntax gate, UTF-8 gate, release-manifest allowlist, and service-worker asset revision contract must pass.

---

### Task 1: Lock the theme and icon contract with tests

**Files:**
- Create: `tests/greenfield-graphite-lime-theme.test.cjs`
- Test: `tests/greenfield-graphite-lime-theme.test.cjs`

**Interfaces:**
- Consumes: `styles.css`, `index.html`, `ui/icons.mjs`.
- Produces: regression contract for token authority, semantic colors, reduced motion, brand mark, and distinct destination icons.

- [ ] **Step 1: Write the failing test**

```js
"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('Graphite Lime has one token authority and semantic light states',()=>{
  const css=read('styles.css');
  assert.match(css,/--graphite-950:/);
  assert.match(css,/--lime-primary:/);
  assert.match(css,/--semantic-warning:/);
  assert.match(css,/--semantic-danger:/);
  assert.match(css,/LIGHT = MEANING/);
  assert.match(css,/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.doesNotMatch(css,/forest-theme|emerald-theme|calendar-theme|finance-theme/i);
});

test('brand and bottom navigation use direct coherent icon metaphors',()=>{
  const html=read('index.html');
  const icons=read('ui/icons.mjs');
  assert.match(html,/class="brand-mark"/);
  assert.doesNotMatch(html,/tree|yggdrasil-tree/i);
  for(const icon of ['house-simple','shopping-cart-simple','person-simple-run','wallet','calendar-dots']) assert.match(icons,new RegExp(`'${icon}'`));
  assert.match(html,/data-destination="store"[^>]*>[\s\S]*?shopping-cart-simple/);
  assert.match(html,/data-destination="ride"[^>]*>[\s\S]*?person-simple-run/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/greenfield-graphite-lime-theme.test.cjs`
Expected: FAIL because Graphite Lime tokens, brand mark, and new Store/Ride icon names do not yet exist.

- [ ] **Step 3: Commit the red test**

```bash
git add tests/greenfield-graphite-lime-theme.test.cjs
git commit -m "test: lock Graphite Lime theme contract"
```

### Task 2: Implement Graphite Lime tokens and shared component treatment

**Files:**
- Modify: `styles.css`
- Test: `tests/greenfield-graphite-lime-theme.test.cjs`

**Interfaces:**
- Consumes: existing class names and DOM structure.
- Produces: `--graphite-*`, `--lime-*`, semantic state tokens, shared facet/reveal/lattice treatment, and reduced-motion fallback.

- [ ] **Step 1: Replace the root palette with the approved authority**

Use these production tokens in `:root` and map legacy variables to them so existing selectors keep working:

```css
/* GRAPHITE LIME — LIGHT = MEANING */
--graphite-950:#080b0c;
--graphite-900:#0d1112;
--graphite-850:#111718;
--graphite-800:#151c1d;
--graphite-700:#20292b;
--graphite-600:#2d393b;
--text-primary:#f2f5f1;
--text-secondary:#a8b0ad;
--lime-primary:#c7f464;
--lime-hover:#a8e940;
--lime-soft:#7fbd32;
--semantic-warning:#ffc857;
--semantic-danger:#ff5c5c;
--semantic-info:#6bb7ff;
--bg:var(--graphite-950);
--panel:var(--graphite-850);
--panel2:var(--graphite-900);
--line:var(--graphite-600);
--text:var(--text-primary);
--muted:var(--text-secondary);
--accent:var(--lime-primary);
--warn:var(--semantic-warning);
--danger:var(--semantic-danger);
```

- [ ] **Step 2: Apply shared component rules**

Add production rules that keep the existing layout but change surface language: graphite stepped panels, quiet default borders, lime primary actions, raised active bottom nav, visible focus, selected/today facet edges, stronger metric hierarchy, graphite modal elevation, and semantic warning/danger separation. Use lightweight gradients/shadows only.

- [ ] **Step 3: Add reduced-motion fallback**

```css
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{scroll-behavior:auto!important;transition-duration:.001ms!important;animation-duration:.001ms!important;animation-iteration-count:1!important}
}
```

- [ ] **Step 4: Run the focused theme test**

Run: `node --test tests/greenfield-graphite-lime-theme.test.cjs`
Expected: still FAIL only on brand/icon assertions until Task 3.

- [ ] **Step 5: Commit**

```bash
git add styles.css
git commit -m "feat: apply Graphite Lime theme tokens and components"
```

### Task 3: Replace navigation metaphors and add METRO brand mark

**Files:**
- Modify: `ui/icons.mjs`
- Modify: `index.html`
- Test: `tests/greenfield-graphite-lime-theme.test.cjs`

**Interfaces:**
- Consumes: `hydrateIcons(root)` and existing `<svg data-icon>` convention.
- Produces: `shopping-cart-simple`, `person-simple-run`, existing home/wallet/calendar icons, and `.brand-mark` geometric M markup.

- [ ] **Step 1: Add destination paths to `PATHS`**

Add two Phosphor-compatible 256×256 fill paths named exactly `shopping-cart-simple` and `person-simple-run`. Keep `hydrateIcons` unchanged so all icons remain one family and current-color driven.

- [ ] **Step 2: Replace duplicated bottom-nav mappings**

Change only the icon names in `index.html`:

```html
<button ... data-destination="store" ...><svg data-icon="shopping-cart-simple"></svg><span>ร้านค้า</span></button>
<button ... data-destination="ride" ...><svg data-icon="person-simple-run"></svg><span>วิ่งงาน</span></button>
```

Destination order and labels stay unchanged.

- [ ] **Step 3: Add a no-tree geometric METRO mark to the app bar**

Use semantic inline markup with no external asset dependency:

```html
<header class="appbar"><div class="brand-lockup"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><strong>YGPH METROPOLIS</strong></div></header>
```

Style `.brand-mark` in `styles.css` as a compact faceted M using three CSS polygons/blocks and the lime token. Do not use a tree, leaf, branch, or six-spoke city-count symbol.

- [ ] **Step 4: Run the focused theme test**

Run: `node --test tests/greenfield-graphite-lime-theme.test.cjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add index.html ui/icons.mjs styles.css tests/greenfield-graphite-lime-theme.test.cjs
git commit -m "feat: unify METRO navigation icons and brand mark"
```

### Task 4: Give System/Settings clarity-first treatment without changing behavior

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Test: existing Greenfield UI tests plus theme test.

**Interfaces:**
- Consumes: existing IDs `systemVersion`, `systemDatabase`, `systemCoordination`, `runtimeBadge`, `diagnostics`; runtime-injected `systemServiceWorker` remains supported.
- Produces: presentational `.system-facts` and `.system-fact` wrappers/classes only; no handler or runtime change.

- [ ] **Step 1: Preserve every existing System ID and convert the key/value block to clarity-first rows**

Keep the same IDs and text ownership, but add presentational classes around the existing System block so version, database, coordination, and runtime-added Service Worker read as settings facts rather than debug output.

- [ ] **Step 2: Style the System rows**

Use graphite surface steps, restrained facet separators, small labels, high-contrast values, and status/badge emphasis. Keep diagnostics visually subordinate and scrollable.

- [ ] **Step 3: Run UI contract tests**

Run: `node --test tests/greenfield-functional-ux.test.cjs tests/greenfield-mobile-flow-cleanup.test.cjs tests/greenfield-graphite-lime-theme.test.cjs`
Expected: PASS; if exact filenames differ, run `node --test tests/greenfield-*.test.cjs` and require all related UI tests to pass.

- [ ] **Step 4: Commit**

```bash
git add index.html styles.css
git commit -m "feat: polish System settings with clarity-first theme"
```

### Task 5: Close publication contract, Gate, and Production

**Files:**
- Modify as required by gate: `RELEASE_MANIFEST.json`, `sw.js`, `.assetsignore` only if production asset set changed.
- Test: full repository deploy gate.

**Interfaces:**
- Consumes: existing `RELEASE_PLUS_ASSET_REVISION` service-worker cache contract.
- Produces: gate-aligned asset revision and deployable production commit.

- [ ] **Step 1: Run the full gate on the theme branch**

Run: `npm run deploy:gate`
Expected: PASS except a possible explicit asset-revision mismatch produced by the existing gate.

- [ ] **Step 2: If the gate reports an asset revision mismatch, copy exactly the revision value reported by the gate into both `RELEASE_MANIFEST.json.serviceWorker.assetRevision` and `sw.js` `ASSET_REVISION`**

Do not invent a hash and do not change release semantics merely to make the gate green.

- [ ] **Step 3: Re-run the full gate**

Run: `npm run deploy:gate`
Expected: all tests, syntax, and UTF-8 checks PASS.

- [ ] **Step 4: Open a PR from `design/graphite-lime-gem-theme` to `main` and require the Greenfield Deploy Gate to pass on the exact head commit**

PR title: `feat: Graphite Lime YGGDRASIL gem theme`

- [ ] **Step 5: Merge only after the exact-head gate is green, then verify the post-merge deploy job succeeds**

Expected: Cloudflare production deploy succeeds and the production URL serves the new theme assets.
