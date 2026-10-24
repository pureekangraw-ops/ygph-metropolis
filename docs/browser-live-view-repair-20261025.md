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
GO Direct connection, Package download history. Lane A's existing
`goview-studio-map-library` endpoint/endpointStatus/transferId are read unchanged;
parent must coordinate any new Direct fields before integration. Lane B does not
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
