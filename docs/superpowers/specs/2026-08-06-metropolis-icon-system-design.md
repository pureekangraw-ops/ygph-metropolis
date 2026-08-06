# YGPH Metropolis Icon System

## Approved direction

The icon system combines two approved parts from the concept board:

- Primary app icon: the route/network symbol from concept row three.
- In-app icons: the Store, Ride, Ledger, and Calendar set from concept row two.
- Color treatment for every icon: the desaturated steel-blue and off-white treatment from concept row two.

The result must read as a practical city utility, not a religion, denomination,
crest, faction, or fantasy system.

## Visual contract

- Steel blue: `#60758C`
- Dark steel: `#465B71`
- Off-white glyph: `#F7F5EF`
- Rounded square containers with one consistent corner radius and visual weight.
- Flat, vector-friendly geometry with no gold, jewel colors, aura, gradients,
  shields, runes, sigils, mandalas, sacred geometry, or four competing colors.
- No text or letters inside the marks.

## Primary app icon

The primary mark is a rounded route diagram with connected circular nodes. It
must have a strong silhouette at launcher size and preserve at least 14% safe
margin on every edge for maskable Android icons.

Production outputs:

- `assets/app-icon.svg` — canonical editable source.
- `icon-192.png` — PWA and browser icon.
- `icon-512.png` — install and maskable icon.

The header brand mark reuses the same route symbol so the installed icon and the
running app share one identity.

## In-app icons

The four app icons remain the approved row-two subjects:

- Store: compact storefront with awning.
- Ride: scooter with a short route trail.
- Ledger: bound ledger/notebook with list marks.
- Calendar: calendar grid with two top rings.

They use the existing `FLOW_ICONS` rendering path so home cards, current-app
identity, and bottom navigation stay consistent. Emoji remain fallback-only.

## Scope boundary

This change modifies icon artwork and icon containers only. It does not recolor
the full interface, change layout, change business logic, touch IndexedDB or the
encrypted vault, or alter the Store/Ride/Ledger/Calendar data contracts.

## Verification

- Source tests assert the primary mark and all four functional icons are wired.
- Generated PNGs must be exactly 192×192 and 512×512 and match the manifest.
- The PWA shell must cache the final icon files.
- Full regression, syntax, UTF-8, checksum, and live Cloudflare asset checks must pass.
