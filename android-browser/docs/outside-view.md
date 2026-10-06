# Observatory Outside View

Outside View is a private, local-only map surface beside Inside View.

- Zone, Grid and Pin are separate typed records.
- Exact Pins require current coordinate evidence; approximate GPS cannot create them.
- Grid identity is `grid:epsg4326:` plus SHA-256 of canonical `[zoneId,west,south,east,north]` numeric JSON.
- Journal commits use same-filesystem atomic replacement and retain pending renderer work across restart.
- A command is `APPLIED` only after a foreground renderer confirmation matches command ID, revision, style generation and token.
- PMTiles are imported into private app storage and require attribution; there is no network map fallback.
- Live intake and routing are disabled. Navigation is a best-effort `HANDOFF_STARTED` to an installed handler and never claims arrival.
- The bundled command fixture is `TEST` data only and is unavailable to release code.

The current renderer is a native Android surface with a MapLibre-compatible renderer boundary. A licensed PMTiles adapter can be attached behind `MapRenderer` without changing the command or receipt contract.
