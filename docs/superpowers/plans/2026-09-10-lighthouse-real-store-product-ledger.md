# LIGHTHOUSE Real Store Product + Stock + Sale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace LIGHTHOUSE demo Store product authority with durable Greenfield Product records, per-product stock truth, adaptive CHAT add/restock, and paid-in-full real sales that reduce the exact product stock and create verified Ledger income.

**Architecture:** Keep Product and stock authority inside the existing Greenfield `STORE` domain. Add a dedicated `STORE_CREATE_PRODUCT` command and product-linked stock movements, extend stock projection and workflow invariants to protect each `productId`, expose narrowly scoped runtime methods, and add a focused `lighthouse-next/runtime-store.mjs` bridge that performs exact durable readback. LIGHTHOUSE CHAT owns only conversational pending state and stable operation IDs; it resolves against durable Product records before mutation. Existing Ledger remains cash authority and GO Client remains isolated from Owner Runtime.

**Tech Stack:** JavaScript ES modules, Greenfield encrypted runtime and command/workflow layers, browser Runtime Session, Node.js 22 `node:test`, LIGHTHOUSE shared Web/Capacitor Android bundle, GitHub Actions deploy gates.

**Spec:** `docs/superpowers/specs/2026-09-10-lighthouse-real-store-product-ledger-design.md`

## Global Constraints

- Work only on `feat/lighthouse-real-store-20260910` until owner explicitly authorizes merge.
- Store owns Product, stock movements, and Sale truth; Ledger owns real cash truth.
- Product identity is a stable `productId`, never a display title.
- Missing optional attributes stay absent; never manufacture model, color, capacity, size, or aliases.
- CHAT asks only details needed to identify one product or complete the requested mutation.
- Existing unlinked Store records remain legacy/unassigned stock and must never be guessed into a Product.
- Existing callers that create legacy SALE/PURCHASE/WITHDRAWAL/ADJUSTMENT without `productId` remain backward compatible.
- New real LIGHTHOUSE Store flows always use a durable `productId`.
- A product-linked mutation may never commit negative per-product stock, even if unrelated legacy aggregate stock is positive.
- First real sale slice is paid-in-full only; no partial-payment or receivable UI expansion.
- Product has no default selling price in this slice. Sale price belongs to the Sale event.
- If quantity is greater than one and price meaning is ambiguous between unit price and total, CHAT must ask before mutation.
- Confirm before real mutation. Success copy appears only after exact durable Store/Ledger/stock readback.
- Stable workflow/record/transaction IDs must be reused on retry; duplicate command responses are recovery candidates, not automatic success.
- Real Product/stock/cash authority must not be persisted in LIGHTHOUSE localStorage.
- GO Client must not enumerate Products, read stock, invoke Store mutation authority, or reuse Owner Store pending state.
- GO Floating Quick Access, screenshot capture, Android overlay permission work, barcode/SKU scanning, product images, supplier catalog, promotions, advanced catalog editing, release publication, and APK claims are out of scope.
- Do not modify `RELEASE_MANIFEST.json`, `release/lighthouse-update.json`, or `android-shell/version.json` for this feature unless a later owner-approved release task explicitly requires it.

## File/Responsibility Map

- `greenfield/domain-operations.mjs` — validates and applies durable Product and Store movement commands.
- `greenfield/business-workflows.mjs` — builds atomic Product/opening-stock/restock/sale workflows and carries `productId` through stock movements.
- `greenfield/calculation-authority.mjs` — authoritative aggregate + per-product stock projection.
- `greenfield/workflow-invariants.mjs` — rejects planned aggregate or per-product stock underflow before execution.
- `greenfield/system-reconciliation.mjs` — detects already-durable negative per-product stock as hard failure.
- `greenfield/store-products.mjs` — pure Product normalization, listing, candidate matching, and display helpers; no persistence.
- `greenfield/runtime.mjs` — exposes narrow Product stock methods through the existing atomic runtime boundary.
- `lighthouse-next/runtime-store.mjs` — Owner-session Store bridge with exact durable readback and retry recovery.
- `lighthouse-next/store-product.mjs` — pure CHAT add-product parsing/question-selection helpers.
- `lighthouse-next/store-sale.mjs` — pure real-product sale parsing, candidate resolution, quantity/price-basis parsing.
- `lighthouse-next/app.mjs` — pending CHAT state, stable IDs, confirmation/error copy, real Store truth refresh, Manual Store rendering.
- `scripts/stage-lighthouse-next-bundle.mjs` — shared Web/Android LIGHTHOUSE runtime file list.
- `android-shell/test/lighthouse-next-package.test.mjs` — byte-identity staging guard.
- `package.json` — explicit syntax coverage only; no business logic.

---

### Task 1: Add durable Product identity and atomic create/restock workflows

**Files:**
- Create: `greenfield/store-products.mjs`
- Modify: `greenfield/domain-operations.mjs`
- Modify: `greenfield/business-workflows.mjs`
- Create: `tests/greenfield-store-products.test.cjs`
- Modify: `tests/greenfield-business-secondary.test.cjs`

**Interfaces:**
- `normalizeProductIdentity(input) -> { name, model?, color?, descriptors? }`
- `listActiveProducts(state) -> Product[]`
- `findProductCandidates(state, query) -> Product[]`
- `buildCreateProductStockWorkflow({ workflowId, productId, stockRecordId, name, model, color, descriptors, quantity })`
- `buildAddProductStockWorkflow({ workflowId, productId, stockRecordId, title, quantity })`
- Existing `buildSaleWorkflow`, `buildPurchaseWorkflow`, `buildStockWithdrawalWorkflow`, and `buildStockAdjustmentWorkflow` accept optional `productId` and preserve legacy behavior when omitted.

- [ ] **Step 1: Write RED tests for Product normalization and deterministic candidate matching.**

Create `tests/greenfield-store-products.test.cjs` with cases equivalent to:

```js
const test = require('node:test');
const assert = require('node:assert/strict');

function stateWithProducts(products) {
  return { schema:2, revision:1, domains:{ STORE:{records:Object.fromEntries(products.map(p => [p.recordId,{record:p}]))}, LEDGER:{records:{}}, CALENDAR:{records:{}}, RIDE:{records:{}} } };
}

test('missing optional Product fields stay absent', async () => {
  const { normalizeProductIdentity } = await import('../greenfield/store-products.mjs');
  assert.deepEqual(normalizeProductIdentity({ name:'ฟิล์มกันรอย', model:'ไม่มี', color:'' }), { name:'ฟิล์มกันรอย' });
});

test('candidate matching never silently merges two variants when query omits the differing field', async () => {
  const { findProductCandidates } = await import('../greenfield/store-products.mjs');
  const state = stateWithProducts([
    {recordId:'P-A',productId:'P-A',type:'PRODUCT',source:'STORE',name:'Samsung A55',color:'ดำ',status:'ACTIVE'},
    {recordId:'P-B',productId:'P-B',type:'PRODUCT',source:'STORE',name:'Samsung A55',color:'ฟ้า',status:'ACTIVE'},
  ]);
  assert.deepEqual(findProductCandidates(state,{name:'Samsung A55'}).map(p=>p.productId), ['P-A','P-B']);
  assert.deepEqual(findProductCandidates(state,{name:'Samsung A55',color:'ดำ'}).map(p=>p.productId), ['P-A']);
});
```

- [ ] **Step 2: Run the new test file and verify RED.**

```bash
node --test tests/greenfield-store-products.test.cjs
```

Expected: FAIL because `greenfield/store-products.mjs` does not exist.

- [ ] **Step 3: Implement the pure Product helper.**

Create `greenfield/store-products.mjs` with normalization that trims/collapses whitespace, treats `ไม่มี`/empty optional fields as absent, sorts/deduplicates descriptor strings, lists only active `PRODUCT` records, and returns all candidates consistent with the supplied fields. Candidate matching must never choose one candidate when an omitted field is the only thing separating multiple Products.

Use this stable return shape:

```js
export function normalizeProductIdentity(input = {}) {
  const name = normalizeRequired(input.name, 'INVALID_PRODUCT_NAME');
  const product = { name };
  const model = normalizeOptional(input.model);
  const color = normalizeOptional(input.color);
  const descriptors = normalizeDescriptors(input.descriptors);
  if (model) product.model = model;
  if (color) product.color = color;
  if (descriptors.length) product.descriptors = descriptors;
  return product;
}
```

- [ ] **Step 4: Add RED command/workflow tests.**

Extend `tests/greenfield-business-secondary.test.cjs` to assert that a create workflow emits `STORE_CREATE_PRODUCT` followed by a `STOCK_ADJUSTMENT` carrying the same `productId`, and that restock emits only the linked adjustment. Also assert existing legacy purchase/withdrawal builders still work without `productId`.

Core assertions:

```js
const create = buildCreateProductStockWorkflow({
  workflowId:'WF-P1', productId:'P1', stockRecordId:'STOCK-P1-OPEN',
  name:'Samsung A55', model:'128GB', color:'ดำ', quantity:3,
});
assert.equal(create.commands[0].type, 'STORE_CREATE_PRODUCT');
assert.equal(create.commands[0].payload.record.productId, 'P1');
assert.equal(create.commands[1].payload.record.productId, 'P1');
assert.equal(create.commands[1].payload.record.quantity, 3);
```

- [ ] **Step 5: Run targeted tests and verify RED.**

```bash
node --test tests/greenfield-store-products.test.cjs tests/greenfield-business-secondary.test.cjs
```

Expected: failures for missing Product command/builders and missing `productId` propagation.

- [ ] **Step 6: Implement `STORE_CREATE_PRODUCT` and workflow builders minimally.**

In `domain-operations.mjs`, register a dedicated Product command rather than forcing PRODUCT through the amount/quantity requirements of `STORE_CREATE_RECORD`:

```js
runtime.register('STORE', 'STORE_CREATE_PRODUCT', ({ domainState, payload, command }) => {
  const input = payload?.record;
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_PRODUCT_RECORD');
  const at = now();
  const identity = normalizeProductIdentity(input);
  const productId = requiredText(input.productId ?? input.recordId, 'INVALID_PRODUCT_ID');
  createEntry(domainState, {
    ...identity,
    recordId:productId,
    productId,
    source:'STORE',
    type:'PRODUCT',
    status:'ACTIVE',
    createdAt:input.createdAt || at,
    updatedAt:at,
  }, command, at);
});
```

For `STORE_CREATE_RECORD`, if `input.productId` is present, preserve it after validating it points to an active Product already present in `domainState`. Keep productId optional so legacy workflows remain valid.

In `business-workflows.mjs`, add Product/opening-stock and restock builders. Product creation + opening stock must share one workflow so `executeAtomicWorkflow` commits them together.

- [ ] **Step 7: Run targeted tests and verify GREEN.**

```bash
node --test tests/greenfield-store-products.test.cjs tests/greenfield-business-secondary.test.cjs
node --check greenfield/store-products.mjs
node --check greenfield/domain-operations.mjs
node --check greenfield/business-workflows.mjs
```

Expected: all targeted tests PASS; syntax commands exit 0.

- [ ] **Step 8: Commit Task 1.**

```bash
git add greenfield/store-products.mjs greenfield/domain-operations.mjs greenfield/business-workflows.mjs tests/greenfield-store-products.test.cjs tests/greenfield-business-secondary.test.cjs
git commit -m "feat: add durable Store product identity"
```

---

### Task 2: Project and protect per-product stock without breaking legacy aggregate stock

**Files:**
- Modify: `greenfield/calculation-authority.mjs`
- Modify: `greenfield/workflow-invariants.mjs`
- Modify: `greenfield/system-reconciliation.mjs`
- Modify: `tests/greenfield-store-projection.test.cjs`
- Modify: `tests/greenfield-system-reconciliation.test.cjs`
- Modify: `tests/greenfield-store-products.test.cjs`

**Interfaces:**
- `projectStockTruth(state) -> { stockQuantity, legacyUnassignedQuantity, byProductId }`
- `byProductId[productId]` is signed projected stock from non-cancelled linked movements only.
- Aggregate remains exactly compatible with all stock-moving records, including legacy unlinked records.

- [ ] **Step 1: Add RED projection tests.**

Add a state containing `PRODUCT P1`, linked +5 adjustment, linked -2 sale, and legacy +7 adjustment. Assert:

```js
assert.deepEqual(projectStockTruth(state), {
  stockQuantity:10,
  legacyUnassignedQuantity:7,
  byProductId:{ P1:3 },
});
```

Also keep the existing `projectStore(...).stockQuantity === 2` legacy test unchanged.

- [ ] **Step 2: Run projection tests and verify RED.**

```bash
node --test tests/greenfield-store-projection.test.cjs tests/greenfield-store-products.test.cjs
```

Expected: new per-product shape assertions fail while existing aggregate assertions still describe current behavior.

- [ ] **Step 3: Implement per-product projection.**

Refactor `projectStockTruth` around one movement delta helper. `PRODUCT` contributes zero. Linked movements update `byProductId`; unlinked movements update `legacyUnassignedQuantity`; every movement still updates aggregate `stockQuantity`.

- [ ] **Step 4: Add RED invariant tests for masked product underflow.**

Construct durable state with legacy unassigned +100, Product P1 +1, then planned P1 SALE quantity 2. Assert `validateWorkflowInvariants` rejects even though aggregate would remain positive:

```js
assert.throws(
  () => validateWorkflowInvariants(state, saleCommands),
  /STORE_PRODUCT_STOCK_UNDERFLOW:P1\/-1/,
);
```

Also assert an opening-stock workflow that creates P2 then adds +3 is allowed, and a linked movement referencing neither an existing nor planned Product is rejected.

- [ ] **Step 5: Implement product-level workflow invariant.**

During preflight, build the set of active durable Product IDs plus Product IDs created by `STORE_CREATE_PRODUCT` commands in the same plan. For each linked movement, validate reference membership and accumulate planned delta by Product. Reject any final per-product quantity below zero. Preserve current aggregate `STORE_STOCK_UNDERFLOW` behavior for legacy compatibility.

- [ ] **Step 6: Add and implement reconciliation coverage.**

Extend `reconcileSystemState` so any negative value in `projectStockTruth(state).byProductId` produces a hard error such as:

```js
{ code:'STORE_PRODUCT_STOCK_UNDERFLOW', productId:'P1', value:-1 }
```

Keep the current aggregate reconciliation check.

- [ ] **Step 7: Verify Task 2 GREEN.**

```bash
node --test tests/greenfield-store-projection.test.cjs tests/greenfield-store-products.test.cjs tests/greenfield-system-reconciliation.test.cjs
node --check greenfield/calculation-authority.mjs
node --check greenfield/workflow-invariants.mjs
node --check greenfield/system-reconciliation.mjs
```

Expected: targeted tests PASS; syntax exits 0.

- [ ] **Step 8: Commit Task 2.**

```bash
git add greenfield/calculation-authority.mjs greenfield/workflow-invariants.mjs greenfield/system-reconciliation.mjs tests/greenfield-store-projection.test.cjs tests/greenfield-store-products.test.cjs tests/greenfield-system-reconciliation.test.cjs
git commit -m "feat: project and protect per-product stock"
```

---

### Task 3: Expose Product operations through runtime and add exact-readback LIGHTHOUSE Store bridge

**Files:**
- Modify: `greenfield/runtime.mjs`
- Create: `lighthouse-next/runtime-store.mjs`
- Create: `tests/greenfield-lighthouse-real-store.test.cjs`
- Modify: `tests/greenfield-runtime.test.cjs`

**Interfaces:**
- `runtime.createProductStock(input)` executes Product + opening stock atomically.
- `runtime.addProductStock(input)` executes linked positive restock.
- Existing `runtime.sale(input)` accepts `productId` and continues to support legacy calls without it.
- `createLighthouseStoreBridge(deps?)` produces `readStoreTruth`, `createProductWithStock`, `addProductStock`, and `sellProduct`.

- [ ] **Step 1: Write RED runtime tests.**

Use the existing memory-vault pattern. Create Product P1 with stock 3, restock 2, then read durable state and assert one PRODUCT record and P1 stock 5. Also call legacy `runtime.sale(...)` from existing tests unchanged to prove compatibility.

- [ ] **Step 2: Run runtime tests and verify RED.**

```bash
node --test tests/greenfield-runtime.test.cjs
```

Expected: new Product runtime methods are missing.

- [ ] **Step 3: Implement narrow runtime methods.**

Import the two new workflow builders and expose:

```js
createProductStock: input => executePlan(buildCreateProductStockWorkflow(input)),
addProductStock: input => executePlan(buildAddProductStockWorkflow(input)),
```

Do not add Product persistence outside the existing atomic workflow path.

- [ ] **Step 4: Write RED bridge tests.**

Create `tests/greenfield-lighthouse-real-store.test.cjs` to verify:

```js
const truth = await bridge.readStoreTruth();
assert.equal(truth.products[0].productId, 'P1');
assert.equal(truth.products[0].quantity, 5);

const sale = await bridge.sellProduct({
  workflowId:'WF-S1', saleId:'SALE-S1', ledgerTransactionId:'TX-S1',
  productId:'P1', productName:'Samsung A55', quantity:2, totalBaht:11800,
});
assert.equal(sale.status, 'VERIFIED');
assert.equal(sale.postStock, 3);
```

Add explicit tests that insufficient stock performs zero `runtime.sale` calls, readback mismatch rejects with `LIGHTHOUSE_STORE_READBACK_MISMATCH`, and a `DUPLICATE_COMMAND:` failure recovers only when exact Product/stock/Sale/Ledger readback matches the same stable IDs.

- [ ] **Step 5: Run bridge tests and verify RED.**

```bash
node --test tests/greenfield-lighthouse-real-store.test.cjs
```

Expected: FAIL because `lighthouse-next/runtime-store.mjs` does not exist.

- [ ] **Step 6: Implement `runtime-store.mjs`.**

Use `withRuntimeSession` and `projectStockTruth`. `readStoreTruth()` reads durable state and returns active Products decorated with projected quantity plus `legacyUnassignedQuantity`. Mutation methods catch only `DUPLICATE_COMMAND:` as a recovery candidate, then always read durable state and exact-verify expected IDs/fields.

For paid sale, enforce this order inside one session callback:

```js
const before = await runtime.readState();
const beforeStock = projectStockTruth(before).byProductId[productId] ?? 0;
if (beforeStock < quantity) throw new Error(`LIGHTHOUSE_STORE_INSUFFICIENT_STOCK:${beforeStock}/${quantity}`);
try {
  await runtime.sale({ workflowId, saleId, ledgerTransactionId, productId, title:productName,
    amountSatang:totalSatang, quantity, receivedSatang:totalSatang, storeCostSatang:0 });
} catch (error) {
  if (!duplicateCommand(error)) throw error;
}
const after = await runtime.readState();
verifySaleAndLedger(after, expected);
const postStock = projectStockTruth(after).byProductId[productId] ?? 0;
if (postStock !== beforeStock - quantity) throw new Error('LIGHTHOUSE_STORE_READBACK_MISMATCH');
```

- [ ] **Step 7: Verify runtime + bridge GREEN.**

```bash
node --test tests/greenfield-runtime.test.cjs tests/greenfield-lighthouse-real-store.test.cjs tests/greenfield-store-cash-cost-readback-copy.test.cjs
node --check greenfield/runtime.mjs
node --check lighthouse-next/runtime-store.mjs
```

Expected: all targeted tests PASS; existing paid-sale/cost behavior remains green.

- [ ] **Step 8: Commit Task 3.**

```bash
git add greenfield/runtime.mjs lighthouse-next/runtime-store.mjs tests/greenfield-runtime.test.cjs tests/greenfield-lighthouse-real-store.test.cjs
git commit -m "feat: bridge LIGHTHOUSE to real Store runtime"
```

---

### Task 4: Replace demo product parsing with adaptive real-Product CHAT parsing

**Files:**
- Create: `lighthouse-next/store-product.mjs`
- Modify: `lighthouse-next/store-sale.mjs`
- Modify: `tests/greenfield-lighthouse-real-store.test.cjs`

**Interfaces:**
- `parseProductAddText(text) -> draft | null`
- `suggestProductQuestion(draft, products) -> { field, prompt } | null`
- `resolveProductDraft(draft, products) -> { status:'MATCH'|'AMBIGUOUS'|'NEW', ... }`
- `parseStoreSale(text, products)` consumes durable Product projections using `productId`, not demo IDs.
- Sale draft has `quantity`, `priceBaht`, and `priceBasis:'UNIT'|'TOTAL'|null`.

- [ ] **Step 1: Add RED pure-parser tests.**

Cover owner-approved examples:

```js
assert.deepEqual(parseProductAddText('เพิ่มน้ำ 6 ขวด'), { name:'น้ำ', quantity:6 });
assert.equal(suggestProductQuestion({name:'มือถือ'}, []).field, 'model');
assert.equal(suggestProductQuestion({name:'มือถือ',model:null,modelExplicitlyAbsent:true}, []), null);
```

With two stored A55 colors, query `ขาย Samsung A55` must return ambiguity; query including `ดำ` must resolve P1. A zero-match sale must return NOT_FOUND/`null` without selecting demo phone data.

Price tests:

```js
assert.equal(parseStoreSale('ขาย A55 2 เครื่อง ชิ้นละ 5900', products).priceBasis, 'UNIT');
assert.equal(parseStoreSale('ขาย A55 2 เครื่อง รวม 11800', products).priceBasis, 'TOTAL');
assert.equal(parseStoreSale('ขาย A55 2 เครื่อง 5900', products).priceBasis, null);
```

- [ ] **Step 2: Run parser tests and verify RED.**

```bash
node --test tests/greenfield-lighthouse-real-store.test.cjs
```

Expected: missing `store-product.mjs` and current demo sale parser shape cause failures.

- [ ] **Step 3: Implement minimal deterministic parsing.**

`store-product.mjs` may use a small deterministic language cue set for broad mobile terms (`มือถือ`, `โทรศัพท์`, `โทสับ`) to suggest asking model when there are no useful durable candidates. Durable candidate differences take priority. The cue can suggest a question only; it never supplies an attribute value.

Treat owner replies `ไม่มี`, `ไม่มีรุ่น`, `ไม่มีสี` as explicit absence for that pending field, then skip it rather than persisting a fake value.

- [ ] **Step 4: Refactor sale parser for durable Products and explicit price basis.**

Recognize unit-price words such as `ชิ้นละ`, `เครื่องละ`, `อันละ`, `ต่อชิ้น`; recognize total words such as `รวม`, `ทั้งหมด`, `ยอด`. For quantity 1 a bare price is safe because unit and total are identical; for quantity >1 leave basis null unless text is explicit.

- [ ] **Step 5: Verify parser GREEN.**

```bash
node --test tests/greenfield-lighthouse-real-store.test.cjs
node --check lighthouse-next/store-product.mjs
node --check lighthouse-next/store-sale.mjs
```

Expected: parser tests PASS; syntax exits 0.

- [ ] **Step 6: Commit Task 4.**

```bash
git add lighthouse-next/store-product.mjs lighthouse-next/store-sale.mjs tests/greenfield-lighthouse-real-store.test.cjs
git commit -m "feat: resolve Store chat against durable products"
```

---

### Task 5: Wire real add-product/restock flow into LIGHTHOUSE CHAT

**Files:**
- Modify: `lighthouse-next/app.mjs`
- Modify: `lighthouse-next/index.html` only for truthful settings/copy if needed
- Modify: `tests/greenfield-lighthouse-real-store.test.cjs`

**Interfaces:**
- Add `storeBridge = createLighthouseStoreBridge()` and in-memory `storeTruth` loaded only after runtime unlock.
- Pending `STORE_PRODUCT_ADD` stores conversational fields plus stable `workflowId`, `productId` when creating, and `stockRecordId`.
- localStorage may store pending/chat UI state but not authoritative Product list or stock.

- [ ] **Step 1: Add RED source/flow tests.**

Assert `app.mjs` imports `runtime-store.mjs` and `store-product.mjs`, loads `storeTruth = await storeBridge.readStoreTruth()` after successful login, and no real add/restock path mutates `state.products[*].stock`.

Assert pending identity survives retry and confirmation calls exactly one of:

```js
await storeBridge.createProductWithStock(...)
await storeBridge.addProductStock(...)
```

- [ ] **Step 2: Run targeted test and verify RED.**

```bash
node --test tests/greenfield-lighthouse-real-store.test.cjs
```

Expected: source-contract tests fail because app still uses demo Product authority.

- [ ] **Step 3: Add real Store truth lifecycle.**

On login read Ledger truth and Store truth before `showApp()`. On lock clear both in-memory truths. Replace `products` in localStorage snapshots with no authoritative Product storage; migration may ignore old demo `products` values.

- [ ] **Step 4: Implement adaptive `เพิ่มสินค้า` pending flow.**

Flow rules:

```text
command -> parse supplied name/variant/quantity
-> resolve against durable products
-> if candidates need distinguishing detail: ask that one detail
-> if broad new mobile term needs model: ask model
-> if owner explicitly says no attribute: skip it
-> when exactly one existing Product is known: ask quantity only if absent
-> when new Product is known: ask quantity only if absent
-> show one confirmation summary
-> allocate stable IDs once
-> commit through Store bridge
-> exact readback
-> success copy + refresh Store truth
```

Keep pending state when runtime is locked, commit fails, or readback mismatches. Do not generate fresh IDs on retry.

- [ ] **Step 5: Make copy truthful.**

Update the welcome/settings wording so real Store/Ledger data is not labeled as wholly simulated. It is acceptable to say conversation/pending UI state is local to the device while financial/Store truth comes from the secured runtime.

- [ ] **Step 6: Verify add/restock flow GREEN.**

```bash
node --test tests/greenfield-lighthouse-real-store.test.cjs tests/greenfield-lighthouse-real-income.test.cjs tests/greenfield-lighthouse-runtime-gate.test.cjs
node --check lighthouse-next/app.mjs
```

Expected: all targeted tests PASS; general-income and runtime-gate behavior remains green.

- [ ] **Step 7: Commit Task 5.**

```bash
git add lighthouse-next/app.mjs lighthouse-next/index.html tests/greenfield-lighthouse-real-store.test.cjs
git commit -m "feat: add real Store products through LIGHTHOUSE chat"
```

---

### Task 6: Wire paid real sales, stock deduction, Ledger income, and retry safety

**Files:**
- Modify: `lighthouse-next/app.mjs`
- Modify: `tests/greenfield-lighthouse-real-store.test.cjs`
- Modify: `tests/greenfield-store-cash-cost-readback-copy.test.cjs` only if product-linked coverage belongs beside the existing cash-sale readback test

**Interfaces:**
- Pending `STORE_SALE` owns stable `workflowId`, `saleId`, `ledgerTransactionId`, exact `productId`, quantity, `priceBaht`, `priceBasis`, and calculated `totalBaht`.
- Confirmation calls only `storeBridge.sellProduct(...)`.

- [ ] **Step 1: Add RED CHAT sale contracts.**

Cover: zero match -> no mutation; multi-match -> ask distinction; missing quantity -> ask; missing price -> `ขายเท่าไหร่ครับ?`; ambiguous multi-quantity price -> ask unit-vs-total; insufficient stock -> no Store/Ledger write; paid sale -> exact product stock decreases and Ledger balance/income refreshes.

- [ ] **Step 2: Verify RED.**

```bash
node --test tests/greenfield-lighthouse-real-store.test.cjs
```

Expected: current `confirmStoreSale` still mutates demo `state.products`, demo transactions, and demo cash, so new contracts fail.

- [ ] **Step 3: Replace demo `confirmStoreSale` with async verified real sale.**

Before confirmation compute `totalBaht` deterministically:

```js
function totalSaleBaht(pending) {
  if (pending.priceBasis === 'TOTAL') return pending.priceBaht;
  if (pending.priceBasis === 'UNIT') return pending.priceBaht * pending.quantity;
  if (pending.quantity === 1) return pending.priceBaht;
  throw new Error('LIGHTHOUSE_STORE_PRICE_BASIS_REQUIRED');
}
```

Allocate IDs once before showing confirmation. On confirmation call bridge, refresh both `storeTruth` and `ledgerTruth`, clear pending only after VERIFIED readback, then render success.

- [ ] **Step 4: Remove demo authority from real sale path.**

The real sale body must not contain:

```text
product.stock -=
state.cash +=
state.todayIncome +=
state.transactions.push
```

If demo fixtures remain for isolated tests, they must be unreachable from authenticated real Store mutation.

- [ ] **Step 5: Verify sale GREEN and durable runtime behavior.**

```bash
node --test tests/greenfield-lighthouse-real-store.test.cjs tests/greenfield-store-cash-cost-readback-copy.test.cjs tests/greenfield-runtime.test.cjs
node --check lighthouse-next/app.mjs
```

Expected: PASS. Sale record has exact `productId`, Ledger IN has `sourceRef=STORE/<saleId>` and `detail=IN:SALE`, post-stock equals pre-stock minus quantity.

- [ ] **Step 6: Commit Task 6.**

```bash
git add lighthouse-next/app.mjs tests/greenfield-lighthouse-real-store.test.cjs tests/greenfield-store-cash-cost-readback-copy.test.cjs
git commit -m "feat: record verified real Store sales"
```

---

### Task 7: Render real inventory, stage the new modules, and run full isolation/regression gates

**Files:**
- Modify: `lighthouse-next/app.mjs`
- Modify: `scripts/stage-lighthouse-next-bundle.mjs`
- Modify: `android-shell/test/lighthouse-next-package.test.mjs`
- Modify: `package.json`
- Modify: `tests/greenfield-lighthouse-real-store.test.cjs`
- Verify unchanged behavior: `tests/greenfield-go-client.test.cjs`, `tests/greenfield-go-client-manager.test.cjs`

**Interfaces:**
- Manual Store reads `storeTruth.products`, displaying only real Product name/details/current quantity.
- Legacy unassigned quantity is labeled separately when non-zero.
- Shared staged bundle includes `runtime-store.mjs` and `store-product.mjs` byte-identically.

- [ ] **Step 1: Add RED Manual Store source/behavior contracts.**

Assert Manual Store output reads `storeTruth.products`, includes each Product’s present attributes and quantity, and never uses `state.products` as real inventory. If `legacyUnassignedQuantity !== 0`, render a separate compatibility line such as `สต็อกเดิมที่ยังไม่ผูกสินค้า` rather than assigning it to a Product.

- [ ] **Step 2: Implement minimal Manual real inventory rendering.**

Do not build an advanced product editor. Keep the current Manual navigation and replace only the Store detail data source/content necessary for real inventory.

- [ ] **Step 3: Add new LIGHTHOUSE modules to the shared staging list.**

In `LIGHTHOUSE_RUNTIME_FILES`, add:

```js
'runtime-store.mjs',
'store-product.mjs',
```

`greenfield/store-products.mjs` should enter staged Greenfield closure through runtime imports; do not hardcode it into a second list unless closure testing proves that necessary.

- [ ] **Step 4: Extend Android staging byte-identity test.**

Add existence and byte-equality assertions for `runtime-store.mjs` and `store-product.mjs`. Retain all forbidden-tree assertions.

- [ ] **Step 5: Close explicit syntax coverage gaps.**

Add to `package.json` `check:syntax`:

```text
node --check greenfield/store-products.mjs
node --check lighthouse-next/runtime-store.mjs
node --check lighthouse-next/store-product.mjs
node --check lighthouse-next/store-sale.mjs
```

- [ ] **Step 6: Run focused Store + Client isolation tests.**

```bash
node --test tests/greenfield-lighthouse-real-store.test.cjs tests/greenfield-go-client.test.cjs tests/greenfield-go-client-manager.test.cjs
node --test android-shell/test/lighthouse-next-package.test.mjs
```

Expected: PASS. Existing GO Client tests continue to prove client mode does not open Owner Greenfield Runtime.

- [ ] **Step 7: Run the full repository gate.**

```bash
npm run deploy:gate
node --test android-shell/test/lighthouse-next-package.test.mjs
```

Expected: zero test failures, syntax exit 0, UTF-8 exit 0, Android staging package test PASS.

- [ ] **Step 8: Inspect the final diff for scope containment.**

Verify only Store/Product/LIGHTHOUSE runtime, tests, staging, and necessary syntax-list files changed. Confirm no GO Floating Quick Access, screenshot/overlay, Client business feature, release version, APK publication, or unrelated refactor entered the branch.

- [ ] **Step 9: Commit Task 7.**

```bash
git add lighthouse-next/app.mjs scripts/stage-lighthouse-next-bundle.mjs android-shell/test/lighthouse-next-package.test.mjs package.json tests/greenfield-lighthouse-real-store.test.cjs
git commit -m "test: gate real LIGHTHOUSE Store bundle"
```

---

## Final Verification Before Review

Run fresh, from the exact branch head:

```bash
npm run deploy:gate
node --test android-shell/test/lighthouse-next-package.test.mjs
```

Then verify these invariants against durable test state, not UI assumptions:

1. one new Product + opening stock creates one Product and one linked stock movement atomically;
2. restocking the exact Product does not create a duplicate Product;
3. two variants remain distinct and ambiguous text never guesses;
4. legacy unlinked stock still contributes to aggregate but not named Product stock;
5. linked Product stock cannot go negative even when legacy aggregate stock could mask it;
6. paid sale creates one linked Store SALE and one Ledger IN and reduces exactly that `productId` stock;
7. retry with the same IDs cannot double-stock, double-sale, or double-credit Ledger;
8. readback mismatch suppresses success copy and preserves retry context;
9. authenticated real Store flow never uses hardcoded demo Product stock as authority;
10. GO Client remains unable to open or read Owner Store Runtime;
11. shared Web/Android LIGHTHOUSE staging contains the new modules byte-identically;
12. no release/APK publication claim is made from these gates.

After all verification evidence is fresh, open/update a PR for owner review. Do not merge until the owner explicitly says `เมิก` or otherwise authorizes merge.