# APK Identity Continuity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish one durable Android APK identity for LIGHTHOUSE and prove future APKs can update in place without uninstall while preserving Greenfield/Manual/Patch/device-unlock state.

**Architecture:** Treat Android APK identity as a first-class infrastructure trust boundary separate from Patch signing. Pin package identity, stable APK signer fingerprint, and monotonic versionCode in source/CI; require secret-backed signing, post-build identity verification, and real-device A→B upgrade proof before any further native feature work.

**Tech Stack:** Capacitor 8.5, Android/Gradle, GitHub Actions, Java 21, Android build tools (`apksigner`, `aapt`/`apkanalyzer`, `keytool`), existing Greenfield/Manual/Patch runtime.

**Spec:** `docs/superpowers/specs/2026-08-31-apk-identity-continuity-design.md`

## Global Constraints

- P0 Infrastructure Blocker: no Map/GPS, Notification, Ride Engine, or other new native capability before the final physical upgrade gate passes.
- Canonical package ID stays `com.yggdrasil.lighthouse` unless a separately approved migration design changes it.
- APK signing identity and Patch signing identity are separate trust domains.
- Never reuse Patch private-key secrets as APK signing material.
- No private key, keystore password, key password, or recovery secret may be committed or printed in CI logs.
- Backup/Restore is emergency recovery only; it is not part of the normal A→B update flow.
- Existing Greenfield/Manual business semantics and Patch verification/rollback semantics are preserved.
- Every automatable contract follows RED → minimal change → GREEN → relevant full suite → commit.
- Physical-device proof is mandatory at the final gate; CI/emulator evidence cannot replace it.
- No production deploy/store publication during this plan.
- After each sub-phase: update the project checkpoint, then stop at the review handoff. BIG sends review.

---

## Phase 0 — Reality Audit / Reconstruct the Missing Lineage

### Task 0.1: Map the current APK pipeline

**Read:**
- `.github/workflows/lighthouse-apk-debug.yml`
- `android-shell/package.json`
- `android-shell/capacitor.config.json`
- latest Android-line PR evidence and APK artifacts

**Produces:** one evidence map for package ID, build type, signer behavior, versionCode behavior, artifact provenance, and physical-device history.

- [ ] Record the exact current chain: checkout → test → Patch signing → `cap add android` → sync → Gradle build → artifact upload.
- [ ] Mark where APK signer enters the chain. If nowhere explicit, record `BLOCKED` rather than infer.
- [ ] Record known old/new APK signer certificate SHA-256 values from artifact evidence.
- [ ] Record whether versionCode is source-controlled, generated, defaulted, or unknown.
- [ ] Record which prior physical-device runs required fresh install/uninstall and which were true updates.
- [ ] Produce `READY / BLOCKED / VERIFY` for each boundary.

**Exit gate:** Root cause is evidence-backed: exact point where APK identity continuity stops being controlled is known.

### Task 0.2: Gap inventory

- [ ] Compare required chain against current chain:
  `package ID → stable signer custody → fingerprint → versionCode → CI signing → post-build verification → A artifact → B artifact → in-place install → state survival → regression gate`.
- [ ] For every missing link, name an owner and the phase that closes it.
- [ ] Explicitly separate already-proven Patch signing from missing APK signing continuity.

**Exit gate:** No unidentified gap remains in the APK lineage model.

---

## Phase 1 — Canonical APK Identity Contract

### Task 1.1: Add a public non-secret identity contract

**Create/reuse:**
- `android-shell/apk-identity.json`
- `android-shell/test/apk-identity-contract.test.mjs`

**Contract fields:**
- `applicationId`: `com.yggdrasil.lighthouse`
- `signerCertificateSha256`: canonical public certificate fingerprint
- `versionCodePolicy`: monotonic increasing integer
- `identitySchemaVersion`
- optional public alias/label only; no secret material

- [ ] Write RED test requiring the contract file and exact package ID.
- [ ] Write RED test requiring a valid 64-hex signer certificate fingerprint.
- [ ] Write RED test forbidding any private key/passphrase fields.
- [ ] Add minimal public contract.
- [ ] Run focused tests GREEN.

**Exit gate:** APK identity is a canonical, inspectable system invariant rather than an implicit build side effect.

### Task 1.2: Lock package identity drift

- [ ] Test `capacitor.config.json.appId === apk-identity.json.applicationId`.
- [ ] Test generated Android manifest/application ID after generation when practical.
- [ ] Fail closed on unapproved appId drift.

**Exit gate:** Package identity cannot silently diverge between source and generated native project.

---

## Phase 2 — Stable APK Signing Identity and Custody

### Task 2.1: Establish or designate the canonical APK signing key

**Boundary:** This is APK signing, not Patch signing.

- [ ] Determine whether a reusable APK keystore already exists and can be proven to match an intended lineage.
- [ ] If no suitable key exists, create one once under owner-authorized custody procedure.
- [ ] Derive and record only the public certificate SHA-256 in `apk-identity.json`.
- [ ] Store keystore/password material only in approved secret custody; never repository plaintext.
- [ ] Verify readback from custody reproduces the same public certificate fingerprint.

**Exit gate:** One canonical APK signer exists, its private custody is known, and its public fingerprint is pinned.

### Task 2.2: Recovery/custody continuity

- [ ] Document recovery owner and backup location for the APK keystore.
- [ ] Verify encrypted backup/readback without exposing private material.
- [ ] Define key-loss consequence explicitly: losing this key breaks the established APK update lineage.

**Exit gate:** APK signer continuity does not depend on one ephemeral CI runner or one local machine.

---

## Phase 3 — VersionCode / VersionName Contract

### Task 3.1: Make Android versioning explicit

**Create/reuse:**
- `android-shell/version.json` or equivalent existing owner
- `android-shell/tools/set-android-version.mjs`
- tests under `android-shell/test/`

- [ ] RED test requiring explicit integer `versionCode` and human-readable `versionName`.
- [ ] RED test proving `versionCode` is not derived accidentally from Patch version.
- [ ] Implement a single source of version truth.
- [ ] Apply version to generated Android project after `cap add android` and before build.
- [ ] Read generated project back and assert exact values.

**Exit gate:** Every APK build has an intentional Android versionCode/versionName.

### Task 3.2: Enforce monotonic upgrade lineage

- [ ] Add a comparator/gate requiring candidate B `versionCode > A versionCode` for update releases.
- [ ] Fail if equal or lower.
- [ ] Keep Patch semantic version independent; document any mapping only if explicitly needed.

**Exit gate:** A future candidate cannot accidentally become non-upgradeable due to versionCode regression.

---

## Phase 4 — CI Stable Signing

### Task 4.1: Inject APK signer secrets safely

**Modify:** `.github/workflows/lighthouse-apk-debug.yml` or create a dedicated APK identity workflow if separation is cleaner.

- [ ] Add RED contract test/workflow check proving no stable APK signing env is wired yet.
- [ ] Add secret inputs for keystore bytes, store password, key alias, and key password using distinct APK-specific names.
- [ ] Materialize keystore only in runner temp with restrictive permissions.
- [ ] Ensure cleanup executes even on failure.
- [ ] Never echo secret values.
- [ ] Configure Gradle build to sign the distributable APK with the canonical signer.

**Exit gate:** CI no longer relies on runner-generated/debug signer identity for distributable APKs.

### Task 4.2: Keep Patch signing isolated

- [ ] Regression-test that Patch key-3 secrets are still used only for `.lhpatch` signing.
- [ ] Regression-test that APK signing path uses only APK-specific secrets.
- [ ] No secret naming overlap or fallback between the two trust domains.

**Exit gate:** Patch authenticity and APK application identity remain separate and independently auditable.

---

## Phase 5 — Post-Build APK Identity Verification

### Task 5.1: Build a verifier

**Create/reuse:** `android-shell/tools/verify-apk-identity.mjs`

**Verifier checks:**
- package ID
- signer certificate SHA-256
- versionCode
- versionName
- APK SHA-256

- [ ] Write RED tests around parsed verifier output / fixture metadata.
- [ ] Implement fail-closed verification using Android build tools.
- [ ] Reject wrong signer.
- [ ] Reject wrong package ID.
- [ ] Reject missing/invalid versionCode.

**Exit gate:** Artifact identity is proven from the APK bytes, not assumed from build configuration.

### Task 5.2: Gate artifact publication

- [ ] Run identity verifier before `upload-artifact`.
- [ ] Upload a small non-secret identity evidence file containing source commit, APK SHA-256, certificate SHA-256, package ID, versionCode, versionName.
- [ ] Do not upload APK if identity verification fails.

**Exit gate:** Every published APK has exact identity evidence bound to its bytes and source commit.

---

## Phase 6 — Produce Controlled APK A Baseline

### Task 6.1: Build A

- [ ] Choose baseline source commit deliberately.
- [ ] Assign versionCode `N` and versionName A.
- [ ] Build with canonical APK signer.
- [ ] Verify artifact identity post-build.
- [ ] Record exact APK SHA-256 and evidence artifact.

**Exit gate:** APK A is a reproducible, canonical-lineage baseline.

### Task 6.2: Prepare A device state

On a real Android device:

- [ ] Install A.
- [ ] Complete first-run/device enrollment/PIN setup if applicable.
- [ ] Reach known Patch state and record Current/Previous.
- [ ] Create representative durable Manual/Greenfield state, minimum `ข้าว 65` durable readback.
- [ ] Fully close and reopen A.
- [ ] Verify the record and Patch state still exist before upgrade.
- [ ] Record device evidence without exposing sensitive secrets.

**Exit gate:** A has known pre-upgrade durable state to protect.

---

## Phase 7 — Produce Controlled APK B Candidate

### Task 7.1: Build B from newer source

- [ ] Use same package ID.
- [ ] Use exact same canonical signer.
- [ ] Set versionCode `N+1` or higher.
- [ ] Build and run post-build identity verifier.
- [ ] Compare A and B evidence: package IDs equal, signer fingerprints equal, B versionCode greater.

**Exit gate:** B is cryptographically and version-wise eligible to update A.

---

## Phase 8 — Physical A → B In-Place Upgrade Proof

### Task 8.1: Upgrade without uninstall

- [ ] Confirm A is currently installed and state from Phase 6 is readable.
- [ ] Install B directly over A using the intended owner/device route.
- [ ] Do not uninstall A and do not clear app storage.
- [ ] Record Android install result.

**PASS condition:** Android accepts B as an update to A.

**RETURN conditions:** signature mismatch, version downgrade/equal rejection, package mismatch, forced uninstall, or unexplained storage reset.

**Exit gate:** True in-place update has happened on hardware.

---

## Phase 9 — Post-Upgrade State Survival Audit

### Task 9.1: Greenfield / Manual durable truth

- [ ] Open B.
- [ ] Unlock using existing device enrollment/PIN state.
- [ ] Read back the pre-upgrade `ข้าว 65` record.
- [ ] Confirm no duplicate/recreated business truth was substituted.

### Task 9.2: Patch state continuity

- [ ] Read current Patch version after upgrade.
- [ ] Verify Current/Previous state remains coherent.
- [ ] Exercise Patch readback/rollback only where safe and already supported.
- [ ] Confirm APK upgrade did not silently reset Patch storage to packaged bootstrap state.

### Task 9.3: Device unlock/enrollment continuity

- [ ] Confirm enrollment state survived.
- [ ] Confirm existing PIN/open path works as designed.
- [ ] Confirm no silent first-run reset.

**Exit gate:** Greenfield/Manual/Patch/device-unlock state all survive the real APK upgrade.

---

## Phase 10 — Negative / Failure-Mode Proofs

### Task 10.1: Wrong signer rejection

- [ ] Produce only a safe test artifact or metadata fixture representing wrong signer; do not disturb the accepted device lineage.
- [ ] Prove CI verifier rejects it before publication.

### Task 10.2: Bad versionCode rejection

- [ ] Prove equal/lower candidate is rejected by automated gate.

### Task 10.3: Package-ID drift rejection

- [ ] Prove source/identity tests reject a changed appId without an approved migration contract.

### Task 10.4: Missing signing secrets fail closed

- [ ] Prove CI stops before APK publication if APK signer secrets are absent/malformed.

**Exit gate:** The system prevents the known ways identity continuity can regress.

---

## Phase 11 — Operational Release Contract

### Task 11.1: Define what counts as an APK release candidate

**Create/reuse:** `docs/android-apk-upgrade-proof.md`

Every candidate must record:
- source commit SHA
- package ID
- APK SHA-256
- APK signer certificate SHA-256
- versionCode/versionName
- CI run ID/result
- whether candidate is baseline A, candidate B, or later release
- physical in-place result when required
- post-upgrade state readback result

### Task 11.2: Normal update vs emergency recovery

- [ ] Document normal path as in-place APK update.
- [ ] Document Backup/Restore only as emergency recovery.
- [ ] Prevent runbook language from making uninstall/restore appear normal.

**Exit gate:** Future workers know the permanent release rule without re-deriving it.

---

## Phase 12 — Permanent Regression Gate

### Task 12.1: Add canonical invariants to CI

CI must fail on:
- package ID drift
- APK signer fingerprint drift
- absent signing material for distributable builds
- invalid/non-monotonic versionCode
- post-build identity mismatch
- publication attempted before identity verification

### Task 12.2: Keep evidence-before-claim rule

- [ ] No `PASS` from build activity alone.
- [ ] Every exact-head APK claim cites fresh CI output and artifact identity evidence.
- [ ] Physical state-survival claim requires physical-device readback.

**Exit gate:** The original omission cannot silently return in future native work.

---

## Phase 13 — P0 Closure / Native Unblock

### Final acceptance checklist

- [ ] Canonical package ID pinned.
- [ ] Stable APK signing key under durable custody.
- [ ] Public signer certificate fingerprint pinned.
- [ ] Explicit monotonic versionCode contract active.
- [ ] CI signs every distributable APK with the canonical signer.
- [ ] CI verifies signer/package/version from final APK bytes before upload.
- [ ] APK A exact artifact recorded.
- [ ] APK B exact artifact recorded.
- [ ] A and B signer fingerprints match.
- [ ] B versionCode > A versionCode.
- [ ] Physical B installs over A without uninstall.
- [ ] Greenfield/Manual durable data survives.
- [ ] Patch Current/Previous state survives coherently.
- [ ] Device unlock/enrollment state survives.
- [ ] Negative gates reject signer/version/package/secret regressions.
- [ ] Backup/Restore remains emergency-only.

**Final status rule:**
- `PASS` only when every item above has fresh evidence.
- `VERIFY` when code/CI is complete but physical evidence is incomplete.
- `BLOCKED` when any identity or upgrade prerequisite is missing.

**Only after PASS:** Native Map/GPS, Notification, Ride Engine, and other native capability work may resume.

---

# Gap Scan Against Current Known Reality

The following are known or strongly indicated gaps that execution must verify in Phase 0 rather than assume fixed:

1. **Stable APK signer contract — MISSING/BLOCKED.** Current workflow explicitly manages Patch signer secrets but builds the APK via the debug Gradle path; stable APK signer injection is not established as a canonical invariant.
2. **APK signer custody — MISSING/VERIFY.** Patch key custody exists as a separate concern; durable APK-keystore custody has not yet been proven.
3. **Pinned APK certificate fingerprint in source — MISSING.** Historical APK certificate fingerprints exist as evidence, but no canonical APK identity contract currently owns one.
4. **Explicit Android versionCode owner — MISSING/VERIFY.** Current source has app/package version metadata, but no proven monotonic Android versionCode contract has been established.
5. **Post-build APK identity verification — MISSING.** Build success currently does not itself prove package ID + signer + versionCode from final APK bytes.
6. **Artifact publication gate bound to identity — MISSING.** APK is uploaded after Gradle build; identity verification before upload is not established.
7. **Controlled canonical APK A baseline — MISSING.** Prior APK artifacts were useful proofs, but not yet designated as a stable-signer lineage baseline.
8. **Controlled canonical APK B candidate — MISSING.** No proven same-signer/higher-versionCode pair exists yet.
9. **Physical A→B in-place proof — MISSING/BLOCKED.** Prior device proof includes fresh installation; the known certificate mismatch explicitly prevented an in-place update claim.
10. **Post-upgrade Greenfield/Manual survival proof — MISSING.** Durable readback has been proven across app reopen, but not yet across canonical APK replacement A→B.
11. **Post-upgrade Patch state survival proof — MISSING.** Patch operation itself is proven; preservation of Patch state through APK update remains unproven.
12. **Post-upgrade device unlock/enrollment survival proof — MISSING.** Durable unlock behavior has been tested across reopen, not yet across a canonical APK upgrade.
13. **Negative CI regressions for APK identity — MISSING.** Wrong signer, bad versionCode, package drift, and missing APK signing secrets need explicit fail-closed gates.
14. **Operational release contract — MISSING.** The repo has Patch release procedure, but APK update lineage is not yet a permanent release rule.
15. **Native-feature blocker encoded in process — MISSING/PROCESS.** The blocker is now specified in this plan/spec, but execution/review workflow must enforce it until final PASS.

# Required Sequence

`Reality Audit → Canonical Identity → Key Custody → VersionCode → CI Signing → Final-APK Verification → APK A → Seed Durable State → APK B → In-Place Upgrade → State Survival Audit → Negative Gates → Operational Contract → Permanent CI Regression → P0 Closure`

Do not skip forward because a later step appears to work; every phase consumes evidence from the prior phase.