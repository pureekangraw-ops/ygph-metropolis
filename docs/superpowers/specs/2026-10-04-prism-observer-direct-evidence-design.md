# PRISM Browser Observer direct evidence — design for review

Date: 2026-10-04
Status: IMPLEMENTED IN MAIN — runtime transport/build verified; physical owner-device page acceptance remains WAIT VERIFY
Work: WORK-FINISH-PRISM-WEB-EYE-20261004-20261004-001
Checkpoint: CP-WORK-FINISH-PRISM-WEB-EYE-20261004-20261004-001
Tablet: TABLET:0410-9SPT

## Requested result
GO can read fresh evidence from the actual page open in BIG's PRISM Browser. Evidence must identify PRISM as the producer, retain the existing Work identity, and distinguish local browser status from observed page content.

## Governing boundary
Agent Mission initialContext says: "Factory Eye talks to PRISM directly; GO Hub receives only evidence/audit bound to Work/Checkpoint and is not the middle pipe for viewing the web."
PRISM remains the native browser. Factory owns the shared observation capability and evidence custody. Hub exposes governed evidence/audit readback. No navigation, click, typing or scrolling authority is added.

## Consolidation readback — 2026-10-05
- PRISM app, Android Browser, local Browser Eye, Factory Eye transport and GO readback are one PRISM product lineage with separate authority lanes.
- Current main baseline: `cd5d506b1412ff9d36e9946a28bee20eccc82598`.
- PR #208 merged direct PRISM page-evidence publication to Factory.
- PR #209 merged Browser/Gecko lifecycle stability across Android backgrounding.
- Main PRISM Owner Build run `37200280124` passed on the current baseline.
- Historical open PRs #179, #183, #194 and #199 are diverged from current main and must not be merged over newer PRISM truth; their remaining requirements are reconciled against main instead.
- PR #181 is historical observer-ownership cleanup. Current architecture keeps the local Browser Eye in PRISM while Factory owns shared observation/evidence custody.
- Physical owner-device acceptance is still required before claiming the complete Web Eye result DONE.

## Verified starting point
- PRISM main inspected at 11f1e39b931cab9fcd3d893ff3f0e2c375c7410f.
- PR #205 intentionally removes the embedded Factory Eye producer and preserves the local PRISM Browser observer.
- PR #207 is merged; its five-second shell polling refreshes local status independently of Hub events.
- PrismBrowserActivity records URL, event, active tab and capture time in local preferences. It does not capture semantic page content or screenshots.
- PrismObserverService records local liveness and explicitly declares "no remote producer route".
- prism/hub-bridge.mjs already exports local browserEvidence in the existing paired Control Port state. Therefore the earlier claim that PRISM has no outbound path at all was too broad. This metadata path does not prove a page observation.
- Factory source inspected at 0d08d8502023ae3d777e638d3982eb10555ba7d3. Its Firefox observer documents a Hub ingress. cloudflare/worker.mjs does not expose a dedicated direct PRISM observation ingress or consumer readback.
- GO readback returned an older Firefox add-on observation, not proof of PRISM. It was STALE. No fresh PRISM destination proof exists.

## Recommended architecture
Reuse Factory's bounded semantic observer capability under its existing ownership. Add a direct, authenticated PRISM adapter to the Factory evidence service. Do not restore the removed Firefox extension and its Hub producer registration inside PRISM.

Flow:
1. BIG enables observation for an existing Work and Checkpoint in PRISM.
2. The actual selected, visible HTTP/HTTPS Gecko session captures bounded page evidence through the Factory-owned observer capability.
3. PRISM sends the observation directly to the Factory service.
4. Factory validates producer/session/tab/sequence/expiry and persists evidence with a receipt.
5. Hub's governed readback retrieves the same Work-bound Factory evidence; it does not relay browser commands.
6. GO confirms matching producer, URL, observation ID and capture time. GO reports LIVE only while evidence is fresh.

The existing local Browser Eye stays independent. A local heartbeat never proves page capture or successful remote publication.

## Contract
Observation fields: schemaVersion, source=PRISM_BROWSER, adapterId, sessionId, workId, checkpointId, observationId, monotonic sequence, capturedAt, receivedAt, activeTabId, observationTabId, page URL/title, documentVisible, contentGeneration, observerVersion, bounded semantic summary, optional consented screenshot reference, capturesInputValues=false, createsAuthority=false.
Factory binds Work context to the issued observer session. It rejects payloads that change Work identity or producer identity. Duplicate observation IDs are idempotent only for identical payloads.

Readback includes explicit capture, transport and freshness states. A prior Firefox observation cannot silently substitute for a requested PRISM observation. Heartbeat and page generation are evaluated separately.

## Privacy and authority
Use the existing native credential store for a scoped observer credential; never embed owner passcodes, Hub credentials or shared server secrets in source or page scripts.
Credentials are issued and revoked at the Factory boundary. Pairing requires owner authority, is restricted to observation, expires and is bound to the approved Work.
Do not capture password/OTP/payment/private editor/input values. Use Factory's bounded sanitizer before upload and validate again on receipt. Strip URL credentials and sensitive query/fragment values.
Screenshots require explicit capture consent. Screenshot refusal or failure leaves semantic evidence usable but screenshot status UNKNOWN; it never yields a fake image.
Capture only the selected visible ordinary web page. Unsupported Gecko/privileged pages are reported UNSUPPORTED.

## Failure handling
States distinguish LOCAL_ONLY, PAIRING_REQUIRED, CAPTURE_PENDING, PUBLISHED, STALE, OFFLINE, UNSUPPORTED and REJECTED.
Android process death, hidden tabs and suspended content scripts stop LIVE claims. Bounded retry uses the same observation ID; no unbounded queue and no background synthetic page observation.
Readback must not select a globally latest session across different producers or Works.

## Alternatives considered
- Restore the old embedded Firefox Factory Eye → Hub producer: rejected because it reverses PR #205 and the governing direct boundary.
- Forward only local preferences through Control Port: available for status/audit but insufficient for actual page visibility.
- Direct PRISM → Factory adapter with Hub evidence readback: recommended because it preserves ownership and provides explicit producer provenance.

## Implementation sequence after design review
1. Verify canonical runtime deployment and Factory evidence storage ownership; obtain the existing authorised observer credential issuance contract.
2. Add scoped direct Factory observation ingress/receipt/readback with producer and Work binding.
3. Integrate the Factory-owned semantic capability with the existing Gecko session and native consent/credential bridge.
4. Add PRISM status and pairing controls; preserve local Browser Eye and the existing metadata/audit export.
5. Connect Hub's existing observer readback to the explicit PRISM producer without Firefox fallback.
6. Run focused tests, source/build gates and exact-head CI; produce the owner APK through the existing build workflow.
7. Require physical Android evidence: BIG opens a specified URL, GO reads the matching observation, changes page/tab, GO reads the matching new observation; hide/close/kill tests must invalidate LIVE.

## Validation and completion
Tests must cover wrong Work/producer rejection, revoked/expired credentials, duplicate/conflicting IDs, tab mismatch, hidden page, stale capture with fresh heartbeat, partial screenshot, sensitive fields/URLs, offline bounded retry and Android recovery.
CI proves its tested scope, not physical Android acceptance.
DONE requires fresh PRISM-origin page evidence read back by GO for the same Work and Checkpoint. Until then report WAIT VERIFY or UNKNOWN.

## Current unknowns
Installed APK version on BIG's device; physical Gecko capture support; canonical direct Factory runtime endpoint; credential issuance authority; production storage binding; deployed Hub source version.
These are not filled using Firefox evidence or inferred from a successful APK build.
