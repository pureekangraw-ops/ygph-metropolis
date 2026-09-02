# LIGHTHOUSE 1.0.5 Android updater diagnostic

```text
  duration_ms: 3.731221
  type: 'test'
  ...
# Subtest: historical key-1 sample remains evidence but is not trusted by current key-3 APK
ok 124 - historical key-1 sample remains evidence but is not trusted by current key-3 APK
  ---
  duration_ms: 7.773862
  type: 'test'
  ...
# Subtest: signPatchSource creates a bundle verifiable by the matching public key
ok 125 - signPatchSource creates a bundle verifiable by the matching public key
  ---
  duration_ms: 12.100452
  type: 'test'
  ...
# Subtest: package exposes manual patch signing and repository web/tool files contain no private PEM
ok 126 - package exposes manual patch signing and repository web/tool files contain no private PEM
  ---
  duration_ms: 42.34676
  type: 'test'
  ...
# Subtest: memory store treats a staged snapshot version as immutable
ok 127 - memory store treats a staged snapshot version as immutable
  ---
  duration_ms: 3.089924
  type: 'test'
  ...
# Subtest: IndexedDB get/compare/insert keeps a staged snapshot version immutable
ok 128 - IndexedDB get/compare/insert keeps a staged snapshot version immutable
  ---
  duration_ms: 13.69585
  type: 'test'
  ...
# Subtest: APK publish contract uses immutable repository assets and never GitHub Release downloads
ok 129 - APK publish contract uses immutable repository assets and never GitHub Release downloads
  ---
  duration_ms: 8.63359
  type: 'test'
  ...
# Subtest: APK publish contract verifies Raw bytes before opening lighthouse-update manifest
ok 130 - APK publish contract verifies Raw bytes before opening lighthouse-update manifest
  ---
  duration_ms: 2.721197
  type: 'test'
  ...
# Subtest: Settings derives determinate progress only from real byte counts
ok 131 - Settings derives determinate progress only from real byte counts
  ---
  duration_ms: 8.854834
  type: 'test'
  ...
# Subtest: Settings distinguishes waiting for Android from installed readback
ok 132 - Settings distinguishes waiting for Android from installed readback
  ---
  duration_ms: 1.807077
  type: 'test'
  ...
# Subtest: trusted bootstrap exposes only chat-gated Brain capability and preserves durable readback
ok 133 - trusted bootstrap exposes only chat-gated Brain capability and preserves durable readback
  ---
  duration_ms: 3465.023264
  type: 'test'
  ...
# Subtest: cold reopen exposes a truthful durable restore witness without replaying chat history
ok 134 - cold reopen exposes a truthful durable restore witness without replaying chat history
  ---
  duration_ms: 2365.231639
  type: 'test'
  ...
# Subtest: reopen while confirmation is pending fails closed and cannot execute stale pending work
ok 135 - reopen while confirmation is pending fails closed and cannot execute stale pending work
  ---
  duration_ms: 2430.43693
  type: 'test'
  ...
# Subtest: stable APK entry goes through trusted bootstrap before Patch runtime
ok 136 - stable APK entry goes through trusted bootstrap before Patch runtime
  ---
  duration_ms: 2.581777
  type: 'test'
  ...
# Subtest: ข้าว 65 stays READY without a write until explicit execute, then durable readback survives reopen
ok 137 - ข้าว 65 stays READY without a write until explicit execute, then durable readback survives reopen
  ---
  duration_ms: 2650.88908
  type: 'test'
  ...
# Subtest: ข้าว 1,50 waits for owner correction, returns READY without writing, then executes the corrected amount
ok 138 - ข้าว 1,50 waits for owner correction, returns READY without writing, then executes the corrected amount
  ---
  duration_ms: 2552.426272
  type: 'test'
  ...
# Subtest: concurrent execute writes once and replay after SUCCESS is blocked
ok 139 - concurrent execute writes once and replay after SUCCESS is blocked
  ---
  duration_ms: 2372.937809
  type: 'test'
  ...
# Subtest: chat-native cancel is the only denial path and never exposes execute
ok 140 - chat-native cancel is the only denial path and never exposes execute
  ---
  duration_ms: 1706.056577
  type: 'test'
  ...
# Subtest: chat-native approval is the only path from pending to durable SUCCESS and replay fails closed
ok 141 - chat-native approval is the only path from pending to durable SUCCESS and replay fails closed
  ---
  duration_ms: 1940.201579
  type: 'test'
  ...
# Subtest: unrelated text while pending fails closed and preserves the original pending command
ok 142 - unrelated text while pending fails closed and preserves the original pending command
  ---
  duration_ms: 1700.841204
  type: 'test'
  ...
# Subtest: malicious Patch cannot obtain raw execute or a second confirmation seam
ok 143 - malicious Patch cannot obtain raw execute or a second confirmation seam
  ---
  duration_ms: 1200.749249
  type: 'test'
  ...
# Subtest: trusted brain packaging copies audited root Brain/Greenfield sources exactly into non-patchable generated source
ok 144 - trusted brain packaging copies audited root Brain/Greenfield sources exactly into non-patchable generated source
  ---
  duration_ms: 72.541002
  type: 'test'
  ...
# Subtest: npm test prepares trusted source and generated source is excluded from Git history
ok 145 - npm test prepares trusted source and generated source is excluded from Git history
  ---
  duration_ms: 1.889431
  type: 'test'
  ...
# Subtest: Front Door 0.0.5 renders trusted confirmation as chat text and uses the same composer for approval
ok 146 - Front Door 0.0.5 renders trusted confirmation as chat text and uses the same composer for approval
  ---
  duration_ms: 118.567939
  type: 'test'
  ...
# Subtest: trusted gate accepts only chat answer ยืนยัน as approval
ok 147 - trusted gate accepts only chat answer ยืนยัน as approval
  ---
  duration_ms: 0.61617
  type: 'test'
  ...
# Subtest: trusted gate maps unsupported commands to public 404 and records the private cause with Bangkok time
ok 148 - trusted gate maps unsupported commands to public 404 and records the private cause with Bangkok time
  ---
  duration_ms: 14.327083
  type: 'test'
  ...
# Subtest: actual trusted session keeps error statistics encrypted without changing business revision
ok 149 - actual trusted session keeps error statistics encrypted without changing business revision
  ---
  duration_ms: 1431.515536
  type: 'test'
  ...
# Subtest: buildUpdateMetadata emits compatible verified read-only manifest from final APK evidence
ok 150 - buildUpdateMetadata emits compatible verified read-only manifest from final APK evidence
  ---
  duration_ms: 10.334858
  type: 'test'
  ...
# Subtest: metadata generator rejects non-HTTPS URL, signer mismatch and evidence hash mismatch
ok 151 - metadata generator rejects non-HTTPS URL, signer mismatch and evidence hash mismatch
  ---
  duration_ms: 5.594584
  type: 'test'
  ...
1..151
# tests 151
# suites 0
# pass 126
# fail 25
# cancelled 0
# skipped 0
# todo 0
# duration_ms 15681.673937
```
