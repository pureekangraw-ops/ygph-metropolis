# GOVIEW continuous B2E verification

Base: merged `ee140956e1fa06615015fa05623502aa22a7356f` from PR241. Post-merge Android run39921109131 passed the existing build and emulator jobs. This follow-up adds tests only; signing is deferred, application identity and production code remain unchanged. No physical phone or owner data is used.

## One continuous chain, two app processes

`GoviewB2EChainTest` is selected explicitly by `scripts/goview-b2e-emulator.sh`. Ordinary instrumentation marks this host-driven test skipped; the script runs its before/after phases separately and checks each JUnit result. The host refuses targets without the emulator property and does not uninstall or clear app storage. It uses the ephemeral CI emulator's test APKs only.

Before restart: seed an unrelated synthetic pin/note, import39 synthetic points through the app importer, prove file reception has not yet changed pins, recreate the Activity while preview is unapproved and prove no pin mutation, reimport and click owner Update approval, wait for matching durable/rendered revision and query all39 IDs in the actual rendered pin layer after explicit recenter, search the target through actual UI, edit its name/coordinates/category, explicitly check field confirmation, save, verify original unrelated records, recreate the Activity, verify the edited point, start the GPS session from its dialog, stop using its notification, and record a synthetic checkpoint and process ID.

The host then force-stops the app and verifies its process has stopped. After restart, the next instrumentation must have a different PID and the same saved data/revision. It exports/reimports through the actual storage codec, checks exact duplicate handling and independent SQLite readback (imported field authority remains UNKNOWN), captures one explicitly selected Snapshot, verifies shipping Upload/Download adapters remain BLOCKED, imports a capture/base-bound local proposal through preview and UI approval, creates a backup through UI, edits the point, explicitly approves restore and checks saved map state, receipt readback and rollback backup.

The existing suite remains alongside the chain: conflicting/duplicate inputs, malformed/resource-limited imports, stale approval/render receipts, concurrent old/new store writes, delayed parsing during recreation, interrupted migration/write/recovery, corrupt/large/multibyte databases, lost initialized storage, provenance/export regressions and GPS session ownership.

## Evidence boundaries

- Android execution of this new chain is PENDING until its exact-head CI finishes. Local host-driver tests prove orchestration guards only.
- File URI injection exercises the app import entry and approval UI, not the platform document picker.
- Export and Snapshot codec/readback are storage API assertions. They do not prove document-picker output or live GO transfer.
- Render checks combine the existing acknowledgement/revision contract with actual viewport feature queries, including explicit focus after edit/restart. A negative control deliberately moves away: the old revision-only predicate passes while imported visible IDs are empty, then UI focus must restore the exact target ID. This test does not claim visual basemap/road coverage. It begins with an explicit offline style for synthetic UI determinism.
- Activity recreation is tested before a separate real app-process stop/restart; these are distinct checks.
- GPS checks prove owner start/notification stop controls only. They neither fabricate a location fix nor prove Xiaomi background/battery behavior.
- Snapshot, local file reception, Update approval/commit/readback, and Storage restore have separate receipts. Upload/Download transport remains BLOCKED; no simulated production receipt is used.
- All committed fixtures are synthetic. The private39-pin file is excluded. No signing key, credential, production endpoint or package identity is changed.

## Short handset sequence, after installation compatibility is resolved

1. Open GOVIEW, inspect build SHA, pan/zoom/search; deny GPS once, then explicitly grant it and inspect actual time/accuracy.
2. Import a synthetic file: inspect preview, cancel once, then approve; confirm its separate Download/Update receipt and pins.
3. Search/edit a test pin, explicitly confirm a changed coordinate, rotate, close and reopen the app; verify the same pin/data.
4. Export only selected data and reimport; verify duplicate handling. Create a backup, edit the test pin, preview/approve restore and read its Storage receipt.
5. Start GPS continuation explicitly, background/return, then Stop via notification. Observe actual Xiaomi behavior; do not infer it from CI.
6. For GO, choose a specific Snapshot/file manually. A returned proposal must bind its Capture ID/baseVersion and receive owner approval. Do not label the unavailable live durable transport or the full physical B2E chain passed before observing it.

Never uninstall or clear existing owner data to bypass signing incompatibility. Stable signing remains deferred by the owner.
