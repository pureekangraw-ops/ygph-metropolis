# METROPOLIS Greenfield Preview Implementation Plan

> **For agentic workers:** use TDD and verification-before-completion.

**Goal:** Prove a browser-facing METROPOLIS surface can operate only through the Greenfield runtime facade, with no legacy FLOW/r5/maintenance/remaster/RIDE runtime dependencies.

**Architecture:** The preview lives under `greenfield-preview/` and imports only `../greenfield/runtime.mjs`. One clean stylesheet owns presentation. UI actions express owner-visible intents; the runtime owns business rules, locking, encryption, durable commit/readback, projections, and backup. A preview-scoped service worker caches only preview + Greenfield assets.

**Locked rules:**
- No RIDE UI/runtime.
- No legacy runtime scripts or legacy database references.
- Calendar remains Action Hub, not cash owner.
- First initialization requires owner Evidence package rev28 or a verified Greenfield encrypted backup.
- Preview remains source-only in this phase; legacy Production `.assetsignore` remains exact until the Hard Cut changes manifest, allowlist, root assets, and tests together.
- Root Production UI remains unchanged until Owner Final Gate.

### Tasks
- [x] Write RED static/UI-model tests before preview files exist.
- [x] Build clean preview shell, single stylesheet, UI model, app adapter, manifest, and scoped service worker.
- [x] Prove `app.mjs` imports only the runtime facade.
- [x] Preserve legacy Production publication contract during preview validation.
- [x] Run local preview contract: 5/5 PASS.
- [ ] Run repository PR Gate; Production deploy must remain skipped.
