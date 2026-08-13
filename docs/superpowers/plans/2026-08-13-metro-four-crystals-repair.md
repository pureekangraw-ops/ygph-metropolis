# METRO Four-Crystal Defect Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close DEF-METRO-001 through DEF-METRO-007 by repairing the four proven architectural defect families without changing Greenfield DB/Vault identity, cryptography, legacy isolation, or the one-write atomic workflow model.

**Architecture:** Add explicit workflow invariant validation at the atomic workflow authority, add source-compatible Evidence envelope integrity validation before import, converge Calendar `PARTIAL` lifecycle semantics, and make release/publication/cache truth derive from one production release contract. Keep each defect ID independently testable and closeable even when implemented under a shared architectural family.

**Tech Stack:** Browser ES modules, Node.js built-in test runner, IndexedDB, Service Worker Cache API, Cloudflare Worker static assets.

## Global Constraints

- Keep `ygph-metropolis-greenfield-secure` DB identity, v1 store `vault`, key `current` unchanged.
- Keep Vault format `ygph-metropolis-greenfield-vault` v1, PBKDF2-SHA256 600000 and AES-GCM unchanged.
- Do not open, write, clear, migrate, or delete legacy `stock-pocket-secure`.
- Preserve atomic business workflow semantics: validate in memory, then one encrypted durable write with decrypt/readback verification.
- Evidence checksum compatibility must match source FLOW v3 canonicalization/FNV-1a behavior; it is an integrity checksum, not a cryptographic signature.
- Preserve imported provenance and `ownerConfirmation` truth.
- `PARTIAL` remains semantically distinct from `OPEN`, but both are actionable until completed/cancelled.
- No defect is closed from green CI alone; require root repair plus affected-path test/readback.

---

### Task 1: Domain authority invariants — DEF-METRO-003 + DEF-METRO-005

**Files:**
- Create: `greenfield/workflow-invariants.mjs`
- Modify: `greenfield/workflow-runtime.mjs`
- Modify: `tests/greenfield-workflow.test.cjs`
- Modify: `tests/greenfield-business-workflows.test.cjs` only where existing sale tests need explicit stock baseline
- Modify publication/syntax lists later in Task 4

**Interfaces:**
- Produces: `validateWorkflowInvariants(state, commands)`; throws before command execution on relation mismatch or projected stock underflow.
- Consumes: full durable state plus immutable command plan at `executeAtomicWorkflow` boundary.

- [ ] **Step 1: Write failing relation tests**
  - Build durable state containing two receivable sales and two Calendar queues; attempt payment for sale A using queue B; expect `WORKFLOW_QUEUE_SOURCE_MISMATCH` and exact durable equality before/after.
  - Build two obligations and queues; attempt obligation A using queue B; expect same fail-closed behavior.
- [ ] **Step 2: Run workflow tests and verify RED**
  - Run: `node --test tests/greenfield-workflow.test.cjs`
  - Expected: new mismatch tests fail because current workflow authority accepts independent IDs.
- [ ] **Step 3: Write failing stock-underflow tests**
  - Seed imported/live Store baseline quantity and assert sale, withdrawal, and negative adjustment that would project below zero are rejected before durable write.
  - Include a valid mutation that reaches exactly zero and a corrective purchase/positive adjustment from a bad imported baseline where final stock is non-negative.
- [ ] **Step 4: Run workflow tests and verify RED**
  - Expected: underflow tests fail because current authority has no projected-stock gate.
- [ ] **Step 5: Implement minimal invariant module and call it before command execution**
  - Compute current Store stock using the same delta semantics as `projectStore`.
  - Apply planned `STORE_CREATE_RECORD` deltas in command order; reject final/intermediate negative result with `STORE_STOCK_UNDERFLOW:<quantity>`.
  - For payment workflows, locate source-payment and Calendar-payment commands and verify queue `type` + `detail` points to the same source record.
  - Do not weaken command runtime domain isolation.
- [ ] **Step 6: Run focused and full tests; keep one-write behavior green**
  - `node --test tests/greenfield-workflow.test.cjs tests/greenfield-business-workflows.test.cjs`
  - `npm test`

### Task 2: Evidence integrity boundary — DEF-METRO-002

**Files:**
- Create: `greenfield/evidence-integrity.mjs`
- Modify: `greenfield/import-evidence.mjs`
- Modify: `tests/greenfield-import.test.cjs`
- Modify: `tests/greenfield-cutover.test.cjs`
- Modify publication/syntax lists later in Task 4

**Interfaces:**
- Produces: `flowCanonical(value)`, `flowChecksum(value)`, `validateEvidenceIntegrity(evidence)` compatible with source `flow-era.js` FLOW v3 checksum rules.

- [ ] **Step 1: Replace dummy-checksum fixtures with source-compatible signed fixtures and add tamper tests**
  - Event envelope requires `eventId`, `idempotencyKey`, `owner`, `eventType`, `route`, `source`, `payload.record`, and matching event checksum.
  - Package requires matching package checksum after event checksums are assigned.
  - Add tampered event payload test and tampered package metadata test.
- [ ] **Step 2: Run import/cutover tests and verify RED**
  - Expected: current importer accepts tampered payload/package because it never computes checksums.
- [ ] **Step 3: Implement source-compatible integrity validation before any record copy**
  - Canonicalization sorts object keys and excludes every `checksum` key recursively.
  - FNV-1a 32-bit output format `fnv1a-xxxxxxxx`.
  - Reject missing/invalid package checksum, incomplete event envelope, or event checksum mismatch before `structuredClone(state)` import mutations.
- [ ] **Step 4: Verify wrong/tampered Evidence writes nothing in cutover**
  - Assert target store remains empty when integrity fails.
- [ ] **Step 5: Run focused and full tests**
  - `node --test tests/greenfield-import.test.cjs tests/greenfield-cutover.test.cjs`
  - `npm test`

### Task 3: Calendar lifecycle convergence — DEF-METRO-004

**Files:**
- Modify: `greenfield/domain-operations.mjs`
- Modify: `ui/product-model.mjs`
- Modify: `ui/app.mjs`
- Modify: `tests/greenfield-domain-operations.test.cjs`
- Modify: `tests/greenfield-product-model.test.cjs`
- Modify: `tests/greenfield-functional-shell.test.cjs`

**Interfaces:**
- `OPEN` and `PARTIAL` are actionable money-queue statuses.
- A partial `CALENDAR_APPLY_PAYMENT` result remains `PARTIAL`; zero remaining becomes `COMPLETED`.

- [ ] **Step 1: Add failing tests for imported PARTIAL receivable and obligation actionability**
  - Projection must still count outstanding money.
  - UI contract must not hide payment action solely because status is `PARTIAL`.
- [ ] **Step 2: Add failing domain test for partial payment lifecycle**
  - Applying less than remaining to an OPEN/PARTIAL Calendar money queue should yield `PARTIAL`, not reset to `OPEN`.
- [ ] **Step 3: Run focused tests and verify RED**
- [ ] **Step 4: Implement canonical actionable status helper and domain status support**
  - Include `PARTIAL` in Calendar status vocabulary.
  - UI uses shared actionable semantics instead of `status === 'OPEN'`.
- [ ] **Step 5: Run focused and full tests**

### Task 4: Release artifact truth / publication contract — DEF-METRO-001 + DEF-METRO-006 + DEF-METRO-007

**Files:**
- Modify: `RELEASE_MANIFEST.json`
- Modify: `README_TH.md`
- Modify: `.assetsignore`
- Modify: `sw.js`
- Modify: `package.json`
- Modify: `tests/greenfield-hard-cut.test.cjs`
- Modify: `tests/greenfield-service-worker.test.cjs`

**Interfaces:**
- Main production status is declared `PRODUCTION` and branch identity is `main`.
- Effective deploy allowlist contains only manifest-declared production files; directory-wide include wildcards are forbidden.
- Service-worker cache identity is derived from a release asset revision declared in `RELEASE_MANIFEST.json`; shell and manifest must agree.

- [ ] **Step 1: Write failing release-truth and publication tests**
  - Assert manifest status `PRODUCTION`, production branch `main`, README no longer says branch-only/not-production.
  - Assert `.assetsignore` has no `!/ui/**` or `!/greenfield/**` escape hatch and exact file includes equal manifest production files.
- [ ] **Step 2: Write failing cache-coupling test**
  - Require a manifest `serviceWorker.assetRevision` token and require `sw.js` cache identity to use the same release + asset revision token.
  - Require every manifest production module loaded offline to be present in `SHELL`, including new `evidence-integrity.mjs` and `workflow-invariants.mjs`.
- [ ] **Step 3: Run hard-cut/service-worker tests and verify RED**
- [ ] **Step 4: Implement production identity, exact allowlist, and coupled cache revision**
  - Remove directory-wide wildcard includes while keeping parent directories unignored and exact children declared.
  - Add new production modules to manifest, `.assetsignore`, SW shell and syntax gate.
  - Bump service-worker asset revision as part of this release repair.
- [ ] **Step 5: Run focused and full deploy gate**
  - `node --test tests/greenfield-hard-cut.test.cjs tests/greenfield-service-worker.test.cjs`
  - `npm run deploy:gate`

### Task 5: Final HADES/readback and branch completion

- [ ] **Step 1: Review complete diff against DEF-METRO-001..007 and verify one root repair per ID**
- [ ] **Step 2: Run fresh `npm run deploy:gate` and require zero failures**
- [ ] **Step 3: Run HADES read-only diff audit; stop on BLOCKER**
- [ ] **Step 4: Open/ready PR only after all above pass**
- [ ] **Step 5: Merge/deploy only under existing Owner-authorized release permission; verify main workflow + Cloudflare Production success**
- [ ] **Step 6: Device/readback remains a separate final closure requirement for any client-visible/cache defect; CI alone does not close the Defect Master IDs**
