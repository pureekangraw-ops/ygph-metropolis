# LIGHTHOUSE Android Shell

Android hybrid shell plus the first local-first Manual Patch foundation for LIGHTHOUSE.

## Build

GitHub Actions workflow: `LIGHTHOUSE APK Debug`

The workflow generates the native Android project from Capacitor configuration, runs `assembleDebug`, and uploads the artifact named `lighthouse-debug-apk`.

The ZIP artifact contains `app-debug.apk`, which can be downloaded from the successful workflow run and installed on an Android device that permits installation from that source.

## Manual Patch

The base APK can stay installed while selected web-layer assets are updated with a signed `.lhpatch` file. Patchable logical assets are `ui.html`, `ui.css`, `logic.mjs`, `rules.json`, and `vocabulary.json`. A patch only needs to contain the files that changed; LIGHTHOUSE materializes a complete snapshot by overlaying those files on the currently active snapshot.

The manual flow is:

1. Install the base APK once.
2. Produce a `.lhpatch` for the current active version.
3. In the app, choose the file with the **Patch** picker.
4. LIGHTHOUSE checks the schema and version, each file's SHA-256, and the ECDSA P-256/SHA-256 signature.
5. The complete candidate snapshot is staged in IndexedDB and read back before activation.
6. `currentVersion` and `previousVersion` are switched atomically, then the active snapshot is read back again before it is reported as active.
7. Use **Rollback** to atomically return to the previous complete snapshot if needed.

Rejected, stale, oversized, tampered, unsigned, or untrusted patches do not activate. If activation or mounting fails after a pointer change, the runtime attempts to roll back to the previous snapshot. Patch activation does not edit user data.

A benign signed proof is committed at `test/fixtures/sample-update.lhpatch`. It updates only `ui.html` from `0.0.1` to `0.0.2` and displays `LIGHTHOUSE Patch Proof 0.0.2`.

## Signing a patch

Create an input JSON shaped like `test/fixtures/sample-update-input.json`, then run:

```sh
npm run patch:sign -- <input-json> <private-key.pem> <output.lhpatch>
```

The signing tool computes the file hashes and signs the canonical patch metadata. The APK contains only the pinned debug public key at `www/patch/trusted-key.json`; the private key is never committed to the repo. Keep the debug private key outside source control. A future release/store key requires separate key custody and release policy.

## Boundary

This slice is manual and local/offline. Automatic patch download is out of scope for this phase, as are remote deployment and store publishing.

Any native change requires a new APK, including GPS/location work, Android permissions, Capacitor/native plugins, Android Manifest changes, or other native configuration. The manual `.lhpatch` path is only for the explicitly allowlisted web-layer assets.

Dynamic code distribution/store policy must be reviewed separately before any Play Store release. This proof does not claim store eligibility.
