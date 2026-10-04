# PRISM Direct Observer Implementation Plan
> **For agentic workers:** Use superpowers:executing-plans task by task.
**Goal:** Capture actual PRISM page evidence directly in Factory and read the same Work-bound evidence through GO.
**Architecture:** A native-only Gecko capture adapter reuses Factory's sanitized semantic capability. A Factory Durable Object binds session, producer and Work; Hub only provisions scoped access and reads evidence.
**Tech Stack:** GeckoView / Java, WebExtension content script, Cloudflare Workers / Durable Objects, Node test runner.
**Spec:** ../specs/2026-10-04-prism-observer-direct-evidence-design.md
## Global Constraints
- Same Work and Checkpoint; source=PRISM_BROWSER.
- No embedded Firefox background producer or browser command authority.
- Live requires fresh visible page capture, correct tab and producer; heartbeat is not capture.
- Scope credentials encrypted in native storage. No input values; no URL secrets.
- Screenshots remain explicitly unavailable until consented capture is implemented.
## Review Focus
- Re-pairing must invalidate old credentials and evidence.
- Native async publication must not publish old-page evidence after navigation.
- Hidden/stopped Browser cannot manufacture LIVE.
- Factory readback cannot fall back to Firefox for a PRISM request.
- Native error messages and audit do not include bearer credentials.
### Task 1: Factory direct evidence
Files: cloudflare/prism-eye.mjs; cloudflare/worker.mjs; wrangler.jsonc; pixie-lab-v1/test/prism-eye.test.mjs.
Interfaces: handlePrismEye(request,env,authenticateAdmin), PrismEyeLedger.fetch; signed admin actions issue/revoke/latest; scoped bearer observe.
- [ ] Write and run RED tests: absent ingress; reject wrong Work/tab/token; idempotency; stale/revoke; sanitization.
- [ ] Implement one Work-bound ledger and bounded sanitized observations; add binding/migration.
- [ ] Run Factory suite; record result.
### Task 2: PRISM native capture
Files: native-prism-browser/PrismPageObserver.java; native-prism-browser/PrismObserverCredentials.java; PrismBrowserActivity.java; PrismBrowserPlugin.java; apply-prism-browser.mjs; native capture assets and provenance; prism/app.mjs; prism/index.html.
Interfaces: configureObserver/bootstrap; disconnectObserver; native capture onMessage validates sender/session/top-level/visibility; publish direct bearer observation.
- [ ] RED native adapter packaging and capture/session lifecycle contracts; canonical semantic behavior tests.
- [ ] Package a capability-only native messaging adapter; no Firefox background/Hub producer.
- [ ] Add scoped bootstrap encrypted with Android Keystore, HTTPS endpoint validation, bounded retry and truthful readback status.
- [ ] Preserve independent local Browser status; add pairing controls; run PRISM gate.
### Task 3: Hub readback
Files: go-hub-prism-eye.mjs; go-hub-factory-mcp-worker.mjs; go-hub-mcp-registry.mjs; tests/go-hub-prism-eye.test.cjs.
Interfaces: issue/revoke via governed mutation; read via source=PRISM_BROWSER; signed direct Factory admin client.
- [ ] RED tests for Work/producer-bound readback and refusal to substitute Firefox.
- [ ] Implement via existing Factory binding/shared-secret transport; add explicit source option to observer_latest.
- [ ] Verify scoped issuance follows existing Work backend policy and immutable audit.
- [ ] Run Hub suite and syntax/publication gates.
### Task 4: Review and delivery
- [ ] Review all diffs and security/session/freshness boundaries; fix failures.
- [ ] Save changes on separate non-default branches and open Draft PRs.
- [ ] Read exact-head CI; repair failures.
- [ ] Record implementation evidence in existing Tablet; runtime/physical acceptance remains WAIT VERIFY until actually observed.
## Execution ledger
Ruling: BIG explicitly authorized implementation ("ลงได้ครับ"); execute natively without another method/permission round.
