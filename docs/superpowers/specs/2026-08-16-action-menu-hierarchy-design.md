# Action/Menu Hierarchy Design

## Goal
Make Store, Finance, Calendar, and Ride use one consistent mobile action-entry pattern without changing business logic, domain authority, persistence, or workflow semantics.

## Chosen Pattern
Each city page remains an inspection/overview surface. Short operational work enters through one city-level Action launcher. That launcher opens a native dialog containing the available actions for that city. Choosing an action opens the existing task form/dialog; forms are moved/reused, never cloned.

## City Rules
- Store: replace the four visible action launchers (sale, purchase, withdraw, adjust) with one `จัดการร้านค้า` action launcher. Its menu offers those four existing tasks.
- Finance: replace scattered visible launchers for income, expense, obligation, remaining obligations, and ledger history with one `จัดการการเงิน` launcher. Task actions continue to use existing forms; inspection items open existing menu panes.
- Calendar: remove the selected-date action dropdown/select used as a work-entry mechanism. Replace it with one `จัดการวันที่เลือก` launcher that opens a dialog listing actions available for the selected date. Existing payment/edit/reschedule/cancel workflows remain authoritative and unchanged.
- Ride: inspect current behavior. If action entry is already coherent around the active round and credit surfaces, keep it unchanged. Do not force a city-wide action menu where round-state context is required.

## Dialog Architecture
Extend `ui/action-popups.mjs` rather than create a second popup system. Add a city action-menu layer that only routes to existing task/menu/dialog handlers. No business validation lives in the launcher layer.

## Interaction Rules
- One obvious action entry per applicable city.
- Inspection links remain visible when they are for reading/overview navigation, unless they are currently masquerading as operational action controls.
- Form selects remain selects when they represent field values (payment mode, status options, etc.). Only navigation/work-entry dropdowns are removed.
- Native dialog behavior, focus handoff, Escape/cancel handling, and existing success/error handling are preserved.
- Mobile-first; no new side rail or nested page hierarchy.

## Testing
Add a Greenfield regression contract that proves:
1. Store and Finance expose one city-level action launcher instead of scattered task launchers.
2. Calendar no longer uses a select/dropdown as the action-entry control for the selected date.
3. Existing task forms still exist exactly once and remain wired through `action-popups.mjs`.
4. Ride round/credit task behavior remains unchanged.
5. Full deploy gate, syntax, UTF-8, publication allowlist, and service-worker asset revision remain green.

## Out of Scope
- Business/domain/runtime changes.
- New features or data fields.
- Redesigning city information architecture.
- Replacing field-level select controls.
- Changing Store/Ride/Finance/Calendar source-of-truth rules.

## Stop Conditions
If implementing the unified launcher requires changing domain commands, persistence, workflow invariants, or selected-date business semantics, stop and split that issue from this pass instead of expanding scope.
