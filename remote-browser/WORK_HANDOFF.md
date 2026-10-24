# YGG Observatory — Shared Browser WORK Handoff

This branch builds one Android APK with TWO modes: Browser (Cloudflare remote Chrome shared with BIG and GO) and GOVIEW (native/offline maps). The old GeckoView dependency and launcher are no longer needed. GOVIEW PR #245 source remains intact on the stacked branch. Source only: no production merge, deployed browser Worker, provisioned secrets, connected GO plugin, physical handset acceptance or signed owner upgrade is claimed.

Canonical GitHub: pureekangraw-ops/ygph-metropolis.
- Base GOVIEW Draft PR: #245 (go/goview-map-creator-routing-20261023).
- Browser Draft PR: #246 (go/observatory-shared-browser-20261024), based on PR #245.
- Android: RemoteBrowserActivity.kt is launcher; OutsideViewActivity.kt keeps GOVIEW.
- Cloudflare: remote-browser/worker.mjs with BrowserWorkspace Durable Object, browser binding, guardrails, background alarm queue and job readback.
- GO MCP: remote-browser/mcp.mjs, seven scoped tools at /mcp with GO_TOKEN.
- Owner web console: remote-browser/console.mjs at /console; uses the same session as APK.
- Cloudflare Wrangler config: remote-browser/wrangler.jsonc; secrets OWNER_TOKEN and GO_TOKEN must be different, server-side. GO_ALLOWED_HOSTS and PUBLIC_ASSET_HOSTS must be reviewed for the owner site.
- Evidence/checkpoint: GO Brain 7f598d2c-fb68-49dd-939e-ef646caa0732 and GOVIEW 25323b10-63cc-400c-a5d0-ffa8099428b6.

WORK features built in source:
1. Android/web BIG can open an HTTPS remote session, watch Live View and see status.
2. Owner may invite GO to read a specific origin, receive scoped DOM/screenshot, or delegate control, then revoke immediately for later actions.
3. GO can use the authenticated MCP tool surface to observe, act, submit up to 10 safe background steps, inspect receipts and post an owner-visible note.
4. The Durable Object alarm processes queued work after the viewer closes. Pre-dispatch persisted status prevents blindly replaying uncertain clicks. Business effects remain UNKNOWN until source-owned proof exists.
5. Opt-in Cloudflare recording allows replay after a session closes; disabled by default, may capture sensitive screen content.
6. Owner may explicitly close an unused Browser Run session. GOVIEW retains local maps and GPS without depending on the remote session.

TEST PHASE — NEXT, NOT EXECUTED HERE:
- Review Worker billing, host allowlists and provision isolated Cloudflare service with separate secrets; do not paste keys in chat.
- Connect GO remote MCP through an owner-approved ChatGPT/plugin connection; the endpoint is not currently registered as a usable tool just because the Worker source exists.
- Verify owner and GO actually see/control the same remote page through Live View, including pause/takeover and revocation.
- Submit an authorized background job, close or hide Android, and read exact job status and receipt later. Examine interrupted jobs without replaying risky effects.
- Confirm optional recording and its data access/retention after closing a session.
- Confirm APK signer compatibility and a data-safe install on the real Xiaomi without uninstalling saved GOVIEW data.

Source is ready for the next stage, but live integration requires Cloudflare deployment, credentials and a connected GO tool, and may need compatibility changes discovered in TEST. Keep PR #246 Draft until owner-directed release.
