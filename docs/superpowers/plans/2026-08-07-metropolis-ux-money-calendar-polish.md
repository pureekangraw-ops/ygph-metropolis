# METROPOLIS UX, Money, and Calendar Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved STORE shipping-cost behavior, installment reconciliation, Calendar mobile fix, launcher cleanup/icons, and import double-confirmation removal in the real `ygph-metropolis` repository.

**Architecture:** Add one focused runtime layer (`metropolis-r5.js`) and one focused style layer (`metropolis-r5.css`) on top of the existing METROPOLIS v4 layer. Reuse the classic-script global state/functions and existing encrypted commit path; do not refactor the large core `app.js`. Delivery amendment: load the R5 assets from the already-authoritative `sw-bootstrap.js` rather than modifying the large `index.html`, and cache them in the next Service Worker shell.

**Tech Stack:** Plain JavaScript classic scripts, CSS, Node `node:test`, GitHub Actions, Cloudflare Workers Service Worker asset cache.

## Global Constraints

- Repository: `pureekangraw-ops/ygph-metropolis` only.
- State Schema remains 4; no vault/IndexedDB redesign.
- All money remains integer satang.
- New STORE shipping OUT uses an idempotent action key tied to the sale.
- Import acceptance is the confirmation only for newly created imported queues; unrelated VERIFY queues retain their existing gates.
- No standalone shipping line is added to the live STORE report UI.

---

### Task 1: Focused contract tests

**Files:**
- Modify: `tests/store-shipping.test.cjs`
- Create: `tests/metropolis-polish.test.cjs`

- [x] Add a failing contract assertion for STORE gross 500 / shipping 50 => linked OUT 50 and net cash effect 450.
- [x] Add failing assertions for a 3-installment schedule beginning on the 9th to produce months 0,1,2.
- [x] Add failing assertions for imported queues being marked owner-confirmed without changing unrelated VERIFY queues.
- [x] Add failing UI assertions for hidden launcher arrow and compact Calendar card wrapping.
- [x] Confirm RED before adding R5 production assets.

### Task 2: Additive runtime layer

**Files:**
- Create: `metropolis-r5.js`

- [x] Implement pure monthly schedule/date helpers.
- [x] Replace `addSaleBtn.onclick` with the approved optional shipping-cost form; sale bill/receivable stays gross, linked STORE OUT uses subtype `SALE_SHIPPING_COST` and action key `${saleId}:shipping-cost`.
- [x] Replace `addDebtBtn.onclick` with deterministic monthly queue creation and complete installment metadata.
- [x] Add idempotent reconciliation for existing multi-installment obligations missing queue numbers; count any existing queue status as present.
- [x] Make accepted imported queues bypass only the duplicate local verification step while preserving unrelated VERIFY gates.
- [x] Replace launcher card icons with inline monochrome SVG marks and remove/hide open marks.

### Task 3: Compact Calendar layout

**Files:**
- Create: `metropolis-r5.css`

- [x] Hide `.metropolis-open-mark`.
- [x] Style new SVG app icons with the parent app identity color.
- [x] Under compact widths, force Calendar card main content to one readable column, allow title wrapping, keep amount/status readable, hide leading decorative icon tiles, and wrap action buttons inside the card.

### Task 4: Ship the new layer through the existing runtime

**Files:**
- Modify: `sw-bootstrap.js`
- Modify: `sw.js`
- Modify: `package.json`
- Modify: `scripts/verify-utf8.mjs`
- Modify: `.assetsignore`
- Modify: `RELEASE_MANIFEST.json`

- [x] Load `metropolis-r5.css` and `metropolis-r5.js` from `sw-bootstrap.js` with a no-DOM guard for the existing VM regression test.
- [x] Advance `RELEASE_ID` from r3 to r4-polish.
- [x] Add R5 files to the Service Worker shell, syntax check, UTF-8 production list, and asset allow-list.
- [ ] Run the final `npm run deploy:gate` successfully.

### Task 5: Review, merge, delivery verification

- [ ] Verify PR #2 diff matches the six approved ideas and contains no unrelated production changes.
- [ ] Wait for the final GitHub gate to be green.
- [ ] Merge PR #2 to `main`.
- [ ] Verify `main` contains the R5 assets and new SW release; report Cloudflare/live-device status separately if deployment cannot be observed from the connector.
