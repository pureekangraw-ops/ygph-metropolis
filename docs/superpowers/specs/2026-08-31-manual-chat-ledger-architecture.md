# Manual + Chat + Ledger Architecture — Consolidated Design Notes

Status: DESIGN NOTES / AGREED DIRECTION
Date: 2026-08-31
Repo: `pureekangraw-ops/ygph-metropolis`
Working branch: `feature/manual-four-core-foundation-20260831`
Related draft PR: #95

> Purpose of this file: preserve every agreed idea from the Manual / Ledger / Calendar / Intent design session in one place so implementation does not have to rediscover the decisions later.

---

## 1. Core architectural principle

The system should be ordered from real capability outward, not from language inward.

**Function + Logic first → Intent second → Front Door connection last.**

Manual is the working brain/capability layer. The chat/front page is a language and confirmation layer, not the business brain.

Canonical high-level shape:

```text
User
  ↓
CHAT FRONT DOOR
receive / normalize / interpret / display
  ↓
ACTION INTENT
human language → stable command
  ↓
CONFIRMATION GATE
mutation? confirm first
read-only? pass through
  ↓
CHAT ↔ MANUAL CONTRACT
thin command/result boundary
  ↓
LEDGER GATEWAY
central dispatcher / collector / control desk
  ↓
INCOME | OUTCOME | CALENDAR
  ↓
Shared logic / domain functions
  ↓
GREENFIELD RUNTIME / VAULT
  ↓
READBACK
  ↓
LEDGER
  ↓
CHAT FRONT DOOR
  ↓
User-visible result
```

The Chat front door must not talk directly to Income / Outcome / Calendar. It talks to Ledger through one thin contract. Ledger distributes work and pulls results back.

The Manual UI is not required to stay visible forever. If the system becomes stable, Manual may move mostly behind the scenes while Chat remains the primary user-facing surface.

---

## 2. Authoritative phase order

### Phase 1 — establish four houses
Create permanent boundaries for:
- Income
- Outcome
- Ledger
- Calendar

All share the existing Greenfield Runtime / Vault truth root. No new finance engine or duplicate store.

### Phase 2 — polish each Core
Each Core is refined in three subphases:
1. **Idea** — purpose, responsibilities, non-responsibilities
2. **Logic** — states, rules, relationships, read/write boundaries
3. **Function** — real callable capabilities derived from the polished logic

Function lists should be extracted from the design already agreed, not invented from scratch.

### Phase 3 — Intent
Derive command language from the proven capabilities of Manual/Ledger. Intent must not invent functionality.

### Phase 4 — connect + integration test
Wire Action Intent into the existing Chat/Data/Input front door and test the full path:

```text
Chat → Intent → Confirmation → Ledger → Core → Runtime → Readback → Ledger → Chat
```

Ordinary logic/function tests can happen during development. Intent integration testing intentionally comes last, because it only becomes meaningful when the whole route is connected.

---

## 3. Manual is the brain

Manual owns business capability and working logic.

Short model:

- **Front Door = language + confirmation**
- **Manual = brain + capability**
- **Ledger = central control desk of Manual**

The earlier front-door work became complicated because it was forced to infer business behavior before the destination capabilities were stable. Once Manual exists first, the front door becomes much thinner.

The front door should mainly:
- receive messages
- normalize/repair obvious typos and phrasing
- classify language into a known action/target
- ask for confirmation before mutations
- display results or errors

It should not own finance, calendar, settlement, lifecycle, history, or routing rules.

---

## 4. Four Manual houses

### 4.1 Income

Income is mostly an organized view/use of real Ledger income. It does not need a new finance engine.

Three branches:
- **Store Income**
- **Ride Income**
- **Other Income**

All ultimately flow into the same Ledger truth. The separation should be source/subtype/reference, not separate wallets/databases.

Ride Income should leave a stable future hook for Map/GPS/route work:

```text
Ride Job/Round → Ride Income → Ledger
```

Future Map/GPS/Route is linked capability, not part of Income logic now.

Debt collection should not be flattened into generic Other Income at the point of collection. A collected debt should retain its origin as a tracked debt/follow-up item and close/reduce that tracked item while creating the actual received-money event in Ledger.

### 4.2 Outcome

Outcome organizes real expenses and obligations from Ledger.

Distinctive current feature: **Spending Ceiling / Budget Cap**.

The ceiling is a control/compare layer, not financial truth. Setting a ceiling does not create money, debt, or a transaction.

Detailed category taxonomies are intentionally not required now.

### 4.3 Calendar

Calendar is a **time view + one-stop action surface**, not the owner of financial truth.

Calendar should show human-facing items and let the user act at the point of time, while Ledger remains the central control authority.

Current Calendar core data / presentation ideas:
- real human-facing title, e.g. `พี่เอติดเงิน`, `ยืมเงินพี่บี`
- start date/time
- end date/time when relevant
- installment set when a burden/debt has multiple installments
- status with a dedicated visual color
- hidden backend identity/source/reference used only for routing

Status should be a real backend state; color is only the visual representation of that state.

Backend identity/source should stay hidden from the user. For routing it can be broad, such as Income/Expense/other owner references.

The user should be able to tap anywhere on one time block/item and see its start/end information together. For multi-installment burdens, opening the item should reveal the whole installment set.

**Not in current core; future only:**
- All-day
- Conflict detection
- Reminder/local notification
- Recurrence
- Calendar-owned history

Reminder and recurrence are not current core requirements. Financial/history truth belongs with Ledger, not Calendar.

Calendar should support more than money-related entries so that Intent is not later trapped into “calendar = finance only”. It should support:
- debt/follow-up
- obligations
- appointments/events
- To-do List
- other general items

### 4.4 Ledger

Ledger is the **head of Manual**, not merely a bookkeeping secretary.

Ledger is:
- source-facing finance control desk
- central dispatcher
- central collector
- history gateway
- readback gateway
- dashboard/analysis surface
- one-stop management point for Manual

Manual UIs may eventually disappear into the backend, but Ledger remains the stable internal gateway.

---

## 5. Ledger responsibilities — complete current list

Ledger currently owns or coordinates these responsibilities:

### Truth and aggregation
- collect results from Income / Outcome / Calendar
- preserve actual money truth
- preserve actual timeline of events
- keep references between related records
- compute net outcome of a related story without rewriting history

### History
- keep business/data history for Manual
- income history
- expense history
- debt history
- obligation history
- partial receive/pay history
- refund history
- edit/cancel history
- target/limit changes when relevant
- linked Calendar/To-do business events where relevant
- audit trail: what changed, when, and what it links to

### Dashboard
- income totals
- expense totals
- outstanding debt
- outstanding obligations
- targets
- ceilings
- upcoming/overdue important items
- summary views needed by Manual or Chat

### Analysis
- income vs target
- expense vs ceiling
- remaining amount / delta
- outstanding debt
- outstanding obligations
- completed vs pending items
- trends and summaries derived from Ledger truth

### Target / ceiling management
- adjust income target
- adjust spending ceiling
- compare actual against each

### Settlement
- receive debt in full
- receive debt partially
- pay obligation in full
- pay obligation partially
- reduce remaining amount accordingly
- keep item open when partially settled
- close when fully settled

### Refund / cancellation after real money occurred
If income already occurred and later must be cancelled/refunded:
- do **not** rewrite or delete the original Income event
- create a new Outcome/Refund event on the real refund date
- link the refund back to the original income event

Example:
- Monday: Income +500
- Wednesday: Refund / Outcome -200
- Ledger story net = +300

The old day remains historically true. New events must not rewrite old-day truth.

### Timeline rule
**A transaction stays on the date it actually happened. References may cross days; dates do not move to follow references.**

This is important across days, months, and accounting periods.

### One-stop control actions
Ledger is the single central owner of:
- **Complete**
- **Edit / extend / modify**
- **Cancel**

The three other houses do not independently own Edit or Cancel authority. Their UIs may expose a button, but the command is handled through Ledger.

### Distribution / routing
Ledger receives a stable command and decides which house/capability owns execution.

### Readback gateway
Runtime results come back to Ledger, which then returns the requested result to Chat/Manual.

### Chat integration gateway
Front Door / Intent should connect once to Ledger rather than independently wiring all Manual houses.

---

## 6. Lifecycle actions across Manual

A common user-facing action family exists:
- `Complete`
- `Edit / add / extend`
- `Cancel`

These are candidate shared command roots.

The action name is common; the effect depends on the record type/context.

Examples:

### Complete
- debt follow-up → receive full or partial payment
- obligation → pay full or partial amount
- ordinary expense → record real expense
- general To-do → mark done
- Shopping To-do → record actual expense and close task

### Edit / extend
Ledger owns edit authority across Income / Outcome / Calendar / To-do.
For Calendar, edit can cover broad additions/changes such as:
- date/time
- installment changes
- appointment/activity data
- obligation details
- general/other item details

“Edit” is intentionally broad: edit, add, extend, or adjust an existing item belong under one family.

### Cancel
Ledger owns cancellation authority.

Cancellation semantics depend on whether reality already happened:
- no real money/action yet → close/cancel the pending item without creating financial truth
- real money already happened → do not erase old truth; create the appropriate new opposite-side real event (e.g. refund as Outcome)

---

## 7. Partial settlement

Partial settlement belongs **inside Complete**, not as a separate top-level action.

Settlement shape:

```text
Complete
  ├─ Full
  └─ Partial
```

### Debt
- full receive → record actual received money, remaining = 0, close debt
- partial receive → record actual received money, reduce remaining, keep debt open

### Obligation
- full pay → record actual expense, remaining = 0, close obligation
- partial pay → record actual expense, reduce remaining, keep obligation open

Candidate shared root:

```text
Expected/Required → Actual → Remaining → Open/Closed
```

---

## 8. Shared-logic candidates to preserve

Do not merge these just because their formulas look similar. Compare behavior first.

### Candidate 1 — Compare

```text
Target / Limit → Actual → Delta
```

Examples:
- Income daily target → actual income → remaining/over target
- Outcome ceiling → actual spend → remaining/over ceiling

### Candidate 2 — Settle

```text
Expected/Required → Actual → Remaining
```

Examples:
- debt
- obligation
- Shopping planned vs actual amount (related but must be checked carefully before merging)

### Candidate 3 — Lifecycle

```text
OPEN → PARTIAL → COMPLETE / CANCELLED
```

Relevant to:
- debt
- obligation
- To-do
- Calendar items

### Important test for a true shared root
A shared root is valid when the **same command family can enter one root and then cleanly branch by context/type**.

Examples:
- `Complete` → debt means receive; obligation means pay
- `Partial` → debt means partial receive; obligation means partial pay

A similar-looking formula alone is not enough to make two logics one root.

---

## 9. Calendar one-stop service logic

Calendar is not just display. It should allow action at the item itself.

The user-facing item can expose:
- Complete
- Edit
- Cancel

But central Edit/Cancel authority remains Ledger.

### Debt follow-up
When a customer owes money:
- amount actually received on the original day is real income
- unpaid part is a follow-up debt, not received income
- debt remains tracked

When later collected:
- Complete can open full/partial settlement
- actual collected money is written to Ledger
- remaining debt is reduced or closed
- the debt’s origin/reference stays intact

### Obligation
When due:
- Complete → full/partial pay
- actual payment goes to Outcome/Ledger

### Ordinary expense
When completed/paid:
- actual expense goes to Outcome/Ledger

### Appointments / events
Calendar should support ordinary appointments/activities that do not create money unless explicitly linked to money.

This keeps Calendar general enough for future natural-language commands like:
- schedule an appointment
- move an appointment
- mark it done

---

## 10. To-do List inside Calendar

To-do is part of the Calendar page, not a fifth Manual house.

Two user-facing subtypes:

### General To-do
- ordinary work/activity
- completion closes the task
- no financial transaction by default

### Shopping To-do
- still a To-do item
- can carry an expected/planned amount
- planned amount participates in budget/ceiling calculations
- planned amount is **not real expense truth**
- only after actual purchase/Complete does real expense flow to Outcome/Ledger

Suggested current task data:
- id
- title
- due date/time
- priority
- status
- type = GENERAL | SHOPPING
- plannedAmount for Shopping

Useful current functions/behaviors:
- create task
- view tasks
- Today
- Upcoming
- Completed
- Overdue
- filter
- sort
- Complete
- Ledger-owned Edit/Cancel

Avoid generic `toggleTaskStatus()` semantics that freely flip truth back and forth. Prefer explicit action semantics such as Complete / Edit / Cancel.

Future-only Todo features:
- subtasks
- detailed tags/categories
- reminders/local notifications

### Calendar display for To-do
The Calendar page should show useful human-facing views such as:
- what must be done today
- what must be bought today
- upcoming
- overdue
- completed (can be folded/hidden)

For Shopping, show useful planned-budget context such as planned spend and remaining ceiling.

Backend routing IDs, source, refs, owner metadata should remain hidden.

---

## 11. Calendar status color

Each status should have a dedicated visual color so the UI does not need to prepend status text to every item.

Rule:
- backend stores a real status enum/state
- frontend color represents that status
- logic must never depend on color itself

---

## 12. History split

History must be separated into two distinct families.

### Chat / Intent History
Owned by the Chat/Intent side. Keep only conversational interpretation/control history such as:
- user wording
- normalization/typo correction if needed for debugging/history
- detected intent/action
- confirmation request
- confirmed / rejected result
- route/handoff metadata as needed

This history answers: **“How did the conversation get interpreted?”**

### Ledger History
Owned by Ledger. Keep business/data truth and events such as:
- income
- expenses
- debt
- obligations
- settlements
- refunds
- edits
- cancellations
- business-relevant Calendar/To-do changes
- linked records and timeline

This history answers: **“What actually happened to the data/business state?”**

Do not mix chat transcript history into Ledger business history.

---

## 13. Action Intent derived from Ledger capabilities

Intent should be generated from the capability list, not invented independently.

A practical stable command shape can be thought of as:

```text
Action + Target + Parameters
```

Examples:
- `รับมา 500 จากหนี้พี่เอ` → Complete/Partial + Debt + 500
- `จ่ายภาระนี้แล้ว` → Complete + Obligation
- `เปลี่ยนวันเป็นพรุ่งนี้` → Edit + Calendar item + new date
- `ยกเลิกรายการนี้` → Cancel + referenced record
- `วันนี้ต้องทำอะไร` → Read + Calendar/To-do + Today
- `เหลือเพดานเท่าไร` → Read/Analyze + Spending Ceiling
- `เปลี่ยนเป้ารายวันเป็น 1500` → Edit + Income Target + 1500

Potential high-level action families already implied by Manual:
- Read / View
- Summarize
- Analyze
- Create / Add
- Complete
- Edit / Extend
- Cancel

Intent’s job is to map human language to a capability already supported by Ledger/Manual.

---

## 14. Front Door responsibilities

The first/front chat layer should be thin.

It receives messages and handles language-facing behavior:
- receive text
- typo/normalization handling
- classify into known command box/action
- request confirmation for mutations
- display requested result
- display fail-closed/error result

### Confirmation rule
Read-only requests can pass directly.

Mutations require a confirmation turn before execution, including things like:
- record/save
- add/create
- edit/extend
- cancel
- complete when it changes data/state/money

The front door can ask Ledger/command metadata whether the command is a mutation. It should not maintain separate business-specific danger logic for every house.

Historical observation: the existing front-door path felt both “missing” and “overbuilt” because it had to infer behavior that actually belonged in Manual. With Ledger capability in place, most of that complexity disappears.

---

## 15. Thin Chat ↔ Ledger contract

A boundary is needed between Chat and Ledger, but it must stay thin.

Purpose:
- Chat speaks human language
- Ledger accepts stable commands

Chat should not pass raw human text directly into Ledger business logic.
Ledger should not become a natural-language parser.

The contract is only a stable handoff shape for:
- command in
- result/readback out

It must not become:
- another business engine
- another store
- another routing brain
- another source of truth

Conceptually:

```text
Chat → Intent → [Stable Manual Command] → Ledger
Chat ← Display Result ← [Stable Manual Result] ← Ledger
```

This also protects future UI changes: Manual UI can disappear or change without changing the Chat contract.

---

## 16. Single Ledger gateway rule

Recommended architecture rule:

**Ledger should be the single API/gateway into Manual for management actions.**

Even Manual UI actions such as Complete/Edit/Cancel should use the same Ledger gateway rather than bypassing it and calling a Core directly.

That yields one path regardless of surface:

```text
Chat UI ─┐
         ├→ Ledger Gateway → Core → Runtime → Readback
Manual UI┘
```

This keeps routing, history, readback, permission semantics, and future Intent integration consistent.

---

## 17. Existing real code foundation that must be reused

Do not create a duplicate engine.

Existing real machinery already identified:
- `greenfield/runtime.mjs`
- `greenfield/business-workflows.mjs`
- `greenfield/domain-operations.mjs`
- `greenfield/projections.mjs`
- `greenfield/finance-seed-import.mjs` (migration/import path only)
- `lighthouse/capabilities/expense.mjs` (existing bridge example)

Existing condensed engine:

```text
Runtime → Business Workflows → Domain Operations → Projections
```

Truth remains in Greenfield Runtime/Vault / durable encrypted state.

Existing Calendar domain capabilities already include:
- `CALENDAR_CREATE_RECORD`
- `CALENDAR_APPLY_PAYMENT`
- `CALENDAR_RESCHEDULE`
- `CALENDAR_SET_STATUS`

History/archive behavior already exists around domain mutations and should be preserved rather than replaced.

---

## 18. Current Phase-1 code foundation

Draft PR #95 already establishes the four Manual homes on the existing truth root:
- `manual/cores/income.mjs`
- `manual/cores/outcome.mjs`
- `manual/cores/ledger.mjs`
- `manual/cores/calendar.mjs`
- `manual/foundation.mjs`

Phase 1 intentionally contains no new business engine, no Action Intent, no Chat wiring, no new persistence, and no new UI.

The design in this file is the agreed direction for the later Logic/Function/Intent/wiring phases.

---

## 19. Things intentionally deferred

These ideas are preserved but are **not current-core requirements**:

- Calendar All-day
- Calendar conflict detection
- reminders/local notifications
- recurrence
- Map/GPS/Route integration for Ride
- detailed Todo subtasks
- detailed tags/categories
- advanced UI-specific month-grid concerns
- cloud sync as a truth owner

If added later, they must attach to current truth/capability boundaries rather than redefining the source of truth.

---

## 20. Design principles discovered during refinement

1. **Function + Logic before Intent.**
2. **Manual is the brain; Front Door is language + confirmation.**
3. **Ledger is the head/control desk of Manual.**
4. **One gateway is easier than many direct pipes.**
5. **UI visibility and backend responsibility are separate decisions.**
6. **Metadata for routing does not need to be shown to the user.**
7. **Color represents status; color is not status.**
8. **Planned money is not actual money.**
9. **New events must not rewrite old timeline truth.**
10. **Related events may link across days without moving their dates.**
11. **A shared root is valid because behavior cleanly branches from one command family, not merely because formulas look alike.**
12. **Intent should name existing capabilities, not create them.**
13. **Chat history and business history are different data families.**
14. **Manual UI may become backend-only later without breaking Chat if the contract and Ledger gateway remain stable.**

---

## 21. Current implementation direction after this design

When implementation resumes, use this order:

```text
1. Read the polished house decisions in this file
2. Derive real Function names/capabilities from those decisions
3. Verify shared roots (Compare / Settle / Lifecycle) by behavior
4. Expose a single Ledger gateway
5. Define the thin Chat ↔ Ledger command/result contract
6. Derive Action Intent from the capability list
7. Connect Front Door → Confirmation → Intent → Ledger
8. Connect readback Ledger → Chat
9. Keep Chat/Intent history separate from Ledger history
10. Integration-test the complete route at the end
```

No implementation should invent a capability that is not represented by an agreed Manual/Ledger behavior.
