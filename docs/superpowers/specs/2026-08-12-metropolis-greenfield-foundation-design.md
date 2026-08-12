# METROPOLIS Greenfield Foundation Design

**Status:** OWNER-AUTHORIZED / GREENFIELD / PRE-PRODUCTION
**Branch:** `greenfield/metropolis-vnext`
**Legacy production database:** `stock-pocket-secure` — READ/ROLLBACK ONLY, DO NOT MUTATE
**Evidence cutover source:** `FLOW-1786527289637`, source revision `28`

## Goal

Replace the layered METROPOLIS backend with a clean runtime whose only Current business domains are `STORE`, `LEDGER`, and `CALENDAR`, while preserving business evidence through one verified import instead of retaining legacy runtime compatibility.

## Locked owner decisions

- Greenfield architecture; legacy FLOW/r5/maintenance/remaster compatibility is not a design constraint.
- Preserve business data/evidence, not legacy code paths.
- `RIDE` is excluded from the new Current runtime.
- Use a new database and new Vault identity. Never clear or overwrite `stock-pocket-secure` during build/test/cutover preparation.
- Evidence rev28 is an import source, not an instruction to silently promote `UNCONFIRMED` records.
- Merge to `main`, Production deploy, and real-device cutover remain behind the Owner Final Gate.

## Architecture

### State

Greenfield State Schema starts at `1` because this is a separate storage identity, not Schema 5 of the legacy database. State contains exactly three domain registries: `STORE`, `LEDGER`, `CALENDAR`. Each imported record keeps the original record payload plus provenance metadata.

### One-time evidence import

Importer accepts `YGPH_FLOW_EVENT_EXCHANGE` v3 `SNAPSHOT_AND_DELTA` only, verifies the expected package/revision and reconciliation `PASS`, routes by event `source`, excludes non-Current sources such as `RIDE`, preserves owner-confirmation state, and refuses a second import into an already imported Greenfield state.

### Command ownership

All live durable changes enter through one command runtime. Every command carries `commandId`, `idempotencyKey`, `domain`, `type`, `expectedRevision`, and `payload`. Command type must match its domain prefix; stale revision and duplicate idempotency keys fail before mutation. One successful command advances State revision exactly once.

### Persistence

Greenfield storage uses `ygph-metropolis-greenfield-secure` with Vault format `ygph-metropolis-greenfield-vault`. AES-GCM + PBKDF2 remains a security primitive, not a compatibility bridge. Commit verifies the expected durable revision, writes an encrypted Vault, decrypts the stored result, and compares durable readback with the proposed state before reporting `VERIFIED`.

## Cutover model

`Evidence rev28 → validate/reconcile → one-time import → Greenfield encrypted DB → durable readback → domain tests → UI integration → device cutover → Owner Final Gate`

The old database remains untouched until after Owner-approved production cutover and an explicit retirement decision.

## Non-goals of this foundation batch

- No merge to `main`.
- No Cloudflare Production deploy.
- No deletion of legacy source files yet.
- No device database mutation.
- No UI replacement yet; this batch establishes the new backend contract and importer first.
