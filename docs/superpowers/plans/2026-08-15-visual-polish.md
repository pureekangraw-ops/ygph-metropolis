# Visual Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise the existing YGPH METROPOLIS production shell to a consistent production-grade visual standard without changing application behavior.

**Architecture:** Keep the existing HTML, navigation, popup layer, runtime, and domain boundaries unchanged. Implement the pass primarily in `styles.css`; only release/cache metadata may change because the production stylesheet changes.

**Tech Stack:** HTML, CSS, native dialog, ES modules, Node test/deploy gates, service worker asset revision.

## Global Constraints
- Presentation-layer changes only.
- Preserve Home, Store, Ride, Finance, Calendar destination order and bottom-navigation behavior.
- Preserve Settings and all existing popup/dialog workflows.
- No business logic, domain/runtime/state/schema, persistence, validation semantics, or information-architecture changes.
- Mobile target: widths <= 700px.
- Existing dark visual language and CSS variables remain authoritative.
- Touch targets should remain at least 44px high where practical.

---

### Task 1: Lock Visual Contract

**Files:**
- Create: `tests/visual-polish-contract.test.cjs`
- Read: `styles.css`

**Interfaces:**
- Consumes: existing CSS class names and media query.
- Produces: regression assertions for hierarchy, touch targets, dialogs, bottom navigation, and mobile spacing.

- [ ] **Step 1: Write the failing contract test**

```js
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const css = fs.readFileSync('styles.css', 'utf8');

test('visual polish contract is present without changing interaction architecture', () => {
  assert.match(css, /--space-1:/);
  assert.match(css, /--radius-panel:/);
  assert.match(css, /\.page-head h1[^}]*font-size:/);
  assert.match(css, /button[^}]*min-height:44px/);
  assert.match(css, /\.modal-dialog[^}]*overscroll-behavior:contain/);
  assert.match(css, /\.bottom-nav-btn\.active[^}]*font-weight:/);
  assert.match(css, /@media\(max-width:700px\)[\s\S]*\.workspace-content/);
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `node --test tests/visual-polish-contract.test.cjs`
Expected: FAIL because the new spacing/radius tokens and polish contract are not yet present.

- [ ] **Step 3: Commit the RED test**

```bash
git add tests/visual-polish-contract.test.cjs
git commit -m "test: lock visual polish contract"
```

### Task 2: Apply Production Visual Polish

**Files:**
- Modify: `styles.css`
- Test: `tests/visual-polish-contract.test.cjs`

**Interfaces:**
- Consumes: existing selectors only.
- Produces: consistent spacing tokens, typography hierarchy, panel/card distinction, 44px controls, dialog containment, clearer active navigation, and mobile breathing room.

- [ ] **Step 1: Add restrained presentation tokens to `:root`**

Add exact tokens:

```css
--space-1:6px;--space-2:10px;--space-3:14px;--space-4:18px;--space-5:24px;
--radius-control:10px;--radius-card:14px;--radius-panel:18px;
```

- [ ] **Step 2: Normalize controls and hierarchy**

Ensure all buttons have `min-height:44px`; page titles use a clear scale; section headings remain subordinate; body/helper text keeps readable line-height. Do not rename selectors or alter DOM behavior.

- [ ] **Step 3: Normalize surfaces and spacing**

Use the new tokens for `.panel`, `.card`, `.task-panel`, `.hero`, `.item`, `.city-flow-card`, page/subhead spacing, lists, and action rows. Preserve existing colors and semantic danger/warning states.

- [ ] **Step 4: Polish dialogs and navigation**

Add `overscroll-behavior:contain` to `.modal-dialog`; keep backdrop and native dialog behavior unchanged. Strengthen `.bottom-nav-btn.active` with font weight and preserve the five-column layout.

- [ ] **Step 5: Polish <=700px layout**

Keep `.layout` full width, give `.workspace-content` sufficient safe-area/bottom-nav clearance, keep dialog actions >=44px, and avoid edge-to-edge dense content. Do not introduce side rails or alternate navigation.

- [ ] **Step 6: Run the focused contract test and confirm GREEN**

Run: `node --test tests/visual-polish-contract.test.cjs`
Expected: PASS.

- [ ] **Step 7: Commit the stylesheet change**

```bash
git add styles.css tests/visual-polish-contract.test.cjs
git commit -m "style: polish production shell hierarchy"
```

### Task 3: Lock Release Cache Identity

**Files:**
- Modify: `RELEASE_MANIFEST.json`
- Modify: `sw.js`
- Test: existing publication/asset-revision gates.

**Interfaces:**
- Consumes: final production `styles.css` bytes.
- Produces: one matching asset revision in manifest and service worker.

- [ ] **Step 1: Run the full deploy gate before changing revision**

Run: `npm run deploy:gate`
Expected: functional tests remain green; asset revision gate reports the new expected revision because `styles.css` changed.

- [ ] **Step 2: Copy the exact expected asset revision from the gate output**

Update `serviceWorker.assetRevision` in `RELEASE_MANIFEST.json` and the matching cache identity/revision constant in `sw.js`. Change no other release authority.

- [ ] **Step 3: Run full verification**

Run: `npm run deploy:gate`
Expected: all Greenfield tests, syntax, UTF-8, publication allowlist, and asset revision checks PASS.

- [ ] **Step 4: Confirm forbidden files are untouched**

Run: `git diff --name-only main...HEAD`
Expected production changes are limited to `styles.css`, `RELEASE_MANIFEST.json`, `sw.js`, plus the new test and approved docs. No `greenfield/*.mjs`, `ui/*.mjs`, `index.html`, or business/runtime files.

- [ ] **Step 5: Commit release metadata**

```bash
git add RELEASE_MANIFEST.json sw.js
git commit -m "chore: refresh visual polish asset revision"
```

### Task 4: Review, Merge, and Production Gate

**Files:**
- No additional source changes unless verification finds a defect inside this pass.

**Interfaces:**
- Consumes: verified branch.
- Produces: merged production visual-polish pass.

- [ ] **Step 1: Review the branch diff against the design stop conditions**

Reject/split any change that touches business logic, state, persistence, navigation behavior, popup behavior, or new application architecture.

- [ ] **Step 2: Open/ready the PR and require the branch safety gate to PASS**

Expected: no unresolved review threads and mergeable head SHA matches the verified SHA.

- [ ] **Step 3: Merge to `main`**

Use the verified head SHA; do not merge if the branch moved after verification.

- [ ] **Step 4: Follow the `main` production workflow to completion**

Expected: Greenfield safety gate PASS and Cloudflare deploy PASS.

- [ ] **Step 5: Record production evidence**

Record merge SHA, workflow run, deployed changed assets, and Cloudflare Version ID. If direct HTTP readback is unavailable from the tool network, record it as UNKNOWN rather than FAIL.
