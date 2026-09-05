# LIGHTHOUSE Ledger Gateway Design

## Status

Design approved in chat by Owner (BIG) on 2026-09-05. This document defines the architecture change before implementation.

## Goal

Make **Ledger the single command gateway for MANUAL-domain work** without introducing a separate Leader service.

The target flow is:

```text
CHAT ------\
            -> Ledger Gateway -> Store / Ride / Outcome / Calendar -> Runtime -> Ledger readback -> CHAT / MANUAL
MANUAL ----/
```

The Ledger Gateway is the intake/router/authority/readback boundary for MANUAL work. It is not a new visible app and does not replace the underlying Store, Ride, Outcome, Calendar, or Ledger domain owners.

## Scope

In scope:

- Route CHAT mutations for MANUAL work through Ledger Gateway.
- Route MANUAL mutations through the same Ledger Gateway.
- Keep Store / Ride / Outcome / Calendar as domain owners for their own records and workflows.
- Keep Ledger as the record authority for posted financial truth, including amendment/reversal/cancellation behavior already owned by Ledger.
- Return verified readback to CHAT and MANUAL after mutations.
- Add contract tests that prove the common gateway path.
- Use an interactive preview/prototype only as a behavior-checking aid; production truth remains repository tests and runtime readback.

Out of scope:

- Module install/remove routing. Module lifecycle stays with Module Control Plane.
- Updater, backup, session, recovery, Android shell, signer, package identity, release manifest, or Device Gate changes.
- Creating a separate Leader service.
- Replacing the command runtime or changing domain ownership semantics.
- Pulling roadmap features into this change.

## Existing Architecture Findings

The stable composition currently creates `manual`, module control, bundled module services, and then `chat`. CHAT `DIRECT_COMMAND` currently calls `modules.execute(...)` directly. MANUAL mutations already execute through runtime multi-group commands and verify durable readback. Store and Ride workflows already create their domain records together with Ledger transactions when required.

This means the system already has most of the required domain/workflow behavior. The missing piece is one shared gateway that CHAT and MANUAL both use for MANUAL-domain command intake and verified readback.

## Proposed Component

Add a focused service:

```text
android-shell/app/public/logic/ledger/ledger-gateway.mjs
```

Responsibilities:

1. **Intake**
   - Accept normalized MANUAL-domain operations from CHAT or MANUAL-facing services.
   - Reject unsupported operation categories.

2. **Route**
   - Dispatch to the existing domain/manual capability that already owns the workflow.
   - Do not reimplement Store, Ride, Outcome, or Calendar business logic.

3. **Authority**
   - For posted financial records, keep Ledger as the authority for edit/reverse/refund/cancel behavior.
   - Do not add direct historical mutation APIs to Store/Ride/Outcome surfaces.

4. **Readback**
   - Require verified mutation status.
   - Return durable readback/snapshot after mutation.
   - CHAT and MANUAL consume the same verified result shape.

Suggested public shape (names may be adjusted during implementation if tests reveal a better fit):

```js
createLedgerGateway({ manual, runtime, modules? })

ledgerGateway.execute({
  requestId,
  operation,
  payload,
})

ledgerGateway.query({ operation, payload })
```

The implementation should be a thin coordinator over existing services, not a second business-logic engine.

## Service Composition Change

Current high-level path:

```text
createStableAppServices
  -> manual
  -> module control
  -> bundled apps
  -> modules
  -> chat
```

Target high-level path:

```text
createStableAppServices
  -> manual
  -> module control
  -> bundled apps
  -> modules
  -> ledgerGateway(manual/runtime)
  -> chat(ledgerGateway for MANUAL-domain mutations; existing handlers remain for non-MANUAL routes)
```

`modules.execute` remains for Module Control Plane actions. Ledger Gateway must not absorb install/remove/enable/disable module lifecycle.

## CHAT Contract

CHAT keeps its current conversation/request persistence behavior, but MANUAL-domain mutation dispatch changes from direct module execution to Ledger Gateway.

Target behavior:

```text
User intent
 -> CHAT request state
 -> confirmation when required
 -> Ledger Gateway
 -> existing owner workflow
 -> runtime commit
 -> durable readback
 -> CHAT SUCCESS response
```

Non-MANUAL routes (`LOCAL_QUERY`, recovery, provider, etc.) remain unchanged unless a test proves a shared Ledger query should be used.

## MANUAL Contract

MANUAL UI-facing capabilities should call through Ledger Gateway for mutations so CHAT and MANUAL no longer have different mutation paths.

Examples:

- Store sale/receipt workflow: Store owner remains Store; resulting money truth is recorded in Ledger; gateway returns readback.
- Ride job/expense/withdrawal: Ride owner remains Ride; cash movement is recorded in Ledger; gateway returns readback.
- Expense/other income: Ledger-owned transaction workflows remain Ledger-owned.
- Calendar: Calendar remains the single calendar owner; gateway only routes the operation and returns readback.

## Ledger App vs Ledger Core

No change to the product rule:

- `Ledger Core` / Ledger domain authority remains available to the system.
- User-facing Ledger App can be removed from MANUAL through Module Control Plane.
- Removing Ledger App must not remove Ledger Core or existing records.

This design does not move module lifecycle into Ledger Gateway.

## Error Handling

The gateway must preserve existing safety semantics:

- Reject unknown operation.
- Reject unverified mutation status.
- Reject stale revision according to runtime behavior.
- Require mutation readback before reporting success.
- Preserve idempotency behavior from the existing runtime/workflow layer.
- Do not translate VERIFY/STALE/ERROR into success.

CHAT should record the request as ERROR when the gateway throws, preserving current retry semantics.

## Testing Strategy

Use TDD. Add RED tests before production code.

Minimum contract tests:

1. `CHAT -> Ledger Gateway -> Store workflow -> Ledger readback` for a store-income scenario.
2. `CHAT -> Ledger Gateway -> Ride workflow -> Ledger readback` for a ride-income scenario.
3. MANUAL mutation uses the same gateway path as CHAT.
4. Expense route records Ledger OUT transaction and returns verified readback.
5. Calendar operation stays owned by Calendar and returns readback through gateway.
6. Ledger edit/reverse/cancel authority is not exposed directly on Store/Ride/Outcome service surfaces.
7. Module lifecycle still goes through Module Control Plane, not Ledger Gateway.
8. Unknown/unverified gateway result fails closed.
9. Existing stable-service and packaging tests remain green.

## Interactive Preview as Understanding Gate

Before broad UI work, use a small interactive preview to exercise the same acceptance flow with fake data:

```text
PIN -> MANUAL -> CHAT
CHAT: add store income
 -> confirm
 -> Ledger Gateway conceptual path
 -> Store + Ledger state update
 -> readback visible in CHAT and MANUAL
```

Then test Ride, Outcome, Calendar, and Ledger amendment/cancel behavior.

The preview is a design/understanding aid only. It does not prove persistence, Android behavior, package identity, signer, or Device Gate acceptance.

## Files Expected to Change

Likely production files:

- `android-shell/app/public/logic/ledger/ledger-gateway.mjs` (new)
- `android-shell/app/public/app/stable-service-composition.mjs`
- `android-shell/app/public/logic/chat/chat-service.mjs`
- MANUAL/bundled service wiring only where required to route mutations through the gateway
- focused tests under `android-shell/test/`

Files explicitly not targeted:

- updater/release files
- Android native packaging/bootstrap files
- module-control-plane behavior except test assertions that it remains separate

## Acceptance Criteria

The architecture change is accepted at source/test level when:

- CHAT and MANUAL MANUAL-domain mutations enter through the same Ledger Gateway.
- Store/Ride/Outcome/Calendar ownership is preserved.
- Ledger remains posted-record authority.
- Module lifecycle remains outside Ledger Gateway.
- All mutation success paths require durable readback.
- Focused tests and existing affected tests pass.
- No release manifest is opened and no Device Gate claim is made from source tests alone.

Physical-device acceptance remains a later gate if/when a new APK candidate is built.
