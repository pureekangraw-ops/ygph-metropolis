# UI Housekeeping Split Design

## Goal
Reduce `ui/app.mjs` responsibility without changing user-visible behavior, business logic, calculations, routes, action contracts, or theme.

## Scope
Extract only city rendering that is already self-contained enough to move safely:
- Home rendering -> `ui/home-ui.mjs`
- Store rendering -> `ui/store-ui.mjs`
- Finance rendering -> `ui/finance-ui.mjs`

Keep in `ui/app.mjs` for this pass:
- runtime lifecycle and authentication/recovery
- app navigation and global routing
- Calendar rendering/edit/action orchestration
- shared runtime mutations and form bindings
- application bootstrap and service-worker registration

Calendar is intentionally not extracted in this pass because it shares mutable selection/edit state and action execution with the controller. Splitting it now would increase coupling risk rather than reduce it.

## Boundaries
Each city module is a factory receiving only the dependencies it needs. It may render DOM and call a route callback, but must not own runtime state, persistence, business calculations, or mutations.

`ui/app.mjs` remains the composition root. It builds shared context and delegates rendering to city modules.

## Behavior Contract
- Same DOM IDs and Thai copy.
- Same Home attention routing.
- Same Store receivable VERIFY/UNSCHEDULED/SCHEDULED presentation.
- Same Store stock/history ordering and values.
- Same Finance pressure wording, next-due route, obligation list, and transaction history.
- No theme changes.
- No workflow, persistence, calculation-authority, or domain changes.

## Verification
Add a structural test that requires the new city modules, requires `ui/app.mjs` to import/use them, and prevents the extracted renderer functions from remaining duplicated in `ui/app.mjs`. Run the full Greenfield deploy gate. Publication manifest/service-worker closure must include all new production imports before merge.
