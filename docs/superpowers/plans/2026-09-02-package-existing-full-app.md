# Package Existing Full App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the existing repository application into the Android shell without recreating Chat, Manual, or Settings.

**Architecture:** Add a staging tool that copies the repository-root app into `android-shell/www` while preserving Android trust assets. Add a packaging contract test that compares staged files to their original sources and checks critical existing bridge/UI behaviors. Add a manual-only GitHub Actions workflow that stages, verifies, builds, signs, and uploads the APK when the owner presses Run.

**Tech Stack:** Node.js 22, Capacitor 8.5, Android/Gradle, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-02-package-existing-full-app.md`

## Global Constraints
- Base source is PR #99 HEAD `a64c606e5d22f435e95751422dd502556b59bd2c`.
- No replacement Chat, Manual, or Settings implementation.
- No new business Truth, Runtime, authority, persistence, or capability.
- Workflow is `workflow_dispatch` only.
- No production deploy, publish, or merge.

---

### Task 1: Packaging contract

**Files:**
- Create: `android-shell/test/existing-full-app-package.test.mjs`

**Interfaces:**
- Consumes repository-root app files and staged `android-shell/www` files.
- Produces a failing/passing contract for exact staged-source identity and critical flow markers.

- [ ] Write the packaging contract first.
- [ ] Confirm it would fail before staging because `android-shell/www` is the Foundation/patch shell rather than the existing app.
- [ ] Keep assertions limited to source identity and already-existing behaviors.

### Task 2: Stage existing app

**Files:**
- Create: `android-shell/tools/stage-existing-full-app.mjs`
- Modify: `android-shell/package.json`

**Interfaces:**
- Produces `npm run app:stage-existing`.
- Copies root `index.html`, `app.mjs`, static assets, `ui/**`, `greenfield/**`, and `lighthouse/**` into `android-shell/www`.
- Preserves `android-shell/www/trusted/**` and `android-shell/www/patch/**`.

- [ ] Implement minimal staging tool.
- [ ] Add package script.
- [ ] Ensure old replacement `www/app` is removed from staged build output.
- [ ] Run packaging contract after staging when CI is executed.

### Task 3: Manual owner build workflow

**Files:**
- Create: `.github/workflows/lighthouse-existing-full-app-manual.yml`
- Modify: `android-shell/version.json`

**Interfaces:**
- Trigger: `workflow_dispatch` only.
- Produces signed canonical APK artifact plus identity/security evidence.

- [ ] Stage existing app before tests and Capacitor sync.
- [ ] Verify packaging contract.
- [ ] Build Android project and apply existing security baseline.
- [ ] Sign with existing canonical APK signing secrets.
- [ ] Upload artifact.
- [ ] Do not add push/pull_request triggers.

### Task 4: Source review checkpoint

- [ ] Confirm branch diff contains no new Chat/Manual/Settings implementation.
- [ ] Confirm workflow remains manual-only.
- [ ] Stop without running the workflow; owner presses Run.
