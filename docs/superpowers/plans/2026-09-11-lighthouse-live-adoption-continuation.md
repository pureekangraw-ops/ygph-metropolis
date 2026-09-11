# LIGHTHOUSE Live Adoption Continuation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the remaining truth-first and packaging work after the real Store merge so the live LIGHTHOUSE staging/APK carries its full module graph and MANUAL surfaces show only real truth or explicit unavailable/empty states.

**Architecture:** Keep the existing `lighthouse-next` shell and runtime bridges. First close the shared staging import-closure hole with a regression test. Then add one focused pure `view-model.mjs` that projects Ledger/Store truth into `READY`, `EMPTY`, and `UNAVAILABLE` read states, and make the DOM layer consume those projections instead of demo values. No Greenfield domain refactor is needed.

**Tech Stack:** JavaScript ES modules, Node.js 22 `node:test`, shared LIGHTHOUSE Web/Capacitor Android staging bundle, GitHub Actions Greenfield Deploy Gate.

**Spec:** `docs/superpowers/specs/2026-09-11-lighthouse-figma-live-adoption-design.md`

## Global Constraints

- Work only on `feat/lighthouse-live-adoption-20260911`; do not modify `main` directly.
- Ledger remains cash authority; Store remains Product/stock/sale authority.
- Local storage may keep UI/session conveniences only; it must not become money or Product authority.
- Visible real-data surfaces must render real truth, a truthful empty state, or a truthful unavailable state. Never substitute demo values when runtime truth is absent.
- Keep Auth/Recovery and existing Store/Ledger mutation flows intact.
- CHAT success still requires runtime commit plus durable readback.
- Do not add a second app, UI framework, fake backup/restore/version actions, or broad Greenfield refactors.
- Every production code change follows TDD and the branch must pass the existing full deploy/package gate before completion.

---

### Task 1: Close the shared LIGHTHOUSE staging import closure

**Files:**
- Modify: `android-shell/test/lighthouse-next-package.test.mjs`
- Modify: `scripts/stage-lighthouse-next-bundle.mjs`
- Modify: `package.json`

**Interfaces:**
- Existing `stageLighthouseBundle({ repoRoot, destinationRoot })` remains the shared source for isolated Web and Android staging.
- Staged `lighthouse-next/app.mjs` must have every relative `.mjs` dependency present byte-identically in the staged payload.

- [ ] **Step 1: Add a failing package-closure test.**

Extend `android-shell/test/lighthouse-next-package.test.mjs` with a test that stages the bundle, walks all staged `www/lighthouse-next/**/*.mjs`, resolves every relative import from each module, and asserts the resolved file exists under staged `www`. This must catch the current `app.mjs -> ./runtime-store.mjs` and `app.mjs -> ./store-product.mjs` omissions.

- [ ] **Step 2: Run the Android package test and verify RED.**

Run:

```bash
node --test android-shell/test/lighthouse-next-package.test.mjs
```

Expected: FAIL with missing staged dependency `./runtime-store.mjs` and/or `./store-product.mjs`.

- [ ] **Step 3: Add the missing modules to the shared staging list.**

In `LIGHTHOUSE_RUNTIME_FILES`, include:

```js
'runtime-store.mjs',
'store-product.mjs',
```

Keep the existing `store-sale.mjs` entry and all current runtime files unchanged.

- [ ] **Step 4: Expand repository syntax coverage for the Store-facing LIGHTHOUSE modules.**

Add these to `check:syntax` in `package.json`:

```text
lighthouse-next/runtime-store.mjs
lighthouse-next/store-product.mjs
lighthouse-next/store-sale.mjs
```

- [ ] **Step 5: Run targeted verification and commit.**

Run:

```bash
node --test android-shell/test/lighthouse-next-package.test.mjs
node --check scripts/stage-lighthouse-next-bundle.mjs
node --check lighthouse-next/runtime-store.mjs
node --check lighthouse-next/store-product.mjs
node --check lighthouse-next/store-sale.mjs
```

Expected: all pass.

Commit message:

```text
fix: stage complete lighthouse store module closure
```

---

### Task 2: Add a pure truth/read-state view-model boundary

**Files:**
- Create: `lighthouse-next/view-model.mjs`
- Create: `tests/greenfield-lighthouse-view-model.test.cjs`
- Modify: `scripts/stage-lighthouse-next-bundle.mjs`
- Modify: `package.json`

**Interfaces:**
- `READ_STATE = { READY, EMPTY, UNAVAILABLE }`
- `projectFinanceView(ledgerTruth)` returns cash/today-in/today-out/net with `READY`, or `UNAVAILABLE` when truth is absent.
- `projectStoreView(storeTruth)` returns durable products and legacy-unassigned quantity with `READY`, `EMPTY`, or `UNAVAILABLE`.
- `projectLedgerHistoryView(ledgerTruth)` returns durable transactions with `READY`, `EMPTY`, or `UNAVAILABLE`.
- `projectUnavailableView(message)` returns a stable `UNAVAILABLE` projection for capabilities not yet wired to a real bridge.

- [ ] **Step 1: Write failing pure projection tests.**

Create `tests/greenfield-lighthouse-view-model.test.cjs` covering:

```js
assert.equal(projectFinanceView(null).status, 'UNAVAILABLE');
assert.equal(projectFinanceView({balanceSatang:0,todayInSatang:0,todayOutSatang:0,netSatang:0}).status, 'READY');
assert.equal(projectStoreView(null).status, 'UNAVAILABLE');
assert.equal(projectStoreView({products:[],legacyUnassignedQuantity:0}).status, 'EMPTY');
assert.equal(projectStoreView({products:[{productId:'P1',name:'น้ำ',quantity:2}],legacyUnassignedQuantity:3}).status, 'READY');
assert.equal(projectLedgerHistoryView({transactions:[]}).status, 'EMPTY');
```

Also assert projections return new arrays/objects rather than mutable runtime references.

- [ ] **Step 2: Run the new test and verify RED.**

```bash
node --test tests/greenfield-lighthouse-view-model.test.cjs
```

Expected: FAIL because `lighthouse-next/view-model.mjs` does not exist.

- [ ] **Step 3: Implement the smallest pure view-model.**

The module must contain no DOM access, no storage access, no runtime mutation, and no fallback demo values. It should validate/normalize numeric fields conservatively and expose raw numeric truth for the DOM layer to format.

- [ ] **Step 4: Add `view-model.mjs` to staging and syntax coverage.**

Add `view-model.mjs` to `LIGHTHOUSE_RUNTIME_FILES` and `node --check lighthouse-next/view-model.mjs` to `check:syntax`.

- [ ] **Step 5: Verify and commit.**

Run:

```bash
node --test tests/greenfield-lighthouse-view-model.test.cjs android-shell/test/lighthouse-next-package.test.mjs
node --check lighthouse-next/view-model.mjs
```

Expected: all pass.

Commit message:

```text
feat: add lighthouse truth view models
```

---

### Task 3: Make Home and MANUAL consume view-model truth and remove visible demo fallbacks

**Files:**
- Modify: `lighthouse-next/app.mjs`
- Modify: `tests/greenfield-lighthouse-real-income.test.cjs`
- Modify: `tests/greenfield-lighthouse-real-store.test.cjs`
- Create: `tests/greenfield-lighthouse-truthful-manual.test.cjs`

**Interfaces:**
- `app.mjs` imports the Task 2 projections and remains the DOM/event owner.
- Finance and Home render only `projectFinanceView(ledgerTruth)`.
- Store renders only `projectStoreView(storeTruth)`.
- Ledger history renders only `projectLedgerHistoryView(ledgerTruth)`.
- Ride and Calendar render `UNAVAILABLE` copy until a real read bridge exists; they must not display hardcoded `฿0`, fake status, or `state.obligations` as real truth.

- [ ] **Step 1: Add RED structural tests for truthful MANUAL states.**

Create `tests/greenfield-lighthouse-truthful-manual.test.cjs` that extracts `renderCalendarDetail`, Ride manual data/rendering, Store rendering, and Finance rendering from `app.mjs`. Assert:

```js
assert.doesNotMatch(calendarBody, /state\.obligations/);
assert.doesNotMatch(app, /\['สถานะวันนี้','ยังไม่เริ่มรอบ'\]/);
assert.doesNotMatch(app, /\['รายได้วันนี้','฿0'\]/);
assert.match(app, /projectFinanceView\(ledgerTruth\)/);
assert.match(app, /projectStoreView\(storeTruth\)/);
assert.match(app, /projectLedgerHistoryView\(ledgerTruth\)/);
```

Also assert explicit unavailable copy exists for unwired Ride/Calendar.

- [ ] **Step 2: Run targeted tests and verify RED.**

```bash
node --test tests/greenfield-lighthouse-truthful-manual.test.cjs tests/greenfield-lighthouse-real-income.test.cjs tests/greenfield-lighthouse-real-store.test.cjs
```

Expected: new truthful-manual assertions fail against the current demo Ride/Calendar paths.

- [ ] **Step 3: Wire Home, Finance, Store, and Ledger to the pure projections.**

Keep formatting helpers in `app.mjs`. For `UNAVAILABLE`, render `—` for monetary fields and a bounded human message. For `EMPTY`, render purposeful empty copy such as `ยังไม่มีสินค้า` / `ยังไม่มีรายการ`.

- [ ] **Step 4: Replace visible Ride and Calendar demo values with truthful unavailable states.**

Until a real Ride/Calendar read bridge exists in `lighthouse-next`, render rows equivalent to:

```js
[['สถานะ', 'ยังไม่เชื่อมข้อมูลจริง']]
```

Do not read `state.obligations` or static demo cash/status values for these visible MANUAL surfaces.

- [ ] **Step 5: Run targeted tests and then the full repository/package gate.**

Run:

```bash
node --test tests/greenfield-lighthouse-view-model.test.cjs tests/greenfield-lighthouse-truthful-manual.test.cjs tests/greenfield-lighthouse-real-income.test.cjs tests/greenfield-lighthouse-real-store.test.cjs
npm run deploy:gate
npm --prefix android-shell test
npm --prefix android-shell run lighthouse:stage
```

Expected: all targeted tests, deploy gate, Android tests, and staging succeed.

- [ ] **Step 6: Commit Task 3.**

Commit message:

```text
feat: render lighthouse manual from truthful read states
```

---

### Task 4: Final branch verification and review

**Files:**
- No production changes unless verification exposes a proven defect.

- [ ] **Step 1: Re-read the spec acceptance criteria against the branch diff.**

Confirm this slice preserves Auth, real Store/Ledger mutation/readback, existing Figma visual language, Home/Chat/Manual/Settings roots, and removes the identified staging/demo-truth gaps.

- [ ] **Step 2: Run the fresh full verification from the final branch head.**

```bash
npm run deploy:gate
npm --prefix android-shell test
npm --prefix android-shell run lighthouse:stage
```

- [ ] **Step 3: Open a Draft PR to `main` and wait for owner merge authorization.**

The PR body must state the exact final head and gate evidence. Do not merge automatically.
