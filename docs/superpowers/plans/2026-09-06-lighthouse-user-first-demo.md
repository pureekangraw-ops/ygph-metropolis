# LIGHTHOUSE User-First Demo Implementation Plan

> **Current authority:** USER-FIRST PRODUCT PRINCIPLE — OWNER LOCK 2026-09-06, amended by Owner decisions through 2026-09-07.

**Goal:** Build and iteratively refine a mobile-first LIGHTHOUSE UX proving slice at `/lighthouse-next/` with local/fake state only, ready for Cloudflare PR staging and Owner tap-testing.

**Architecture:** Keep production root untouched. The isolated demo lives under `lighthouse-next/`. User-facing complexity stays small while state/routing rules remain internal. Demo localStorage proves interaction continuity only; it is not production truth.

**Tech Stack:** HTML5, CSS, vanilla ES modules, Node 22 test runner, existing Cloudflare staging workflow.

**Spec:** `docs/superpowers/specs/2026-09-06-lighthouse-user-first-demo-design.md`

## Current Owner Locks

- Product name: `LIGHTHOUSE`.
- App icon authority: Owner-selected lighthouse artwork.
- User roots exactly: `หน้าหลัก | แชต | MANUAL | ตั้งค่า`.
- Dashboard is post-PIN root; no duplicate CHAT/MANUAL entry buttons.
- No GO persona or architecture vocabulary on normal surfaces.
- Ambiguity Lock: `BABA`.
- General income: `จำนวนเงิน + ที่มา` only.
- Registered Store sale: `สินค้า → มูลค่า → จำนวน`; first number after proven product is value.
- Confirmation before Store mutation.
- Finance and obligations are one user job; no separate `ภาระ` MANUAL tile.
- Visible MANUAL tasks: `การเงิน | ร้านค้า | งานวิ่ง | ปฏิทิน | รายการทั้งหมด`.
- Dashboard, Finance and Calendar derive obligation pressure from the same demo state.
- Sale cancellation is append-only reversal, not history deletion.
- Demo PIN 4 digits is interaction-only; it does not define production authentication.
- Production deploy/release/device acceptance remain Owner Gates.

---

### Task 1: Surface contracts and isolated demo

- [x] Add source-level tests for isolated demo files.
- [x] Lock LIGHTHOUSE Dashboard-first surface and exactly four root nav labels.
- [x] Hide architecture vocabulary and GO persona chrome.
- [x] Keep demo state under its own localStorage namespace.
- [x] Add isolated Cloudflare staging config and workflow verification.

### Task 2: PIN, app frame, Dashboard and branding

- [x] Build mobile PIN screen and four-root app shell.
- [x] Enter Dashboard after demo unlock.
- [x] Show real cash separately from expected income.
- [x] Show today in/out/net, nearest obligation, gap and daily target.
- [x] Apply Owner-locked LIGHTHOUSE app identity to manifest/icon/PIN branding.
- [x] Keep touch targets and mobile polish explicit.

### Task 3: CHAT meaning and continuity

- [x] Encode `BABA` side-query/deep-pending behavior.
- [x] Restore pending after reload.
- [x] Support local side query `วันนี้วันที่เท่าไร` without replacing pending.
- [x] Implement general income as amount + source only.
- [x] Avoid forced Store/Ride/category selection for ordinary income.
- [x] Route proven registered products to Store invisibly.
- [x] Lock Store sale order `product → value → quantity`.
- [x] Show confirmation before Store sale mutation.
- [x] Stop sale when stock is insufficient.

### Task 4: Shared demo truth across user surfaces

- [x] Sale confirmation updates cash, today income, stock and transaction state.
- [x] Dashboard reads current cash state instead of fixed copy.
- [x] MANUAL > ร้านค้า reads the same products/transactions state.
- [x] MANUAL > รายการทั้งหมด reads the same transaction state.
- [x] Sale cancellation creates reversal, restores cash/stock, preserves original record and blocks double reversal.
- [x] Merge `ภาระ` into MANUAL > การเงิน.
- [x] Remove the old hidden obligations route and patch script.
- [x] Give obligations one shared demo state used by Dashboard, Finance and Calendar.
- [x] Compute `ยังขาด` from obligation amount versus current real cash.

### Task 5: MANUAL and Settings

- [x] Keep visible MANUAL tasks user-job based: Finance, Store, Ride, Calendar, All transactions.
- [x] Make each visible task open a real demo view with working Back.
- [x] Keep Settings limited to local/fake status, about and confirmed reset.
- [x] Omit unsupported production updater/backup controls rather than faking success.

### Task 6: Verification and Owner mobile loop

- [x] Run repository tests/syntax/UTF-8/config gates after each meaningful behavior change.
- [x] Deploy isolated LIGHTHOUSE demo to staging without touching production.
- [ ] Verify the latest head staging deploy after the most recent Finance shared-truth refactor.
- [ ] Owner tap-tests latest staging on phone.
- [ ] Collect UX/behavior feedback and repeat RED → GREEN → staging.
- [ ] Move to package/release/device gates only after Owner accepts the web proving slice.

## Current staging contract

Staging host:

`https://lighthouse-next-staging.pureekangraw.workers.dev/`

Use a commit cache-bust query (`?v=<sha>`) for each Owner test round.

## Explicitly out of scope for this web proving slice

- Production auth/encryption truth
- Production durable Ledger wiring
- Real external provider/weather/network behavior
- Android process death / OS permissions / physical Back behavior
- APK build/sign/install/update
- Production backup/restore and rollback proof

These remain later production/device verification gates and cannot be passed by the browser demo.
