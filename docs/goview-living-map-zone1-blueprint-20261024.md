# GOVIEW Living Map — Zone 1 source-grounded blueprint (2026-10-24)

## Goal
GOVIEW inside the existing Observatory Android app becomes an owner-controlled **living, real-world map**. BIG sees current GPS, nearby places and route plans. GO may propose and revise map pins, zones, closures and shortcuts through a controlled, versioned overlay. GO Map Studio remains a separate local design tool and future standalone product; do not overwrite or replace it.

## Verified baseline in `main`
| Capability | Existing source | Status |
| --- | --- | --- |
| Native map renderer | `MapLibreOutsideRenderer.kt`, MapLibre 13.6.1 in `app/build.gradle.kts` | Implemented |
| Real map background | `MapStyleFactory.kt` OSM raster fallback, optional PMTiles | Implemented; not a full places/routing service |
| Foreground GPS | `ForegroundLocationController`, `OutsideViewActivity.requestMyLocation()` | Implemented, owner-initiated |
| Owner-started ongoing GPS | `GoviewLocationService.kt` | Implemented, latest fix only in RAM; no automatic remote transfer |
| Map pins, zones, grids, overlay, command receipts | `MapModels.kt`, `MapCommandCodec.kt`, `MapCommandExecutor.kt`, `MapStateStore.kt` | Implemented locally |
| GO remote map commands | `ExecutionScope.LIVE_DISABLED` and `MapAction.ROUTE` validation returns `route disabled` | Not live-ready |
| GO Map Studio | `GoviewStudioActivity.kt`, bundled `goview-studio/index.html`, `engine.js` | Existing separate offline design surface |
| GO package transport | `goview-package-bridge` and GO-Together `goview-direct.mjs` (separate repos) | Existing transport components; full app command-to-map readback not established |
| Nearby place search / provider-backed routing / live traffic | No verified provider integration in inspected baseline | Gap |

## Architecture
1. **Android owner location:** permission-bound GPS remains device-owned; no automatic cloud upload. On a user request, create a bounded, expiring location context with accuracy, timestamp, consent scope, and optional coarse-location choice. Revoke/expire it when the session ends.
2. **Base map:** reuse MapLibre and OSM/PMTiles, preserve attribution and offline behavior. Evaluate licensed tile providers and capacity before selecting Mapbox services. Do not use bulk tile scraping from public OSM infrastructure.
3. **Provider adapters:** `PlacesProvider` (search nearby, search text, IDs, coordinates, hours where licensed) and `RoutingProvider` (walking/driving options, ETA/traffic only when provider supplies it). Provider selection remains replaceable and should use sourced coordinates, not image-derived approximations.
4. **Owner Knowledge Layer:** separate overlays for owner pins, corrected places, restricted/closed roads, shortcut suggestions and custom zones. Every feature carries source, observed time, confidence, expiry, version and owner approval state. Do not rewrite provider base-map data or promote owner observations to public truth automatically.
5. **GO command adapter:** use existing map command/receipt model and Cloudflare bridge. Support bounded proposed operations: `pin.propose`, `pin.move.propose`, `zone.highlight`, `road.closure.propose`, `shortcut.propose`, `route.plan`. These are *planning names*, not currently advertised live tool names. The app validates commands, presents the change, applies with explicit owner authority, persists atomically and sends a durable receipt. No unrestricted remote map mutation.
6. **Routing overlay:** a visual closure marker alone does not change route results. If routing provider cannot accept avoid areas/road restrictions, show a warning and do not claim a safe recalculated route. A suggested shortcut is not usable routing geometry until access and connectivity are confirmed.

## Minimal build sequence (WORK, not a separate TEST gate)
- **W1** Make GOVIEW primary map entry surface obvious, keep Studio separate; retain current MapLibre and GPS functionality.
- **W2** Implement `PlacesProvider` interface and owner-visible search/nearby results with attribution; first provider selection based on coverage, cost, rate limits and licensing.
- **W3** Implement `RoutingProvider` interface, route polyline/ETA display and clear stale/unavailable status.
- **W4** Add Knowledge Layer provenance/versioned proposals and rollback using existing local map journal.
- **W5** Connect GO commands and receipts end-to-end via existing GO/Cloudflare path; remove manual Worker URL/Map ID/Token entry from the everyday map screen, retain credentials in settings.
- **W6** Optional traffic, richer layers, offline tiles and user-authorized live-trip mode after the base use case works.

## Product and permission boundaries
- GOVIEW = real-world location + places + routing + GO-assisted owner overlay.
- GO Map Design Studio = geometry editing and design, not verified navigation.
- Transport Hub v2 is separately planned; do not block GOVIEW WORK waiting for a new hub.
- Never share continuous GPS with GO by default; only owner-approved, scoped sessions.
- Do not erase installed maps, change Android package/signing identity or rewrite existing owner storage.
- Source-only baseline inspection does not prove on-device map provider coverage or GO live update.

## Decisions still requiring provider evidence
- Place data coverage for Bangkok/Ram Inthra and terms for storing/caching results.
- Routing modes, traffic coverage, rate limits and price of shortlisted providers.
- Exact source of authoritative road closures vs owner-submitted temporary notes.
- Whether owner chooses one-shot location or active trip sharing per task.
