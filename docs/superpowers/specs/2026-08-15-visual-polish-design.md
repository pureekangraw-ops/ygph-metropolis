# Visual Polish Design

## Goal
Raise the existing YGPH METROPOLIS production shell to a consistent production-grade visual standard without changing navigation, business workflows, domain authority, persistence, or popup behavior.

## Scope
Only presentation-layer changes are allowed in this pass.

In scope:
- Typography hierarchy and readability.
- Spacing rhythm and section separation.
- Button sizing, emphasis, and touch-target consistency.
- Card/panel hierarchy and visual grouping.
- Dialog/popup spacing, headers, and action layout.
- Bottom navigation consistency.
- Mobile layout polish for widths <= 700px.
- Small accessibility improvements that do not alter interaction flow.

Out of scope:
- New features.
- New navigation destinations.
- Business logic changes.
- Domain/runtime/state/schema changes.
- Form field semantics or validation changes.
- Popup workflow changes.
- Redesigning city information architecture.

## Design Direction
Use the current dark visual language and existing CSS variables. Improve hierarchy instead of introducing a new theme. Preserve the five-area bottom navigation: Home, Store, Ride, Finance, Calendar. Settings remains a utility dialog. Existing popup/dialog flows remain the action-entry pattern.

The visual hierarchy should read in this order:
1. Current city/page title and primary status.
2. Key metrics or actionable attention.
3. Inspection/secondary content.
4. Short actions via existing popup launchers.

## Component Rules
### Typography
- One clear page-title scale.
- Section headings smaller than page titles but visibly distinct from body text.
- Muted/helper text remains secondary and readable.
- Numeric hero values remain visually dominant where already used.

### Spacing
- Establish a consistent vertical rhythm between page head, hero/metrics, panels, lists, and action rows.
- Avoid dense edge-to-edge clusters on mobile.
- Preserve safe-area spacing above bottom navigation.

### Buttons
- Primary actions remain visually dominant.
- Secondary and utility actions remain quieter.
- Destructive actions retain danger styling.
- Mobile touch targets should stay at least 44px high where practical.

### Cards and Panels
- Use existing panel/card surfaces; do not add decorative containers without information hierarchy value.
- Reduce visual ambiguity between overview cards, list items, and interactive buttons.

### Dialogs
- Keep the existing native dialog architecture and popup task layer.
- Improve internal spacing and action alignment only.
- Do not change submit/close/error behavior.

### Bottom Navigation
- Preserve five equal destinations and fixed-bottom behavior.
- Improve active/inactive clarity without changing destination order or logic.

## Files Expected to Change
Primary:
- `styles.css`

Only if required to expose semantic classes without changing behavior:
- `index.html`
- `ui/app.mjs`
- `ui/ride-ui.mjs`
- `ui/action-popups.mjs`

Release/cache metadata may change only when production asset content changes:
- `RELEASE_MANIFEST.json`
- `sw.js`

## Verification
The pass is complete only when:
- Existing Greenfield tests remain green.
- Syntax and UTF-8 gates pass.
- Existing navigation and popup tests remain unchanged in meaning and pass.
- Mobile shell keeps full-width content and bottom navigation touch targets.
- No business/domain/runtime file changes are required.
- Asset revision is updated if production assets change.
- Production deploy succeeds after merge.

## Stop Conditions
Stop and split the work instead of expanding scope if a visual change requires:
- Business logic changes.
- New state or persistence fields.
- Navigation restructuring.
- New popup behavior.
- New reusable application architecture beyond styling/semantic hooks.

## Success Result
YGPH METROPOLIS keeps the same behavior and information architecture, but presents a cleaner, more consistent, mobile-friendly production UI with no functional regression.