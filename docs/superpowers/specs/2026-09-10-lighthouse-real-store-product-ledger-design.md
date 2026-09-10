# LIGHTHOUSE Real Store Product + Stock + Sale Design

Date: 2026-09-10
Branch: `feat/lighthouse-real-store-20260910`
Status: DESIGN FOR OWNER REVIEW

## Goal

Move the LIGHTHOUSE Store slice from demo product state to real Greenfield Store truth so the owner can:

1. add a real product through CHAT,
2. add stock to the same real product without creating duplicates,
3. resolve a sale against the stored product identity,
4. reject sales that would make that product stock negative,
5. write real Store sale evidence and real Ledger income,
6. read the durable result back before saying the action succeeded.

This slice is intentionally narrow. It is not a full retail/POS rebuild.

## Existing Constraints

- `main` already contains GO Client as a separate surface inside the same app/deployment.
- GO Client session state must remain isolated from owner Greenfield Runtime data.
- Current Greenfield Store records support sale, purchase, stock withdrawal, and stock adjustment workflows.
- Current stock projection is aggregate only; Store records do not yet carry stable product identity.
- Current LIGHTHOUSE Next Store sale uses hardcoded demo products in localStorage.
- Ledger remains the authority for real cash truth.
- Store remains the authority for store operations and stock truth.

## Approaches Considered

### A. Durable Product Registry in Store domain — chosen

Create a stable product identity and link every new stock-moving Store record to that `productId`.

Pros:
- deterministic product matching,
- correct per-product stock,
- safe retries and readback,
- no second source of truth,
- scales to model/color variants without guessing.

Cons:
- touches Store workflow contracts and stock projection,
- requires backward compatibility for old records without `productId`.

### B. Use record title as product identity — rejected

Treat titles such as `Samsung A55 ดำ` as the stock key.

Pros: less code.

Cons: spelling, aliases, model/color wording, and edits make identity unstable. Duplicate and ambiguous stock become likely.

### C. Keep a LIGHTHOUSE-only product catalog — rejected

Store products only inside LIGHTHOUSE local state while Greenfield remains aggregate.

Pros: quickest UI change.

Cons: creates two truths and directly conflicts with the requirement that CHAT resolves products recorded in the real Store.

## Architecture

### 1. Product identity

Introduce a durable Store `PRODUCT` record with a stable `productId`.

Minimum fields:

- `recordId` / `productId` — stable unique identifier,
- `type: PRODUCT`,
- `name` — required human name,
- `model` — optional,
- `color` — optional,
- `descriptors` — optional normalized extra descriptors supplied by the owner, such as capacity or size,
- `status: ACTIVE`.

No fake value is stored for a missing optional field. If the owner says an attribute does not exist, the field stays absent.

Product identity is the stable ID, not the display title.

### 2. Product uniqueness

When CHAT adds a product, deterministic code compares normalized product identity fields.

Matching rules:

- a supplied attribute may narrow candidates,
- an omitted attribute is not treated as a wildcard that can silently merge two different products,
- if multiple active products remain possible, CHAT must ask for a distinguishing detail,
- if exactly one active product remains, CHAT may use that existing `productId`,
- if zero products match, the flow is product creation rather than silent reuse.

If one unique product is identified, CHAT stops asking product questions and moves to quantity.

The system must never invent model, color, capacity, size, or another attribute.

### 3. Dynamic CHAT intake

The add-product conversation is adaptive rather than a fixed form.

Question selection uses two sources in order:

1. durable Store candidates — if matching products differ by model/color/descriptor, ask the detail that actually separates them;
2. language interpretation only when there is no useful Store candidate — it may suggest that a word such as `มือถือ` normally has a model/variant worth asking about.

The language interpreter is allowed to propose a question, but it is never allowed to manufacture a Product attribute or authorize a Store mutation. Only the owner's answer and deterministic Store resolution become stored truth.

Examples:

`เพิ่มมือถือ`
→ if Store candidates or the language cue indicate that model is meaningful
→ ask `รุ่นอะไรครับ?`
→ if the owner says there is no model, record no model field and move to quantity

`เพิ่มน้ำ 6 ขวด`
→ if no product ambiguity requires model/color
→ do not ask those questions
→ proceed with quantity already supplied

`เพิ่ม Samsung A55 128GB ดำ 3 เครื่อง`
→ if that text uniquely identifies the product and quantity
→ do not ask the same questions again
→ show confirmation

CHAT asks only information that changes the real Store action.

### 4. Initial stock and restock

A Product record and stock quantity are separate truths.

Creating a new Product does not imply stock by itself. Initial stock is represented by a linked Store stock movement.

For the first product addition with quantity, write:

- one `PRODUCT` record,
- one linked positive stock movement carrying the same `productId`.

For an existing matching product, write only the new linked stock movement.

This means:

A55 / 128GB / black has stock 2
+ owner adds 3
= projected stock becomes 5 for the same `productId`.

Retrying the same confirmed operation must not add the quantity twice.

### 5. Stock-moving Store records

New Store records that affect stock must carry `productId`:

- PURCHASE,
- SALE,
- STOCK_WITHDRAWAL,
- STOCK_ADJUSTMENT.

The implementation may use the existing stock-adjustment workflow for owner-entered opening/restock quantities if that produces the cleanest minimal change. The exact command shape belongs in the implementation plan, not this design.

### 6. Per-product stock projection

Extend stock projection so it returns both:

- backward-compatible aggregate `stockQuantity`,
- per-product quantities keyed by `productId`.

Rules:

- PURCHASE adds quantity,
- SALE subtracts quantity,
- STOCK_WITHDRAWAL subtracts quantity,
- STOCK_ADJUSTMENT applies signed delta,
- cancelled records do not count.

A committed action must not make any product quantity negative.

Existing legacy Store records without `productId` remain in the aggregate legacy total. They are not assigned to any new product by guess.

The projection may expose a separate unassigned/legacy quantity if needed for verification, but legacy stock must not silently become a named product.

### 7. Sale resolution

LIGHTHOUSE no longer treats hardcoded demo products as authority for real sales.

Sale flow:

1. parse the owner text,
2. query durable Product records,
3. resolve to exactly one active `productId`,
4. if zero matches, say the product is not found and offer the add-product flow,
5. if multiple matches, ask only the distinguishing question,
6. collect sale quantity,
7. collect sale price if absent,
8. if multiple units are sold and the price wording does not clearly mean unit price or total price, ask rather than guess,
9. verify available stock before confirmation/commit,
10. show a confirmation summary,
11. commit Store + Ledger through the runtime,
12. perform durable readback,
13. report success only after exact verification.

The first real slice supports paid-in-full cash sales only.

Partial payment / receivable flow remains outside this slice even though the underlying Greenfield Store workflow already supports it.

### 8. Price model

Product does not store a default selling price in this slice.

Price belongs to the sale event.

If sale text includes a clear price, use it in the confirmation.

If price is absent, CHAT asks `ขายเท่าไหร่ครับ?`.

If a multi-quantity command contains a number whose meaning is ambiguous between per-unit price and total sale value, CHAT asks the owner to clarify before mutation.

### 9. Cash and domain authority

Store owns:

- Product records,
- product-linked stock movement,
- Sale records.

Ledger owns:

- received cash.

A paid sale must create the real Store sale and linked Ledger IN transaction through one runtime workflow boundary.

Success requires exact durable verification of:

- the expected `productId`,
- expected sale quantity,
- expected sale amount,
- expected Store sale record,
- expected Ledger transaction,
- expected post-sale product stock.

If any readback check fails, LIGHTHOUSE must not say `บันทึกแล้ว` or otherwise claim success.

### 10. Insufficient stock

If available product stock is lower than requested sale quantity, reject the sale before mutation.

Example:

available = 2
requested = 3
→ no Store sale,
→ no Ledger income,
→ tell the owner that only 2 are available.

Negative committed product stock is forbidden.

### 11. Stable operation identity and retry

Confirmed mutations receive stable operation IDs before commit.

At minimum the sale path needs stable workflow and transaction IDs; product creation/restock also needs stable identity sufficient to prevent duplicate writes on retry.

If commit returns an ambiguous result because of lock, interruption, or transport failure, retry must first check durable truth using the same IDs rather than generating a new operation.

Duplicate/idempotent runtime responses are treated as recovery candidates, not automatic success. Exact readback still decides whether the UI may claim success.

### 12. LIGHTHOUSE state migration

Hardcoded `DEFAULT_PRODUCTS` and demo stock may remain only for isolated demo/test behavior if still required, but they must not participate in real Store mutation or real finance totals.

Real Store display and real Store CHAT flows read Product and stock truth from Greenfield Runtime.

The existing localStorage state may keep non-authoritative UI state such as chat history and pending flow, but real product/stock/cash authority cannot live there.

### 13. Manual / Store display

The owner-facing Store/Manual surface should be able to show real products with their current per-product stock.

Minimum useful output for this slice:

- product display name,
- distinguishing details that exist,
- current quantity.

Legacy unassigned aggregate stock must be visually or semantically separated from named products if exposed.

No advanced catalog editing UI is required in this slice.

### 14. GO Client isolation

GO Client and LIGHTHOUSE remain separate surfaces in the same deployed app.

GO Client must not:

- enumerate owner Product records,
- read per-product stock,
- invoke owner Store mutation authority,
- reuse owner pending Store flow.

Any shared shell/worker changes must preserve the existing client-mode block on owner bootstrap/runtime access.

### 15. Error behavior

No mutation on:

- unresolved product ambiguity,
- missing required sale quantity,
- missing/ambiguous sale price,
- insufficient stock,
- locked runtime,
- invalid Product record,
- duplicate Product ambiguity,
- failed Store/Ledger commit,
- durable readback mismatch.

On recoverable failure, keep enough pending context and stable IDs to retry safely.

### 16. Testing strategy

Implementation follows TDD.

Required RED contracts before production changes:

- create a new Product with linked opening stock,
- add stock to the exact existing Product rather than creating a duplicate,
- two similar products remain distinct by model/color/descriptors,
- optional missing attributes are not fabricated,
- zero-match sale does not mutate,
- multi-match sale does not mutate until disambiguated,
- insufficient stock rejects without Store or Ledger writes,
- sale records carry correct `productId`,
- paid sale creates linked Ledger IN,
- post-sale per-product stock is correct,
- aggregate stock stays backward compatible,
- legacy Store records without `productId` are not guessed into a product,
- retry/idempotency does not double-create Product, stock, sale, or Ledger cash,
- readback mismatch suppresses success copy,
- LIGHTHOUSE no longer credits real Store money from demo local products,
- GO Client surface remains unable to access owner Store runtime.

Full deploy/syntax/UTF-8/staging regressions are required before merge consideration.

## Expected Implementation Areas

Likely files/modules include:

- `greenfield/business-workflows.mjs`
- `greenfield/calculation-authority.mjs`
- relevant Greenfield Store/domain validation or reconciliation modules
- `greenfield/runtime.mjs` / workflow runtime surface only where needed
- `lighthouse-next/app.mjs`
- `lighthouse-next/store-sale.mjs`
- a focused LIGHTHOUSE Store runtime bridge/module if needed
- owner Store/Manual projection UI
- targeted Greenfield/LIGHTHOUSE tests

Integration-zone files such as `package.json`, service-worker assets, release manifests, and shared worker entrypoints should be touched only when packaging/verification requires it. Business logic must not be placed there.

## Out of Scope

- GO Floating Quick Access / screenshot overlay,
- Android screen-capture permission flow,
- GO Client feature expansion,
- partial-payment sale UI,
- receivable collection UI changes,
- product default selling price,
- barcode/SKU scanning,
- supplier catalog,
- product images,
- discounts/promotions,
- advanced product editor,
- store publication / APK release claims.

## Success Criteria

The slice is ready for implementation verification when all of the following are true:

1. owner can add a real Product through LIGHTHOUSE CHAT,
2. repeated addition of the same exact Product increases its stock without creating a duplicate Product,
3. CHAT resolves sales only against durable Store Product records,
4. ambiguity causes a question, never a guess,
5. insufficient stock cannot produce a committed sale,
6. paid sale decreases the exact product stock and creates linked Ledger income,
7. success copy appears only after durable Store + Ledger + stock readback,
8. legacy unlinked Store records remain backward compatible without being falsely assigned,
9. GO Client remains isolated from owner Store truth.
