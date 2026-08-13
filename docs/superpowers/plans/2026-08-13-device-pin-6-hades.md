# METROPOLIS Device PIN 6 + HADES Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ordinary 12-character daily Vault-passphrase unlock with a local PIN of at least 6 characters while preserving the existing 12-character Vault passphrase and all current Vault crypto/backup compatibility.

**Architecture:** Add a focused `greenfield/device-unlock.mjs` that stores a non-extractable AES-GCM device key plus a sealed Vault-passphrase credential under separate keys in the existing Greenfield object store. The PIN only derives authenticated binding data; it never becomes the Vault PBKDF2 secret. `greenfield/runtime.mjs` remains the only root-UI facade and exposes inspect/enroll/open-with-PIN operations. Enrollment verifies the existing Vault passphrase before writing device records and never rewrites `current`.

**Tech Stack:** JavaScript ES modules, Web Crypto API, IndexedDB structured-clone `CryptoKey`, Node test runner, existing Greenfield runtime/persistence/backup modules, GitHub Actions deployment gate.

## Global Constraints

- Local PIN minimum: `6` characters.
- Existing Vault passphrase minimum remains `12` characters.
- Existing Vault PBKDF2-SHA256 iterations remain exactly `600000`.
- Existing Vault AES-GCM 256-bit / 128-bit tag / AAD / format / version remain unchanged.
- Device key must be AES-GCM 256-bit, non-extractable, usages `encrypt` and `decrypt` only.
- Device-unlock PIN binding uses PBKDF2-SHA256 `600000` iterations with a random 16-byte salt.
- Enrollment must verify the current Vault decrypts before writing any device-unlock records.
- Enrollment must not rewrite the raw `current` Vault value.
- Wrong PIN, wrong Vault passphrase, partial enrollment, or malformed credential must fail closed and perform no durable write.
- Device key, PIN, and plaintext Vault passphrase must never appear in diagnostics, logs, backups, or persisted plaintext.
- Evidence/Restore remain explicit secondary recovery actions and are never auto-triggered.
- Legacy `stock-pocket-secure` remains untouched.

---

### Task 1: Lock device-unlock security contract with failing tests

**Files:**
- Create: `tests/greenfield-device-unlock.test.cjs`
- Modify: `tests/greenfield-functional-shell.test.cjs`
- Modify: `tests/greenfield-hard-cut.test.cjs`

**Interfaces:**
- Consumes: existing `createMemoryVaultStore`, `commitEncryptedState`, `readEncryptedState`, `createGreenfieldState`.
- Produces: test contract for `inspectDeviceUnlock`, `enrollDeviceUnlock`, `unlockVaultPassphrase`, runtime facade functions, and UI IDs.

- [ ] **Step 1: Write failing module tests**

Create tests that import `../greenfield/device-unlock.mjs` and require:

```js
const {
  DEVICE_UNLOCK_KEY,
  DEVICE_UNLOCK_CREDENTIAL,
  inspectDeviceUnlock,
  enrollDeviceUnlock,
  unlockVaultPassphrase,
} = await import('../greenfield/device-unlock.mjs');
```

Cover these exact behaviors:

```js
await assert.rejects(
  () => enrollDeviceUnlock({ store, vaultPassphrase:'correct horse battery staple', pin:'12345' }),
  /DEVICE_PIN_TOO_SHORT/
);
```

```js
assert.deepEqual(await inspectDeviceUnlock({ store }), { status:'UNENROLLED' });
```

```js
const vaultBefore = await store.get('current');
await enrollDeviceUnlock({ store, vaultPassphrase, pin:'123456' });
assert.deepEqual(await store.get('current'), vaultBefore);
assert.equal((await inspectDeviceUnlock({ store })).status, 'ENROLLED');
assert.equal(await unlockVaultPassphrase({ store, pin:'123456' }), vaultPassphrase);
```

```js
await assert.rejects(() => unlockVaultPassphrase({ store, pin:'654321' }), /DEVICE_PIN_INVALID/);
```

```js
await store.put(DEVICE_UNLOCK_KEY, await store.get(DEVICE_UNLOCK_KEY));
await store.put(DEVICE_UNLOCK_CREDENTIAL, null);
assert.deepEqual(await inspectDeviceUnlock({ store }), { status:'INCOMPLETE' });
```

Use a store spy for failed enrollment and assert no `device-unlock:*` key is written when `readEncryptedState` fails with `GREENFIELD_VAULT_DECRYPT_FAILED`.

- [ ] **Step 2: Add UI hierarchy RED assertions**

Update `greenfield-functional-shell.test.cjs` to require:

```js
assert.match(gate, /id="devicePin"[^>]*minlength="6"/);
assert.doesNotMatch(gate, /id="passphrase"/);
assert.match(gate, /id="recoveryPassphrase"[^>]*minlength="12"/);
assert.match(gate, /id="enrollDeviceBtn"/);
```

and require unlock to remain the only `.primary-action` in the primary gate path.

- [ ] **Step 3: Add hard-cut module publication RED assertions**

Require `greenfield/device-unlock.mjs` to be referenced by `greenfield/runtime.mjs`, included in `sw.js`, `RELEASE_MANIFEST.json.productionFiles`, `.assetsignore`, and `package.json` syntax checks while root `app.mjs` still imports only `./greenfield/runtime.mjs`.

- [ ] **Step 4: Run tests and verify RED**

Run:

```bash
npm test
```

Expected: failures for missing `greenfield/device-unlock.mjs`, missing device-PIN UI IDs, and missing publication/syntax entries. Existing unrelated tests should remain green.

---

### Task 2: Implement the device-unlock cryptographic boundary

**Files:**
- Create: `greenfield/device-unlock.mjs`
- Test: `tests/greenfield-device-unlock.test.cjs`

**Interfaces:**
- Consumes: `readEncryptedState` from `greenfield/persistence.mjs`, generic `store.get/put`.
- Produces:
  - `DEVICE_UNLOCK_KEY = 'device-unlock:key:v1'`
  - `DEVICE_UNLOCK_CREDENTIAL = 'device-unlock:credential:v1'`
  - `inspectDeviceUnlock({store}) -> {status:'UNENROLLED'|'ENROLLED'|'INCOMPLETE'}`
  - `enrollDeviceUnlock({store,vaultPassphrase,pin}) -> {status:'ENROLLED'}`
  - `unlockVaultPassphrase({store,pin}) -> string`

- [ ] **Step 1: Implement validation and constants**

Use:

```js
export const DEVICE_UNLOCK_KEY = 'device-unlock:key:v1';
export const DEVICE_UNLOCK_CREDENTIAL = 'device-unlock:credential:v1';
export const DEVICE_UNLOCK_FORMAT = 'ygph-metropolis-device-unlock';
export const DEVICE_UNLOCK_VERSION = 1;
export const DEVICE_PIN_MIN_LENGTH = 6;
export const DEVICE_PIN_PBKDF2_ITERATIONS = 600000;
```

`pin.length < 6` throws `DEVICE_PIN_TOO_SHORT`.

- [ ] **Step 2: Implement non-extractable device key generation**

Use:

```js
crypto.subtle.generateKey(
  { name:'AES-GCM', length:256 },
  false,
  ['encrypt','decrypt']
)
```

Tests must inspect the returned/stored `CryptoKey` and assert `extractable === false`, algorithm name `AES-GCM`, length `256`, and exact usages.

- [ ] **Step 3: Implement PIN binding**

Generate a random 16-byte salt. Import the UTF-8 PIN as PBKDF2 key material and derive 256 binding bits using SHA-256 and exactly 600000 iterations. Do not persist the derived binding separately.

- [ ] **Step 4: Seal the Vault passphrase**

Generate a random 12-byte IV. Build AAD by concatenating UTF-8 `ygph-metropolis-device-unlock-v1` with the 32-byte PIN binding. Encrypt the UTF-8 Vault passphrase with the non-extractable device key under AES-GCM 128-bit tag.

Persist only the credential envelope:

```js
{
  format:'ygph-metropolis-device-unlock',
  version:1,
  pinKdf:{ name:'PBKDF2', hash:'SHA-256', iterations:600000, salt:'<base64>' },
  cipher:{ name:'AES-GCM', iv:'<base64>', tagLength:128 },
  ciphertext:'<base64>'
}
```

- [ ] **Step 5: Make enrollment verify-first and write-last**

Exact order:

```js
await readEncryptedState({ store, passphrase:vaultPassphrase });
const existingKey = await store.get(DEVICE_UNLOCK_KEY);
const key = existingKey || await generateDeviceKey();
const credential = await sealCredential({ key, vaultPassphrase, pin });
await store.put(DEVICE_UNLOCK_KEY, key);
await store.put(DEVICE_UNLOCK_CREDENTIAL, credential);
```

If the first line fails, no device-unlock put may occur.

- [ ] **Step 6: Implement unlock and malformed-state fail-closed behavior**

`inspectDeviceUnlock` returns `INCOMPLETE` if exactly one of the two records exists. `unlockVaultPassphrase` requires both records, validates credential metadata, derives the PIN binding, and decrypts. AES authentication failure maps to `DEVICE_PIN_INVALID`; explicit metadata errors remain explicit.

- [ ] **Step 7: Run module tests**

Run:

```bash
node --test tests/greenfield-device-unlock.test.cjs
```

Expected: PASS.

---

### Task 3: Expose device unlock only through the Greenfield runtime facade

**Files:**
- Modify: `greenfield/runtime.mjs`
- Modify: `tests/greenfield-runtime.test.cjs`

**Interfaces:**
- Consumes: `inspectDeviceUnlock`, `enrollDeviceUnlock`, `unlockVaultPassphrase`, `openGreenfieldVaultStore`.
- Produces:
  - `inspectGreenfieldDeviceUnlock({indexedDBImpl})`
  - `enrollGreenfieldDeviceUnlock({vaultPassphrase,pin,indexedDBImpl})`
  - `openGreenfieldRuntimeWithDevicePin({pin,indexedDBImpl,lockManager,now})`

- [ ] **Step 1: Add RED runtime facade tests**

Require a fake IndexedDB-backed store or injected store seam to prove facade behavior without importing `device-unlock.mjs` from root UI tests.

- [ ] **Step 2: Implement facade functions**

`openGreenfieldRuntimeWithDevicePin` opens the browser store once, calls `unlockVaultPassphrase`, creates the existing runtime with the returned passphrase, and keeps the passphrase only in closure memory. Closing runtime closes the store.

`enrollGreenfieldDeviceUnlock` opens a store, delegates enrollment, and closes it in `finally`.

`inspectGreenfieldDeviceUnlock` opens a store, delegates inspection, and closes it in `finally`.

- [ ] **Step 3: Preserve direct recovery runtime contract**

Do not change:

```js
if (typeof passphrase !== 'string' || passphrase.length < 12) throw new Error('PASSPHRASE_TOO_SHORT');
```

and do not change any persistence crypto constants.

- [ ] **Step 4: Run runtime and persistence tests**

Run:

```bash
node --test tests/greenfield-runtime.test.cjs tests/greenfield-persistence.test.cjs tests/greenfield-device-unlock.test.cjs
```

Expected: PASS.

---

### Task 4: Replace daily passphrase gate with local PIN and preserve recovery

**Files:**
- Modify: `index.html`
- Modify: `ui/app.mjs`
- Modify: `tests/greenfield-functional-shell.test.cjs`

**Interfaces:**
- Consumes: runtime facade functions from Task 3.
- Produces: primary device-PIN unlock UI plus secondary one-time enrollment/recovery UI.

- [ ] **Step 1: Update locked-gate HTML**

Primary section:

```html
<label>รหัสเข้าแอป <input id="devicePin" type="password" minlength="6" autocomplete="current-password"></label>
<button id="unlockBtn" class="primary-action">ปลดล็อก</button>
```

Inside existing `details#recoveryAccess` add:

```html
<label>รหัสกู้คืน Vault <input id="recoveryPassphrase" type="password" minlength="12" autocomplete="current-password"></label>
<button id="enrollDeviceBtn" class="secondary">ตั้งรหัสเข้าแอปบนเครื่องนี้</button>
```

Keep Evidence/Restore controls in the same secondary disclosure.

- [ ] **Step 2: Split UI secret readers**

Implement:

```js
function devicePin() {
  const value = $('devicePin').value;
  if (value.length < 6) throw new Error('รหัสเข้าแอปต้องมีอย่างน้อย 6 ตัวอักษร');
  return value;
}

function recoveryPassphrase() {
  const value = $('recoveryPassphrase').value;
  if (value.length < 12) throw new Error('รหัสกู้คืนต้องมีอย่างน้อย 12 ตัวอักษร');
  return value;
}
```

- [ ] **Step 3: Route normal unlock through device PIN**

Use `openGreenfieldRuntimeWithDevicePin({ pin:devicePin() })`, read state, then `openWorkspace()`.

Map `DEVICE_UNLOCK_NOT_ENROLLED` to a clear Thai gate message that directs the owner to `กู้คืนการเข้าถึง` without auto-opening or auto-running recovery.

- [ ] **Step 4: Add explicit enrollment action**

`enrollDeviceBtn` calls:

```js
await enrollGreenfieldDeviceUnlock({
  vaultPassphrase:recoveryPassphrase(),
  pin:devicePin(),
});
```

Then open the runtime via `openGreenfieldRuntimeWithDevicePin` and enter workspace. If legacy Vault decrypt returns `GREENFIELD_VAULT_DECRYPT_FAILED`, show that error and do not mutate/reset/import.

- [ ] **Step 5: Preserve Evidence/Restore recovery path**

When Evidence/Restore creates or restores a Vault, use `recoveryPassphrase()` with the existing direct `openGreenfieldRuntime({passphrase})` path. Do not auto-enroll device unlock in these recovery actions; enrollment remains explicit.

- [ ] **Step 6: Keep System Lock non-destructive**

On `systemLockBtn`, clear runtime/state and `devicePin` in memory only. Do not delete device-unlock records and do not clear `recoveryPassphrase` unless desired for UI secrecy.

- [ ] **Step 7: Run functional-shell tests**

Run:

```bash
node --test tests/greenfield-functional-shell.test.cjs
```

Expected: PASS.

---

### Task 5: Publish/cache the new module without changing Vault release identity

**Files:**
- Modify: `sw.js`
- Modify: `RELEASE_MANIFEST.json`
- Modify: `.assetsignore`
- Modify: `package.json`
- Modify: `tests/greenfield-hard-cut.test.cjs`

**Interfaces:**
- Consumes: `greenfield/device-unlock.mjs` from Task 2.
- Produces: production asset reachability and syntax coverage.

- [ ] **Step 1: Add device-unlock module to Service Worker shell**

Append `./greenfield/device-unlock.mjs` to `SHELL` and bump only the cache generation suffix (for example `r2` to `r3`) so old cached module lists are replaced. Do not change `RELEASE='5.1.0-functional-rc1'` unless release policy explicitly requires it.

- [ ] **Step 2: Add production file allowlist entries**

Add `greenfield/device-unlock.mjs` to `RELEASE_MANIFEST.json.productionFiles` and the exact `!/greenfield/device-unlock.mjs` allowlist line in `.assetsignore`.

- [ ] **Step 3: Add syntax gate coverage**

Append `node --check greenfield/device-unlock.mjs` to the existing `check:syntax` command without removing current modules.

- [ ] **Step 4: Run hard-cut tests**

Run:

```bash
node --test tests/greenfield-hard-cut.test.cjs tests/greenfield-sw-update.test.cjs
```

Expected: PASS.

---

### Task 6: Full verification and HADES final audit

**Files:**
- Review: all changed source/test/spec/plan files.
- No production modifications during HADES audit.

**Interfaces:**
- Consumes: completed branch diff.
- Produces: CI evidence plus HADES `PASS / WARNING / BLOCKER` decision.

- [ ] **Step 1: Run full local/repository gate**

Run:

```bash
npm run deploy:gate
```

Expected: all Greenfield tests PASS, syntax PASS, UTF-8 PASS.

- [ ] **Step 2: Review diff for source-of-truth and destructive behavior**

Confirm no changes to:
- `DB_NAME`, `DB_VERSION`, `DB_STORE`, `VAULT_KEY`, `VAULT_FORMAT`, `VAULT_VERSION`.
- Vault `PBKDF2_ITERATIONS`, AES-GCM parameters, or AAD.
- backup format/version.
- Evidence package identity/revision.
- legacy DB behavior.

Confirm enrollment never writes `current`.

- [ ] **Step 3: HADES final read-only audit**

Audit exactly:
- 6-character PIN never reaches `readEncryptedState`, `commitEncryptedState`, or Vault `deriveKey` as the Vault passphrase.
- device key is non-extractable and never exported/logged/backed up.
- no plaintext PIN/passphrase persistence.
- verify-first/write-last enrollment.
- wrong PIN/wrong Vault passphrase/partial state fail closed.
- Evidence/Restore remain explicit.
- Service Worker/publication contains no legacy asset regression.

Any HADES `BLOCKER` stops merge.

- [ ] **Step 4: Open PR and wait for Greenfield safety gate**

Create PR from `security/passphrase-min-6-hades` to `main`. Keep draft until CI and HADES are both clear.

- [ ] **Step 5: Merge only after green gate and HADES no-BLOCKER**

Merge with expected head SHA. Follow `main` workflow until both `Greenfield safety gate` and `Deploy YGPH METROPOLIS Greenfield to Cloudflare` conclude `success`.

- [ ] **Step 6: Device readback**

On the owner device, confirm:
1. primary screen shows 6-character local PIN, not the 12-character daily Vault passphrase;
2. one-time enrollment refuses wrong legacy Vault passphrase without changing data;
3. after successful enrollment, relock/reopen works with local PIN;
4. balance/revision/schema match pre-enrollment durable truth;
5. backup still exports the same Greenfield backup envelope without device credentials.
