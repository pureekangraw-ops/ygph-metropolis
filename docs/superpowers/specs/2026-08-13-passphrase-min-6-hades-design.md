# METROPOLIS Passphrase Minimum 6 + HADES Audit Design

## Goal

Reduce the minimum accepted METROPOLIS passphrase length from 12 characters to 6 characters across the full Greenfield stack, without changing the encrypted Vault format, cryptographic algorithms, KDF parameters, database identity, durable state, or existing user data. After implementation and CI pass, perform a read-only HADES security/compatibility audit.

## User-visible behavior

- The unlock input accepts passphrases of 6 or more characters.
- A passphrase shorter than 6 is rejected with a clear validation error.
- Existing passphrases longer than 6 remain valid without migration or re-encryption.
- This change does not claim to fix `GREENFIELD_VAULT_DECRYPT_FAILED`; a wrong passphrase or incompatible/corrupt encrypted payload must still fail decryption.
- No Evidence import, Restore, Clear storage, database reset, or destructive migration is part of this change.

## Architecture

The passphrase floor must have one semantic value everywhere it is enforced. The UI, runtime facade, and cryptographic key-derivation path must all use 6 as the minimum. No cryptographic primitive or Vault identity changes.

The durable encryption contract remains:
- Database: `ygph-metropolis-greenfield-secure`
- Store: `vault`
- Vault key: `current`
- Vault format: `ygph-metropolis-greenfield-vault`
- Vault version: `1`
- PBKDF2-SHA256 iterations: `600000`
- AES-GCM 256-bit key, 128-bit authentication tag
- Existing AAD unchanged

Lowering the minimum passphrase length affects only input acceptance. PBKDF2 still derives the key from the exact passphrase supplied; therefore existing encrypted data remains decryptable only by the same exact passphrase used to create it.

## Components to change

### `index.html`
Change the password input `minlength` from 12 to 6.

### `ui/app.mjs`
Change the front-end passphrase validation floor and human-readable validation message from 12 to 6.

### `greenfield/runtime.mjs`
Change `createGreenfieldRuntime` passphrase acceptance from `< 12` to `< 6`. Keep the existing error identifier unless tests show a compatibility reason to introduce a more specific identifier.

### `greenfield/persistence.mjs`
Change `deriveKey` passphrase floor from `< 12` to `< 6`. Do not change PBKDF2 iterations, salt generation, AES-GCM parameters, AAD, Vault format/version, or decrypt error semantics.

### Tests
Add or update regression tests proving:
1. 5-character passphrases are rejected.
2. 6-character passphrases are accepted through the runtime and persistence paths.
3. A Vault encrypted with a passphrase longer than 6 still round-trips unchanged.
4. A Vault encrypted with a 6-character passphrase round-trips correctly.
5. Wrong passphrase still yields `GREENFIELD_VAULT_DECRYPT_FAILED` and does not write data.
6. Vault/KDF/cipher constants remain unchanged.
7. UI input declares `minlength="6"` and front-end validation matches.

## Compatibility and data safety

This is not a migration. Existing encrypted Vault bytes are not rewritten merely because the minimum length changed. No automatic re-keying or passphrase change is introduced.

The existing Greenfield DB and Vault remain source of truth. The implementation must not access or modify the legacy `stock-pocket-secure` database.

## Error handling

- Length < 6: reject before attempting key derivation/decryption.
- Length >= 6 but wrong key: preserve `GREENFIELD_VAULT_DECRYPT_FAILED`.
- Invalid Vault/KDF/cipher metadata: preserve the current explicit validation errors.
- No fallback to Evidence/Restore is triggered automatically.

## HADES audit

After implementation CI passes, HADES runs as a read-only audit over the final branch/PR diff and relevant security-sensitive files. HADES does not modify production files.

Audit checklist:
- Confirm only the passphrase floor changed; no weakening of PBKDF2/AES-GCM/Vault parameters.
- Confirm no passphrase is hardcoded, logged, persisted in plaintext, or added to diagnostics.
- Confirm wrong-passphrase failure remains fail-closed.
- Confirm no destructive data migration or re-encryption occurs.
- Confirm legacy DB isolation remains intact.
- Confirm Evidence/Restore paths are not auto-triggered by unlock failure.
- Confirm tests cover 5-character rejection, 6-character acceptance, old longer-passphrase compatibility, and wrong-key failure.
- Report findings as PASS / WARNING / BLOCKER. Any BLOCKER stops merge/deploy.

## Release gate

Required before production merge:
- Full Greenfield test suite passes.
- Syntax and UTF-8 gates pass.
- HADES audit contains no BLOCKER.
- Production deploy happens only after the final `main` safety gate succeeds.
