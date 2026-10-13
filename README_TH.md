# Observatory — Repository Scope and Build Boundaries

**Repository:** `pureekangraw-ops/ygph-metropolis`

## Repository owner: Observatory

This repository owns the Observatory client and its observation surface, including the GeckoView browser, Outside View/map, renderer, journal, evidence validation, and Observatory-local state.

### Metropolis integration boundary

- Metropolis remains the Work identity, lifecycle, and access-authority boundary. Authenticate GO and resolve the Work plus allowed `READ` before dispatching an Observatory operation.
- Observatory consumes only the authorized projection needed for the operation. It must not create a duplicate Work registry, decide Work lifecycle, or infer business completion from an observation or transport receipt.
- Do not forward a raw GO bearer token into Observatory or invent a second identity, route, or authority there. Keep observation evidence distinct from authority and owner-system readback.
- These are ownership boundaries, not proof that a live end-to-end integration or production release has passed. Record the actual source, `observedAt`, receipt, and readback for each acceptance claim.

## Validation and release boundaries

- `.github/workflows/android-browser.yml` validates the Observatory browser client, runs unit/emulator checks, and uploads a debug CI APK. Passing CI is not physical-device acceptance, live Hub readback, or production release approval.
- `.github/workflows/prism-owner-build.yml` is a separate PRISM owner-test APK route; it does not define Observatory ownership or release state.
- `RELEASE_MANIFEST.json` and `scripts/stage-lighthouse-next-bundle.mjs` describe a separate LIGHTHOUSE_NEXT build contract. They are not Observatory release metadata and are intentionally not changed by this scope clarification.
- This README does not claim an Observatory production release route. Keep signed packaging, device acceptance, and owner approval explicit until their current contract is verified.

## PRISM — Single Android Owner-Build Route

This section documents only the separate PRISM owner-build workflow; it is not the Observatory browser build or release route.

`.github/workflows/prism-owner-build.yml` is the single workflow for checking and building a signed PRISM owner-test APK:

1. Checkout the exact PR/event SHA and verify it.
2. Check syntax, repository contracts, and PRISM native contracts.
3. Check Android shell contracts.
4. Stage PRISM with `scripts/stage-prism-native.mjs` and reject a legacy parent.
5. Generate Android, apply version/icon/map/password/browser/security, and verify the merged manifest.
6. Build and sign with the canonical PRISM signer.
7. Verify final APK package/version/signer, hash, and source provenance.
8. Upload `prism-release.apk` with identity/security evidence and the IP notice.

The PRISM workflow does not publish a debug or unsigned APK as its owner-test artifact. The separate Observatory Android Browser workflow does upload a debug CI artifact, which is not a production release. The PRISM workflow does not invoke the LIGHTHOUSE_NEXT builder or updater route. The unsigned APK during signing is a temporary file within the same job.

The workflow runs for relevant pull requests, pushes to `main`, and manual dispatch. It uses the event SHA rather than a branch tip that may move.

## ตรวจในเครื่อง

```bash
npm run prism:gate
npm --prefix android-shell install --no-audit --no-fund
npm --prefix android-shell test
```

Legacy source and some regression tests remain in the repository, but they are not the PRISM build/deploy path. The LIGHTHOUSE packager rejects its old CLI invocation. Removing a workflow does not remove or change a previously deployed Worker.

## PRISM owner-test acceptance

Passing PRISM CI proves the signed APK build and its identity/provenance only. It does not prove physical-device acceptance. The real-device acceptance still requires: install-over owner.20, password setup/unlock, Browser launch, Factory Eye boot/pair, inactive watch observation, and GO Hub readback. Before install-over, read back the baseline package/version/signer.
