# METROPOLIS Functional UX Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the current METROPOLIS functional shell easy, calm, and safe for daily mobile use without changing business/runtime ownership.

**Architecture:** Keep the existing HTML IDs, event bindings, runtime, and domain modules intact. Implement the redesign primarily in `styles.css`, add only minimal semantic/class changes to `index.html`, add a static UX contract test, and rotate production cache/revision metadata only after UI assets change.

**Tech Stack:** HTML, CSS, vanilla ES modules, Node built-in test runner, PWA service worker.

## Global Constraints
- Preserve STORE / LEDGER / CALENDAR / RIDE ownership and all business/runtime behavior.
- Preserve Home, Store, Ride, Finance, Calendar navigation.
- No theme rewrite, decorative hero, new product feature, or runtime refactor.
- Minimum practical touch target remains at least 44px; primary actions target 48px where layout allows.
- Warnings must use text plus semantic styling; color alone is insufficient.
- No files under `greenfield/` are modified.

---

### Task 1: Functional UX contract

**Files:**
- Create: `tests/greenfield-functional-ux.test.cjs`
- Read: `index.html`, `styles.css`

**Interfaces:**
- Consumes: production HTML/CSS as UTF-8 text.
- Produces: static assertions that guard the five-destination nav, primary-action affordance, phone metric compaction, touch sizing, and warning semantics.

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

test('functional UX keeps five labeled bottom destinations', () => {
  const matches = [...html.matchAll(/class="bottom-nav-btn[^\"]*"[^>]*data-destination="([^"]+)"/g)];
  assert.deepEqual(matches.map(match => match[1]), ['home','store','ride','finance','calendar']);
});

test('touch and primary action contract remains explicit', () => {
  assert.match(css, /button\{[^}]*min-height:44px/s);
  assert.match(css, /\.primary-action\{[^}]*min-height:48px/s);
});

test('phone metrics remain compact rather than all becoming one column', () => {
  assert.match(css, /@media\(max-width:700px\)[\s\S]*\.metrics\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test('warning states have a structural warning treatment', () => {
  assert.match(html, /truth-warning/);
  assert.match(css, /\.truth-warning/);
});
```

- [ ] **Step 2: Run `node --test tests/greenfield-functional-ux.test.cjs` and confirm the new primary-action and mobile-metric assertions fail on the baseline.**
- [ ] **Step 3: Commit the failing contract test.**

### Task 2: Functional hierarchy and mobile ergonomics

**Files:**
- Modify: `styles.css`
- Test: `tests/greenfield-functional-ux.test.cjs`

**Interfaces:**
- Consumes: existing class names and DOM structure.
- Produces: clearer hierarchy without changing IDs or JS contracts.

- [ ] **Step 1: Give `.primary-action` a minimum height of 48px and stronger but non-theme-specific hierarchy.**
- [ ] **Step 2: Reduce visual competition between ordinary cards and primary task/actions by softening ordinary borders/surfaces while preserving focus outlines.**
- [ ] **Step 3: Make phone `.metrics` a two-column compact grid; allow the last item in odd three-item groups to span two columns where useful.**
- [ ] **Step 4: Keep `.attention-item`, `.city-inspection-links button`, and city entry buttons at comfortable touch heights with clearer spacing.**
- [ ] **Step 5: Make warning/verification state readable through border/background/text hierarchy, not color alone.**
- [ ] **Step 6: Run `node --test tests/greenfield-functional-ux.test.cjs`. Expected: PASS.**

### Task 3: Production navigation and task hierarchy sanity

**Files:**
- Modify only if necessary: `index.html`
- Test: all `tests/greenfield-*.test.cjs`

**Interfaces:**
- Consumes: existing UI event bindings in `ui/app.mjs`.
- Produces: same IDs/data attributes with clearer order/copy only if needed.

- [ ] **Step 1: Verify Home order remains attention → summary → city entries → collapsed goal.**
- [ ] **Step 2: Verify each city presents status/summary before action panels and inspection/history links after task actions.**
- [ ] **Step 3: Do not remove or rename any ID, `data-*` hook, form field name, or navigation destination.**
- [ ] **Step 4: If no HTML change is necessary, leave `index.html` untouched.**

### Task 4: Production publication identity

**Files:**
- Modify: `RELEASE_MANIFEST.json`
- Modify: `sw.js`

**Interfaces:**
- Consumes: final changed production asset set.
- Produces: a new asset revision/cache identity so installed PWA clients receive the UX changes.

- [ ] **Step 1: Rotate `serviceWorker.assetRevision` to a new deterministic revision token for the final production asset set.**
- [ ] **Step 2: Update the matching service-worker cache identity/revision constant to the same release asset identity.**
- [ ] **Step 3: Do not change product version, state schema, database, vault, cutover, safety, or domain declarations.**

### Task 5: Functional UX Gate

**Files:**
- Verify: `package.json`, production files, tests.

**Interfaces:**
- Produces: evidence for merge readiness.

- [ ] **Step 1: Run `npm test`. Expected: all greenfield tests PASS.**
- [ ] **Step 2: Run `npm run check:syntax`. Expected: PASS.**
- [ ] **Step 3: Run `npm run check:utf8`. Expected: PASS.**
- [ ] **Step 4: Run `npm run deploy:gate`. Expected: PASS.**
- [ ] **Step 5: Confirm `git diff --name-only main...HEAD` contains no `greenfield/` domain/runtime files.**
- [ ] **Step 6: Review diff for accidental theme/branding expansion or business behavior changes.**
- [ ] **Step 7: Open a draft PR to `main` with gate evidence; do not merge before the gate result is known.**
