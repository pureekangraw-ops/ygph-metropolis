# LIGHTHOUSE New Base Design

**Status:** CURRENT OWNER DIRECTION — PRODUCT IMPLEMENTATION GATED BY OWNER REVIEW
**Owner:** BIG
**Working branch:** `codex/lighthouse-new-base-20260902`
**Screen/Route/Logic acceptance:** `docs/superpowers/specs/2026-09-02-lighthouse-screen-route-acceptance.md`

## Purpose
Create the current LIGHTHOUSE NEW BASE inside the existing repository while preserving only proven delivery infrastructure. Legacy product UI/navigation and superseded product plans are not active design inputs.

The primary acceptance criterion is: **the assembled application must be the app BIG asked for**.

`Build succeeds` != `Product accepted`.

## Active Product Shape
Top-level surfaces:
- CHAT
- MANUAL
- SETTINGS

MANUAL has exactly four houses:
- Income
- Outcome
- Calendar
- Ledger

Store, ride, debtors, obligations and other domain details are data under the appropriate owner. They are not additional Manual houses.

## Surface Roles
### CHAT
- Real conversation surface.
- User types normally; processing and confirmation stay in the conversation flow.
- Popup is not the primary confirmation model.
- Quick Capture stays in the conversation.
- A vocabulary/typo knowledge layer may help interpretation but must not override user intent.
- Real write results are reported only after readback.

### MANUAL Dashboard
- Answers “today, what is going on?”
- Shows money in, money out, due items and relevant events.
- Opens Income / Outcome / Calendar / Ledger.
- Must not become a mega-menu.

### Income
Owns money-in data: income, received debt payments, ride/Lalamove income and daily income target.

### Outcome
Owns money-out data: expenses, obligations, ride expenses and spending ceiling.
An obligation is not treated as cash already paid until payment actually occurs.

### Calendar
- One Calendar UI only.
- Monthly default presentation.
- Displays dated items from their real owners; does not clone them.
- Open/read from the real item.
- Complete from Calendar sends the state change back to the original owner.
- Edit/cancel changes the original item.
- Creating an obligation routes to Outcome.
- Note/Task routes to its defined owner and is presented by date.

### Ledger
- Ledger/history/real balance readback.
- Manual control surface across houses.
- Can request edit/cancel through the original owner.
- Bridge between CHAT and MANUAL.
- Does not take ownership away from Income/Outcome/Calendar owners.
- Must not become a mega-menu.

### SETTINGS
Owns application operations: version, update check, rollback when truly supported, backup, restore and reset.

## Navigation
- One authoritative navigation owner.
- Bottom navigation is `CHAT | MANUAL | SETTINGS`.
- MANUAL routes directly to Income / Outcome / Calendar / Ledger.
- Do not add redundant Home/Back controls everywhere.
- Back behavior uses real navigation history where needed.
- No control may navigate to a destination different from what its visible label promises.

## Data Ownership Rule
- CHAT is an interaction surface, not the database.
- Income owns money in.
- Outcome owns money out and obligations.
- Calendar is time presentation + time-based actions, not a second truth store.
- Ledger is readback/control/bridge, not a replacement owner.
- SETTINGS owns app operations.

## Migration Rule
Legacy code is not reusable by default. If any old unit is needed:
1. state the concrete behavior needed;
2. classify KEEP / ADAPT / REJECT;
3. prove it has no forbidden legacy UI/navigation dependency;
4. test the behavior against NEW BASE expectations;
5. integrate the smallest compatible unit only.

Do not import old UI/navigation folders wholesale.

## Delivery Infrastructure
Preserve the proven mechanism where still compatible:
- owner-triggered GitHub Actions pattern;
- signer/secrets contract;
- Android packaging mechanism;
- update/release evidence paths.

Adapt infrastructure to NEW BASE instead of adapting NEW BASE back to legacy staging assumptions.

## Vertical Slice Order
1. Owner UI/Route/Logic review.
2. NEW BASE boundary.
3. Central navigation.
4. CHAT vertical slice.
5. MANUAL Dashboard + Income.
6. Outcome.
7. Calendar.
8. Ledger / Manual Control.
9. Settings.
10. Whole-app route/data walk.
11. Android device acceptance.
12. Next-version updater acceptance.

Each slice must be usable and observable before the next slice advances.

## Copy Boundary
Internal runtime/state vocabulary must not render directly to the user. Examples: `IDLE`, `WAITING`, `SUCCESS`, `READBACK`, `MASTER_INPUT`, `METROPOLIS`.

## Acceptance Gates
1. **Owner Review** — BIG reviews current UI / Route / Logic before production UI work.
2. **Migration Admission** — old units enter only through explicit KEEP / ADAPT / REJECT evidence.
3. **Vertical Slice Acceptance** — click route, perform real behavior, read back result, inspect actual surface.
4. **Whole-App Walk** — CHAT -> MANUAL -> all four houses -> SETTINGS with real return/navigation behavior.
5. **Android Device Acceptance** — install, viewport, keyboard, tap, navigation and real readback on device.
6. **Updater Acceptance** — a later candidate must update over installed NEW BASE; fresh install alone is insufficient.

## Success Criteria
- Current product shape is CHAT / MANUAL / SETTINGS with Income / Outcome / Calendar / Ledger under MANUAL.
- No superseded MONEY / STORE / RIDE four-house design remains in active NEW BASE docs.
- One navigation owner controls all routes.
- Calendar presents one truth and sends actions back to the original owner.
- Ledger controls without stealing ownership.
- CHAT behaves like conversation, not Master Input UI.
- Owner build continues with the existing signer/secrets contract.
- Android device acceptance and later updater continuity are proven.
