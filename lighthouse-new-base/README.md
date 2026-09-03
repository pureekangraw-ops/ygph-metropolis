# LIGHTHOUSE — NEW BASE

This directory is the product boundary for the owner-approved LIGHTHOUSE NEW BASE.

## Allowed
- new application source written for the NEW BASE
- focused tests that prove each migrated behavior
- explicit imports from verified shared/domain modules when a migration task approves them
- staging/build adapters needed to package this base

## Reference only
- root `app.mjs`
- existing `ui/` shells and navigation
- historical LIGHTHOUSE 1.0.5 UI/navigation
- experiments or scratch branches

## Shared infrastructure outside this directory
GitHub Actions, APK signing secrets, Android/Capacitor delivery tooling and updater/release evidence remain repository-level infrastructure. They may point at this base, but they do not define this base's product structure.

## Migration rule
A legacy behavior crosses into NEW BASE only when its concrete required behavior has a failing NEW BASE test first, the smallest compatible implementation is introduced, and the boundary tests remain green.
