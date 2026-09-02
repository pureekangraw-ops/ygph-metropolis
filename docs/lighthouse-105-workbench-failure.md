# LIGHTHOUSE 1.0.5 Gate D/E web diagnostic

Exit code: 1

## Failed tests
```text
1691-ok 281 - P1F01 production Master Input walks local Direct intent through explicit execute to real durable LEDGER readback
1692-  ---
1693-  duration_ms: 1745.059187
1694-  type: 'test'
1695-  ...
1696-# Subtest: P1F02 production recovery walks invalid -> still invalid -> valid -> explicit execute and reaches real durable truth
1697-ok 282 - P1F02 production recovery walks invalid -> still invalid -> valid -> explicit execute and reaches real durable truth
1698-  ---
1699-  duration_ms: 2293.189626
1700-  type: 'test'
1701-  ...
1702-# Subtest: P1F03 production front door keeps prohibition and understood unsupported condition stopped before provider and Runtime
1703-ok 283 - P1F03 production front door keeps prohibition and understood unsupported condition stopped before provider and Runtime
1704-  ---
1705-  duration_ms: 830.884701
1706-  type: 'test'
1707-  ...
1708-# Subtest: P1F04 whole-input replacement exits recovery, becomes a fresh routable input, and still requires explicit execute
1709:not ok 284 - P1F04 whole-input replacement exits recovery, becomes a fresh routable input, and still requires explicit execute
1710-  ---
1711-  duration_ms: 565.47079
1712-  type: 'test'
1713-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-phase1-final-gate.test.cjs:60:1'
1714-  failureType: 'testCodeFailure'
1715-  error: |-
1716-    Expected values to be strictly equal:
1717-    
1718-    'WAITING' !== 'รอ'
1719-    
1720-  code: 'ERR_ASSERTION'
1721-  name: 'AssertionError'
1722-  expected: 'รอ'
1723-  actual: 'WAITING'
1724-  operator: 'strictEqual'
1725-  stack: |-
1726-    TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-phase1-final-gate.test.cjs:63:12)
1727-    async Test.run (node:internal/test_runner/test:1054:7)
1728-    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
1729-  ...
1730-# Subtest: P1A01 attached raw ข้าว65 crosses Intent bridge -> PATH -> real durable LEDGER
1731-ok 285 - P1A01 attached raw ข้าว65 crosses Intent bridge -> PATH -> real durable LEDGER
1732-  ---
1733-  duration_ms: 1307.943696
1734-  type: 'test'
1735-  ...
1736-# Subtest: P1A02 prohibited group never becomes a PATH request or Runtime mutation
1737-ok 286 - P1A02 prohibited group never becomes a PATH request or Runtime mutation
1738-  ---
1739-  duration_ms: 1.344766
1740-  type: 'test'
1741-  ...
--
1965-ok 324 - Manual Ask sends subject plus reference without business Truth
1966-  ---
1967-  duration_ms: 1.966274
1968-  type: 'test'
1969-  ...
1970-# Subtest: an older Detail cannot borrow the reference of a newer Detail
1971-ok 325 - an older Detail cannot borrow the reference of a newer Detail
1972-  ---
1973-  duration_ms: 1.418914
1974-  type: 'test'
1975-  ...
1976-# Subtest: Manual exposes Back only when a Chat origin exists
1977-ok 326 - Manual exposes Back only when a Chat origin exists
1978-  ---
1979-  duration_ms: 2.118478
1980-  type: 'test'
1981-  ...
1982-# Subtest: Manual action commits through Runtime, reads back, and refreshes the same Detail
1983:not ok 327 - Manual action commits through Runtime, reads back, and refreshes the same Detail
1984-  ---
1985-  duration_ms: 1784.340335
1986-  type: 'test'
1987-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-manual-context-bridge.test.cjs:95:1'
1988-  failureType: 'testCodeFailure'
1989-  error: "Cannot read properties of undefined (reading 'click')"
1990-  code: 'ERR_TEST_FAILURE'
1991-  name: 'TypeError'
1992-  stack: |-
1993-    TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-manual-context-bridge.test.cjs:117:18)
1994-    async Test.run (node:internal/test_runner/test:1054:7)
1995-    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
1996-  ...
1997-# Subtest: MANUAL Finance surface exposes only the missing lifecycle controls while reusing existing income expense obligation flows
1998-ok 328 - MANUAL Finance surface exposes only the missing lifecycle controls while reusing existing income expense obligation flows
1999-  ---
2000-  duration_ms: 6.589521
2001-  type: 'test'
2002-  ...
2003-# Subtest: MANUAL UI is wired through the shared four-house facade instead of a second mutation engine
2004-ok 329 - MANUAL UI is wired through the shared four-house facade instead of a second mutation engine
2005-  ---
2006-  duration_ms: 2.970566
2007-  type: 'test'
2008-  ...
2009-# Subtest: MANUAL production modules are release-gated and offline-cached once wired
2010-ok 330 - MANUAL production modules are release-gated and offline-cached once wired
2011-  ---
2012-  duration_ms: 2.064478
2013-  type: 'test'
2014-  ...
2015-# Subtest: Income and Outcome keep Expected separate from Actual and settle partial/full with durable readback
```

## Summary tail
```text
  ...
# Subtest: atomic workflow commits Store + Ledger commands in one durable write
ok 480 - atomic workflow commits Store + Ledger commands in one durable write
  ---
  duration_ms: 792.022892
  type: 'test'
  ...
# Subtest: atomic workflow writes nothing when a later command fails
ok 481 - atomic workflow writes nothing when a later command fails
  ---
  duration_ms: 459.795612
  type: 'test'
  ...
# Subtest: receivable payment rejects a Calendar queue belonging to a different Store sale and writes nothing
ok 482 - receivable payment rejects a Calendar queue belonging to a different Store sale and writes nothing
  ---
  duration_ms: 458.365767
  type: 'test'
  ...
# Subtest: obligation payment rejects a Calendar queue belonging to a different obligation and writes nothing
ok 483 - obligation payment rejects a Calendar queue belonging to a different obligation and writes nothing
  ---
  duration_ms: 467.091818
  type: 'test'
  ...
# Subtest: sale workflow rejects projected Store stock below zero and writes nothing
ok 484 - sale workflow rejects projected Store stock below zero and writes nothing
  ---
  duration_ms: 467.139789
  type: 'test'
  ...
# Subtest: withdrawal workflow rejects projected Store stock below zero and writes nothing
ok 485 - withdrawal workflow rejects projected Store stock below zero and writes nothing
  ---
  duration_ms: 458.373139
  type: 'test'
  ...
# Subtest: negative adjustment workflow rejects projected Store stock below zero and writes nothing
ok 486 - negative adjustment workflow rejects projected Store stock below zero and writes nothing
  ---
  duration_ms: 459.446387
  type: 'test'
  ...
# Subtest: Store workflow allows final projected stock exactly zero
ok 487 - Store workflow allows final projected stock exactly zero
  ---
  duration_ms: 642.117336
  type: 'test'
  ...
# Subtest: Store workflow may repair a negative imported baseline when the committed final stock is non-negative
ok 488 - Store workflow may repair a negative imported baseline when the committed final stock is non-negative
  ---
  duration_ms: 651.056242
  type: 'test'
  ...
# Subtest: Settings is a grouped utility index instead of a fifth working house
ok 489 - Settings is a grouped utility index instead of a fifth working house
  ---
  duration_ms: 1.394139
  type: 'test'
  ...
# Subtest: Backup Import and Restore remain separate concepts and latest backup is only recorded after success
ok 490 - Backup Import and Restore remain separate concepts and latest backup is only recorded after success
  ---
  duration_ms: 0.369919
  type: 'test'
  ...
# Subtest: normal APK update view stays human-facing while Web cache status is advanced
ok 491 - normal APK update view stays human-facing while Web cache status is advanced
  ---
  duration_ms: 1.171533
  type: 'test'
  ...
# Subtest: Reset All lives only in Advanced Danger Zone and clears local Settings metadata
ok 492 - Reset All lives only in Advanced Danger Zone and clears local Settings metadata
  ---
  duration_ms: 0.38111
  type: 'test'
  ...
# Subtest: permission area never fabricates Android permission truth
ok 493 - permission area never fabricates Android permission truth
  ---
  duration_ms: 0.358108
  type: 'test'
  ...
# Subtest: Settings utility has dedicated presentation styling
ok 494 - Settings utility has dedicated presentation styling
  ---
  duration_ms: 0.217666
  type: 'test'
  ...
1..494
# tests 494
# suites 0
# pass 492
# fail 2
# cancelled 0
# skipped 0
# todo 0
# duration_ms 54716.22912
```
