# LIGHTHOUSE New Base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a clean LIGHTHOUSE product base inside the existing repository and connect it to the proven owner APK build path without inheriting legacy UI/navigation.

**Architecture:** Product source is isolated under `lighthouse-new-base/`. Existing repo logic is treated as migration candidates, not implicit dependencies. GitHub Actions/signing remain shared infrastructure and are adapted only after the new base has its own passing tests and staging contract.

**Tech Stack:** Node.js 22, native `node:test`, ES modules, Capacitor/Android packaging via existing `android-shell`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-02-lighthouse-new-base-design.md`

## Global Constraints
- Work only on `codex/lighthouse-new-base-20260902`.
- `reference/lighthouse-1.0.5` is read-only reference evidence.
- Do not extend legacy `ui/` navigation or root `app.mjs` as the NEW BASE product source.
- Preserve the existing APK signer secret names.
- Migrate code one behavior at a time behind tests.
- No NEW BASE production code without a failing test first.

---

### Task 1: Establish the NEW BASE boundary contract

**Files:**
- Create: `tests/lighthouse-new-base-boundary.test.cjs`
- Create: `lighthouse-new-base/README.md`
- Create: `lighthouse-new-base/package.json`

**Interfaces:**
- Consumes: repository filesystem only.
- Produces: a test-enforced boundary that requires the NEW BASE directory and forbids direct imports from legacy `ui/` and root `app.mjs`.

- [ ] **Step 1: Write the failing boundary test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const base = path.join(root, 'lighthouse-new-base');

test('LIGHTHOUSE new base exists as its own product boundary', () => {
  assert.equal(fs.existsSync(base), true);
  assert.equal(fs.existsSync(path.join(base, 'package.json')), true);
});

test('LIGHTHOUSE new base source does not import legacy UI/navigation', () => {
  const src = path.join(base, 'src');
  if (!fs.existsSync(src)) return;
  const files = fs.readdirSync(src).filter((name) => name.endsWith('.mjs'));
  for (const file of files) {
    const text = fs.readFileSync(path.join(src, file), 'utf8');
    assert.doesNotMatch(text, /(?:\.\.\/)+ui\//);
    assert.doesNotMatch(text, /(?:\.\.\/)+app\.mjs/);
  }
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/lighthouse-new-base-boundary.test.cjs`
Expected: FAIL because `lighthouse-new-base/package.json` does not exist.

- [ ] **Step 3: Add the minimal boundary package and README**

`lighthouse-new-base/package.json`:
```json
{
  "name": "lighthouse-new-base",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test test/*.test.mjs"
  }
}
```

`lighthouse-new-base/README.md` documents: NEW BASE only, legacy UI/navigation reference-only, migrations require tests, shared infra stays outside product source.

- [ ] **Step 4: Run boundary test and verify GREEN**

Run: `node --test tests/lighthouse-new-base-boundary.test.cjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/lighthouse-new-base-boundary.test.cjs lighthouse-new-base/README.md lighthouse-new-base/package.json
git commit -m "test: lock LIGHTHOUSE new base boundary"
```

### Task 2: Create the minimal NEW BASE application contract

**Files:**
- Create: `lighthouse-new-base/test/app.test.mjs`
- Create: `lighthouse-new-base/src/app.mjs`
- Create: `lighthouse-new-base/src/app-shell.mjs`

**Interfaces:**
- Produces: `createApp()` returning `{ id: 'lighthouse', surface: 'new-base', shell }` and `createAppShell()` returning a minimal shell model.

- [ ] **Step 1: Write the failing application test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.mjs';

test('creates LIGHTHOUSE from the new-base surface', () => {
  const app = createApp();
  assert.equal(app.id, 'lighthouse');
  assert.equal(app.surface, 'new-base');
  assert.deepEqual(app.shell, { home: 'chat', sections: ['chat', 'manual', 'settings'] });
});
```

- [ ] **Step 2: Run and verify RED**

Run: `cd lighthouse-new-base && npm test`
Expected: FAIL because `src/app.mjs` is missing.

- [ ] **Step 3: Implement the minimal shell**

`src/app-shell.mjs` exports `createAppShell()` returning exactly `{ home: 'chat', sections: ['chat', 'manual', 'settings'] }`.

`src/app.mjs` imports `createAppShell` only from `./app-shell.mjs` and exports `createApp()` returning `{ id: 'lighthouse', surface: 'new-base', shell: createAppShell() }`.

- [ ] **Step 4: Run both NEW BASE and repository boundary tests**

Run: `cd lighthouse-new-base && npm test && cd .. && node --test tests/lighthouse-new-base-boundary.test.cjs`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lighthouse-new-base/src lighthouse-new-base/test
git commit -m "feat: add LIGHTHOUSE new base application contract"
```

### Task 3: Add a deterministic staging contract

**Files:**
- Create: `lighthouse-new-base/test/stage.test.mjs`
- Create: `lighthouse-new-base/tools/stage.mjs`
- Modify: `lighthouse-new-base/package.json`

**Interfaces:**
- Produces: `npm run stage -- <destination>` that writes a minimal staged web package containing `index.html` and `app.mjs` without copying legacy `ui/`.

- [ ] **Step 1: Write a failing staging test** that creates a temp directory, runs the exported `stage(destination)` function, verifies `index.html` and `app.mjs` exist, and verifies no `ui/` directory is created.
- [ ] **Step 2: Run `npm test` and verify RED** because `tools/stage.mjs` is missing.
- [ ] **Step 3: Implement `stage(destination)`** using `fs.mkdir`, `fs.copyFile`, and generated minimal `index.html`; add package script `"stage": "node tools/stage.mjs"`.
- [ ] **Step 4: Run `npm test` and boundary tests; verify GREEN**.
- [ ] **Step 5: Commit** with `feat: add new base staging contract`.

### Task 4: Integrate NEW BASE into the owner APK staging path

**Files:**
- Create: `android-shell/test/new-base-package.test.mjs`
- Modify: `android-shell/package.json`
- Add or modify the smallest staging adapter under `android-shell/tools/` necessary to call `lighthouse-new-base/tools/stage.mjs`.

**Interfaces:**
- Consumes: NEW BASE staging contract.
- Produces: Android web assets sourced from `lighthouse-new-base/`, not legacy root UI.

- [ ] **Step 1: Write a failing Android package test** that checks the staged asset marker identifies `surface: new-base` and contains no legacy UI bundle marker.
- [ ] **Step 2: Run the targeted test and verify RED**.
- [ ] **Step 3: Implement minimal adapter and package script `app:stage-new-base`**.
- [ ] **Step 4: Run Android-shell staging test plus NEW BASE tests; verify GREEN**.
- [ ] **Step 5: Commit** with `feat: stage LIGHTHOUSE new base for Android`.

### Task 5: Adapt the owner build workflow without changing signer secrets

**Files:**
- Create: `tests/lighthouse-owner-build-new-base.test.cjs`
- Modify: `.github/workflows/lighthouse-owner-build.yml`

**Interfaces:**
- Preserves secret names: `LIGHTHOUSE_APK_KEYSTORE_BASE64`, `LIGHTHOUSE_APK_STORE_PASSWORD`, `LIGHTHOUSE_APK_KEY_ALIAS`, `LIGHTHOUSE_APK_KEY_PASSWORD`.
- Changes staging command to `npm run app:stage-new-base`.
- Changes verification test to the NEW BASE package test.
- Changes artifact naming away from `existing-full-app-1.0.3` to a neutral NEW BASE candidate name.

- [ ] **Step 1: Write a failing workflow text-contract test** that asserts the workflow contains `app:stage-new-base`, does not contain `app:stage-existing`, preserves all four signer secret names, and does not contain `existing-full-app-1.0.3`.
- [ ] **Step 2: Run targeted test and verify RED**.
- [ ] **Step 3: Make the smallest workflow edits** to satisfy the contract while preserving signing and APK identity verification steps.
- [ ] **Step 4: Run repository deploy gate and targeted workflow contract test**; verify GREEN.
- [ ] **Step 5: Commit** with `ci: point LIGHTHOUSE owner build at new base`.

### Task 6: Open a draft PR and verify GitHub Actions

**Files:** none.

**Interfaces:** GitHub PR CI is the external verification surface because `greenfield-deploy-gate.yml` runs on pull requests.

- [ ] **Step 1: Push/ensure all commits are on `codex/lighthouse-new-base-20260902`.**
- [ ] **Step 2: Open a draft PR to `main` titled `LIGHTHOUSE: establish clean new base`.**
- [ ] **Step 3: Wait for the pull-request safety gate result and inspect failing jobs if any.**
- [ ] **Step 4: Fix only failures caused by this branch, preserving the boundary rules.**
- [ ] **Step 5: Record exact CI status and commit SHA in the PR description/comment.**
