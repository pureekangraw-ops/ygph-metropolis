# METROPOLIS × YGPH Visual System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the approved METROPOLIS visual identity and icon system into the real app while preserving all current data/business behavior.

**Architecture:** Keep the existing authority boundaries. `metropolis-v4.js` will own the reusable icon registry, brand shell, city launcher, and five-item bottom navigation. `metropolis-r5-4.js` keeps authoritative dashboard metrics and only emits presentation markup. `metropolis-r5-4.css` supplies visual tokens and mobile-first skin. Existing production asset and Service Worker contracts remain authoritative.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, inline SVG, existing YGPHRuntime hooks, Node built-in test runner, PWA Service Worker.

## Global Constraints

- Primary visible product name is `METROPOLIS`.
- Signature is `by YGPH — Yggdrasil Personal Helper`.
- No `metropolis-r5-5.js`.
- No changes to money formulas, Vault/IndexedDB, state schema, schedule rules, durable state semantics, or Exchange/Audit contracts.
- No MutationObserver or render wrapper may be introduced.
- Bottom nav contains exactly Home, Store, Ride, Ledger, Calendar.
- Settings remains a utility/header route, not a bottom-nav city.
- Palette: `#0F1416`, `#1B2326`, `#22C55E`, `#14B8A6`, `#F5C14A`, `#F7F7F8`.
- Full `npm run deploy:gate` must pass before merge.

---

### Task 1: Lock visual/runtime contracts with RED tests

**Files:**
- Create: `tests/metropolis-visual-system.test.cjs`
- Modify only after RED is observed: none

**Interfaces:**
- Consumes: repository source text and Node require exports.
- Produces: regression contract for branding, icon registry, nav composition, runtime boundaries, and production assets.

- [ ] Write tests asserting `metropolis-v4.js` contains `METROPOLIS` primary brand and `by YGPH — Yggdrasil Personal Helper` signature, exposes a reusable SVG icon function/registry, creates a five-item bottom nav, and does not introduce `MutationObserver`.
- [ ] Assert `metropolis-r5-4.js` still exports `r54Metrics` and does not read global balance inside the metric function.
- [ ] Assert CSS contains the approved six palette tokens and bottom-nav active/inactive classes.
- [ ] Assert manifest/service-worker/publication files include the icon assets used by `index.html`/manifest.
- [ ] Run `npm test`; expected RED because new brand/nav/icon contracts are not yet implemented.

### Task 2: Implement production SVG icon registry and brand shell

**Files:**
- Modify: `metropolis-v4.js`
- Test: `tests/metropolis-visual-system.test.cjs`

**Interfaces:**
- Produces `metropolisGlyph(name, options?) -> SVG string` for `home`, `store`, `ride`, `ledger`, `calendar`, `settings`, `wallet`, `stock`, `task`, `payment`, `chevron`.
- Existing `metropolisIcon(app)` becomes an adapter to `metropolisGlyph` for supported METROPOLIS apps.

- [ ] Replace emoji-first navigation/city icon rendering with a local inline-SVG registry using `currentColor`, rounded caps/joins, and `aria-hidden="true"`.
- [ ] Keep emoji fallback only for unsupported utility metadata; core five nav icons must never depend on emoji.
- [ ] Change brand title presentation to `METROPOLIS` and signature to `by YGPH — Yggdrasil Personal Helper`; keep document/product authority/version semantics unchanged.
- [ ] Ensure setup/unlock copy still clearly identifies YGPH METROPOLIS where security context benefits from the full product family name.
- [ ] Run visual contract tests; expect brand/icon subset GREEN.

### Task 3: Build persistent five-item bottom navigation without another runtime patch

**Files:**
- Modify: `metropolis-v4.js`
- Modify: `metropolis-r5-4.css`
- Test: `tests/metropolis-visual-system.test.cjs`

**Interfaces:**
- Produces `#metropolisBottomNav` with buttons using `data-metropolis-nav="home|store|ride|ledger|calendar"`.
- Page state is driven by existing `metropolisShowPage()` / `metropolisApplyPage()` and `YGPHRuntime` hooks.

- [ ] Build the nav once during `metropolisInstall()`; attach click handlers directly to `metropolisShowPage`.
- [ ] In `metropolisApplyPage`, synchronize `aria-current="page"` and `.is-active` without observers.
- [ ] Keep Settings out of the bottom nav; keep existing Settings utility route.
- [ ] Add safe-area bottom padding so content does not hide behind the fixed nav on Android/PWA.
- [ ] Run tests and syntax check.

### Task 4: Restyle Home dashboard and city cards while preserving metric sources

**Files:**
- Modify: `metropolis-r5-4.js`
- Modify: `metropolis-r5-4.css`
- Modify: `metropolis-v4.js`
- Test: existing dashboard tests + new visual contract test

**Interfaces:**
- `r54Metrics(targetState, today, cashSatang)` remains unchanged in behavior/signature.
- Dashboard DOM IDs `metroDashCash`, `metroDashStock`, `metroDashOverdue`, `metroDashPendingOut` remain stable.

- [ ] Change dashboard labels/presentation to the approved compact cards: เงินปัจจุบัน, สต็อก, งานต้องทำ/เลยกำหนด context, ค้างจ่ายเดือนนี้ while retaining the same live values currently computed.
- [ ] Add per-card glyph slots using the shared icon family; no business calculation moves into CSS/UI helpers.
- [ ] Restyle city launcher into a compact 2×2 entry grid with Store/Ride/Ledger/Calendar icons and concise labels.
- [ ] Keep “ต้องทำตอนนี้”/system content below the city entry; do not delete functional Exchange/Report/Settings paths.
- [ ] Run full existing dashboard/calendar regression tests.

### Task 5: Install the approved app icon using existing production filenames

**Files:**
- Replace binary assets: `icon-192.png`, `icon-512.png`
- Modify only if required: `manifest.webmanifest`, `index.html`
- Test: `tests/metropolis-visual-system.test.cjs`, existing icon/publication tests

**Interfaces:**
- Existing file names remain stable so PWA/Apple links do not need a migration.
- Artwork is the simplified M + roof + star mark on Deep Charcoal using Emerald/Teal/Gold accents.

- [ ] Generate deterministic 192×192 and 512×512 PNGs from a local vector definition; no remote artwork/font dependency.
- [ ] Keep mask-safe padding and verify the mark remains legible when cropped to common Android shapes.
- [ ] Confirm manifest/index still reference the existing icon filenames.
- [ ] Run icon/publication tests.

### Task 6: Advance publication generation and lock the rollout

**Files:**
- Modify: `sw.js`
- Modify: `RELEASE_MANIFEST.json`
- Modify if required by current tests: cache-generation assertions under `tests/`
- `.assetsignore` only if the production file list changes; otherwise leave it untouched.

**Interfaces:**
- Service Worker release ID advances from current r15 generation to a new visual-rollout generation.
- Production file alignment remains exact across manifest/APP_SHELL/.assetsignore.

- [ ] Advance release/cache generation so installed PWAs fetch the new CSS/JS/icon bytes.
- [ ] Update release manifest note/release identifier for visual-system rollout without changing core data/provenance version values.
- [ ] Run `npm run deploy:gate`; require zero failures.
- [ ] Inspect PR diff for unrelated logic changes.
- [ ] Merge only the exact head that passed the full gate, then read back `main` brand/nav/icon/cache files.