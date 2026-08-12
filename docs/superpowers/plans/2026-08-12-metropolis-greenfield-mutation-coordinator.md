# METROPOLIS Greenfield Mutation Coordinator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or equivalent TDD execution.

**Goal:** Prevent lost updates when multiple Greenfield workflows race across tabs/windows, without hiding reduced guarantees on platforms without Web Locks.

**Architecture:** Every material workflow enters one mutation coordinator before durable read. Browsers with Web Locks use one named exclusive lock across contexts. Without Web Locks, a same-context promise queue serializes local work and diagnostics explicitly report cross-context safety as LIMITED. Durable revision compare/readback remains the final storage truth.

**Locked rules:**
- Lock name: `ygph-metropolis-greenfield-write`.
- Entire read → command execution → encrypted commit → readback runs inside the lock.
- Web Locks availability upgrades coordination; it does not replace durable revision checks.
- Local fallback must never claim cross-context safety.
- No legacy DB access, no Production deploy, no device mutation.

### Tasks
- [x] Write RED tests for Web Locks serialization, local fallback serialization, and concurrent workflow lost-update prevention.
- [x] Implement coordinator with explicit safety diagnostics.
- [x] Run full Greenfield test suite.
- [ ] Run repository PR Gate and require Production deploy to remain skipped.
