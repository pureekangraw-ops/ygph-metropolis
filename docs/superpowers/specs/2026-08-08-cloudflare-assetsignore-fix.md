# Cloudflare asset allowlist correction

## Problem
The Cloudflare static-assets deployment uses `.assetsignore` as an allowlist. The current file includes runtime layers through `metropolis-r5-3.*` but omits `metropolis-r5-4.css` and `metropolis-r5-4.js`, even though 4.2.2 depends on those files and the service-worker/release manifest already references them.

## Fix
Add only these two allowlist entries:
- `!/metropolis-r5-4.css`
- `!/metropolis-r5-4.js`

No application logic, data schema, vault, or user data changes.

## Verification
1. PR safety gate passes.
2. Merge to `main` triggers Cloudflare deploy.
3. Production can fetch the R5-4 assets and display METROPOLIS v4.2.2.
