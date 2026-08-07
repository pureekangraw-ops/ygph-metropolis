# METROPOLIS 4.1 Minimal Launcher

## Scope

Apply the approved launcher cleanup without changing the data schema, money logic, Calendar logic, vault, or import behavior.

## UI

- Product version shown to the user becomes `METROPOLIS v4.1.0`.
- Remove the long hero explanation under “เลือกแอปที่ต้องใช้”.
- Remove the launcher section note under “แอปของบิ๊ก”.
- Remove per-app descriptive taglines and bottom explanatory status copy from launcher cards.
- Keep app name, primary value label/value, and whole-card click target.
- Keep the redundant top-right arrow hidden.

## Icons

Use four simple monochrome SVG marks with fewer details and heavier strokes:

- STORE: storefront
- RIDE: simplified scooter
- LEDGER: ledger/book with entries
- CALENDAR: calendar grid

Each launcher icon tile uses the app identity color as the tile background and white icon strokes for high contrast.

## Delivery

Add a small `metropolis-r5-1.js/css` layer after the existing R5 layer, keep Schema 4 unchanged, and advance the Service Worker cache release to `v4.1.0-20260807-r5-minimal` so installed mobile clients can receive the new assets.
