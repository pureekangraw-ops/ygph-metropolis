# LIGHTHOUSE Figma → Live App Adoption Design

Date: 2026-09-11
Branch: `feat/lighthouse-real-store-20260910`
Status: OWNER-APPROVED DIRECTION / SPEC FOR FINAL REVIEW

## Goal

Bring the owner-approved LIGHTHOUSE Figma product language into the real `lighthouse-next` application without replacing or weakening the existing runtime architecture.

The deliverable is not a second demo surface. The existing live LIGHTHOUSE remains the product. Figma is the UI/interaction blueprint used to refine that live surface.

Success means:

1. the live app visually and behaviorally follows the approved Figma direction,
2. real Ledger and Store truth remain authoritative,
3. existing Auth, Home, Store, Ride, runtime-gate, runtime-ledger, and runtime-store behavior remains intact,
4. CHAT mutations continue to require confirmation, runtime commit, durable readback, then success,
5. MANUAL becomes the direct read/manage hub for real data rather than a demo-card surface,
6. no hardcoded Figma examples such as `+50` become source-of-truth data,
7. no duplicate UI/runtime truth is introduced.

## Chosen Architecture

Use the current `lighthouse-next` shell as the only live UI and adopt the Figma design into it incrementally.

Flow:

`Runtime / Store / Ledger truth`
→ `focused view-model projection`
→ `existing LIGHTHOUSE live shell`
→ `Figma visual + interaction language`

Figma does not replace runtime contracts. The live app does not become a pixel-for-pixel static copy when that would remove real capabilities.

## Existing Live Responsibilities That Must Stay

The current application already owns capabilities not represented by the Figma prototype:

- device Auth / Recovery,
- Home with real financial truth,
- Store workflows,
- Ride workflows,
- Runtime Session locking,
- real Ledger reads and commits,
- real Store reads and commits.

These capabilities stay in place and are visually integrated into the approved design language.

## Surface Architecture

### Root Navigation

Keep four live root destinations:

- Home
- Chat
- Manual
- Settings

Home remains because it is already the real owner dashboard and has no safe reason to disappear merely because the Figma prototype focused on Chat/Manual/Settings.

### CHAT

CHAT keeps its current owner-language workflow behavior and adopts the Figma structure:

- restrained conversation surface,
- owner message vs LIGHTHOUSE message hierarchy,
- compact composer,
- explicit confirmation state,
- explicit edit/cancel paths,
- success only after durable readback.

A Figma example such as `ทิป 50` may exist only as documentation/test fixture content. It must not appear as stored default truth in a real signed-in session.

### MANUAL

MANUAL is the direct-work hub.

The live cards remain capability-driven rather than being forced into only the four Figma demo modules. Preserve real capabilities:

- Finance
- Store
- Ride
- Calendar
- Ledger

Within Finance, use the Figma Income/Outcome direction as real read views instead of creating separate duplicate financial stores.

MANUAL cards show concise real summaries when the required truth is available and a truthful empty/unavailable state when it is not.

### SETTINGS

Use the Figma hierarchy and visual treatment, but only expose operations that are real and safe.

Current real actions such as local-state clearing and app locking remain.

Do not ship fake Backup / Restore / Version actions merely because they exist in the Figma prototype. A recovery/data-management control can appear only if it is connected to an existing real runtime operation with an explicit success/failure contract.

## Data Boundaries

### Runtime authority

Runtime contracts continue to own mutation permission and session state.

### Ledger authority

Ledger remains the sole authority for cash truth, including:

- current balance,
- today income,
- today expense,
- net movement,
- durable transaction readback.

### Store authority

Store remains the sole authority for:

- product records,
- stock,
- sale records,
- product-linked store operations.

### Local UI state

Local storage may hold only local presentation/session conveniences such as:

- selected root,
- chat history intended to remain device-local,
- pending confirmation state,
- currently open manual view.

It must not override signed-in Ledger/Store truth.

## View-Model Boundary

Introduce or isolate focused pure projection functions between runtime data and DOM rendering.

The view-model layer should answer questions such as:

- what should Home display from current Ledger truth,
- what summary should MANUAL Finance display,
- what is the latest Ledger item,
- what should an empty Store/Calendar state say,
- whether a section is `ready`, `empty`, or `unavailable`.

The view-model does not commit mutations and does not own durable data.

This boundary exists to prevent `app.mjs` from becoming a mixture of runtime authority, UI formatting, and Figma layout logic.

## State Model

Every real-data surface supports three basic read states:

1. `READY` — runtime read succeeded and real truth is available,
2. `EMPTY` — runtime read succeeded but there is no matching data,
3. `UNAVAILABLE` — runtime/session/read failed or is not yet available.

Mutation surfaces additionally support:

- `DRAFT`,
- `CONFIRM`,
- `COMMITTING`,
- `VERIFIED_SUCCESS`,
- `FAILED`.

`VERIFIED_SUCCESS` is reachable only after durable readback proves the expected result.

## Error Handling

- Auth errors stay at the Auth boundary.
- If Ledger or Store read fails after unlock, do not fall back to demo money/stock values.
- If a runtime mutation fails, keep the user in a recoverable state and do not display success.
- If durable readback does not match the expected mutation, display a bounded verification failure rather than claiming `บันทึกแล้ว`.
- Empty data is not an error; render a purposeful empty state.
- Offline/unavailable truth must never be represented by invented sample values.

## Design System Strategy

Use the existing `owner-polish.css` direction as the live token/source layer and align it with the Figma-approved roles:

- dark navy/cosmic background,
- slate panels,
- cyan for interaction/information,
- magenta for outcome/expense emphasis,
- violet for system/settings/status,
- warm gold for brand/primary action,
- restrained active navigation pills rather than large saturated blocks.

Do not introduce a framework or component library solely for this adoption.

Reuse semantic HTML/CSS patterns already present in `lighthouse-next` and create focused reusable classes only where duplication becomes real.

## Implementation Boundaries

Primary implementation files are expected to remain within:

- `lighthouse-next/index.html`
- `lighthouse-next/app.mjs`
- `lighthouse-next/owner-polish.css`
- focused new helper/view-model modules under `lighthouse-next/` only if they reduce responsibility in `app.mjs`
- focused regression tests under `tests/`

Runtime domain modules should change only if a UI requirement exposes a missing read contract that cannot be satisfied safely from existing truth.

No broad Greenfield refactor is part of this work.

## Test Strategy

Follow the repository's existing Node test workflow and TDD discipline.

Required coverage:

1. visual contract tests for Figma-approved tokens, active nav treatment, card hierarchy, and viewport containment,
2. structural tests proving the live HTML exposes the required root surfaces and no dead Figma-only actions,
3. pure view-model tests for READY / EMPTY / UNAVAILABLE projections,
4. CHAT mutation tests proving confirm → commit → readback → success order remains intact,
5. regression tests proving real Store and Ledger flows are not replaced by local demo data,
6. syntax and UTF-8 gates,
7. existing Android staging/package identity gates where the current repository workflow already requires them.

Final completion requires the repository gate relevant to this branch to pass from the actual changed head. No PASS/DONE claim is allowed from design inspection alone.

## Non-Goals

This adoption does not:

- redesign Store domain contracts already under the active real-store branch unless required by a proven missing UI read contract,
- replace the Auth system,
- remove Home or Ride because they are absent from the Figma prototype,
- create a second LIGHTHOUSE application,
- add fake backup/restore/version operations,
- turn Figma sample values into production defaults,
- refactor unrelated Greenfield/GO Client code.

## Acceptance Criteria

The work is complete when:

- the live signed-in LIGHTHOUSE visibly follows the approved Figma design language,
- Home, Chat, Manual, Settings, Finance, Store, Ride, Calendar, and Ledger remain reachable as appropriate,
- displayed financial/store values come from real truth or truthful empty/unavailable states,
- all visible actionable controls have real behavior,
- mutation success is readback-verified,
- no duplicate source of truth is introduced,
- relevant tests and deployment/package gates pass on the final head.
