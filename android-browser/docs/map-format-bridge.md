# Web Map ↔ GOVIEW Studio format bridge

The two maps keep separate models and stores. This bridge is an explicit, file-based conversion; it is not background sync and does not replace either map with the other's schema.

## Data models

| Map | Canonical data | GeoJSON behavior |
| --- | --- | --- |
| Observatory Web Map | Browser-local pins with `id`, `name`, WGS84 latitude/longitude, and optional JSON properties | Imports and exports a `FeatureCollection` of 2D `Point` features only. |
| GOVIEW Studio | A local graph: nodes in local metres, roads connecting node IDs, polygon areas, and POIs attached to nodes | Full export uses `Point` for POIs, `LineString` for roads, and `Polygon` for areas. Import accepts those three geometries; polygon holes and unsupported geometries are rejected. |

Studio's roads are user-drawn graph edges, not verified real-world roads. Only identical explicit vertices in imported linework are shared graph junctions; visual crossings do not create connections.

## Conversion rules

### Web Map → GOVIEW Studio

1. Export GeoJSON from Web Map and open **GOVIEW Studio → Import / GO Update** on Android.
2. The importer creates a new Studio map for the preview. Each `Point` becomes a POI attached to a node; the first coordinate is the local origin and WGS84 coordinates are converted to local metres. `LineString` features become road edges, and a closed `Polygon` outer ring becomes an area.
3. The current Studio model keeps the feature name and coordinates, but regenerates Studio IDs and does not retain arbitrary GeoJSON properties. Review the diff and approve explicitly. Existing Studio maps and native GOVIEW pins are not overwritten by this import.

### GOVIEW Studio → Web Map

Use **ส่งเฉพาะจุด (Web Map)** to export only Studio POIs as 2D `Point` features. Each point carries the POI name and coordinates; roads, areas, and graph connections are intentionally omitted because Web Map accepts points only. Import that file in Web Map, review its duplicate/conflict/capacity preview, then apply. Its merge is additive: exact duplicates are skipped, and conflicts or capacity overflow prevent partial writes.

The existing **ส่ง GeoJSON** full export remains available for interchange with GIS/Studio tools that support roads and areas. It is not a Web Map import file when it contains `LineString` or `Polygon` features.

## AI transfer boundary

The typed GOVIEW transfer keeps selected GeoJSON pin snapshots (`goview.map-update`) separate from Studio graph packages (`goview.map.package.v1`). It does not implicitly convert either type or grant an AI write to the owner's local map. Any file import remains preview-first and local owner approval remains required. See [`goview-transfer-contract-v1.md`](../../docs/reviews/goview-transfer-contract-v1.md).