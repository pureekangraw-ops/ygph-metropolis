# GOVIEW GO Map Studio — WORK implementation

Status: source implementation in [Draft PR #245](https://github.com/pureekangraw-ops/ygph-metropolis/pull/245). These instructions document how to build/use the new system; they do **not** imply production deployment, phone acceptance or a live GO transfer.

## User workflow (new map, no old pins required)

1. Open **YGG Observatory** → **GOVIEW** → **GO Map Studio · สร้างแผนที่**.
2. Start with **GO วาดตัวอย่าง** or **แผนที่ใหม่**. Tap **＋ จุดถนน** to make junctions; select **━ เชื่อมถนน**, then two nodes to draw a road.
3. Create an area with **▱ พื้นที่** (three or more taps, then **จบรูปพื้นที่**) and place named POIs on nodes with **📍 สถานที่**. Use **✎ แก้ไข**, **⌫ ลบส่วน**, **ย้อนแก้ไข**, search and independent layer switches.
4. Select **➜ เส้นทาง**, start node, end node. The distance is derived from the GO-drawn local graph (metres), **not** straight-line distance and **not** proof that a real road exists.
5. Press **ส่งแพ็กเกจ** to export `.goview.json`. Use **นำเข้า / GO Update** to choose the package on another device: **file received ≠ map updated**. Inspect nodes/roads/POI/area diff, then explicitly approve Update.
6. **คลังแผนที่** opens an owner-drawn map saved in its own atomic file. Existing MapLibre/SQLite pin records remain separate and are not overwritten by the new Studio.

### GO-created sample

- Editable source: `examples/go-drawn-demo.source.json`
- Importable package: `examples/go-drawn-demo.goview.json`
- Build: `node tools/go-map-builder.mjs examples/go-drawn-demo.source.json my-drawing.goview.json`
- Verify: `node tools/go-map-builder.mjs --verify my-drawing.goview.json`
- Synthetic graph: **9 junction nodes, 11 roads, 1 area, 2 POIs**; A → G → H → I is **800 metres** along synthetic streets.
- Point/LineString/simple outer-ring Polygon GeoJSON is also accepted and converted to an editable graph. Lines cross **only when they share an explicit vertex**. Holes/multipolygons, true OSM road turn restrictions, offline terrain/real traffic and 3D geometries are not implemented.

## GO ↔ Cloudflare ↔ Android durable package path (optional configuration)

The private standalone source is `goview-package-bridge/worker.mjs`, with Cloudflare R2 bindings in `wrangler.goview.json`. This is **new infrastructure**, separate from the legacy PANTHEON ephemeral Snapshot. It is not deployed by this PR.

The owner/authorized operator must first review Cloudflare storage availability and any charges, provision an R2 bucket matching the configuration or change `bucket_name`, then set **two different private secrets** via a secure Cloudflare secret mechanism:

- `GO_WRITE_TOKEN`: bearer token for the GO package writer. Full read + write scope.
- `ANDROID_READ_TOKEN`: different bearer token for Android reads only.

Never paste secrets into repository files, PR comments, untrusted webpages or GO Brain. There are no fallback/dummy passwords in the Worker. If either secret or the R2 binding is missing, all routes return **NOT_CONFIGURED**.

A scoped deployment after approval can use the isolated configuration with Wrangler, for example:
```sh
npx wrangler r2 bucket create ygg-goview-packages
npx wrangler secret put GO_WRITE_TOKEN --config wrangler.goview.json
npx wrangler secret put ANDROID_READ_TOKEN --config wrangler.goview.json
npx wrangler deploy --config wrangler.goview.json
```
These commands are **instructions, not actions performed by this work**. Tokens should be random high-entropy strings and distinct. A production route/custom domain and permissions require an independent review; the Android client currently accepts the dedicated `goview.yggmetro.com` host or an HTTPS `*.workers.dev` URL chosen by the owner.

The GO writer can use:
```sh
export GOVIEW_BRIDGE_URL='https://<your-goview-package-bridge>.workers.dev'
# Securely set GOVIEW_GO_TOKEN via shell/secret manager without logging its value.
node tools/go-map-push.mjs examples/go-drawn-demo.goview.json
```
It PUTs `/v1/maps/{mapId}/packages/{version}`, then independently GETs that exact version, checks SHA-256 and reports a verified receipt. Stored versions are immutable: uploading differing bytes to an existing version returns conflict. Latest pointer updates use conditional R2 writes. The bridge does not have permission to approve Android changes.

In GO Map Studio, enter the Worker URL, the precise map ID and the **read-only** Android token, then press **ดาวน์โหลดแพ็กเกจจาก GO**. No token is stored as map data. Android downloads over HTTPS without following redirects and transfers the bounded file into the existing approval preview; it never auto-applies an update.

## Tests and actual boundaries

- Node tests validate engine hash vectors, route topology/no-route, malicious/corrupt packages, GeoJSON conversion and version diff.
- Cloudflare Worker tests exercise role separation, readback, idempotency, version conflicts, tampered data and oversized body protection against an in-memory R2 substitute. **An in-memory R2 test is not a live Cloudflare R2 proof.**
- Android unit/build/lint are checked by the existing CI; the new `GoviewStudioAndroidTest` opens real WebView assets, creates the GO example, reads back the native atomic save, recreates the Activity and validates that shared files do not update without approval. Existing Gecko/Observatory emulator regressions are separate and must be reported separately.
- Neither signing-key compatibility with the installed Xiaomi app nor the real Android document chooser/network/R2 endpoint/physical GPS has been accepted yet.
- **A CI-built APK may be signed with a temporary certificate.** Do not uninstall an installed app containing personal data or assume that an APK can install over it.
- No Cloudflare deployment, R2 provisioning, token issuance or repository merge occurs as part of this branch.
