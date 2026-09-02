# LIGHTHOUSE 1.0.5 workbench diagnostic

Exit code: 1

## Failed tests
```text
1903-  duration_ms: 0.528725
1904-  type: 'test'
1905-  ...
1906-# Subtest: authentication and recovery errors stay user-facing
1907-ok 317 - authentication and recovery errors stay user-facing
1908-  ---
1909-  duration_ms: 0.324278
1910-  type: 'test'
1911-  ...
1912-# Subtest: existing data is never silently overwritten
1913-ok 318 - existing data is never silently overwritten
1914-  ---
1915-  duration_ms: 0.209105
1916-  type: 'test'
1917-  ...
1918-# Subtest: Manual opens the exact current Detail from a stable reference
1919:not ok 319 - Manual opens the exact current Detail from a stable reference
1920-  ---
1921-  duration_ms: 7.490548
1922-  type: 'test'
1923-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-manual-context-bridge.test.cjs:15:1'
1924-  failureType: 'testCodeFailure'
1925-  error: 'schedule.prepend is not a function'
1926-  code: 'ERR_TEST_FAILURE'
1927-  name: 'TypeError'
1928-  stack: |-
1929-    createSurface (file:///home/runner/work/ygph-metropolis/ygph-metropolis/ui/manual-finance-ui.mjs:135:14)
1930-    createManualFinanceUi (file:///home/runner/work/ygph-metropolis/ygph-metropolis/ui/manual-finance-ui.mjs:146:3)
1931-    setup (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-manual-context-bridge.test.cjs:11:14)
1932-    async TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-manual-context-bridge.test.cjs:16:15)
1933-    async Test.run (node:internal/test_runner/test:1054:7)
1934-    async startSubtestAfterBootstrap (node:internal/test_runner/harness:296:3)
1935-  ...
1936-# Subtest: Manual rejects a wrong-owner reference instead of falling back to caller data
1937:not ok 320 - Manual rejects a wrong-owner reference instead of falling back to caller data
1938-  ---
1939-  duration_ms: 0.761766
1940-  type: 'test'
1941-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-manual-context-bridge.test.cjs:27:1'
1942-  failureType: 'testCodeFailure'
1943-  error: 'schedule.prepend is not a function'
1944-  code: 'ERR_TEST_FAILURE'
1945-  name: 'TypeError'
1946-  stack: |-
1947-    createSurface (file:///home/runner/work/ygph-metropolis/ygph-metropolis/ui/manual-finance-ui.mjs:135:14)
1948-    createManualFinanceUi (file:///home/runner/work/ygph-metropolis/ygph-metropolis/ui/manual-finance-ui.mjs:146:3)
1949-    setup (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-manual-context-bridge.test.cjs:11:14)
1950-    async TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-manual-context-bridge.test.cjs:28:15)
1951-    async Test.run (node:internal/test_runner/test:1054:7)
1952-    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
1953-  ...
1954-# Subtest: Manual refreshes the same reference from current Truth
1955:not ok 321 - Manual refreshes the same reference from current Truth
1956-  ---
1957-  duration_ms: 1.487859
1958-  type: 'test'
1959-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-manual-context-bridge.test.cjs:39:1'
1960-  failureType: 'testCodeFailure'
1961-  error: 'schedule.prepend is not a function'
1962-  code: 'ERR_TEST_FAILURE'
1963-  name: 'TypeError'
1964-  stack: |-
1965-    createSurface (file:///home/runner/work/ygph-metropolis/ygph-metropolis/ui/manual-finance-ui.mjs:135:14)
1966-    createManualFinanceUi (file:///home/runner/work/ygph-metropolis/ygph-metropolis/ui/manual-finance-ui.mjs:146:3)
1967-    setup (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-manual-context-bridge.test.cjs:11:14)
1968-    async TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-manual-context-bridge.test.cjs:40:15)
1969-    async Test.run (node:internal/test_runner/test:1054:7)
1970-    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
1971-  ...
1972-# Subtest: Manual Ask sends subject plus reference without business Truth
1973:not ok 322 - Manual Ask sends subject plus reference without business Truth
1974-  ---
1975-  duration_ms: 0.596918
1976-  type: 'test'
1977-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-manual-context-bridge.test.cjs:53:1'
1978-  failureType: 'testCodeFailure'
1979-  error: 'schedule.prepend is not a function'
1980-  code: 'ERR_TEST_FAILURE'
1981-  name: 'TypeError'
1982-  stack: |-
1983-    createSurface (file:///home/runner/work/ygph-metropolis/ygph-metropolis/ui/manual-finance-ui.mjs:135:14)
1984-    createManualFinanceUi (file:///home/runner/work/ygph-metropolis/ygph-metropolis/ui/manual-finance-ui.mjs:146:3)
1985-    setup (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-manual-context-bridge.test.cjs:11:14)
1986-    async TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-manual-context-bridge.test.cjs:55:15)
1987-    async Test.run (node:internal/test_runner/test:1054:7)
1988-    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
1989-  ...
1990-# Subtest: an older Detail cannot borrow the reference of a newer Detail
1991:not ok 323 - an older Detail cannot borrow the reference of a newer Detail
1992-  ---
1993-  duration_ms: 0.734635
1994-  type: 'test'
1995-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-manual-context-bridge.test.cjs:67:1'
1996-  failureType: 'testCodeFailure'
1997-  error: 'schedule.prepend is not a function'
1998-  code: 'ERR_TEST_FAILURE'
1999-  name: 'TypeError'
2000-  stack: |-
2001-    createSurface (file:///home/runner/work/ygph-metropolis/ygph-metropolis/ui/manual-finance-ui.mjs:135:14)
2002-    createManualFinanceUi (file:///home/runner/work/ygph-metropolis/ygph-metropolis/ui/manual-finance-ui.mjs:146:3)
2003-    setup (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-manual-context-bridge.test.cjs:11:14)
2004-    async TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-manual-context-bridge.test.cjs:69:15)
2005-    async Test.run (node:internal/test_runner/test:1054:7)
2006-    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
2007-  ...
2008-# Subtest: Manual exposes Back only when a Chat origin exists
2009:not ok 324 - Manual exposes Back only when a Chat origin exists
2010-  ---
2011-  duration_ms: 0.644429
2012-  type: 'test'
2013-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-manual-context-bridge.test.cjs:83:1'
2014-  failureType: 'testCodeFailure'
2015-  error: 'schedule.prepend is not a function'
2016-  code: 'ERR_TEST_FAILURE'
2017-  name: 'TypeError'
2018-  stack: |-
2019-    createSurface (file:///home/runner/work/ygph-metropolis/ygph-metropolis/ui/manual-finance-ui.mjs:135:14)
2020-    createManualFinanceUi (file:///home/runner/work/ygph-metropolis/ygph-metropolis/ui/manual-finance-ui.mjs:146:3)
2021-    setup (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-manual-context-bridge.test.cjs:11:14)
2022-    async TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-manual-context-bridge.test.cjs:85:15)
2023-    async Test.run (node:internal/test_runner/test:1054:7)
2024-    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
2025-  ...
2026-# Subtest: Manual action commits through Runtime, reads back, and refreshes the same Detail
2027:not ok 325 - Manual action commits through Runtime, reads back, and refreshes the same Detail
2028-  ---
2029-  duration_ms: 1544.306672
2030-  type: 'test'
2031-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-manual-context-bridge.test.cjs:95:1'
2032-  failureType: 'testCodeFailure'
2033-  error: 'schedule.prepend is not a function'
2034-  code: 'ERR_TEST_FAILURE'
2035-  name: 'TypeError'
2036-  stack: |-
2037-    createSurface (file:///home/runner/work/ygph-metropolis/ygph-metropolis/ui/manual-finance-ui.mjs:135:14)
2038-    createManualFinanceUi (file:///home/runner/work/ygph-metropolis/ygph-metropolis/ui/manual-finance-ui.mjs:146:3)
2039-    TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-manual-context-bridge.test.cjs:111:14)
2040-    async Test.run (node:internal/test_runner/test:1054:7)
2041-    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
2042-  ...
2043-# Subtest: MANUAL Finance surface exposes only the missing lifecycle controls while reusing existing income expense obligation flows
2044-ok 326 - MANUAL Finance surface exposes only the missing lifecycle controls while reusing existing income expense obligation flows
2045-  ---
2046-  duration_ms: 5.851763
2047-  type: 'test'
2048-  ...
2049-# Subtest: MANUAL UI is wired through the shared four-house facade instead of a second mutation engine
2050-ok 327 - MANUAL UI is wired through the shared four-house facade instead of a second mutation engine
2051-  ---
2052-  duration_ms: 2.906352
2053-  type: 'test'
2054-  ...
2055-# Subtest: MANUAL production modules are release-gated and offline-cached once wired
```

## Summary tail
```text
ok 481 - obligation payment rejects a Calendar queue belonging to a different obligation and writes nothing
  ---
  duration_ms: 497.722304
  type: 'test'
  ...
# Subtest: sale workflow rejects projected Store stock below zero and writes nothing
ok 482 - sale workflow rejects projected Store stock below zero and writes nothing
  ---
  duration_ms: 498.170308
  type: 'test'
  ...
# Subtest: withdrawal workflow rejects projected Store stock below zero and writes nothing
ok 483 - withdrawal workflow rejects projected Store stock below zero and writes nothing
  ---
  duration_ms: 497.876716
  type: 'test'
  ...
# Subtest: negative adjustment workflow rejects projected Store stock below zero and writes nothing
ok 484 - negative adjustment workflow rejects projected Store stock below zero and writes nothing
  ---
  duration_ms: 497.57354
  type: 'test'
  ...
# Subtest: Store workflow allows final projected stock exactly zero
ok 485 - Store workflow allows final projected stock exactly zero
  ---
  duration_ms: 695.897665
  type: 'test'
  ...
# Subtest: Store workflow may repair a negative imported baseline when the committed final stock is non-negative
ok 486 - Store workflow may repair a negative imported baseline when the committed final stock is non-negative
  ---
  duration_ms: 708.110048
  type: 'test'
  ...
# Subtest: Settings is a grouped utility index instead of a fifth working house
ok 487 - Settings is a grouped utility index instead of a fifth working house
  ---
  duration_ms: 1.286235
  type: 'test'
  ...
# Subtest: Backup Import and Restore remain separate concepts and latest backup is only recorded after success
ok 488 - Backup Import and Restore remain separate concepts and latest backup is only recorded after success
  ---
  duration_ms: 0.372831
  type: 'test'
  ...
# Subtest: normal APK update view stays human-facing while Web cache status is advanced
ok 489 - normal APK update view stays human-facing while Web cache status is advanced
  ---
  duration_ms: 1.181588
  type: 'test'
  ...
# Subtest: Reset All lives only in Advanced Danger Zone and clears local Settings metadata
ok 490 - Reset All lives only in Advanced Danger Zone and clears local Settings metadata
  ---
  duration_ms: 0.401113
  type: 'test'
  ...
# Subtest: permission area never fabricates Android permission truth
ok 491 - permission area never fabricates Android permission truth
  ---
  duration_ms: 0.308845
  type: 'test'
  ...
# Subtest: Settings utility has dedicated presentation styling
ok 492 - Settings utility has dedicated presentation styling
  ---
  duration_ms: 0.229555
  type: 'test'
  ...
1..492
# tests 492
# suites 0
# pass 485
# fail 7
# cancelled 0
# skipped 0
# todo 0
# duration_ms 54380.9337
```
