# Observatory Shared Browser — Browser Mode replacement (WORK)

This code replaces the GeckoView APK launcher with **RemoteBrowserActivity**. GOVIEW remains the other mode in the **same** Android application. This feature is a stacked branch based on GOVIEW PR #245; GOVIEW source/data are untouched.

## User-visible Browser Mode
- Open an HTTPS site in a **Cloudflare Browser Run** remote Chrome session; one owner workspace, one remote tab.
- Display Cloudflare **Live View** inside Android's restricted WebView viewer (the WebView is *not* a local website engine).
- **Observe**: see the active page title, bounded visible text and controls via the owner-authorized read API.
- **Live Control**: BIG explicitly grants the GO role, receives live view and can take control back. A transparent Android touch shield prevents accidental concurrent touches while GO controls. GO actions are only accepted through the trusted worker's authenticated API, on configured allowlisted hostnames.
- **Headless**: bounded asynchronous **page audit** (status, title, links/buttons) with job id, checkpoints and owner readback. This is **not** natural-language autonomous browsing yet. Resuming a dropped browser session requires a new owner-initiated session; do not replay unknown side effects.
- **GOVIEW** opens the retained native map mode with its separate saved owner map data.

## Cloudflare deployment — source only until authorized setup
In remote-browser:
1. Run npm install and npm run test.
2. Set Worker secrets OWNER_TOKEN and GO_TOKEN with distinct random 32+ character values in Cloudflare; **never share tokens in chat/repo**. Prefer a scoped owner-facing identity path for production.
3. Review GO_ALLOWED_HOSTS in wrangler.jsonc. Default restricts GO actions to *.yggmetro.com. BIG may navigate other public HTTPS sites, but GO cannot act there.
4. Deploy with npm run deploy after verifying account/plan, bindings and secrets. The Worker creates its own SQLite Durable Object and binds Cloudflare BROWSER.
5. On Android open ⚙ and provide the correct owner Worker HTTPS URL and OWNER_TOKEN. Token is encrypted in Android Keystore; the app does not store GO_TOKEN or expose a Cloudflare API token.
6. Provision a **real GO tool integration** that sends scoped calls to GET /v1/observe, GET /v1/session, POST /v1/action using GO_TOKEN. Without tool registration, pressing "ให้ GO ทำ" merely delegates controller permission; it does not cause this ChatGPT GO to navigate automatically.

## API (Bearer OWNER_TOKEN except specified GET/GO endpoints)
POST /v1/session {url} owner only; GET /v1/session owner/GO; GET /v1/observe owner/GO only after explicit owner invitation; POST /v1/observe-access {allow:true|false} owner only; GET /v1/view owner only; POST /v1/control {controller:"BIG"|"GO"} owner only; POST /v1/action {type:"navigate"|"back"|"forward"|"reload"|"scroll"|"click"|"type",...} owner/GO when controller owns it; POST /v1/run {steps:[max 10 safe actions]} owner/GO only after delegated controller grant; POST /v1/audit {urls:[...]} owner only; GET /v1/job owner/GO; POST /v1/stop owner only.

The worker never executes arbitrary JavaScript from client requests; GO actions require explicit host allowlist, and blocks forms and risky controls by default. Browser page content is untrusted and **must not** be interpreted as authorization. A signed Live View link is a capability credential; never log or forward it. Headless audit is bounded and checkpoints results; waitUntil is not a durable Workflows engine.

## Known boundaries
This WORK source branch has no deployed Worker or proven Xiaomi end-to-end connection yet. Live View embedded in Android may be constrained by Cloudflare's hosted UI; verify on emulator/real handset. Cloudflare Browser Run sessions expire when idle and consume usage; do not leave background sessions running indefinitely. The remote GO action rail is source-ready, **not an installed ChatGPT tool**.

Current GOVIEW PR #245 is deliberately not merged as part of this implementation. Owner device data/signing must be protected during APK upgrades.

GO observation access is denied by default and revoked when BIG takes back the controller. The **เรียก GO** button grants read-only API access but does not automatically notify a particular ChatGPT conversation.

Headless GO_SCRIPT is bounded to 10 owner-authorized actions with per-step dispatch receipts and businessOutcome=UNKNOWN. STOP prevents later steps but cannot undo an already dispatched click; interrupted jobs are UNKNOWN and never silently replayed.
