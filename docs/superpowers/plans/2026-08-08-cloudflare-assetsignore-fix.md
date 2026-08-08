# Cloudflare R5-4 asset delivery plan

1. Add `metropolis-r5-4.css` and `metropolis-r5-4.js` to `.assetsignore` allowlist.
2. Verify the pull-request safety gate.
3. Merge to `main` so the existing deploy job uploads the corrected asset set.
4. Verify production displays 4.2.2.
