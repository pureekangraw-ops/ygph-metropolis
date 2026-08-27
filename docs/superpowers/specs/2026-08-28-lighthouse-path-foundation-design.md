# LIGHT HOUSE — PATH Foundation Design

Status: WRITTEN SPEC / OWNER REVIEW REQUIRED  
Date: 2026-08-28  
Owner / Final Authority: BIG  
Development signature: YGPH  
Implementation branch: `feature/lighthouse-path-foundation`  
Base: stable `main` at `5c20b8bc7f61ea0963ec5bab7fe1b52140e166bb`

## 1. Purpose

LIGHT HOUSE is built around **PATH**: the system must understand the required result, choose the smallest correct and authorized route, execute through existing legal capability, observe Reality, read back the durable effect, and close the path exactly.

Core rule:

```text
REQUIRED RESULT
→ SMALLEST CORRECT PATH
→ EXECUTE
→ OBSERVE REALITY
→ READBACK
→ EXACT CLOSURE
```

The first foundation goal is not a complete AI product or a complete Manual UI. It is to prove that this route-selection contract can sit above the existing Greenfield Runtime without rewriting durable storage, business workflows, security, backup, restore, or domain truth.

## 2. Scope of this foundation

This spec covers the smallest architectural foundation needed to support:

1. a normalized request / required-result contract;
2. a deterministic Path Kernel;
3. Direct Path execution;
4. a Gem Processing contract that can be implemented later without changing the Path core;
5. exact readback and closure semantics;
6. the first vertical proof using `ข้าว 65`.

This spec does **not** cover:

- full AI interpretation;
- provider enablement or API keys;
- full Gem Registry implementation;
- multiple recursive Resonance hops;
- complete Manual UI redesign;
- new Greenfield data domains;
- database migration;
- rewriting Runtime / Workflow / Ledger / Calendar / Store / Ride;
- production promotion before acceptance.

## 3. Current software Reality to preserve

Stable `main` already contains the lower execution machinery we need:

- `greenfield/runtime.mjs` owns legal application-level execution and exposes capabilities such as `expense()` and `otherIncome()`;
- `greenfield/business-workflows.mjs` builds business workflows;
- `greenfield/workflow-runtime.mjs` and command runtime execute atomically;
- durable truth remains in the existing encrypted Greenfield state / Vault / IndexedDB;
- current domains remain `STORE`, `LEDGER`, `CALENDAR`, `RIDE`;
- `greenfield/master-input-router.mjs` already demonstrates useful readback patterns for expense/income/ride actions;
- `master-input/intent-contract.mjs` already contains useful normalized semantic vocabulary such as `EXPENSE`, `OTHER_INCOME`, `RIDE_*`.

These are reusable machinery/evidence. They are **not** the new PATH foundation itself.

PR #82 is explicitly not the new foundation. Its useful pieces may be referenced, but the new design must not inherit the mandatory `AI → Manual → Runtime` coupling.

## 4. Product Path and Execution Path

PATH must remain correct in two aligned layers.

### Product Path

```text
Intent
→ Interaction
→ Feedback
→ Result
```

For the first proof:

```text
BIG enters "ข้าว 65"
→ system recognizes a deterministic expense shorthand
→ system executes the expense through the existing Runtime
→ system reports a proven completed result
```

The user is not required to pass through an AI screen or a Manual screen merely because those surfaces exist.

### Execution Path

```text
Input
→ Source Adapter / Normalization
→ Required Result
→ Path Kernel
→ Direct Path
→ Expense Capability
→ Existing Runtime
→ Durable LEDGER Effect
→ Readback
→ Closure
```

The two paths are aligned only if `ข้าว 65` ends as the exact requested expense effect and that effect is observed in durable state.

## 5. PATH Contract

The Path Contract is the boundary between any input source and the Path Kernel.

Input sources may eventually include Pattern, AI, Manual, API, or Automation. None receives special execution authority.

A normalized request must contain only enough information for route selection and proof. Foundation shape:

```js
{
  version: '1',
  source: 'PATTERN' | 'AI' | 'MANUAL' | 'API' | 'AUTOMATION',
  action: 'CREATE' | 'QUERY',
  object: 'EXPENSE' | 'OTHER_INCOME' | 'RIDE_START' | 'RIDE_JOB' | 'RIDE_END' | 'RIDE_TODAY_SUMMARY',
  fields: { ... },
  requiredResult: {
    kind: string,
    effect: object
  }
}
```

Rules:

- `requiredResult` expresses what must become true, not which UI or implementation component must be used.
- The contract may reuse current semantic vocabulary where it still fits Reality.
- Missing or ambiguous information must not be guessed.
- A source adapter may fail to normalize and return `NO_MATCH` / `NEEDS_INTERPRETATION`; that is not a failed Path execution because the Path has not started yet.
- Once accepted by the Path Kernel, the request is immutable for that path attempt.

For `ข้าว 65`, the deterministic source adapter should produce the semantic equivalent of:

```js
{
  version: '1',
  source: 'PATTERN',
  action: 'CREATE',
  object: 'EXPENSE',
  fields: {
    title: 'ข้าว',
    amountSatang: 6500
  },
  requiredResult: {
    kind: 'LEDGER_TRANSACTION',
    effect: {
      direction: 'OUT',
      subtype: 'EXPENSE',
      amountSatang: 6500,
      title: 'ข้าว'
    }
  }
}
```

## 6. Path Kernel responsibilities

The Path Kernel is a deterministic coordinator above the existing Runtime.

It owns:

1. validating the Path Contract;
2. resolving candidate route(s);
3. selecting the **smallest correct path**;
4. deciding Direct Path vs Gem Path;
5. selecting a registered capability;
6. preserving explicit execution authority boundaries;
7. tracking path-local status;
8. requiring readback proof before `COMPLETE`;
9. isolating local failure so one failed path does not imply whole-app failure;
10. producing exact closure.

It does **not** own:

- durable business truth;
- direct Vault writes;
- business workflow rules already owned by Runtime/workflow code;
- AI interpretation;
- UI rendering;
- global graph/pathfinding machinery;
- authority escalation.

### Route-selection rule

Foundation routing is deterministic and intentionally small. Do not build a generic graph engine.

```text
Can the required result map directly to a legal existing capability
without transformation?

YES → DIRECT PATH
NO  → GEM PATH candidate (only when Gem Processing is implemented)
```

If neither route is valid, close `BLOCKED` or `VERIFY` according to the evidence available. Do not silently invent a path.

## 7. Direct Path

Direct Path is used when the request is already sufficiently normalized and no transformation is required.

First supported route:

```text
EXPENSE required result
→ expense capability adapter
→ runtime.expense(...)
→ durable LEDGER readback
```

The capability adapter is thin. It may:

- generate workflow / transaction IDs through an injectable ID factory;
- map normalized fields into the existing `runtime.expense()` input shape;
- define the exact readback proof required for that capability.

It must not duplicate expense business logic already implemented in `buildExpenseWorkflow()` / Runtime.

The existing Runtime remains the legal execution authority.

## 8. Gem Contract

Gem Processing is a transformation mechanism used only when the selected Path genuinely requires transformation.

A Gem is not a domain owner, execution authority, or permanent route host.

Foundation contract:

```js
Gem.process(context) -> {
  status: 'RESOLVED' | 'NEEDS_SUPPORT' | 'UNRESOLVED',
  proposal?: object,
  supportRequest?: object,
  evidence?: object
}
```

Rules:

- Path Kernel chooses whether a Gem Path is needed.
- One **Primary Gem** owns the transformation result for the path.
- Primary may request controlled Resonance support only when necessary.
- Foundation default allows at most **one support hop**.
- Support result returns to Primary.
- No recursive Gem-to-Gem routing in Foundation.
- Gem output must return to deterministic contract validation before capability execution.
- Gem/AI output cannot directly call Runtime or write durable truth.
- A Direct Path must bypass Gem processing completely.

The first `ข้าว 65` proof therefore must assert that no Gem is invoked.

## 9. Reality, Readback, and Closure

A Runtime call returning without throwing is not enough to declare success.

Path completion requires durable readback that proves the required effect.

Foundation closure statuses:

```text
COMPLETE
PARTIAL
VERIFY
BLOCKED
```

### COMPLETE

The required effect exists in durable Reality and matches the contract.

### PARTIAL

Some explicitly separable requested effect succeeded, while another required effect did not. Foundation does not need to manufacture a PARTIAL example; the state exists so future multi-effect paths do not require a contract rewrite.

### VERIFY

Execution state or observed evidence is insufficient to prove exact arrival. No success claim.

### BLOCKED

The path cannot legally or technically continue under current Reality.

For the first expense path, `COMPLETE` requires a durable LEDGER record with at minimum:

- type `TRANSACTION`;
- direction `OUT`;
- subtype `EXPENSE`;
- `amountSatang === 6500`;
- title equivalent to `ข้าว`;
- the expected generated record ID;
- state revision/readback available after execution.

## 10. Source adapters and dual input

Input interpretation sits before the Path Kernel.

Foundation build order:

```text
Pattern match? YES
→ deterministic normalization
→ Path Kernel

Pattern match? NO
→ later AI interpretation
→ deterministic normalization / validation
→ same Path Kernel
```

AI therefore gains no separate execution lane.

Manual will later be another peer source/control/view surface that can emit or inspect Path-compatible requests/results. It is not a mandatory bridge between AI and Runtime.

## 11. First deterministic pattern

The first pattern exists only to prove the skeleton.

Supported proof form:

```text
<title> <positive amount in baht>
```

For Foundation, the specific golden case is `ข้าว 65`.

The parser must be conservative:

- exact positive numeric amount required;
- non-empty title required;
- convert baht to satang safely;
- ambiguous/unsupported text returns `NO_MATCH` rather than guessing;
- no AI fallback is implemented in this first slice.

We should not broaden the grammar until the first Path proof is green.

## 12. Proposed module boundaries

New foundation code should live outside `greenfield/` business internals so the boundary is visible.

Initial modules:

```text
lighthouse/
  path-contract.mjs
  path-kernel.mjs
  pattern-input.mjs
  gem-contract.mjs
  capabilities/
    expense.mjs
```

Tests:

```text
tests/lighthouse-path-contract.test.cjs
tests/lighthouse-pattern-input.test.cjs
tests/lighthouse-path-kernel.test.cjs
tests/lighthouse-direct-expense.test.cjs
```

These names are implementation guidance, not product authority. If current repository conventions reveal a materially better location during implementation planning, the plan may adjust file placement without changing the architecture contract.

## 13. Error and failure discipline

- Invalid Path Contract: reject before execution.
- Pattern no-match: return source-level `NO_MATCH`; do not create a failed execution path.
- Missing capability: `BLOCKED`.
- Runtime rejection: path-local failure; classify without claiming global failure.
- Readback mismatch: `VERIFY`, never `COMPLETE`.
- Duplicate/idempotent execution: may recover only if durable readback proves the exact required effect.
- A failure in one capability must not trigger full-system mutation/retest beyond what verification requires.

## 14. TDD acceptance sequence

Implementation must proceed test-first.

### Contract tests

- valid expense normalized request accepted;
- malformed contract rejected;
- required result cannot be omitted;
- source does not confer authority.

### Pattern tests

- `ข้าว 65` → EXPENSE / 6500 satang;
- invalid/ambiguous strings → `NO_MATCH`;
- invalid money values do not guess or silently round unsafe input.

### Path Kernel tests

- normalized EXPENSE selects Direct Path;
- Direct Path selects expense capability;
- Direct Path does not invoke Gem;
- missing route/capability closes safely;
- readback mismatch cannot produce COMPLETE.

### Vertical integration test

Proof target:

```text
"ข้าว 65"
→ Pattern
→ normalized request / required result
→ Path Kernel
→ DIRECT PATH
→ expense capability
→ existing Runtime
→ LEDGER durable effect
→ Readback
→ COMPLETE
```

The test must use isolated/test state and must not write production data.

## 15. Non-regression gates

Before any acceptance claim:

- all new LIGHT HOUSE tests pass;
- existing Greenfield test suite remains green;
- syntax / UTF-8 gates remain green;
- current data domains remain only `STORE`, `LEDGER`, `CALENDAR`, `RIDE`;
- no direct Vault write path is introduced;
- no AI/Gem execution authority is introduced;
- no production deployment or current-pointer promotion occurs.

## 16. Foundation stop condition

Stop adding scope when the first vertical slice proves:

```text
"ข้าว 65"
→ deterministic Pattern normalization
→ Path Kernel
→ Direct expense capability
→ existing Runtime
→ durable LEDGER readback
→ COMPLETE
```

At that point, observe Reality and decide whether the next smallest step is Gem Registry/Primary Gem, dual AI input, another Direct Path capability, or a peer Manual surface.

Do not pre-build all of them simply because the architecture can support them.

## 17. Success criterion

The foundation is accepted only if the core contract survives different future Fits without changing its authority or closure model:

```text
same Required Result discipline
+ Product Path ↔ Execution Path alignment
+ smallest correct Path
+ explicit authority
+ local failure isolation
+ Reality / Readback
+ exact Closure
```

The first proof is deliberately small. Its purpose is to demonstrate that PATH is real executable architecture rather than a diagram, while preserving the proven lower machinery already present in YGPH.
