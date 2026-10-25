# Browser owner/GO read boundary and planned-flow checkpoint

Why this: the accepted mutation guard prevents later GO actions, but observation and screenshot used a grant captured before provider awaits. Owner revoke could therefore succeed while a pending read still returned private page data. Fixing delivery authorization preserves GO eyes-and-hands while enforcing the existing invitation contract.

## Exact baseline and ownership

Remote main inspected before edits: `734a8790948b8e6a1687c4bf32ae492b41d07030`. PR #259 remains OPEN/DRAFT at `c40beec69f1db5f60d4f6a84333f0e9e12c3ebe7`; this branch builds on that accepted source, not on an older browser lane. No existing fixes were redone. No AGENTS.md or applicable local .agents/skills were present. Existing browser handoff, shared-browser plan and diagnostics checkpoint were read.

Initial owned edits: remote-browser/worker.mjs, browser-specific regression tests and this document. The subsequently coordinated diagnostics change owns StationHttp.kt and Browser-only Android callers/tests. No GOVIEW, outsideview, database or import/export edits. Greenhouse and Vault remain paused.

## Reproduction and fix

Before the fix, 10 of the initial 14 deterministic read tests failed: both observe and screenshot returned HTTP 200 after owner revoke during connect, pages, capture or disconnect, and after the tracked target/session was replaced while capture awaited. Active invitation, BIG access and exact-target rejection controls passed.

The worker now reads current permission before capture and after provider cleanup, checks the same tracked session/target, and checks captured/current origins against the live invitation and site policy. Observation also validates before updating page metadata. Both endpoints discard captured data if authorization no longer holds. Provider failure, expiry recovery and mutation guards remain in place.

Boundary: revocation committed while provider work or disconnect awaits prevents payload release. A capture already sent to the provider may still finish; its data is discarded rather than returned to GO. A response already released cannot be recalled. Checks use the current active invitation; this is not a historical permission ledger or cancellation of remote network work. Owner reads remain available without a GO grant. No arbitrary JS, fallback tab or extra permission was added.

## Planned flow coverage

- Actual HTTP router denies invalid auth and GO attempts to impersonate BIG; GO bridge shares the same authoritative workspace.
- Owner revoke denies GO read; owner invitation enables DOM and screenshot but not click control.
- Explicit delegation enables a permitted click; takeover blocks later GO reads and clicks; owner reads still work.
- New promise-barrier tests cover revocation at connect/pages/read/disconnect, site-permission revoke, replacement target and origin drift during capture.
- Existing tests retain expiry at connect/pages/goto, cleanup-before-replacement, exact-target failure, click/type/scroll/navigation mutation guards, input-clear boundary, queued stop and UNKNOWN/no-replay behavior.

Validation commands: `node --test remote-browser/tests/*.test.mjs` (62 tests); `npm test` (3 web + 47 DOM tests). These execute source with synthetic provider/storage and are local regression evidence, not production or device proof. CI results must be tied to the final published head separately.

## Coordinated diagnostics follow-up

Parent authorized ownership of StationHttp.kt and GOVIEW confirmed its lane leaves transport/browser/build files untouched. No GOVIEW callers or global build files changed.

Executable baseline reproduction on the original StationHttp/StationDiagnostics JVM source used a synthetic HTTPS connection returning correlated HTTP 200. Both malformed JSON and invalid Live View URL subsequently produced exceptions with null HTTP status and correlation. The reproducer copied the exact pre-change Browser query validation flow; no real HTTP or credentials were used.

Additive StationHttp.requestResponse returns body, exact HTTP status, request ID and verified correlation. Existing StationHttp.request keeps its signature and delegates to return the body for existing callers. BrowserResponse parses/validates inside the envelope so later errors retain transport facts as safe StationFailure values. Browser diagnostics now persist exact success status as well. Oversized/unreadable successful bodies also retain known status/correlation. Default envelope string rendering and failure causes do not expose response body, token or signed view URL.

Focused Kotlin/JUnit tests execute actual transport and Browser parser with synthetic HttpURLConnection: malformed JSON, invalid view URL, valid view, error body, missing/mismatched echo, no-request-ID caller, HTTP error and oversized/unreadable body, plus existing StationDiagnostics tests. Local standalone Kotlin 2.0.21/JVM validation passes 11 tests; this is not an Android Activity build or device test. The normal Android CI compiles the full Activity and runs the same tests; report its final-head outcome separately.

## Required real acceptance, not executed

Using an owner-authorized isolated deployment and synthetic test site, record the source/deployed version and redacted correlation IDs for: Android owner session open and Live View showing the same exact tab as GO DOM/screenshot; invitation without control; delegated click/type/navigation/scroll; takeover/revoke while a read or action awaits; no payload/next action after revoke; explicit expiry recovery; queued work after viewer closes and uncertain-step no replay. Confirm actual GO tool registration/service binding, not merely UI delegation.

On the intended Xiaomi, verify viewer interaction and lifecycle, owner takeover and unchanged GOVIEW data with a compatible data-preserving upgrade. Record device/OS/app-source versions and observed outcomes separately from CI. Credentials, signed URLs and page data must stay out of evidence.

These acceptance actions are unexecuted because this lane has no authorization for deployment, credentials or APK/device operations. No merge, deploy, release unlock, real transactions/data deletion, credentials, APK build/install/signing or production writes were performed here. No new service, cost or architecture was introduced.
