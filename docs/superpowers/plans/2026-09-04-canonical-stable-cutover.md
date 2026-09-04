# Canonical Stable Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the stable APK bootstrap run the canonical LIGHTHOUSE services and UI on the existing encrypted Greenfield vault without copying, resetting, or weakening user data.

**Architecture:** Keep the existing PIN/device-unlock and encrypted Greenfield vault as the durable owner. Add a narrow runtime bridge that exposes canonical read/mutation and encrypted metadata storage without exposing the passphrase. Compose canonical Manual, Module Control Plane, CHAT, backup, updater, recovery and event owners through `createAppServices()`, then switch the post-unlock stable shell only after integration tests prove durable readback and legacy data continuity.

**Tech Stack:** JavaScript ESM, IndexedDB, WebCrypto, JSDOM, Node 22 tests, Capacitor Android.

**Spec:** `LIGHTHOUSE-ASSEMBLY-MASTER-GUIDE.md` and canonical WorkUnit contracts in `android-shell/test/workunit*.test.mjs`.

## Global Constraints

- Preserve existing encrypted Greenfield database and device PIN enrollment.
- Do not expose the vault passphrase/recovery credential outside its runtime closure.
- Do not activate or modify `release/lighthouse-update.json`.
- Canonical services must use durable readback; no mock-only production owners.
- RED → focused failure → minimal GREEN → full WorkUnit + Native Android compile.

---

### Task 1: Encrypted Runtime Bridge

**Files:**
- Modify: `greenfield/runtime.mjs`
- Test: `android-shell/test/workunit10-stable-cutover.test.mjs`

**Interfaces:**
- Consumes: existing `store`, `passphrase`, mutation coordinator and encrypted state.
- Produces: `executeMultiGroupCommands(commands)` and `metadataStore()` with async `get/put/delete` backed by `state.meta.canonicalServices`.

- [ ] **Step 1: Write the failing test** proving canonical commands mutate the same encrypted state and metadata survives close/reopen.
- [ ] **Step 2: Run WorkUnit tests** and require only the new bridge assertions to fail.
- [ ] **Step 3: Implement minimal bridge** inside the existing runtime closure; every metadata write increments durable revision and verifies readback.
- [ ] **Step 4: Run WorkUnit + Native Android CI** and require both jobs green.
- [ ] **Step 5: Commit** the verified bridge.

### Task 2: Canonical Service Composition

**Files:**
- Create: `android-shell/app/public/app/stable-service-composition.mjs`
- Test: `android-shell/test/workunit10-stable-cutover.test.mjs`

**Interfaces:**
- Consumes: runtime bridge, native updater plugin adapter, installed identity owner and provider/recovery handlers.
- Produces: `createStableAppServices(...) -> Promise<AppServices>` using `createAppServices()`.

- [ ] **Step 1: Extend RED test** to require all eight canonical owners and real Module/Manual persistence.
- [ ] **Step 2: Confirm focused RED** before production edits.
- [ ] **Step 3: Compose** `createManualFourHouses`, `createModuleControlPlane`, `createChatService`, `createUpdaterBackupOwner`, update service and remaining real owners; no empty placeholder owners.
- [ ] **Step 4: Verify durable reopen** using the same encrypted vault.
- [ ] **Step 5: Commit** only after full CI green.

### Task 3: Stable Bootstrap Dual-Run Cutover

**Files:**
- Modify: `android-shell/www/trusted/bootstrap.mjs`
- Test: `android-shell/test/trusted-bootstrap.integration.test.mjs`
- Test: `android-shell/test/workunit10-stable-cutover.test.mjs`

**Interfaces:**
- Consumes: existing device unlock and `createStableAppServices`.
- Produces: `openTrustedBrain()` session exposing `services` while preserving current trusted Brain until UI cutover proves parity.

- [ ] **Step 1: RED** requires bootstrap to import packaged canonical composition and return real services after unlock.
- [ ] **Step 2: Confirm login and durable expense regression tests remain green except the new cutover assertion.
- [ ] **Step 3: Wire canonical services** after successful unlock without replacing database, PIN, or recovery enrollment.
- [ ] **Step 4: Reopen test** proves the canonical service sees the same durable records written before cutover.
- [ ] **Step 5: Commit** after full CI green.

### Task 4: Canonical UI Activation Gate

**Files:**
- Modify: `android-shell/www/trusted/bootstrap.mjs`
- Modify/Create only canonical UI host files under `android-shell/app/public/ui/` as required.
- Test: `android-shell/test/workunit10-stable-cutover.test.mjs`

**Interfaces:**
- Consumes: `services` from Task 3 and existing authenticated document.
- Produces: stable post-unlock App Frame using canonical CHAT / MANUAL / SETTINGS and Settings Update panel.

- [ ] **Step 1: RED** proves post-unlock root navigation is owned by canonical App Frame and MANUAL renders from `services.modules.list()`.
- [ ] **Step 2: Confirm focused RED** with legacy authentication tests still passing.
- [ ] **Step 3: Activate canonical UI** only after session opens; remove the legacy runtime as post-unlock UI owner, not as durable-vault donor until migration parity is proven.
- [ ] **Step 4: Full WorkUnit + Native compile**; no manifest activation.
- [ ] **Step 5: Stop at physical-device acceptance gate** for real login/navigation/data/update overwrite testing.
