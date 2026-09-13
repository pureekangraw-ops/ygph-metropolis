# GO PATCHMASTER + OWNER LOGIC SEAL — Design

Date: 2026-09-13
Status: OWNER-APPROVED / IMPLEMENTATION IN PROGRESS
Owner: BIG / YGGDRASIL METROPOLIS

## 1. Purpose

GO PATCHMASTER is a central update authority for YGGDRASIL applications. It coordinates release discovery, trusted package delivery, verification, staging, activation evidence, rollback, and release provenance without becoming the runtime owner of child applications.

OWNER LOGIC SEAL is the trust model that protects the system's distinctive architecture: not by pretending generic techniques are secret, but by ensuring copied modules, altered packages, or imitated clients cannot silently join the trusted system or impersonate an authentic release.

The design targets three properties at once:

1. Copying a module must not equal copying the whole system.
2. Tampering with a release must be detectable before trusted activation.
3. A future GO, developer, or build environment must be able to continue development from repository evidence without reverse-engineering hidden connections.

## 2. Core Principle

Centralized trust, decentralized runtime, compartmentalized architecture.

PATCHMASTER owns release trust, policy, signed manifests, package provenance, and update orchestration rules.

Each child application owns its runtime, local state, local activation gate, final readback, and rollback decision.

PATCHMASTER must never write a child application's canonical business truth directly.

If PATCHMASTER is unavailable, the child application continues on its last known-good version.

## 3. Existing Update Engine Alignment

The current LIGHTHOUSE update design already separates the update path into distinct responsibilities such as check update, download, verify, migration, activation, and readback. PATCHMASTER extends that model into a shared multi-application authority instead of replacing it.

Responsibilities remain isolated:

- Download transports bytes.
- Verify validates identity and integrity.
- Migration transforms state when explicitly required.
- Activation changes which version is current.
- Readback proves what is actually active.
- No layer may manufacture truth outside its responsibility.

## 4. System Boundary

### 4.1 PATCHMASTER

PATCHMASTER contains:

- App Registry
- Release Registry
- Signed Release Manifest service
- Package repository/reference resolver
- Release policy
- Provenance records
- Compatibility rules
- Update status/audit records

PATCHMASTER may answer: "What release is valid for this app and current state?"

PATCHMASTER may not answer: "What should this child application's business state be?"

### 4.2 Local Patch Client

Every participating application implements a small local update adapter.

Minimum contract:

- `identify()` — return immutable application identity.
- `currentVersion()` — return the actually active local version.
- `verify(manifest, payload)` — validate package identity and trust requirements.
- `stage(payload)` — prepare update without replacing current known-good state.
- `test(staged)` — run contract/smoke/migration checks appropriate to package class.
- `activate(staged)` — switch to the staged release through the application's controlled gate.
- `readback()` — return the actually active release and critical evidence.
- `rollback()` — restore previous known-good state if activation/readback fails.

The local client must not trust PATCHMASTER merely because the response came from PATCHMASTER. It trusts verified cryptographic and contractual evidence.

## 5. Update Pipeline

Canonical flow:

`CHECK -> RESOLVE -> DOWNLOAD -> VERIFY -> STAGE -> TEST -> ACTIVATE -> READBACK -> COMMIT`

Rollback is available until COMMIT.

### CHECK

Determine whether a newer eligible release exists.

### RESOLVE

Resolve the release against application identity, channel, current version, compatibility, and policy.

### DOWNLOAD

Download only into staging storage. Current known-good state remains untouched.

### VERIFY

Validate manifest signature, payload hash, application identity, release version, source/build provenance, package class, compatibility, and allowed scope.

### STAGE

Prepare the candidate in an isolated location.

### TEST

Run the smallest required pre-activation checks: contract tests, schema inspection, migration dry-run where possible, or package smoke checks.

### ACTIVATE

Switch through the child application's local gate. PATCHMASTER cannot bypass this gate.

### READBACK

Read the real active state from the child application or platform. Installer success, HTTP success, or PATCHMASTER status is not sufficient evidence.

### COMMIT

Only after successful readback does the new release become current known-good.

### ROLLBACK

On failed activation, failed readback, or failed migration finalization, restore the previous known-good version/state.

## 6. Trust Gates

Every release must pass four gates.

### Gate A — Identity

The package must target the exact application identity and expected release channel.

### Gate B — Integrity

The package and manifest must match authenticated hashes/signatures and recorded provenance.

### Gate C — Scope

The release may modify only the scope declared and permitted for its package class.

### Gate D — Runtime

The child application's own contract, activation, and readback checks must pass.

Rule: no verified evidence means no activation. No readback means no success.

## 7. Release Manifest

The signed manifest is the release contract. Minimum fields:

- `app_id`
- `release_id`
- `version`
- `channel`
- `package_type`
- `min_current_version`
- `max_current_version` where required
- `allowed_scope`
- `payload_hash`
- `signing_identity`
- `source_commit`
- `build_provenance`
- `dependencies`
- `migration_contract` when applicable
- `rollback_policy`
- `created_at`
- optional `expires_at`

Manifest contents themselves are signed. An unsigned or altered manifest is invalid.

## 8. Package Classes

### Tier 1 — Data / Rules / Catalog

Examples: catalogs, approved rule sets, non-secret configuration, data packs.

May use lightweight signed module/data updates when the target application explicitly supports them.

### Tier 2 — Replaceable Modules

Logic modules may be replaceable only when an explicit stable contract and allowed scope already exist.

A module update may not invent new privileges beyond the declared interface.

### Tier 3 — Critical Core

Examples:

- Owner Gate
- authentication authority
- recovery authority
- update verifier / trust root
- canonical ledger authority
- critical migration authority

Critical Core must not be replaced through an ordinary hot-module patch. Changes require a full trusted release path appropriate to the platform.

A release manifest can never instruct the verifier to disable verification for itself.

## 9. Anti-Tamper / Anti-Impersonation

The design does not claim to make generic software ideas secret. It protects authentic participation in the trusted system.

The system must reject:

- modified payloads with mismatched hashes
- altered manifests
- packages for another `app_id`
- unauthorized scope expansion
- incompatible versions
- replayed or disallowed downgrade releases
- packages signed by an untrusted identity
- releases with missing required provenance

An owner-authorized recovery release may intentionally permit rollback/downgrade, but it must be a distinct trusted path rather than a normal manifest flag.

## 10. Protecting the Architecture Recipe

The valuable asset is the arrangement of ownership, routes, gates, state transitions, and trust relationships.

Protection strategy: compartmentalize the idea, not only the code.

- Generic techniques may remain ordinary implementation knowledge.
- Each module receives only the contracts and dependencies it requires.
- A child application should not need the complete metropolis architecture map to function.
- Build environments should receive only the source and credentials necessary for their task.
- Production secrets, signing keys, and owner authority material must never be stored in Git source, chat, or ordinary documentation.
- Critical integration maps and private policy remain private source/evidence.

Target property:

`copy code != copy system`

`copy module != join trust network`

`imitate concept != authentic implementation`

This is risk reduction, not a claim that a determined party can never independently recreate similar ideas.

## 11. Development Evidence / Future GO Continuity

A system that is secure but impossible for its owner to continue is considered failed architecture.

Every architecture-impacting change must leave durable development evidence in the repository.

Minimum evidence:

- source commit or PR
- what changed
- why it changed
- tests or verification evidence
- architecture/contract impact
- current known state

Principle: build anywhere, record centrally.

Replit, Codex, local development, cloud build systems, and future tools are replaceable work surfaces. They must not become the sole holder of architectural knowledge.

The repository is the durable handoff surface for source, contracts, tests, design decisions, and release provenance.

## 12. Failure and Recovery Rules

- Network loss during download: resume/retry; current app remains usable.
- PATCHMASTER unavailable: use current known-good release.
- Signature/hash mismatch: reject candidate.
- Incompatible release: reject candidate.
- Stage/test failure: discard candidate.
- Migration failure before commit: restore previous known-good state.
- Activation/readback mismatch: rollback.
- Missing trusted manifest: no update.
- Recovery path failure must not delete the last known-good release.

At least one previous known-good target must be retained where platform/storage constraints permit.

## 13. Portability Rule

PATCHMASTER architecture must not depend on Replit, GitHub, Cloudflare, or any single provider as a logical requirement.

Providers may host source, builds, storage, CI, or delivery. Their adapters are replaceable infrastructure.

The architecture remains defined by contracts and evidence owned by the project.

## 14. Security Boundaries

Secrets are never committed to source control.

Private signing material should be generated and stored in a controlled signing/build environment or platform-specific secure store.

Client applications may contain public verification material when required, but should not contain private signing authority.

Obfuscation may be used as defense-in-depth, but it is not the trust boundary and must not be treated as the primary protection mechanism.

## 15. Non-Goals for v1

V1 will not attempt to:

- make generic algorithms impossible to reverse engineer
- prevent all independent reimplementation of public techniques
- create custom cryptographic primitives
- hot-patch arbitrary application code
- make PATCHMASTER a universal remote shell
- require every application to remain online
- move child application business truth into PATCHMASTER

## 16. Implementation Sequence

The first implementation should prove the architecture with the smallest safe slice:

1. Define manifest schema and verifier contract.
2. Define Local Patch Client interface.
3. Integrate LIGHTHOUSE as the first reference client using its existing update-engine boundaries.
4. Support one low-risk package class first, plus full signed APK/release verification.
5. Implement staging, readback, known-good tracking, and rollback evidence.
6. Add centralized PATCHMASTER registry only after the local trust path is proven.
7. Add MIMIR/other applications only after the reference client passes the acceptance tests.

This order deliberately avoids building a large central service before proving the local trust boundary.

## 17. Acceptance Criteria

The design is considered proven only when automated/manual evidence demonstrates all of the following:

- a valid release can be resolved, verified, staged, activated, read back, and committed
- a modified payload is rejected
- a modified manifest is rejected
- a package for the wrong application is rejected
- unauthorized scope expansion is rejected
- an incompatible release is rejected
- activation/readback failure restores or preserves known-good state
- PATCHMASTER outage does not prevent normal application use
- a fresh GO/developer can locate the design, contracts, source, tests, and release evidence from the repository without relying on an old chat transcript

## 18. Architectural Summary

GO PATCHMASTER is the shared release authority.

Local Patch Client is the per-application execution boundary.

OWNER LOGIC SEAL is the trust model that binds application identity, signed releases, allowed scope, provenance, local activation, and readback.

The system protects the project's architecture recipe without making external build tools permanent dependencies and without sacrificing the owner's ability to continue development later.
