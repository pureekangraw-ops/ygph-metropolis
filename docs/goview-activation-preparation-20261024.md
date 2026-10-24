# GOVIEW activation preparation — 2026-10-24

Status: read-only preparation; no activation authorization received or executed. This document accompanies tested Observatory source `8949e8629219185ca3d8ef80952b0c1746646f5a` and GO source `68eaba090572a0d8a33c0fb4d20c77e0156036ee`. Any combined Factory/GO candidate must be pinned and reviewed separately before deployment.

## Actual account inventory

Supported Cloudflare connector GETs inspected account `e100c4619cd8f6eff0ce6603756bc439` without returning secret values:

- Worker listing: 16 scripts, including `go-together` and `observatory-shared-browser`; no `goview-package-bridge`.
- R2 listing: five buckets (`factory`, `factory-district-preview`, `ygg-office-assets`, `ygg-shop`, `yggmetro-shop-sandbox-downloads`); no `ygg-goview-packages`.
- `go-together` settings: existing `OBSERVATORY_GO` service binding to `observatory-shared-browser` / `ObservatoryGoBridge`; no `GOVIEW_GO`. Existing other bindings must be preserved.
- Account default usage model and relevant Worker usage models: `standard`. This does not establish the subscription tier or remaining allowance.
- R2 account metrics: Standard published 143 objects, payload 409,804 bytes and metadata 13,641 bytes; uploaded and Infrequent Access counters zero. These are storage observations, not monthly request usage or free-tier headroom.

Exact unavailable reads: GET `/accounts/{account_id}/subscriptions` and GET `/accounts/{account_id}/billing/usage` returned HTTP 403, error 10000 Authentication error. Connector reported no OAuth scope supports these endpoints. These reads were denied; no billing change occurred. They were not retried with alternate credentials. Actual subscription, monthly request/CPU usage, shared allowance remaining and spending controls remain UNKNOWN. Owner can confirm non-secret figures in the dashboard; do not paste an account token into chat or expand permissions as a workaround.

## Minimal activation design and why

Reuse the existing versioned Worker PUT/GET and full-byte readback contract. Add private Standard bucket `ygg-goview-packages` bound as `PACKAGES` to new Worker `goview-package-bridge` using `wrangler.goview.json` and RPC entrypoint `GoviewGoBridge`. Add only `GOVIEW_GO` on the selected reviewed `go-together` deployment, pointing to that entrypoint. Existing Brain OAuth authenticates GO callers; the service binding transports server calls without another client token copy. This completes the missing runtime connection without a second map backend or a public R2 bucket.

The tested adapter still uses Worker-only `GO_WRITE_TOKEN` internally; configure it securely after approval. Android HTTP download requires a distinct read-only `ANDROID_READ_TOKEN`. Existing Brain OAuth does not currently authenticate that Android download. Owner must supply the Android credential locally through an approved secure process, never through chat, package contents or logs. No Cloudflare account token, R2 S3 key, browser owner token or persistent signing key is needed in the APK. Credential configuration itself is not yet approved.

Exposure: `workers_dev: true` creates a public HTTPS Worker endpoint with authenticated map GET/PUT; R2 stays private. Unauthenticated traffic can still invoke the Worker and incur request costs. Health/readiness and endpoint identity are public service metadata. Do not upload owner GPS/history, enable public bucket access, add domains, broaden OAuth permissions or log package/credential contents. Retain the existing browser binding and all unrelated GO bindings.

## Budget assumptions

Current published R2 Standard allowances are 10 GB-month, one million Class A and ten million Class B operations monthly; overages are $0.015/GB-month, $4.50/million A and $0.36/million B, with billing-unit rounding. These shared allowances cannot be inferred from current stored bytes. [R2 pricing](https://developers.cloudflare.com/r2/pricing/).

Service bindings add no separate request charge under Workers Standard billing, but CPU across the services still counts. Existing account traffic, plan fees and overages remain relevant. Per-invocation CPU limits are not a total-spend cap. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

Proposed authorization ceiling: $0 incremental spend, no plan/subscription upgrades. This is a spending instruction, **not a provider-enforced guarantee**. Before activation, owner must confirm existing plan/headroom and suitable controls; if the ceiling cannot be supported, stop and obtain a revised explicit budget rather than claim free operation. Public unsolicited traffic and retained storage prevent a hard-zero guarantee from the current source alone.

## One proposed owner approval request — not yet granted

> Approve one controlled synthetic GOVIEW activation in the existing Cloudflare account, conditional on confirming the $0 incremental-spend constraint: create private Standard `ygg-goview-packages`; securely configure separate Worker write and Android read credentials; deploy the reviewed map Worker; deploy a pinned reviewed GO candidate with only the added `GOVIEW_GO` integration while preserving other bindings; and run a single synthetic package transfer (at most 1 MiB, no owner data) with exact-version/full-SHA/transfer-ID readback. Limit controlled validation to at most 100 Worker requests, 100 Class A and 100 Class B operations within 24 hours, with no polling. If an independently verified compatible APK is already installed with separate owner consent, allow its manual download, preview, explicit Save, receipt/export and restart checks; otherwise stop at server readback. If validation or budget conditions fail, disable the new public endpoint, remove the new GO binding or restore the recorded previous GO deployment, and revoke the new credentials, preserving map objects and local backups. No merge, handset installation, uninstall, data clearing, stable signing key, private-map upload, billing change or unrelated permission change is included.

This request is intentionally conditional, not executable approval. The parent explicitly required owner approval before provisioning, credentials or deployment. APK installation remains a separate owner-controlled action; artifact access and independent verification must be resolved legitimately first.

## Acceptance and rollback evidence to collect after approval

Record previous GO version/binding names without secrets before mutation. Record deployed source/version IDs and private-bucket status. Use a unique synthetic map ID and transfer ID, record exact original UTF-8 byte count/SHA, publish, then GET that exact version and compare bytes. Same transfer ID retry must return the same artifact; changed content under that ID must reject. A server readback is not Android acceptance.

On an authorized installed device, enter expected map ID/version/SHA/transfer ID, download, inspect Preview, explicitly Save, export the correlated saved receipt and package, compare full digest and verify after restart. Cancel must not count as saved. Keep receipts and failed evidence; do not automatically retry uncertain saves. Browser same-tab invitation acceptance is coordinated separately by parent.

Rollback disables exposure and credentials, preserves immutable packages/receipts and local backups, and restores only the prior GO deployment/binding configuration if changed. Preserve unrelated concurrent changes; do not delete buckets or owner data as cleanup. Confirm the actual resulting state after every rollback action.
