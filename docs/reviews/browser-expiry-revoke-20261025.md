# Browser expiry and GO revocation — focused source regression

Why this: explicit owner recovery could fail after an expired provider session, and queued GO actions could execute after owner revocation during provider awaits. Both are reproducible source defects; retaining eyes-and-hands and exact-target behavior requires correcting these boundaries rather than removing browser actions.

Baseline: remote main `734a8790948b8e6a1687c4bf32ae492b41d07030`, inspected and fetched on 2026-10-25. This includes PR #258 and the previously audited `0bced6c06e7ad60faac01a52f485d1a7c065b78e` (PR #257/#255 integration). Existing draft #256 is not evidence of missing integration. No applicable AGENTS.md or local .agents/skills files were present.

Before editing worker code, the initial seven deterministic tests produced two passes and five failures: connect expiry recovered; pages/goto expiry failed recovery; queued click revocation during connect/pages/element inspection still dispatched; post-dispatch takeover already stopped subsequent steps.

Fixes:
- Preserve known expiry classification across connect, pages and work/goto errors with a sanitized SESSION_UNAVAILABLE error and sessionExpired flag. Explicit owner reopening still retires the tracked session before replacement. Unknown provider failures do not authorize replacement.
- Read current authorization and exact session/target immediately before each provider mutation, after preflight awaits. Validate controller, stop request, current page grant and site policy, plus navigation destination policy.
- Apply the same guard to input clearing and typing separately, and pointer movement and wheel separately. All existing action types remain available.

Boundary: the final authorization read precedes synchronous invocation of the provider command with no intervening provider await. Once invoked, that command is in flight; revoke cannot undo it. Revoke committed while connect/pages/inspection or a previous command is awaiting blocks the next mutation. A multi-command type/scroll action can therefore be partially executed when revoked; no rollback or business outcome proof is claimed. The durable queue's existing DISPATCHING/UNKNOWN no-replay rule remains intact.

Validation: `node --test remote-browser/tests/*.test.mjs` passes 42 tests; `npm test` passes 3 web and 47 DOM tests. New tests use explicit promise barriers, synthetic provider/storage, and execute the actual Worker class. They cover connect/pages/goto expiry cleanup ordering; queued click revoke at connect/pages/inspection; navigate/type/scroll revocation; and an already-dispatched click whose later step is stopped. Existing suites cover exact-target failure, cleanup failure, GO read and action capability, sensitive controls, and permissions.

Limits: local source regressions only. No production provider integration, deployment, APK build/install/signing, real credential generation, physical Xiaomi proof, release-lock change, merge, or production writes. Greenhouse and Vault remain paused. Other diagnostics/persistence work is outside this change.
