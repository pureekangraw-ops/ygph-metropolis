# LIGHTHOUSE NEW BASE — Screen / Route Acceptance Contract

**Status:** OWNER DIRECTION CAPTURED — PRODUCT CODE BLOCKED UNTIL SCREEN/ROUTE REVIEW
**Owner:** BIG
**Working branch:** `codex/lighthouse-new-base-20260902`

## Acceptance Principle
A technically passing build is not accepted unless the assembled application is the LIGHTHOUSE experience the owner asked for.

`Build succeeds` != `Product accepted`.

## Top-Level Product Shape
LIGHTHOUSE has one navigation owner and three top-level surfaces:

1. `CHAT`
2. `MANUAL`
3. `SETTINGS`

`MANUAL` is not a pile of equal-sized feature cards. It opens to a compact today/dashboard surface with four short doors:

- `MONEY` — รายรับ / รายจ่าย / Ledger
- `CALENDAR` — ปฏิทินและรายการตามเวลา; one Calendar UI only
- `STORE` — ร้านค้า / ยอดขาย / สต็อก / ลูกหนี้
- `RIDE` — วิ่งงาน / รอบวิ่ง / รายได้จากงาน

Calendar is a first-class Manual house. It must not be implemented as a Finance subsection or route through Finance.

## Screen Wireframes

### S0 — CHAT

```text
┌──────────────────────────────────────┐
│ LIGHTHOUSE                           │
│                                      │
│  Conversation / result area          │
│  - show user-relevant result          │
│  - show confirmation when needed      │
│  - show problem only when actionable  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ Quick Capture / message input  │  │
│  └────────────────────────────────┘  │
│                                      │
├──────────────────────────────────────┤
│   CHAT        MANUAL       SETTINGS  │
└──────────────────────────────────────┘
```

Rules:
- Master Input/interpreter is an internal mechanism, not the CHAT page identity.
- Internal words such as `IDLE`, `WAITING`, `SUCCESS`, `READBACK`, or interpreter terminology must not leak into product copy.
- Internal events stay internal unless they become a confirmation, actionable problem, or changed result.

### S1 — MANUAL / TODAY DASHBOARD

```text
┌──────────────────────────────────────┐
│ MANUAL                               │
│ วันนี้เป็นอย่างไร                     │
│ [short today status / real data]      │
│                                      │
│  ┌──────────────┐  ┌──────────────┐  │
│  │ เงิน          │  │ ปฏิทิน        │  │
│  │ MONEY         │  │ CALENDAR     │  │
│  └──────────────┘  └──────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  │
│  │ ร้านค้า       │  │ วิ่งงาน       │  │
│  │ STORE         │  │ RIDE         │  │
│  └──────────────┘  └──────────────┘  │
│                                      │
├──────────────────────────────────────┤
│   CHAT        MANUAL       SETTINGS  │
└──────────────────────────────────────┘
```

Rules:
- Dashboard answers “today is how?” before offering doors.
- Four doors are short entry points, not giant dashboard cards that elevate every sub-feature to top level.
- Income, Expense and Ledger are inside MONEY, not three peer houses.
- Calendar has one UI and one route owner.

### S2 — MANUAL / HOUSE DETAIL

```text
┌──────────────────────────────────────┐
│ ‹ MANUAL                    [HOUSE]  │
│                                      │
│  Actual house content                │
│  Actual data / action / readback      │
│                                      │
├──────────────────────────────────────┤
│   CHAT        MANUAL       SETTINGS  │
└──────────────────────────────────────┘
```

Back rule:
- House detail `Back` -> MANUAL dashboard.
- Bottom `MANUAL` from any house -> MANUAL dashboard.
- Bottom `CHAT` -> CHAT.
- Bottom `SETTINGS` -> SETTINGS.

### S3 — SETTINGS

```text
┌──────────────────────────────────────┐
│ SETTINGS                             │
│                                      │
│  App settings / maintenance          │
│  Patch / rollback where authorized   │
│                                      │
├──────────────────────────────────────┤
│   CHAT        MANUAL       SETTINGS  │
└──────────────────────────────────────┘
```

SETTINGS is a real top-level page, not a dialog whose internal state competes with navigation state.

## Single Navigation Owner
The NEW BASE must expose one central route state. No screen may privately own a conflicting page state.

Canonical route model:

```text
CHAT
MANUAL
  ├─ MONEY
  ├─ CALENDAR
  ├─ STORE
  └─ RIDE
SETTINGS
```

Suggested state shape for later implementation:

```js
{
  top: 'chat' | 'manual' | 'settings',
  manualHouse: null | 'money' | 'calendar' | 'store' | 'ride'
}
```

The exact implementation may change, but there must be only one authoritative navigation state.

## Route Matrix

| From | Action | To | Back target | Acceptance evidence |
| --- | --- | --- | --- | --- |
| CHAT | tap MANUAL | MANUAL dashboard | CHAT via bottom nav | rendered screen + central route state |
| CHAT | tap SETTINGS | SETTINGS | CHAT via bottom nav | rendered screen + central route state |
| MANUAL dashboard | tap MONEY | MONEY house | MANUAL dashboard | screen + actual data path |
| MANUAL dashboard | tap CALENDAR | CALENDAR house | MANUAL dashboard | one Calendar UI; no Finance redirect |
| MANUAL dashboard | tap STORE | STORE house | MANUAL dashboard | screen + actual data path |
| MANUAL dashboard | tap RIDE | RIDE house | MANUAL dashboard | screen + actual data path |
| Any MANUAL house | tap MANUAL bottom nav | MANUAL dashboard | n/a | route state resets `manualHouse` |
| Any top-level page | tap CHAT | CHAT | prior page reachable through nav | no hidden competing state |
| Any top-level page | tap SETTINGS | SETTINGS | prior page reachable through nav | no dialog-only navigation owner |

Every interactive button added later must extend this matrix with `from -> action -> to -> back` before implementation.

## Legacy Migration Gate — KEEP / ADAPT / REJECT
No legacy file enters NEW BASE because it is convenient.

For each candidate, record:
- Decision: `KEEP`, `ADAPT`, or `REJECT`.
- Concrete behavior needed.
- Hidden dependencies checked: DOM, state owner, naming, storage, route assumptions.
- Failing contract test proving the needed behavior before migration.
- Readback evidence after migration.

Initial defaults:
- Legacy `ui/lighthouse-shell.mjs`: `REJECT AS PRODUCT STRUCTURE`; may be read only for failure lessons.
- Legacy Manual hub that routes Calendar through Finance: `REJECT`.
- Existing signer secret contract: `KEEP` as Shared Infra.
- Existing owner-triggered build mechanism: `ADAPT` only after product acceptance gates pass.
- Existing domain/core logic: `ADAPT CANDIDATE`; no admission without contract test independent of legacy UI.

## Copy Boundary
UI copy must come through one product-copy mapping layer or equivalent single contract.

Forbidden user-facing internal terms include at minimum:
- `IDLE`
- `WAITING`
- `SUCCESS`
- `READBACK`
- raw interpreter / routing terminology

Tests must inspect rendered/user-visible copy, not merely source constants.

## Vertical Slice Rule
Do not build Chat lifecycle + Quick Capture + four houses + Calendar simultaneously.

Order:
1. Navigation shell and route state.
2. MANUAL dashboard + one real house route.
3. MONEY vertical slice with actual behavior + readback.
4. CALENDAR vertical slice with one canonical UI.
5. STORE vertical slice.
6. RIDE vertical slice.
7. CHAT lifecycle + Quick Capture using internal interpreter only as a mechanism.
8. SETTINGS and maintenance path.
9. Full route walk.
10. Android packaging and device acceptance.

A slice cannot start until the previous slice can be clicked end-to-end and its resulting state/data can be read back.

## Acceptance Gates

### Gate A — Screen / Route Review
Before NEW BASE production UI code:
- owner sees the intended screens and route model;
- route ownership is singular;
- Calendar is separate from Finance;
- Dashboard role is “today status + four short doors”.

### Gate B — Migration Admission
Before any legacy code enters NEW BASE:
- KEEP / ADAPT / REJECT recorded;
- behavior test exists and fails for the missing behavior;
- legacy UI/DOM/navigation dependency is not imported accidentally.

### Gate C — Slice Acceptance
Before merging each vertical slice:
- click it like a user;
- verify route destination;
- perform actual action where applicable;
- read back resulting state/data;
- inspect user-facing copy;
- owner reviews the real surface, not only CI output.

### Gate D — Pre-APK Full Walk
Before building the APK candidate, complete:

`CHAT -> MANUAL -> CALENDAR -> Back -> SETTINGS`

and also verify all four Manual houses from the dashboard.

### Gate E — Android Device Acceptance
Build is not accepted until a real Android install proves:
- fresh install launches correct NEW BASE;
- keyboard does not hide critical input/actions;
- tap targets and viewport fit the device;
- route/back behavior matches the route matrix;
- actual actions/readback still work on device.

### Gate F — Updater Acceptance
After first NEW BASE device candidate passes, create the next candidate and perform an actual update over the installed version. Fresh-install success alone is insufficient evidence for updater continuity.

## Final Definition of Done
LIGHTHOUSE NEW BASE is done only when:
1. the assembled app matches this screen/route contract;
2. real behavior/readback tests pass;
3. no legacy UI/navigation owns NEW BASE product structure;
4. owner APK build preserves signer continuity;
5. Android device acceptance passes;
6. real updater continuity passes.
