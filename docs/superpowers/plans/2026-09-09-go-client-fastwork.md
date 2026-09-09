# GO Client — Fastwork Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public semi-AI GO Client surface that handles sales questions, package selection/pre-estimate intake, checklist-based material collection, and GO manager escalation while reusing the existing interpreter API/runtime provider.

**Architecture:** Add a self-contained `go-client/` static surface so public clients never enter the PIN-protected LIGHTHOUSE owner UI. Keep normal response copy and checklist logic deterministic in the browser; use `/api/v1/interpret` with `context.surface='GO_CLIENT'` only when local routing is insufficient. Extend the Worker to branch GO Client requests to a separate strict Structured Output classifier that uses the existing `OPENAI_API_KEY`, rate limiter, and OpenAI Responses API model family.

**Tech Stack:** Static HTML/CSS/ES modules, Node 22 test runner, Cloudflare Worker, OpenAI Responses API Structured Outputs.

**Spec:** `docs/superpowers/specs/2026-09-09-go-client-fastwork-design.md`

## Global Constraints

- Reuse `/api/v1/interpret`, `OPENAI_API_KEY`, existing rate limiter, and current OpenAI provider path; do not create a second credential stack.
- Public GO Client must not expose PIN-protected LIGHTHOUSE owner state.
- Normal sales answers and checklist transitions are deterministic; AI classifies natural-language intent only when local routing is insufficient.
- Never invent facts, page counts, prices outside published package rules, or client content.
- Client can always request `ขอให้ GO ช่วยดู`; this creates a compact manager packet and uses Whisper → Direct Reply → Takeover escalation.
- Portfolio/example image assets are deferred; the node exists but must say examples are being prepared rather than fabricate samples.

---

### Task 1: GO Client flow kernel

**Files:**
- Create: `go-client/flow.mjs`
- Test: `tests/greenfield-go-client.test.cjs`

**Interfaces:**
- Produces: `detectLocalIntent(text)`, `resolveSalesResponse(intent, state)`, `getChecklist(jobType)`, `mapMaterialToChecklist(fileLike, checklist)`, `evaluateChecklist(checklistState)`, `estimatePackage({pageCount, selectedPackage})`, `buildJobSummary(state)`, `buildManagerPacket(state, reason, source)`.

- [ ] **Step 1: Write failing tests** for package rules, local intent routing, fixed/fallback checklists, filename mapping, `COMPLETE AS PROVIDED`, no invented page count, and compact manager packet.
- [ ] **Step 2: Run `node --test tests/greenfield-go-client.test.cjs` and verify RED.**
- [ ] **Step 3: Implement minimal pure flow kernel.**
- [ ] **Step 4: Re-run the test and verify GREEN.**
- [ ] **Step 5: Commit `test/feat: add GO Client flow kernel`.**

### Task 2: Reuse existing interpreter API for GO Client intent classification

**Files:**
- Create: `go-client/interpreter-provider.mjs`
- Modify: `worker/index.mjs`
- Modify: `package.json`
- Test: `tests/greenfield-go-client.test.cjs`

**Interfaces:**
- `buildGoClientInterpretRequest(text, context)` returns a strict OpenAI Responses API request.
- `interpretGoClientTextWithOpenAI({apiKey,text,context,fetchImpl})` returns `{intent, jobType, package, pageCount, desiredDate, wantsEstimate, wantsManager}`.
- `/api/v1/interpret` branches on `context.surface === 'GO_CLIENT'`; existing METRO behavior remains unchanged for all other contexts.

- [ ] **Step 1: Add failing tests** verifying same endpoint, same secret/rate limit, strict schema, no echo of private client text, and unchanged legacy interpreter behavior.
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Implement provider and Worker branch; add new modules to `check:syntax`.**
- [ ] **Step 4: Verify targeted tests GREEN and run `npm test`.**
- [ ] **Step 5: Commit `feat: classify GO Client intents through existing interpreter API`.**

### Task 3: Public client sales + intake UI

**Files:**
- Create: `go-client/index.html`
- Create: `go-client/styles.css`
- Create: `go-client/app.mjs`
- Modify: `package.json`
- Test: `tests/greenfield-go-client.test.cjs`

**Interfaces:**
- Browser app imports `flow.mjs`.
- `POST /api/v1/interpret` body: `{version:'1', text, context:{surface:'GO_CLIENT', stage, jobType, package}}`.
- File picker keeps only in-session `File` objects and derived metadata; no client secret or binary upload to OpenAI.

- [ ] **Step 1: Add failing source-contract tests** for semi-AI opening notice, free-text chat, package buttons, material file input, help button, same-origin API path, and no client secret/OpenAI URL.
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Implement mobile-first chat UI and deterministic sales nodes.**
- [ ] **Step 4: Implement intake state:** job type → checklist → files/material mapping → missing required items → package/pre-estimate → final summary.
- [ ] **Step 5: Verify tests GREEN and run syntax checks.**
- [ ] **Step 6: Commit `feat: add public GO Client sales and intake surface`.**

### Task 4: Manager peek / whisper / takeover controls

**Files:**
- Modify: `go-client/flow.mjs`
- Modify: `go-client/app.mjs`
- Test: `tests/greenfield-go-client.test.cjs`

**Interfaces:**
- Client button creates manager packet with `source='CLIENT'` and optional reason.
- Manager disposition enum: `WHISPER | DIRECT_REPLY | TAKEOVER`.
- Minimum packet contains only source, reason, current stage, last client message, job type, package, estimate, compact checklist status and short recent context.

- [ ] **Step 1: Add failing tests** for compact packet and explicit help-button behavior.
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Implement manager packet and client-side escalation state.**
- [ ] **Step 4: Verify GREEN.**
- [ ] **Step 5: Commit `feat: add GO Client manager escalation controls`.**

### Task 5: Repository gate and PR

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run `npm run deploy:gate`.**
- [ ] **Step 2: Verify `go-client/` is served by the existing Wrangler static asset directory and `/api/*` still runs Worker-first.**
- [ ] **Step 3: Open PR from `feat/go-client-fastwork-20260909` to `main`.**
- [ ] **Step 4: Verify GitHub Actions Greenfield Deploy Gate passes.**
- [ ] **Step 5: Report PR, implemented scope, and any deliberate deferred items (portfolio image assets, persistent binary file storage/LINE OA deep-link if not configured in repo).**
