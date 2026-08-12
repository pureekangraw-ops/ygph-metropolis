# METROPOLIS Greenfield Runtime Facade Implementation Plan

> **For agentic workers:** use TDD and verification-before-completion.

**Goal:** Give the UI exactly one Greenfield API so presentation code cannot re-create scattered business/storage ownership.

**Architecture:** `greenfield/runtime.mjs` owns composition: browser store, command runtime, domain handlers, mutation coordinator, atomic workflow runtime, projections, cutover, and backup/restore. UI calls owner-visible intents (sale, purchase, obligation, payment, etc.) instead of importing internal layers.

**Rules:**
- Runtime facade opens only `ygph-metropolis-greenfield-secure`.
- Every material write enters the mutation coordinator.
- Runtime exposes diagnostics for architecture/schema/storage/coordination.
- Backup/restore remains encrypted and mutation-coordinated.
- No legacy database or legacy runtime globals.
- Production remains untouched until Owner Final Gate.

### Tasks
- [x] Write RED tests for initialization, business operation, projection, backup/restore, and browser factory.
- [x] Implement `createGreenfieldRuntime()` and `openGreenfieldRuntime()`.
- [x] Run full local Greenfield suite: 39/39 PASS.
- [ ] Run repository PR Gate; Production deploy must remain skipped.
