# Browser Live View repair candidate (Lane B)

Base main abb5c36258859c0282c26b645977a35036cecef6. Existing Browser implementation
matches deployed source 9b31c1e50510685f2d80d33a8a9923cecbd62038. This patch fixes
validated source defects; it does not establish the phone's original root cause.
No live browser/session operation, credential change, signing change or deploy.

## Behavior

- A saved exact target is mandatory. Missing target never selects another tab,
  even when that tab is the only page or has the same hostname.
- Owner/GO authentication is unchanged. Owner Live View does not require GO read
  permission; GO tokens remain denied before provider access.
- View failures distinguish session/connect/target/CDP/provider/response stages.
  Only fixed safe codes reach the phone. Unexpected upstream exception text,
  credentials, private page addresses and signed Live View URLs are not logged.
- Client generates a UUID before each request and sends X-Request-ID. Worker
  validates/echoes it; view logs contain only event name, UUID and HTTP status.
  Phone displays whether server echo was confirmed. Network failure's local ID
  is not presented as confirmed server receipt.
- Session polling cannot overwrite the separate Live View result. Diagnostics
  explicitly describes request success, not live session health.

## Field contract for parent / Lane A

Lane B owns observatory-remote-ui preferences with prefixes browser-view,
browser-session, browser-command. Each has suffixes -status, -request-id, -time
(UTC ISO), -method, -path, -http, -server-correlated (boolean). Values contain no
request/response body. Old diagnostic-status/diagnostic-id are not used as proof.

AppMaintenanceActivity displays three separate sections: Browser request results,
GO Direct connection, Package download history. The `goview-studio-map-library` endpoint/endpointStatus/transferId remain historical
package download fields, never GO Direct status. Lane A at 70cff432 uses
`goview-direct-connection.authRejected` (boolean). Diagnostics reads only that
nonsecret flag: true means AUTH_REJECTED_RECONNECT_REQUIRED; false/missing means
NOT_VERIFIED, not CONNECTED. No network or credential read occurs in diagnostics.
Parent must coordinate any further Direct fields before integration. Lane B does not
edit GoviewDirectClient, OutsideViewActivity, signing/build policy, or user data.

## Verification and release limits

Synthetic Worker tests execute actual Worker/DO methods with mocked provider and
storage: owner GO OFF/ON, missing/invalid auth, GO token rejection, missing exact
target, stage failures, malformed/oversized body, redacted output/logs and shared
correlation. JVM tests cover allowlisted bounded error parsing, multibyte limits,
malformed/oversized error bodies and independent polling/view diagnostic slots.
No synthetic test proves real Cloudflare session health or handset acceptance.

Local environment has no Gradle executable; Android compilation/JVM and packaging
are verified by the existing PR CI. Do not integrate until exact-head CI and
independent review pass. This is a Draft PR, not deployment approval.

Release coordination: the new client expects X-Request-ID echo, so deploy the
reviewed Worker before distributing this APK in an independently approved release.
An old Worker produces STATION_CORRELATION_UNVERIFIED rather than a false success.
No automatic session recreation, permission widening or token rotation is used.

## Preserve intended GO use and explicit recovery

Owner's clarification: this repair must retain authorized GO website use and map
access. The affected suite now covers real Worker routes with a synthetic provider:
GO observe + same-grant navigation succeed; uninvited reads, observer control,
changed-origin reads and out-of-grant navigation remain denied. Owner revocation
stops later GO access. Missing target does not trigger automatic recreation; the
existing explicit owner URL-open action creates/selects a fresh target and resets
GO grants, after which owner explicitly grants GO control and observe works again.
This is recovery by owner-selected URL, not silent selection of an unrelated tab.
GOVIEW/manual maps and Lane A implementation are unchanged.

First run of the new tests used .test hosts, correctly rejected by the existing
public-site policy. Fixtures now use example.com/different.com with NO network;
policy was not loosened. Final affected suite: 9/9 pass.

Still required after independent review and separately approved release: on the
phone, open a permitted public site as BIG, obtain Live View, grant GO observe,
then control; verify the same selected tab, authorized navigation and owner
revocation. Exercise target-loss recovery only in an authorized test session.
Verify a failed Live View remains visible after successful polling and correlate
its request ID with sanitized Worker metadata. Check manual map use and approved
GO map access with Lane A's acceptance procedure. No phone/production acceptance
has been performed by this room, and passing fixtures does not resolve the
original handset error by itself.
