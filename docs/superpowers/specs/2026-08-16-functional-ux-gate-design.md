# METROPOLIS Functional UX Gate — Design

## Goal
Make the current METROPOLIS 5.1.0 functional shell comfortable, obvious, and safe for daily mobile use before any theme/visual-brand work.

## Scope
- Preserve STORE / LEDGER / CALENDAR / RIDE ownership and all business/runtime behavior.
- Preserve the five-destination navigation model: Home, Store, Ride, Finance, Calendar.
- Improve only interaction hierarchy, information density, button placement, warnings/status visibility, mobile ergonomics, and accessibility.
- No new product features, no decorative hero, no theme rewrite, no animation project.

## Interaction hierarchy
1. Home shows actionable attention first.
2. Compact operational summary follows.
3. City entry/navigation follows.
4. Secondary configuration such as daily goal remains collapsed.

Within each city:
- Status/summary first.
- One clearly dominant action path per current task context.
- Detail/history links after actions.
- Destructive actions remain visually separated.

## Mobile layout
- Keep bottom navigation fixed and safe-area aware.
- Preserve minimum practical touch height of 44px; primary launch/actions target at least 48px where space allows.
- Do not collapse every metric group to one column. Compact metrics use two columns on phones; content-heavy cards may span full width.
- Reduce repetitive card borders and vertical dead space without shrinking touch targets.

## Information and status system
- Priority order: urgent/actionable → current state → supporting detail → history.
- Warning states use text plus symbol/label, never color alone.
- Danger is reserved for destructive/error states; warning for due/verification; accent for active/ready.
- Empty states remain explicit and calm, not alarm-styled.
- Important monetary truth remains textual and readable without relying on icons.

## Buttons
- Primary action: one dominant action per task context.
- Secondary actions use quieter surface/border treatment.
- Inspection/history actions remain full-width rows but visually subordinate to task actions.
- Modal actions remain reachable and wrap safely on narrow screens.

## Accessibility
- Keep visible focus states.
- Preserve text labels for navigation icons.
- Maintain readable contrast and do not encode state through color alone.
- Keep live status regions already present in the app.

## Files expected to change
- `styles.css`: functional hierarchy, density, mobile metric grid, actions, warnings, touch ergonomics.
- `index.html`: only small structural/class/label changes if required for hierarchy; no business forms or IDs removed.
- `tests/greenfield-functional-ux.test.cjs`: static contract tests guarding navigation, touch sizing, mobile metric behavior, warning semantics, and primary-action hierarchy.
- `RELEASE_MANIFEST.json` and `sw.js`: asset revision/cache identity only if production files change.

## Acceptance gate
- Existing greenfield test suite passes.
- Syntax and UTF-8 checks pass.
- New functional UX contract test passes.
- Production manifest/service-worker revision remain consistent with changed production assets.
- No domain/runtime logic files are modified.
