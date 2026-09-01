# App Existence Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise LIGHTHOUSE lifecycle, backup/recovery, and generated Android security foundations to production-grade standards while preserving honest physical-device gates.

**Architecture:** Keep APK identity continuity in PR #96 as the lineage owner. This branch adds independent hardening contracts: separate backup secrets from backup payloads, verify generated Android native security reality before APK publication, strengthen automatable lifecycle/durable-state proofs, and define exact physical evidence gates for claims automation cannot prove.

**Tech Stack:** Node.js 22, Node test runner, Capacitor 8.5, Android/Gradle, GitHub Actions, Android build tools.

**Spec:** `docs/superpowers/specs/2026-09-01-app-existence-hardening-design.md`

## Global Constraints

- Test phase uses production-grade contracts; no temporary weak-security path.
- No new product capability or architecture expansion.
- No production deploy/store publication.
- PR #96 remains authoritative for APK A -> B identity continuity.
- CI/emulator evidence never substitutes for physical-device claims.
- Existing Greenfield/Manual business semantics and Patch trust semantics remain unchanged.
- New backup exports must not embed usable plaintext recovery secrets.
- Legacy embedded-key backups must remain recoverable through an explicit compatibility path.
- Every code change follows RED -> GREEN -> full relevant suite -> evidence update.

---

### Task 1: Harden backup secret boundary

**Files:**
- Modify: `tests/greenfield-backup.test.cjs`
- Modify: `tests/greenfield-restore-compat.test.cjs`
- Modify: `greenfield/backup.mjs`
- Modify: `greenfield/restore-compat.mjs`

**Interfaces:**
- `exportGreenfieldBackup({ store, exportedAt })` produces an encrypted backup envelope without plaintext `recoveryKey`.
- `restoreGreenfieldBackup({ store, backup, passphrase, allowOverwrite })` remains the canonical restore primitive.
- Legacy embedded-key compatibility remains isolated in `prepareBackupForRestore` and is marked legacy.

- [ ] Write a failing test asserting a current backup envelope never contains `recoveryKey`, even when old callers attempt to pass one.
- [ ] Write a failing test asserting possession of the backup alone is insufficient for current-format restore.
- [ ] Keep a legacy fixture/test proving old embedded-key backup can still be prepared for restore and is flagged legacy.
- [ ] Run `node --test tests/greenfield-backup.test.cjs tests/greenfield-restore-compat.test.cjs`; confirm RED is caused by current embedded-key behavior.
- [ ] Remove current-format embedded-key export/restore behavior from `greenfield/backup.mjs` while preserving `restoreGreenfieldBackup`.
- [ ] Update `restore-compat.mjs` so embedded-key handling is compatibility-only and returns `usedLegacyRecoveryCode`/legacy evidence explicitly.
- [ ] Re-run focused tests GREEN.
- [ ] Run `npm test && npm run check:syntax && npm run check:utf8`.
- [ ] Commit and update checkpoint evidence.

### Task 2: Add generated Android security verifier

**Files:**
- Create: `android-shell/tools/verify-android-security.mjs`
- Create: `android-shell/test/android-security-verifier.test.mjs`
- Modify: `android-shell/package.json`
- Modify: `.github/workflows/lighthouse-apk-debug.yml`

**Interfaces:**
- CLI: `node tools/verify-android-security.mjs <android-root> <evidence-json>`.
- Evidence contains non-secret package/application identity, requested permissions, exported component inventory, backup policy, cleartext/network policy, debuggable posture where observable, and enabled native plugin surface.
- Unknown security-sensitive values fail closed with a named error rather than silently PASS.

- [ ] Write fixture-driven RED tests for exported component detection, unexpected permission detection, permissive backup policy, cleartext allowance, and evidence generation.
- [ ] Run `npm test` inside `android-shell`; confirm RED from missing verifier.
- [ ] Implement the minimal generated-Android verifier.
- [ ] Add an explicit baseline contract for allowed permissions/components required by the current shell only; do not infer future capabilities.
- [ ] Run focused tests GREEN and the full `android-shell` suite.
- [ ] Wire verifier after `npx cap sync android` and before release build/signing in `lighthouse-apk-debug.yml`.
- [ ] Upload security evidence beside APK identity evidence; fail before artifact publication on mismatch/unknown.
- [ ] Commit and update checkpoint evidence.

### Task 3: Strengthen automatable lifecycle/durable-state proof

**Files:**
- Modify: `android-shell/test/trusted-bootstrap.integration.test.mjs`
- Modify/create focused Greenfield lifecycle test only if a real missing automatable behavior is found.

**Interfaces:**
- Claims limited to IndexedDB reopen, session teardown/reconstruction, durable business-state readback, and stale pending-command fail-closed behavior.

- [ ] Inventory existing reopen/state-survival tests before adding code.
- [ ] Add RED only for a concrete missing automatable claim; do not duplicate already-proven reopen behavior.
- [ ] Prove durable business record survives closing the runtime/store and creating a fresh runtime/store handle over the same IndexedDB database.
- [ ] Prove pending confirmation/session-only state does not become an executable stale mutation after reconstruction.
- [ ] Run relevant integration suite and full `android-shell` suite.
- [ ] Record process-kill/force-stop/reboot as physical VERIFY, not automated PASS.

### Task 4: Physical-device evidence runbook

**Files:**
- Create: `docs/android-app-existence-physical-proof.md`
- Modify: `docs/android-apk-identity-checkpoint.md` only to link evidence ownership, not to rewrite PR #96 history.

- [ ] Define APK A baseline checks from PR #96 Phase 6.2.
- [ ] Define close/reopen, force-stop, process death/relaunch, device reboot, and durable state readback checks.
- [ ] Define backup -> controlled loss/empty target -> restore with separately held recovery material -> reopen/readback proof.
- [ ] Define APK A -> B in-place update checks without uninstall/storage clear.
- [ ] Record exact status vocabulary PROVEN / VERIFY / BLOCKED and required artifacts/screens/logs for each claim.
- [ ] Do not manufacture hardware evidence in CI.

### Task 5: Final root checkpoint

**Files:**
- Create/update: `docs/app-existence-hardening-checkpoint.md`

- [ ] Summarize App Identity, Signing/Update Identity, Lifecycle/Restore, Durable Data, Security Boundary, Backup/Recovery.
- [ ] For each root record Reality -> Evidence -> Gap -> PROVEN/VERIFY/BLOCKED.
- [ ] Cite exact source commit/workflow/device evidence.
- [ ] Keep physical-only claims VERIFY until hardware proof exists.
- [ ] Stop at review handoff; BIG sends review.
