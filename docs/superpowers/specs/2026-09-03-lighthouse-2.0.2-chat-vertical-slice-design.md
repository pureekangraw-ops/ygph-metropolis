# LIGHTHOUSE 2.0.2 — CHAT Complete Vertical Slice Design

**Date:** 2026-09-03
**Status:** OWNER-APPROVED IN CHAT
**Base source:** `885bdd369a07a249b71574ba35c832e4c0579e2c` (LIGHTHOUSE 2.0.1 / versionCode 2001)
**Target:** `2.0.2` / versionCode `2002`
**Application ID:** `com.yggdrasil.lighthouse`
**Required signer SHA-256:** `aae608a7ddab0dbfccc1d35e817c5683b3c64b90ab581a4b74867db54e0351ce`

## Goal

Make CHAT one real, durable vertical slice. A user message becomes local truth before execution, survives restart, can produce a reviewable Quick Capture draft, commits only after confirmation, and reports success only after the real domain owner persists and readback proves the result.

## Scope lock

This release changes CHAT and only the shared persistence/runtime/domain/navigation/layout contracts required to make CHAT complete. It does not build out MANUAL or SETTINGS features beyond required shared contracts and version/update continuity.

## Required source principles

### Message lifecycle

`COMPOSE → COMMIT MESSAGE RECORD → QUEUE WORK → EXECUTE → RESULT → UPDATE RECORD → RENDER`

- The message record exists before work starts.
- UI never owns execution state.
- Retry references the same durable message/work record.
- Error never deletes the original message.

### Event/state/change lifecycle

`NEW RESULT → EVENT RECORD → PERSIST → DERIVE CURRENT SNAPSHOT → COMPARE PREVIOUS → RENDER MEANINGFUL CHANGE`

- Keep event history separate from current snapshot.
- Keep execution/domain state separate from sync/readback state.
- `WAITING → WAITING` may update internal evidence but renders no duplicate user-facing state.
- `WAITING → BLOCKED|ERROR|SUCCESS` is meaningful and is rendered once.
- Archive removes completed work from active view without deleting history.

### Quick Capture

`RAW INPUT → PARSED SUGGESTION → STRUCTURED DRAFT → USER REVIEW/EDIT → USER CONFIRM → COMMIT`

- Raw input is stored separately from parsed fields.
- Parser is advisory, not owner of truth.
- No domain mutation before confirmation.
- Cancel preserves conversation/history and performs no domain commit.

## Architecture

Use the existing NEW BASE and existing domain-owner execution/readback paths. Add a durable CHAT layer rather than wrapping the old Master Input UI or rewriting the whole runtime.

### CHAT records

A persisted chat document contains:

- `conversation`: stable id, created/updated timestamps, archive state.
- `messages`: stable id, conversationId, role, rawText/text, createdAt, executionState, syncState, workId, archived flag.
- `drafts`: messageId, rawText, parsed suggestion, structured fields, owner/action, revision, confirmation state.
- `work`: stable workId + messageId, kind, status, attempt count, prepared request/receipt references and last error.
- `events`: append-only event id, messageId/workId, execution state, sync/readback state, timestamp, evidence payload.
- `changeMarkers`: last rendered meaningful state per message/work.

Persistence owns the full document. UI receives projections only.

### Execution and domain ownership

- CHAT parses into a draft without mutation.
- On confirm, queue/worker invokes the existing domain bridge/capability.
- Domain owners remain the only owners of Income/Outcome/Ride/Ledger records.
- CHAT stores references/readback evidence, never cloned domain records.
- Success requires domain commit followed by real readback.
- A readback failure records sync/readback error without rewriting a domain execution truth that already happened.

### Recovery

On boot/open:

1. Read persisted chat document.
2. Re-project conversation immediately.
3. Find work in queued/running/retryable states.
4. Reconcile/retry using the same `messageId` and `workId`.
5. Append events and render only a new meaningful state.

The recovery path must be idempotent. If the domain reports an existing command/record, perform readback and recover rather than creating a new user message or new domain mutation.

## UI contract

- CHAT is a real conversation thread with user and LIGHTHOUSE messages visually separated.
- Composer sends from the send button and keyboard send action; Shift+Enter remains newline where applicable.
- One physical submit gesture yields at most one message record; repeated submit while the same payload is being committed is ignored.
- Draft appears in conversation with real Edit / Confirm / Cancel behavior.
- Retry and Archive buttons exist only when they have functioning handlers.
- No internal terms such as Master Input, execution state, durable readback, work queue, or internal enum labels are user-facing.
- Use safe-area insets, `100dvh`, and `visualViewport`-driven keyboard sizing so composer/latest message remain visible.
- Existing CHAT/MANUAL/SETTINGS route owner remains single; Android/back route behavior must not regress.

## Version truth

The visible version is supplied by installed/build identity, not a UI literal. Target build identity is `2.0.2 / 2002`.

## Acceptance tests

Automated coverage must include:

- button submit and keyboard submit
- double-submit suppression
- message persistence after controller/app recreation
- queued work/retry use original message/work IDs
- draft preview/edit/confirm/cancel
- no commit before confirm
- persist → domain readback before SUCCESS
- readback error does not destroy domain execution state
- meaningful change detection; WAITING→WAITING silent
- Archive != Delete
- CHAT references the same domain-owner record read by MANUAL projections
- navigation/back regression
- safe-area/visual viewport/keyboard contract
- no internal copy leakage
- UI version derived from build identity
- update compatibility/data continuity contract from 2.0.1 to 2.0.2

## Release evidence and close rule

Before handoff provide source commit, changed files, test results, applicationId, versionName/versionCode, signer SHA-256, APK SHA-256, test manifest, signed APK referenced by that manifest, and proof packaged assets correspond to the reported source commit.

Automated green/build output does not mean accepted. Final status is at most `IMPLEMENTED / TESTED / DEVICE UNVERIFIED` until a physical Android device proves both the updater path and CHAT end-to-end path. Never use `COMPLETE` or `ACCEPTED` before that proof.
