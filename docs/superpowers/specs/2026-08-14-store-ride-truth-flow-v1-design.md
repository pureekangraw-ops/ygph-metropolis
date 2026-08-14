# Store / Ride Truth-Flow Redesign v1

Date: 2026-08-14
Base: PR #45 head `1176e558a1c14b1bc2db8e2860f6a160b0968c28`
Branch: `feature/store-ride-truth-flow-v1`
Status: DESIGN APPROVED IN CHAT / WRITTEN SPEC PENDING USER REVIEW

## Goal

Refactor the internal Store and Ride city flows so the city page shows current truth first, short actions open in the existing popup layer, and deeper inspection uses dedicated list/detail surfaces. Do not change Shell/Home/Bottom Nav unless a traced Store/Ride flow exposes a real defect.

The redesign must preserve domain ownership: Store owns sale/stock/receivable source truth, Ride owns round/job/credit operational truth, Ledger owns real money, and Calendar owns time queues only.

## Root findings to fix before UI expansion

### 1. Receivable truth gap

Current Store receivable projection is derived from open Calendar `RECEIVE_CUSTOMER_PAYMENT` queues. A Calendar queue can be cancelled while the source Sale still has `outstandingSatang > 0`, which makes Store show zero receivable while the Sale still says money is owed.

Required invariant: cancelling/rescheduling a Calendar queue must never erase Store receivable truth. Calendar lifecycle is not financial/source cancellation.

Design direction:
- Store receivable amount must be derived from open/partial Sale source truth (`outstandingSatang`) rather than queue existence alone.
- Calendar queues remain scheduling/action surfaces and must retain `detail=STORE/<saleId>` relation.
- Cancelling a Calendar queue closes only the scheduled action. It does not mutate Sale outstanding balance.
- UI must surface a receivable whose queue is cancelled/missing as needing scheduling/attention rather than hiding the debt.
- If more than one actionable receive queue points at the same Sale, classify the relation as `VERIFY_DUPLICATE` and do not silently choose one.

### 2. No fake per-product stock identity

Current Store records contain title + quantity deltas but no stable `productId`/SKU identity. Therefore v1 must not invent a per-product inventory catalog by grouping arbitrary titles.

Allowed v1 surfaces:
- calculated total stock quantity
- stock movement/history
- sale/purchase/withdrawal/adjustment records

Out of scope for v1:
- product catalog
- SKU/product identity
- per-product balances

Those require a separate schema/domain design.

### 3. Ride round and credit are separate flows

`rideJob` and `rideExpense` require an active round. `rideWithdrawCredit` does not belong to a round and may be valid when no round is active.

Required UI split:
- Current Round: start, record job, record round expense, end round
- Credit: pending credit + withdraw credit

Credit withdrawal must never be hidden merely because no round is active.

### 4. Ride needs a real round-state projection

Current UI maps `activeRound ? ACTIVE : NOT_STARTED`, which loses the difference between "not started today" and "a round was completed".

Add a projection that exposes at least:
- `activeRound`
- `latestRound`
- `todayRoundState`: `NOT_STARTED | ACTIVE | COMPLETED`

State semantics:
- `ACTIVE`: any active round exists.
- `COMPLETED`: no active round exists and at least one round closed today; `latestRound` is the most recently closed/started round.
- `NOT_STARTED`: no active round and no round closed today, even if older historical rounds exist.

This projection is read-only and derived from Ride records; do not create a new durable status record solely for UI. Multiple rounds per day remain allowed because the current domain only forbids simultaneous active rounds.

### 5. Ride generated income must not be confused with spendable cash

Ride jobs include both CASH and CREDIT. CASH creates Ledger IN immediately; CREDIT becomes real money only after withdrawal.

Round/ride summary must distinguish:
- generated income (all completed jobs)
- cash received from ride jobs
- credit earned / pending credit
- round expenses

Do not label total generated income as cash balance or money available.

## Store city design

### Surface order

1. Current store state
   - sales generated today
   - total calculated stock quantity
   - receivable source truth
   - attention item when receivable exists without one unambiguous actionable Calendar queue

2. Short actions
   - Sell
   - Receive stock
   - Withdraw stock
   - Adjust stock

These actions continue to use the existing task popup layer and existing business handlers. Do not duplicate business logic in UI modules.

3. Inspection surfaces
   - Receivables
   - Stock movements
   - Store history

These are list/detail inspection views, not form accordions.

### Receivables view

Each open/partial Sale with `outstandingSatang > 0` is a receivable source record.

For each receivable derive queue relation state:
- `SCHEDULED`: exactly one actionable `RECEIVE_CUSTOMER_PAYMENT` queue exists and its `detail` points to this Sale.
- `UNSCHEDULED`: no actionable queue exists (including when only cancelled/completed queues remain).
- `VERIFY_DUPLICATE`: more than one actionable queue points to the same Sale.
- `VERIFY_RELATION`: a candidate queue has missing/malformed/mismatched source relation.

V1 must not silently recreate, merge, cancel, or select among ambiguous queues. It may provide a route/action to Calendar scheduling only if an explicit safe workflow is added and tested. Otherwise display non-SCHEDULED states as attention/VERIFY.

## Ride city design

### Surface order

1. Current ride state
   - `NOT_STARTED`: no active round and no completed round today
   - `ACTIVE`: active round exists
   - `COMPLETED`: no active round but at least one round completed today
   - generated income today
   - pending credit

2. Current Round actions
   - NOT_STARTED: Start round
   - ACTIVE: Record job, Round expense, End round
   - COMPLETED: Start new round (current domain permits another round after the prior one is closed)

3. Credit surface
   - pending credit amount
   - Withdraw credit action whenever pending credit > 0, independent of active round

4. Inspection surfaces
   - Current/latest round jobs
   - Round summary
   - Round history

### Round summary

For a selected round derive:
- generatedSatang = sum JOB amount
- cashJobSatang = sum JOB(CASH)
- creditJobSatang = sum JOB(CREDIT)
- expenseSatang = sum EXPENSE
- jobCount
- startedAt / endedAt / status

Pending credit remains a global Ride projection because withdrawal records are not round-bound in the current model.

## Data flow invariants

### Store sale

`Sell -> STORE Sale source truth -> if received > 0, Ledger IN -> if outstanding > 0, Calendar receive queue`

After any Calendar status mutation, Store receivable source truth remains derived from Sale outstanding balance.

### Ride job

`Active round -> Ride JOB`
- CASH -> Ledger IN in same atomic workflow
- CREDIT -> no Ledger mutation until withdrawal

### Ride expense

`Active round -> Ride EXPENSE + Ledger OUT` in one atomic workflow.

### Ride credit withdrawal

`Pending Ride credit -> Ride CREDIT_WITHDRAWAL + Ledger IN` in one atomic workflow, independent of round state.

## Error handling

- No active round: block job/expense before durable mutation and keep popup open with error.
- Credit overdraw: block atomically; no Ride or Ledger partial record.
- Store stock underflow: preserve existing workflow invariant.
- Receivable queue cancelled/missing: do not hide debt; show source receivable with unscheduled state.
- Duplicate/malformed receivable queue relation: show VERIFY and do not guess which queue is authoritative.

## Testing requirements

Add regression coverage for:

1. Cancelled receive queue does not reduce Store receivable source total.
2. Partial Sale payment decreases Sale outstanding and Store receivable exactly once.
3. Receivable with cancelled/missing queue is projected as `UNSCHEDULED`/attention.
4. Duplicate actionable queues for one Sale project `VERIFY_DUPLICATE` and are never silently selected.
5. Store v1 does not claim per-product stock identity.
6. Ride NOT_STARTED / ACTIVE / COMPLETED projection across round lifecycle, including older historical rounds.
7. Ride job and expense remain blocked without active round.
8. Credit withdrawal remains available/valid without active round when pending credit exists.
9. Round summary separates generated, cash, credit, and expenses.
10. CASH job produces Ride truth + Ledger IN; CREDIT job does not create Ledger until withdrawal.
11. Existing popup layer remains the single short-action form host; no cloned handlers/forms.
12. Shell/Home/Bottom Nav regression tests remain unchanged and passing.

## Non-goals

- Product catalog/SKU schema
- Per-product stock quantities
- Editing historical Sale/Job money values
- Rewriting Ledger ownership
- Making Calendar cancellation cancel Store/Ledger source truth
- Automatically repairing ambiguous Calendar queue relations
- Changing Gate/Login, Home, Finance, Settings, or global navigation except where a traced Store/Ride defect requires an explicit follow-up spec

## Integration sequence

1. Fix Store receivable projection truth and tests.
2. Add Store receivable relation projection / inspection UI.
3. Restructure Store city surface without changing business handlers.
4. Add Ride round-state and round-summary projections with tests.
5. Restructure Ride city and separate Credit from Current Round.
6. Run feature preflight/regression checks.
7. Stop at READY FOR GATE unless user explicitly authorizes Gate.
