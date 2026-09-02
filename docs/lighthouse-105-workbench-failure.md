# LIGHTHOUSE 1.0.5 Gate A diagnostic

Exit code: 1

## Failed tests
```text
1831-  duration_ms: 0.372104
1832-  type: 'test'
1833-  ...
1834-# Subtest: P1C107 semantic waiting directives are closed to the five approved UI types and numeric waiting maps to ENTER_VALUE without AI
1835-ok 305 - P1C107 semantic waiting directives are closed to the five approved UI types and numeric waiting maps to ENTER_VALUE without AI
1836-  ---
1837-  duration_ms: 0.603426
1838-  type: 'test'
1839-  ...
1840-# Subtest: P1C108 a real paused session carries the Architecture Lock minimum contract including durable baseRevision and semantic directive
1841-ok 306 - P1C108 a real paused session carries the Architecture Lock minimum contract including durable baseRevision and semantic directive
1842-  ---
1843-  duration_ms: 0.585062
1844-  type: 'test'
1845-  ...
1846-# Subtest: locked login surface exposes only password, sign in, and recovery entry actions
1847:not ok 307 - locked login surface exposes only password, sign in, and recovery entry actions
1848-  ---
1849-  duration_ms: 1.619713
1850-  type: 'test'
1851-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-login-ux.test.cjs:9:1'
1852-  failureType: 'testCodeFailure'
1853-  error: |-
1854-    The input did not match the regular expression /YGPH METROPOLIS/. Input:
1855-    
1856-    '<header class="appbar">\n' +
1857-      '    <div class="brand-lockup">\n' +
1858-      '      <button id="brandHomeControl" class="brand-home-control" type="button" data-command-destination="home" aria-label="หน้าหลัก" title="หน้าหลัก">\n' +
1859-      '        <span id="brandHomeMark" class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>\n' +
1860-      '        <svg id="brandBackIcon" class="brand-back-icon hidden" data-icon="arrow-left"></svg>\n' +
1861-      '      </button>\n' +
1862-      '      <strong>LIGHTHOUSE</strong>\n' +
1863-      '    </div>\n' +
1864-      '    <nav id="commandNav" class="command-nav hidden" aria-label="เมนูหลัก">\n' +
1865-      '      <button type="button" class="command-nav-btn" data-command-destination="store" aria-label="ร้านค้า" title="ร้านค้า"><svg data-icon="shopping-cart-simple"></svg></button>\n' +
1866-      '      <button type="button" class="command-nav-btn" data-command-destination="ride" aria-label="วิ่งงาน" title="วิ่งงาน"><svg data-icon="person-simple-run"></svg></button>\n' +
1867-      '      <button type="button" class="command-nav-btn" data-command-destination="finance" aria-label="การเงิน" title="การเงิน"><svg data-icon="wallet"></svg></button>\n' +
1868-      '      <button id="settingsBtn" type="button" class="command-nav-btn command-system-btn" aria-label="ตั้งค่า" title="ตั้งค่า"><svg data-icon="gear-six"></svg></button>\n' +
1869-      '    </nav>\n' +
1870-      '  '
1871-    
1872-  code: 'ERR_ASSERTION'
1873-  name: 'AssertionError'
1874-  expected:
1875-  actual: |-
--
2640-  duration_ms: 2.234659
2641-  type: 'test'
2642-  ...
2643-# Subtest: service worker no longer uses generic cache-first handling for every GET
2644-ok 432 - service worker no longer uses generic cache-first handling for every GET
2645-  ---
2646-  duration_ms: 0.242743
2647-  type: 'test'
2648-  ...
2649-# Subtest: every relative production module import is included in the production manifest
2650-ok 433 - every relative production module import is included in the production manifest
2651-  ---
2652-  duration_ms: 7.724244
2653-  type: 'test'
2654-  ...
2655-# Subtest: service-worker cache identity is coupled to the actual production asset revision
2656:not ok 434 - service-worker cache identity is coupled to the actual production asset revision
2657-  ---
2658-  duration_ms: 4.845742
2659-  type: 'test'
2660-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-service-worker.test.cjs:62:1'
2661-  failureType: 'testCodeFailure'
2662-  error: |-
2663-    update release assetRevision to sha256-a9d424898b0f3a2d
2664-    + actual - expected
2665-    
2666-    + 'sha256-d601a51c7ad830ff'
2667-    - 'sha256-a9d424898b0f3a2d'
2668-              ^
2669-    
2670-  code: 'ERR_ASSERTION'
2671-  name: 'AssertionError'
2672-  expected: 'sha256-a9d424898b0f3a2d'
2673-  actual: 'sha256-d601a51c7ad830ff'
2674-  operator: 'strictEqual'
2675-  stack: |-
2676-    TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-service-worker.test.cjs:64:10)
2677-    Test.runInAsyncScope (node:async_hooks:214:14)
2678-    Test.run (node:internal/test_runner/test:1047:25)
2679-    Test.processPendingSubtests (node:internal/test_runner/test:744:18)
2680-    Test.postRun (node:internal/test_runner/test:1173:19)
2681-    Test.run (node:internal/test_runner/test:1101:12)
2682-    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
2683-  ...
2684-# Subtest: offline shell is exactly the manifest production asset set except service worker itself
```

## Summary tail
```text
ok 476 - obligation payment rejects a Calendar queue belonging to a different obligation and writes nothing
  ---
  duration_ms: 455.316827
  type: 'test'
  ...
# Subtest: sale workflow rejects projected Store stock below zero and writes nothing
ok 477 - sale workflow rejects projected Store stock below zero and writes nothing
  ---
  duration_ms: 489.062274
  type: 'test'
  ...
# Subtest: withdrawal workflow rejects projected Store stock below zero and writes nothing
ok 478 - withdrawal workflow rejects projected Store stock below zero and writes nothing
  ---
  duration_ms: 461.050526
  type: 'test'
  ...
# Subtest: negative adjustment workflow rejects projected Store stock below zero and writes nothing
ok 479 - negative adjustment workflow rejects projected Store stock below zero and writes nothing
  ---
  duration_ms: 460.852987
  type: 'test'
  ...
# Subtest: Store workflow allows final projected stock exactly zero
ok 480 - Store workflow allows final projected stock exactly zero
  ---
  duration_ms: 635.408695
  type: 'test'
  ...
# Subtest: Store workflow may repair a negative imported baseline when the committed final stock is non-negative
ok 481 - Store workflow may repair a negative imported baseline when the committed final stock is non-negative
  ---
  duration_ms: 639.51756
  type: 'test'
  ...
# Subtest: Settings is a grouped utility index instead of a fifth working house
ok 482 - Settings is a grouped utility index instead of a fifth working house
  ---
  duration_ms: 1.744936
  type: 'test'
  ...
# Subtest: Backup Import and Restore remain separate concepts and latest backup is only recorded after success
ok 483 - Backup Import and Restore remain separate concepts and latest backup is only recorded after success
  ---
  duration_ms: 0.521934
  type: 'test'
  ...
# Subtest: normal APK update view stays human-facing while Web cache status is advanced
ok 484 - normal APK update view stays human-facing while Web cache status is advanced
  ---
  duration_ms: 1.341974
  type: 'test'
  ...
# Subtest: Reset All lives only in Advanced Danger Zone and clears local Settings metadata
ok 485 - Reset All lives only in Advanced Danger Zone and clears local Settings metadata
  ---
  duration_ms: 0.521934
  type: 'test'
  ...
# Subtest: permission area never fabricates Android permission truth
ok 486 - permission area never fabricates Android permission truth
  ---
  duration_ms: 0.416337
  type: 'test'
  ...
# Subtest: Settings utility has dedicated presentation styling
ok 487 - Settings utility has dedicated presentation styling
  ---
  duration_ms: 0.292305
  type: 'test'
  ...
1..487
# tests 487
# suites 0
# pass 485
# fail 2
# cancelled 0
# skipped 0
# todo 0
# duration_ms 55271.559461
```
