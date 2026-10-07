# Observatory Full App Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline for this task; one fresh whole-branch review at the end.

**Goal:** Produce an installable Observatory APK with working browser, native map and Lyra.
**Architecture:** Extend the existing native app and keep its guarded relay. Replace the placeholder map surface with MapLibre; host Lyra in a separate trusted asset dialog.
**Tech Stack:** Kotlin, Android API26+, MapLibre13.6.1, Node native test runner, Android Keystore.
**Spec:** ../specs/2026-10-07-observatory-full-app.md

## Global Constraints
- No new backend/Worker or invented live Work, endpoint or authority.
- Public WebViews have no native bridge; Lyra cannot execute commands.
- Distinguish local owner actions, TEST fixtures and remote commands.
- Keep receipts tied to actual source revision and rendered frame.

## Review Focus
- A web page tries to navigate to the trusted Lyra origin: block all navigation and subresources outside the asset host.
- Model redirects/large output: reject redirects, cap reply and total response.
- Map source reload/pause: invalidate confirmation generation; retain journal pending work.
- Compressed metadata: bound decompression and require real embedded attribution.
- New pin before previous render completes: serialize commands rather than overwrite pending journal.

### Task 1: Lyra dialog and model transport
- [x] Write Node regressions for context-only observation, no execution and model failure handling; witness RED.
- [x] Vendor pinned shared agent modules; add read-only map observation adapter and trusted HTML UI.
- [x] Add native isolated asset dialog and bounded HTTPS transport/Keystore settings.
- [x] Run all Node tests; commit.

### Task 2: Native map and mobile controls
- [x] Add JVM tests for PMTiles gzip metadata and source/style contracts; witness RED in CI.
- [x] Implement MapLibre renderer, generation/source/frame readback and lifecycle.
- [x] Add owner-local pin/notes/navigation, serial map operations and PMTiles import refresh.
- [x] Make browser tool rows fit a phone, expose tab selection and Lyra dialog.
- [ ] Run Android CI tests/lint/build; fix failures; commit.

### Task 3: Installable packaging
- [x] Label/version Observatory; add emulator smoke and APK verification evidence.
- [x] Publish isolated PR targeting PR213; no merge of the blocked base PRs.
- [x] Obtain one fresh review; fix material issues with regression coverage.
- [ ] Download exact final green-build APK, verify bytes and provide the install file.

### Task 4: Existing Metropolis station and Post Office
- [x] Create actual owner pairing and persisted Work/checkpoint scopes within existing Worker.
- [x] Implement RAIL_OBSERVATORY and durable Post Office DATA_CARGO/mailboxes/delivery receipts.
- [x] Verify sharded bounded storage, revocation, sequence/capture correlation and metadata-first auth.
- [x] Preserve current signed Factory round trip and Hall HERMES/MIMIR/PIXIE/Secretary placement.
- [x] Run 98 Node tests, independent review and both CI workflows.
- [x] Deploy reviewed source 36089933f52e5219a49518008350b5155a79a0a5; GO arrival readback matches it.
- [ ] Pair real handset and prove device command loop (requires owner's phone/passcode).

Current first unverified boundary: final native emulator run, followed by the owner's handset pairing.
No handset Work has been created; live GO has zero authorized device Works until pairing.
