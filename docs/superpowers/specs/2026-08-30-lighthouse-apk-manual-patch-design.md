# LIGHTHOUSE APK Manual Patch Foundation — Design

## Status

Owner-approved continuation from APK Foundation PR #85. This slice starts from accepted PR #85 HEAD `38e8534592c372d887e6c2de723b2ee752183f76` and is implemented on a separate branch so the exact-head ACCEPT on PR #85 is not invalidated.

## Goal

Keep the base LIGHTHOUSE APK installed while allowing trusted **web-layer patches** to update selected app assets without rebuilding/reinstalling the APK. The first slice is **manual file import only** and remains local-first/offline.

## Scope

Supported patchable logical assets:

- `ui.html`
- `ui.css`
- `logic.mjs`
- `rules.json`
- `vocabulary.json`

These cover UI, HTML/CSS/JavaScript logic, processing rules, and vocabulary. A patch may contain only the files that changed; activation materializes a complete snapshot by overlaying those changes on the current snapshot/base assets.

Out of scope for this slice:

- automatic/network patch download
- remote deploy
- GPS/location/maps
- Android permissions
- Capacitor/native plugin changes
- Android Manifest changes
- release/store publishing
- changing user data as part of patch activation

Any native-layer change still requires a new APK.

## Patch bundle contract

Manual patch files use the `.lhpatch` extension and contain UTF-8 JSON:

```json
{
  "schema": "lighthouse.patch.v1",
  "baseVersion": "0.0.1",
  "version": "0.0.2",
  "files": {
    "ui.html": {
      "sha256": "<64 lowercase hex chars>",
      "content": "<UTF-8 file contents>"
    }
  },
  "signature": {
    "alg": "ECDSA-P256-SHA256",
    "keyId": "lighthouse-debug-patch-1",
    "value": "<base64url signature>"
  }
}
```

Rules:

- `schema` must equal `lighthouse.patch.v1`.
- `baseVersion` must exactly equal the currently active app/patch version.
- `version` must be a strict numeric SemVer triplet and greater than `baseVersion`.
- `files` must contain at least one supported logical asset and no unsupported/traversal path.
- Each file content is SHA-256 checked before signature verification.
- Total decoded patch content is capped at 2 MiB in this proof slice.
- Signature is mandatory.

## Signing and trust

Patch signatures use ECDSA P-256 with SHA-256. The APK/web bundle pins the trusted **public JWK** and key id. The corresponding private key is never committed to the repository.

The signed canonical payload excludes raw file content and contains only immutable metadata plus each sorted file path and its SHA-256 digest:

```json
{
  "schema": "lighthouse.patch.v1",
  "baseVersion": "0.0.1",
  "version": "0.0.2",
  "files": [
    {"path":"ui.html","sha256":"..."}
  ]
}
```

Because every content hash is checked first, a valid signature authenticates the exact patch contents through their digests.

This debug proof uses a dedicated patch-signing trust key separate from any future APK release signing key. Production/release key custody is a later operational decision.

## Storage and atomic activation

Patch state lives in IndexedDB and does not mutate APK-packaged assets.

Database: `lighthouse-patches-v1`

Stores:

- `snapshots` — complete materialized asset snapshot keyed by version
- `meta` — `currentVersion` and `previousVersion`

Flow:

1. Read imported `.lhpatch`.
2. Validate structure, version, supported paths, size, hashes, and signature.
3. Resolve the current complete snapshot (or packaged base assets when no patch is active).
4. Overlay only changed patch files to materialize a complete candidate snapshot.
5. Write candidate to `snapshots` as **staged** data.
6. Read the stored candidate back and verify its version/assets match the candidate.
7. In one IndexedDB read-write transaction, set `previousVersion = currentVersion` and `currentVersion = candidate.version`.
8. Read current metadata and snapshot back. Only then report activation success.

If any step before pointer commit fails, the current pointer is untouched.

## Rollback

Rollback is local and atomic:

1. Read `previousVersion`.
2. Confirm that snapshot exists.
3. In one metadata transaction set `currentVersion = previousVersion` and preserve the version being left as the next rollback target.
4. Read back current pointer and snapshot.
5. Reload/remount the app only after successful readback.

Rollback never edits user data.

## Runtime integration

The APK keeps a small packaged bootstrap layer. On launch it resolves logical assets in this order:

1. active verified snapshot from IndexedDB
2. packaged base asset for any base/no-patch start

`ui.html` is mounted into the app root, `ui.css` is injected as text, `rules.json` and `vocabulary.json` are parsed as data, and the trusted `logic.mjs` snapshot is loaded from a Blob URL only after the patch bundle has passed the signature/hash gate.

The JavaScript patch module exports:

```js
export async function mount({ root, rules, vocabulary, version }) {}
```

This keeps the patch surface explicit and lets the future integrated LIGHTHOUSE app reuse the same bootstrap without replacing the patch engine.

## Failure semantics

The following are hard reject / no-activation outcomes:

- malformed JSON or contract
- wrong schema
- unsupported path
- invalid/traversal path
- incompatible/stale base version
- non-increasing target version
- patch too large
- SHA-256 mismatch
- unknown key id/algorithm
- invalid signature
- staged snapshot write/readback mismatch
- missing rollback snapshot

A rejected patch must not change `currentVersion`.

## Verification

Node 22 contract tests cover:

- valid signed patch acceptance
- changed-file-only overlay into a complete snapshot
- stale/wrong version rejection
- hash mismatch rejection
- signature mismatch rejection
- unsupported path rejection
- size limit rejection
- staging readback before activation
- atomic current/previous pointer behavior
- rollback
- no current-pointer change on failed verification

The existing APK GitHub Actions workflow remains responsible for generating/syncing the Android project, `assembleDebug`, and APK artifact upload. The branch is verification-only; no deploy/store action is added.

## Store policy boundary

Dynamic code distribution policy must be reviewed separately before Play Store release. This proof does not claim store eligibility.