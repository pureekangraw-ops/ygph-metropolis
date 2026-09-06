# LIGHTHOUSE User-First Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first, interactive LIGHTHOUSE UX proving slice at `/lighthouse-next/` with local/fake state only, ready for Cloudflare PR staging and owner tap-testing.

**Architecture:** Keep the existing repository and production root untouched. Add an isolated static demo under `lighthouse-next/` with one HTML shell, one CSS design system, one JavaScript state/interaction owner, and Node contract tests. The demo persists only its own namespaced localStorage state to prove pending continuity; no existing domain/ledger runtime is called.

**Tech Stack:** HTML5, CSS, vanilla ES module JavaScript, Node 22 test runner, existing Cloudflare assets staging.

**Spec:** `docs/superpowers/specs/2026-09-06-lighthouse-user-first-demo-design.md`

## Global Constraints

- Product name is `LIGHTHOUSE`.
- User surface roots are exactly `หน้าหลัก | แชต | MANUAL | ตั้งค่า`.
- Dashboard is the post-PIN root and contains no duplicate CHAT/MANUAL entry buttons.
- No GO persona in CHAT.
- No user-facing Registry/capability/owner/gateway/durable readback/actor/route/manifest vocabulary.
- Demo data is local/fake only and is clearly identified as such in Settings.
- Ambiguity Lock is Q1=B, Q2=A, Q3=B, Q4=A.
- Brand DNA is dark foundation + warm beacon + restrained prism accents; readability wins over decoration.

---

### Task 1: Lock demo surface contracts with RED tests

**Files:**
- Create: `tests/greenfield-lighthouse-next-demo.test.cjs`
- Later create: `lighthouse-next/index.html`
- Later create: `lighthouse-next/styles.css`
- Later create: `lighthouse-next/app.mjs`

**Interfaces:**
- Consumes: Node built-ins `fs`, `path`, `node:test`, `node:assert/strict`
- Produces: source-level contract that the demo must satisfy

- [ ] Write tests asserting the three demo source files exist.
- [ ] Assert HTML contains `LIGHTHOUSE`, Dashboard root content labels, and exactly four root nav labels.
- [ ] Assert HTML does not contain forbidden architecture vocabulary or GO persona chrome.
- [ ] Assert app source contains namespaced localStorage persistence and explicit pending restore.
- [ ] Assert app source contains the Q1–Q4 behavior lock marker `BABA` and side-query reminder behavior.
- [ ] Run `node --test tests/greenfield-lighthouse-next-demo.test.cjs` and verify RED because the demo files do not exist.
- [ ] Commit only the failing test: `test: lock LIGHTHOUSE next demo contracts`.

### Task 2: Build PIN + App Frame + Dashboard

**Files:**
- Create: `lighthouse-next/index.html`
- Create: `lighthouse-next/styles.css`
- Create: `lighthouse-next/app.mjs`

**Interfaces:**
- Produces DOM ids: `pin-screen`, `app-shell`, `page-home`, `page-chat`, `page-manual`, `page-settings`, `bottom-nav`
- Produces state helpers: `loadState()`, `saveState()`, `resetDemoState()`, `selectRoot(rootId)`

- [ ] Implement semantic HTML with PIN screen and four app roots.
- [ ] Implement mobile-first CSS with lighthouse/beacon visual language, safe spacing, 44px controls, no horizontal page scroll, and reduced-motion fallback.
- [ ] Implement PIN pad accepting any four digits in demo and transition to Dashboard.
- [ ] Implement Dashboard fixture where `เงินจริง` excludes `คาดว่าจะเข้า`, plus today in/out/net, nearest obligation, gap, and daily target.
- [ ] Implement bottom nav with exactly four working roots and no duplicate CHAT/MANUAL Dashboard buttons.
- [ ] Run focused test; fix until GREEN for frame/dashboard contracts.

### Task 3: Implement CHAT pending + Ambiguity Lock B/A/B/A

**Files:**
- Modify: `lighthouse-next/index.html`
- Modify: `lighthouse-next/app.mjs`
- Modify: `tests/greenfield-lighthouse-next-demo.test.cjs`

**Interfaces:**
- Produces pending shape `{ kind, stage, amount, source, operation, product, quantity }`
- Produces `handleChatInput(text)`, `resumePendingPrompt()`, `answerLocalSideQuery(text)`

- [ ] Add RED tests for `BABA`, local side-query capability, reminder copy, and localStorage pending restore.
- [ ] Verify RED.
- [ ] Implement fixture: `วันนี้ได้ 500` → source → store operation → product → quantity → confirmation.
- [ ] Implement supported side query `วันนี้วันที่เท่าไร` using local date only.
- [ ] While in deep pending, answer the side query without replacing pending, append a short reminder, then keep the same pending prompt active.
- [ ] Persist pending before/after each meaningful transition and restore it on reload.
- [ ] Run focused tests until GREEN.

### Task 4: Implement MANUAL and Settings without dead controls

**Files:**
- Modify: `lighthouse-next/index.html`
- Modify: `lighthouse-next/app.mjs`
- Modify: `lighthouse-next/styles.css`
- Modify: `tests/greenfield-lighthouse-next-demo.test.cjs`

**Interfaces:**
- MANUAL destinations: finance, obligations, store, ride, calendar, ledger
- Settings actions: reset demo, about/demo status

- [ ] Add RED tests that all six task destinations are represented as user jobs, not module ids.
- [ ] Add RED test that reset requires a confirmation step.
- [ ] Verify RED.
- [ ] Implement six task cards with meaningful local demo detail views and working Back.
- [ ] Implement Settings with clear `ข้อมูลจำลอง` status and confirmed demo reset.
- [ ] Ensure every visible button has a listener; omit unsupported updater/backup actions rather than fake them.
- [ ] Run focused tests until GREEN.

### Task 5: Full regression and PR staging

**Files:**
- No production source changes expected.
- Create PR from `work/metro-new-20260906` to `main` as Draft for staging only.

**Interfaces:**
- Demo URL path: `/lighthouse-next/`
- Expected staging host from existing workflow: `https://ygph-metropolis-staging.pureekangraw.workers.dev`

- [ ] Run/observe repository PR workflow `npm run deploy:gate` through GitHub Actions.
- [ ] If a test fails, inspect job logs, fix only the demonstrated cause, and rerun.
- [ ] Confirm staging deploy job succeeds.
- [ ] Verify the static demo path is published under the staging host.
- [ ] Give owner the staging URL for mobile tap-testing and collect only UX/behavior feedback before production wiring.

## Self-review

- Spec coverage: PIN, Dashboard, 4 roots, CHAT B/A/B/A, reload continuity, MANUAL, Settings, brand DNA, accessibility and staging are each covered.
- Scope: production Ledger/auth/updater/Android gates are intentionally excluded from this demo and remain later WorkUnits.
- No placeholder implementation steps are required for this proving slice.
