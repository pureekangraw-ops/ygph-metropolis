# METROPOLIS Greenfield Hard Cut Implementation Plan

> **For agentic workers:** use TDD, systematic debugging, and verification-before-completion.

**Goal:** Replace the branch root with a single Greenfield release-candidate tree so no legacy runtime file can be loaded or become a future dependency by accident.

**Target RC identity:** `5.0.0-greenfield-rc1` (branch-only; not Production until Owner Final Gate).

**Hard-cut invariant:** Git history preserves rollback, but the RC working tree contains no FLOW/r5/v4/maintenance/remaster/highway/legacy Vault runtime.

### Target tree
- workflow + Wrangler deployment config
- root Greenfield UI: `index.html`, `app.mjs`, `ui-model.mjs`, `styles.css`, `manifest.webmanifest`, `sw.js`, icons
- `greenfield/` backend only
- Greenfield tests only for the release gate
- `RELEASE_MANIFEST.json`, README, UTF-8 verifier

### Locked release identity
- domains: STORE / LEDGER / CALENDAR only
- State Schema 1
- DB `ygph-metropolis-greenfield-secure` v1
- Vault `ygph-metropolis-greenfield-vault` v1
- AES-GCM 256 + PBKDF2-SHA256 600000
- cutover Evidence `FLOW-1786527289637` source revision 28
- no compatibility chain
- legacy `stock-pocket-secure` is rollback-only and is never opened by the RC

### Tasks
- [x] Write RED hard-cut contract against the layered branch tree.
- [ ] Create a fresh RC Git tree containing only selected Greenfield assets.
- [ ] Promote preview UI to root and fix root-relative imports/service-worker cache.
- [ ] Replace release manifest, publication allowlist, package gate, and README together.
- [ ] Run Greenfield-only tests + syntax + UTF-8 + hard-cut structural contract.
- [ ] Run PR Actions; Production deploy must remain skipped.
- [ ] Inspect final PR diff/tree and return to Owner Final Gate without merge/deploy.
