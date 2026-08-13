# METROPOLIS Local PIN 6 + Device Unlock + HADES Audit Design

## Goal

Replace the daily 12-character Vault passphrase gate with a local unlock PIN of 6 or more characters, without reducing the cryptographic strength of the encrypted Greenfield Vault. The existing Vault passphrase remains the recovery/encryption credential; the 6-character local PIN must never become the input used to derive the Vault encryption key.

## HADES pre-audit decision

The original design that changed the Vault passphrase floor from 12 to 6 is rejected as a security blocker because the passphrase directly feeds PBKDF2 for the encrypted Vault and would therefore weaken resistance to offline guessing.

The approved repair is to separate responsibilities:
- **Local PIN**: 6 or more characters, used only to unlock this browser/device.
- **Vault passphrase**: existing long recovery/encryption credential, minimum 12 characters, unchanged.
- **Device key**: random non-extractable AES-GCM 256-bit WebCrypto key persisted by the browser in the Greenfield IndexedDB store.

The local PIN is never used to encrypt/decrypt Greenfield state and is never used as the Vault PBKDF2 input.

## Current incident evidence

The Greenfield cryptographic contract at the last verified pre-Functional-Shell production commit and at current production is unchanged: same database identity, Vault format/version, PBKDF2-SHA256 600000 iterations, AES-GCM parameters, and AAD. Therefore the observed `GREENFIELD_VAULT_DECRYPT_FAILED` is not explained by the Functional Shell changing crypto parameters.

The current decrypt path validates Vault/KDF/cipher metadata before AES-GCM authentication. If the user receives `GREENFIELD_VAULT_DECRYPT_FAILED`, the metadata gate has already passed and failure is at authenticated decryption (wrong exact Vault passphrase or corrupted ciphertext). Local PIN enrollment must therefore verify the existing Vault passphrase successfully before any device credential is created.

## User-visible behavior

### Normal daily unlock

- The locked screen shows one primary field: **รหัสเข้าแอป**.
- The local PIN accepts 6 or more characters.
- Entering the correct local PIN opens the existing Greenfield Vault and workspace.
- Entering a wrong PIN returns a local unlock error and does not attempt Evidence import, Restore, reset, or destructive fallback.
- The long Vault passphrase is not requested during ordinary daily unlock after device enrollment.

### One-time device enrollment

- If the browser/device has no enrolled local unlock credential, the primary PIN path reports that device unlock is not configured.
- A secondary recovery/setup disclosure allows the owner to provide:
  1. the existing Vault passphrase (minimum 12 characters), and
  2. a new local PIN (minimum 6 characters).
- Enrollment first proves that the existing Vault can be decrypted with the supplied Vault passphrase.
- Only after successful decrypt verification does the app create and persist the device-bound unlock credential.
- Enrollment does **not** rewrite or re-encrypt the Greenfield Vault.

### Recovery

- The existing Vault passphrase remains the canonical recovery credential.
- Evidence/Restore remain explicit secondary recovery actions and are never auto-triggered by PIN or passphrase failure.
- Clearing browser storage or losing the browser-stored device key removes the convenience unlock path but does not alter the encrypted Vault format or backup format.

## Durable Vault contract — unchanged

- Database: `ygph-metropolis-greenfield-secure`
- DB version: `1`
- Store: `vault`
- Vault key: `current`
- Vault format: `ygph-metropolis-greenfield-vault`
- Vault version: `1`
- PBKDF2: SHA-256, `600000` iterations
- Vault encryption: AES-GCM 256-bit key, 128-bit authentication tag
- Existing Vault AAD unchanged
- Existing Vault passphrase minimum remains `12`

No production change may alter these constants in this feature.

## Device unlock credential

### Records

The existing IndexedDB object store is generic key/value storage, so device-unlock records can coexist with `current` without a DB schema/version change.

Use separate keys:
- `device-unlock:key:v1` — non-extractable WebCrypto AES-GCM key object.
- `device-unlock:credential:v1` — sealed Vault passphrase envelope and metadata.

### Device key

Generate with WebCrypto:
- AES-GCM
- 256-bit
- `extractable: false`
- usages: `encrypt`, `decrypt`

The implementation must never export the raw device key or serialize it into JSON, diagnostics, logs, backups, or UI.

### PIN binding

The local PIN is not an encryption key for Greenfield state. It is used to derive a PIN-binding value with PBKDF2-SHA256 and a random per-credential salt. The binding is supplied as authenticated data when the non-extractable device key seals/unseals the Vault passphrase.

Device credential metadata:
- format: `ygph-metropolis-device-unlock`
- version: `1`
- PIN KDF: PBKDF2-SHA256
- PIN KDF iterations: `600000`
- random PIN salt: 16 bytes
- random AES-GCM IV: 12 bytes
- AES-GCM authentication tag: 128 bits
- ciphertext: the existing Vault passphrase, encrypted only by the non-extractable device key
- fixed device-unlock AAD version marker plus the derived PIN binding

The credential must not store a plaintext PIN, plaintext Vault passphrase, PIN hash/verifier that independently reveals the PIN, raw device key bytes, or decrypted Greenfield state.

### Threat boundary

This design prevents a copied Vault ciphertext from becoming directly brute-forceable through a 6-character Vault secret. A copied device credential without a usable browser-held non-extractable device key is insufficient to recover the Vault passphrase.

This local convenience layer is not claimed to defend against a fully compromised browser profile, malicious same-origin code, an already-unlocked session, or operating-system compromise. The existing Vault passphrase and encrypted backup remain the recovery/security boundary outside the enrolled browser context.

## Runtime interfaces

Add a focused device-unlock module and expose it only through the Greenfield runtime facade so the root UI continues to import only `greenfield/runtime.mjs`.

Required facade capabilities:
- inspect whether device unlock is `ENROLLED`, `UNENROLLED`, or `INCOMPLETE`.
- enroll device unlock only after successful existing Vault decrypt verification.
- open a Greenfield runtime from a local PIN by unsealing the Vault passphrase in memory and immediately using it with the existing runtime/persistence path.
- preserve the existing direct `openGreenfieldRuntime({ passphrase })` path for recovery/setup.

Plaintext Vault passphrase may exist transiently in memory during unlock but must never be persisted in plaintext or returned to UI/diagnostics.

## UI changes

### `index.html`

- Primary locked gate uses `id="devicePin"`, minimum length `6`, and no 12-character daily passphrase input.
- Secondary `กู้คืนการเข้าถึง` disclosure owns the existing Vault passphrase field (`minlength="12"`), device enrollment controls, Evidence import, and encrypted Backup restore.
- Unlock remains the only primary action.

### `ui/app.mjs`

- Normal unlock calls the device-PIN runtime facade.
- Enrollment uses the recovery Vault passphrase plus local PIN and does not mutate the encrypted Vault.
- Evidence/Restore continue to use the recovery Vault passphrase path explicitly.
- System lock clears only in-memory runtime/state and returns to the local PIN gate; it must not delete the enrolled device key or credential.

## Compatibility and data safety

- Existing Vault bytes under `current` are not rewritten by enrollment.
- Existing Vault passphrases remain valid and keep the 12-character minimum.
- Existing encrypted backups remain unchanged.
- No automatic re-key, migration, Evidence import, Restore, Clear storage, reset, or legacy DB access occurs.
- `stock-pocket-secure` remains rollback-only and must never be opened, written, cleared, or deleted.
- If the existing Vault cannot decrypt with the recovery passphrase, enrollment stops fail-closed and writes no device-unlock records.
- Partial enrollment must not be treated as usable. If only one of the device key/credential records exists, status is `INCOMPLETE` and normal unlock refuses to proceed.

## Error handling

- Local PIN length < 6: reject before PIN KDF.
- Device unlock absent: `DEVICE_UNLOCK_NOT_ENROLLED`.
- Partial/malformed device unlock: `DEVICE_UNLOCK_INCOMPLETE` or explicit invalid metadata error.
- Wrong local PIN: `DEVICE_PIN_INVALID` without exposing whether any candidate Vault passphrase was close/correct.
- Existing Vault passphrase length < 12: preserve `PASSPHRASE_TOO_SHORT`.
- Wrong existing Vault passphrase/corrupt Vault ciphertext: preserve `GREENFIELD_VAULT_DECRYPT_FAILED`.
- Invalid Vault/KDF/cipher metadata: preserve current explicit Greenfield validation errors.
- No unlock error triggers an automatic data write or recovery action.

## Tests

Required RED/GREEN coverage:
1. Device PIN with 5 characters is rejected.
2. Device PIN with 6 characters is accepted for enrollment/unlock.
3. Enrollment refuses to write device-unlock records when the Vault passphrase cannot decrypt the existing Vault.
4. Successful enrollment does not change the raw `current` Vault value.
5. Device key is generated non-extractable with AES-GCM 256-bit usages `encrypt/decrypt`.
6. Device credential contains no plaintext PIN or Vault passphrase.
7. Correct local PIN unseals the Vault passphrase and opens the existing state.
8. Wrong local PIN fails closed and does not write the Vault or device credential.
9. `UNENROLLED` and `INCOMPLETE` states are distinct and fail closed.
10. Existing direct recovery passphrase path still rejects <12 and accepts the previous valid long passphrase.
11. Existing long-passphrase Vault round-trip behavior is unchanged.
12. Wrong Vault passphrase still yields `GREENFIELD_VAULT_DECRYPT_FAILED`.
13. Vault constants (DB/Vault format/version/PBKDF2 600000/AES-GCM/AAD) remain unchanged.
14. UI primary gate declares `minlength="6"`; recovery passphrase declares `minlength="12"`.
15. Root UI still imports only the Greenfield runtime facade.
16. Service Worker and publication/syntax gates include the new production module.
17. Full Greenfield suite, syntax, and UTF-8 gates remain green.

## HADES final audit

After implementation CI passes, HADES performs a read-only review over the final branch/PR diff plus directly supporting security-sensitive files.

Audit checklist:
- Confirm the 6-character value is used only for local device unlock and never as the Vault PBKDF2 secret.
- Confirm Vault cryptographic constants are byte/parameter compatible with current production.
- Confirm device key is generated non-extractable and never exported/logged/diagnosed/backed up.
- Confirm the Vault passphrase and PIN are never persisted plaintext.
- Confirm enrollment verifies the existing Vault before writing device credentials.
- Confirm failed enrollment/unlock writes no durable state.
- Confirm partial credential state fails closed.
- Confirm device enrollment does not rewrite `current`.
- Confirm legacy DB isolation remains intact.
- Confirm Evidence/Restore are explicit and not auto-triggered.
- Confirm tests cover old Vault compatibility, 5/6 PIN boundary, wrong PIN, wrong Vault passphrase, no-write failures, and unchanged crypto constants.
- Report **PASS / WARNING / BLOCKER**. Any BLOCKER stops merge/deploy.

## Release gate

Required before production merge:
- Revised design has passed HADES pre-audit with no BLOCKER.
- Full Greenfield test suite passes.
- Syntax and UTF-8 gates pass.
- Final HADES audit contains no BLOCKER.
- PR diff is reviewed for data-destructive behavior and source-of-truth changes.
- Production deploy occurs only after the final `main` safety gate succeeds.
