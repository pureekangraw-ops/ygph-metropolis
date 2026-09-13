# GO PATCHMASTER — Development Evidence / Fresh-GO Handoff

Purpose: a fresh GO or developer should be able to continue this subsystem from repository evidence without relying on an old chat transcript.

## START HERE

Read in this order:

1. `docs/superpowers/specs/2026-09-13-go-patchmaster-owner-logic-seal-design.md` — approved architecture and trust boundaries.
2. `docs/superpowers/plans/2026-09-13-go-patchmaster-owner-logic-seal.md` — implementation sequence.
3. `docs/patchmaster/release-manifest-v1.md` — release contract.
4. `lighthouse-next/update/` — executable local trust kernel.
5. `tests/greenfield-patchmaster-*.test.cjs` — acceptance and negative-security evidence.
6. `android-shell/apk-identity.json`, `android-shell/version.json`, and `android-shell/tools/verify-apk-identity.mjs` — Android identity/provenance evidence boundary.
7. PR #137 (`patchmaster-v1`) — current implementation review surface until merged.

## Current architecture state

PATCHMASTER trust work is intentionally split from platform installation.

Implemented/proven on the feature branch:

- Local Patch Client contract.
- Release Manifest v1 parsing/validation.
- package tier + allowed-scope policy.
- release identity/integrity/provenance verification.
- known-good candidate/commit/abort semantics.
- ordered update pipeline: `CHECK -> RESOLVE -> DOWNLOAD -> VERIFY -> STAGE -> TEST -> ACTIVATE -> READBACK -> COMMIT`.
- failure-path tests preventing commit after failed verification/activation/readback.
- Android owner-build provenance binding, including release channel contract.

Not yet implemented as part of this subsystem:

- Native Android Installer Bridge that downloads an approved APK, invokes the Android package installer, and reads the actually installed package/version back from the device.
- A central always-on PATCHMASTER service/registry. The local trust boundary is being proven first by design.

Do not fake these missing boundaries with web/UI state. Installer success and real installed-state readback are platform facts.

## Durable evidence record

Every architecture-impacting change should leave, at minimum:

- source commit and/or PR
- what changed
- why it changed
- tests and verification evidence
- architecture/contract impact
- current known state and unresolved boundary
- release/build provenance where applicable

Principle: **Build anywhere. Record centrally.**

Development environments are replaceable work surfaces. GitHub is the durable handoff for source, contracts, tests, decisions, and release evidence; it must not contain production credentials or private signing authority.

## Trust ownership

- PATCHMASTER: release discovery/policy/evidence orchestration.
- Local Patch Client: local verification/staging/test/activation/readback/rollback adapter.
- Child app: runtime and canonical business truth.
- Android owner build: package identity, canonical signing, build provenance.
- Future Native Installer Bridge: Android install request + installed-state readback only; it must not become business-truth owner or bypass verification.

## Definition of success

Do not mark the subsystem complete merely because code compiles or an APK builds. Completion requires tests for valid and invalid releases, CI gates, release-evidence verification, and—where device behavior is claimed—real target-device readback.
