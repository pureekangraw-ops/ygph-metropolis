# METROPOLIS Functional Shell v1 — Design Spec

## Purpose

Build a usable front-of-app functional shell for YGPH METROPOLIS before visual polish. The priority is correct ownership, navigation, task hierarchy, routes, states, and day-to-day usability. Visual styling, animation, decorative cards, and aesthetic refinement are deliberately deferred until the functional shell proves itself.

## Owner Delegation

Owner BIG authorizes GO to make reasonable implementation and architecture decisions inside this scope without asking for every detail. GO may merge, split, move, or rename front-end responsibilities when this reduces duplication, contradictory logic, or future maintenance cost.

GO must escalate only when a decision would materially change:
- the meaning of real money,
- durable user data,
- source-of-truth ownership between domains,
- destructive data behavior,
- owner policy that cannot be inferred safely.

The repair rule is root-first: if two screens or mechanisms duplicate or contradict each other, fix the underlying ownership or contract before patching both surfaces.

## Functional Principle

Front-end language is task-oriented. Core ownership remains domain-oriented.

A screen exists to answer one main question. Child functions are hidden under their parent until needed instead of being permanently expanded. Navigation and actions are separate concepts.

## Top-Level App Areas

The primary navigation has five destinations:

1. HOME
2. MAKE MONEY
3. CALENDAR
4. FINANCE
5. SYSTEM

Navigation is optimized for right-thumb use on compact mobile screens. The first implementation uses a right-side thumb rail with icon-only destinations. Placement may be adjusted after live usability testing without changing destination ownership.

Icon family: Phosphor throughout the app.

Recommended top-level icons:
- HOME: `house-simple`
- MAKE MONEY: `trend-up`
- CALENDAR: `calendar-dots`
- FINANCE: `wallet`
- SYSTEM: `gear-six`

The rail changes destinations only. It does not contain business actions.

## HOME — Attention Center

### Master Question

What is important enough that the user should notice it immediately?

### Responsibilities

HOME is not a data owner and is not a large dashboard. It is a ranked attention surface built from projections of other areas.

HOME shows at most three high-priority items by default. It may show fewer or none.

Candidate attention classes:
- overdue obligation or queue,
- due today,
- money likely insufficient for a near-term obligation,
- conflicting obligations on the same date,
- meaningful verification or consistency issue,
- meaningful income-goal risk when it is severe enough to matter.

Default near-term warning horizon: 7 days.

Each HOME item is a short summary only. Tapping it routes to the owning screen and relevant record/date. HOME must not embed edit forms, payment forms, sale forms, or maintenance controls.

If no item crosses the attention threshold, HOME remains quiet rather than filling space with low-value summaries.

## MAKE MONEY — Income Production

### Master Question

How much money has been generated today, from which source, and is today's target being reached?

### Subareas

- Dashboard
- Store
- Ride

The submenu is hierarchical: the parent is visible; child areas can be expanded or selected as needed rather than permanently spreading all controls.

### Dashboard

The main number is today's combined generated income across active income sources.

Reports may split the combined value into separate source blocks:
- Store
- Ride

The Dashboard must distinguish generated income from currently spendable money. It is not the Finance balance.

### Daily Goal Engine

At the start of each new local day, the app calculates a suggested daily income goal using:
- recent real income history,
- active near-term obligations,
- current available-money pressure.

A zero-income working day is a real value of 0 and is part of the history.

The calculation must be robust against one unusually high or low day. Implementation may choose a bounded trend/median-weighted method rather than a plain arithmetic mean.

The goal is created once for the day and then remains locked for that day. The user may manually override the day's goal if the suggested value is unreasonable. Manual goal override must never rewrite historical income.

The goal engine may evolve, but v1 must preserve these invariants:
- one goal per local day,
- generated at day start,
- stable during the day,
- manual override affects only that day's target,
- real income changes progress, not the target itself.

### Store

Store remains a first-class income source.

Primary action:
- Sell item

Secondary actions:
- Receive stock

Management actions:
- View stock
- Withdraw stock
- Adjust stock
- View history

Store UI must not expose all forms at equal visual priority.

A sale may route effects across domains according to existing Greenfield workflows:
- STORE owns the sale/inventory record,
- LEDGER/FINANCE owns real cash movement,
- CALENDAR owns time-based follow-up when money remains collectible later.

### Ride

Ride remains a business income source because the user still performs Lalamove work, but it has lower usage frequency than Store.

Ride must have a functional baseline in v1 rather than being a dead navigation item.

Minimum functional baseline:
- start/end a work round,
- record a job amount,
- distinguish cash and credit income,
- record round expense,
- show today's ride-generated income,
- expose current/pending ride credit where applicable,
- route real cash effects to FINANCE.

Ride may be implemented as a bounded module so it can evolve independently without bloating Store or Finance.

## FINANCE — Money Truth

### Master Question

How much real money is available now, how much came in and went out, and what obligations remain?

FINANCE is the source of truth for real-money state and obligations.

### Core Values

- current spendable balance,
- real money in today,
- real money out today,
- this month's obligation total,
- paid amount,
- remaining obligation amount,
- near-term obligation pressure.

The current balance is persistent and does not reset each day. It changes only through real income, real expense, adjustment/reconciliation, or other legitimate Ledger effects.

Generated income that has not actually become real money must not silently increase the spendable balance.

### Obligations

FINANCE owns obligation data.

For each obligation, FINANCE should be able to show:
- original total,
- paid amount,
- remaining amount,
- next due installment/date,
- installment plan when applicable,
- status.

Creating or importing an obligation belongs to FINANCE/System workflows, not to Calendar as an owner.

### Money-vs-Obligation Engine

FINANCE computes the relationship between available money and upcoming obligations.

This engine supports:
- whether the current balance can cover the next due obligation,
- how much is missing,
- how many days remain,
- whether multiple due items collide,
- the point at which available money reaches a payable threshold.

When a payable threshold is reached, the app may surface a prompt for the user to consider payment. It must not silently pay obligations.

This projection feeds both HOME and CALENDAR.

FINANCE is the data/math view; CALENDAR is the concrete time view.

## CALENDAR — Time and Obligation Hub

### Master Question

What must happen when, what is near or overdue, and what has already been handled?

CALENDAR is not the owner of debt or real money. It presents and acts on time-based queues created by owning workflows.

### Default View

Month grid is the default.

Controls:
- previous month,
- today,
- next month.

A day cell can indicate that work exists without cramming full record details into the grid.

Tapping a date reveals that day's items below the calendar.

### Shared Time States

Calendar-derived time state is shared consistently across the app:
- OVERDUE
- TODAY
- NEAR
- FUTURE
- COMPLETED
- CANCELLED

Default NEAR horizon: 7 days.

Collision is a flag/condition, not a separate lifecycle status. It occurs when meaningful obligations/actions share the same day or compete for insufficient funds.

Completed items remain available through history/filtering rather than disappearing irretrievably.

### Actions

Calendar may expose contextual actions such as:
- receive payment,
- pay obligation,
- mark completed,
- cancel.

Actions route to the owning workflow so real money and obligation truth remain in FINANCE/STORE while Calendar updates the time queue as a consequence.

## SYSTEM — App Workbench

### Master Question

What is the state of the app/data, and how can the user safely operate or maintain it?

SYSTEM is intentionally broader than Settings.

### Subareas

- Front-end settings
- Import
- Export
- Backup
- Restore
- Version information
- System checks
- Diagnostics
- Lock
- Maintenance functions when justified

Child controls remain collapsed until selected. The initial System view should show understandable summaries rather than dumping raw diagnostics.

Raw JSON diagnostics belong to an Advanced area.

Destructive or high-risk actions such as Restore or data-clearing must be visually and procedurally separated from routine controls and require confirmation.

## Navigation Hierarchy

The app uses parent/child hierarchy instead of permanently expanded feature walls.

Rules:
- top-level rail contains destinations only,
- each destination may contain subareas,
- a parent can reveal/hide children,
- routine content stays focused on the selected subarea,
- detail pages are entered from lists/cards and return to the prior context,
- HOME cards deep-link to the true owning context,
- SYSTEM utilities do not appear as peer business actions.

## Action Priority

Each screen may have one primary task action when one truly dominates.

Examples:
- Store: Sell item
- Finance: Add income/expense may be peers if no single one dominates; avoid inventing a fake global primary action
- Calendar: no generic Create Queue primary action
- System: no destructive action may be primary

Secondary and management actions belong in lower visual hierarchy or contextual menus.

## Lists, Search, and Detail

Store, Finance, and Calendar should support history and filtering appropriate to their records.

List rows/cards show only enough information to identify and act on an item. Technical identifiers, schema labels, and raw record fields stay in details/diagnostics.

Tapping a row opens a focused detail view rather than expanding every field permanently in the main list.

## Data Ownership and Cross-Domain Routes

The front end may combine concepts, but ownership must stay explicit:

- STORE owns store/inventory/sales records.
- FINANCE/LEDGER owns real-money transactions and obligations.
- CALENDAR owns time-based queue state and time projection.
- MAKE MONEY is a front-end business aggregate, not a new source of financial truth.
- HOME is a projection/attention layer, not an owner.
- SYSTEM manages app operations and data movement, not business truth.
- RIDE, when implemented, owns ride operational records and routes real-money effects to FINANCE.

If a feature appears to require two owners to maintain the same truth, the design must be corrected before implementation.

## Functional States

Every area must define usable behavior for:
- locked,
- loading,
- empty,
- normal,
- recoverable error,
- blocked/high-risk error.

No screen may require raw diagnostics to understand a normal recoverable error.

## Deferred Visual Work

The following are explicitly deferred until functional validation:
- final color system,
- decorative gradients,
- shadows,
- animation polish,
- final typography scale,
- ornamental cards,
- brand micro-interactions.

Only minimal styling needed for hierarchy, touch targets, state distinction, and safe use is in scope for v1.

## Functional Acceptance Criteria

The shell is considered usable when all of the following are true:

1. A right-handed mobile user can move among all top-level destinations without hunting through content.
2. HOME surfaces only meaningful attention items and routes each one to its owner.
3. MAKE MONEY shows today's combined generated income and a stable daily goal.
4. Store can execute its existing core workflows without exposing all forms at once.
5. Ride has a minimal real working flow rather than a placeholder.
6. FINANCE shows persistent spendable balance and obligation truth separately from generated income.
7. Money-vs-obligation calculations can warn about near-term insufficiency and support payment consideration without auto-paying.
8. CALENDAR presents a usable month grid, day selection, time states, and contextual actions.
9. SYSTEM supports import/export/backup/restore/version/diagnostics/lock through clear hierarchy.
10. No front-end aggregate becomes a second source of truth for Store, Ledger/Finance, or Calendar data.
11. Existing Greenfield database/vault and imported data remain intact unless an explicitly approved migration is introduced.
12. Functional tests cover navigation hierarchy, daily goal invariants, money-vs-obligation projection, Calendar state derivation, cross-domain routing, and high-risk System controls.

## Design Decision Rule

When choosing between two implementations, prefer the one that:

1. preserves a single source of truth,
2. removes duplicated logic,
3. makes ownership obvious,
4. keeps routine workflows short,
5. keeps rare/high-risk controls out of routine paths,
6. can be changed later without rewriting unrelated areas.

Correctness and maintainability outrank visual polish in this phase.
