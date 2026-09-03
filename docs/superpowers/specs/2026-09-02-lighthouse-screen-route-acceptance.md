# LIGHTHOUSE NEW BASE — Screen / Route / Logic Acceptance Contract

**Status:** CURRENT OWNER REVIEW CONTRACT
**Owner:** BIG
**Working branch:** `codex/lighthouse-new-base-20260902`

## Acceptance Principle
A technically passing build is not accepted unless the assembled application is the LIGHTHOUSE experience BIG asked for.

`Build succeeds` != `Product accepted`.

## Top-Level Product Shape
LIGHTHOUSE has one navigation owner and three top-level surfaces:
1. CHAT
2. MANUAL
3. SETTINGS

MANUAL opens to a compact “วันนี้เป็นอย่างไร” dashboard with exactly four houses:
- Income
- Outcome
- Calendar
- Ledger

Store, Ride, debtors, obligations and other details are data under their appropriate owner, not peer houses.

## CHAT Contract
- CHAT is a real conversation surface.
- Master Input/interpreter may be internal but is not the page identity.
- User types normally; interpreted result appears in conversation.
- Confirmation/edit/cancel can continue through normal conversation; popup is not the primary flow.
- Quick Capture stays in the thread.
- Vocabulary/typo knowledge may assist interpretation but cannot override user intent.
- No write is reported as successful before real readback.
- Keyboard must not hide critical input/actions.
- Internal state/event words do not render directly.

## MANUAL Dashboard Contract
Dashboard answers “วันนี้เป็นอย่างไร” before offering doors.

Must show useful current summary such as:
- money in;
- money out;
- due items;
- relevant events.

Must offer exactly four house doors:
- Income
- Outcome
- Calendar
- Ledger

Dashboard must not become a mega-menu.

## Income Contract
Owner of money-in truth:
- income;
- received debtor payments;
- Lalamove/ride income;
- daily income target.

A debtor payment must change the real debtor state as well as money-in readback.

## Outcome Contract
Owner of money-out and obligation truth:
- expenses;
- obligations;
- ride/work expenses;
- spending ceiling.

An unpaid obligation is not cash already paid. Dated obligations may appear in Calendar while Outcome remains owner.

## Calendar Contract
- One Calendar UI only.
- Default monthly presentation.
- Shows which dates contain items/events.
- Reads dated items from their real owners; no cloning.
- Opening an item reads real details.
- Completing from Calendar sends the state change back to the original owner.
- Edit/cancel modifies the original item.
- Add obligation routes to Outcome.
- Note/Task routes to its defined owner and is presented by date.
- Calendar is presentation + time action surface, not a second truth store.

## Ledger Contract
Ledger has three roles:
1. ledger/history/real balance readback;
2. Manual control surface across houses;
3. CHAT ↔ MANUAL bridge.

Rules:
- can open detail;
- can request edit/cancel through original owner;
- does not take ownership away from Income/Outcome;
- reads changed data back before returning results;
- centralizes cross-house control without becoming a mega-menu.

## SETTINGS Contract
SETTINGS is a top-level page for app operations:
- version;
- check update;
- rollback when truly supported;
- backup;
- restore;
- reset.

Operation status must match real state; “requested” is not automatically “completed”.

## Single Navigation Owner
Canonical route model:

```text
CHAT
MANUAL
  ├─ Income
  ├─ Outcome
  ├─ Calendar
  └─ Ledger
SETTINGS
```

Rules:
- bottom navigation is `CHAT | MANUAL | SETTINGS`;
- MANUAL opens dashboard;
- each house opens directly from dashboard;
- no screen privately owns competing route state;
- no redundant Home/Back controls are added everywhere;
- actual history/back behavior is used where needed;
- visible control label and destination must agree.

## Route Matrix
| From | Action | To | Acceptance evidence |
| --- | --- | --- | --- |
| CHAT | tap MANUAL | MANUAL dashboard | rendered destination + central route state |
| CHAT | tap SETTINGS | SETTINGS | rendered destination + central route state |
| MANUAL dashboard | tap Income | Income | real surface + data path |
| MANUAL dashboard | tap Outcome | Outcome | real surface + data path |
| MANUAL dashboard | tap Calendar | Calendar | one Calendar UI + owner-backed items |
| MANUAL dashboard | tap Ledger | Ledger | real readback/control surface |
| Any MANUAL house | tap MANUAL | MANUAL dashboard | central route state |
| Any surface | tap CHAT | CHAT | no competing hidden state |
| Any surface | tap SETTINGS | SETTINGS | top-level route state |

Every new interactive control must have an explicit destination and real behavior evidence before implementation is accepted.

## Data Ownership Matrix
| Surface | Owns | Does not own |
| --- | --- | --- |
| CHAT | conversation / user interaction | domain truth storage |
| Income | money in | money out / calendar truth |
| Outcome | money out + obligations | money in / calendar presentation |
| Calendar | time presentation + time actions | duplicated domain truth |
| Ledger | readback + cross-house control + bridge | replacement ownership of Income/Outcome |
| SETTINGS | app operations | daily financial/domain truth |

## Migration Gate — KEEP / ADAPT / REJECT
No legacy file enters NEW BASE because it is convenient.

For each candidate record:
- KEEP / ADAPT / REJECT;
- exact behavior needed;
- hidden DOM/state/storage/route dependencies checked;
- failing behavior contract before admission;
- readback evidence after integration.

Defaults:
- old UI/navigation structure: REJECT as product structure;
- signer/secrets contract: KEEP as shared infrastructure;
- owner-triggered build mechanism: ADAPT to NEW BASE;
- old domain/core logic: candidate only, never automatically admitted.

## Copy Boundary
Forbidden direct user-facing internal vocabulary includes at minimum:
- IDLE
- WAITING
- SUCCESS
- READBACK
- MASTER_INPUT
- METROPOLIS
- raw interpreter/routing/event names

Tests must inspect what the user actually sees, not just source constants.

## Vertical Slice Order
1. Owner UI/Route/Logic review.
2. NEW BASE boundary.
3. Central navigation.
4. CHAT.
5. MANUAL Dashboard + Income.
6. Outcome.
7. Calendar.
8. Ledger / Manual Control.
9. SETTINGS.
10. Whole-app walk.
11. Android packaging/device acceptance.
12. updater continuity acceptance.

A slice advances only after it is usable and its resulting state/data can be read back.

## Acceptance Gates
### Gate A — Owner Review
Before production UI code:
- BIG sees current screen roles, routes and logic;
- four houses are Income / Outcome / Calendar / Ledger;
- CHAT behavior is conversation-first;
- Calendar and Ledger ownership rules are understood;
- navigation has one owner.

### Gate B — Migration Admission
Before old code enters NEW BASE:
- KEEP / ADAPT / REJECT recorded;
- behavior test exists and fails for missing behavior;
- forbidden legacy UI/navigation dependency is absent.

### Gate C — Slice Acceptance
Before merging each product slice:
- click like a user;
- verify destination;
- perform real action where applicable;
- read back resulting data/state;
- inspect user-facing copy;
- review actual surface, not CI only.

### Gate D — Pre-APK Whole-App Walk
Required walk:

`CHAT -> MANUAL -> Income -> MANUAL -> Outcome -> MANUAL -> Calendar -> MANUAL -> Ledger -> CHAT -> SETTINGS`

No dead ends, duplicate navigation owners or inconsistent readback.

### Gate E — Android Device Acceptance
A real Android install must prove:
- correct NEW BASE launches;
- keyboard/viewport/taps work;
- navigation matches the contract;
- real actions/readback still work on device.

### Gate F — Updater Acceptance
After first NEW BASE candidate passes, create a later candidate and update over the installed version. Fresh-install success alone is not updater evidence.

## Final Definition of Done
LIGHTHOUSE NEW BASE is done only when:
1. assembled app matches this contract;
2. real behavior/readback works;
3. superseded product structure does not own NEW BASE;
4. signer continuity is preserved;
5. Android device acceptance passes;
6. real updater continuity passes.
