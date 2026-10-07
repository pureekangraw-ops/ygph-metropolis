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
- [ ] Write Node regressions for context-only observation, no execution and model failure handling; witness RED.
- [ ] Vendor pinned shared agent modules; add read-only map observation adapter and trusted HTML UI.
- [ ] Add native isolated asset dialog and bounded HTTPS transport/Keystore settings.
- [ ] Run all Node tests; commit.

### Task 2: Native map and mobile controls
- [ ] Add JVM tests for PMTiles gzip metadata and source/style contracts; witness RED in CI.
- [ ] Implement MapLibre renderer, generation/source/frame readback and lifecycle.
- [ ] Add owner-local pin/notes/navigation, serial map operations and PMTiles import refresh.
- [ ] Make browser tool rows fit a phone, expose tab selection and Lyra dialog.
- [ ] Run Android CI tests/lint/build; fix failures; commit.

### Task 3: Installable packaging
- [ ] Label/version Observatory; add emulator smoke and APK verification evidence.
- [ ] Publish isolated PR targeting PR213; no merge of the blocked base PRs.
- [ ] Obtain one fresh review; fix material issues with regression coverage.
- [ ] Download exact final green-build APK, verify bytes and provide the install file.
