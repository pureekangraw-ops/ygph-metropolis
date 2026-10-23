# GOVIEW handset acceptance — pending actual Android evidence

Target: BIG's Xiaomi 15T, Android16. CI/emulator success is not Device PASS. No phone was connected or changed during development.

## Preserve the installed app first

The candidate retains app ID `com.big.gobrowser`. Existing CI ARM64 artifacts use an ephemeral test signer; upgrade compatibility with BIG's installed app is UNKNOWN. Compare signing certificates before installing over it. Do not uninstall, clear storage or replace credentials to overcome an incompatible signature. The existing app/data must remain intact.

If signing differs, the safe proposed alternative is a separate test variant `com.big.gobrowser.goviewtest` with a visible test label. Tradeoff: it would preserve the installed app completely but start with separate storage/permissions and would not prove in-place migration of the original installation. This proposal has NOT been implemented; decide that identity before changing the build. No installation is performed here.

## Local acceptance after compatible test installation is authorized

1. Confirm the app's visible source SHA matches the reviewed artifact. Open GOVIEW; pan/zoom, inspect basemap availability and layer toggles. Without PMTiles the existing map uses online tiles; no offline roads are claimed without a package.
2. Deny location permission first: verify a clear denied state and working manual pin/file tools. Then grant approximate/precise location as desired. Record actual fix time/accuracy; verify stale and provider-disabled states. GPS on this phone stays UNKNOWN until observed.
3. Import the private 39-point file through the file picker. Confirm local file reception does not yet add pins. Review IDs/coordinates, package/base version, counts and provenance. Cancel once and verify no pin mutation; then reopen and explicitly approve Update. View its separate receipt/readback. Opt in separately if moving the viewport to imported points is desired; existing online tiles can reveal the viewed area to the tile provider.
4. Verify all39 source IDs remain distinct, including the two co-located records. Reimport: no duplicate pins or overwrites. Source field-confirmation labels are claims, not proof all39 stations exist. Do not post the private file or screenshots publicly.
5. Add/edit/category/delete a synthetic pin. Existing field confirmation must not carry to changed coordinates without fresh explicit confirmation. Restart and rotate during a synthetic import/approval; verify persistence and visible current data.
6. Create a local backup. Change a synthetic pin, preview and approve restore; verify a rollback backup and separate Storage receipt. Corrupt-primary recovery is validated only on synthetic CI copies—do NOT corrupt actual phone data for testing.
7. Select only intended pins for Snapshot; no pins are preselected. Review the explicit names/coordinates. Save the selected file and check Capture ID/version/capture receipt. It must omit raw GPS, viewport, travel history, original properties/notes and unrelated pins. This is local file output, NOT Upload success.
8. For a manual GO exchange, explicitly choose the saved file to share. GO can prepare a `propose-update` envelope with its sourceCaptureId and baseVersion. Choose the returned file in GOVIEW, preview, approve and compare the Update receipt/readback after restart. A downloaded file alone is NOT Update success. Live durable bridge delivery remains BLOCKED until its deployed contract and transmission authority are verified.
9. Start GPS continuation while GOVIEW is visible, after location and notification consent. Check the persistent notification and Stop action. Switch apps/lock the screen, return and record actual fix age/accuracy and battery behavior. Stop via notification and in-app control; verify the session stops and latest in-memory fix clears. Swipe away/force-stop and reboot must not auto-start it. No voice routing or indefinite Xiaomi background survival is claimed.

Record each phase separately: source SHA, device/Android version, time, action, observed result, receipt ID/correlation/version, restart readback and VERIFIED/PENDING/BLOCKED. Keep precise locations private. Failure or cancellation must not become a success label.
