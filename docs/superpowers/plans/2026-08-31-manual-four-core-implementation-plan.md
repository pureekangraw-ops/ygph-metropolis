# LIGHTHOUSE Manual Four-Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and prove the LIGHTHOUSE Manual capability system in the order Foundation → Income → Outcome → Calendar → Ledger → Wiring → Full Test, deriving Intent only after real Core functions are proven.

**Architecture:** Manual is the operational capability surface and remains a runtime dependency even if its UI later becomes non-primary/hidden. Chat is a language/interpretation/confirmation surface. Ledger is the single Chat↔Manual command gateway/dispatcher/collector, while domain logic stays in the owning Core. All four Core houses share the existing Greenfield Runtime/Vault truth root; no duplicate finance engine or persistence is allowed.

**Tech Stack:** Node.js ESM/CJS tests, existing Greenfield Runtime/Vault, existing LIGHTHOUSE capability/PATH stack, Android shell/patch packaging already present in repo.

**Spec:** `docs/superpowers/specs/2026-08-31-manual-chat-ledger-architecture.md`

## Global Constraints

- Work from `feature/manual-four-core-foundation-20260831` unless a new execution branch is deliberately created from its verified HEAD.
- Source design reference commit: `34bd278bb5d138c450f9f28e07d350faff398d2b`.
- Existing four-house foundation is real and must be reused: `manual/foundation.mjs`, `manual/cores/income.mjs`, `manual/cores/outcome.mjs`, `manual/cores/calendar.mjs`, `manual/cores/ledger.mjs`.
- Shared truth root remains `GREENFIELD_RUNTIME` / `GREENFIELD_VAULT`.
- No new finance engine, duplicate store, or UI direct database writes.
- Do not change Brain behavior during this work.
- Do not derive Intent before Phase 2 Function results are proven.
- Candidate function names are not capabilities until Logic + Source + tests prove them.
- Ledger is gateway/dispatcher/collector, not a container for all business logic.
- `Complete` semantics belong to the owning Core. `Edit` and `Cancel` enter through Ledger and are distributed to the owning Core.
- Chat history/language knowledge and Ledger business history remain separate data families.
- Language knowledge may help interpretation but must never create business truth automatically.
- Planned money is not actual money.
- Historical events are append/linked truth; later events must not silently rewrite old-day reality.
- UI copy must be user-facing language only. Internal architecture labels such as Core, Gateway, Runtime, Intent, Trusted Brain, routing notes, or design commentary must not be surfaced merely because they exist in specs.
- TDD is mandatory: write failing test → run and prove RED → minimal implementation → run and prove GREEN → full relevant suite → commit.
- No merge or production deploy during implementation.

## Research Guardrails — Evidence-Backed Only

Research supports this implementation in two parallel modes without changing the task order or creating a new authority layer:

1. **Blind-spot / Risk Guardrail** — identify a demonstrated gap, failure mode, mismatch, or unproven boundary in code/tests/CI/device evidence that could break an already-agreed contract.
2. **Enhancement Opportunity** — strengthen something that already exists and is proven, but only when repository evidence plus external/platform evidence shows a concrete improvement path.

Before a research note enters execution guidance, apply this admission filter:

- **Proven base first.** Ground the note in something already real: current source, tests, CI, physical-device proof, accepted design decision, or verified platform behavior. Pure invention is not execution guidance.
- **Duplicate-contract check.** Re-read the current spec and this plan first. If the point is already explicit and there is no new implementation evidence, treat it as a `KNOWN CONTRACT`, not a new blind spot or enhancement.
- **Do not re-sell settled design as research.** Examples already explicit here/spec include: Chat/Intent history and Ledger business history are separate truths; Ledger is a gateway rather than a God Object; planned money is not actual money; posted historical truth is not silently rewritten; `Complete` semantics branch by owning Core; Intent is derived from proven capability.
- **Prefer narrow mitigation over redesign.** Research guidance should normally add a proof, guardrail, compatibility rule, or focused test. It must not reorder the active plan unless later evidence proves the plan itself invalid.
- **Classify uncertainty honestly.** `PROVEN` = behavior/evidence exists; `OBSERVED` = directly seen but not yet fully generalized; `VERIFY` = important evidence still missing; `BLOCKED` = required condition is absent or contradicted.

Current vetted research guidance to carry beside the relevant tasks:

- **Income / Report semantics — Blind-spot guardrail.** Current Ride behavior can recognize generated/earned value before corresponding cash reaches Ledger, while later credit withdrawal creates the cash event. When Task 2/7 reaches Ride-aware totals, explicitly prove the reporting basis (`earned/generated` vs `cash received`) and prove that a later withdrawal is not double-counted as new income. Do not infer one universal meaning of “income” from transaction direction alone.
- **Calculation Authority reuse — Enhancement opportunity.** `greenfield/calculation-authority.mjs` already proves a useful separation between Ledger cash, generated Store/Ride activity, receivables, obligations, and Calendar comparisons. Task 7 should inspect/reuse this authority before inventing a second Manual calculation brain. Treat existing `semanticWarnings` as evidence that unresolved ownership stays `VERIFY` rather than being silently promoted into truth.
- **Ledger classification — Enhancement opportunity.** Reuse the existing source/subtype/reference metadata and projections, but keep cash effect (`IN`/`OUT`) distinct from business meaning (for example income, settlement, adjustment, reversal). Unknown or legacy classifications should surface as `VERIFY/UNKNOWN` rather than silently falling into a convenient category.
- **Business date projection mismatch — Blind-spot guardrail.** `LEDGER_CREATE_TRANSACTION` can persist an explicit `businessDate`, while the current `calculation-authority.mjs` activity-date resolver does not consult `businessDate`. Before Task 7 daily/monthly reporting is accepted, add proof that explicit business date wins where present and Bangkok-derived activity date is only the fallback. This is a demonstrated implementation mismatch, not a new design invention.
- **Calendar implementation readiness — Blind-spot guardrail.** The target Calendar behavior in the spec is already clear; the research question is only whether the current source/model can represent that target cleanly. At Task 4, prove current record/time capabilities against appointment and To-do requirements before extending them. If the proven model cannot express the contract, record the concrete gap rather than squeezing new semantics into an incompatible legacy field shape.
- **Confirmation freshness — Blind-spot guardrail.** The Runtime already has revision/idempotency machinery. When Task 8/9 adds mutation confirmation across Chat and Manual surfaces, bind execution to the intended target/effect and re-check durable state before commit; if the underlying state changed after preview, fail stale and re-preview instead of executing an old proposal.
- **Idempotent recovery semantics — Enhancement opportunity.** Current single-command runtime rejects duplicate idempotency keys, while `executeMultiGroupCommands()` already has a proven `RECOVERED` path when the full command set was previously committed. Manual mutation/retry behavior should inspect this precedent before inventing another retry model: the same confirmed operation identity should not create a second business effect, and a reused identity with changed semantic parameters must not be treated as the same operation.
- **APK upgrade / data survival — Blind-spot guardrail.** Close/reopen persistence is not the same proof as an in-place APK upgrade. Before any Task 10 path that requires native/APK delivery is called safe, require stable Android signing identity, valid monotonic upgrade metadata, and a physical `APK A with durable data → install APK B over A → migrate/read back same data` proof. Backup/restore remains recovery, not the normal upgrade path.
- **Portable backup trust boundary — Enhancement/security guardrail.** Current portable backup intentionally embeds its `recoveryKey` beside the encrypted vault so the file can restore itself. Preserve this as a convenience mode only with explicit trust semantics; do not present it as having the same confidentiality properties as a backup whose decrypt secret is kept separately. Any future Manual backup UX should distinguish these modes instead of collapsing them into one generic “encrypted backup” label.
- **Vault/backup crypto compatibility — Blind-spot guardrail.** Current vault decryption validates exact format/version/KDF parameters, including the present PBKDF2 work factor, and backup validation also binds exact database/vault versions. Before increasing KDF cost, changing cipher/KDF parameters, or advancing vault/backup versions, prove a compatibility/migration path from existing durable files. A security upgrade that makes existing data unreadable is not an acceptable migration.
- **Whole-vault growth — Research watch (`VERIFY`, not a blocker yet).** Current durable mutation encrypts, writes, decrypts, and canonical-readback-checks the full Greenfield state, while command log and per-record history grow with use. No current evidence proves a user-visible performance failure, so this must not be called a defect. If future Manual volume or high-frequency native data materially increases state size, benchmark real-device read/write latency and vault size before deciding whether compaction, archival, or another storage boundary is needed.

These guardrails are advisory evidence gates attached to the existing tasks. They do not create extra Core ownership, do not change Brain behavior, and do not override the agreed spec when the spec already answers the question.

---

## File Structure Map

### Existing foundation
- `manual/foundation.mjs` — validates and exposes four Core identities on the shared Runtime/Vault root.
- `manual/cores/income.mjs` — Income boundary and verified runtime/domain anchors.
- `manual/cores/outcome.mjs` — Outcome boundary and verified runtime/domain anchors.
- `manual/cores/calendar.mjs` — Calendar boundary and verified runtime/domain anchors.
- `manual/cores/ledger.mjs` — Ledger boundary and gateway-facing anchors.

### Files to add during refinement
- `manual/logic/income.mjs` — proven Income rules and state transitions only.
- `manual/functions/income.mjs` — callable Income capabilities extracted from Income logic.
- `manual/logic/outcome.mjs` — proven Outcome rules and state transitions only.
- `manual/functions/outcome.mjs` — callable Outcome capabilities extracted from Outcome logic.
- `manual/logic/calendar.mjs` — Calendar lifecycle/time-domain rules.
- `manual/functions/calendar.mjs` — callable Calendar capabilities.
- `manual/logic/ledger.mjs` — routing/history/readback/central-authority rules that truly belong to Ledger.
- `manual/functions/ledger.mjs` — Ledger gateway functions, including distributed Edit/Cancel authority where proven.
- `manual/gateway.mjs` — thin command/result handoff into Ledger; no natural-language parsing and no duplicate business engine.
- `manual/report.mjs` — report/summary projection from durable business truth only, if existing projections do not already fully satisfy this role.

### Tests to add
- `tests/manual-income-core.test.cjs`
- `tests/manual-outcome-core.test.cjs`
- `tests/manual-calendar-core.test.cjs`
- `tests/manual-ledger-gateway.test.cjs`
- `tests/manual-surface-parity.test.cjs`
- `tests/manual-report-integrity.test.cjs`
- `tests/manual-chat-integration.test.cjs`

If inspection shows an existing file already owns one of these responsibilities, modify/reuse it instead of creating a duplicate module.

---

### Task 1: Verify Foundation Reality

**Files:**
- Read: `manual/foundation.mjs`
- Read: `manual/cores/income.mjs`
- Read: `manual/cores/outcome.mjs`
- Read: `manual/cores/calendar.mjs`
- Read: `manual/cores/ledger.mjs`
- Read: `greenfield/runtime.mjs`
- Read: `greenfield/business-workflows.mjs`
- Read: `greenfield/domain-operations.mjs`
- Read: `greenfield/projections.mjs`

**Produces:** A checked source map showing which runtime/domain/projection anchors are real and which design ideas are still only candidates.

- [ ] Write a failing foundation/source-map test that asserts each declared anchor exists in current source/runtime exports.
- [ ] Run the targeted test and record RED for any stale/missing declared anchor.
- [ ] Correct foundation metadata only when source proves it wrong; do not invent replacement capability.
- [ ] Re-run targeted test and record GREEN.
- [ ] Run existing Greenfield foundation/runtime tests to ensure no source-of-truth regression.
- [ ] Commit with a foundation/source-map focused message.

**Exit gate:** Four houses exist, point at one truth root, and their declared anchors are evidence-backed.

---

### Task 2: Income — Idea → Logic → Function

**Files:**
- Modify if required: `manual/cores/income.mjs`
- Create/reuse: `manual/logic/income.mjs`
- Create/reuse: `manual/functions/income.mjs`
- Test: `tests/manual-income-core.test.cjs`

**Consumes:** Existing `otherIncome`/Income-related runtime and `LEDGER_CREATE_TRANSACTION` behavior proven in Task 1.

**Produces:** Income callable functions that preserve one Ledger truth and durable readback.

- [ ] Write tests for Income boundaries: no independent wallet/store, actual income becomes Ledger truth, source/subtype/reference remains metadata rather than separate databases.
- [ ] Add RED test for `ขายของ 1200` equivalent normalized command reaching an Income function and producing a real incoming Ledger record through Runtime.
- [ ] Add RED test proving durable readback matches title/amount/date/reference after mutation.
- [ ] Implement the minimum Income logic required by the real Runtime anchors.
- [ ] Extract only the functions proven by those tests; do not pre-add Edit/Cancel/Settle unless the source/logic proves them.
- [ ] Re-run Income tests to GREEN.
- [ ] Run related Greenfield ledger/income tests.
- [ ] Commit Income as an independently reviewable unit.

**Exit gate:** Income can perform its proven real functions without Chat and without duplicate persistence.

---

### Task 3: Outcome — Idea → Logic → Function

**Files:**
- Modify if required: `manual/cores/outcome.mjs`
- Create/reuse: `manual/logic/outcome.mjs`
- Create/reuse: `manual/functions/outcome.mjs`
- Test: `tests/manual-outcome-core.test.cjs`

**Consumes:** Existing `expense` / `verifiedExpense` and `LEDGER_CREATE_TRANSACTION` behavior.

**Produces:** Outcome callable functions with durable expense readback and clear planned-vs-actual boundary.

- [ ] Write RED test for `ข้าว 65` equivalent normalized command reaching Outcome and producing an OUT/EXPENSE Ledger record via Runtime.
- [ ] Write RED test proving no UI/function direct DB write is used.
- [ ] Write RED test that a spending ceiling/planned amount does not itself create an expense transaction.
- [ ] Implement only the Outcome rules required to satisfy proven Runtime behavior.
- [ ] Extract proven functions from the logic.
- [ ] Re-run Outcome tests to GREEN.
- [ ] Run existing expense capability/runtime tests.
- [ ] Commit Outcome separately.

**Exit gate:** Outcome records actual spending through Runtime, preserves durable readback, and does not confuse control/planned values with financial truth.

---

### Task 4: Calendar — Idea → Logic → Function

**Files:**
- Modify if required: `manual/cores/calendar.mjs`
- Create/reuse: `manual/logic/calendar.mjs`
- Create/reuse: `manual/functions/calendar.mjs`
- Test: `tests/manual-calendar-core.test.cjs`

**Consumes:** Proven Calendar domain operations such as create/reschedule/status/payment only where current source actually exposes them.

**Produces:** Calendar functions for time-domain items independent of Chat and not restricted to finance-only data.

- [ ] Write RED test for an ordinary appointment that creates Calendar truth but no financial transaction.
- [ ] Write RED tests for To-do lifecycle using explicit Complete/Edit/Cancel semantics rather than free truth-toggling.
- [ ] Write RED test that Shopping To-do planned amount is not actual expense truth.
- [ ] Write RED test that completing a Shopping To-do creates an actual expense only through the owning Outcome/Runtime path when that behavior is proven.
- [ ] Write RED tests for obligation/follow-up references only where current source proves those relationships.
- [ ] Implement Calendar lifecycle/time logic without moving finance truth into Calendar.
- [ ] Extract proven Calendar functions.
- [ ] Re-run Calendar tests to GREEN.
- [ ] Run existing Calendar runtime/domain tests.
- [ ] Commit Calendar separately.

**Exit gate:** Appointment, obligation/follow-up, and To-do behaviors are separated correctly; non-financial Calendar use works without creating money truth.

---

### Task 5: Ledger Last — Gateway, Authority, History, Readback

**Files:**
- Modify if required: `manual/cores/ledger.mjs`
- Create/reuse: `manual/logic/ledger.mjs`
- Create/reuse: `manual/functions/ledger.mjs`
- Create: `manual/gateway.mjs`
- Test: `tests/manual-ledger-gateway.test.cjs`

**Consumes:** Proven Income, Outcome, and Calendar functions from Tasks 2–4.

**Produces:** One stable Manual command gateway that routes to real Core owners, centralizes Edit/Cancel authority, collects readback, and does not absorb Core business logic.

- [ ] Write RED routing tests showing one gateway can dispatch to Income, Outcome, and Calendar based on stable command metadata.
- [ ] Write RED test proving `Complete` delegates to the owning Core semantics.
- [ ] Write RED tests proving Edit and Cancel enter through Ledger and are then distributed to the owning Core.
- [ ] Write RED test proving Ledger cannot satisfy a business mutation by writing storage directly.
- [ ] Write RED test proving runtime result/readback returns through Ledger as a stable result shape.
- [ ] Write RED history test: business mutations belong to Ledger/business history; interpretation/typo/error data does not.
- [ ] Implement minimal routing/authority/readback logic.
- [ ] Re-run Ledger tests to GREEN.
- [ ] Run all four Manual Core test files.
- [ ] Commit Ledger/gateway as a separate unit.

**Exit gate:** Chat/Manual can have one handoff point without Ledger becoming a God Object.

---

### Task 6: Internal Wiring Proof

**Files:**
- Modify: `manual/foundation.mjs` only if composition needs an explicit gateway export.
- Modify/create: Manual modules from prior tasks as required by proven interfaces.
- Test: `tests/manual-surface-parity.test.cjs`

**Produces:** Proven `Core ↔ Ledger ↔ Runtime ↔ Readback` wiring using one durable truth root.

- [ ] Write RED test creating an Income record through the Manual path and reading the same durable record through Ledger/readback.
- [ ] Write RED test creating an Outcome record through the Manual path and reading the same durable record through Ledger/readback.
- [ ] Write RED test creating a Calendar item through the Manual path and reading it after state reload.
- [ ] Implement only the composition needed to pass those tests.
- [ ] Re-run parity tests to GREEN.
- [ ] Run the four Core tests plus Greenfield persistence tests.
- [ ] Commit internal wiring.

**Exit gate:** Manual works as a complete operational dependency without Chat.

---

### Task 7: Report Integrity

**Files:**
- Reuse first: `greenfield/projections.mjs`
- Create only if needed: `manual/report.mjs`
- Test: `tests/manual-report-integrity.test.cjs`

**Produces:** Report/Summary derived from durable business truth and appropriate projections, never Chat transcript/error history.

- [ ] Write RED scenario with real Income + Outcome + Calendar/obligation/To-do data.
- [ ] Assert report totals and outstanding/upcoming values reflect durable state correctly.
- [ ] Inject interpretation-history-like data into the Chat side and assert report output does not count it as business truth.
- [ ] Reuse existing Greenfield projections wherever sufficient; add a thin Manual projection only for missing presentation aggregation.
- [ ] Re-run report test to GREEN.
- [ ] Run projection/ledger tests.
- [ ] Commit report integrity separately.

**Exit gate:** A report is still a business report after multiple Core types and language-history noise exist.

---

### Task 8: Derive Action Intent from Proven Functions

**Files:**
- Reuse existing front-door/Intent modules where present.
- Add only the smallest command-vocabulary mapping module if no existing owner exists.
- Test: `tests/manual-chat-integration.test.cjs`

**Consumes:** Function inventory proven by Tasks 2–7.

**Produces:** Human language → stable action/target/parameters mapping that names only real capabilities.

- [ ] Generate an explicit capability inventory from the proven Manual functions.
- [ ] Write RED tests that known phrases map only to capabilities in that inventory.
- [ ] Write RED test that an unsupported action fails closed instead of causing a new capability to be invented.
- [ ] Preserve existing AI-assisted typo/ambiguity handling as interpretation support, not business logic.
- [ ] Preserve confirmation for mutations; read-only requests may pass without mutation confirmation.
- [ ] Implement minimal Intent mapping.
- [ ] Re-run Intent tests to GREEN.
- [ ] Commit Intent separately.

**Exit gate:** Intent is vocabulary over proven capability, not an architecture owner.

---

### Task 9: Chat ↔ Manual Full Integration

**Files:**
- Modify only the existing Chat/front-door connection points required to call `manual/gateway.mjs`.
- Test: `tests/manual-chat-integration.test.cjs`

**Produces:** Full route `User → Chat → Interpretation → Intent → Confirmation → Ledger → Core → Runtime → Readback → Ledger → Chat`.

- [ ] RED: `ข้าว 65` through Chat routes to Outcome and returns durable readback.
- [ ] RED: `ขายของ 1200` through Chat routes to Income and returns durable readback.
- [ ] RED: appointment through Chat routes to Calendar without a financial transaction.
- [ ] RED: obligation and To-do commands route to their proven Calendar/Core functions.
- [ ] RED: the same operations performed directly through Manual become visible/readable through Chat using the same data.
- [ ] RED: data created through Chat becomes visible in Manual using the same data.
- [ ] RED: typo/odd-word interpretation history remains on Chat side while resulting business mutation/history remains on Ledger side.
- [ ] Implement only the thin handoff needed to pass these tests.
- [ ] Re-run integration tests to GREEN.
- [ ] Run full relevant CI suite.
- [ ] Commit Chat↔Manual integration.

**Exit gate:** Both surfaces reach the same proven capabilities and truth.

---

### Task 10: Android Surface + Persistence Acceptance

**Files:**
- Modify existing Manual UI/shell files only after inspecting current Android packaging.
- Modify trusted/native layer only if runtime packaging evidence proves it necessary.
- Tests: existing Android shell tests plus new surface acceptance tests where supported.

**Produces:** User-facing Manual entry for Income/Outcome/Ledger/Calendar without exposing internal architecture notes, plus a build artifact appropriate to the changed layer.

- [ ] RED UI test for Manual navigation to Income / Outcome / Ledger / Calendar.
- [ ] RED UI test that internal labels such as `Core`, `Gateway`, `Runtime`, `Intent`, routing notes, or design commentary are not surfaced as product copy.
- [ ] Wire UI controls to Manual/gateway contracts; never direct DB writes.
- [ ] Verify close/reopen persistence with available Android/device harness or mark physical-device proof VERIFY if no device harness exists.
- [ ] Run Android shell tests and full CI.
- [ ] If changes are patchable UI only, build and verify signed `.lhpatch` with the current trusted key workflow.
- [ ] If trusted/native packaging is required, build APK and document why patch-only delivery is insufficient.
- [ ] Do not expose raw signing source/key material.
- [ ] Commit Android surface/artifact changes.

**Exit gate:** Manual and Chat both operate against the same durable truth on the Android artifact, with clean user-facing copy.

---

## Final Acceptance Matrix

The implementation is not complete until evidence exists for all of these:

| Scenario | Manual | Chat | Durable Readback | Report Correct |
| --- | --- | --- | --- | --- |
| `ข้าว 65` → Outcome | PASS | PASS | PASS | PASS |
| `ขายของ 1200` → Income | PASS | PASS | PASS | PASS |
| Appointment | PASS | PASS | PASS | PASS |
| Obligation | PASS | PASS | PASS | PASS |
| General To-do | PASS | PASS | PASS | PASS |
| Shopping To-do planned ≠ actual | PASS | PASS | PASS | PASS |
| Edit via Ledger | PASS | PASS | PASS | PASS |
| Cancel via Ledger | PASS | PASS | PASS | PASS |
| Close/reopen persistence | PASS | PASS | PASS | PASS |
| Chat typo/error history separated | N/A | PASS | N/A | PASS |

A cell may be `VERIFY` only when the required execution environment is genuinely unavailable; it must not be silently treated as PASS.

## Completion Evidence

Final handoff must include:

- Repo / branch / base / exact HEAD
- Source map and Core decisions
- Proven function inventory per Core
- RED → GREEN evidence per task
- Full CI result
- Chat↔Manual surface parity evidence
- Durable close/reopen evidence or explicit VERIFY
- Report integrity evidence
- PR link/number
- Signed `.lhpatch` or APK as required by the changed layer
- Short phone test steps
- Remaining VERIFY/BLOCKED items
- Independent audit points

No implementation step may ask BIG to write code, assemble files, build, or sign artifacts.