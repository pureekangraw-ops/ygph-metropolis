# Package Existing Full App into Android — Design

## Goal
Build the Android APK from the existing application already present at repository root, without recreating Chat, Manual, Settings, business Truth, Runtime, authority, or persistence.

## Source of truth
Base commit: `a64c606e5d22f435e95751422dd502556b59bd2c` (PR #99 HEAD).

The packaged application must use the existing root application entry and its existing modules, including:
- `index.html`
- `app.mjs`
- `ui/**` (including `master-input.mjs`, `manual-finance-ui.mjs`, `settings-ui.mjs`)
- `greenfield/**`
- `lighthouse/**`
- required root static assets.

## Architecture
Android is a packaging shell only. A staging tool copies the existing web application into `android-shell/www` immediately before test/build. It must not synthesize replacement Chat, Manual, or Settings surfaces.

The existing `android-shell/www/trusted/**` and `android-shell/www/patch/**` trust assets remain available in the Android package, but the application UX and business/runtime implementation come from the existing root application rather than a newly-created front door.

## Required proof
Before APK build, a packaging contract check must prove that staged Android assets:
1. are byte-identical to the existing source files for the app entry and key UI modules;
2. include the existing Chat ↔ Manual bridge wiring (`openManualFromChat`, `askFromManual`, `returnToManual`, `returnToChat`);
3. include Manual's `ถามเรื่องนี้` action;
4. include the existing Settings utility;
5. do not contain the replacement `front-door-0.0.7` app as the Android entry.

## Build control
Provide a dedicated `workflow_dispatch` workflow. Do not trigger it automatically from pushes or pull requests. The owner will press Run manually.

## Boundaries
- no new business Truth
- no duplicate Runtime or authority
- no new persistence
- no new product capability
- no production deploy or store publish
- no production merge
- do not call the APK complete until the owner runs the workflow and tests the resulting APK on Android.
