# GO PATCHMASTER — Release Manifest v1

Status: implementation contract for `patchmaster-v1`.

The manifest describes a release candidate. Structural validity alone does not make a release trusted. A candidate must also pass identity, integrity, scope, compatibility, provenance, signature/evidence, activation, and readback gates.

## Required fields

- `app_id` — exact target application identity.
- `release_id` — unique release identifier.
- `version` — candidate semantic version.
- `channel` — for example `stable`, `beta`, or `owner-test`.
- `package_type` — approved package tier/type.
- `min_current_version` — lowest compatible current version.
- `allowed_scope` — exact paths/scopes this candidate is permitted to modify.
- `payload_hash` — authenticated payload digest.
- `signing_identity` — expected trusted release identity.
- `source_commit` — source revision that produced the candidate.
- `build_provenance` — build/workflow evidence.
- `dependencies` — explicit release dependencies; use an empty array when there are none.
- `rollback_policy` — declared recovery policy.
- `created_at` — release creation time.

Optional fields include `max_current_version`, `migration_contract`, and `expires_at` when the release requires them.

## Trust rules

1. Missing security-relevant fields are rejected rather than defaulted.
2. `app_id` must equal the local app identity.
3. Candidate version must satisfy compatibility policy and be newer than the current version during the normal update path.
4. Payload bytes must hash to `payload_hash`.
5. `allowed_scope` is checked against package-tier policy before activation.
6. Manifest verification must return trusted evidence matching `signing_identity`.
7. Build/source provenance must be present.
8. A verified manifest still cannot bypass the child application's local activation and readback gates.

## Critical Core boundary

Ordinary data/module releases cannot modify Critical Core authorities such as authentication, recovery, update verification/trust root, canonical ledger authority, owner gate, or critical migration authority. Those changes require the full trusted release path appropriate to the platform.

## APK evidence mapping

For a full Android owner-test release, build evidence binds at least application ID, version, APK SHA-256, signer certificate identity, source repository/ref/commit, workflow run, build time, and release channel. Private signing material never appears in this manifest or runtime evidence.

## Non-goal

This contract is not an installer and not a remote shell. Android package installation/readback is a separate platform boundary. GO PATCHMASTER distributes and verifies release evidence; the child platform owner performs final activation and real installed-state readback.
