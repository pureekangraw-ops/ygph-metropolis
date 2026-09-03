# LIGHTHOUSE New Base Implementation Plan

**Status:** CURRENT PLAN ONLY
**Owner:** BIG
**Working branch:** `codex/lighthouse-new-base-20260902`

**Goal:** Build the current owner-approved LIGHTHOUSE NEW BASE without carrying forward superseded product structure.

**Spec:** `docs/superpowers/specs/2026-09-02-lighthouse-new-base-design.md`
**Acceptance contract:** `docs/superpowers/specs/2026-09-02-lighthouse-screen-route-acceptance.md`

## Global Constraints
- Work only on `codex/lighthouse-new-base-20260902`.
- Active product shape is `CHAT | MANUAL | SETTINGS`.
- MANUAL houses are exactly `Income | Outcome | Calendar | Ledger`.
- STORE / RIDE / MONEY are not peer Manual houses in the current product shape.
- Do not extend legacy UI/navigation as NEW BASE product source.
- One central navigation owner controls every route.
- Calendar is one presentation surface and does not clone owner data.
- Ledger is readback/control/bridge and does not steal ownership.
- CHAT is conversation; Master Input/interpreter is internal mechanism only.
- Preserve signer/secrets and proven delivery mechanism where compatible.
- Every migrated old unit requires KEEP / ADAPT / REJECT and a failing behavior contract before admission.
- Real action + readback is acceptance evidence; labels and build success are not.
- Product slice acceptance comes before Android packaging.

## Task 0 — Owner UI / Route / Logic Gate
- [x] Capture current owner direction in Notion.
- [x] Remove superseded product shape from active design docs.
- [ ] BIG reviews the current screen/route/logic contract.

**STOP:** Product UI work does not begin until owner review passes.

## Task 1 — Clean NEW BASE Boundary
- [x] Boundary test exists.
- [x] Draft PR exists.
- [ ] Record valid RED evidence for the missing NEW BASE boundary.
- [ ] Create minimal `lighthouse-new-base/` boundary only after RED evidence.
- [ ] Prove boundary GREEN.
- [ ] Reject wholesale imports of legacy `ui/`, root app shell or old navigation.

## Task 2 — Central Navigation
Target routes:
- CHAT
- MANUAL dashboard
- MANUAL / Income
- MANUAL / Outcome
- MANUAL / Calendar
- MANUAL / Ledger
- SETTINGS

Acceptance:
- [ ] one authoritative navigation state;
- [ ] MANUAL opens dashboard;
- [ ] each house opens directly from dashboard;
- [ ] bottom `CHAT | MANUAL | SETTINGS` remains the only top-level nav;
- [ ] no redundant Home/Back controls create a second navigation owner;
- [ ] real history/back behavior works where needed;
- [ ] unknown routes do not corrupt state.

## Task 3 — Product Copy + Vocabulary Boundary
- [ ] user-visible copy contains no raw internal state/event names;
- [ ] vocabulary/typo knowledge helps interpretation without overriding user intent;
- [ ] confirmations/problems/results are written as normal user language.

## Task 4 — CHAT Vertical Slice
Behavior:
- [ ] user types in normal conversation;
- [ ] system shows interpreted result in the conversation;
- [ ] confirmation/edit/cancel can continue in conversation without popup as primary flow;
- [ ] Quick Capture stays in the thread;
- [ ] write occurs only after required confirmation;
- [ ] owner data is updated through the correct owner;
- [ ] readback occurs before CHAT reports success;
- [ ] keyboard does not hide input/actions.

## Task 5 — MANUAL Dashboard + Income
Dashboard:
- [ ] shows today summary: money in, money out, due items and relevant events;
- [ ] shows exactly four doors: Income / Outcome / Calendar / Ledger;
- [ ] does not become a mega-menu.

Income:
- [ ] add income;
- [ ] receive debtor payment;
- [ ] record Lalamove/ride income;
- [ ] show recent entries;
- [ ] set/adjust daily income target;
- [ ] propagate real changes to Dashboard/Ledger/Calendar without cloning.

## Task 6 — Outcome
- [ ] add expense;
- [ ] add obligation;
- [ ] record ride/work expense;
- [ ] set/adjust spending ceiling;
- [ ] distinguish unpaid obligation from real cash-out;
- [ ] dated obligations appear in Calendar while Outcome remains owner;
- [ ] pay/edit/cancel changes propagate by readback.

## Task 7 — Calendar
- [ ] exactly one Calendar UI;
- [ ] monthly default presentation;
- [ ] show which days have items/events;
- [ ] open a day/item and read real owner data;
- [ ] complete from Calendar sends state change back to original owner;
- [ ] edit/cancel changes original item, not a copy;
- [ ] add obligation routes to Outcome;
- [ ] Note/Task routes to its defined owner and displays by date;
- [ ] Calendar remains presentation + time action surface, not a second truth store.

## Task 8 — Ledger / Manual Control
- [ ] show real balance and transaction/history readback;
- [ ] open details;
- [ ] request edit/cancel through the original owner;
- [ ] bridge CHAT requests to MANUAL owners;
- [ ] read changed data back before returning results to CHAT/other surfaces;
- [ ] keep cross-house control here without making Ledger a mega-menu;
- [ ] never transfer Income/Outcome ownership to Ledger.

## Task 9 — SETTINGS
- [ ] version;
- [ ] check update;
- [ ] rollback only when truly supported;
- [ ] backup;
- [ ] restore;
- [ ] reset;
- [ ] status/result copy reflects real operation state.

## Task 10 — Whole-App Acceptance
Required real walk:
`CHAT -> MANUAL -> Income -> MANUAL -> Outcome -> MANUAL -> Calendar -> MANUAL -> Ledger -> CHAT -> SETTINGS`

Acceptance:
- [ ] every visible control has the promised destination;
- [ ] no dead ends;
- [ ] single navigation owner remains intact;
- [ ] no internal vocabulary leaks;
- [ ] data changes read back consistently across related surfaces;
- [ ] owner reviews the actual assembled experience, not CI output alone.

**STOP:** Android packaging does not begin until this gate passes.

## Task 11 — Deterministic NEW BASE Staging
- [ ] stage NEW BASE assets only;
- [ ] legacy UI/navigation bundle is absent from staged product;
- [ ] staging has its own failing-then-green contract;
- [ ] build adapter points to NEW BASE instead of old `existing-full-app` assumptions.

## Task 12 — Owner Build Workflow
Preserve signer secret contract exactly:
- `LIGHTHOUSE_APK_KEYSTORE_BASE64`
- `LIGHTHOUSE_APK_STORE_PASSWORD`
- `LIGHTHOUSE_APK_KEY_ALIAS`
- `LIGHTHOUSE_APK_KEY_PASSWORD`

Change only what NEW BASE needs:
- [ ] staging command targets NEW BASE;
- [ ] old artifact/staging wording removed;
- [ ] APK identity verification retained.

## Task 13 — Android Device Acceptance
- [ ] build signed NEW BASE APK;
- [ ] install on actual Android device;
- [ ] verify correct app launches;
- [ ] verify viewport, keyboard and tap targets;
- [ ] execute full route walk;
- [ ] verify real data action/readback on device;
- [ ] fix device/product failures before updater acceptance.

## Task 14 — Updater Continuity
- [ ] create next safe candidate;
- [ ] sign with same canonical signer;
- [ ] update over installed NEW BASE without clearing expected data;
- [ ] read installed package/version back;
- [ ] verify routes and retained expected state/data.

## Definition of Done
LIGHTHOUSE NEW BASE is accepted only when:
1. product shape matches current owner truth;
2. real behavior/readback works;
3. no superseded product structure owns NEW BASE;
4. signer continuity is preserved;
5. Android device acceptance passes;
6. real updater continuity passes.
