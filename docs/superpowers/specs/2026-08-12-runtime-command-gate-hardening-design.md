# METROPOLIS Runtime Command Gate Hardening Design

## Goal
Strengthen METROPOLIS before further feature growth by making every durable write pass one guarded runtime path that can detect stale multi-context state, serialize commits, verify durable read-back, publish the new revision to sibling contexts, and expose one runtime fingerprint for diagnostics.

## Scope
This hardening round is intentionally narrower than a full architecture rewrite. It does not migrate State Schema 4, IndexedDB v1, Vault format 1, or existing money/source semantics. It does not merge to `main` or deploy production without a separate owner gate.

## Architecture
Add `metropolis-command-gate.js` as the last runtime layer. It wraps the existing proven `persistAndRender` / `saveEncryptedState` durable path instead of replacing the Vault engine. Existing `commitCurrentState` remains the authority for revision increment, event-envelope creation, encryption, write, read-back verification, and rollback.

Before a write, the gate obtains an exclusive Web Lock when available and reads/decrypts the currently durable Vault. The durable revision must equal the in-memory pre-commit revision. If another tab/PWA context has already advanced the Vault, the local uncommitted mutation is discarded, the newest durable state is restored into memory, the write is blocked with `STALE_CONTEXT`, and UI is re-rendered from durable truth.

After a successful durable commit, the gate verifies that the returned read-back revision equals the now-current state revision, records gate status, and broadcasts the new revision through `BroadcastChannel` when available. Other contexts become `STALE` before their next write.

## Runtime health and fingerprint
The gate exposes `globalThis.YGPHCommandGate` with pure status helpers plus runtime diagnostics. The fingerprint reports product version, Core/data release, Core version, State Schema, current State revision, DB/Vault generation, Service Worker release/serving cache, last durable read-back status, persistent-storage status, cross-context transport availability, and command-gate version.

Storage persistence is checked through `navigator.storage.persisted()` and a best-effort `navigator.storage.persist()` request. Lack of persistent storage is diagnostic (`VERIFY`), not a write blocker.

## Ownership rule
This round establishes the single durable-write owner without changing each domain's business semantics. Existing Store/Ride/Ledger/Calendar/Day Cycle functions may still prepare in-memory mutations, but only the command gate may pass them to durable persistence. A later migration can move individual pre-mutation command handlers behind explicit domain command interfaces without changing the Vault contract.

## Failure behavior
- Concurrent write in the same context: existing `durableCommitInProgress` remains authoritative.
- Concurrent write across contexts: Web Lock serializes access where supported.
- Stale durable revision: block write, restore newest durable Vault, render, return `STALE_CONTEXT`.
- Read-back revision mismatch after commit: throw `READBACK_REVISION_MISMATCH`; do not advertise success.
- BroadcastChannel/Web Locks unavailable: retain existing durable path and report degraded cross-context protection in diagnostics.
- Persistent storage not granted: report `VERIFY`; do not mutate data to compensate.

## Release wiring
The new runtime file must be loaded last by `sw-bootstrap.js`, included in the Service Worker app shell, syntax/UTF-8 gates, release manifest and checksums. Service Worker generation advances from r25 to r26 while visible product version stays 4.2.6.

## Tests / Gate
TDD requirements:
1. Pure revision comparison and fingerprint tests fail before implementation.
2. Runtime harness proves `persistAndRender` is wrapped.
3. Simulated stale durable revision blocks a commit and restores durable truth.
4. Successful guarded commit preserves existing revision/event/read-back behavior.
5. Runtime wiring test proves the gate asset is last, precached, syntax-gated, release-declared and r26-owned.
6. Full `npm run deploy:gate` must pass before PR is considered ready.

## Explicit non-goals
- No destructive user-data cleanup.
- No State Schema / IndexedDB / Vault-format bump.
- No replacement of AES-GCM/PBKDF2 or money/source authorities.
- No automatic merge to `main`.
- No Cloudflare Builds Git-integration reactivation.
