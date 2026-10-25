# GOVIEW typed transfer — local verification after independent review

Publication is held awaiting explicit owner approval for external GitHub publication. Remote checkpoint remains `2be838f6799cb927f940f21f3af21b830442a8e7`; no subsequent push, PR creation retry, merge or deployment was attempted. GO repository integration is assigned to the browser room; this lane has not edited it.

## Review fixes and regression evidence

- **Full-envelope readback:** publisher now compares schema, transferId, operation, payloadType, exact payload bytes/digest and every identity field. A substituted snapshotSha256 with otherwise matching proposal bytes/hash is rejected.
- **Reserve before Studio mutation:** a conditional typed-ID reservation and winner readback precede all canonical Studio writes. A losing snapshot/Studio cross-type race cannot write the canonical map, latest pointer or legacy transfer binding. Pending reservation is not success; GET verifies existing canonical bytes, legacy binding and index without mutation. An explicit identical PUT may resume the immutable reservation. Completed canonical writes with a lost response resolve by exact readback.
- Both new defect regressions **fail on archived checkpoint2be838f** and **pass on the local corrected source**. The concurrency test uses a promise barrier and a bounded timeout, not sleeps. Additional tests cover pending-role isolation and lost-response recovery.

## Completed local checks

Environment: Gradle8.11.1, Android SDK36, build-tools36.0.0, installed OpenJDK21 compiler/linker modules with temporary launchers outside the repository. No repository build or dependency versions changed. The JDK download endpoint returned403 and was not retried; existing local compiler modules supplied the needed tools. Gradle was configured to use the existing network proxy for official dependency repositories.

Command (using only local temporary SDK/toolchain/cache paths):

```
gradle --no-daemon --max-workers=2 -Pkotlin.compiler.execution.strategy=in-process \
  :app:compileDebugKotlin :app:testDebugUnitTest :app:compileDebugAndroidTestKotlin
```

Result: **BUILD SUCCESSFUL**, 165 JVM tests in44 suites, zero failures/errors/skips. XML readback confirms all4 GoviewSelectedTransferTest cases and all3 DirectRestartTest cases passed. Application and instrumentation Kotlin compilation passed; instrumentation execution was not performed.

```
node --test goview-package-bridge/tests/*.test.mjs \
  android-browser/tests/goview-package-bridge.test.mjs \
  android-browser/tests/goview-studio.test.mjs
```

Result: **38 tests passed**. `git diff --check` clean.

The cross-runtime JUnit test executes actual Kotlin storage/transfer orchestration against the actual Worker and GO bridge adapter through a loopback-only fixture with synthetic role tokens and memory object storage. It verifies selected upload, exact GO read, source-bound proposal, Android download, unchanged pins before approval, explicit local Update, separate device-report receipt, reopen, backup restore and retained rollback. This is protocol/storage evidence; it does not exercise production R2, the actual Android HTTP client on a phone, or public GO tool registration.

Local raw evidence: `/tmp/goview-kotlin/local-android-build.log`, `android-browser/app/build/test-results/testDebugUnitTest/TEST-*.xml`, `/tmp/goview-kotlin/local-reviewed-node.log`. No APK signing, installation, real GPS, real owner data, credential provisioning or production permission activation was performed.

## Coordination and remaining gates

Existing contract arguments remain unchanged for `goview_transfer_read`, `goview_transfer_publish`, and `goview_transfer_receipt`. GO publisher readback must match complete expected envelope identity. A503 reserved state means readback remains required, not that the operation is safely absent. Device receipt reports must remain explicitly non-independent evidence.

Remaining: independent re-review of the local corrections, completion/testing of the separately owned public GO registrations, external-publication approval, and separately authorized emulator/physical-device/live-runtime acceptance. Earlier PR261 CI does not validate this new typed-transfer implementation.
