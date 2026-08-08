# METROPOLIS 4.2.2 Home Dashboard Authority Design

## Goal

Make the approved Home/Dashboard, Calendar status, cancelled visibility, and visible release-version rules authoritative instead of relying on late DOM cleanup.

## Owner-approved behavior

- Home removes the `FOUR APPS · ONE FLOW` hero area and uses that position for the Dashboard.
- Dashboard order is purple → green → yellow → red.
  - Purple: current cash.
  - Green: current stock quantity.
  - Yellow: count of overdue unfinished work.
  - Red: unpaid outgoing amount and item count.
- Calendar and the list under it use one status signal: green = completed/paid, yellow = waiting, red = overdue.
- `CANCELLED` is excluded before live rendering and counting. Durable records remain untouched for audit/history.
- Aggregate “all items” lists include open/partial/completed records but exclude cancelled records.
- Selecting a Calendar date makes the list below reflect only that date.
- A production UI change advances the visible product version. This corrective release is `4.2.2`; its service-worker generation must advance with it.
- Restore/import safety semantics remain unchanged in this corrective pass; no schema, vault, encryption, transaction, or durable-history mutation is introduced.

## Architecture

Keep the existing R5 runtime chain, but move correction to data and ownership boundaries:

1. `metropolis-r5-3.js` becomes the live-visibility/status adapter. It presents temporary live-only source/calendar collections to existing renderers before they render, while restoring durable arrays immediately afterward. It also paints the Calendar list status pill from the same three-color signal used by the month grid.
2. `metropolis-r5-4.js` owns Home Dashboard composition and visible product version. It removes the old hero node, inserts Dashboard in that slot, displays outgoing unpaid amount plus count, and overrides the older 4.2 version writer so one visible version wins.
3. `metropolis-r5-4.css` contains Dashboard presentation only; the visible version is written by JavaScript rather than CSS pseudo-content.
4. Release metadata and Service Worker cache generation advance to 4.2.2/r11.

## Data safety

No durable array is filtered or deleted. Live-only rendering uses temporary array substitution in `try/finally`, so the original encrypted state is restored before control returns. `CANCELLED` remains available to durable audit/history mechanisms.

## Tests

Regression tests must fail if:

- the old Home hero remains after Dashboard composition;
- Dashboard red metric lacks unpaid amount or includes cancelled/completed/source-cancelled queues;
- Calendar status pills can retain a non-green/yellow/red semantic color;
- live list renderers receive cancelled records;
- the visible version can fall back to 4.2.0/4.2.1;
- service-worker release generation does not advance with 4.2.2.
