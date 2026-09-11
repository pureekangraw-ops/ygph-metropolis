# LIGHTHOUSE — FIGMA → LIVE APP HANDOFF

Status: READY TO PULL
Date: 2026-09-11
Branch: `feat/lighthouse-real-store-20260910`
Figma: `https://www.figma.com/design/nzJLy6oAD758MVri6vEowK`

## Purpose

Use the approved Figma as the visual / interaction blueprint for the real `lighthouse-next` app.

Do **not** build a second demo app and do **not** replace the existing runtime architecture.

The live app keeps its real capabilities and truth sources; Figma controls presentation, hierarchy, and interaction states.

## Screen Mapping

| Figma screen | Live LIGHTHOUSE target | Real data source | Real action |
|---|---|---|---|
| `39:2` 00 SPLASH | visual entry before / around Auth | runtime gate / auth state | enter / login |
| `1:7` 01 CHAT – Empty | existing Chat root | local chat UI state + runtime context | type command |
| `1:12` 02 CHAT – Confirm | Chat state, not a separate route | `pendingFlow` | confirm / edit / cancel |
| `1:17` 03 CHAT – Edit | Chat state | `pendingFlow` | edit pending values |
| `1:22` 04 CHAT – Success | Chat state after verified mutation | Store / Ledger durable readback | inspect result / start another entry |
| `1:27` 05 MANUAL | existing MANUAL hub | Ledger + Store + module availability | enter Finance / Store / Ride / Calendar / Ledger |
| `1:32` 06 SETTINGS | existing Settings root | app/runtime state | lock app / clear local UI state |
| `20:98` 07 INCOME | MANUAL → Finance → Income view | `ledgerTruth.todayInSatang` + Ledger transactions | read income / go to Chat to add |
| `20:120` 08 OUTCOME | MANUAL → Finance → Outcome view | `ledgerTruth.todayOutSatang` + Ledger transactions | read expense / go to Chat |
| `20:142` 09 CALENDAR | MANUAL → Calendar | no verified real Calendar truth yet | show truthful unavailable / empty state only |
| `20:164` 10 LEDGER | MANUAL → Ledger | `ledgerTruth.transactions` | read transaction history |
| `109:2` 11 SETTINGS – DATA MANAGEMENT | nested Settings only when real operation exists | actual runtime capability only | no fake Backup / Restore / Version actions |

## Live Capabilities Missing From Figma — KEEP THEM

Do not remove these just to match the prototype:

- Auth / Recovery
- Home
- Store
- Ride
- Runtime Session locking
- real Ledger bridge
- real Store bridge

Figma must wrap these into the same visual language, not delete them.

## Truth Ownership

### Ledger owns

- current cash balance
- today income
- today expense
- net movement
- transaction history

Use current `ledgerTruth` values. Never substitute Figma sample amounts.

### Store owns

- Product identity
- product stock
- sale records
- product-linked stock operations

Use current `storeTruth` values. Never use local demo inventory as authority.

### Local UI state may own only

- selected root
- chat history intended to stay local
- pending confirmation state
- current MANUAL detail view

Local state must not override Ledger or Store truth.

## Chat State Contract

Keep Chat as one surface with state changes rather than separate application routes:

`INPUT → INTERPRET → DRAFT → CONFIRM → COMMITTING → DURABLE READBACK → VERIFIED SUCCESS`

Rules:

- confirmation must happen before mutation
- edit / cancel must remain possible before commit
- success copy such as `บันทึกแล้ว` is allowed only after durable readback verifies the expected mutation
- failed readback must stay recoverable and must not display success

## Figma Values Are Examples, Not Production Truth

These are presentation examples only:

- `ทิป 50`
- `+50 วันนี้`
- `0 วันนี้`
- `9 ก.ย.`
- `ไม่มีรายการวันนี้`

Replace them with real runtime values or a truthful `EMPTY / UNAVAILABLE` state.

## State Rules For Real Screens

Every real-data screen must support:

- `READY` — runtime read succeeded and data exists
- `EMPTY` — runtime read succeeded but no matching records exist
- `UNAVAILABLE` — runtime/session/read is unavailable

Do not invent fallback money, stock, appointment, or sale data.

## Visual Language To Carry Over

Use the Figma direction consistently:

- dark navy / cosmic background
- slate cards
- cyan = interaction / information / income accent
- magenta = expense / outcome accent
- violet = system / settings / status
- warm gold = brand / primary action
- restrained active-nav pill; icon + label carry most of the active state
- rounded cards with subtle accent stroke/glow
- compact Chat composer
- clear visual separation between owner messages and LIGHTHOUSE messages

## Implementation Shape

Do not recreate all 12 Figma frames as 12 application routes.

Preferred live shape:

- Root: Home / Chat / MANUAL / Settings
- Chat Confirm / Edit / Success = states inside Chat
- Income / Outcome / Calendar / Ledger = MANUAL detail views
- Store and Ride remain existing MANUAL capabilities
- Data Management appears only for real supported operations

## Acceptance For App Room

The app implementation is aligned when:

- current real LIGHTHOUSE capabilities remain reachable
- Figma visual hierarchy is visible in the live shell
- Chat states match the approved Confirm / Edit / Success flow
- Finance / Store / Ledger display runtime truth only
- Calendar shows honest empty/unavailable state until a real source exists
- all visible actions have real behavior
- no sample Figma number becomes production source of truth
- no second source of truth is created

## Do Not Do

- do not remove Home, Auth, Store, or Ride because they are absent from Figma
- do not build a parallel LIGHTHOUSE demo surface
- do not create duplicate Ledger / Store data in localStorage
- do not hardcode Figma sample values into live data
- do not add fake Backup / Restore / Version behavior
- do not claim mutation success before durable readback

---

### Handoff summary

**Figma = Blueprint. `lighthouse-next` = real app. Runtime / Ledger / Store = truth.**

Apply the approved visual language to the existing app, preserve real capabilities, and treat Figma frames as routes only where they are actual product destinations; otherwise treat them as states or MANUAL detail views.
