# Service Worker Legacy Cache Rescue Plan

1. Restore `tests/`, `tests/fixtures/`, `scripts/`, and `.github/workflows/` paths so the deploy gate runs real checks.
2. Add a failing regression for the legacy preview-cache activation deadlock.
3. Add a bootstrap before cached runtime scripts so the rescue worker is registered even when legacy `app.js` cannot parse.
4. Implement and export pure legacy-cache detection helpers.
5. Precache and verify the rescue shell before the one-time automatic activation.
6. Write safe lifecycle state before deleting legacy caches; keep future updates manual.
7. Run focused tests, the full deploy gate, syntax/UTF-8 checks, Wrangler dry run, and runtime smoke tests.
8. Publish all changes atomically to `main`, then verify the live Cloudflare deployment.
