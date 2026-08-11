# METROPOLIS Maintenance Center Design

## Goal
Finish the current METROPOLIS app with two owner-approved maintenance capabilities while preserving auditability and making future continuation cheaper: (1) manual stock reconciliation/adjustment and (2) recovery/reset controls including factory reset.

## Source authority
- Working base: `feat/metro-finalization`, because it contains METROPOLIS 4.2.5 / `metropolis-r5-5.*` and matches the device-visible 4.2.5 runtime observed by BIG.
- `main` remains behind at 4.2.4 during this work and must not be used as the implementation base until the 4.2.5 line is reconciled back into it.
- Existing encrypted local authority remains the `stock-pocket-secure` IndexedDB vault. Existing Ledger/Store/Calendar source relationships remain authoritative until an explicit reset destroys the whole local database.

## Architectural rule
Do not add this feature as another large block inside `app.js`.

Create a maintenance slice with clear boundaries:
1. `metropolis-maintenance-core.js` — pure validation/planning logic. No DOM, IndexedDB, Cache API, Service Worker, or global state writes. Must be Node-testable.
2. `metropolis-maintenance.js` — browser runtime adapter. Owns DOM wiring, calls existing encrypted commit pipeline for auditable changes, and owns destructive local reset adapters.
3. `metropolis-maintenance.css` — maintenance UI only.
4. `tests/metropolis-maintenance.test.cjs` — behavior tests for pure rules and source-contract checks for runtime wiring.
5. `docs/engineering/METROPOLIS_MAINTENANCE_NOTES.md` — continuation map plus bug/fix log.

This makes future workers extend one bounded maintenance slice instead of rewiring `app.js` or the existing r5 visual/runtime chain.

## Capability A — Manual Stock Adjustment
### Intent
Correct stock when physical quantity and system quantity do not match without rewriting history or pretending the difference was a purchase/sale.

### Behavior
- Actions: `MANUAL_IN`, `MANUAL_OUT`, `CORRECTION`.
- Input: mode, quantity, reason, optional note.
- Required reason categories: stock count mismatch, damaged goods, lost goods, missed receipt, data correction, other.
- Never permit resulting stock below zero or above the existing `MAX_QUANTITY` boundary.
- Record before quantity, delta, after quantity, adjustment id, timestamp, actor, reason, note.
- Preserve existing sales/purchases/withdrawals.
- Do not create a Ledger transaction automatically.
- Persist through the existing `persistAndRender` / durable readback path with an explicit STORE event and idempotency key.
- Store movement evidence in a dedicated `state.store.adjustments` array normalized lazily for backward compatibility. Do not change the encrypted vault format or DB version.

### Stock value rule
To avoid inventing a financial valuation, manual quantity correction changes quantity only. If the resulting quantity becomes zero, stock value is normalized to zero by the existing invariant. Otherwise existing `stockValueSatang` remains unchanged and the audit record clearly states that no financial transaction or valuation was created.

## Capability B — Recovery & Reset Center
Four levels, ordered from safest to most destructive.

### Level 1 — Reconcile
- Stock: open Manual Stock Adjustment.
- Cash: route to the existing balance verification/reconciliation flow rather than invent a second Ledger correction implementation.
- No history deletion.

### Level 2 — Partial Operational Reset
Do not delete source history or break cross-domain references.
- STORE: reset current stock to zero through an auditable `CORRECTION`; keep sales/purchases/withdrawals.
- RIDE: reset only `currentRound` operational state; keep jobs, expenses, withdrawals and Ledger evidence. If no active round, report no action.
- SETTINGS: restore user-operational preferences to defaults while preserving encryption/passphrase, DB, vault history and financial data. Preserve values that are data semantics rather than UI preferences.
- CALENDAR historical/source-linked records are not destructively deleted in partial reset because that would orphan Ledger/Store references. The UI must explain this boundary.

### Level 3 — Factory Reset
Purpose: return the app to first-run Setup while leaving deployed application code/service worker assets available.
- Two-stage confirmation.
- User must type exact confirmation phrase `RESET`.
- Close the live IndexedDB handle.
- Delete the entire `stock-pocket-secure` IndexedDB database, which removes vault, rollback snapshot metadata, trusted-device CryptoKey and all local domain records together.
- Read back database absence before declaring success.
- Clear in-memory state/key/vault references.
- Reload to first-run Setup.
- Do not touch Cloudflare deployment, GitHub, remote code, or app caches.

### Level 4 — Full Local Cleanup
Purpose: factory reset plus refresh local application runtime caches.
- Require exact confirmation `RESET ALL`.
- Perform Factory Reset database deletion.
- Delete METROPOLIS app caches and lifecycle meta cache.
- Unregister this app's service worker registration.
- Verify targeted caches are absent and registration is removed where browser APIs expose readback.
- Reload. This level requires network availability to reconstruct the application shell; block it when offline and explain why.

## Confirmation and safety rules
- Destructive buttons live in Settings under a dedicated `Recovery & Reset` card, separated visually from normal settings.
- Factory and Full Cleanup use typed confirmation; ordinary modal confirm alone is insufficient.
- Partial reset actions require a second confirm but no typed phrase.
- Every non-destructive/partial state mutation uses the existing encrypted commit/readback pipeline and creates Audit/Event evidence.
- Factory/Full reset cannot preserve an audit event inside the database being destroyed. The UI presents a final impact summary before execution; external engineering notes record the feature semantics, not user-specific reset events.

## UI
- Add `ปรับสต็อก` button in STORE near existing sale/purchase/withdraw actions.
- Add `Recovery & Reset` card in Settings with four clearly ordered levels and plain-language impact text.
- Use existing modal system and approved METROPOLIS dark visual tokens; no new visual language.

## Error handling
- Manual adjustment: validation failures leave state untouched and modal open.
- Partial reset: clone-before-change semantics; on persistence failure existing commit pipeline rolls back/readbacks and UI re-renders durable state.
- IndexedDB deletion: handle `blocked`, `error`, and timeout; never claim success without readback.
- Cache/service worker cleanup: report partial failure and do not claim Full Cleanup complete if targeted cache/SW readback fails.

## Testing
- Pure tests for adjustment planning, non-negative/maximum bounds, reason requirement, zero-stock semantics, partial reset planning, destructive confirmation phrases and cache targeting.
- Source-contract tests assert runtime module contains typed confirmation, database deletion/readback, existing balance reconcile route, existing durable persistence route and does not create Ledger transactions for manual stock adjustment.
- Run complete existing `npm test`, syntax and UTF-8 deploy gate before merge.

## Documentation / continuation contract
`docs/engineering/METROPOLIS_MAINTENANCE_NOTES.md` must contain:
- module map and extension rules;
- current source/runtime authority and release line;
- every bug discovered during this work with symptom → root cause → fix → prevention/test;
- deployment/readback evidence and remaining device-only verification items.

A durable note with the same high-value decisions, bugs and fixes must also be written to BIG's connected Drive/notes library after implementation verification.