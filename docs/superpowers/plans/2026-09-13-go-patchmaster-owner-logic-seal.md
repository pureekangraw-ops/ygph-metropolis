# GO PATCHMASTER + OWNER LOGIC SEAL Implementation Plan

> For agentic workers: execute task-by-task with TDD and verification checkpoints.

**Goal:** Prove a portable, fail-closed update trust path for LIGHTHOUSE first, then expose the proven contract for future PATCHMASTER clients.

**Architecture:** Extend existing LIGHTHOUSE update boundaries rather than replacing them. A local patch client owns local identity, verification, staging, activation, readback, and rollback; PATCHMASTER later owns release discovery and signed release metadata, never child-app business truth. V1 proves trust locally before building a central service.

**Spec:** `docs/superpowers/specs/2026-09-13-go-patchmaster-owner-logic-seal-design.md`

## Global constraints
- Centralized trust, decentralized runtime, compartmentalized architecture.
- PATCHMASTER never writes child-app canonical business truth directly.
- No verified evidence means no activation; no readback means no success.
- Critical Core is not replaced by ordinary hot-module patch.
- No custom cryptographic primitives.
- Current known-good remains usable during PATCHMASTER/network outage.
- Build anywhere; record architecture-impacting changes in repository evidence.
- Providers are replaceable infrastructure, not logical runtime requirements.

## Task 1 — Repository map + Local Patch Client
Inspect existing LIGHTHOUSE update/release owners and tests. Add a failing Node contract test for `identify`, `currentVersion`, `verify`, `stage`, `test`, `activate`, `readback`, `rollback`, then implement the smallest dependency-injected adapter and run existing LIGHTHOUSE tests.

## Task 2 — Release Manifest v1
Add table-driven failing tests for required identity/version/channel/package/scope/digest/signer/provenance/dependencies/rollback/timestamp fields. Implement structural parsing only, then document the contract.

## Task 3 — Package tier / scope policy
Map real Critical Core paths and prove with failing tests that data/rule and replaceable-module packages cannot modify Critical Core. Implement explicit allowlists without Critical-Core wildcards.

## Task 4 — Release trust verification
Add failing tests for valid release and rejection of modified payload, altered manifest, wrong app, incompatible version, untrusted signer identity, missing provenance, replay/disallowed downgrade, and unauthorized scope. Implement with existing platform verification primitives and an injected trusted verifier. No manifest field may disable verification.

## Task 5 — Known-good / anti-brick state
Add failing tests proving candidates cannot destroy current known-good and commit requires matching readback. Implement on the existing durable storage owner.

## Task 6 — Transactional update pipeline
Implement `CHECK -> RESOLVE -> DOWNLOAD -> VERIFY -> STAGE -> TEST -> ACTIVATE -> READBACK -> COMMIT` with failure tests at each stage. PATCHMASTER/resolver/downloader cannot directly commit known-good.

## Task 7 — LIGHTHOUSE reference integration
Wire Local Patch Client to existing LIGHTHOUSE owners with minimal edits. Preserve auth/recovery/runtime ownership. Run Patchmaster, runtime-gate/recovery, Android/web checks.

## Task 8 — Full signed APK evidence path
Bind application ID, version, source commit, APK digest, signer certificate identity, build provenance, and channel into release evidence without exposing signing authority to runtime/source.

## Task 9 — Acceptance suite
Cover valid release, modified payload, modified manifest, wrong app, unauthorized scope, incompatible release, replay/downgrade, resolver outage, and readback mismatch. Run full existing tests/build checks.

## Task 10 — Development evidence / Fresh-GO handoff
Document source commit/PR, what changed, why, tests, architecture impact, current state, and links to spec/plan/contracts. Perform a repository-only handoff drill and run existing credential scanning checks.

## Final verification gate
Run all Patchmaster and existing LIGHTHOUSE tests, Android/web build and release evidence checks. Verify a real owner-test artifact signer, app ID, version, source commit, and digest. Compare implementation to every design acceptance criterion. Do not claim device/runtime success until tested on the target Android device.
