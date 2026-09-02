# LIGHTHOUSE 1.0.5 workbench diagnostic

Exit code: 1

## Failed tests
```text
1189-  duration_ms: 0.352636
1190-  type: 'test'
1191-  ...
1192-# Subtest: S12 quoted command text inside a meaning question is reference-only
1193-ok 198 - S12 quoted command text inside a meaning question is reference-only
1194-  ---
1195-  duration_ms: 0.203329
1196-  type: 'test'
1197-  ...
1198-# Subtest: P1Q01 a question marker reclassifies only its own group and retains owned slots
1199-ok 199 - P1Q01 a question marker reclassifies only its own group and retains owned slots
1200-  ---
1201-  duration_ms: 7.40762
1202-  type: 'test'
1203-  ...
1204-# Subtest: P1Q02 UI highlights a question and searches durable records 10 -> 6 -> 1 without writes
1205:not ok 200 - P1Q02 UI highlights a question and searches durable records 10 -> 6 -> 1 without writes
1206-  ---
1207-  duration_ms: 5947.678517
1208-  type: 'test'
1209-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-intent-question.test.cjs:41:1'
1210-  failureType: 'testCodeFailure'
1211-  error: |-
1212-    Expected values to be strictly equal:
1213-    + actual - expected
1214-    
1215-    + 'กำลังอ่าน'
1216-    - 'SUCCESS'
1217-    
1218-  code: 'ERR_ASSERTION'
1219-  name: 'AssertionError'
1220-  expected: 'SUCCESS'
1221-  actual: 'กำลังอ่าน'
1222-  operator: 'strictEqual'
1223-  stack: |-
1224-    TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-intent-question.test.cjs:56:12)
1225-    async Test.run (node:internal/test_runner/test:1054:7)
1226-    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
1227-  ...
1228-# Subtest: P1Q03 duplicates select newest recording time, not insertion order or business date
1229-ok 201 - P1Q03 duplicates select newest recording time, not insertion order or business date
1230-  ---
1231-  duration_ms: 2203.411975
1232-  type: 'test'
1233-  ...
1234-# Subtest: P1Q04 no exact amount match reports not found rather than choosing a nearby amount
1235:not ok 202 - P1Q04 no exact amount match reports not found rather than choosing a nearby amount
1236-  ---
1237-  duration_ms: 1437.330853
1238-  type: 'test'
1239-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-intent-question.test.cjs:83:1'
1240-  failureType: 'testCodeFailure'
1241-  error: |-
1242-    Expected values to be strictly equal:
1243-    + actual - expected
1244-    
1245-    + 'กำลังอ่าน'
1246-    - 'SUCCESS'
1247-    
1248-  code: 'ERR_ASSERTION'
1249-  name: 'AssertionError'
1250-  expected: 'SUCCESS'
1251-  actual: 'กำลังอ่าน'
1252-  operator: 'strictEqual'
1253-  stack: |-
1254-    TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-intent-question.test.cjs:92:12)
1255-    async Test.run (node:internal/test_runner/test:1054:7)
1256-    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
1257-  ...
1258-# Subtest: P1Q05 correcting a question rejoins its query instead of turning into a create
1259:not ok 203 - P1Q05 correcting a question rejoins its query instead of turning into a create
1260-  ---
1261-  duration_ms: 1303.276877
1262-  type: 'test'
1263-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-intent-question.test.cjs:98:1'
1264-  failureType: 'testCodeFailure'
1265-  error: |-
1266-    Expected values to be strictly equal:
1267-    
1268-    'กำลังอ่าน' !== 'รอ'
1269-    
1270-  code: 'ERR_ASSERTION'
1271-  name: 'AssertionError'
1272-  expected: 'รอ'
1273-  actual: 'กำลังอ่าน'
1274-  operator: 'strictEqual'
1275-  stack: |-
1276-    TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-intent-question.test.cjs:103:12)
1277-    async Test.run (node:internal/test_runner/test:1054:7)
1278-    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
1279-  ...
1280-# Subtest: P1Q06 questions preserve prohibition, condition and unsupported multi-group boundaries
1281:not ok 204 - P1Q06 questions preserve prohibition, condition and unsupported multi-group boundaries
1282-  ---
1283-  duration_ms: 573.735578
1284-  type: 'test'
1285-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-intent-question.test.cjs:112:1'
1286-  failureType: 'testCodeFailure'
1287-  error: |-
1288-    Expected values to be strictly equal:
1289-    + actual - expected
1290-    
1291-    + 'กำลังอ่าน'
1292-    - 'UNSUPPORTED'
1293-    
1294-  code: 'ERR_ASSERTION'
1295-  name: 'AssertionError'
1296-  expected: 'UNSUPPORTED'
1297-  actual: 'กำลังอ่าน'
1298-  operator: 'strictEqual'
1299-  stack: |-
1300-    TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-intent-question.test.cjs:117:14)
1301-    async Test.run (node:internal/test_runner/test:1054:7)
1302-    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
1303-  ...
1304-# Subtest: P1Q07 unrepresented query units or clock time are not discarded to return a match
1305:not ok 205 - P1Q07 unrepresented query units or clock time are not discarded to return a match
1306-  ---
1307-  duration_ms: 1321.607414
1308-  type: 'test'
1309-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-intent-question.test.cjs:125:1'
1310-  failureType: 'testCodeFailure'
1311-  error: |-
1312-    The expression evaluated to a falsy value:
1313-    
1314-      assert.ok(['ASK','UNSUPPORTED'].includes(await env.submit(text)))
1315-    
1316-  code: 'ERR_ASSERTION'
1317-  name: 'AssertionError'
1318-  expected: true
1319-  actual: false
1320-  operator: '=='
1321-  stack: |-
1322-    TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-intent-question.test.cjs:131:14)
1323-    async Test.run (node:internal/test_runner/test:1054:7)
1324-    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
1325-  ...
1326-# Subtest: P1Q08 a new command clears the question marker and still waits for explicit execute
1327:not ok 206 - P1Q08 a new command clears the question marker and still waits for explicit execute
1328-  ---
1329-  duration_ms: 436.347492
1330-  type: 'test'
1331-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-intent-question.test.cjs:139:1'
1332-  failureType: 'testCodeFailure'
1333-  error: |-
1334-    Expected values to be strictly equal:
1335-    + actual - expected
1336-    
1337-    + 'กำลังอ่าน'
1338-    - 'SUCCESS'
1339-    
1340-  code: 'ERR_ASSERTION'
1341-  name: 'AssertionError'
1342-  expected: 'SUCCESS'
1343-  actual: 'กำลังอ่าน'
1344-  operator: 'strictEqual'
1345-  stack: |-
1346-    TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-intent-question.test.cjs:142:12)
1347-    async Test.run (node:internal/test_runner/test:1054:7)
1348-    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
1349-  ...
1350-# Subtest: P1Q09 a represented relative date narrows matches before choosing latest
1351-ok 207 - P1Q09 a represented relative date narrows matches before choosing latest
1352-  ---
1353-  duration_ms: 1487.4298
1354-  type: 'test'
1355-  ...
--
1359-  duration_ms: 1471.43921
1360-  type: 'test'
1361-  ...
1362-# Subtest: P1Q11 provider-owned questions retain the existing validated query route and marker
1363-ok 209 - P1Q11 provider-owned questions retain the existing validated query route and marker
1364-  ---
1365-  duration_ms: 2.13176
1366-  type: 'test'
1367-  ...
1368-# Subtest: P1Q12 a provider cannot turn a marked question into an executable create
1369-ok 210 - P1Q12 a provider cannot turn a marked question into an executable create
1370-  ---
1371-  duration_ms: 0.570282
1372-  type: 'test'
1373-  ...
1374-# Subtest: P1Q13 imported duplicates with unknown recording times report matches without claiming latest
1375:not ok 211 - P1Q13 imported duplicates with unknown recording times report matches without claiming latest
1376-  ---
1377-  duration_ms: 631.331932
1378-  type: 'test'
1379-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-intent-question.test.cjs:215:1'
1380-  failureType: 'testCodeFailure'
1381-  error: |-
1382-    Expected values to be strictly equal:
1383-    + actual - expected
1384-    
1385-    + 'กำลังอ่าน'
1386-    - 'SUCCESS'
1387-    
1388-  code: 'ERR_ASSERTION'
1389-  name: 'AssertionError'
1390-  expected: 'SUCCESS'
1391-  actual: 'กำลังอ่าน'
1392-  operator: 'strictEqual'
1393-  stack: |-
1394-    TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-intent-question.test.cjs:230:14)
1395-    async Test.run (node:internal/test_runner/test:1054:7)
1396-    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
1397-  ...
1398-# Subtest: R01 known error form resolves directly to its single verified parent without AI
1399-ok 212 - R01 known error form resolves directly to its single verified parent without AI
1400-  ---
1401-  duration_ms: 5.884166
1402-  type: 'test'
1403-  ...
--
1797-  duration_ms: 6.27193
1798-  type: 'test'
1799-  ...
1800-# Subtest: unknown title plus amount is NO_MATCH, not guessed expense
1801-ok 279 - unknown title plus amount is NO_MATCH, not guessed expense
1802-  ---
1803-  duration_ms: 1.161583
1804-  type: 'test'
1805-  ...
1806-# Subtest: unsafe or ambiguous money is NO_MATCH
1807-ok 280 - unsafe or ambiguous money is NO_MATCH
1808-  ---
1809-  duration_ms: 0.460377
1810-  type: 'test'
1811-  ...
1812-# Subtest: P1F01 production Master Input walks local Direct intent through explicit execute to real durable LEDGER readback
1813:not ok 281 - P1F01 production Master Input walks local Direct intent through explicit execute to real durable LEDGER readback
1814-  ---
1815-  duration_ms: 479.430361
1816-  type: 'test'
1817-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-phase1-final-gate.test.cjs:6:1'
1818-  failureType: 'testCodeFailure'
1819-  error: |-
1820-    Expected values to be strictly equal:
1821-    + actual - expected
1822-    
1823-    + 'กำลังอ่าน'
1824-    - 'READY'
1825-    
1826-  code: 'ERR_ASSERTION'
1827-  name: 'AssertionError'
1828-  expected: 'READY'
1829-  actual: 'กำลังอ่าน'
1830-  operator: 'strictEqual'
1831-  stack: |-
1832-    TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-phase1-final-gate.test.cjs:9:12)
1833-    async Test.run (node:internal/test_runner/test:1054:7)
1834-    async startSubtestAfterBootstrap (node:internal/test_runner/harness:296:3)
1835-  ...
1836-# Subtest: P1F02 production recovery walks invalid -> still invalid -> valid -> explicit execute and reaches real durable truth
1837:not ok 282 - P1F02 production recovery walks invalid -> still invalid -> valid -> explicit execute and reaches real durable truth
1838-  ---
1839-  duration_ms: 470.296008
1840-  type: 'test'
1841-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-phase1-final-gate.test.cjs:23:1'
1842-  failureType: 'testCodeFailure'
1843-  error: |-
1844-    Expected values to be strictly equal:
1845-    
1846-    'กำลังอ่าน' !== 'รอ'
1847-    
1848-  code: 'ERR_ASSERTION'
1849-  name: 'AssertionError'
1850-  expected: 'รอ'
1851-  actual: 'กำลังอ่าน'
1852-  operator: 'strictEqual'
1853-  stack: |-
1854-    TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-phase1-final-gate.test.cjs:26:12)
1855-    async Test.run (node:internal/test_runner/test:1054:7)
1856-    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
1857-  ...
1858-# Subtest: P1F03 production front door keeps prohibition and understood unsupported condition stopped before provider and Runtime
1859:not ok 283 - P1F03 production front door keeps prohibition and understood unsupported condition stopped before provider and Runtime
1860-  ---
1861-  duration_ms: 442.607748
1862-  type: 'test'
1863-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-phase1-final-gate.test.cjs:44:1'
1864-  failureType: 'testCodeFailure'
1865-  error: |-
1866-    Expected values to be strictly equal:
1867-    + actual - expected
1868-    
1869-    + 'กำลังอ่าน'
1870-    - 'UNSUPPORTED'
1871-    
1872-  code: 'ERR_ASSERTION'
1873-  name: 'AssertionError'
1874-  expected: 'UNSUPPORTED'
1875-  actual: 'กำลังอ่าน'
1876-  operator: 'strictEqual'
1877-  stack: |-
1878-    TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-phase1-final-gate.test.cjs:47:12)
1879-    async Test.run (node:internal/test_runner/test:1054:7)
1880-    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
1881-  ...
1882-# Subtest: P1F04 whole-input replacement exits recovery, becomes a fresh routable input, and still requires explicit execute
1883:not ok 284 - P1F04 whole-input replacement exits recovery, becomes a fresh routable input, and still requires explicit execute
1884-  ---
1885-  duration_ms: 382.642061
1886-  type: 'test'
1887-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-phase1-final-gate.test.cjs:60:1'
1888-  failureType: 'testCodeFailure'
1889-  error: |-
1890-    Expected values to be strictly equal:
1891-    
1892-    'กำลังอ่าน' !== 'รอ'
1893-    
1894-  code: 'ERR_ASSERTION'
1895-  name: 'AssertionError'
1896-  expected: 'รอ'
1897-  actual: 'กำลังอ่าน'
1898-  operator: 'strictEqual'
1899-  stack: |-
1900-    TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-phase1-final-gate.test.cjs:63:12)
1901-    async Test.run (node:internal/test_runner/test:1054:7)
1902-    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
1903-  ...
1904-# Subtest: P1A01 attached raw ข้าว65 crosses Intent bridge -> PATH -> real durable LEDGER
1905-ok 285 - P1A01 attached raw ข้าว65 crosses Intent bridge -> PATH -> real durable LEDGER
1906-  ---
1907-  duration_ms: 1295.241541
1908-  type: 'test'
1909-  ...
1910-# Subtest: P1A02 prohibited group never becomes a PATH request or Runtime mutation
1911-ok 286 - P1A02 prohibited group never becomes a PATH request or Runtime mutation
--
2051-  duration_ms: 0.57952
2052-  type: 'test'
2053-  ...
2054-# Subtest: P1C107 semantic waiting directives are closed to the five approved UI types and numeric waiting maps to ENTER_VALUE without AI
2055-ok 310 - P1C107 semantic waiting directives are closed to the five approved UI types and numeric waiting maps to ENTER_VALUE without AI
2056-  ---
2057-  duration_ms: 0.80022
2058-  type: 'test'
2059-  ...
2060-# Subtest: P1C108 a real paused session carries the Architecture Lock minimum contract including durable baseRevision and semantic directive
2061-ok 311 - P1C108 a real paused session carries the Architecture Lock minimum contract including durable baseRevision and semantic directive
2062-  ---
2063-  duration_ms: 0.563809
2064-  type: 'test'
2065-  ...
2066-# Subtest: LIGHTHOUSE user surfaces use human Thai instead of system/developer copy
2067:not ok 312 - LIGHTHOUSE user surfaces use human Thai instead of system/developer copy
2068-  ---
2069-  duration_ms: 13.083705
2070-  type: 'test'
2071-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-user-copy.test.cjs:9:1'
2072-  failureType: 'testCodeFailure'
2073-  error: |-
2074-    forbidden user copy survived: 'Complete'
2075-    
2076-    true !== false
2077-    
2078-  code: 'ERR_ASSERTION'
2079-  name: 'AssertionError'
2080-  expected: false
2081-  actual: true
2082-  operator: 'strictEqual'
2083-  stack: |-
2084-    TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-user-copy.test.cjs:21:13)
2085-    async Test.run (node:internal/test_runner/test:1054:7)
2086-    async startSubtestAfterBootstrap (node:internal/test_runner/harness:296:3)
2087-  ...
2088-# Subtest: normal Settings copy does not expose raw updater error codes/messages directly
2089-ok 313 - normal Settings copy does not expose raw updater error codes/messages directly
2090-  ---
2091-  duration_ms: 2.832685
2092-  type: 'test'
2093-  ...
2094-# Subtest: locked login surface exposes only password, sign in, and recovery entry actions
2095-ok 314 - locked login surface exposes only password, sign in, and recovery entry actions
--
2199-  duration_ms: 12046.879076
2200-  type: 'test'
2201-  ...
2202-# Subtest: Calendar covers today/upcoming/overdue detail edit reschedule complete and cancel without creating cash by itself
2203-ok 332 - Calendar covers today/upcoming/overdue detail edit reschedule complete and cancel without creating cash by itself
2204-  ---
2205-  duration_ms: 6611.641659
2206-  type: 'test'
2207-  ...
2208-# Subtest: Ledger search/history/related/refund/reverse preserve original Actual truth and analyze latest durable state
2209-ok 333 - Ledger search/history/related/refund/reverse preserve original Actual truth and analyze latest durable state
2210-  ---
2211-  duration_ms: 4651.100622
2212-  type: 'test'
2213-  ...
2214-# Subtest: Manual subject opens in Chat with identity-only interpretation context
2215:not ok 334 - Manual subject opens in Chat with identity-only interpretation context
2216-  ---
2217-  duration_ms: 483.050798
2218-  type: 'test'
2219-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-master-input-context-bridge.test.cjs:6:1'
2220-  failureType: 'testCodeFailure'
2221-  error: "Cannot read properties of undefined (reading 'init')"
2222-  code: 'ERR_TEST_FAILURE'
2223-  name: 'TypeError'
2224-  stack: |-
2225-    TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-master-input-context-bridge.test.cjs:21:45)
2226-    async Test.run (node:internal/test_runner/test:1054:7)
2227-    async startSubtestAfterBootstrap (node:internal/test_runner/harness:296:3)
2228-  ...
2229-# Subtest: Chat Peek resolves fresh display data and Open sends only the stable reference
2230-ok 335 - Chat Peek resolves fresh display data and Open sends only the stable reference
2231-  ---
2232-  duration_ms: 470.212788
2233-  type: 'test'
2234-  ...
2235-# Subtest: proven durable Chat readback exposes its exact Ledger reference
2236:not ok 336 - proven durable Chat readback exposes its exact Ledger reference
2237-  ---
2238-  duration_ms: 345.099666
2239-  type: 'test'
2240-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-master-input-context-bridge.test.cjs:48:1'
2241-  failureType: 'testCodeFailure'
2242-  error: |-
2243-    Expected values to be strictly equal:
2244-    + actual - expected
2245-    
2246-    + 'กำลังอ่าน'
2247-    - 'READY'
2248-    
2249-  code: 'ERR_ASSERTION'
2250-  name: 'AssertionError'
2251-  expected: 'READY'
2252-  actual: 'กำลังอ่าน'
2253-  operator: 'strictEqual'
2254-  stack: |-
2255-    TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-master-input-context-bridge.test.cjs:53:12)
2256-    async Test.run (node:internal/test_runner/test:1054:7)
2257-    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
2258-  ...
2259-# Subtest: production explicitly enables provider while staging remains disabled
2260-ok 337 - production explicitly enables provider while staging remains disabled
2261-  ---
2262-  duration_ms: 1.514358
2263-  type: 'test'
2264-  ...
--
3162-  duration_ms: 638.652229
3163-  type: 'test'
3164-  ...
3165-# Subtest: Store workflow may repair a negative imported baseline when the committed final stock is non-negative
3166-ok 488 - Store workflow may repair a negative imported baseline when the committed final stock is non-negative
3167-  ---
3168-  duration_ms: 646.563097
3169-  type: 'test'
3170-  ...
3171-# Subtest: Settings is a grouped utility index instead of a fifth working house
3172-ok 489 - Settings is a grouped utility index instead of a fifth working house
3173-  ---
3174-  duration_ms: 1.365291
3175-  type: 'test'
3176-  ...
3177-# Subtest: Backup Import and Restore remain separate concepts and latest backup is only recorded after success
3178:not ok 490 - Backup Import and Restore remain separate concepts and latest backup is only recorded after success
3179-  ---
3180-  duration_ms: 2.858188
3181-  type: 'test'
3182-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/settings-utility.test.cjs:18:1'
3183-  failureType: 'testCodeFailure'
3184-  error: |-
3185-    The input did not match the regular expression /กู้คืนจาก Backup/. Input:
3186-    
3187-    "import { createAppUpdater, capacitorUpdaterBridge, DEFAULT_UPDATE_METADATA_URL } from './app-update.mjs';\n" +
3188-      '\n' +
3189-      'const $=id=>document.getElementById(id);\n' +
3190-      "const LATEST_BACKUP_KEY='metro-settings-latest-backup';\n" +
3191-      'let updateController=null;\n' +
3192-      '\n' +
3193-      "function makeSection(id,title,description=''){\n" +
3194-      "  const section=document.createElement('section');\n" +
3195-      '  section.id=id;\n' +
3196-      "  section.className='settings-utility-panel hidden';\n" +
3197-      '  section.dataset.settingsPanel=id;\n' +
3198-      "  const back=document.createElement('button');\n" +
3199-      "  back.type='button';\n" +
3200-      "  back.className='secondary settings-back-btn';\n" +
3201-      "  back.textContent='‹ ตั้งค่า';\n" +
3202-      "  back.addEventListener('click',showIndex);\n" +
3203-      "  const heading=document.createElement('h3');\n" +
3204-      '  heading.textContent=title;\n' +
3205-      '  section.append(back,heading);\n' +
3206-      "  if(description){const p=document.createElement('p');p.className='muted';p.textContent=description;section.append(p);}\n" +
```

## Summary tail
```text
      const security=makeSection('settingsSecurity','ความปลอดภัย','จัดการการเข้าถึงแอปของผู้ใช้');
      security.append(securitySection);securitySection.querySelector('h3')?.remove();
    
      const update=buildUpdatePanel();
    
      const about=makeSection('settingsAbout','เกี่ยวกับแอป','ข้อมูลรุ่นของตัวแอปและฐานเว็บภายใน');
      const facts=document.createElement('div');facts.className='system-facts';
      facts.innerHTML='<div class="system-fact"><span>Web release</span><b id="settingsAboutVersion">—</b></div>';
      about.append(facts);
    
      const advanced=makeSection('settingsAdvanced','ขั้นสูง','ห้องเครื่องสำหรับ Recovery, ประวัติอัปเดต และข้อมูลทางเทคนิค');
      const technical=document.createElement('section');technical.id='settingsTechnicalInfo';technical.dataset.settingsTechnical='true';technical.className='settings-advanced-block';
      const technicalTitle=document.createElement('h4');technicalTitle.textContent='ข้อมูลทางเทคนิค';technical.append(technicalTitle,systemSection);
      systemSection.querySelector('h3')?.remove();
      const danger=document.createElement('section');danger.id='settingsDangerZone';danger.className='settings-danger-zone';
      const dangerTitle=document.createElement('h4');dangerTitle.textContent='Danger Zone';danger.append(dangerTitle);
      advanced.append(technical,danger);
    
      const anchor=status?.nextSibling || body.firstChild;
      body.insertBefore(index,anchor);
      body.insertBefore(usage,anchor);
      body.insertBefore(permissions,anchor);
      body.insertBefore(data,anchor);
      body.insertBefore(security,anchor);
      body.insertBefore(update,anchor);
      body.insertBefore(about,anchor);
      body.insertBefore(advanced,anchor);
      renderLatestBackup();
      observeRealBackupSuccess();
      $('settingsBtn')?.addEventListener('click',showIndex);
      $('settingsDialog')?.addEventListener('close',showIndex);
      showIndex();
      void wireAppUpdater();
    }
    
    installSettingsUtility();
    
  operator: 'match'
  stack: |-
    TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/settings-utility.test.cjs:23:10)
    Test.runInAsyncScope (node:async_hooks:214:14)
    Test.run (node:internal/test_runner/test:1047:25)
    Test.processPendingSubtests (node:internal/test_runner/test:744:18)
    Test.postRun (node:internal/test_runner/test:1173:19)
    Test.run (node:internal/test_runner/test:1101:12)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:296:3)
  ...
# Subtest: normal APK update view stays human-facing while Web cache status is advanced
ok 491 - normal APK update view stays human-facing while Web cache status is advanced
  ---
  duration_ms: 0.635403
  type: 'test'
  ...
# Subtest: Reset All lives only in Advanced Danger Zone and clears local Settings metadata
ok 492 - Reset All lives only in Advanced Danger Zone and clears local Settings metadata
  ---
  duration_ms: 0.545144
  type: 'test'
  ...
# Subtest: permission area never fabricates Android permission truth
ok 493 - permission area never fabricates Android permission truth
  ---
  duration_ms: 0.449206
  type: 'test'
  ...
# Subtest: Settings utility has dedicated presentation styling
ok 494 - Settings utility has dedicated presentation styling
  ---
  duration_ms: 0.298846
  type: 'test'
  ...
1..494
# tests 494
# suites 0
# pass 479
# fail 15
# cancelled 0
# skipped 0
# todo 0
# duration_ms 50948.255771
```
