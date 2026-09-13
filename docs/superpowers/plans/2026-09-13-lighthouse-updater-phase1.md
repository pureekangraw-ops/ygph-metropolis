# LIGHTHOUSE Updater Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the normal Android install-over path on a physical Owner device using the current merged LIGHTHOUSE application before any in-app updater is implemented.

**Architecture:** Reuse the existing Android owner-build spine instead of creating a second release mechanism. The current `main` already packages `lighthouse-next`, signs with the canonical LIGHTHOUSE signer, enforces package/version identity, records SHA-256/provenance, and uploads an owner-test APK. Phase 1 therefore adds only missing acceptance evidence/guardrails, produces a signed candidate, and stops at the physical-device gate.

**Tech Stack:** Node.js 22, Capacitor 8.5.0, Java 21, Android Gradle tooling, GitHub Actions, `zipalign`, `apksigner`, `aapt`, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-13-lighthouse-updater-design.md`

## Global Constraints

- Application ID remains `com.yggdrasil.lighthouse`.
- Signer certificate SHA-256 remains `aae608a7ddab0dbfccc1d35e817c5683b3c64b90ab581a4b74867db54e0351ce`.
- `versionCode` is the update ordering authority and must be strictly greater than the baseline installed candidate.
- Current repository candidate is `baselineVersionCode: 1007`, `versionCode: 1008`, `versionName: 1.0.0-owner.3`.
- Product payload remains the exact staged `lighthouse-next` + required Greenfield runtime closure.
- No `REQUEST_INSTALL_PACKAGES` permission is added in Phase 1.
- Do not modify CHAT Intent, MANUAL owners, Ledger, Calendar, Store, Ride, or business-state semantics.
- Do not update `release/lighthouse-update.json` in Phase 1; its existing `versionCode: 1005` data is legacy release-channel evidence, not the authority for the owner-test candidate.
- Do not merge a convenience updater implementation before the physical install-over gate is PASS.
- CI success does not prove local-data persistence across a real Android update.

---

### Task 1: Lock the Phase 1 candidate contract

**Files:**
- Modify: `tests/greenfield-lighthouse-apk-identity-contract.test.cjs`
- Test: `android-shell/test/apk-version-contract.test.mjs`
- Read-only authority: `android-shell/version.json`
- Read-only authority: `android-shell/apk-identity.json`

**Interfaces:**
- Consumes: `assertUpgradeVersion({ baselineVersionCode, candidateVersionCode })` from `android-shell/tools/set-android-version.mjs`.
- Produces: regression evidence that vc1008 is an owner-test candidate over vc1007 and that package/signer authority is unchanged.

- [ ] **Step 1: Add the failing candidate-policy assertion**

Add an assertion that the Phase 1 repository candidate is exactly the approved current owner-test tuple:

```js
assert.deepEqual(
  {
    baselineVersionCode: version.baselineVersionCode,
    versionCode: version.versionCode,
    versionName: version.versionName,
  },
  {
    baselineVersionCode: 1007,
    versionCode: 1008,
    versionName: '1.0.0-owner.3',
  },
);
```

Also retain this fail-closed check:

```js
assert.throws(() => assertUpgradeVersion({
  baselineVersionCode: 1008,
  candidateVersionCode: 1008,
}), /APK_VERSION_NOT_MONOTONIC/);
```

- [ ] **Step 2: Run focused tests**

Run:

```sh
node --test tests/greenfield-lighthouse-apk-identity-contract.test.cjs
cd android-shell && node --test test/apk-version-contract.test.mjs test/apk-identity-contract.test.mjs test/apk-verifier.test.mjs
```

Expected: PASS. If the repository candidate changed since this plan was written, stop and update the baseline/candidate pair before device testing; do not silently reinterpret vc1008.

- [ ] **Step 3: Commit only if a regression assertion was needed**

```sh
git add tests/greenfield-lighthouse-apk-identity-contract.test.cjs
git commit -m "test: lock LIGHTHOUSE owner-test update candidate"
```

If the current tests already enforce the exact tuple with equivalent coverage, make no code change for this task.

---

### Task 2: Add a machine-readable physical acceptance record

**Files:**
- Create: `docs/acceptance/lighthouse-install-over-vc1008.json`
- Create: `tests/greenfield-lighthouse-install-over-acceptance.test.cjs`

**Interfaces:**
- Produces: a repository-visible acceptance object whose `status` remains `VERIFY` until the Owner performs the install-over test.
- Consumes: package/signer/version authority from `android-shell/apk-identity.json` and `android-shell/version.json`.

- [ ] **Step 1: Write the failing acceptance-schema test**

Create `tests/greenfield-lighthouse-install-over-acceptance.test.cjs`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const acceptancePath = path.join(ROOT, 'docs/acceptance/lighthouse-install-over-vc1008.json');

test('vc1008 physical install-over evidence starts VERIFY and names every owner gate', () => {
  const record = JSON.parse(fs.readFileSync(acceptancePath, 'utf8'));
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.applicationId, 'com.yggdrasil.lighthouse');
  assert.equal(record.candidateVersionCode, 1008);
  assert.equal(record.status, 'VERIFY');
  assert.deepEqual(Object.keys(record.checks).sort(), [
    'androidAcceptedInstallOver',
    'appLaunches',
    'chatManualSettingsSurface',
    'launcherIdentity',
    'localStateSurvives',
    'pinWorks',
  ].sort());
  for (const value of Object.values(record.checks)) assert.equal(value, 'VERIFY');
  assert.equal(record.apkSha256, null);
  assert.equal(record.workflowRunId, null);
});
```

- [ ] **Step 2: Run test and verify RED**

```sh
node --test tests/greenfield-lighthouse-install-over-acceptance.test.cjs
```

Expected: FAIL because the record does not exist.

- [ ] **Step 3: Create the acceptance record**

Create `docs/acceptance/lighthouse-install-over-vc1008.json` exactly as:

```json
{
  "schemaVersion": 1,
  "applicationId": "com.yggdrasil.lighthouse",
  "baselineVersionCode": 1007,
  "candidateVersionCode": 1008,
  "candidateVersionName": "1.0.0-owner.3",
  "workflowRunId": null,
  "sourceCommit": null,
  "apkSha256": null,
  "status": "VERIFY",
  "checks": {
    "androidAcceptedInstallOver": "VERIFY",
    "appLaunches": "VERIFY",
    "chatManualSettingsSurface": "VERIFY",
    "pinWorks": "VERIFY",
    "localStateSurvives": "VERIFY",
    "launcherIdentity": "VERIFY"
  }
}
```

- [ ] **Step 4: Run test and verify GREEN**

```sh
node --test tests/greenfield-lighthouse-install-over-acceptance.test.cjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```sh
git add docs/acceptance/lighthouse-install-over-vc1008.json tests/greenfield-lighthouse-install-over-acceptance.test.cjs
git commit -m "test: add LIGHTHOUSE physical install-over gate"
```

---

### Task 3: Re-verify the existing owner-build pipeline before producing the APK

**Files:**
- Test/read: `.github/workflows/lighthouse-owner-build.yml`
- Test/read: `android-shell/tools/verify-apk-identity.mjs`
- Test/read: `android-shell/test/android-security-verifier.test.mjs`
- Test/read: `android-shell/test/lighthouse-next-package.test.mjs`

**Interfaces:**
- Consumes: current `main` source and repository secrets for the canonical signer.
- Produces: confidence that the manual owner-build will package current `main`, not the design branch, and will emit signed APK + identity/security evidence.

- [ ] **Step 1: Run repository and Android gates on the branch**

```sh
npm test
cd android-shell
npm install --no-audit --no-fund
node --test test/*.test.mjs
npm run app:stage-next
```

Expected: all tests PASS; staging contains `lighthouse-next` and Greenfield runtime byte-identically and excludes legacy root app payload.

- [ ] **Step 2: Verify updater-only native permission is still forbidden**

Run:

```sh
cd android-shell
node --test test/android-security-verifier.test.mjs
```

Expected: PASS, including the assertion that `android.permission.REQUEST_INSTALL_PACKAGES` is rejected in the Phase 1 native surface.

- [ ] **Step 3: Verify owner-build source and outputs**

Confirm `.github/workflows/lighthouse-owner-build.yml` still contains:

```yaml
with:
  ref: main
```

and uploads all of:

```text
android-shell/android/app/build/outputs/apk/release/lighthouse-release.apk
android-shell/release/apk-identity-evidence.json
android-shell/release/android-security-evidence.json
android-shell/IP-NOTICE.md
```

No workflow edit is needed if these contracts remain true.

---

### Task 4: Produce and verify the signed owner-test APK

**Files:**
- Generated artifact: `lighthouse-release.apk`
- Generated evidence: `apk-identity-evidence.json`
- Generated evidence: `android-security-evidence.json`
- Update after artifact verification: `docs/acceptance/lighthouse-install-over-vc1008.json`

**Interfaces:**
- Consumes: GitHub Actions workflow `LIGHTHOUSE Owner Build` on `main`.
- Produces: signed owner-test APK whose evidence names exact source commit, workflow run, version, signer, package, and APK SHA-256.

- [ ] **Step 1: Dispatch `LIGHTHOUSE Owner Build` against current `main`**

Use GitHub Actions workflow `lighthouse-owner-build.yml`. It is `workflow_dispatch` only; do not fake a build by reusing an old APK artifact.

Expected build identity before device use:

```json
{
  "applicationId": "com.yggdrasil.lighthouse",
  "versionCode": 1008,
  "versionName": "1.0.0-owner.3",
  "channel": "owner-test"
}
```

The signer SHA-256 must equal:

```text
aae608a7ddab0dbfccc1d35e817c5683b3c64b90ab581a4b74867db54e0351ce
```

- [ ] **Step 2: Inspect the completed workflow**

Required successful steps include:

```text
Run Android shell contracts
Stage owner-approved LIGHTHOUSE next
Apply canonical Android version
Verify generated Android security
Materialize canonical APK signer
Verify final APK identity and build provenance
Upload owner-test APK
```

Any failed or skipped required step blocks physical testing.

- [ ] **Step 3: Download and verify artifact evidence**

Read `apk-identity-evidence.json` from the artifact and record these exact fields into `docs/acceptance/lighthouse-install-over-vc1008.json`:

```text
workflowRunId
sourceCommit
apkSha256
```

Do not change `status` or any physical `checks` from `VERIFY` yet.

- [ ] **Step 4: Commit artifact metadata only**

```sh
git add docs/acceptance/lighthouse-install-over-vc1008.json
git commit -m "docs: record LIGHTHOUSE vc1008 owner-test artifact"
```

Do not commit the APK binary or signing material.

---

### Task 5: Execute the Owner physical install-over gate

**Files:**
- Update: `docs/acceptance/lighthouse-install-over-vc1008.json`

**Interfaces:**
- Consumes: verified signed vc1008 APK artifact.
- Produces: `PASS`, `FAIL`, or continued `VERIFY` for Phase 1.

- [ ] **Step 1: Prepare recognizable pre-update state on the existing canonical app**

Before installing vc1008, create state that can be unambiguously read back afterward. Minimum evidence:

```text
PIN works before update
one recognizable durable Ledger/Manual datum exists
current app remains installed; do not uninstall
```

Do not use a datum that exists only in a temporary UI field.

- [ ] **Step 2: Install vc1008 over the existing app without uninstalling**

Android must offer an update/install-over path for the same app. If Android reports a signature conflict, package conflict, or downgrade, set:

```json
"androidAcceptedInstallOver": "FAIL",
"status": "FAIL"
```

and stop. Do not uninstall as a workaround because that destroys the evidence this phase exists to prove.

- [ ] **Step 3: Launch and verify product surface**

After installation, confirm all of:

```text
app launches normally
root navigation is CHAT / MANUAL / SETTINGS
PIN entry succeeds
launcher label is LIGHTHOUSE
launcher icon remains the approved lighthouse identity
```

Mark each corresponding check `PASS` or `FAIL` from direct observation.

- [ ] **Step 4: Read back pre-update state**

Open the relevant MANUAL/Ledger surface and confirm the recognizable pre-update datum remains intact. If it is missing, set:

```json
"localStateSurvives": "FAIL",
"status": "FAIL"
```

and do not begin Phase 2.

- [ ] **Step 5: Finalize Phase 1 status**

Only when every check is `PASS`, set:

```json
"status": "PASS"
```

If any item cannot be observed, keep it `VERIFY` and keep overall status `VERIFY`.

- [ ] **Step 6: Commit Owner acceptance evidence**

```sh
git add docs/acceptance/lighthouse-install-over-vc1008.json
git commit -m "docs: record LIGHTHOUSE physical install-over acceptance"
```

---

### Task 6: Gate Phase 2 updater planning on physical PASS

**Files:**
- Read: `docs/acceptance/lighthouse-install-over-vc1008.json`
- Read: `release/lighthouse-update.json`
- Future plan only after PASS: `docs/superpowers/plans/2026-09-13-lighthouse-updater-phase2.md`

**Interfaces:**
- Consumes: Phase 1 acceptance record.
- Produces: permission to create the separate Phase 2 in-app updater implementation plan.

- [ ] **Step 1: Verify physical status programmatically**

Run:

```sh
node -e "const a=require('./docs/acceptance/lighthouse-install-over-vc1008.json'); if(a.status!=='PASS'||Object.values(a.checks).some(v=>v!=='PASS')) process.exit(1)"
```

Expected: exit code `0` only after complete physical acceptance.

- [ ] **Step 2: Stop if Phase 1 is not PASS**

Do not add updater permission, native installer bridge, Settings update UI, or manifest-download code while the record is `VERIFY` or `FAIL`.

- [ ] **Step 3: After PASS, write a separate Phase 2 implementation plan**

The Phase 2 plan must consume the existing `release/lighthouse-update.json` fields:

```text
versionName
versionCode
minVersionCode
apkUrl
sha256
sizeBytes
```

and must require byte-size + SHA-256 verification before installer handoff. It must not treat the existing legacy `versionCode: 1005` manifest entry as newer than vc1008.

---

## Self-Review

- **Spec coverage:** Phase 1 covers canonical package/signer/version, exact owner-build source, signed APK hash/provenance, physical install-over, PIN, surface, launcher identity, and local-state persistence. Phase 2 remains explicitly blocked until all physical checks PASS.
- **Current-state accuracy:** The repo already has a working Android shell and owner-build workflow, so this plan does not recreate them. Current version authority is vc1008 over baseline vc1007.
- **Security boundary:** `REQUEST_INSTALL_PACKAGES` remains forbidden in Phase 1; no updater native permission or installer bridge is introduced early.
- **No placeholder implementation:** Unknown device-only outcomes are represented as explicit `VERIFY` evidence states, not assumed success.
- **Type consistency:** Acceptance record fields and status values are defined once and reused across Tasks 2, 4, 5, and 6.
