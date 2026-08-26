# METRO Backend Root Design

## Status

Owner-approved architecture direction for the backend root that will support METRO's Master Input, AI interpretation, future file/voice/report capabilities, and later GO integration without moving truth ownership away from the local METRO Runtime and Vault.

This document defines the root and boundaries only. It does not authorize AI writes to business state.

## Purpose

METRO has already gone through several large structural rebuilds. This root must therefore optimize for long-term continuity rather than the shortest path to the first AI demo.

The design goal is:

> Build a stable root with flexible branches: future capabilities should attach, move, split, or change provider without forcing METRO to replace its source-of-truth model, public API shape, or local Runtime/Vault ownership.

## Current Truth

- The production app is deployed through Cloudflare using `wrangler.jsonc` with static assets only.
- The current browser application opens and invokes the METRO Runtime locally.
- The encrypted application state remains on the user's device in IndexedDB.
- Runtime methods are the authoritative mutation boundary.
- The UI performs runtime action -> readback -> render.
- The repository's deploy pipeline already runs tests, syntax validation, UTF-8 validation, then deploys with Wrangler.
- Current CSP blocks network connections with `connect-src 'none'`.

The backend root must preserve these properties unless a later, explicit architecture decision changes them.

## Root Principles

### 1. Truth stays local

The METRO Runtime and local Vault remain the source of truth. Cloudflare and OpenAI do not become owners of store, ride, ledger, calendar, security, or recovery truth.

### 2. AI proposes; Runtime decides

AI may transform natural language into a structured proposal. AI must never write directly to IndexedDB, the encrypted Vault, or domain records.

The authoritative flow is:

`human language -> interpretation -> validated intent -> local action contract -> Runtime -> readback -> UI`

### 3. Stable boundaries, replaceable internals

We lock stable contracts and ownership boundaries, not implementation vendors.

OpenAI is the first interpreter provider, but the public METRO API must not force callers to depend on OpenAI-specific request/response shapes.

### 4. One public spine

The browser talks to backend capabilities only through versioned same-origin routes under:

`/api/v1/*`

New capabilities attach under the spine. Internal services may later split out, but the browser-facing route remains stable whenever compatibility permits.

### 5. Capability does not imply authority

Adding a model, file tool, voice tool, web search, or external service does not automatically grant it access to more METRO state or more mutation authority.

Every new capability must receive only the minimum data and authority required for its purpose.

### 6. No secret crosses into the client

`OPENAI_API_KEY` and future provider credentials exist only as Cloudflare server-side secrets. They must never be committed to GitHub, emitted to logs, returned by an endpoint, stored in client state, or bundled into static assets.

### 7. Expand by branches, not shortcuts

Future features must use the same contracts and ownership boundaries. They must not bypass the Gateway to reach local truth or create ad-hoc direct writes.

## Target Architecture

```text
METRO UI / Master Input
        |
        | same-origin /api/v1/*
        v
METRO Gateway (Cloudflare Worker)
        |
        |-- request guard
        |-- request identity
        |-- method/path allowlist
        |-- payload size limits
        |-- auth / abuse controls
        |-- contract validation
        |-- provider adapter boundary
        |-- normalized errors
        |
        v
Interpreter Provider
(OpenAI first; replaceable later)
        |
        | structured interpretation only
        v
METRO Browser Client
        |
        | local action-contract validation
        v
METRO Runtime
        |
        v
Encrypted local Vault / IndexedDB
        |
        v
readState() / projections / dashboard
```

There is no server-side path from the Interpreter Provider or Gateway to the local Vault.

## Cloudflare Deployment Shape

The existing `ygph-metropolis` deployment becomes a Worker with static assets and a Worker entrypoint.

Static files remain static assets. API requests are routed through the Worker only for `/api/*`.

The initial deployment should avoid splitting the Interpreter into a second Worker. The first goal is a clean internal boundary, not microservice count.

The interpreter code must nevertheless be isolated behind an adapter/interface so it can later move to a private Worker connected by a Service Binding without requiring the browser to change `/api/v1/interpret`.

## Public API Contract

### Versioning

All public backend endpoints begin under `/api/v1/`.

Breaking contract changes require a new version path. Compatible additions may remain in v1.

### Foundation endpoints

Initial root endpoints:

- `GET /api/v1/health`
- `POST /api/v1/interpret`

`/api/v1/health` proves that the Worker, route, deployment, and environment are alive. It must not disclose secrets, model credentials, internal configuration values, or local METRO data.

`/api/v1/interpret` initially operates in zero-mutation mode.

### Interpretation request

Minimum browser request shape:

```json
{
  "version": "1",
  "text": "ข้าว 65",
  "context": {}
}
```

`context` is optional and constrained. It must not become a channel for uploading the entire Vault or unrestricted application state.

### Interpretation response

Normalized response shape:

```json
{
  "version": "1",
  "requestId": "req_...",
  "status": "READY",
  "intent": "EXPENSE",
  "fields": {
    "amountSatang": 6500,
    "title": "ข้าว"
  },
  "missingFields": [],
  "needsConfirmation": false
}
```

Allowed top-level statuses for v1:

- `READY`
- `NEEDS_CLARIFICATION`
- `UNSUPPORTED`
- `ERROR`

Provider-specific response data must not leak into the browser-facing contract unless explicitly adopted as part of the METRO contract.

## Request Identity and Retry Safety

Every API request receives a server-generated `requestId`.

When a later phase allows an interpreted action to reach Runtime, the client must generate or preserve a workflow/action identity so network retry, double tap, reconnect, or repeated interpretation cannot silently produce duplicate business mutations.

The root phase does not implement write idempotency yet, but the contract must reserve the identity path so it can be added without breaking callers.

## Gateway Responsibilities

The Gateway owns only transport and protection concerns:

- route selection
- HTTP method allowlist
- content-type enforcement
- body-size limit
- request identity
- authentication boundary
- abuse/rate controls
- schema validation
- provider dispatch through an adapter
- timeout handling
- normalized error responses
- minimal operational logging

The Gateway does not own:

- store truth
- ride truth
- ledger truth
- calendar truth
- local device security truth
- direct business mutation
- arbitrary persistence of user prompts

## Interpreter Adapter Boundary

The provider-specific implementation sits behind a small internal interface conceptually equivalent to:

```js
interpret({ text, context, requestId }) -> normalizedInterpretation
```

The adapter is responsible for:

- building provider instructions
- invoking the provider
- requesting structured output
- translating provider errors
- validating provider output before returning it to the Gateway

The Gateway must not depend on model-specific response objects.

## Security Baseline

### Secrets

- `OPENAI_API_KEY` is a Cloudflare Secret.
- No `.env`, plaintext secret file, generated config, log statement, test fixture, or client bundle may contain the real key.
- The first Worker deployment may occur before the secret is marked required so the user can create the server surface and then enter the secret manually.
- After the secret is installed and verified, future deployment policy should fail closed if required production secrets are absent.

### Browser network policy

CSP changes from `connect-src 'none'` to `connect-src 'self'` only.

This opens the same-origin API spine without allowing arbitrary external browser connections.

No broad wildcard is introduced.

### API exposure

Before real OpenAI calls are enabled in production, `/api/v1/interpret` must have an abuse-control boundary appropriate to the personal app deployment.

The implementation plan must choose a mechanism that can be operated on the current Cloudflare tier without forcing a paid upgrade solely for MVP security.

The protection objective is to stop an unknown external caller from freely consuming the user's OpenAI credit.

### Request limits

The root must enforce a small explicit request body limit suitable for short command interpretation.

Oversized bodies fail before provider invocation.

Only JSON is accepted for interpretation.

### Logging

Operational logs may contain:

- request ID
- route
- result class/status
- latency
- provider call success/failure class
- coarse usage metadata when needed for cost monitoring

Operational logs must not intentionally contain:

- `OPENAI_API_KEY`
- raw authorization credentials
- encrypted Vault material
- device passphrases/PINs
- full backup content
- unrestricted local state snapshots

Raw prompt logging is off by default at the Gateway layer.

### Failure behavior

Security and contract failures are fail-closed.

Provider failure returns a normalized error and does not trigger local mutation.

A malformed structured output is treated as invalid, not guessed into a valid action.

## Staging and Production

The architecture must support separate staging and production environments before AI-backed write functionality is enabled.

Minimum separation goals:

- independent Worker environment/configuration
- independent secrets
- test/staging calls cannot silently consume production credentials if avoidable
- production route remains stable

The first root implementation may introduce environment structure incrementally, but must not lock the repository into a single unseparable environment model.

## Local Runtime Integration Boundary

Interpreter output is never invoked as a Runtime method name directly.

A future client-side action mapper must explicitly map allowed intents to allowed Runtime operations.

Conceptual flow:

```text
interpretation
   -> local schema validation
   -> explicit intent mapping
   -> required-field validation
   -> ambiguity / confirmation gate
   -> allowlisted Runtime method
   -> readState()
   -> render
```

Unknown intent, unsupported intent, missing required field, or ambiguous relation must stop before Runtime mutation.

## Data Minimization for Future Reports

Future report/question features must not send the entire local Vault to AI by default.

METRO first creates a purpose-specific projection, for example:

- current cash
- today's real income/outflow
- near-due obligations
- selected stock summary
- selected ride summary

Only the projection needed for the requested result is sent to the backend/provider.

This keeps AI capability growth separate from authority growth.

## Future Branches

The root must accommodate these without changing truth ownership:

- richer natural-language interpreter
- clarification engine
- cross-domain action proposal
- file classification/import routing
- report synthesis
- voice/realtime input
- external provider replacement or multi-provider routing
- GO Bridge / external tool integration
- private Worker extraction through Cloudflare Service Binding

A future branch may be split into another Worker when there is an operational reason such as independent deployment, security isolation, scaling, or ownership—not merely because multiple Workers are possible.

## Migration Strategy

The migration proceeds in controlled layers.

### Root 0 — Worker spine

- Add Worker entrypoint while retaining static assets.
- Route only `/api/*` through Worker logic.
- Add `GET /api/v1/health`.
- Add normalized JSON response/error helpers.
- Add request identity.
- Add method/content-type/body-size guards.
- Update CSP to allow only same-origin connections.
- Extend syntax/tests/deploy gate for Worker code.
- No OpenAI call.
- No business mutation.

### Root 1 — Secret and security rail

- Deploy root Worker.
- User enters `OPENAI_API_KEY` manually in Cloudflare Secret storage.
- Establish production abuse-control/auth boundary.
- Establish staging/production secret separation.
- Verify the secret cannot be read through the client or health endpoint.

### Root 2 — Interpreter contract

- Add normalized interpretation schema and validator.
- Add provider adapter interface.
- Build contract tests from real Thai command patterns.
- Keep provider disabled/mocked until contract tests are stable.

### Root 3 — OpenAI zero-mutation interpreter

- Connect OpenAI through server-side secret.
- Validate all provider output.
- Return interpretation preview only.
- No Runtime method is called from the backend.
- Run a representative Thai phrase suite and record failure classes.

### Root 4 — Local safe-action bridge

- Add explicit client-side intent-to-Runtime mapping.
- Enable only simple, deterministic, allowlisted actions.
- Enforce required fields and confirmation gates.
- Runtime performs mutation locally.
- UI performs readback after mutation.
- Add idempotency/workflow identity protections before enabling broad writes.

## Non-Goals of the Root Work

This design does not include:

- moving the Vault to Cloudflare
- server-side METRO business state
- direct AI writes
- replacing current domain workflows
- building voice UI
- building file upload/import UI
- building GO integration
- building advanced reports
- supporting every future intent
- introducing a database merely because a backend now exists
- splitting into multiple Workers before a concrete need exists

## Verification Criteria

The root is considered successful only when all applicable checks are proven:

1. Existing static application still loads and functions after Worker adoption.
2. Existing Greenfield test/syntax/UTF-8 deploy gates still pass.
3. `/api/v1/health` responds successfully without leaking environment secrets.
4. Non-API static asset requests do not become business API calls.
5. Invalid API methods/content types/oversized requests fail before provider invocation.
6. Browser CSP permits same-origin API calls but does not broadly allow arbitrary external connections.
7. `OPENAI_API_KEY` is absent from repository content and static client output.
8. Interpreter preview cannot mutate local business state.
9. Provider output that violates the METRO contract is rejected rather than guessed.
10. The browser-facing route remains `/api/v1/interpret` even if interpreter implementation is later extracted behind a Service Binding.

## Architecture Decision Summary

The permanent root is not "OpenAI in METRO".

The permanent root is:

> Versioned same-origin Gateway + stable contract + server-side secret isolation + AI-as-proposal + local Runtime authority + local Vault truth.

OpenAI is the first branch attached to that root.

This gives METRO a base that is stable where ownership and contracts must be stable, and flexible where providers, services, models, and user interfaces should be replaceable.