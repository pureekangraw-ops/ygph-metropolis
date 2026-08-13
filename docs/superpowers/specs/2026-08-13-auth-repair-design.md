# Phase 1 Auth Repair — Locked Design

Date: 2026-08-13
Status: USER-APPROVED DESIGN / REPAIR ONLY
Scope owner: BIG

## Goal

Repair authentication and recovery so the app behaves like a normal consumer app for the actual user, not like a technician workflow.

The success criterion is the real user path:

1. Open app.
2. Enter one everyday password.
3. Use app.
4. Close app completely.
5. Open app again.
6. Enter the same everyday password.
7. Re-enter successfully without setup, Evidence import, or technician steps.

Passing CI alone is not sufficient if this user path fails.

## Locked User Model

### Everyday access

- The user sees and remembers one normal password for everyday app access.
- Normal login must not expose Vault, Device PIN, crypto, Evidence, Backup, internal error codes, or implementation terminology.

### Recovery

- A separate Recovery Code is allowed and is desirable.
- The Recovery Code is used only when the everyday password is forgotten.
- The normal recovery path is:
  1. Tap `ลืมรหัสผ่าน?`
  2. Enter Recovery Code.
  3. Set a new everyday password.
  4. Return to normal app access.
- Evidence and Backup are not login credentials and must not be required for normal password recovery.

### Evidence / Backup

- Evidence and Backup are data-recovery tools only.
- They must be routed to advanced recovery/settings surfaces.
- They must not appear as mandatory steps in normal login or forgotten-password recovery.

### Passkeys / biometrics

- Passkey, fingerprint, face unlock, and similar new capabilities are explicitly deferred to the final phase.
- Phase 1 must not add them.

## Repair Scope

Phase 1 may change only what is necessary to make the locked user model work reliably:

- authentication credential handling,
- recovery-code handling,
- login/recovery routing,
- migration/compatibility needed to preserve current durable data,
- user-facing authentication/recovery error messages,
- tests and release plumbing required by those changes.

Do not perform unrelated UI redesign, feature expansion, cleanup, refactoring, or architecture work merely because it looks better.

## Existing-System Constraint

The current system has two internal concepts:

- a Vault passphrase used to decrypt persisted data,
- a Device PIN credential that can unlock the Vault passphrase.

The current user-facing recovery flow exposes these as two user-managed secrets and can route the user through Evidence import. This is the defect to remove.

The implementation may keep internal cryptographic layers if required for compatibility, but those layers must not force the user to manage two everyday credentials. The visible contract is one everyday password plus one emergency Recovery Code.

## Required Behaviour

### Login

- Login screen has one password field.
- Correct everyday password opens the existing durable data.
- Wrong password fails closed with user-facing language.
- Closing and reopening the app does not invalidate or forget the credential binding.

### Forgot password

- `ลืมรหัสผ่าน?` opens Recovery Code flow.
- Valid Recovery Code allows setting a new everyday password.
- New password works immediately and after a full close/reopen.
- Invalid Recovery Code does not alter durable data or credentials.

### Data preservation

- Existing user data must not be discarded, reset, reinitialized, or overwritten as part of password repair.
- Existing Evidence and Backup mechanisms remain available for data recovery, but are not invoked by normal auth recovery.

### Failure behaviour

- No raw crypto/internal identifiers are shown to the user.
- Any recovery failure must preserve current durable state.
- No partial credential update may leave the app in an unrecoverable mixed state.

## TDD Acceptance Tests

At minimum, tests must prove:

1. Existing durable data can be opened with the everyday password.
2. Close/reopen followed by the same password still succeeds.
3. Forgotten-password recovery with a valid Recovery Code sets a new everyday password.
4. The old everyday password stops working after a successful reset.
5. The new everyday password works after full close/reopen.
6. Invalid Recovery Code performs no durable credential or data writes.
7. Evidence import is not called or required by normal forgot-password recovery.
8. Backup restore is not called or required by normal forgot-password recovery.
9. User-facing auth/recovery errors contain no Vault/crypto/internal error codes.
10. Existing data remains byte/logically equivalent except for intended credential metadata changes.

## Out of Scope

Deferred until later phases:

- biometric unlock,
- passkeys,
- profile/account system,
- notifications,
- language/theme settings,
- receipt scanning,
- real money transfer,
- new product catalog/customer-management features,
- visual redesign outside what auth repair strictly requires.

## Stop Conditions

Stop and report before changing direction if any of these are discovered:

- preserving current encrypted data is incompatible with the locked one-password + Recovery Code model,
- the repair would require destructive migration,
- the repair would require Evidence as a normal login dependency,
- the proposed implementation would create a second everyday password again.

Do not silently reinterpret the locked design.
