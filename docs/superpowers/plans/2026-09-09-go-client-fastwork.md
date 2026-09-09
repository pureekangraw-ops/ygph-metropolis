# GO Client — Fastwork Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a semi-AI GO Client mode inside the existing YGPH METROPOLIS production web application for sales questions, package selection/pre-estimate intake, checklist-based material collection, and GO manager escalation while reusing the existing interpreter API/runtime provider.

**Architecture:** Keep the existing root `index.html`, Worker, static asset deployment and production app. Add focused GO Client modules under `ui/` and activate the client surface with `?surface=client`. In client mode the owner PIN/workspace is hidden and Greenfield owner Runtime is never opened. Normal sales copy/checklist logic stays deterministic; `/api/v1/interpret` with `context.surface='GO_CLIENT'` is used only when local routing is insufficient. The Worker branches GO Client classification through the same secret, rate limiter and Responses API transport.

**Tech Stack:** Existing HTML/CSS/ES module app, Node 22 test runner, Cloudflare Worker, OpenAI Responses API Structured Outputs.

**Spec:** `docs/superpowers/specs/2026-09-09-go-client-fastwork-design.md`

## Global Constraints

- Same app/repo/deployment: no second Worker, wrangler config, API credential stack, or separately deployed client app.
- Reuse `/api/v1/interpret`, `OPENAI_API_KEY`, existing rate limiter, and current OpenAI provider path.
- Client mode must not expose or open the PIN-protected Greenfield owner Runtime.
- Normal sales answers and checklist transitions are deterministic; AI classifies natural-language intent only when local routing is insufficient.
- Never invent facts, page counts, prices outside published package rules, or client content.
- Client can always request `ขอให้ GO ช่วยดู`; this creates a compact manager packet and uses Whisper → Direct Reply → Takeover escalation.
- Portfolio/example image assets are deferred; the node exists but must not fabricate samples.

---

### Task 1: GO Client flow kernel

**Files:**
- Create: `ui/go-client-flow.mjs`
- Test: `tests/greenfield-go-client.test.cjs`

**Interfaces:**
- Produces: `detectLocalIntent(text)`, `resolveSalesResponse(intent, state)`, `getChecklist(jobType)`, `mapMaterialToChecklist(fileLike, checklist)`, `evaluateChecklist(checklist, checklistState)`, `estimatePackage({pageCount, selectedPackage})`, `buildJobSummary(state)`, `buildManagerPacket(state, reason, source)`.

- [ ] **Step 1: Write failing tests** for package rules, local intent routing, fixed/fallback checklists, filename mapping, `COMPLETE AS PROVIDED`, no invented page count, and compact manager packet.
- [ ] **Step 2: Verify RED in GitHub Actions.**
- [ ] **Step 3: Implement minimal pure flow kernel.**
- [ ] **Step 4: Re-run targeted test via CI and verify GREEN.**
- [ ] **Step 5: Commit.**

### Task 2: Reuse existing interpreter API for GO Client intent classification

**Files:**
- Create: `master-input/go-client-interpreter-provider.mjs`
- Modify: `worker/index.mjs`
- Modify: `package.json`
- Test: `tests/greenfield-go-client.test.cjs`

**Interfaces:**
- `buildGoClientInterpretRequest(text, context)` returns a strict OpenAI Responses API request.
- `interpretGoClientTextWithOpenAI({apiKey,text,context,fetchImpl})` returns `{intent, jobType, package, pageCount, desiredDate, wantsEstimate, wantsManager}`.
- `/api/v1/interpret` branches only when `context.surface === 'GO_CLIENT'`; existing METRO behavior remains unchanged otherwise.

- [ ] **Step 1: Add failing tests** verifying same endpoint/secret/rate limit, strict schema, no echo of private client text, and unchanged legacy interpreter behavior.
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Implement provider and Worker branch; add new modules to `check:syntax`.**
- [ ] **Step 4: Verify targeted tests and full `npm test` through CI.**
- [ ] **Step 5: Commit.**

### Task 3: Client mode inside existing application shell

**Files:**
- Modify: `index.html`
- Create: `ui/go-client.mjs`
- Create: `go-client.css`
- Modify: `app.mjs`
- Modify: `package.json`
- Test: `tests/greenfield-go-client.test.cjs`

**Interfaces:**
- Root `index.html` remains the single app document.
- `app.mjs` imports `./ui/go-client.mjs` without replacing existing owner UI imports.
- `ui/go-client.mjs` activates only when `new URL(location.href).searchParams.get('surface') === 'client'`.
- Client mode hides owner appbar/gate/recovery/workspace and shows `#goClientShell`; owner mode remains unchanged.
- Browser posts `{version:'1', text, context:{surface:'GO_CLIENT', stage, jobType, package}}` to the existing `/api/v1/interpret` endpoint.
- File picker keeps `File` objects and derived metadata in the client session only; no binary file is sent to OpenAI in this slice.

- [ ] **Step 1: Add failing source-contract tests** for one-document same-app client mode, semi-AI opening notice, free-text chat, package controls, file input, help button, same-origin API path, and no client secret/OpenAI URL.
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Add client shell markup/CSS and module import without changing owner runtime behavior.**
- [ ] **Step 4: Implement sales nodes and intake state:** job type → checklist → file metadata mapping → blocking gaps → package/pre-estimate → final summary.
- [ ] **Step 5: Verify GREEN and syntax/UTF-8 gates.**
- [ ] **Step 6: Commit.**

### Task 4: Manager peek / whisper / takeover controls

**Files:**
- Modify: `ui/go-client-flow.mjs`
- Modify: `ui/go-client.mjs`
- Test: `tests/greenfield-go-client.test.cjs`

**Interfaces:**
- Client help button creates a manager packet with `source='CLIENT'` and optional reason.
- Disposition enum: `WHISPER | DIRECT_REPLY | TAKEOVER`.
- Minimum packet contains only source, reason, current stage, last client message, job type, package, estimate, compact checklist status and short recent context.

- [ ] **Step 1: Add failing tests** for compact packet and help-button behavior.
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Implement manager packet and escalation state.**
- [ ] **Step 4: Verify GREEN.**
- [ ] **Step 5: Commit.**

### Task 5: Repository gate and PR

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run/observe `npm run deploy:gate` via GitHub Actions.**
- [ ] **Step 2: Verify owner app source contracts still pass and client mode does not open Greenfield Runtime.**
- [ ] **Step 3: Verify Wrangler still has one asset directory and `/api/*` Worker-first routing.**
- [ ] **Step 4: Keep PR #119 Draft until all gates pass.**
- [ ] **Step 5: Report implemented scope and deliberate deferred items (portfolio image assets, binary document ingestion, persistent LINE OA configuration if no URL is configured in repo).**
