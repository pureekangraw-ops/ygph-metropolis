# OpenAI Thin Relay ↔ LIGHTHOUSE Capability Bridge Design

## Goal

Add an OpenAI-powered GO bridge to LIGHTHOUSE without moving business Truth, mutation authority, or durable state out of the existing application.

The bridge must let GO understand requests, read fresh application data, and request approved application capabilities while LIGHTHOUSE remains the only authority that may validate, confirm, commit, and read back Truth-changing actions.

## Chosen Architecture

Use a **thin relay/backend** between LIGHTHOUSE and the OpenAI API.

Canonical path:

`User → LIGHTHOUSE → Thin Relay → OpenAI API → requested capability → LIGHTHOUSE → existing Runtime/Owner authority → commit → durable readback → Relay → OpenAI/GO → User`

The relay is transport and secret custody only. It is not a business engine, source of Truth, mutation authority, or duplicate application backend.

## Governing Model

`LIGHTHOUSE = Truth + application authority`

`Thin Relay = API secret holder + transport boundary`

`OpenAI / GO = understanding + reasoning + capability request`

`Existing Runtime / Owner = validation + commit + durable readback`

`User = final authority for critical mutations`

The core law is:

> GO may request a capability, but only LIGHTHOUSE may decide whether that capability is valid, confirmed when required, committed, and proven by readback.

## Scope

This design covers the first production-shaped OpenAI bridge for:

- reading current application records and state;
- searching or resolving records through stable references;
- reasoning over fresh data returned by LIGHTHOUSE;
- requesting application capabilities such as create, edit, complete, reschedule, cancel, or other already-owned actions;
- requiring explicit user confirmation for critical mutations;
- committing through the existing Runtime/Owner path;
- returning durable readback to GO before claiming success;
- failing safely when Relay, OpenAI, network, validation, confirmation, commit, or readback fails.

This design does not authorize a new finance engine, calendar engine, persistence layer, duplicate Truth store, or server-side business authority.

## Existing Foundation To Preserve

The current application already establishes the principle that stable identity may cross boundaries while business Truth must be resolved fresh.

The existing record reference remains the preferred identity shape:

```js
{
  version: 1,
  owner: 'LEDGER' | 'CALENDAR',
  recordId: 'non-empty durable record identifier'
}
```

The OpenAI bridge must preserve this boundary:

- references may cross;
- authoritative business snapshots do not become bridge Truth;
- a capability that targets a record must resolve fresh application Truth before validation or mutation;
- unsupported, missing, stale, or mismatched references fail closed.

## Components

### 1. LIGHTHOUSE Client Boundary

LIGHTHOUSE owns the application-side bridge adapter.

Its responsibilities are:

- prepare the current user request;
- attach only the minimum relevant context;
- send stable record references when applicable;
- expose only explicitly allowed capabilities;
- execute reads through existing application owners;
- validate requested mutations against current Truth;
- request user confirmation when required;
- execute confirmed mutations through existing Runtime/Owner authority;
- perform durable readback;
- return structured success or failure results to the relay.

It must not give the relay direct storage access or expose raw Vault mutation primitives.

### 2. Thin Relay / Backend

The relay owns:

- OpenAI API key custody;
- authenticated transport between LIGHTHOUSE and OpenAI;
- request/response forwarding;
- server-side OpenAI invocation;
- bounded session metadata required to correlate a request and its tool result;
- capability allowlisting at the transport boundary.

The relay does **not** own:

- business Truth;
- balances, obligations, calendar state, or durable application records as authority;
- mutation validation;
- confirmation decisions;
- final mutation execution;
- duplicate domain logic.

Any relay-side caching must be treated as non-authoritative transport optimization only and must never substitute for fresh application readback when Truth matters.

### 3. OpenAI / GO Reasoning Layer

The OpenAI model receives only the context necessary for the current request.

It may:

- interpret natural language;
- choose an exposed capability;
- request missing read data;
- compare, calculate, summarize, or explain data returned by LIGHTHOUSE;
- produce a structured capability request.

It may not:

- write application storage directly;
- bypass capability validation;
- invent successful writes;
- treat stale conversation context as current application Truth;
- silently convert a suggestion into a mutation.

### 4. Existing Runtime / Owner Authority

All real mutations continue through the existing application-owned path.

Conceptually:

`Bridge adapter → existing capability/facade → Runtime / Owner → durable commit → readback`

The bridge must not create a parallel command engine.

## Capability Contract

The bridge exposes **capabilities**, not storage operations.

A capability request should be structured around:

```text
capability
subject/reference
parameters
reason/context needed for user-facing explanation
request identity
```

The exact schema may vary by capability, but every mutation-capable request must identify the intended action and target unambiguously.

Initial capability families may include:

- read current record;
- search records;
- read current application status or recent changes;
- create a supported record;
- edit supported fields;
- complete or settle a supported item;
- reschedule a supported calendar item;
- cancel or reverse where the existing application already supports that operation.

Only capabilities already backed by an application owner may be exposed. `BUILDABLE != SHOULD BE BUILT`: this bridge does not create missing business capabilities simply because the model can request them.

## Confirmation Boundary

The model may propose any allowed capability, but critical mutations require explicit user confirmation before commit.

Critical mutations include, at minimum:

- money-affecting changes;
- destructive delete/cancel/reverse operations;
- lifecycle changes that have real-world effect or are hard to undo;
- changes where current Truth has changed since the model formed its request.

The application, not the model, determines whether confirmation is required.

Confirmation must bind to the exact intended action, target/reference, relevant parameters, and current version/state needed to prevent stale approval.

If the underlying record changes before confirmation completes, LIGHTHOUSE must invalidate the pending confirmation and resolve fresh Truth before allowing another attempt.

## Data Flow

### Read / Analysis Flow

1. User enters a request in LIGHTHOUSE or the connected Chat surface.
2. LIGHTHOUSE prepares the minimum required request context.
3. LIGHTHOUSE sends the request to the relay.
4. Relay calls OpenAI.
5. OpenAI requests a read capability when application Truth is needed.
6. LIGHTHOUSE resolves the target from current application Truth.
7. LIGHTHOUSE returns a structured fresh read result, including freshness/version metadata when available.
8. OpenAI performs analysis, calculation, comparison, or explanation using that fresh result.
9. GO returns the result to the user.

### Mutation Flow

1. User request reaches OpenAI through LIGHTHOUSE and the relay.
2. OpenAI emits a structured request for an allowed capability.
3. LIGHTHOUSE resolves fresh current Truth for the target.
4. LIGHTHOUSE validates the requested capability and parameters using existing application rules.
5. If confirmation is required, LIGHTHOUSE presents the exact pending action to the user.
6. User approves or rejects.
7. On approval, LIGHTHOUSE rechecks the confirmation binding and current Truth.
8. LIGHTHOUSE executes the mutation through the existing Runtime/Owner path.
9. Durable commit completes.
10. LIGHTHOUSE performs durable readback from the authoritative application path.
11. The readback result returns through Relay to OpenAI/GO.
12. GO may claim success only from that proven readback result.

## Context and Cost Discipline

The bridge must not send the entire conversation or application history on every request.

Prefer:

`current request + relevant reference + fresh necessary data + short recent context`

When the model needs additional data, it should request it through a capability rather than receiving an oversized speculative snapshot up front.

Stable references should be preferred over copied business snapshots.

This keeps token usage, latency, privacy exposure, and stale-context risk bounded.

## Authentication and Secret Boundary

The OpenAI API key must exist only in the server-side relay environment.

Forbidden:

- embedding the OpenAI API key in the APK;
- storing it in client-side JavaScript shipped with the app;
- putting it in application Vault/business storage;
- sending it in model-visible context;
- exposing it through logs or client diagnostics.

The bridge must separate:

- authentication of LIGHTHOUSE/device/session to Relay;
- Relay authorization to call OpenAI;
- application capability authorization inside LIGHTHOUSE.

Transport authentication never grants business authority by itself.

## Failure Handling

### Relay or OpenAI unavailable

- No Truth-changing action may be assumed or synthesized.
- LIGHTHOUSE remains usable for its existing non-AI flows.
- The user receives a recoverable availability error.

### Network timeout or ambiguous tool result

- Treat the requested mutation as **not proven successful**.
- Do not retry a non-idempotent mutation blindly.
- Resolve current Truth/readback before deciding whether a retry is safe.

### Invalid or unsupported capability

- Reject before execution.
- Do not translate it into a nearby action.
- Return a structured capability error to OpenAI/GO.

### Invalid, missing, stale, or mismatched reference

- Fail closed.
- Do not search another owner or guess a replacement target.
- Require a fresh search/resolve flow.

### Confirmation rejected or expired

- Perform no mutation.
- Expired confirmation must not be reusable.

### Truth changes while confirmation is pending

- Invalidate the old confirmation.
- Re-resolve Truth and require a new confirmation when still applicable.

### Commit succeeds but readback fails

- Do not claim success to the user.
- Report that outcome is unverified and perform a safe readback/reconciliation path before another mutation attempt.

## Security and Logging

Logs must be useful for traceability without becoming a secondary Truth store.

Recommended trace fields:

- request/correlation id;
- capability name;
- target reference id where safe;
- validation result;
- confirmation required/approved/rejected status;
- commit attempt outcome;
- readback outcome;
- failure class;
- timestamps.

Do not log API secrets or unnecessary sensitive business payloads.

## Testing Gates

The first implementation is not accepted until all of the following are proven.

### Gate 1 — Read Accuracy

- OpenAI can request a supported record/read capability.
- LIGHTHOUSE resolves the exact current record.
- stale or wrong-owner references fail closed.
- model output is grounded in returned fresh data.

### Gate 2 — Capability Selection and Validation

- supported capability requests reach the correct application-owned path;
- unsupported capabilities are rejected;
- malformed or ambiguous requests do not mutate Truth;
- model suggestions cannot bypass validation.

### Gate 3 — Confirmation Enforcement

- critical mutations cannot commit without explicit user confirmation;
- rejected, expired, stale, or mismatched confirmations cannot be reused;
- non-critical capability behavior matches the application-defined policy.

### Gate 4 — Commit and Readback Integrity

- confirmed mutation uses existing Runtime/Owner authority;
- durable commit is followed by authoritative readback;
- GO claims success only when readback proves the resulting Truth;
- ambiguous timeout or failed readback never produces fake success.

### Gate 5 — Isolation and Failure Survival

- removing Relay/OpenAI availability does not break existing LIGHTHOUSE manual operation;
- API key is absent from APK/client bundle and user-visible logs;
- relay cannot directly mutate Vault/storage;
- no duplicate business store or parallel domain engine exists.

## Initial Acceptance Scenario

A representative end-to-end scenario should prove both read and write authority separation:

1. User asks GO about a specific current Ledger or Calendar record.
2. GO requests a fresh read by stable reference.
3. LIGHTHOUSE returns current authoritative data.
4. GO explains or analyzes it.
5. User requests a supported change.
6. GO requests the matching capability.
7. LIGHTHOUSE validates it.
8. If critical, LIGHTHOUSE asks the user for confirmation.
9. User confirms.
10. Existing Runtime/Owner commits the change.
11. LIGHTHOUSE reads the same record back from Truth.
12. GO reports the proven new state.

## Explicit Non-Scope

- OpenAI key inside the Android application.
- OpenAI or Relay as a durable business Truth store.
- Relay-side finance/calendar/domain engines.
- direct model access to Vault or storage primitives.
- automatic execution of critical mutations without user confirmation.
- recreating existing application capabilities in AI code.
- sending complete long-term chat/application history by default.
- replacing existing Chat/Manual/Settings product surfaces.
- changing top-level navigation solely for the bridge.
- Map/GPS work or unrelated native capability expansion.
- production publication/deployment as part of the design/spec phase.

## Implementation Sequencing Constraint

Implementation must preserve the following order:

1. define/verify the application capability boundary;
2. establish relay secret/auth transport;
3. connect OpenAI tool/capability requests;
4. prove read flow;
5. prove confirmation-bound mutation flow;
6. prove durable readback and failure semantics;
7. run full existing regression gates;
8. perform device-level verification where the Android boundary is involved.

No later stage may compensate for a failed earlier authority boundary.

## Stop Condition

This bridge is complete only when GO can read fresh application Truth and request allowed capabilities while:

- LIGHTHOUSE remains the sole business Truth/authority boundary;
- Relay remains transport/secret custody only;
- OpenAI cannot bypass validation or confirmation;
- critical mutations require user approval;
- every claimed successful mutation is backed by authoritative readback;
- existing application operation survives Relay/OpenAI failure;
- no API secret, duplicate Truth store, or parallel business engine is introduced.

When these conditions are proven, implementation stops. Further capability expansion is a separate owner-authorized phase.
