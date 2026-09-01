# Standard APK Test Flow Design

Status: OWNER-AUTHORIZED PERMANENT STANDARD

## Purpose

Create one reusable APK test path so future test rounds require only:

`raise Android version -> run Patch workflow -> receive canonical APK`

This is a permanent test-build contract, not a PR-specific workaround.

## Existing Reality Reused

The current `LIGHTHOUSE APK Debug` workflow already owns the canonical APK rail after Patch preparation:

`tests -> Patch signing/verification -> cap add/sync -> Android security baseline -> canonical Android version -> merged-manifest security verification -> release build -> canonical signer -> final APK identity/version verification -> canonical artifact upload`

That rail remains authoritative. No parallel build system is introduced.

## Standard Operator Contract

The tester owns only two actions:

1. Raise `android-shell/version.json` to the next valid canonical Android version.
2. Run the standard Patch/APK workflow.

The tester must not manually edit or supply signer identity, generated Android manifest/security flags, Gradle version fields, signing commands, build commands, or final verification commands.

## Patch Release Ownership

The current workflow is not permanently reusable while Patch `0.0.5` paths and names are hard-coded in workflow YAML. A single source-controlled Patch release contract will therefore own the current Patch target and accepted base versions. The workflow and generic Patch source builder read that contract rather than embedding a release number in workflow logic.

The existing Patch trust domain, signing key-3 anchor, patch contract verifier, trusted manifest/SHA-256 checks, and release source files remain in use.

## Fail-Closed Rules

The standard flow must fail before canonical APK publication when any required condition fails, including:

- Android version contract is malformed or not monotonic for the intended test build.
- Patch release contract is malformed or required Patch source material is missing.
- Patch signing key does not match the trusted key anchor.
- Signed Patch verification fails or its version/base-version relation disagrees with the Patch release contract.
- Generated Android security baseline or verification fails.
- APK signer, package identity, versionCode, versionName, or final-byte identity verification fails.
- Canonical APK or required non-secret evidence artifacts are absent.

## Artifact Contract

A successful standard run publishes one canonical APK artifact containing:

- signed canonical release APK
- APK identity evidence
- generated Android security evidence
- Patch artifacts/evidence produced by the same workflow run

Artifact creation proves only that the canonical build pipeline passed. It does not prove physical-device update or state survival.

## Physical Gate Boundary

Physical-device A->B update/state-survival proof remains a separate gate. A canonical APK produced by this flow must never be promoted into physical proof merely because CI succeeded.

## Definition of Done

The next APK test round can reuse the same path without editing or repairing workflow structure: the tester raises the canonical Android version, runs the standard Patch/APK workflow, and the workflow performs Patch verification, Android security application/verification, signing, release build, final identity/version verification, evidence production, and canonical APK publication automatically.
