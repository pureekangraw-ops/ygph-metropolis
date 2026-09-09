# GO Client — Fastwork Presentation Design

Date: 2026-09-09
Status: owner-approved design, corrected for same-app integration

## Purpose

Build a client-facing semi-AI intake flow for the active Fastwork Presentation service. The system must make it easy for a prospect to ask normal questions, see pricing/terms, then move into a real brief intake only when they show buying intent.

GO Client is not the deep planner. It receives the client, checks what is needed, maps received materials to the right checklist, asks only for blocking gaps, performs a preliminary estimate when needed, and hands the confirmed job to BIG + GO Deep Planning without losing context.

## Source of truth

Service scope and working principles come from Notion page `พาโกทำเงิน → การทำงาน — Fastwork Presentation`.

Current supported job types:
- Proposal
- Company Profile
- Portfolio / Case Study
- Report / Summary

Client owns content, facts, numbers, claims and intended message. The service may organize, simplify, reorder, layout and visualize client-provided content when source data supports it. It must not invent missing facts, business strategy, statistics, claims or research from scratch as normal scope.

## Architecture — same app, same delivery

GO Client lives inside the existing YGPH METROPOLIS production web application and Cloudflare Worker delivery. It is **not** a second app, Worker, deployment, provider stack or credential stack.

The existing root `index.html` remains the single document. A client surface is selected by an explicit public mode such as `?surface=client`. In client mode the owner login/workspace is not shown and no Greenfield owner Runtime is opened. Owner mode remains unchanged and keeps the existing PIN/runtime flow.

Implementation is isolated in focused UI modules so GO Client can evolve without mixing client state into STORE / RIDE / FINANCE / CALENDAR truth.

Shared infrastructure:
- same production repository and release/deploy gate
- same Cloudflare Worker
- same `/api/v1/interpret` endpoint
- same `OPENAI_API_KEY`
- same interpreter rate limiter
- same static asset delivery

Separated state/authority:
- GO Client session state is client-conversation/intake state only
- it must not read or mutate owner Greenfield Runtime data
- no client content becomes Ledger/Store/Ride/Calendar truth

## Part A — Client surface

A client-facing chat experience with a visible notice that the chat is semi-AI. The client can type naturally; they are not forced through a linear menu.

Primary sales intents:
- service / supported work
- pricing / packages
- included scope
- materials required
- revisions
- scope change
- timeline
- page-count uncertainty
- existing-file redesign
- unorganized content
- graph/table/diagram capability
- start work
- ask for estimate first
- portfolio/examples (asset implementation deferred)

The system routes each message to the relevant response node. A buy/start intent enters intake. A request for an estimate may use a lighter pre-estimate path before full intake.

## Part B — GO manager

The client always has an emergency/help control: `ขอให้ GO ช่วยดู`.

Pressing it does not automatically force a full takeover. It creates a small Manager Packet and asks GO to peek first.

Escalation levels:
1. Whisper — GO gives the client engine guidance behind the scenes.
2. Direct reply — GO answers one or a few turns.
3. Takeover — GO manages the conversation directly.

Cost rule: start with the smallest relevant context. Expand context only when needed. Customer outcome overrides API minimization when the case is materially risky.

## Sales packages

- Starter — 490 THB, up to 5 pages
- Standard — 790 THB, up to 10 pages
- Business — 1,390 THB, up to 20 pages
- Additional pages — 70 THB/page

All packages include 2 feedback rounds. One round means the client collects feedback for the whole work and sends the requested changes in one batch.

Normal feedback includes color, font, position/size, page layout, image replacement, edits based on existing source content, and small communication/readability refinements.

Scope changes such as added pages, major new content, new topics, full direction change, agreed-structure rebuild, changed purpose, or newly designed additional pages require a new estimate and client notice before work.

Errors caused by us (typos, omissions from source, wrong numbers/text versus source, or incorrect arrangement versus agreed source) are fixed free and do not count against feedback rounds.

## Intake flow

1. Determine job type from conversation; do not ask again if already known.
2. If the type is one of the four supported types, load its fixed checklist.
3. If the type is outside or unclear, use a general fallback checklist and mark the job `OTHER / VERIFY` rather than rejecting it.
4. Request the materials relevant to that checklist.
5. Receive client messages/files.
6. Map materials to checklist items using cheapest evidence first:
   - explicit client description
   - filename/folder name
   - file type/metadata
   - lightweight file inspection only when needed and supported
7. A file may satisfy multiple checklist items.
8. Mark checklist state with:
   - RECEIVED
   - WAITING
   - OPTIONAL / NOT PROVIDED
   - VERIFY
9. Ask only for required blocking gaps.
10. If client explicitly says that is everything they have, mark `COMPLETE AS PROVIDED`; do not keep asking. Separately evaluate whether it is `READY TO WORK`.
11. Estimate package, approximate pages, price and turnaround when enough information exists.
12. If the client has no desired delivery date, this does not block the job; use turnaround after start.
13. Present Job Summary before opening the job.
14. On client confirmation, provide LINE OA / direct contact path, open the job, and hand off to BIG + GO Deep Planning.

## Estimate paths

### Package-selected path

Client chooses Starter / Standard / Business from sales. Intake verifies that actual scope fits the selected package. If not, explain the mismatch and re-estimate before confirmation.

### Pre-estimate path

Client does not know which package fits. Request only enough information/materials to estimate package, pages, price and turnaround. If the client accepts the estimate, continue checklist intake for any remaining information required to start.

## Job checklists

Each supported job type has a fixed checklist plus one general fallback checklist. Checklists are not form-completion requirements; they are material expectations. Optional items must not block readiness.

## Manager packet

When client/system calls GO, send only:
- source of call (client/system)
- reason if known
- current stage/node
- latest client message
- current job type/package/estimate
- compact checklist status
- small recent-context window

GO may request deeper context only if the packet is insufficient.

## API/runtime rule

Reuse the existing same-origin interpreter API and current OpenAI provider/runtime path. Do not create a second AI provider stack. `/api/v1/interpret` may branch on `context.surface === 'GO_CLIENT'` to a GO Client-specific strict classifier, but the transport, secret, rate limiter and Worker remain the existing ones.

GO Client public mode must not unlock, read or write the owner Greenfield Runtime.

## Safety / authority brakes

- UNKNOWN is not WRONG.
- Client facts, inference and unknown/verify state must remain distinguishable.
- Do not invent missing content.
- Do not force every field to be answered.
- Do not repeatedly ask for content the client says does not exist.
- Do not commit to a new price, deadline or special condition outside standard rules without GO review.
- If customer risk becomes material, optimize for resolving the customer case rather than minimizing API cost.
- Client mode and owner Runtime authority remain separated even though they ship in the same application.

## Success criteria

A normal client can:
1. open the same deployed application directly in client mode without entering the owner PIN flow,
2. ask natural sales questions,
3. select or request a package estimate,
4. submit a brief/materials,
5. receive only necessary missing-item requests,
6. see and confirm a concise final job summary,
7. move to the real contact/deep-planning handoff,
without being forced through a long questionnaire.

GO can be summoned with one help action, peek cheaply, whisper guidance behind the scenes, and escalate to direct reply/takeover only when needed.
