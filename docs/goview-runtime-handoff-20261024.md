# GOVIEW runtime and Android handoff checkpoint

Canonical integrated source: PR246 `go/observatory-shared-browser-20261024`, based on PR245 `01e45f62e11230a674734a93233f52a07118da9d`. Browser/Brain pair before this map correction: `f6a4b3af1f5ba9c9a7ddee0e82a18ab3982de480` / Go-Together PR13 `e60e2624f681e174ca15bd189aed99d9e116269a`. No Gecko diagnostics are part of this work.

## Runtime facts and approval boundary

Read-only Cloudflare account inventory on 2026-10-24 returned the `observatory-shared-browser` Worker, but neither Worker `goview-package-bridge` nor R2 bucket `ygg-goview-packages`. Browser RPC availability is separate from durable map transfer. Parent observed browser CONNECTED/LOCKED/OWNER_INVITATION_REQUIRED; no live invited session or handset pass is claimed here.

Existing deployment configuration is `wrangler.goview.json`; implementation is `goview-package-bridge/worker.mjs`. Activation remains BLOCKED pending specific owner approval for each of:

1. Create private Standard R2 bucket `ygg-goview-packages`, no public access or reuse of other products' buckets.
2. Configure separate `GO_WRITE_TOKEN` and `ANDROID_READ_TOKEN` for this Worker through an approved secure process. Do not copy browser owner credentials or Brain OAuth credentials. No secrets embedded in APK, source, logs or map packages.
3. Deploy the reviewed exact Worker source with only its `PACKAGES` R2 binding. No existing Worker replacement, domain change or permission expansion.
4. Approved synthetic package upload, immutable-version GET readback, Android download/preview, explicit update approval and filesystem readback. Obtain separate permission before any private owner map transmission.

Do not run deployment or provisioning commands merely because this checklist exists. Stop/revoke access if validation fails; preserve immutable objects and local backups instead of deleting them as rollback.

Cost review before activation: R2 charges storage and Class A/B operations beyond included allowances; Worker requests/CPU and account plan also matter. Free allowances are not a zero-cost guarantee and may be shared with existing workloads. Bound initial synthetic acceptance to one small package and explicit manual reads; no polling, lifecycle deletion or automatic GPS/history upload. Check current account usage/plan and approve a ceiling before activation. Official pricing: https://developers.cloudflare.com/r2/pricing/ and https://developers.cloudflare.com/workers/platform/pricing/ (read 2026-10-24).

## Local update correction

Same-version differing packages and stale versions now reject in the UI and native destination store. Native comparison checks the actual destination even when another map is displayed. All Activity instances share the transaction lock. Before a newer version replaces a stored package, the exact prior bytes are retained as `<mapId>.v<version>.backup.json` and read back. Existing conflicting backup or corrupt destination fails closed. These backups are retained, not automatically pruned. Legacy GOVIEW SQLite pins, field evidence and migration/recovery remain separate and untouched.

Download validates identity, version header and SHA-256 byte digest, then the JS engine validates package checksum before preview. A DOWNLOAD VERIFIED receipt is not an UPDATE receipt; only native file readback can display saved success. Network transport is not exercised against production. Native failure after commit retains uncertain-save wording and does not automatically replay.

Limitations: Studio packages are schematic road graphs, not lossless replacements for legacy field-provenance GeoJSON. Keep field-confirmed records in the existing map store; do not relabel imported text as field verification. Preview reads the actual destination, and approval binds its exact bytes; a concurrent change rejects with PREVIEW_BASE_CHANGED. Durable correlated receipt history still needs further acceptance review before claiming complete GO transport B2E. Version backups are file recovery inputs, not a claim that corrupt-primary interactive recovery has been tested in Studio.

## APK compatibility and owner steps

The canonical CI already builds an ARM64 parallel preview with application ID `com.big.gobrowser.preview`, versionCode16 / versionName `0.7.0-preview-side-by-side`, minSDK26, targetSDK36. It launches `RemoteBrowserActivity` with Browser and GOVIEW entry points. Original package `com.big.gobrowser` is preserved. The preview has separate app storage and does NOT automatically inherit old maps or credentials. An installed app showing only maps may be the older package: inspect its About/build source rather than assume an invite UI exists there.

The ARM64 signer is ephemeral per CI run; a later preview may not upgrade an earlier preview. Do not uninstall either installed package or clear data to work around a signature mismatch. Stable signing remains deferred. Verify installed package/version/certificate before installation. Universal debug output uses the original package ID and must not be offered as a safe in-place upgrade without matching signer evidence.

After an approved compatible installation: keep originals; export only selected map data to an owner-selected file, import a copy into preview, inspect map ID/version/diff, approve, verify receipt and restart. Test Browser invitation separately with parent. Test actual Xiaomi GPS deny/grant, start/stop notification and battery behavior. CI emulator uses API35, not physical Android16 acceptance. Do not automatically export current GPS or history.
