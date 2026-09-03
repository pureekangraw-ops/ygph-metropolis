# LIGHTHOUSE 2.0.2 CHAT Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a durable, real CHAT vertical slice for LIGHTHOUSE 2.0.2 / versionCode 2002, preserving the proven 2.0.1 update/sign/data path.

**Architecture:** Add durable chat/message/work/event persistence and a controller around the existing domain owner bridges. Browser UI is a projection of durable CHAT state; domain mutations happen only after user confirmation and SUCCESS is projected only after owner readback.

**Tech Stack:** ES modules, Node 22 test runner, NEW BASE browser UI, existing Greenfield runtime/domain persistence, Capacitor Android shell/updater, Gradle/GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-03-lighthouse-2.0.2-chat-vertical-slice-design.md`

## Global Constraints

- Base source is `885bdd369a07a249b71574ba35c832e4c0579e2c`.
- Target build identity is `2.0.2` / `2002` / `com.yggdrasil.lighthouse`.
- Signer SHA-256 must remain `aae608a7ddab0dbfccc1d35e817c5683b3c64b90ab581a4b74867db54e0351ce`.
- No MANUAL/SETTINGS feature expansion beyond contracts necessary for CHAT/update continuity.
- No production behavior change without a failing test first.
- No SUCCESS before real domain readback.
- Raw input and parsed draft remain separate.
- Retry reuses the same durable message/work records.
- Final status remains `DEVICE UNVERIFIED` until physical Android acceptance.

---

### Task 1: Durable CHAT document and meaningful-change core

**Files:**
- Create: `lighthouse-new-base/src/chat-store.mjs`
- Create: `lighthouse-new-base/src/chat-state.mjs`
- Test: `lighthouse-new-base/test/chat-store.test.mjs`
- Test: `lighthouse-new-base/test/chat-state.test.mjs`

**Interfaces:**
- Produces `createChatStore({ storage, key })` with `read()`, `commitUserMessage()`, `updateDocument(mutator)`.
- Produces `appendChatEvent(document,event)`, `deriveChatSnapshot(document,messageId)`, `meaningfulChange(previous,next)`.

- [ ] Write failing tests proving stable conversation/message/work IDs, persisted raw text, recreation readback, append-only events, WAITING→WAITING silence, WAITING→BLOCKED/ERROR/SUCCESS meaningful, and archive preserving history.
- [ ] Run the focused tests and confirm RED because the modules do not exist.
- [ ] Implement the minimum immutable document schema and storage adapter required by those tests.
- [ ] Run focused tests GREEN, then all NEW BASE tests.
- [ ] Commit `feat: add durable chat state core`.

### Task 2: Quick Capture draft/confirm/cancel and domain readback lifecycle

**Files:**
- Modify: `lighthouse-new-base/src/chat-session.mjs`
- Modify: `lighthouse-new-base/src/chat-expense-bridge.mjs`
- Create: `lighthouse-new-base/src/chat-controller.mjs`
- Test: `lighthouse-new-base/test/chat-session.test.mjs`
- Test: `lighthouse-new-base/test/chat-controller.test.mjs`

**Interfaces:**
- Consumes chat store/state from Task 1 and existing expense/domain bridge.
- Produces controller methods `send(rawText)`, `edit(messageId,text)`, `confirm(messageId)`, `cancel(messageId)`, `retry(messageId)`, `archive(messageId)`, `snapshot()`.

- [ ] Add failing tests for RAW→draft, raw/parsed separation, edit, cancel, no owner commit before confirm, confirm→queue→owner commit→readback→SUCCESS, readback error preserving domain execution truth, retry using the same message/work IDs, and double-submit suppression.
- [ ] Run focused tests and confirm RED for missing durable controller behavior.
- [ ] Implement the minimum controller and adapt the existing bridge so deterministic message/work identity reaches the idempotent owner request path.
- [ ] Run focused tests GREEN and regression tests.
- [ ] Commit `feat: complete chat execution lifecycle`.

### Task 3: Browser CHAT interaction and Android keyboard-safe layout

**Files:**
- Modify: `lighthouse-new-base/src/browser-app.mjs`
- Modify: `lighthouse-new-base/src/browser-shell.mjs`
- Modify: `lighthouse-new-base/styles.css`
- Modify: `lighthouse-new-base/main.mjs`
- Test: `lighthouse-new-base/test/browser-app.test.mjs`
- Test: `lighthouse-new-base/test/browser-shell.test.mjs`
- Create: `lighthouse-new-base/test/chat-mobile-contract.test.mjs`

**Interfaces:**
- Consumes controller projection/actions from Task 2.
- Browser app handles `submit`, keyboard send action, draft action buttons, retry/archive, route navigation, and viewport updates.

- [ ] Write failing tests for send-button submit, Enter/IME submit, Shift+Enter newline, one submit→one message, user/assistant sides, real Confirm/Edit/Cancel/Retry/Archive controls, no internal copy, latest-message scroll, `100dvh`, safe-area, visual viewport keyboard sizing, and route/back regression.
- [ ] Run focused tests RED.
- [ ] Wire the controller to browser app, render durable chat projections/actions, and add the minimum keyboard-safe CSS/visualViewport logic.
- [ ] Run focused tests GREEN and all NEW BASE tests.
- [ ] Commit `feat: wire real chat browser surface`.

### Task 4: Shared owner/readback contract and restart recovery

**Files:**
- Modify: `lighthouse-new-base/src/browser-model.mjs` only if a shared read/projection contract is required.
- Modify: `lighthouse-new-base/main.mjs`
- Test: `lighthouse-new-base/test/chat-domain-owner.test.mjs`
- Test: `lighthouse-new-base/test/chat-recovery.test.mjs`
- Test: `lighthouse-new-base/test/whole-app-route.test.mjs`

**Interfaces:**
- CHAT commit calls existing domain owner; MANUAL projections read those same domain records.
- Startup restores chat document and reconciles queued/retryable work before generating new messages.

- [ ] Write failing tests showing CHAT and MANUAL read the same owner record, controller recreation restores messages/draft/work, pending retry does not create a new message, and navigation state remains valid.
- [ ] Run RED.
- [ ] Implement only the missing boot/recovery/shared-projection glue.
- [ ] Run GREEN and full NEW BASE regression.
- [ ] Commit `feat: recover chat work across restart`.

### Task 5: Build identity 2.0.2 / 2002 from Android truth

**Files:**
- Modify: `android-shell/version.json`
- Modify: `lighthouse-new-base/main.mjs` to obtain installed identity through the updater/native bridge rather than a user-visible hard-coded version.
- Modify: `lighthouse-new-base/src/android-updater-bridge.mjs` only if installed identity is not already exposed.
- Test: `android-shell/test/apk-version-contract.test.mjs`
- Test: `lighthouse-new-base/test/browser-entry.test.mjs`

**Interfaces:**
- UI receives `settings.version` from installed/build identity readback.

- [ ] Add/update failing tests requiring `2.0.2`, versionCode `2002`, and absence of a user-visible hard-coded old/new-base version.
- [ ] Run RED.
- [ ] Set target Android identity and wire version projection to installed identity.
- [ ] Run Android shell + NEW BASE tests GREEN.
- [ ] Commit `release: set LIGHTHOUSE 2.0.2 build identity`.

### Task 6: Acceptance matrix and updater continuity tests

**Files:**
- Create: `lighthouse-new-base/test/chat-2.0.2-acceptance.test.mjs`
- Modify: `lighthouse-new-base/test/updater-test-manifest.test.mjs`
- Modify/add release evidence text files only after artifact identity is known.

- [ ] Add acceptance tests covering every mandatory CHAT behavior and the 2.0.1→2.0.2 data-preservation/update contract that can be proven automatically.
- [ ] Run NEW BASE `npm test`, root `npm run deploy:gate`, and Android shell `npm test` via CI.
- [ ] Fix only failures attributable to this slice, preserving scope.
- [ ] Commit `test: close LIGHTHOUSE 2.0.2 chat acceptance matrix`.

### Task 7: Signed candidate, manifest, and evidence

**Files:**
- Add immutable `release/assets/2.0.2/LIGHTHOUSE-2.0.2-vc2002.apk` through the owner build/release workflow.
- Add `release/assets/2.0.2/SHA256SUMS.txt`.
- Add `release/assets/2.0.2/CHECKPOINT.md`.
- Add/update a 2.0.2 test manifest pointing at the exact immutable APK.

- [ ] Build release APK from the final source commit with the existing signing secret/key.
- [ ] Verify applicationId, versionName, versionCode, signer SHA-256, APK SHA-256, and source/assets provenance.
- [ ] Confirm the manifest URL/hash/version/signer point exactly to that signed APK.
- [ ] Run updater/security/identity gates.
- [ ] Record changed files, CI/test results, source commit and artifact evidence in CHECKPOINT.
- [ ] Do not mark COMPLETE/ACCEPTED; hand off as `IMPLEMENTED / TESTED / DEVICE UNVERIFIED` until physical device proof exists.
