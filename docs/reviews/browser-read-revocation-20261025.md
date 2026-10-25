# Browser owner/GO read boundary and planned-flow checkpoint

Why this: the accepted mutation guard prevents later GO actions, but observation and screenshot used a grant captured before provider awaits. Owner revoke could therefore succeed while a pending read still returned private page data. Fixing delivery authorization preserves GO eyes-and-hands while enforcing the existing invitation contract.

## Exact baseline and ownership

Remote main inspected before edits: `734a8790948b8e6a1687c4bf32ae492b41d07030`. PR #259 remains OPEN/DRAFT at `c40beec69f1db5f60d4f6a84333f0e9e12c3ebe7`; this branch builds on that accepted source, not on an older browser lane. No existing fixes were redone. No AGENTS.md or applicable local .agents/skills were present. Existing browser handoff, shared-browser plan and diagnostics checkpoint were read.

Owned edits: remote-browser/worker.mjs, browser-specific regression tests and this document only. No Android, GOVIEW, outsideview, transport, database or import/export edits. Greenhouse and Vault remain paused.

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

## Shared transport coordination proposal — pending, unchanged

Source still shows StationHttp.request returning only a String after verifying HTTP status/correlation. RemoteBrowserActivity.query then parses JSON and validates the view URL; those later exceptions no longer carry status/correlation and diagnostics report unknown/unconfirmed. This is a source trace, not a completed executable Android reproduction in this lane.

Proposed bounded follow-up for agreement with GOVIEW transport owner: add a response envelope API containing body, exact HTTP status and verified request ID/correlation; preserve the existing String request API for other callers. Browser parsing/URL validation would attach that metadata to safe StationFailure results. Test valid correlated 2xx with malformed JSON/invalid view URL, non-2xx, missing/mismatched correlation, and oversized body. Do not log body, token, view URL or page data. No shared file has been edited; implementation and executable reproduction are pending coordination, not denied.

## Required real acceptance, not executed

Using an owner-authorized isolated deployment and synthetic test site, record the source/deployed version and redacted correlation IDs for: Android owner session open and Live View showing the same exact tab as GO DOM/screenshot; invitation without control; delegated click/type/navigation/scroll; takeover/revoke while a read or action awaits; no payload/next action after revoke; explicit expiry recovery; queued work after viewer closes and uncertain-step no replay. Confirm actual GO tool registration/service binding, not merely UI delegation.

On the intended Xiaomi, verify viewer interaction and lifecycle, owner takeover and unchanged GOVIEW data with a compatible data-preserving upgrade. Record device/OS/app-source versions and observed outcomes separately from CI. Credentials, signed URLs and page data must stay out of evidence.

These acceptance actions are unexecuted because this lane has no authorization for deployment, credentials or APK/device operations. No merge, deploy, release unlock, real transactions/data deletion, credentials, APK build/install/signing or production writes were performed here. No new service, cost or architecture was introduced.
