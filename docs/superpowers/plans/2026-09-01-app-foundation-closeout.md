# App Foundation Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close only real foundation defects or blind spots across the seven current app foundations, preserve proven behavior, and stop when remaining VERIFY items are justified.

**Architecture:** Treat the current implementation and evidence as the starting reality. Inspect each foundation in order, use existing unit/integration/CI/manifest/artifact evidence first, add a failing test and minimal fix only when a real defect is demonstrated, and do not create new capability merely to close a test.

**Tech Stack:** Node.js test runner, IndexedDB, Capacitor Android, GitHub Actions, generated Android manifest/security verifier.

**Spec:** Owner instruction in this phase: Understanding; Routing / Capability; Runtime / Transaction; Data Survival; Native Survival; Identity / Upgrade Survival; Trust Boundary.

## Global Constraints

- Preserve foundations that are already strong; do not rebuild them.
- Fix only demonstrated defects or real blind spots.
- UNKNOWN / VERIFY is valid when evidence is insufficient.
- Do not add requirements to make a checklist look complete.
- Do not create capability to close a test.
- Do not repeat physical-world testing throughout development.
- Unit tests, CI, manifest checks, emulator checks, and security scans are evidence tools, not new foundations.
- Physical Process Death stays VERIFY unless separately proven later.
- Physical Backup / Restore stays VERIFY until that real capability is ready.
- PR #97 stays Draft; do not request review, merge, deploy, or publish from this phase.

---

### Task 1: Understanding

**Files:**
- Inspect: `lighthouse/intent-parser.mjs`
- Inspect: `lighthouse/intent-interpret.mjs`
- Test: `tests/greenfield-lighthouse-intent-*.test.cjs`
- Gate: `tests/greenfield-lighthouse-phase1-final-gate.test.cjs`

- [ ] Confirm supported input preserves meaning through parse/recovery and prohibition/unsupported conditions do not become actions.
- [ ] If a reproducible misinterpretation reaches an authorized action, write the failing test first and apply the smallest fix.
- [ ] Otherwise record PROVEN for the current supported slice and stop.

### Task 2: Routing / Capability

**Files:**
- Inspect: `lighthouse/master-input-route.mjs`
- Inspect: `lighthouse/intent-dual-route.mjs`
- Inspect: `lighthouse/capabilities/expense.mjs`
- Test: `tests/greenfield-lighthouse-phase1-final-gate.test.cjs`

- [ ] Confirm connected local capability routes locally.
- [ ] Confirm unsupported/not-connected/prohibited routes fail closed before Runtime.
- [ ] Fix only a demonstrated wrong-route defect.

### Task 3: Runtime / Transaction

**Files:**
- Inspect: `greenfield/runtime.mjs`
- Inspect: `greenfield/mutation-coordinator.mjs`
- Inspect: `greenfield/browser-store.mjs`
- Inspect: `android-shell/www/trusted/brain-gate.mjs`
- Test: `tests/greenfield-runtime*.test.cjs`
- Test: `tests/greenfield-mutation-coordinator.test.cjs`
- Test: `android-shell/test/trusted-brain-gate.integration.test.mjs`

- [ ] Confirm no durable write occurs before explicit execution/confirmation.
- [ ] Confirm success follows transaction completion and failure does not silently become success.
- [ ] Keep Web Locks fallback limitation as VERIFY unless current multi-context reality makes it a demonstrated defect.

### Task 4: Data Survival

**Files:**
- Inspect: `greenfield/browser-store.mjs`
- Inspect: `greenfield/persistence.mjs`
- Test: `tests/greenfield-browser-store.test.cjs`
- Test: `tests/greenfield-persistence.test.cjs`
- Test: `android-shell/test/trusted-bootstrap.integration.test.mjs`

- [ ] Preserve transaction-completion, blocked-open, versionchange, migration, and durable readback contracts.
- [ ] Treat existing physical close/reopen, Force Stop, Reboot, and APK A -> B evidence as retained evidence; do not repeat it.
- [ ] Keep strict durability/process-death-only claims VERIFY unless new evidence changes the status.

### Task 5: Native Survival

**Files:**
- Inspect: `.github/workflows/lighthouse-apk-debug.yml`
- Inspect: `android-shell/tools/verify-android-security.mjs`
- Test: `android-shell/test/android-security-verifier.test.mjs`

- [ ] Confirm generated Android project receives the security baseline after generation/sync.
- [ ] Confirm merged release manifest is verified fail-closed before APK publication.
- [ ] Keep isolated OS process-death proof VERIFY; do not manufacture a new physical test mid-development.

### Task 6: Identity / Upgrade Survival

**Files:**
- Inspect: `android-shell/apk-identity.json`
- Inspect: `android-shell/version.json`
- Inspect: `android-shell/tools/verify-apk-identity.mjs`
- Test: `android-shell/test/apk-identity-contract.test.mjs`
- Test: `android-shell/test/apk-version-contract.test.mjs`

- [ ] Confirm package, signer, version ownership, final APK identity verifier, and standard rail remain intact.
- [ ] Retain physical APK A -> B in-place survival as evidence; do not repeat during this phase.

### Task 7: Trust Boundary

**Files:**
- Inspect: `android-shell/www/trusted/brain-gate.mjs`
- Inspect: `android-shell/www/patch/patch-runtime.mjs`
- Test: `android-shell/test/trusted-brain-packaging.test.mjs`
- Test: `android-shell/test/patch-store-immutability.test.mjs`
- Test: `android-shell/test/patch-contract.test.mjs`

- [ ] Confirm trusted Brain/Greenfield sources remain non-patchable generated source.
- [ ] Confirm Patch versions are immutable and signed/verified before activation.
- [ ] Confirm Patch cannot be treated as authority for durable trusted mutation outside the trusted gate.
- [ ] Keep physical Backup / Restore VERIFY until the real capability is ready.

### Task 8: Closeout

**Files:**
- Create: `docs/app-foundation-phase-closeout.md`

- [ ] Record each foundation as PROVEN / VERIFY / BLOCKED with exact scope.
- [ ] Record any real defects fixed during this pass; if none, say none.
- [ ] Run exact-head Greenfield Deploy Gate and LIGHTHOUSE APK Debug.
- [ ] If no DEFECT remains and VERIFY items have explicit reasons, close the foundation phase and return to app development.
