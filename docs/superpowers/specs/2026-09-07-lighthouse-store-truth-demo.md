# LIGHTHOUSE Store Truth Demo — Design Lock

**Status:** OWNER-AUTHORIZED DEMO SLICE

## Purpose

Extend the current `lighthouse-next` mobile staging demo so BIG can tap-test one complete Store truth loop without exposing backend architecture. The demo remains local/fake only; production Ledger, auth, sync, backup, APK and device gates stay out of scope.

## User-facing rule

The app should understand the user, not require the user to understand Metropolis.

For a registered product sale, the input contract is fixed:

**สินค้า → มูลค่า → จำนวน**

- The registered product name or alias is resolved first.
- The first number after the matched product is **มูลค่าเงินของรายการ**.
- The next number is **จำนวนสินค้า**.
- Never reinterpret the first number as quantity.
- Ask only for a missing field.
- Before mutation, show the interpreted product, value and quantity in plain language and ask for confirmation.

Examples:
- `ขายมือถือ 566` → product `มือถือ`, value `566`, quantity missing → ask only quantity.
- `ขายมือถือ 566 2` → product `มือถือ`, value `566`, quantity `2` → confirm.
- `ทิป 59` → general income `59`, source `ทิป`; never auto-route tip to Ride.

## Product recognition

The demo has a small registered product fixture with stable IDs and aliases. Matching rules:

1. Exact/specific registered name or alias beats generic text.
2. If several aliases match, the longest specific match wins.
3. If equally strong matches point to different products, do not guess; ask for clarification.
4. Unknown text must not be forced into Store. It can continue through the existing general-income path when that parser has enough evidence.

## Pending continuity

Owner Ambiguity Lock remains `BABA`:

- supported side query answers without destroying the active pending sale/income,
- the older item remains pending,
- the app gives a short reminder,
- reload/reopen restores the same pending position.

Store sale pending shape is local demo state and must persist alongside general-income pending.

## Commit behavior in demo

A confirmed sale must update the local demo state as one logical action:

- stock decreases by quantity,
- one sale transaction is appended,
- money/income increases by the entered value,
- Dashboard values refresh,
- Store/History views reflect the same record.

If stock is insufficient, no part of the local state changes.

This is a behavioral proof of the production contract; it is not evidence of production ACID durability.

## Reverse behavior in demo

History must not hard-delete a confirmed sale.

Cancelling a sale in the demo:

- marks the original sale `CANCELLED`,
- restores the sold quantity to stock,
- appends a reversal money event,
- keeps the original sale visible,
- blocks a second cancellation of the same sale.

A visible confirmation is required before reversal.

## Dashboard

Dashboard remains the root and stays user-first. It should update from demo state for:

- เงินจริง
- เงินเข้าวันนี้
- เงินออกวันนี้
- สุทธิวันนี้

Existing obligation/gap/target fixture may remain fixed in this slice.

## MANUAL

Keep the four root tabs unchanged: `หน้าหลัก | แชต | MANUAL | ตั้งค่า`.

Under `MANUAL → ร้านค้า`, show registered products and stock in human language.

Under `MANUAL → รายการทั้งหมด`, show transaction history and allow safe cancellation of an active sale.

Do not expose Registry, owner, gateway, actor, transaction group, schema, route or other backend vocabulary.

## Demo fixtures

Registered products:

- `มือถือ` — aliases: `โทรศัพท์`, `โทสับ` — stock 5
- `เคสมือถือ` — alias: `เคส` — stock 8
- `ฟิล์ม` — alias: `ฟิล์มกันรอย` — stock 12

Money baseline:

- actual cash: 2,450 baht
- today income: 1,250 baht
- today expense: 380 baht

The demo can mutate these values locally after confirmation.

## Out of scope

- production database/schema migration
- cloud sync/offline outbox
- real backup/restore
- APK rollback/upgrade
- real authentication/encryption
- production atomicity proof
- barcode/analytics

Those remain separate verified work units.