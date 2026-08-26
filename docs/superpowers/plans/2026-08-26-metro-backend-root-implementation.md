# METRO Backend Root Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the current static-only Cloudflare deployment into a stable same-origin Worker spine that is safe to receive server-side secrets and future interpreter logic without moving METRO truth away from the local Runtime/Vault.

**Architecture:** Keep static assets on the existing Worker Static Assets deployment, add one Worker entrypoint that runs first only for `/api/*`, and expose a versioned `/api/v1/*` gateway. Root 0 contains no OpenAI call and no business mutation; it only establishes transport, guards, request identity, normalized responses, CSP, and deployment/test plumbing.

**Tech Stack:** Cloudflare Workers Static Assets, Wrangler 4.68.0, JavaScript ES modules, Node.js 22 `node:test`.

**Spec:** `docs/superpowers/specs/2026-08-26-metro-backend-root-design.md`

## Global Constraints

- METRO Runtime and encrypted local Vault remain the source of truth.
- AI/provider code has no direct path to IndexedDB or business mutation.
- Browser-facing backend routes are versioned under `/api/v1/*`.
- `OPENAI_API_KEY` is never committed, logged, returned, or bundled into static assets.
- Root 0 performs zero OpenAI calls and zero business mutations.
- Static asset behavior must remain intact.
- Browser CSP opens only same-origin connections: `connect-src 'self'`.
- No new runtime dependency is required for Root 0.
- Production deployment remains gated by the existing `npm run deploy:gate` workflow.

---

### Task 1: Prove and configure the Worker spine

**Files:**
- Create: `tests/greenfield-backend-root.test.cjs`
- Create: `worker/index.mjs`
- Modify: `wrangler.jsonc`
- Modify: `package.json`
- Modify: `_headers`

**Interfaces:**
- Consumes: existing Wrangler static-assets deployment and current deploy gate.
- Produces: Worker entrypoint `worker/index.mjs`, `ASSETS` binding, selective Worker-first routing for `/api/*`, same-origin browser connection policy.

- [ ] **Step 1: Write the failing configuration test**

Add tests that read repository files and assert:

```js
const config = JSON.parse(fs.readFileSync('wrangler.jsonc', 'utf8'));
assert.equal(config.main, 'worker/index.mjs');
assert.equal(config.assets.binding, 'ASSETS');
assert.deepEqual(config.assets.run_worker_first, ['/api/*']);
assert.match(fs.readFileSync('_headers', 'utf8'), /connect-src 'self'/);
assert.doesNotMatch(fs.readFileSync('_headers', 'utf8'), /connect-src 'none'/);
assert.ok(fs.existsSync('worker/index.mjs'));
assert.match(JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts['check:syntax'], /worker\/index\.mjs/);
```

- [ ] **Step 2: Run the PR safety gate and verify RED**

Expected: `Greenfield safety gate` fails because `wrangler.jsonc` has no Worker `main`/binding/routing and the Worker entrypoint does not exist.

- [ ] **Step 3: Add the minimal Worker scaffold and configuration**

Use this deployment shape:

```json
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "ygph-metropolis",
  "compatibility_date": "2026-08-02",
  "main": "worker/index.mjs",
  "assets": {
    "directory": ".",
    "binding": "ASSETS",
    "run_worker_first": ["/api/*"]
  }
}
```

Create `worker/index.mjs` as a minimal valid module with a default Worker export; no provider/API behavior beyond a closed placeholder yet.

Append `worker/index.mjs` to `check:syntax`.

Change only the CSP connection directive from:

```text
connect-src 'none'
```

to:

```text
connect-src 'self'
```

Do not broaden any other CSP directive.

- [ ] **Step 4: Verify GREEN**

Expected: configuration test passes and all pre-existing Greenfield tests/syntax/UTF-8 checks remain green.

- [ ] **Step 5: Commit**

Commit message:

```text
test: define METRO Worker spine contract
```

---

### Task 2: Add the versioned Gateway and health endpoint

**Files:**
- Modify: `tests/greenfield-backend-root.test.cjs`
- Create: `worker/http.mjs`
- Modify: `worker/index.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `Request`, `Response`, Worker `fetch(request, env)`.
- Produces: `handleApiRequest(request, env)` and stable `GET /api/v1/health` behavior.

- [ ] **Step 1: Write failing behavior tests**

Tests dynamically import `worker/index.mjs`, invoke `worker.fetch()` with `Request` objects, and prove:

```text
GET /api/v1/health -> 200
content-type -> application/json
cache-control -> no-store
response body -> { version:"1", status:"ok", requestId:"req_..." }
unknown /api/v1/* -> 404 JSON
health body never contains values from env secrets
```

Use an env fixture containing obvious sentinel strings and assert they do not appear in serialized output.

- [ ] **Step 2: Verify RED**

Expected: tests fail because the scaffold has no health/router implementation.

- [ ] **Step 3: Implement minimal Gateway helpers**

`worker/http.mjs` owns focused HTTP helpers:

```js
export function makeRequestId() {
  return `req_${crypto.randomUUID()}`;
}

export function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
```

`worker/index.mjs` routes only the versioned API surface and returns normalized JSON errors. Static requests do not need application routing because `run_worker_first` is limited to `/api/*`.

- [ ] **Step 4: Add Worker modules to syntax gate**

`check:syntax` must include both `worker/index.mjs` and `worker/http.mjs`.

- [ ] **Step 5: Verify GREEN**

Expected: new Gateway tests and full deploy gate pass.

- [ ] **Step 6: Commit**

Commit message:

```text
feat: add METRO versioned gateway health route
```

---

### Task 3: Add fail-closed interpretation guards without OpenAI

**Files:**
- Modify: `tests/greenfield-backend-root.test.cjs`
- Create: `worker/guards.mjs`
- Modify: `worker/index.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `POST /api/v1/interpret`.
- Produces: transport validation and a safe `INTERPRETER_NOT_CONFIGURED` terminal response; no provider invocation.

- [ ] **Step 1: Write failing guard tests**

Cover each behavior independently:

```text
GET /api/v1/interpret -> 405
POST with non-JSON content type -> 415
POST with Content-Length over 8192 bytes -> 413
POST with malformed JSON -> 400
POST with missing/blank text -> 400
POST with version != "1" -> 400
valid request -> 503 with status ERROR and code INTERPRETER_NOT_CONFIGURED
```

Every error response must include a server-generated `requestId` and must not echo the full submitted text.

- [ ] **Step 2: Verify RED**

Expected: tests fail because `/api/v1/interpret` has no guard contract.

- [ ] **Step 3: Implement focused request guards**

`worker/guards.mjs` exports constants and validators, including:

```js
export const MAX_INTERPRET_BODY_BYTES = 8192;
```

Rules:

- accept only `POST`
- require `application/json` media type
- reject declared oversize before reading body
- after reading text, reject actual UTF-8 byte length over 8192
- parse JSON with normalized failure
- require `version === "1"`
- require `text` to be a non-empty string after trimming
- allow `context` only when omitted or a plain JSON object
- never log or return raw credentials
- no OpenAI fetch exists in Root 0

- [ ] **Step 4: Return the deliberate closed stub for valid input**

Valid transport/input returns:

```json
{
  "version": "1",
  "requestId": "req_...",
  "status": "ERROR",
  "code": "INTERPRETER_NOT_CONFIGURED"
}
```

HTTP status: `503`.

This proves the stable route and guards while making it impossible to consume OpenAI credit before the security rail/provider phase is explicitly enabled.

- [ ] **Step 5: Extend syntax gate and verify GREEN**

Add `worker/guards.mjs` to `check:syntax`; full deploy gate must pass.

- [ ] **Step 6: Commit**

Commit message:

```text
feat: fail closed at METRO interpreter boundary
```

---

### Task 4: Verify secret-ready production handoff

**Files:**
- Modify only if verification exposes a defect.
- No secret files are created.

**Interfaces:**
- Consumes: completed Root 0 branch and PR checks.
- Produces: an evidence-backed merge candidate that can be deployed to Cloudflare and then receive `OPENAI_API_KEY` manually.

- [ ] **Step 1: Run full automated gate**

Required:

```text
npm test
npm run check:syntax
npm run check:utf8
```

On GitHub this is represented by the existing `Greenfield safety gate`; it must finish `success` on the final branch head.

- [ ] **Step 2: Inspect the PR diff**

Confirm the diff contains only:

```text
backend-root design/plan docs
worker/* Root 0 modules
tests/greenfield-backend-root.test.cjs
wrangler.jsonc
_headers
package.json
```

No Runtime, Vault, domain workflow, UI business logic, or credentials are modified.

- [ ] **Step 3: Verify deployment semantics**

Confirm Wrangler configuration keeps `assets.directory: "."`, binds `ASSETS`, and runs Worker-first only for `/api/*`. This preserves static-first behavior for the existing app while creating the server surface needed for secrets.

- [ ] **Step 4: Production handoff checkpoint**

Do not merge to `main` without explicit owner consent.

After merge and successful production deploy:

1. Open Cloudflare `ygph-metropolis` Worker settings.
2. Add server-side Secret named exactly `OPENAI_API_KEY`.
3. Paste the API key directly in Cloudflare; never paste it into GitHub or chat.
4. Keep interpreter provider disabled until the later security/auth review is complete.

- [ ] **Step 5: Root 0 completion condition**

Root 0 is complete when:

```text
static app remains deployable
/api/v1/health exists
/api/v1/interpret fails closed behind guards
Cloudflare recognizes a real Worker script
Runtime Variables and Secrets can be configured
no OpenAI credit can be consumed by this code
all automated gates are green
```

At that point the construction room can build the interpreter/provider branch on a stable foundation without changing METRO truth ownership or the public route.