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
POST /v1/session {url} owner only; GET /v1/session owner/GO; GET /v1/observe owner/GO only after explicit owner invitation; POST /v1/observe-access {allow:true|false} owner only; GET /v1/view owner only; POST /v1/control {controller:"BIG"|"GO"} owner only; POST /v1/action {type:"navigate"|"back"|"forward"|"reload"|"scroll"|"click"|"type",...} owner/GO when controller owns it; POST /v1/run {steps:[max 10 safe actions]} owner/GO only after delegated controller grant; POST /v1/audit {urls:[...]} owner only; GET /v1/job owner/GO; POST /v1/stop owner only; POST /v1/close owner only (explicit browser shutdown to limit usage).

The worker never executes arbitrary JavaScript from client requests; GO actions require explicit host allowlist, and blocks forms and risky controls by default. Browser page content is untrusted and **must not** be interpreted as authorization. A signed Live View link is a capability credential; never log or forward it. Headless audit is bounded and checkpoints results; waitUntil is not a durable Workflows engine.

## GO tools, owner console, and real background execution (WORK)

A single Cloudflare Worker now hosts the owner's /console web control page, the /mcp stateless GO tool endpoint, and the same Durable Object/browser used by Android Observatory. This is not a third Android mode or an extra browser engine.

MCP implements seven GO tools: observatory_session, observatory_observe, observatory_screenshot, observatory_action, observatory_run, observatory_job, and observatory_note. GO_TOKEN authenticates the GO role. The OWNER_TOKEN authenticates BIG's Android or web console but is never given to GO. The account must explicitly connect this remote MCP server to the intended ChatGPT environment before GO can call any tool in a real conversation.

GO page read/screenshot requires BIG's explicit invited-origin grant. GO cannot open sessions, generate owner Live View links, or navigate to another hostname under the same grant. BIG can take over and revoke access. Job readback is accessible to GO after completion for GO-origin jobs without granting fresh page observation.

The Durable Object now schedules each background job through its alarm, survives a disconnected Android viewer, and persists a step DISPATCHING receipt before any command. A crashed uncertain command is not blindly replayed: the result becomes UNKNOWN. GO_SCRIPT permits up to ten scoped steps per job. Page audit is bounded and read-only. This is not a fully general autonomous language-model process; GO prepares actions or a bounded plan through the connected tool.

GO can send brief notes to the Android/console UI, and obtain an authorized bounded JPEG screenshot. The owner sees job progress and receipts. Cloudflare session recordings are opt-in (OFF by default) before acquiring a session; replay becomes available through Cloudflare Browser Run after the session closes. Browser Run guardrails limit hostnames and required public assets. Changing the target host obtains a fresh session.

The owner console keeps its token in memory only. It serves a nonce-based Content Security Policy and no-store headers. The owner may explicitly close sessions to reduce browser time and cost. No new R2 bucket is necessary to store compact DO job receipts.

## Stage boundary: WORK completed as source, TEST follows separately

WORK source now includes the new Android launcher, retained GOVIEW Map Studio, Cloudflare Browser Run controller, SQLite DO session/job management, GO MCP adapter, web owner console, Live View, per-step receipts, optional replay, and background controls.

TEST is NOT performed by source creation or automatic CI. Later verify: authorized isolated Worker deployment and secrets; successful GO tool registration; one shared tab between BIG, GO and Android; owner takeover; actual background completion after the Android viewer closes; recording after session closure; and Xiaomi APK signing/data-preserving install with GOVIEW owner data retained. Do not uninstall the current owner APK or merge PRs simply to prove WORK complete.

## Known boundaries
This WORK source branch has no deployed Worker or proven Xiaomi end-to-end connection yet. Live View embedded in Android may be constrained by Cloudflare's hosted UI; verify on emulator/real handset. Cloudflare Browser Run sessions expire when idle and consume usage; do not leave background sessions running indefinitely. The remote GO action rail is source-ready, **not an installed ChatGPT tool**.

Current GOVIEW PR #245 is deliberately not merged as part of this implementation. Owner device data/signing must be protected during APK upgrades.

GO observation access is denied by default and revoked when BIG takes back the controller. The **เรียก GO** button grants read-only API access but does not automatically notify a particular ChatGPT conversation.

Headless GO_SCRIPT is bounded to 10 owner-authorized actions with per-step dispatch receipts and businessOutcome=UNKNOWN. STOP prevents later steps but cannot undo an already dispatched click; interrupted jobs are UNKNOWN and never silently replayed.

Sessions should be explicitly closed by BIG to stop Browser Run billing; background mode intentionally does not auto-close the browser until its finite job ends. When an active job is RUNNING, close is refused until it has stopped or completed.
