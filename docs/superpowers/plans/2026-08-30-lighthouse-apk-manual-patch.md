# LIGHTHOUSE APK Manual Patch Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manual, signed, local-first `.lhpatch` path that updates selected LIGHTHOUSE web assets without rebuilding/reinstalling the base APK, with staged verification, atomic activation, readback, and rollback.

**Architecture:** Keep the APK as a stable Capacitor shell. Verify a signed patch bundle in pure JavaScript, materialize a complete asset snapshot from changed files plus the current/base snapshot, persist it in IndexedDB, and switch only metadata pointers inside an atomic transaction. Activation is compare-and-swap bound to the exact current version used during verification so a stale concurrent import cannot overwrite a newer patch. A bootstrap module mounts the current snapshot and exposes manual import/rollback controls; no network update or native change is introduced.

**Tech Stack:** Node 22 test runner, browser/WebView Web Crypto, IndexedDB, ES modules, Capacitor 8.5.0.

**Spec:** `docs/superpowers/specs/2026-08-30-lighthouse-apk-manual-patch-design.md`

## Global Constraints

- Patch schema is exactly `lighthouse.patch.v1`.
- Supported logical assets are exactly `ui.html`, `ui.css`, `logic.mjs`, `rules.json`, `vocabulary.json`.
- Signature algorithm is exactly ECDSA P-256 + SHA-256 and key id `lighthouse-debug-patch-1` for this debug proof.
- Private signing key is never committed.
- Per-file integrity is lowercase-hex SHA-256 over UTF-8 content.
- Total patch content maximum is 2 MiB.
- `baseVersion` must equal current active version; `version` must be a greater numeric SemVer triplet.
- The version used during verification must still be Current inside the activation metadata transaction; otherwise activation rejects as stale.
- Patch activation cannot modify user data.
- No auto-download, deploy, GPS, maps, permission, native plugin, Android Manifest, release signing, or store publishing changes.
- Existing APK build remains debug-only and verification-only.

---

### Task 1: Signed Patch Verification Contract

**Files:**
- Create: `android-shell/test/patch-contract.test.mjs`
- Create: `android-shell/www/patch/patch-contract.mjs`

**Interfaces:**
- Produces: `verifyPatchBundle(bundle, options) -> Promise<{schema, baseVersion, version, files}>`
- Produces: `canonicalPatchPayload(bundle) -> string`
- Produces: `sha256Hex(text) -> Promise<string>`
- Produces constants `PATCH_SCHEMA`, `PATCH_MAX_BYTES`, `PATCH_ALLOWED_FILES`.

- [ ] **Step 1: Write failing tests** covering a valid signed patch plus wrong base version, non-increasing version, hash mismatch, signature mismatch, unsupported path, and size limit. Tests generate an ephemeral P-256 key pair with `crypto.subtle.generateKey`, sign `canonicalPatchPayload`, and assert the production verifier rejects each invalid mutation.

- [ ] **Step 2: Push RED commit and verify the GitHub Actions `Verify foundation contract` step fails because `www/patch/patch-contract.mjs` does not exist.**

- [ ] **Step 3: Implement minimal verifier** with exact rules from the spec. Canonical payload is `JSON.stringify({schema,baseVersion,version,files:[...sorted paths mapped to {path,sha256}]})`. Decode base64url signature to bytes and call Web Crypto `subtle.verify({name:'ECDSA',hash:'SHA-256'}, key, signature, TextEncoder payload)`.

- [ ] **Step 4: Verify GREEN**: patch tests and existing foundation tests pass in the exact-head workflow.

- [ ] **Step 5: Commit** `feat: verify signed LIGHTHOUSE patch bundles`.

### Task 2: Snapshot Composition and Atomic Store

**Files:**
- Extend: `android-shell/test/patch-contract.test.mjs`
- Create: `android-shell/www/patch/patch-store.mjs`

**Interfaces:**
- Produces: `composeSnapshot({currentSnapshot, baseAssets, verifiedPatch}) -> snapshot`
- Produces: `createMemoryPatchStore()` for deterministic Node tests.
- Produces: `createIndexedDbPatchStore({indexedDB})` for runtime.
- Store API: `stage(snapshot)`, `activate(version, {expectedCurrentVersion})`, `readMeta()`, `readSnapshot(version)`, `readCurrent()`, `rollback()`.
- Snapshot shape: `{version, assets:{ui.html,ui.css,logic.mjs,rules.json,vocabulary.json}}` with all five assets present.

- [ ] **Step 1: Write failing tests** proving a changed-file-only patch inherits unchanged assets, staged data can be read back before activation, activation moves `{previousVersion,currentVersion}` together, activation rejects when Current no longer matches `expectedCurrentVersion`, concurrent imports cannot activate a stale candidate over a newer patch, failed staging leaves current unchanged, and rollback swaps back to the previous complete snapshot.

- [ ] **Step 2: Push RED and confirm the new tests fail because the store module is missing.**

- [ ] **Step 3: Implement the memory store first**, then the IndexedDB store using database `lighthouse-patches-v1`, object stores `snapshots` and `meta`, with activation/rollback metadata writes done inside one read-write transaction. Activation must compare `currentVersion` with `expectedCurrentVersion` inside that same metadata transaction before changing either pointer.

- [ ] **Step 4: Verify GREEN** on exact HEAD.

- [ ] **Step 5: Commit** `feat: stage activate and rollback patch snapshots`.

### Task 3: Packaged Base Assets and Runtime Bootstrap

**Files:**
- Create: `android-shell/www/app/version.json`
- Create: `android-shell/www/app/ui.html`
- Create: `android-shell/www/app/ui.css`
- Create: `android-shell/www/app/logic.mjs`
- Create: `android-shell/www/app/rules.json`
- Create: `android-shell/www/app/vocabulary.json`
- Create: `android-shell/www/patch/patch-runtime.mjs`
- Modify: `android-shell/www/index.html`
- Extend: `android-shell/test/patch-contract.test.mjs`

**Interfaces:**
- `loadBaseSnapshot({fetch}) -> Promise<snapshot>` reads the five packaged logical assets and version `0.0.1`.
- `mountSnapshot(snapshot, {root, document, URL, Blob}) -> Promise<cleanup>` injects HTML/CSS, parses rules/vocabulary, imports the trusted `logic.mjs` through a Blob URL, and calls its exported `mount({root,rules,vocabulary,version})`.
- `startPatchRuntime()` resolves active snapshot or packaged base, mounts it, wires file input `.lhpatch`, Apply status, and Rollback button.

- [ ] **Step 1: Write failing structural/runtime tests** proving all base assets exist, version is `0.0.1`, `logic.mjs` exports `mount`, `index.html` loads the patch runtime, and runtime code never fetches a remote update URL.

- [ ] **Step 2: Push RED and verify expected failure.**

- [ ] **Step 3: Add packaged base assets** preserving the current Foundation Proof content as the base UI while moving presentation/logic into the logical asset structure.

- [ ] **Step 4: Implement runtime bootstrap**: on import, parse JSON, call `verifyPatchBundle` against current version and pinned trust key, compose candidate, `stage`, readback, `activate(candidate.version, {expectedCurrentVersion: verifiedCurrentVersion})`, readback current, then reload/remount. If another import advances Current before activation, reject the stale candidate without moving pointers. On any exception, report rejection without activation. Rollback invokes store rollback then reload/remount.

- [ ] **Step 5: Verify GREEN** including Capacitor generation/sync and debug APK build.

- [ ] **Step 6: Commit** `feat: boot LIGHTHOUSE from patchable web snapshot`.

### Task 4: Trusted Debug Key and Manual Signing Tool

**Files:**
- Create: `android-shell/www/patch/trusted-key.json`
- Create: `android-shell/tools/sign-patch.mjs`
- Create: `android-shell/test/fixtures/sample-update-input.json`
- Create: `android-shell/test/fixtures/sample-update.lhpatch`
- Extend: `android-shell/test/patch-contract.test.mjs`
- Modify: `android-shell/package.json`

**Interfaces:**
- `trusted-key.json` contains key id `lighthouse-debug-patch-1`, algorithm `ECDSA-P256-SHA256`, and the pinned public P-256 JWK.
- `npm run patch:sign -- <input-json> <private-key.pem> <output.lhpatch>` signs a patch source using a PKCS#8 PEM private key and writes the final signed bundle.
- The signing source contains `baseVersion`, `version`, and a `files` object mapping supported logical paths to UTF-8 content; the tool computes hashes itself.

- [ ] **Step 1: Write failing tests** that parse the pinned public key, validate the committed sample patch through the real verifier, and assert no private-key PEM marker exists anywhere under `android-shell/www` or `android-shell/tools`.

- [ ] **Step 2: Push RED and verify expected missing-key/tool failure.**

- [ ] **Step 3: Commit only the public key**:

```json
{
  "keyId": "lighthouse-debug-patch-1",
  "alg": "ECDSA-P256-SHA256",
  "jwk": {
    "key_ops": ["verify"],
    "ext": true,
    "kty": "EC",
    "x": "w8Xdc6w5KqFOAcy28IfCuDJc8aGD3WezJysoF7Noqx4",
    "y": "3BLV6ixL4n_ZtjHNXIy1nL8Vjc6HL42GFa47tDcjMK0",
    "crv": "P-256"
  }
}
```

- [ ] **Step 4: Implement the Node signing tool** using `node:crypto` Web Crypto/importKey PKCS#8 and the same canonical payload function. The private key path is required on the command line and is never copied into the repo.

- [ ] **Step 5: Generate and commit one benign sample `.lhpatch`** signed by the external debug private key. The sample changes only `ui.html` from base version `0.0.1` to version `0.0.2` and displays `LIGHTHOUSE Patch Proof 0.0.2`.

- [ ] **Step 6: Verify GREEN** on exact HEAD.

- [ ] **Step 7: Commit** `feat: pin debug patch trust and signing tool`.

### Task 5: Workflow/Docs and Exact-Head Proof

**Files:**
- Modify: `android-shell/README.md`
- Extend: `android-shell/test/foundation-contract.test.mjs`
- Optionally modify: `.github/workflows/lighthouse-apk-debug.yml` only if required to expose the sample patch as an artifact; do not add deploy.

**Interfaces:**
- README documents manual patch import, rollback, private-key boundary, and native-change APK requirement.
- If workflow artifact is added, its name is `lighthouse-sample-patch` and it contains only `sample-update.lhpatch`.

- [ ] **Step 1: Add contract assertions** that the APK workflow still contains no deploy/store publishing step and that patch scope stays under web assets/tools/tests/docs.

- [ ] **Step 2: Update README** with exact manual flow: install base APK once → import trusted `.lhpatch` → verify/stage/activate/readback → rollback if needed.

- [ ] **Step 3: Run exact-head GitHub Actions** and require all Node tests, Capacitor generation, sync, Gradle `assembleDebug`, and APK artifact upload to pass.

- [ ] **Step 4: Fetch the produced APK artifact metadata** and record exact HEAD/run/artifact in the new PR description/comment.

- [ ] **Step 5: Open a Draft stacked PR** from `feature/lighthouse-apk-patch-foundation-20260830` into `feature/lighthouse-apk-foundation-proof-20260830`, explicitly noting that PR #85 remains unchanged and its prior ACCEPT remains bound to `38e853...`.

- [ ] **Step 6: Request independent audit** of the patch branch. No merge/deploy/store publishing.