# Metropolis Icon System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved steel-blue primary app mark and four coordinated in-app icons without changing interface colors, data, or behavior.

**Architecture:** Keep one canonical vector app mark in `assets/app-icon.svg`, render deterministic 192px and 512px PNG install assets, and keep in-app glyphs in the existing `FLOW_ICONS` registry. CSS applies one approved steel-blue/off-white container treatment only to icon surfaces; existing page and domain colors remain unchanged.

**Tech Stack:** Static HTML/CSS/JavaScript, SVG, PNG, Node.js test runner, ImageMagick, Cloudflare Workers Static Assets.

## Global Constraints

- Primary icon uses the row-three route/network symbol with the row-two steel-blue/off-white treatment.
- Store, Ride, Ledger, and Calendar use the approved row-two subjects.
- Exact palette: `#60758C`, `#465B71`, and `#F7F5EF`.
- Preserve at least 14% maskable safe margin on all app-icon edges.
- Do not recolor the full UI or alter IndexedDB, vault, schema, routes, or business logic.
- No text, letters, religious symbols, faction colors, gradients, gold, jewel colors, crests, runes, or sigils.

---

### Task 1: Lock the icon contract with failing tests

**Files:**
- Create: `tests/icon-system.test.cjs`
- Test: `tests/icon-system.test.cjs`

**Interfaces:**
- Consumes: production asset paths and existing `FLOW_ICONS` source.
- Produces: executable source, image-dimension, manifest, and cache contracts.

- [ ] **Step 1: Write the failing contract test**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

function pngSize(file) {
  const data = fs.readFileSync(path.join(root, file));
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
}

test("primary app mark uses the approved civic route palette", () => {
  const svg = read("assets/app-icon.svg");
  assert.match(svg, /#60758C/);
  assert.match(svg, /#F7F5EF/);
  assert.match(svg, /data-icon="app-route"/);
  assert.doesNotMatch(svg, /gradient|#(?:D4AF37|FFD700)|rune|shield/i);
});

test("install icons have exact dimensions and remain wired", () => {
  assert.deepEqual(pngSize("icon-192.png"), [192, 192]);
  assert.deepEqual(pngSize("icon-512.png"), [512, 512]);
  const manifest = read("manifest.webmanifest");
  assert.match(manifest, /icon-192\.png/);
  assert.match(manifest, /icon-512\.png/);
});

test("four UI icons and the app mark use the shared icon registry", () => {
  const flow = read("flow-era.js");
  for (const name of ["app", "store", "ride", "ledger", "calendar"]) {
    assert.match(flow, new RegExp(`${name}:\\s*'<svg`));
  }
  assert.match(flow, /brand-mark"\)\.innerHTML = flowIcon\("app"\)/);
});
```

- [ ] **Step 2: Run the focused test and verify red state**

Run: `node --test tests/icon-system.test.cjs`

Expected: failure because `assets/app-icon.svg` and `FLOW_ICONS.app` do not exist.

- [ ] **Step 3: Commit the failing test only after recording the red output**

```bash
git add tests/icon-system.test.cjs
git commit -m "test: define Metropolis icon contract"
```

### Task 2: Build the canonical app mark and install assets

**Files:**
- Create: `assets/app-icon.svg`
- Modify: `icon-192.png`
- Modify: `icon-512.png`
- Test: `tests/icon-system.test.cjs`

**Interfaces:**
- Consumes: exact palette and safe-area contract from the design.
- Produces: one editable 512×512 SVG and two manifest-compatible PNG files.

- [ ] **Step 1: Create the minimal vector source**

Use a 512×512 view box, a `#60758C` rounded-square background, and an off-white
route glyph whose geometry stays between coordinates 72 and 440. Mark the glyph
group with `data-icon="app-route"`; use rounded strokes and circular nodes.

- [ ] **Step 2: Render deterministic PNG files**

```bash
convert -background none assets/app-icon.svg -resize 192x192 icon-192.png
convert -background none assets/app-icon.svg -resize 512x512 icon-512.png
```

- [ ] **Step 3: Run the asset tests**

Run: `node --test tests/icon-system.test.cjs`

Expected: dimension and SVG tests pass; registry test still fails until Task 3.

- [ ] **Step 4: Commit the app-icon assets**

```bash
git add assets/app-icon.svg icon-192.png icon-512.png
git commit -m "feat: add Metropolis civic route app icon"
```

### Task 3: Wire the approved in-app icon set

**Files:**
- Modify: `flow-era.js`
- Modify: `metropolis-v4.css`
- Test: `tests/icon-system.test.cjs`

**Interfaces:**
- Consumes: `flowIcon(name)` and the existing `FLOW_ICONS` map.
- Produces: `FLOW_ICONS.app`, `FLOW_ICONS.store`, `FLOW_ICONS.ride`, `FLOW_ICONS.ledger`, and `FLOW_ICONS.calendar` using consistent SVG attributes.

- [ ] **Step 1: Add the primary route glyph to `FLOW_ICONS`**

Add `app` as a 24×24 rounded route/network outline. Keep `store`, `ride`,
`ledger`, and `calendar` recognizable as storefront, scooter/route, bound
notebook, and calendar grid. Use `fill="none"`, `stroke-width="1.9"`, rounded
caps, and rounded joins.

- [ ] **Step 2: Replace the header tree mark**

Change:

```js
document.querySelector(".brand-mark").innerHTML = flowIcon("tree");
```

to:

```js
document.querySelector(".brand-mark").innerHTML = flowIcon("app");
```

- [ ] **Step 3: Apply icon-only color variables**

Add `--metro-icon-bg:#60758C`, `--metro-icon-bg-dark:#465B71`, and
`--metro-icon-ink:#F7F5EF`. Apply them to `.metropolis-app-icon` and the header
`.brand-mark`; do not replace domain card, hero, status, button, or page colors.

- [ ] **Step 4: Run focused and full tests**

Run: `node --test tests/icon-system.test.cjs tests/runtime-contract.test.cjs tests/sw-lifecycle.test.cjs`

Expected: all focused tests pass.

Run: `npm run deploy:gate`

Expected: all tests, syntax checks, and UTF-8 checks pass.

- [ ] **Step 5: Commit UI wiring**

```bash
git add flow-era.js metropolis-v4.css tests/icon-system.test.cjs
git commit -m "feat: apply unified Metropolis UI icons"
```

### Task 4: Refresh release metadata and publish safely

**Files:**
- Modify: `RELEASE_MANIFEST.json`
- Modify: `SHA256SUMS.txt`
- Verify: `.assetsignore`, `sw.js`, `manifest.webmanifest`, `wrangler.jsonc`

**Interfaces:**
- Consumes: final production assets from Tasks 2 and 3.
- Produces: one verified release tree ready for the linked Cloudflare production build.

- [ ] **Step 1: Update release inventory and hashes**

Record final byte sizes and SHA-256 digests for `icon-192.png`, `icon-512.png`,
`flow-era.js`, and `metropolis-v4.css`. Add the icon-system test and design/plan
documents to `SHA256SUMS.txt`; verify every listed digest with
`sha256sum -c SHA256SUMS.txt`.

- [ ] **Step 2: Verify Cloudflare asset boundaries**

Compare the `.assetsignore` allowlist with `RELEASE_MANIFEST.json` production
files. The deployed set must contain only the approved production assets; the
canonical SVG, tests, scripts, and documents stay repository-only.

- [ ] **Step 3: Run the final local release gate**

```bash
npm run deploy:gate
sha256sum -c SHA256SUMS.txt
git diff --check
```

Expected: exit code 0, no failed tests, no checksum mismatch, and no whitespace errors.

- [ ] **Step 4: Publish without partial production state**

Fast-forward `pureekangraw-ops/ygph-metropolis` `main` only after confirming its
head still matches the recorded parent. Use a single squashed/atomic main update
so the linked Cloudflare production build sees one complete release.

- [ ] **Step 5: Verify live Cloudflare output**

Wait for `https://ygph-metropolis.pureekangraw.workers.dev/` to serve the final
`sw.js`, `icon-192.png`, `icon-512.png`, and runtime hashes. Confirm HTTP 200 for
all allowlisted assets and verify setup/lock/unlock plus the legacy-cache rescue
path before reporting completion.
