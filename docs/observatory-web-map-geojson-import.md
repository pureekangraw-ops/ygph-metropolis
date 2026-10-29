# Observatory Web Map — local GeoJSON import

The Web Map accepts an owner-selected GeoJSON file and merges supported records into the current browser's local map store. No import request, map pin, or GeoJSON property is sent to a server. Cloudflare Browser can use the visible, labeled pin editor after the owner opens the map and grants Browser control; local-file selection remains an owner action.

## Supported input and limits

- A GeoJSON `FeatureCollection` containing up to 500 `Feature` records.
- Each feature must have a 2D `Point` geometry with finite WGS84 coordinates (`longitude` -180..180, `latitude` -90..90). Other geometry types, 3D coordinates, and invalid records reject the whole file.
- File size is limited to 1 MiB. Properties must be JSON-safe, at most 8 KiB per feature, 100 keys/items per collection, 2,048 characters per string, and eight levels deep. Executable or prototype-sensitive keys are rejected.
- The map holds up to 500 pins total. Import previews counts before any write. Exact duplicate IDs are skipped; an ID conflict or capacity overflow blocks the entire import. There is no partial import and no silent overwrite.
- Existing feature IDs are namespaced as `geojson:<id>`. Features without an ID receive a stable SHA-256 fingerprint based on the source feature.
- Supported properties and feature IDs are preserved on export. The editable display name is written back as `properties.name`.

## Apply and recovery

The user selects a file, chooses **Check and preview**, reviews the counts, then chooses **Import verified pins**. A file change invalidates any earlier preview. The import writes to `localStorage` only after preview approval and leaves the current data unchanged on validation, conflict, capacity, or storage failure.

Map records remain local to the current browser profile; they are not shared with Android GOVIEW or synchronized between browsers. Export/backup before moving browser profiles. Deletion remains a separate, owner-confirmed action.
