# METROPOLIS DEVELOPMENT LOG

This file records implementation history for METROPOLIS development phases. It is separate from the Current Pointer and user-facing operating guides.

## 2026-08-12 — Phase 2A: Ledger + Calendar Command Ownership

- Base main SHA: `394a10f8c35d192a9429c2ba4780b46196fd95d0`
- Working branch: `hardening/domain-command-ownership-2a`
- Pull request: `#34` — `hardening: centralize Ledger and Calendar command ownership`
- Publication commit: `86f3604728965263bbbf5ccfa66bfdac4ca90abd`
- Verified pre-log Gate head: `3684f4474dacb72a666774ef105e1f42711e62fb`
- Internal release: `v4.2.6-20260812-r27-domain-command-ownership`

### Problem

Live Ledger and Calendar handlers could mutate in-memory business state before the r26 durable-write boundary. The durable gate protected persistence/read-back, but business mutation ownership remained distributed across UI handlers and helper paths.

### Ownership changes

- Added `metropolis-domain-commands.js` with public owner `YGPHDomainCommands` version `1.0.0`.
- Migrated live Calendar edit, payment, completion, and cancellation actions to named domain commands.
- Migrated live Ledger balance reconciliation and Add Debt/obligation creation to named domain commands.
- Preserved the validated import/migration obligation path as its own bounded import owner rather than forcing unrelated import semantics through the live UI command path.
- Kept `metropolis-command-gate.js` as the final durable persistence authority for cross-context locking, stale-write blocking, and verified read-back.
- Loaded the domain owner on the stable parser-owned route `app.js -> metropolis-domain-commands.js -> flow-era.js`; the domain owner is not injected through the earlier bootstrap path.

### Cleanup

- Removed direct Ledger/Calendar durable mutation ownership from the migrated live UI blocks instead of layering another wrapper over those handlers.
- `app.js` became smaller in the Phase 2A diff because migrated inline mutation logic moved to its named owner.
- Temporary one-shot source/publication patchers and TDD marker files were removed before Gate.
- No deployment workflow change was retained in the Phase 2A diff.

### TDD evidence

- Initial RED contract: `189` tests total — `185 PASS / 4 intentional FAIL` because `metropolis-domain-commands.js` / `YGPHDomainCommands` did not yet exist. Existing regression behavior remained green.
- Final verified pre-log Gate: `191/191 PASS`, `0 FAIL`.
- Syntax: PASS, including `metropolis-domain-commands.js`.
- UTF-8: PASS — `35 production text assets + RELEASE_MANIFEST.json`.
- Locked dependencies audit: `0 vulnerabilities`.

### Invariants / non-changes

- Visible product version remains `4.2.6`.
- State Schema remains `4`.
- IndexedDB remains `stock-pocket-secure` version `1`, store `kv`.
- Vault format remains `1`.
- Money remains integer satang.
- Protected financial history remains append-only with linked reversal semantics; no real financial/history deletion was introduced.
- Primary deployment authority remains GitHub Actions `Phase 1 Deploy Gate` -> Wrangler -> Cloudflare Worker.

### Gate status

- Phase 2A implementation: COMPLETE.
- Second verification: required on the final log commit head before marking the PR Ready for review.
- Merge to `main`: NOT AUTHORIZED / NOT MERGED.
- Production deploy: NOT AUTHORIZED / NOT DEPLOYED.
