# Relay contract boundary

Status: **UNRESOLVED / NOT LIVE**

The Android client now has a generic HTTPS adapter, but this repository does not choose the owner route. A verified owner contract must provide exactly three HTTPS endpoints and their JSON schema:

- publish observation snapshot
- poll foreground commands
- publish command receipt

The adapter sends the app/schema version, snapshot identity, freshness fields, redacted targets, and receipt outcome without rewriting them. It does not invent Work IDs, MCP paths, cookies, authorization headers, or backend routes.

Required owner-side evidence before enabling a live client:

1. route ownership and authentication scope;
2. device credential provisioning and revocation;
3. WorkContext/authority mapping;
4. stale revision, revoked epoch, duplicate command, and timeout-after-mutation behavior;
5. deployed readback from the owner system.

Until these are supplied, simulation/unit tests are not MCP end-to-end evidence.
