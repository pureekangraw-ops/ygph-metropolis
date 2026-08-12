# Runtime Command Gate Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put one guarded runtime gate in front of every durable METROPOLIS write so stale multi-context state cannot silently overwrite newer Vault state, while exposing verifiable runtime health/fingerprint data.

**Architecture:** Keep the existing `commitCurrentState` Vault engine unchanged as durable truth. Add `metropolis-command-gate.js` last in runtime order; it wraps the existing persistence entry points with revision freshness checks, Web Locks, BroadcastChannel notification, read-back revision verification, and storage/runtime diagnostics.

**Tech Stack:** Browser classic JavaScript, IndexedDB/Vault AES-GCM path already in `app.js`, Web Locks, BroadcastChannel, StorageManager, Node test runner, jsdom runtime harness, Service Worker static app shell.

## Global Constraints

- Visible product version remains `4.2.6`.
- State Schema remains `4`.
- IndexedDB remains `stock-pocket-secure`, version `1`, store `kv`, key `vault`.
- Vault format remains `1`; AES-GCM + PBKDF2 600000 unchanged.
- Existing money/source authorities and event-envelope semantics remain unchanged.
- New Service Worker generation is `v4.2.6-20260812-r26-command-runtime-gate`.
- Work remains on `hardening/command-runtime-gates` and stops at PR + Gate; no merge/deploy.

---

### Task 1: RED contract for the command gate

**Files:**
- Create: `tests/runtime-command-gate.test.cjs`

**Interfaces:**
- Produces expected API contract for `metropolis-command-gate.js`: `COMMAND_GATE_VERSION`, `revisionFreshness`, `buildRuntimeFingerprint`, `normalizeGateStatus`.

- [ ] Write tests asserting the file exists and exports the four pure helpers.
- [ ] Assert `revisionFreshness(21, 21)` is `CURRENT`, `revisionFreshness(21, 22)` is `STALE`, and durable regression is `INVALID`.
- [ ] Assert fingerprint output contains product/core/data/schema/state/SW/DB/Vault/read-back/storage/transport fields.
- [ ] Run PR Gate and observe failure because the production file does not exist.

### Task 2: Implement pure gate core and runtime wrapper

**Files:**
- Create: `metropolis-command-gate.js`
- Test: `tests/runtime-command-gate.test.cjs`

**Interfaces:**
- `revisionFreshness(memoryRevision, durableRevision) -> {state, memoryRevision, durableRevision}`.
- `buildRuntimeFingerprint(input) -> plain object`.
- `normalizeGateStatus(input) -> {state, reason, ...}`.
- Browser runtime exposes `globalThis.YGPHCommandGate`.

- [ ] Implement only enough pure code to satisfy Task 1.
- [ ] In browser runtime capture original `persistAndRender` and `saveEncryptedState`.
- [ ] Implement `readDurableTruth()` with existing `dbGet(VAULT_KEY)` + `decryptVault(..., cryptoKey)`.
- [ ] Before each durable write compare durable revision to current in-memory revision.
- [ ] On stale state restore durable `state/currentVault`, record `lastDurableReadback`, render, and throw error code `STALE_CONTEXT`.
- [ ] Wrap commit in `navigator.locks.request("ygph-metropolis-vault-write", {mode:"exclusive"}, ...)` when available; otherwise use one local promise queue.
- [ ] After success require returned `readback.stateRevision === state.revision`; mismatch throws `READBACK_REVISION_MISMATCH`.
- [ ] Broadcast successful revision through `BroadcastChannel("ygph-metropolis-state")` when available and mark sibling contexts stale on newer revisions.

### Task 3: Runtime health and storage persistence

**Files:**
- Modify: `metropolis-command-gate.js`
- Test: `tests/runtime-command-gate.test.cjs`

**Interfaces:**
- `YGPHCommandGate.status()` returns command-gate status and current fingerprint.
- `YGPHCommandGate.refreshStorageHealth()` checks `navigator.storage.persisted()` and best-effort `persist()`.

- [ ] Add tests for fingerprint normalization and degraded/no-API statuses.
- [ ] Add StorageManager check; lack of persistence reports `VERIFY` but never blocks writes.
- [ ] Include Service Worker `releaseId/lifecycle.serving`, last durable read-back, state revision and cross-context transport in fingerprint.
- [ ] Register an `YGPHRuntime.afterRender` hook that appends a compact Command Gate diagnostic line to `technicalStatus` without changing business actions.

### Task 4: Runtime harness stale-write regression

**Files:**
- Modify: `tests/runtime-command-gate.test.cjs`
- May modify: `tests/helpers/metropolis-runtime-harness.cjs` only if the harness needs missing browser API shims.

**Interfaces:**
- Uses existing production runtime and `YGPHCommandGate` browser API.

- [ ] Add a runtime test proving the last-loaded gate replaces/wraps `persistAndRender`.
- [ ] Simulate a durable Vault revision newer than memory and prove the guarded write rejects with `STALE_CONTEXT` and restores the durable state.
- [ ] Prove a current revision commits through the original engine and returns verified read-back without changing schema/DB/Vault versions.

### Task 5: Release and offline wiring

**Files:**
- Modify: `sw-bootstrap.js`
- Modify: `sw.js`
- Modify: `package.json`
- Modify: `RELEASE_MANIFEST.json`
- Modify: `.assetsignore` if required
- Modify: `SHA256SUMS.txt`
- Modify: `tests/day-cycle-controls.test.cjs`
- Modify: `tests/metropolis-remaster.test.cjs` if it owns exact SW generation
- Test: `tests/runtime-command-gate.test.cjs`

**Interfaces:**
- New runtime asset is `metropolis-command-gate.js` and must be loaded after `metropolis-day-cycle.js`.

- [ ] Add failing wiring assertions first: bootstrap last-load, APP_SHELL, syntax script, manifest runtime order/assets/productionFiles, r26 release ID.
- [ ] Update release wiring to satisfy those assertions.
- [ ] Advance Service Worker generation exactly to `v4.2.6-20260812-r26-command-runtime-gate`.
- [ ] Recompute changed-file checksums and keep visible product version 4.2.6.

### Task 6: Full verification and PR gate

**Files:**
- No production changes unless a verification failure identifies a real defect.

- [ ] Run full `npm run deploy:gate` through GitHub Actions.
- [ ] Confirm all Node tests have zero failures, syntax passes, UTF-8 passes.
- [ ] Compare branch to `main`; verify no State Schema, IndexedDB version, Vault format, money semantics, deployment-authority changes.
- [ ] Update PR body with exact gate evidence and known residual scope: pre-mutation domain command migration remains future work, while durable write authority is centralized now.
- [ ] Mark PR ready only after fresh evidence. Stop before merge.
