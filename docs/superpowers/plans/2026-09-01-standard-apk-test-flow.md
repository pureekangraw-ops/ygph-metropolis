# Standard APK Test Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing canonical APK rail permanently reusable so a tester only raises the Android version and runs the standard Patch/APK workflow.

**Architecture:** Keep `.github/workflows/lighthouse-apk-debug.yml` as the single canonical build rail. Remove Patch-release-number knowledge from workflow structure by adding one source-controlled current Patch release contract and a generic builder that consumes existing release files; preserve all current security, signer, version, identity, and evidence gates.

**Tech Stack:** GitHub Actions, Node.js 22, Capacitor 8.5, Android/Gradle, OpenSSL/apksigner, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-01-standard-apk-test-flow-design.md`

## Global Constraints

- Permanent standard; not PR-specific.
- Operator path is `raise Android version -> run Patch/APK workflow -> canonical APK`.
- Reuse current Patch and canonical APK trust/build rail; no parallel build system.
- Tester never manually edits signer, generated manifest/security config, Gradle build steps, or identity verification.
- Fail closed on invalid version, Patch failure, signer/identity mismatch, security failure, build failure, or missing evidence.
- Physical-device A->B/state-survival evidence remains a separate gate.

---

### Task 1: Lock the permanent workflow contract with RED tests

**Files:**
- Modify: `android-shell/test/apk-ci-signing-contract.test.mjs`

**Interfaces:**
- Consumes: existing workflow text.
- Produces: tests requiring a single Patch release contract, no hard-coded `0.0.5` in workflow structure, and preserved canonical APK gates.

- [ ] Add tests asserting the workflow reads a current Patch release contract and uses generic Patch preparation.
- [ ] Add a test rejecting hard-coded `front-door-0.0.5` workflow paths/names.
- [ ] Keep existing signer-isolation/final-verification tests.
- [ ] Run `npm test` in `android-shell` and capture the expected RED failure.
- [ ] Commit RED evidence.

### Task 2: Add one current Patch release contract and generic source builder

**Files:**
- Create: `android-shell/release/current-patch.json`
- Create: `android-shell/tools/build-current-patch-source.mjs`
- Test: `android-shell/test/current-patch-source.test.mjs`

**Interfaces:**
- Consumes: release directory files, existing bootstrap fixture, current rules/vocabulary.
- Produces: validated `{version, primaryBaseVersion, bootstrapBaseVersion, releaseDirectory}` plus generated primary/bootstrap signing-source JSON.

- [ ] Write failing tests for contract validation and generated source versions/files.
- [ ] Verify RED.
- [ ] Implement strict contract parsing and generic source generation using current release files.
- [ ] Verify focused tests GREEN.
- [ ] Commit.

### Task 3: Refactor the existing workflow into the standard reusable path

**Files:**
- Modify: `.github/workflows/lighthouse-apk-debug.yml`
- Modify: `android-shell/package.json`
- Modify: `android-shell/test/apk-ci-signing-contract.test.mjs`

**Interfaces:**
- Consumes: `release/current-patch.json`, generic Patch source builder, existing Patch signer/verifier, existing Android security/version/sign/build/identity tools.
- Produces: one workflow run that prepares/verifies current Patch release and publishes canonical APK.

- [ ] Replace release-number-specific Patch source commands/paths/names with values loaded from the contract.
- [ ] Preserve Patch key fingerprint verification and trust-domain isolation.
- [ ] Preserve Android security apply/verify, canonical version application, release build, signer materialization, final-byte identity verification, and artifact upload.
- [ ] Make workflow artifact names stable rather than version-specific where practical.
- [ ] Run `npm test` and verify GREEN.
- [ ] Commit.

### Task 4: Add operator documentation and permanent boundary

**Files:**
- Create: `docs/android-standard-apk-test-flow.md`
- Modify: `docs/android-app-existence-physical-proof.md`

**Interfaces:**
- Produces: exact operator procedure and explicit separation from physical proof.

- [ ] Document the only operator steps: edit `android-shell/version.json`, update current Patch release contract/source only when a new Patch itself is being prepared, then run the standard workflow.
- [ ] State forbidden manual signer/manifest/security/build manipulation.
- [ ] State canonical artifact/evidence outputs and fail-closed behavior.
- [ ] Link physical proof as a separate gate.
- [ ] Commit.

### Task 5: Exact-head verification

**Files:**
- No production files unless verification exposes a real defect.

- [ ] Confirm GitHub Actions runs on exact feature head.
- [ ] Verify `Greenfield Deploy Gate` succeeds.
- [ ] Verify `LIGHTHOUSE APK Debug` succeeds through Patch verification, generated Android security, release signing, final APK identity verification, and canonical artifact upload.
- [ ] Inspect canonical artifact metadata/evidence.
- [ ] Record exact head/run IDs in the standard flow doc or checkpoint.
- [ ] Stop at physical-device gate; do not claim A->B/state-survival proof from CI.
