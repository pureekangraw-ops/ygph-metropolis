# Action/Menu Hierarchy Design

## Goal
Make Store and Finance use one consistent mobile action-entry pattern without changing business logic, domain authority, persistence, workflow semantics, or unrelated filtering controls.

## Chosen Pattern
Each city page remains an inspection/overview surface. Short operational work in Store and Finance enters through one city-level Action launcher. That launcher opens a native dialog containing the available actions for that city. Choosing an action opens the existing task form/dialog; forms are moved/reused, never cloned.

## City Rules
- Store: replace the four visible action launchers (sale, purchase, withdraw, adjust) with one `จัดการร้านค้า` action launcher. Its menu offers those four existing tasks.
- Finance: replace scattered visible launchers for income, expense, obligation, remaining obligations, and ledger history with one `จัดการการเงิน` launcher. Task actions continue to use existing forms; inspection items open existing menu panes.
- Calendar: preserve `calendarFilter`. Current evidence shows it is explicitly a status filter (`aria-label="กรองสถานะ"`), not a navigation/work-entry dropdown. Calendar item actions remain where they are and keep their existing lifecycle semantics.
- Ride: preserve current active-round and credit-context action behavior. Do not force a city-wide action menu where round-state context is required.

## Dialog Architecture
Extend `ui/action-popups.mjs` rather than create a second popup system. Add a city action-menu layer that only routes to existing task/menu/dialog handlers. No business validation lives in the launcher layer.

## Interaction Rules
- One obvious action entry for Store and one for Finance.
- Inspection links remain visible when they are for reading/overview navigation, unless they are currently masquerading as operational action controls.
- Form selects and filters remain selects when they represent values or filtering, including `calendarFilter`.
- Native dialog behavior, focus handoff, Escape/cancel handling, and existing success/error handling are preserved.
- Mobile-first; no new side rail or nested page hierarchy.

## Testing
Add a Greenfield regression contract that proves:
1. Store and Finance expose one city-level action launcher instead of scattered task launchers.
2. `calendarFilter` remains present and remains a status filter, preventing accidental semantic drift.
3. Existing task forms still exist exactly once and remain wired through `action-popups.mjs`.
4. Ride round/credit task behavior remains unchanged.
5. Full deploy gate, syntax, UTF-8, publication allowlist, and service-worker asset revision remain green.

## Out of Scope
- Business/domain/runtime changes.
- New features or data fields.
- Redesigning city information architecture.
- Replacing field-level select controls or Calendar filtering.
- Changing Store/Ride/Finance/Calendar source-of-truth rules.

## Stop Conditions
If implementing the unified launcher requires changing domain commands, persistence, workflow invariants, Calendar filtering, or selected-date business semantics, stop and split that issue from this pass instead of expanding scope.
