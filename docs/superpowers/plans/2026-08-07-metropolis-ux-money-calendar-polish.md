# METROPOLIS UX, Money, and Calendar Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved STORE shipping-cost behavior, installment reconciliation, Calendar mobile fix, launcher cleanup/icons, and import double-confirmation removal in the real `ygph-metropolis` repository.

**Architecture:** Add one focused runtime layer (`metropolis-r5.js`) and one focused style layer (`metropolis-r5.css`) after the existing METROPOLIS v4 layer. Reuse the classic-script global state/functions and existing encrypted commit path; do not refactor the large core `app.js`. Update the Service Worker shell/release and deploy-gate file lists so installed clients receive the layer.

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
- Modify: `tests/store-shipping-cost.test.cjs`
- Create: `tests/metropolis-polish.test.cjs`

**Interfaces:**
- Produces assertions that require `metropolis-r5.js`, `metropolis-r5.css`, SW shell inclusion, monthly installment repair, imported-queue verification clearing, no launcher arrow, and SVG app icons.

- [ ] Add a failing contract assertion for STORE gross 500 / shipping 50 => linked OUT 50 and net cash effect 450.
- [ ] Add failing assertions for a 3-installment schedule beginning on the 9th to produce months 0,1,2.
- [ ] Add failing assertions for imported queues being marked owner-confirmed without changing unrelated VERIFY queues.
- [ ] Add failing UI assertions for hidden launcher arrow and compact Calendar card wrapping.
- [ ] Run `node --test tests/store-shipping-cost.test.cjs tests/metropolis-polish.test.cjs` and confirm RED because R5 does not exist.

### Task 2: Additive runtime layer

**Files:**
- Create: `metropolis-r5.js`

**Interfaces:**
- Consumes global classic-script bindings: `state`, `byId`, `openModal`, `parseMoneyToSatang`, `parseQuantity`, `parseSatang`, `splitInstallments`, `addMonths`, `uid`, `nowIso`, `localISO`, `takeStockFromPool`, `addTransaction`, `addQueue`, `persistAndRender`, `money`, `validISODate`, `MAX_INSTALLMENTS`, `renderAll`, `YGPHRuntime`.
- Produces pure helpers under `globalThis.YGPHMetropolisR5` for tests: `monthlyDueDates`, `shippingNetEffect`, `missingInstallmentNumbers`.

- [ ] Implement pure monthly schedule/date helpers.
- [ ] Replace `addSaleBtn.onclick` with the approved optional shipping-cost form; sale bill/receivable stays gross, linked STORE OUT uses subtype `SALE_SHIPPING_COST` and action key `${saleId}:shipping-cost`.
- [ ] Replace `addDebtBtn.onclick` with deterministic monthly queue creation and complete installment metadata.
- [ ] Add idempotent reconciliation for existing multi-installment obligations missing queue numbers; count any existing queue status as present.
- [ ] After accepted import, mark only newly imported queues as owner-confirmed (`status OPEN` when unpaid, `requiresRefreshBeforePayment=false`, `verifiedAt`, `verifiedNote`) before the normal durable commit completes.
- [ ] Replace launcher card icons with inline monochrome SVG marks and remove/hide open marks.
- [ ] Register `afterRender` hook to reapply launcher polish and run safe installment reconciliation once per unlocked state revision.

### Task 3: Compact Calendar layout

**Files:**
- Create: `metropolis-r5.css`

**Interfaces:**
- Targets existing `.metropolis-app-card`, `.metropolis-open-mark`, Calendar `.flow-swipe-card`, `.record`, `.queue-card`, `.record-head`, action containers/buttons.

- [ ] Hide `.metropolis-open-mark`.
- [ ] Style new SVG app icons with the parent app identity color.
- [ ] Under compact widths, force Calendar card main content to one readable column, allow title wrapping by words, keep amount/status on their own row, hide leading decorative icon tiles, and wrap action buttons inside the card.

### Task 4: Ship the new layer through the existing runtime

**Files:**
- Modify: `index.html`
- Modify: `sw.js`
- Modify: `package.json`
- Modify: `scripts/verify-utf8.mjs`
- Modify: `.assetsignore`

**Interfaces:**
- Load `metropolis-r5.css` after `metropolis-v4.css` and `metropolis-r5.js` after `metropolis-v4.js`.
- Add both files to `APP_SHELL`.

- [ ] Advance `RELEASE_ID` from r3 to r4-polish.
- [ ] Add R5 files to shell, syntax check, UTF-8 production list, and asset allow-list.
- [ ] Run focused tests, then `npm run deploy:gate`.

### Task 5: Review, merge, delivery verification

**Files:**
- Review PR #2 diff only; no unrelated files.

- [ ] Verify PR diff matches the six approved ideas.
- [ ] Wait for the single final GitHub gate to be green.
- [ ] Merge PR #2 to `main`.
- [ ] Verify `main` contains the R5 assets and new SW release; report Cloudflare/live-device status separately if deployment cannot be observed from the connector.
