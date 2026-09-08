# LIGHTHOUSE Store Truth Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the current mobile staging demo with one complete registered-product sale loop: semantic recognition → missing-slot question → confirmation → stock/money/history propagation → safe reversal.

**Architecture:** Keep the existing `lighthouse-next` static demo and production root untouched. Add a pure `store-sale.mjs` parser for registered-product semantics, then let `app.mjs` own local demo state and all visible propagation. Reuse existing HTML/CSS surfaces; no backend or production runtime is called.

**Tech Stack:** HTML5, vanilla ES modules, localStorage, Node 22 test runner, existing Cloudflare PR staging.

**Spec:** `docs/superpowers/specs/2026-09-07-lighthouse-store-truth-demo.md`

## Global Constraints

- Root navigation stays exactly `หน้าหลัก | แชต | MANUAL | ตั้งค่า`.
- General income remains `จำนวนเงิน + ที่มา`; `ทิป` never auto-routes to Ride.
- Registered Store sale order is fixed `สินค้า → มูลค่า → จำนวน`.
- The first number after a matched product is value, never quantity.
- Ask only for missing fields.
- Confirmation is required before local mutation.
- Ambiguity Lock remains `BABA` and pending survives reload.
- Sale reversal never hard-deletes the original record and cannot run twice.
- Demo is local/fake only; no production truth claims.

---

### Task 1: Lock Store sale semantics with RED tests

**Files:**
- Modify: `tests/greenfield-lighthouse-next-demo.test.cjs`
- Later create: `lighthouse-next/store-sale.mjs`

**Interfaces:**
- Produces `parseStoreSale(text, products)` returning either `null`, `{ ambiguous: true, candidates }`, or `{ productId, productName, value, quantity }` where missing numeric slots are `null`.

- [ ] Add a source-file existence assertion for `store-sale.mjs`.
- [ ] Add tests that registered-product matching exists, aliases are supported, and longest specific alias wins.
- [ ] Add tests locking `ขายมือถือ 566` as product `มือถือ`, value `566`, quantity missing.
- [ ] Add tests locking `ขายมือถือ 566 2` as value `566`, quantity `2`.
- [ ] Add a test that the Store parser does not claim `ทิป 59`.
- [ ] Run `node --test tests/greenfield-lighthouse-next-demo.test.cjs` and verify RED because the parser/file is missing.
- [ ] Commit only the failing tests with `test: lock registered product sale semantics`.

### Task 2: Implement pure registered-product parser

**Files:**
- Create: `lighthouse-next/store-sale.mjs`

**Interfaces:**
- Consumes products shaped `{ id, name, aliases }`.
- Produces `parseStoreSale(text, products)`.

- [ ] Normalize Thai/ASCII whitespace and punctuation without changing semantic order.
- [ ] Match canonical names and aliases; sort matches by matched-name length descending.
- [ ] Return ambiguity when equally strong top matches belong to different products.
- [ ] After the matched product span, parse first numeric token as `value` and second numeric token as `quantity`.
- [ ] Never infer a number before/inside the product name as quantity.
- [ ] Return `null` when no registered product is matched.
- [ ] Run focused tests until GREEN.
- [ ] Commit with `feat: add registered product sale parser`.

### Task 3: Add local Store truth state and pending flow

**Files:**
- Modify: `lighthouse-next/app.mjs`
- Modify: `tests/greenfield-lighthouse-next-demo.test.cjs`

**Interfaces:**
- State adds `products`, `transactions`, `cash`, `todayIncome`, `todayExpense`.
- Store pending shape: `{ kind:'STORE_SALE', stage, productId, productName, value, quantity }`.

- [ ] Add RED source-contract tests for `STORE_SALE`, `STORE_SALE_VALUE`, `STORE_SALE_QUANTITY`, fixed-order confirmation copy, insufficient-stock guard, and persisted product/transaction state.
- [ ] Verify RED.
- [ ] Seed three demo products from the spec with stable IDs and aliases.
- [ ] Route registered product text through `parseStoreSale` before general-income parsing.
- [ ] Ask for value when missing; then quantity when missing; never ask for already known data.
- [ ] Show confirmation as `<สินค้า> · <มูลค่า> บาท · <จำนวน> ชิ้น — บันทึกไหม?`.
- [ ] Preserve Store pending through supported side query and reload under `BABA`.
- [ ] On confirmation, reject insufficient stock without changing any state.
- [ ] On success, reduce stock, append one SALE transaction, increase cash/todayIncome by entered value, clear pending, and save once through the app state owner.
- [ ] Run focused tests until GREEN.
- [ ] Commit with `feat: add local store sale truth flow`.

### Task 4: Make Dashboard, Store and History read the same demo state

**Files:**
- Modify: `lighthouse-next/app.mjs`
- Modify: `tests/greenfield-lighthouse-next-demo.test.cjs`

**Interfaces:**
- Produces `renderHomeTruth()`, dynamic `MANUAL → ร้านค้า`, dynamic `MANUAL → รายการทั้งหมด`.

- [ ] Add RED tests for Dashboard selectors/state rendering, product stock display, sale history status, and cancellation confirmation.
- [ ] Verify RED.
- [ ] Render cash/income/expense/net into the existing Dashboard cards from state.
- [ ] Render registered products and current stock in Store detail.
- [ ] Render transaction history newest-first in `รายการทั้งหมด`.
- [ ] For active SALE records, render a visible `ยกเลิกรายการ` control that opens a confirmation dialog generated by the app.
- [ ] On confirmed reversal, mark original SALE `CANCELLED`, restore stock, append a REVERSAL money event, reduce cash/todayIncome by the sale value, and preserve both records.
- [ ] Block a second reversal of the same sale.
- [ ] Re-render Dashboard/Store/History from the same state after mutation.
- [ ] Run focused tests until GREEN.
- [ ] Commit with `feat: connect store sale to dashboard and history`.

### Task 5: Regression, staging and owner tap-test URL

**Files:**
- No production source changes expected.

**Interfaces:**
- Branch: `work/metro-new-20260906`
- Draft PR: `#114`
- Staging: `https://lighthouse-next-staging.pureekangraw.workers.dev/`

- [ ] Observe fresh `Greenfield Deploy Gate` run for final head.
- [ ] Verify test job and staging deploy conclude `success`.
- [ ] Open/fetch the staging root and confirm the deployed source contains the new Store behavior marker.
- [ ] Do not merge PR or touch production.
- [ ] Give BIG the cache-busted staging URL for phone tap-testing.

## Self-review

- Spec coverage: registered-product resolution, fixed value→quantity order, missing-slot questions, BABA continuity, stock guard, state propagation, history and non-destructive reversal are all mapped to tasks.
- Scope remains demo-only and mobile staging only.
- No backend architecture vocabulary is added to user-facing surfaces.
- No production auth, sync, backup, APK or release gate is claimed.