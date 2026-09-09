# LIGHTHOUSE Runtime Gate + Recovery Design

## Status

Owner-approved direction on 2026-09-09.

Implementation order:

1. Replace the fake LIGHTHOUSE 4-digit demo gate with the existing real Greenfield device-password/runtime gate.
2. Add password recovery/reset on that same real gate.
3. Only after auth/recovery are proven, connect CHAT confirmations to durable Ledger-backed mutations.

This document covers steps 1 and 2 only. Ledger mutation wiring remains the next phase.

## Goal

Make `lighthouse-next/` enter the same encrypted Greenfield runtime already used by the stable app, instead of unlocking locally with any four digits.

The user-visible contract is:

```text
LIGHTHOUSE login
 -> real device password
 -> open existing Greenfield Vault
 -> verify durable state can be read
 -> activate in-memory Runtime Session
 -> enter LIGHTHOUSE
```

Recovery contract:

```text
Forgot password
 -> Recovery Code + new password
 -> verify/decrypt existing Vault with Recovery Code
 -> replace only the everyday device credential
 -> preserve business Vault byte-for-byte
 -> return to login
```

## Existing Facts We Reuse

The repository already provides the security/runtime primitives we need:

- `greenfield/device-unlock.mjs`
  - real device password minimum length is 6 characters;
  - device credential is bound using PBKDF2-SHA-256 and AES-GCM;
  - invalid passwords fail with `DEVICE_PIN_INVALID`;
  - device unlock has explicit `UNENROLLED`, `INCOMPLETE`, and `ENROLLED` states.
- `greenfield/runtime.mjs`
  - `openGreenfieldRuntimeWithDevicePin(...)` opens the existing encrypted Vault using the everyday password;
  - `resetGreenfieldDevicePassword(...)` resets the everyday password from Recovery Code;
  - `verifyGreenfieldRecoveryCode(...)` verifies the Recovery Code without exposing business data;
  - an authenticated runtime can change the everyday password without Recovery Code.
- `greenfield/runtime-session.mjs`
  - holds the active runtime in memory only;
  - `activateRuntimeSession(...)` and `deactivateRuntimeSession(...)` are the shared session boundary.
- existing recovery tests already prove:
  - valid Recovery Code preserves durable Vault state and Ledger balance;
  - old password stops working after reset;
  - new password works;
  - invalid Recovery Code performs zero durable writes.

We will reuse these primitives rather than reimplement password cryptography or a second auth store in `lighthouse-next`.

## Current Problem

`lighthouse-next/app.mjs` currently owns a local demo state and unlocks after any four digits. That is acceptable for a design/test surface but not acceptable once LIGHTHOUSE begins writing real Ledger data.

There are two separate gaps:

1. **Authentication gap** — the visible gate does not open the encrypted Greenfield Vault.
2. **Packaging gap** — the Android owner-test package currently stages only a small `lighthouse-next/` file allowlist; the real Greenfield runtime modules are not present inside the packaged WebView payload.

Both must be solved before real Ledger mutation wiring.

## Approaches Considered

### A. Reuse the existing Greenfield runtime and package its required module closure — SELECTED

`lighthouse-next` becomes a view layer over the same runtime/session authority as the stable app.

Pros:

- one password authority;
- one encrypted Vault;
- no duplicated crypto;
- existing recovery and persistence tests remain meaningful;
- future CHAT -> Ledger wiring can reuse the active runtime session directly.

Cost:

- Android staging must be expanded so the required Greenfield runtime modules are available to `lighthouse-next` inside the WebView bundle.

### B. Reimplement a new LIGHTHOUSE-only password system — REJECTED

This would create two credential stores and two auth semantics for one app identity. It would also require new cryptography, migration, recovery, and persistence contracts.

### C. Keep the fake gate until after Ledger wiring — REJECTED

This risks allowing a real mutation path behind a fake/demo authentication surface and makes testing ambiguous.

## Selected Architecture

### 1. New LIGHTHOUSE auth adapter

Add a focused adapter under `lighthouse-next/`, for example:

```text
lighthouse-next/runtime-gate.mjs
```

Responsibilities:

- inspect existing device-unlock status;
- open runtime using the submitted device password;
- call `runtime.readState()` before reporting login success;
- activate the shared in-memory Runtime Session only after successful readback;
- close/deactivate runtime on logout/lock;
- expose password-reset actions using existing Greenfield recovery functions;
- translate technical auth errors into simple user-facing Thai messages.

It must not:

- store the password in `localStorage`, `sessionStorage`, IndexedDB, or app state;
- create a new password hash/credential format;
- read or copy the Vault passphrase directly into LIGHTHOUSE state;
- initialize a new Vault automatically when credentials are missing;
- treat `UNENROLLED` or `INCOMPLETE` as a successful login state.

### 2. Gate states

The visible gate has these states:

```text
CHECKING
LOGIN
RECOVERY
BUSY
ERROR
LOCKED_SETUP_REQUIRED
```

Behavior:

- `ENROLLED` -> show `LOGIN`.
- `UNENROLLED` -> fail closed into `LOCKED_SETUP_REQUIRED`; do not silently create a new credential or Vault.
- `INCOMPLETE` -> fail closed into `LOCKED_SETUP_REQUIRED`; this is a repair condition, not a login condition.
- correct password -> open runtime -> read durable state -> activate session -> enter app.
- wrong password -> remain on login with a simple error; do not mutate durable state.

The existing fake four-dot buffer and "any 4 digits" behavior are removed from the production path.

### 3. Recovery/reset flow

From the login gate, the user can choose "ลืมรหัส".

Recovery form fields:

- Recovery Code
- New password
- Confirm new password

Rules:

- new password must satisfy the real device-password contract (minimum 6 characters);
- confirmation must match;
- Recovery Code is passed only to the existing Greenfield recovery API;
- invalid Recovery Code reports failure without durable writes;
- successful reset returns to `LOGIN`;
- successful reset does **not** auto-login;
- Recovery Code and submitted passwords are cleared from form memory after completion/failure handling.

The reset action changes only the everyday device credential. It must not reset, recreate, import, or clear business data.

### 4. Runtime session lifecycle

On successful login:

```text
openGreenfieldRuntimeWithDevicePin(password)
 -> runtime.readState()
 -> activateRuntimeSession(runtime)
 -> show LIGHTHOUSE shell
```

On logout/lock/page teardown where supported:

```text
deactivateRuntimeSession(runtime)
 -> runtime.close()
 -> clear UI auth state
 -> show login
```

No password is retained to reopen the runtime automatically after reload. A reload requires login again.

### 5. Android packaging shape

The current Android staging contract flattens selected `lighthouse-next` files into `android-shell/www/`. That shape cannot safely support `lighthouse-next` importing the sibling `greenfield/` runtime tree used by the web build.

For this auth cutover, Android staging changes to preserve a sibling layout inside `www/`:

```text
www/
  index.html                 # minimal local entry/forwarder
  lighthouse-next/
    index.html
    app.mjs
    runtime-gate.mjs
    ...approved UI files...
  greenfield/
    ...explicit runtime dependency closure...
```

`lighthouse-next/runtime-gate.mjs` can then use the same relative import shape in web and Android:

```text
../greenfield/runtime.mjs
../greenfield/runtime-session.mjs
```

Packaging rules:

- preserve `lighthouse-next` source files byte-identically under `www/lighthouse-next/`;
- package only the explicit Greenfield browser-runtime dependency closure required by auth/runtime operations;
- do not package tests, legacy UI, updater, patch runtime, release tooling, or unrelated root assets;
- keep application ID, signer, Android security baseline, and launcher identity unchanged;
- add tests proving required Greenfield modules are present and no forbidden trees are copied.

### 6. Intermediate-branch safety

Auth/recovery will be implemented first, but this branch is not considered ready for owner release merely because login works.

Until CHAT durable mutation wiring is added, the branch must not blur demo business state with real durable truth. During the intermediate auth phase:

- no new release/store publication;
- no claim that CHAT writes real data;
- no owner APK acceptance claim based only on auth tests;
- any remaining demo-only business behavior must stay explicitly identifiable as demo/test behavior.

The next design/implementation phase will replace direct demo mutations with Runtime/Ledger operations and durable readback.

## Error Handling

Fail closed on:

- `DEVICE_PIN_INVALID`;
- `DEVICE_UNLOCK_NOT_ENROLLED`;
- `DEVICE_UNLOCK_INCOMPLETE`;
- Vault decrypt/read failure;
- null/missing durable runtime state;
- Recovery Code failure;
- runtime-session activation failure.

A login or reset failure must never be translated into success.

User-facing messages should remain simple and must not expose encrypted payload details, passphrases, key material, or internal stack traces.

## Testing Strategy

Use TDD. Add failing tests before implementation.

Minimum auth/recovery tests:

1. LIGHTHOUSE no longer accepts arbitrary four-digit demo PIN.
2. login delegates to `openGreenfieldRuntimeWithDevicePin`.
3. login success requires durable `runtime.readState()` before the app shell is shown.
4. successful login activates shared Runtime Session.
5. wrong password leaves the gate locked and performs no business mutation.
6. logout/lock deactivates session and closes runtime.
7. `UNENROLLED` and `INCOMPLETE` fail closed; no automatic Vault/credential creation.
8. recovery validates new-password length and confirmation before write.
9. valid Recovery Code resets only the everyday credential and returns to login.
10. invalid Recovery Code preserves existing credential/Vault and performs zero durable writes (existing Greenfield recovery test remains green).
11. Android staging includes the required Greenfield runtime module closure alongside `lighthouse-next`.
12. Android staging still rejects forbidden legacy/updater/runtime trees outside the approved closure.
13. existing Android package identity, signer, security, launcher, keyboard, and Greenfield gates remain green.

Physical Android testing remains a later gate. CI auth pass is not proof of physical-device login/recovery behavior.

## Likely Files

Expected new/changed files include:

```text
lighthouse-next/index.html
lighthouse-next/app.mjs
lighthouse-next/styles.css
lighthouse-next/runtime-gate.mjs                    # new
android-shell/tools/stage-lighthouse-next.mjs
android-shell/test/lighthouse-next-package.test.mjs
tests/greenfield-lighthouse-runtime-gate.test.cjs   # new/focused
```

Existing Greenfield auth/runtime implementations should be reused, not rewritten:

```text
greenfield/device-unlock.mjs
greenfield/runtime.mjs
greenfield/runtime-session.mjs
```

Additional packaging-contract tests may be added if the dependency closure needs a dedicated test file.

## Acceptance Criteria

Source/test acceptance for this phase requires all of the following:

- fake four-digit LIGHTHOUSE gate is no longer the production auth path;
- existing real device password opens the existing Greenfield Vault;
- durable state readback is required before login success;
- shared Runtime Session is activated only after successful unlock/readback;
- no password or Recovery Code is persisted in LIGHTHOUSE state/storage;
- Recovery Code can reset only the everyday password while preserving business Vault data;
- invalid recovery performs no durable writes;
- Android packaging includes the minimum required Greenfield runtime modules without broad legacy copying;
- package ID/signer/security identity remain unchanged;
- focused tests and affected existing gates pass;
- no release/store/Device Gate success is claimed from source tests alone.
