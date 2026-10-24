# Observatory completion candidate

Built on PR 246 head 282944697da6032a455a360821d117b7659a03a4 (stacked on PR 245 01e45f62e11230a674734a93233f52a07118da9d).

## Why these changes

- Preserve the existing map store, AtomicFile readback, target-map version guard and exact preview-base comparison. Imported packages retain their exact bytes instead of being reserialized: full upload and device digests can now agree.
- Download requires map ID, exact version, full upload SHA-256 and transfer ID. The request never uses latest. Android validates both the response envelope and the independent expected artifact before preview.
- A private AtomicFile receipt records download and later owner-approved file readback separately. Map writes and receipt changes share the existing storage lock. Receipt export rereads current stored bytes and reports whether they still match. No automatic map, GPS, history or receipt upload.
- GO Brain gains two bounded map tools through a named service adapter. The receiver reuses existing package PUT/GET and R2 policies; no duplicate storage or transport architecture. Uncertain writes require exact-version readback before retry. Receiver entrypoint: GoviewGoBridge, method invoke. Brain binding GOVIEW_GO must target goview-package-bridge / GoviewGoBridge when separately authorized. No runtime binding has been added.
- About / Updates is reachable from Browser, GOVIEW build stamp and Studio. Public signer SHA-256, package/version, source commit, map schema/data versions and redacted last connection/error correlation are displayed. Copy is explicit owner action.
- Updates use HTTPS metadata, a bounded download, full APK digest, parsed archive package/version and actual signer equality with the installed app. Android installer is opened only after explicit owner consent and a fresh verification. No uninstall or data clearing. Changing/rotating signing identities is intentionally rejected.

## Update manifest (schema 1)

Owner-approved HTTPS hosting is needed to make a release discoverable. Paste its URL into About / Updates once; it is remembered. Accepted initial hosts: github.com, raw.githubusercontent.com, yggmetro.com and subdomains. GitHub release redirects are bounded to official asset hosts. No bearer credentials are attached.

Required JSON: schema (1), packageName (exact installed application ID), versionCode (higher integer), url (APK HTTPS URL), sha256 (64 lowercase hex), signerSha256 (64 lowercase hex of actual signing certificate), sourceCommit (40 lowercase hex).

The manifest is metadata, not an authorization to replace the installed signer. Historical ephemeral CI signers will usually fail the in-place upgrade check. Production signing requires an approved signer compatible with the installed app; this work creates none. The existing ARM64 CI artifact remains a side-by-side .preview package and does not automatically inherit original maps. CI emits APK SHA-256 and public signing reports; source commit is embedded in BuildConfig.

## Evidence / pending acceptance

Local JS tests cover storage contract, exact-version readback after latest advances, artifact mismatch and closed unconfigured receiver. JVM tests cover APK package/version/hash/signer mismatch and unsafe URLs. Instrumentation covers inactive B v5 with A open, incoming B v2 rejection, cancel, exact imported bytes, retained backup, same-version conflict, concurrent preview base and recreation. Android execution status must come from the exact-head CI run, not this document.

Not executed: map bucket/Worker provisioning, credentials, runtime service binding, deployment, production signer setup, merge, phone installation, real GO→R2→phone transfer, phone installer acceptance. Browser same-tab live acceptance is handled by parent and still requires owner invitation. None of these are implied by passing source tests.

## Review corrections

Transfer IDs now reserve an immutable `(mapId, version, full-byte SHA-256)` binding in the same R2 store through the existing versioned HTTP route. `x-goview-transfer-id` is optional for legacy clients and required by the new adapter/Android path. Same-ID retries must use the same artifact; a new version/content requires a new ID. Conditional creation plus readback handles competing reservations. A reservation is not an upload success: exact GET still verifies stored bytes. Neither Worker, adapter nor CLI trims package whitespace. CLI emits the chosen transfer ID before attempting PUT and accepts GOVIEW_TRANSFER_ID for a correlated retry after readback. Both caller and receiver check runtime string types, not regex coercion.

Receipt inspection offers an owner-selected list, including previously completed transfers; a downloaded/cancelled map without local storage shows NOT_SAVED and remains exportable. Tests use synthetic receipts and real receiver/Worker with memory R2, not production activation.
