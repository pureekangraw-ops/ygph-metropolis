# METROPOLIS Production App Structure v2 — Design Spec

Status: OWNER-APPROVED DIRECTION / SUPERSEDES FRONT-END NAVIGATION ASSUMPTIONS IN `metropolis-functional-shell-v1-design.md`

## Purpose

Convert METROPOLIS from an experimental/compatibility UI shell into one coherent production application structure. The app must place every button, input, summary, and route where it is most useful to the user, not where legacy code happens to expose it.

The governing rule is semantic placement before visual completeness:

> Do not add or keep UI merely to make a screen look complete. Every visible element must have a clear job in the current flow, and every input must be requested only when it is needed.

## Production Flow

The top-level human flow is:

`Boot → Setup/Unlock → Home → City → Task → Result → Updated Home/City state`

### Entry layer

`Setup/Unlock` and `Home` are the first application layer. They are not business cities.

- Setup exists only to establish safe local access and required storage/security state.
- Unlock exists only to open the existing protected local state or route to recovery.
- Home exists to show what matters now across the system and route the user to the correct owner/city.

Business configuration must not be mixed into security setup unless it is strictly required to establish the security/storage contract.

## Home — Operational Front Door

### Master question

What is important now, and where should I go next if action is needed?

Home is a projection/attention surface, not a data owner and not a launcher-first screen.

Display order:

1. important/urgent items that deserve attention now,
2. concise current summary values that materially help a decision,
3. city entry controls,
4. lower-priority/recent information only when useful.

Home must not begin by asking the user to choose an app before showing relevant system state.

### Attention rules

Home may surface overdue, due-today, verification, pending collection/payment, insufficient-money pressure, or other meaningful owner-projected items. It should stay quiet when nothing meaningful requires attention.

Each attention item deep-links to the owning city and relevant context. Home does not embed full business forms.

### City entry controls

Primary business cities are:

- STORE
- RIDE
- LEDGER / FINANCE
- CALENDAR

City entry controls are doors. Their job is navigation. They should not duplicate full status dashboards already shown above them.

Utilities such as Settings, Report, Backup/Restore, diagnostics, and exchange/review are not peer business cities and should be routed as utilities.

## Navigation

Mobile navigation must preserve content width and one-hand reach.

The previous right-side thumb rail is superseded for the production shell because it permanently consumes horizontal content space on compact screens.

The production shell uses a bottom navigation pattern for persistent movement among primary app destinations. Initial target destinations:

- Home
- Store
- Ride
- Finance
- Calendar

Settings/System utilities remain reachable from app-level utility entry, not forced into the primary five-item bar.

Navigation controls change context only; they do not perform business mutations.

## City responsibilities

A city is a working space that receives a relevant user intent and handles it through the correct domain owner.

### Store

Owns store operational truth such as sales, stock, purchase/receipt flows, stock withdrawal/adjustment, and store receivables according to current Greenfield contracts.

Default hierarchy:

1. city status needed to act,
2. one dominant primary task when one exists,
3. secondary tasks,
4. management/history.

Do not expose all forms at equal visual priority.

### Ride

Preserve current runtime behavior and existing tested contracts. Do not use this UI redesign to silently redefine unresolved semantic ownership. New owner-level meaning remains subject to existing VERIFY rules.

### Finance / Ledger

Owns real-money truth and obligations. Generated income that is not yet real money must not silently increase spendable balance.

Finance UI must not create arbitrary incoming money when the owning flow requires a traceable Store/Ride/Calendar source.

### Calendar

Owns time-based queue/action state and execution timing. Calendar does not manufacture real-money truth. Contextual actions must route through the owning domain workflow.

## Task flow rule

Every business flow is designed from user intent first, not from the existing form or schema.

For each task, define:

`Intent → required context → required inputs → validation → domain command → durable effect → user-facing result`

Inputs that are optional, derivable, already known, or not needed yet must not be forced into the first step.

A field existing in the data model is not sufficient reason to show it in a form.

## Button rule

Every button must answer all of the following:

- Why is it visible in this context?
- What user intent does it represent?
- Is it navigation or mutation?
- Which owner handles the effect?
- What visible result confirms success or failure?

If those answers are unclear, the button must not be promoted into the production flow.

## Result rule

Success feedback must communicate the business outcome, not only that code executed.

Examples:

- sale completed → what changed in sale/stock/money/receivable state,
- obligation action completed → what remains and when the next action is due,
- pending collection created → money did not move yet and Calendar now carries follow-up.

## Security flow

Preserve the freshly hardened auth/recovery contract from main. This production-structure phase must not weaken or bypass it.

The UI may simplify placement and wording, but security behavior, atomic credential rebinding, recovery preservation, authenticated password change, crypto, and persistence invariants remain intact unless a separate security change is explicitly justified and tested.

## App shell architecture

The target front-end structure is one coherent production shell:

- Boot/PWA runtime
- Security entry
- App shell
  - Home
  - Store
  - Ride
  - Finance
  - Calendar
  - Utilities

The UI should render from explicit application state/projections. It must not depend on service-worker HTML rewriting, DOM patching, or stacked compatibility overlays as the long-term presentation architecture.

Legacy layers may remain temporarily during migration, but they are migration sources/dependencies, not design authority.

## Migration strategy

Do not rewrite all layers at once.

1. Lock semantic flow and tests.
2. Build/repair production shell behavior on the current Greenfield runtime.
3. Move Home and navigation to the new structure.
4. Move city screens task-by-task without changing domain truth.
5. Remove obsolete UI compatibility behavior only after equivalent production behavior is tested.
6. Reduce service-worker responsibilities back toward install/cache/offline lifecycle rather than presentation rewriting.

No data migration is introduced by this UI architecture work unless separately required and approved.

## Mobile layout rules

- Main content must own the full useful width; persistent side rails must not reserve a narrow content column on compact screens.
- Primary content and actions appear before secondary information.
- Touch targets and spacing must be usable one-handed.
- Forms should be staged or grouped by task meaning rather than displayed as long schema mirrors.
- Avoid duplicate summaries across Home, city-entry controls, and city headers.

## Error states

Every top-level area must support:

- loading,
- empty/quiet,
- normal,
- recoverable validation/error,
- blocked/high-risk error.

Normal recovery must not require raw diagnostics.

## Test strategy

Use contract-first/TDD for new production shell behavior.

Required coverage includes:

- authenticated entry routes to Home,
- Home prioritizes attention/summary before city entries,
- primary navigation does not reserve right-side content width,
- navigation does not mutate business state,
- Home attention deep-links to owner context,
- security setup excludes unrelated business configuration,
- business task inputs are scoped to required intent,
- Store/Finance/Calendar cross-domain effects preserve existing owner contracts,
- success results describe business outcome,
- reload/offline path preserves app shell and durable state,
- existing auth/recovery tests continue to pass.

## Out of scope for this phase

- redesigning crypto or vault format,
- changing durable data ownership merely for UI convenience,
- silent RIDE semantic reclassification,
- decorative visual polish unrelated to hierarchy/usability,
- destructive data cleanup of legacy records,
- broad feature additions that do not serve the production flow.

## Acceptance criteria

1. Setup/Unlock and Home form a clear first layer before business cities.
2. Home tells the user what matters before asking which city to enter.
3. Persistent mobile navigation no longer consumes a right-side strip of content width.
4. Store, Ride, Finance, and Calendar are working spaces with task-oriented hierarchy rather than equal-weight form walls.
5. Settings/report/recovery utilities are routed deeper and do not compete with daily business work.
6. Every production button and input has a clear context, intent, owner, and result.
7. Existing Greenfield persistence, security, and domain contracts remain intact.
8. Experimental UI patching is no longer treated as the architecture to extend.
9. The migration is test-backed and can be reviewed before legacy presentation layers are removed.
