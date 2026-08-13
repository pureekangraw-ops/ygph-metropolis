# Phase 1 Auth Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make YGPH METROPOLIS behave as one everyday password plus one emergency Recovery Code, without requiring Evidence/Backup for normal login recovery and without changing or destroying the existing encrypted business data.

**Architecture:** Keep the current Vault encryption format and treat the existing Vault passphrase as the emergency Recovery Code. Keep the everyday password as the device-unlock PIN. Add focused recovery APIs that verify the Recovery Code against the existing Vault, then atomically rebind the device-unlock credential to a new everyday password. The UI becomes a staged recovery flow: verify Recovery Code first, then set the new everyday password; Evidence/Backup stay in advanced data recovery only.

**Tech Stack:** Browser JavaScript ES modules, IndexedDB, Web Crypto AES-GCM/PBKDF2, Node `node:test`, GitHub Actions deploy gate.

## Global Constraints

- The user-visible contract is exactly one everyday password plus one emergency Recovery Code.
- Recovery Code is used only for forgotten-password recovery.
- Evidence and Backup are data-recovery tools, never normal login credentials.
- Preserve the existing Vault format, encrypted durable state, domain data, and database name/version.
- No passkeys, biometrics, profile system, notification system, visual redesign, or unrelated refactor in Phase 1.
- Invalid Recovery Code must perform zero durable credential/data writes.
- A successful password reset must make the old everyday password fail and the new password survive full close/reopen.
- No raw Vault/crypto/device-unlock identifiers may reach the user-facing auth flow.
- If data preservation proves incompatible with this model, stop rather than perform destructive migration.

---

## File Structure

- `greenfield/persistence.mjs` — extend the in-memory test store with an atomic multi-key write contract used by credential metadata.
- `greenfield/browser-store.mjs` — implement the same multi-key write contract as one IndexedDB transaction.
- `greenfield/device-unlock.mjs` — keep current crypto design, but commit key + credential atomically and support safe password rebinding through the existing Recovery Code.
- `greenfield/runtime.mjs` — expose focused `verifyGreenfieldRecoveryCode` and `resetGreenfieldDevicePassword` APIs; do not expose the internal Vault passphrase to UI code.
- `ui/app.mjs` — leave business/runtime behavior intact; remove normal forgot-password dependence on the hidden enroll button while retaining advanced Evidence/Backup data recovery.
- `app.mjs` — orchestrate staged forgot-password flow and user-facing auth errors.
- `index.html` — render staged Recovery Code → new password UI and keep Evidence/Backup under advanced data recovery.
- `tests/greenfield-device-unlock.test.cjs` — crypto/credential durability and no-write tests.
- `tests/greenfield-auth-recovery.test.cjs` — recovery API/user-contract regression tests.
- `tests/greenfield-login-ux.test.cjs` — DOM/source contract for one everyday password and staged recovery.

---

### Task 1: Make device credential replacement atomic and non-destructive

**Files:**
- Modify: `greenfield/persistence.mjs`
- Modify: `greenfield/browser-store.mjs`
- Modify: `greenfield/device-unlock.mjs`
- Modify: `tests/greenfield-device-unlock.test.cjs`

**Interfaces:**
- Consumes: existing `store.get(key)` and `store.put(key, value)`.
- Produces: `store.putMany(entries)` where `entries` is `Array<[string, unknown]>` and all entries commit as one logical operation; `enrollDeviceUnlock({ store, vaultPassphrase, pin })` continues to be the credential-rebinding primitive.

- [ ] **Step 1: Write failing tests for credential rebinding**

Add tests proving an already-enrolled store can be rebound from `old-password` to `new-password` using the existing Vault passphrase, the Vault object remains byte/logically unchanged, and the old password stops unlocking:

```js
test('re-enrollment changes only the everyday password and preserves the Vault', async () => {
  const { enrollDeviceUnlock, unlockVaultPassphrase } = await import('../greenfield/device-unlock.mjs');
  const { store } = await initializedStore();
  await enrollDeviceUnlock({ store, vaultPassphrase:VAULT_PASSPHRASE, pin:'old-password' });
  const vaultBefore = await store.get('current');

  await enrollDeviceUnlock({ store, vaultPassphrase:VAULT_PASSPHRASE, pin:'new-password' });

  assert.deepEqual(await store.get('current'), vaultBefore);
  await assert.rejects(() => unlockVaultPassphrase({ store, pin:'old-password' }), /DEVICE_PIN_INVALID/);
  assert.equal(await unlockVaultPassphrase({ store, pin:'new-password' }), VAULT_PASSPHRASE);
});
```

Add a test proving wrong Recovery Code causes no `putMany`/credential write.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test tests/greenfield-device-unlock.test.cjs
```

Expected: new atomic-write/rebinding assertions fail because stores do not yet expose/use `putMany`.

- [ ] **Step 3: Add atomic `putMany` to both stores**

In `createMemoryVaultStore()` add:

```js
async putMany(entries) {
  const next = new Map(map);
  for (const [key, value] of entries) next.set(key, structuredClone(value));
  map.clear();
  for (const [key, value] of next) map.set(key, value);
}
```

In `openGreenfieldVaultStore()` add an IndexedDB implementation that creates one `readwrite` transaction, performs every `objectStore.put(value, key)` in that transaction, resolves on `transaction.oncomplete`, and rejects on `transaction.onerror`/`transaction.onabort`.

- [ ] **Step 4: Make `enrollDeviceUnlock` commit credential metadata atomically**

After verifying the Vault and producing `key` + `credential`, replace two sequential puts with:

```js
if (typeof store.putMany !== 'function') throw new TypeError('INVALID_GREENFIELD_STORE');
await store.putMany([
  [DEVICE_UNLOCK_KEY, key],
  [DEVICE_UNLOCK_CREDENTIAL, credential],
]);
```

Do not touch the Vault itself.

- [ ] **Step 5: Run focused tests and verify GREEN**

```bash
node --test tests/greenfield-device-unlock.test.cjs
```

Expected: all device-unlock tests pass, including old-password rejection, new-password success, Vault preservation, and zero writes on invalid Recovery Code.

- [ ] **Step 6: Commit**

```bash
git add greenfield/persistence.mjs greenfield/browser-store.mjs greenfield/device-unlock.mjs tests/greenfield-device-unlock.test.cjs
git commit -m "fix: make device password rebinding atomic"
```

---

### Task 2: Add explicit Recovery Code APIs without changing Vault format

**Files:**
- Modify: `greenfield/runtime.mjs`
- Create: `tests/greenfield-auth-recovery.test.cjs`

**Interfaces:**
- Produces: `verifyGreenfieldRecoveryCode({ recoveryCode, indexedDBImpl }) -> Promise<{status:'VERIFIED'}>`.
- Produces: `resetGreenfieldDevicePassword({ recoveryCode, nextPassword, indexedDBImpl }) -> Promise<{status:'RESET'}>`.
- `recoveryCode` maps internally to the existing Vault passphrase; UI code never receives the underlying Vault state key/passphrase after verification.

- [ ] **Step 1: Write failing runtime recovery tests**

Cover these behaviors with an IndexedDB-compatible test double already used by the repository, or a minimal injected store adapter if the runtime wrapper needs a new injectable factory:

```js
await verifyGreenfieldRecoveryCode({ recoveryCode:VAULT_PASSPHRASE, indexedDBImpl });
await assert.rejects(
  () => verifyGreenfieldRecoveryCode({ recoveryCode:'wrong recovery code value', indexedDBImpl }),
  /GREENFIELD_VAULT_DECRYPT_FAILED/
);
```

Then prove reset behavior:

```js
await resetGreenfieldDevicePassword({
  recoveryCode:VAULT_PASSPHRASE,
  nextPassword:'new-password',
  indexedDBImpl,
});
const runtime = await openGreenfieldRuntimeWithDevicePin({ pin:'new-password', indexedDBImpl });
assert.ok(await runtime.readState());
runtime.close();
```

Also assert the old password fails and the raw `current` Vault value is unchanged.

- [ ] **Step 2: Run recovery tests and verify RED**

```bash
node --test tests/greenfield-auth-recovery.test.cjs
```

Expected: FAIL because the two recovery APIs do not exist.

- [ ] **Step 3: Implement `verifyGreenfieldRecoveryCode`**

Open the existing Vault store, call `readEncryptedState({ store, passphrase:recoveryCode })`, reject with `GREENFIELD_NOT_INITIALIZED` if no durable state exists, return `{ status:'VERIFIED' }`, and always close the store.

- [ ] **Step 4: Implement `resetGreenfieldDevicePassword`**

Open the existing Vault store once, validate the Recovery Code by reading the state, then call `enrollDeviceUnlock({ store, vaultPassphrase:recoveryCode, pin:nextPassword })`. Read back through `unlockVaultPassphrase({ store, pin:nextPassword })` and require exact equality with the supplied Recovery Code before returning `{ status:'RESET' }`. Always close the store.

- [ ] **Step 5: Verify GREEN**

```bash
node --test tests/greenfield-auth-recovery.test.cjs tests/greenfield-device-unlock.test.cjs
```

Expected: PASS; existing encrypted state unchanged except device-unlock metadata.

- [ ] **Step 6: Commit**

```bash
git add greenfield/runtime.mjs tests/greenfield-auth-recovery.test.cjs
git commit -m "fix: add recovery-code password reset API"
```

---

### Task 3: Replace the two-secret recovery form with a staged user flow

**Files:**
- Modify: `index.html`
- Modify: `app.mjs`
- Modify: `ui/app.mjs`
- Modify: `tests/greenfield-login-ux.test.cjs`

**Interfaces:**
- Consumes: `verifyGreenfieldRecoveryCode(...)` and `resetGreenfieldDevicePassword(...)` from Task 2.
- Produces UI states: `RECOVERY_VERIFY` and `RECOVERY_RESET` managed only in memory; Recovery Code is cleared whenever the user backs out, succeeds, or returns to normal login.

- [ ] **Step 1: Rewrite the login UX test to the locked contract and verify RED**

The normal login section must still contain exactly one input and the two actions `เข้าสู่ระบบ` / `ลืมรหัสผ่าน?`.

The recovery surface must no longer present Recovery Code and new password simultaneously. Assert two staged containers:

```js
assert.match(recoverySurface, /id="recoveryVerifyStep"/);
assert.match(recoverySurface, /id="recoveryCode"/);
assert.match(recoverySurface, /id="verifyRecoveryBtn"/);
assert.match(recoverySurface, /id="recoveryResetStep"[^>]*hidden/);
assert.match(recoverySurface, /id="recoveryNewPassword"/);
assert.match(recoverySurface, /id="recoveryConfirmPassword"/);
```

Assert normal forgot-password orchestration calls the new recovery APIs and does not trigger `importEvidenceBtn`, `restoreBtn`, or hidden device-enroll clicks.

- [ ] **Step 2: Run UX test and verify RED**

```bash
node --test tests/greenfield-login-ux.test.cjs
```

Expected: FAIL on the current simultaneous two-field recovery contract.

- [ ] **Step 3: Update `index.html` recovery markup**

Use this user-visible structure:

```html
<section id="recoveryPanel" class="panel gate hidden">
  <button id="recoveryBackBtn" class="secondary">กลับ</button>
  <h1>กู้คืนการเข้าถึง</h1>

  <div id="recoveryVerifyStep">
    <label>รหัสกู้คืน <input id="recoveryCode" type="password" minlength="12" autocomplete="off"></label>
    <button id="verifyRecoveryBtn" class="primary-action">ตรวจสอบรหัสกู้คืน</button>
  </div>

  <div id="recoveryResetStep" class="hidden">
    <label>รหัสผ่านใหม่ <input id="recoveryNewPassword" type="password" minlength="6" autocomplete="new-password"></label>
    <label>ยืนยันรหัสผ่าน <input id="recoveryConfirmPassword" type="password" minlength="6" autocomplete="new-password"></label>
    <button id="resetPasswordBtn" class="primary-action">ตั้งรหัสผ่านใหม่</button>
  </div>

  <details id="lockedAdvancedRecovery" class="gate-tools">
    <summary>กู้คืนข้อมูลขั้นสูง</summary>
    <!-- Evidence / Backup only -->
  </details>
</section>
```

Keep Evidence/Backup inside the advanced section only. Do not label Evidence as a login/recovery credential.

- [ ] **Step 4: Orchestrate staged recovery in `app.mjs`**

Import:

```js
import {
  verifyGreenfieldRecoveryCode,
  resetGreenfieldDevicePassword,
} from './greenfield/runtime.mjs';
```

Maintain a module-local `verifiedRecoveryCode = ''` only between successful verification and password reset.

`verifyRecoveryBtn` behavior:

```js
const code = $('recoveryCode').value;
await verifyGreenfieldRecoveryCode({ recoveryCode:code });
verifiedRecoveryCode = code;
$('recoveryVerifyStep').classList.add('hidden');
$('recoveryResetStep').classList.remove('hidden');
$('recoveryCode').value = '';
```

`resetPasswordBtn` behavior:

```js
if (nextPassword !== confirmPassword) throw new Error('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
await resetGreenfieldDevicePassword({ recoveryCode:verifiedRecoveryCode, nextPassword });
verifiedRecoveryCode = '';
showLogin();
gateStatus.textContent = 'ตั้งรหัสผ่านใหม่แล้ว';
```

Clear `verifiedRecoveryCode` on back, login display, and workspace open.

- [ ] **Step 5: Remove normal forgot-password dependency on hidden enroll handling in `ui/app.mjs`**

Keep `enrollGreenfieldDeviceUnlock` only where advanced data initialization still needs it, or remove its UI listener if no longer referenced. Keep Evidence/Backup handlers functional under advanced data recovery; normal `ลืมรหัสผ่าน?` must not call either handler.

- [ ] **Step 6: Keep errors user-facing**

Map internal recovery failures to user copy:

```js
GREENFIELD_VAULT_DECRYPT_FAILED -> 'รหัสกู้คืนไม่ถูกต้อง'
PASSPHRASE_TOO_SHORT -> 'รหัสกู้คืนไม่ถูกต้อง'
GREENFIELD_NOT_INITIALIZED -> 'ไม่พบข้อมูลเดิมในเครื่องนี้ หากต้องการกู้ข้อมูลให้เปิด “กู้คืนข้อมูลขั้นสูง”'
DEVICE_PIN_TOO_SHORT -> 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'
```

No raw internal identifier may remain visible.

- [ ] **Step 7: Run focused UX + recovery tests and verify GREEN**

```bash
node --test tests/greenfield-login-ux.test.cjs tests/greenfield-auth-recovery.test.cjs tests/greenfield-device-unlock.test.cjs
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add index.html app.mjs ui/app.mjs tests/greenfield-login-ux.test.cjs
git commit -m "fix: stage recovery around one emergency code"
```

---

### Task 4: Repair Change Password so Recovery Code is not required during an authenticated session

**Files:**
- Modify: `greenfield/runtime.mjs`
- Modify: `ui/app.mjs`
- Modify: `index.html`
- Modify: `tests/greenfield-auth-recovery.test.cjs`
- Modify: `tests/greenfield-login-ux.test.cjs`

**Interfaces:**
- Add runtime instance method `changeDevicePassword({ nextPassword }) -> Promise<{status:'RESET'}>` inside `createGreenfieldRuntime`; it uses the runtime's already-authenticated internal `passphrase` and never exposes it to the caller.

- [ ] **Step 1: Write failing test for authenticated password change**

After opening a runtime using the existing everyday password, call:

```js
await runtime.changeDevicePassword({ nextPassword:'changed-password' });
runtime.close();
```

Then prove old password fails and `changed-password` opens the same existing state.

- [ ] **Step 2: Verify RED**

```bash
node --test tests/greenfield-auth-recovery.test.cjs
```

Expected: FAIL because `changeDevicePassword` does not exist.

- [ ] **Step 3: Implement runtime instance method**

Inside `createGreenfieldRuntime`, use the existing authenticated `passphrase` closure:

```js
async function changeDevicePassword({ nextPassword }) {
  await enrollDeviceUnlock({ store, vaultPassphrase:passphrase, pin:nextPassword });
  const readback = await unlockVaultPassphrase({ store, pin:nextPassword });
  if (readback !== passphrase) throw new Error('DEVICE_UNLOCK_READBACK_MISMATCH');
  return { status:'RESET' };
}
```

Expose it on the frozen runtime object.

- [ ] **Step 4: Replace Settings `เปลี่ยนรหัสผ่าน` routing**

Do not lock the app and send the user to Recovery Code. Add a small authenticated change-password panel under Security with `รหัสผ่านใหม่` + `ยืนยันรหัสผ่าน`, submit through `runtime.changeDevicePassword`, clear the fields, and show `เปลี่ยนรหัสผ่านแล้ว`. The Recovery Code must not be requested.

- [ ] **Step 5: Verify GREEN**

```bash
node --test tests/greenfield-auth-recovery.test.cjs tests/greenfield-login-ux.test.cjs
```

Expected: PASS and source test confirms `changePasswordBtn` does not call `showRecovery()`.

- [ ] **Step 6: Commit**

```bash
git add greenfield/runtime.mjs ui/app.mjs index.html tests/greenfield-auth-recovery.test.cjs tests/greenfield-login-ux.test.cjs
git commit -m "fix: change password without recovery code"
```

---

### Task 5: Full user-path regression, deploy gate, and HADES scope audit

**Files:**
- Modify only if a failing test proves a Phase 1 defect.
- Inspect: `RELEASE_MANIFEST.json`, `sw.js`, workflow/release files only if the existing deploy gate requires version/cache plumbing.

**Interfaces:**
- No new product features.

- [ ] **Step 1: Add/confirm end-to-end contract tests**

The test suite must collectively prove:

```text
Open -> everyday password -> existing data -> close
Open -> same password -> existing data
Forgot password -> Recovery Code -> new password
Old password rejected
Close -> open -> new password -> existing data
Invalid Recovery Code -> zero writes
Forgot password never calls Evidence/Backup
Authenticated Change Password never requests Recovery Code
```

- [ ] **Step 2: Run full tests**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 3: Run syntax check**

```bash
npm run check:syntax
```

Expected: PASS.

- [ ] **Step 4: Run UTF-8 check**

```bash
npm run check:utf8
```

Expected: PASS.

- [ ] **Step 5: Run complete deploy gate**

```bash
npm run deploy:gate
```

Expected: PASS with no warnings/errors attributable to Phase 1.

- [ ] **Step 6: HADES diff audit**

Compare branch against `main`. Allowed change set is limited to:

```text
docs/superpowers/specs/2026-08-13-auth-repair-design.md
docs/superpowers/plans/2026-08-13-auth-repair.md
greenfield/persistence.mjs
greenfield/browser-store.mjs
greenfield/device-unlock.mjs
greenfield/runtime.mjs
index.html
app.mjs
ui/app.mjs
tests/greenfield-device-unlock.test.cjs
tests/greenfield-auth-recovery.test.cjs
tests/greenfield-login-ux.test.cjs
RELEASE_MANIFEST.json  (only if release gate requires it)
sw.js                  (only if cache/version gate requires it)
```

Stop if unrelated domain/business/UI files changed.

- [ ] **Step 7: Create/update Draft PR and report results**

PR description must state:

```text
Phase 1 Repair Only
- one everyday password
- one emergency Recovery Code
- Evidence/Backup excluded from normal login recovery
- existing Vault/data format preserved
- no passkeys/biometrics/new product features
```

Do not merge to `main` until the final HADES audit and user authorization.
