# Greenfield Calendar Month View — Design

**Date:** 2026-08-13
**Owner:** BIG
**Repository:** `pureekangraw-ops/ygph-metropolis`
**Branch:** `productization/calendar-month-view`

## Goal

Make the Greenfield Calendar usable as a real calendar again without restoring or copying the old Pocket UI. The current Greenfield screen is a flat queue list; the approved behavior is a month grid where the user can see which dates have work and tap a date to see that date's queue.

## Root Cause

The Greenfield hard-cut intentionally rebuilt the UI as a minimal engineering surface. `index.html` contains only a `CALENDAR` page header plus `#calendarList`, and `ui/app.mjs` renders all Calendar records through the same generic list renderer used by other domains. No month-grid model or selected-date state was ported into Greenfield. The data itself already carries `dueDate` for actionable Calendar records, so this is a presentation/model gap, not a database or Evidence problem.

## Approaches Considered

1. **Restore the legacy Pocket Calendar code.** Fast visually, but rejected because it reintroduces legacy coupling and would make Greenfield depend on old UI assumptions.
2. **Build a Greenfield-native month model and renderer.** Chosen. Small pure helpers derive month cells and date-filtered records from current Greenfield state; the UI remains independent of persistence and runtime internals.
3. **Add a third-party calendar library.** Rejected as unnecessary dependency/attack surface for an offline CSP-restricted app.

## Approved UX

- Opening `CALENDAR` shows the current month grid immediately.
- Week columns are Sunday through Saturday.
- Previous/next month controls change only the displayed month.
- Dates with Calendar records show a compact count indicator.
- Tapping a date selects it and shows only that date's records below the grid.
- A clear action returns to the all-records list.
- Existing payment / complete / cancel actions remain available in the filtered list.
- This is a new Greenfield visual treatment; it must not imitate the old Pocket screen.

## Data Rules

- Calendar source remains `state.domains.CALENDAR.records`; no persistence/schema change.
- A record belongs to a calendar day only when `dueDate` is a valid `YYYY-MM-DD` date.
- Records without a valid `dueDate` remain accessible in the unfiltered all-records list but do not create a date marker.
- Day indicators count records for that due date; selected-day list preserves existing status/action behavior.
- Month calculations are pure and local-time UI concerns; stored dates remain unchanged strings.

## Components

### `ui/ui-model.mjs`
Add pure helpers for:
- valid date normalization,
- month cell generation,
- grouping/counting Calendar records by due date,
- filtering records for a selected date,
- Thai month label formatting.

### `index.html`
Replace the flat-only Calendar shell with:
- month header + previous/next buttons,
- weekday header,
- month grid,
- selected-day summary / clear filter,
- existing Calendar list container below.

### `ui/app.mjs`
Maintain ephemeral UI state only:
- displayed month,
- selected date.

Rendering reads current Greenfield state and uses the pure model helpers. No runtime method or durable state is added for navigation/filtering.

### `styles.css`
Add responsive month-grid styling consistent with Greenfield's own dark visual system. Mobile cells must remain tappable and readable without horizontal scrolling.

## Error / Edge Handling

- Invalid or missing `dueDate`: ignored by month markers, still shown under “all”.
- Month navigation across year boundaries must work deterministically.
- Selecting a date with no records shows an explicit empty state rather than falling back to all records.
- Runtime mutations refresh the current selected date/month without resetting navigation.

## Verification

Use TDD before production code:
1. Add failing tests for month boundaries, leap/day counts, date grouping, and selected-date filtering.
2. Implement minimal pure model helpers until those tests pass.
3. Add UI contract assertions that Calendar contains a month grid and controls rather than only a flat list.
4. Run the complete Greenfield deploy gate; no schema/runtime/persistence tests may regress.

## Non-Goals for This Slice

- No Evidence re-import.
- No IndexedDB/Vault/schema changes.
- No legacy Pocket code restoration.
- No full STORE/LEDGER visual redesign in the same change.
- No release metadata cleanup unrelated to Calendar.

This slice restores Calendar usability first. Broader Productization can follow as separate bounded passes once this interaction is verified on the owner's device.
