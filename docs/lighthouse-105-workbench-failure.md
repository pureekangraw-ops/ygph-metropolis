# LIGHTHOUSE 1.0.5 Gate A diagnostic

Exit code: 1

## Failed tests
```text
1585-  duration_ms: 1199.756191
1586-  type: 'test'
1587-  ...
1588-# Subtest: MG03 unsupported group blocks an otherwise supported plan before any durable mutation
1589-ok 264 - MG03 unsupported group blocks an otherwise supported plan before any durable mutation
1590-  ---
1591-  duration_ms: 578.041243
1592-  type: 'test'
1593-  ...
1594-# Subtest: MG05 plan retry after lost response returns COMPLETE from durable evidence without duplicate mutation
1595-ok 265 - MG05 plan retry after lost response returns COMPLETE from durable evidence without duplicate mutation
1596-  ---
1597-  duration_ms: 1576.518061
1598-  type: 'test'
1599-  ...
1600-# Subtest: LIGHTHOUSE owns one top-level navigation state and destination registry
1601:not ok 266 - LIGHTHOUSE owns one top-level navigation state and destination registry
1602-  ---
1603-  duration_ms: 3.135159
1604-  type: 'test'
1605-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-navigation.test.cjs:8:1'
1606-  failureType: 'testCodeFailure'
1607-  error: |-
1608-    The input did not match the regular expression /const MANUAL_DESTINATIONS = Object\.freeze\(/. Input:
1609-    
1610-    "import { hydrateIcons } from './icons.mjs';\n" +
1611-      '\n' +
1612-      "const PAGE = Object.freeze({ CHAT:'chat', MANUAL:'manual', SETTINGS:'settings' });\n" +
1613-      'const $ = id => document.getElementById(id);\n' +
1614-      '\n' +
1615-      'function ensureStylesheet() {\n' +
1616-      "  if (document.querySelector('link[data-lighthouse-style]')) return;\n" +
1617-      "  const link = document.createElement('link');\n" +
1618-      "  link.rel = 'stylesheet';\n" +
1619-      "  link.href = './lighthouse.css';\n" +
1620-      "  link.dataset.lighthouseStyle = 'true';\n" +
1621-      '  document.head.append(link);\n' +
1622-      '}\n' +
1623-      '\n' +
1624-      'function applyBrand() {\n' +
1625-      "  document.title = 'LIGHTHOUSE';\n" +
1626-      `  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#eaf3f9');\n` +
1627-      "  const title = document.querySelector('.brand-lockup strong');\n" +
1628-      "  if (title) title.textContent = 'LIGHTHOUSE';\n" +
1629-      "  const mark = $('brandHomeMark');\n" +
--
2003-        observer.disconnect();
2004-      });
2005-      observer.observe(document.documentElement, { childList:true, subtree:true });
2006-    }
2007-    
2008-    boot();
2009-    
2010-  operator: 'match'
2011-  stack: |-
2012-    TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-navigation.test.cjs:10:10)
2013-    Test.runInAsyncScope (node:async_hooks:214:14)
2014-    Test.run (node:internal/test_runner/test:1047:25)
2015-    Test.start (node:internal/test_runner/test:944:17)
2016-    startSubtestAfterBootstrap (node:internal/test_runner/harness:296:17)
2017-  ...
2018-# Subtest: browser or Android back restores the same LIGHTHOUSE navigation stack
2019:not ok 267 - browser or Android back restores the same LIGHTHOUSE navigation stack
2020-  ---
2021-  duration_ms: 2.084756
2022-  type: 'test'
2023-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-navigation.test.cjs:17:1'
2024-  failureType: 'testCodeFailure'
2025-  error: |-
2026-    The input did not match the regular expression /addEventListener\('popstate'/. Input:
2027-    
2028-    "import { hydrateIcons } from './icons.mjs';\n" +
2029-      '\n' +
2030-      "const PAGE = Object.freeze({ CHAT:'chat', MANUAL:'manual', SETTINGS:'settings' });\n" +
2031-      'const $ = id => document.getElementById(id);\n' +
2032-      '\n' +
2033-      'function ensureStylesheet() {\n' +
2034-      "  if (document.querySelector('link[data-lighthouse-style]')) return;\n" +
2035-      "  const link = document.createElement('link');\n" +
2036-      "  link.rel = 'stylesheet';\n" +
2037-      "  link.href = './lighthouse.css';\n" +
2038-      "  link.dataset.lighthouseStyle = 'true';\n" +
2039-      '  document.head.append(link);\n' +
2040-      '}\n' +
2041-      '\n' +
2042-      'function applyBrand() {\n' +
2043-      "  document.title = 'LIGHTHOUSE';\n" +
2044-      `  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#eaf3f9');\n` +
2045-      "  const title = document.querySelector('.brand-lockup strong');\n" +
2046-      "  if (title) title.textContent = 'LIGHTHOUSE';\n" +
2047-      "  const mark = $('brandHomeMark');\n" +
--
2423-      observer.observe(document.documentElement, { childList:true, subtree:true });
2424-    }
2425-    
2426-    boot();
2427-    
2428-  operator: 'match'
2429-  stack: |-
2430-    TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-navigation.test.cjs:18:10)
2431-    Test.runInAsyncScope (node:async_hooks:214:14)
2432-    Test.run (node:internal/test_runner/test:1047:25)
2433-    Test.processPendingSubtests (node:internal/test_runner/test:744:18)
2434-    Test.postRun (node:internal/test_runner/test:1173:19)
2435-    Test.run (node:internal/test_runner/test:1101:12)
2436-    async startSubtestAfterBootstrap (node:internal/test_runner/harness:296:3)
2437-  ...
2438-# Subtest: manual destinations are registered rather than free-form route strings
2439:not ok 268 - manual destinations are registered rather than free-form route strings
2440-  ---
2441-  duration_ms: 0.766622
2442-  type: 'test'
2443-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-navigation.test.cjs:23:1'
2444-  failureType: 'testCodeFailure'
2445-  error: |-
2446-    The input did not match the regular expression /finance:/. Input:
2447-    
2448-    "import { hydrateIcons } from './icons.mjs';\n" +
2449-      '\n' +
2450-      "const PAGE = Object.freeze({ CHAT:'chat', MANUAL:'manual', SETTINGS:'settings' });\n" +
2451-      'const $ = id => document.getElementById(id);\n' +
2452-      '\n' +
2453-      'function ensureStylesheet() {\n' +
2454-      "  if (document.querySelector('link[data-lighthouse-style]')) return;\n" +
2455-      "  const link = document.createElement('link');\n" +
2456-      "  link.rel = 'stylesheet';\n" +
2457-      "  link.href = './lighthouse.css';\n" +
2458-      "  link.dataset.lighthouseStyle = 'true';\n" +
2459-      '  document.head.append(link);\n' +
2460-      '}\n' +
2461-      '\n' +
2462-      'function applyBrand() {\n' +
2463-      "  document.title = 'LIGHTHOUSE';\n" +
2464-      `  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#eaf3f9');\n` +
2465-      "  const title = document.querySelector('.brand-lockup strong');\n" +
2466-      "  if (title) title.textContent = 'LIGHTHOUSE';\n" +
2467-      "  const mark = $('brandHomeMark');\n" +
```

## Summary tail
```text
ok 479 - obligation payment rejects a Calendar queue belonging to a different obligation and writes nothing
  ---
  duration_ms: 455.502015
  type: 'test'
  ...
# Subtest: sale workflow rejects projected Store stock below zero and writes nothing
ok 480 - sale workflow rejects projected Store stock below zero and writes nothing
  ---
  duration_ms: 465.891338
  type: 'test'
  ...
# Subtest: withdrawal workflow rejects projected Store stock below zero and writes nothing
ok 481 - withdrawal workflow rejects projected Store stock below zero and writes nothing
  ---
  duration_ms: 458.706242
  type: 'test'
  ...
# Subtest: negative adjustment workflow rejects projected Store stock below zero and writes nothing
ok 482 - negative adjustment workflow rejects projected Store stock below zero and writes nothing
  ---
  duration_ms: 457.880991
  type: 'test'
  ...
# Subtest: Store workflow allows final projected stock exactly zero
ok 483 - Store workflow allows final projected stock exactly zero
  ---
  duration_ms: 644.937277
  type: 'test'
  ...
# Subtest: Store workflow may repair a negative imported baseline when the committed final stock is non-negative
ok 484 - Store workflow may repair a negative imported baseline when the committed final stock is non-negative
  ---
  duration_ms: 658.958235
  type: 'test'
  ...
# Subtest: Settings is a grouped utility index instead of a fifth working house
ok 485 - Settings is a grouped utility index instead of a fifth working house
  ---
  duration_ms: 1.901153
  type: 'test'
  ...
# Subtest: Backup Import and Restore remain separate concepts and latest backup is only recorded after success
ok 486 - Backup Import and Restore remain separate concepts and latest backup is only recorded after success
  ---
  duration_ms: 0.371781
  type: 'test'
  ...
# Subtest: normal APK update view stays human-facing while Web cache status is advanced
ok 487 - normal APK update view stays human-facing while Web cache status is advanced
  ---
  duration_ms: 1.190913
  type: 'test'
  ...
# Subtest: Reset All lives only in Advanced Danger Zone and clears local Settings metadata
ok 488 - Reset All lives only in Advanced Danger Zone and clears local Settings metadata
  ---
  duration_ms: 0.405935
  type: 'test'
  ...
# Subtest: permission area never fabricates Android permission truth
ok 489 - permission area never fabricates Android permission truth
  ---
  duration_ms: 0.315125
  type: 'test'
  ...
# Subtest: Settings utility has dedicated presentation styling
ok 490 - Settings utility has dedicated presentation styling
  ---
  duration_ms: 0.208858
  type: 'test'
  ...
1..490
# tests 490
# suites 0
# pass 487
# fail 3
# cancelled 0
# skipped 0
# todo 0
# duration_ms 54501.214763
```
