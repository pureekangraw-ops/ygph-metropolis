# LIGHTHOUSE 1.0.5 Gate D/E web diagnostic

Exit code: 1

## Failed tests
```text
1181-ok 196 - S10 two unlabelled numbers remain ambiguous
1182-  ---
1183-  duration_ms: 2.488286
1184-  type: 'test'
1185-  ...
1186-# Subtest: S11 money with more than two decimals is invalid and never rounded
1187-ok 197 - S11 money with more than two decimals is invalid and never rounded
1188-  ---
1189-  duration_ms: 0.523249
1190-  type: 'test'
1191-  ...
1192-# Subtest: S12 quoted command text inside a meaning question is reference-only
1193-ok 198 - S12 quoted command text inside a meaning question is reference-only
1194-  ---
1195-  duration_ms: 0.271879
1196-  type: 'test'
1197-  ...
1198-# Subtest: P1Q01 exact durable question returns read-only truth without creating or mutating records
1199:not ok 199 - P1Q01 exact durable question returns read-only truth without creating or mutating records
1200-  ---
1201-  duration_ms: 514.982361
1202-  type: 'test'
1203-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-intent-question.test.cjs:11:1'
1204-  failureType: 'testCodeFailure'
1205-  error: 'env.runtime.recordExpense is not a function'
1206-  code: 'ERR_TEST_FAILURE'
1207-  name: 'TypeError'
1208-  stack: |-
1209-    expense (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-intent-question.test.cjs:7:36)
1210-    TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-intent-question.test.cjs:14:11)
1211-    async Test.run (node:internal/test_runner/test:1054:7)
1212-    async startSubtestAfterBootstrap (node:internal/test_runner/harness:296:3)
1213-  ...
1214-# Subtest: P1Q02 UI highlights a question and searches durable records 10 -> 6 -> 1 without writes
1215:not ok 200 - P1Q02 UI highlights a question and searches durable records 10 -> 6 -> 1 without writes
1216-  ---
1217-  duration_ms: 453.31549
1218-  type: 'test'
1219-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-intent-question.test.cjs:24:1'
1220-  failureType: 'testCodeFailure'
1221-  error: 'env.runtime.recordExpense is not a function'
1222-  code: 'ERR_TEST_FAILURE'
1223-  name: 'TypeError'
1224-  stack: |-
1225-    expense (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-intent-question.test.cjs:7:36)
1226-    TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-intent-question.test.cjs:29:13)
1227-    async Test.run (node:internal/test_runner/test:1054:7)
1228-    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
1229-  ...
1230-# Subtest: P1Q03 duplicates select newest recording time, not insertion order or business date
1231:not ok 201 - P1Q03 duplicates select newest recording time, not insertion order or business date
1232-  ---
1233-  duration_ms: 449.27472
1234-  type: 'test'
1235-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-intent-question.test.cjs:43:1'
1236-  failureType: 'testCodeFailure'
1237-  error: 'env.runtime.recordExpense is not a function'
1238-  code: 'ERR_TEST_FAILURE'
1239-  name: 'TypeError'
1240-  stack: |-
1241-    expense (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-intent-question.test.cjs:7:36)
1242-    TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-intent-question.test.cjs:46:11)
1243-    async Test.run (node:internal/test_runner/test:1054:7)
1244-    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
1245-  ...
1246-# Subtest: P1Q04 no exact amount match reports not found rather than choosing a nearby amount
1247:not ok 202 - P1Q04 no exact amount match reports not found rather than choosing a nearby amount
1248-  ---
1249-  duration_ms: 467.989781
1250-  type: 'test'
1251-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-intent-question.test.cjs:55:1'
1252-  failureType: 'testCodeFailure'
1253-  error: 'env.runtime.recordExpense is not a function'
1254-  code: 'ERR_TEST_FAILURE'
1255-  name: 'TypeError'
1256-  stack: |-
1257-    expense (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-intent-question.test.cjs:7:36)
1258-    TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-intent-question.test.cjs:58:11)
1259-    async Test.run (node:internal/test_runner/test:1054:7)
1260-    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
1261-  ...
1262-# Subtest: P1Q05 correcting a question rejoins its query instead of turning into a create
1263:not ok 203 - P1Q05 correcting a question rejoins its query instead of turning into a create
1264-  ---
1265-  duration_ms: 451.508831
1266-  type: 'test'
1267-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-intent-question.test.cjs:66:1'
1268-  failureType: 'testCodeFailure'
1269-  error: 'env.runtime.recordExpense is not a function'
1270-  code: 'ERR_TEST_FAILURE'
1271-  name: 'TypeError'
1272-  stack: |-
1273-    expense (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-intent-question.test.cjs:7:36)
1274-    TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-intent-question.test.cjs:69:11)
1275-    async Test.run (node:internal/test_runner/test:1054:7)
1276-    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
1277-  ...
1278-# Subtest: P1Q06 questions preserve prohibition, condition and unsupported multi-group boundaries
1279:not ok 204 - P1Q06 questions preserve prohibition, condition and unsupported multi-group boundaries
1280-  ---
1281-  duration_ms: 609.966762
1282-  type: 'test'
1283-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-intent-question.test.cjs:80:1'
1284-  failureType: 'testCodeFailure'
1285-  error: |-
1286-    Expected values to be strictly equal:
1287-    + actual - expected
1288-    
1289-    + 'ERROR'
1290-    - 'UNSUPPORTED'
1291-    
1292-  code: 'ERR_ASSERTION'
1293-  name: 'AssertionError'
1294-  expected: 'UNSUPPORTED'
1295-  actual: 'ERROR'
1296-  operator: 'strictEqual'
1297-  stack: |-
1298-    TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-intent-question.test.cjs:85:12)
1299-    async Test.run (node:internal/test_runner/test:1054:7)
1300-    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
1301-  ...
1302-# Subtest: P1Q07 unrepresented query units or clock time are not discarded to return a match
1303:not ok 205 - P1Q07 unrepresented query units or clock time are not discarded to return a match
1304-  ---
1305-  duration_ms: 401.651527
1306-  type: 'test'
1307-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-intent-question.test.cjs:93:1'
1308-  failureType: 'testCodeFailure'
1309-  error: 'env.runtime.recordExpense is not a function'
1310-  code: 'ERR_TEST_FAILURE'
1311-  name: 'TypeError'
1312-  stack: |-
1313-    expense (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-intent-question.test.cjs:7:36)
1314-    TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-intent-question.test.cjs:96:11)
1315-    async Test.run (node:internal/test_runner/test:1054:7)
1316-    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
1317-  ...
1318-# Subtest: R01 known error form resolves directly to its single verified parent without AI
1319-ok 206 - R01 known error form resolves directly to its single verified parent without AI
1320-  ---
1321-  duration_ms: 6.673516
1322-  type: 'test'
1323-  ...
1324-# Subtest: R02 one error form pointing to two valid parents stays ambiguous regardless of frequency
1325-ok 207 - R02 one error form pointing to two valid parents stays ambiguous regardless of frequency
1326-  ---
1327-  duration_ms: 1.457327
1328-  type: 'test'
1329-  ...
1330-# Subtest: R03 local recovery stops immediately when pass 1 resolves
1331-ok 208 - R03 local recovery stops immediately when pass 1 resolves
1332-  ---
1333-  duration_ms: 0.699379
1334-  type: 'test'
1335-  ...
--
1721-ok 273 - unknown title plus amount is NO_MATCH, not guessed expense
1722-  ---
1723-  duration_ms: 1.147144
1724-  type: 'test'
1725-  ...
1726-# Subtest: unsafe or ambiguous money is NO_MATCH
1727-ok 274 - unsafe or ambiguous money is NO_MATCH
1728-  ---
1729-  duration_ms: 0.502119
1730-  type: 'test'
1731-  ...
1732-# Subtest: P1F01 production Master Input walks local Direct intent through explicit execute to real durable LEDGER readback
1733-ok 275 - P1F01 production Master Input walks local Direct intent through explicit execute to real durable LEDGER readback
1734-  ---
1735-  duration_ms: 1274.85244
1736-  type: 'test'
1737-  ...
1738-# Subtest: P1F02 production recovery walks invalid -> still invalid -> valid -> explicit execute and reaches real durable truth
1739:not ok 276 - P1F02 production recovery walks invalid -> still invalid -> valid -> explicit execute and reaches real durable truth
1740-  ---
1741-  duration_ms: 471.227616
1742-  type: 'test'
1743-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-phase1-final-gate.test.cjs:23:1'
1744-  failureType: 'testCodeFailure'
1745-  error: |-
1746-    Expected values to be strictly equal:
1747-    
1748-    'WAITING' !== 'รอ'
1749-    
1750-  code: 'ERR_ASSERTION'
1751-  name: 'AssertionError'
1752-  expected: 'รอ'
1753-  actual: 'WAITING'
1754-  operator: 'strictEqual'
1755-  stack: |-
1756-    TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-phase1-final-gate.test.cjs:26:12)
1757-    async Test.run (node:internal/test_runner/test:1054:7)
1758-    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
1759-  ...
1760-# Subtest: P1F03 production front door keeps prohibition and understood unsupported condition stopped before provider and Runtime
1761-ok 277 - P1F03 production front door keeps prohibition and understood unsupported condition stopped before provider and Runtime
1762-  ---
1763-  duration_ms: 670.452543
1764-  type: 'test'
1765-  ...
1766-# Subtest: P1F04 whole-input replacement exits recovery, becomes a fresh routable input, and still requires explicit execute
1767:not ok 278 - P1F04 whole-input replacement exits recovery, becomes a fresh routable input, and still requires explicit execute
1768-  ---
1769-  duration_ms: 469.952771
1770-  type: 'test'
1771-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-phase1-final-gate.test.cjs:60:1'
1772-  failureType: 'testCodeFailure'
1773-  error: |-
1774-    Expected values to be strictly equal:
1775-    
1776-    'WAITING' !== 'รอ'
1777-    
1778-  code: 'ERR_ASSERTION'
1779-  name: 'AssertionError'
1780-  expected: 'รอ'
1781-  actual: 'WAITING'
1782-  operator: 'strictEqual'
1783-  stack: |-
1784-    TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-phase1-final-gate.test.cjs:63:12)
1785-    async Test.run (node:internal/test_runner/test:1054:7)
1786-    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
1787-  ...
1788-# Subtest: P1A01 attached raw ข้าว65 crosses Intent bridge -> PATH -> real durable LEDGER
1789-ok 279 - P1A01 attached raw ข้าว65 crosses Intent bridge -> PATH -> real durable LEDGER
1790-  ---
1791-  duration_ms: 971.390731
1792-  type: 'test'
1793-  ...
1794-# Subtest: P1A02 prohibited group never becomes a PATH request or Runtime mutation
1795-ok 280 - P1A02 prohibited group never becomes a PATH request or Runtime mutation
1796-  ---
1797-  duration_ms: 1.066315
1798-  type: 'test'
1799-  ...
--
1933-ok 303 - P1C106 a scalar reply answers the only waiting numeric slot instead of becoming a new command
1934-  ---
1935-  duration_ms: 0.471282
1936-  type: 'test'
1937-  ...
1938-# Subtest: P1C107 semantic waiting directives are closed to the five approved UI types and numeric waiting maps to ENTER_VALUE without AI
1939-ok 304 - P1C107 semantic waiting directives are closed to the five approved UI types and numeric waiting maps to ENTER_VALUE without AI
1940-  ---
1941-  duration_ms: 0.809615
1942-  type: 'test'
1943-  ...
1944-# Subtest: P1C108 a real paused session carries the Architecture Lock minimum contract including durable baseRevision and semantic directive
1945-ok 305 - P1C108 a real paused session carries the Architecture Lock minimum contract including durable baseRevision and semantic directive
1946-  ---
1947-  duration_ms: 0.769199
1948-  type: 'test'
1949-  ...
1950-# Subtest: LIGHTHOUSE user surfaces use human Thai instead of system/developer copy
1951:not ok 306 - LIGHTHOUSE user surfaces use human Thai instead of system/developer copy
1952-  ---
1953-  duration_ms: 11.390097
1954-  type: 'test'
1955-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-user-copy.test.cjs:9:1'
1956-  failureType: 'testCodeFailure'
1957-  error: |-
1958-    forbidden user copy survived: 'Complete'
1959-    
1960-    true !== false
1961-    
1962-  code: 'ERR_ASSERTION'
1963-  name: 'AssertionError'
1964-  expected: false
1965-  actual: true
1966-  operator: 'strictEqual'
1967-  stack: |-
1968-    TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-user-copy.test.cjs:21:13)
1969-    async Test.run (node:internal/test_runner/test:1054:7)
1970-    async startSubtestAfterBootstrap (node:internal/test_runner/harness:296:3)
1971-  ...
1972-# Subtest: normal Settings copy does not expose raw updater error codes/messages directly
1973-ok 307 - normal Settings copy does not expose raw updater error codes/messages directly
1974-  ---
1975-  duration_ms: 2.478737
1976-  type: 'test'
1977-  ...
1978-# Subtest: locked login surface exposes only password, sign in, and recovery entry actions
1979-ok 308 - locked login surface exposes only password, sign in, and recovery entry actions
1980-  ---
1981-  duration_ms: 1.340779
1982-  type: 'test'
1983-  ...
--
3017-ok 481 - Store workflow allows final projected stock exactly zero
3018-  ---
3019-  duration_ms: 643.045911
3020-  type: 'test'
3021-  ...
3022-# Subtest: Store workflow may repair a negative imported baseline when the committed final stock is non-negative
3023-ok 482 - Store workflow may repair a negative imported baseline when the committed final stock is non-negative
3024-  ---
3025-  duration_ms: 649.233946
3026-  type: 'test'
3027-  ...
3028-# Subtest: Settings is a grouped utility index instead of a fifth working house
3029-ok 483 - Settings is a grouped utility index instead of a fifth working house
3030-  ---
3031-  duration_ms: 1.787309
3032-  type: 'test'
3033-  ...
3034-# Subtest: Backup Import and Restore remain separate concepts and latest backup is only recorded after success
3035:not ok 484 - Backup Import and Restore remain separate concepts and latest backup is only recorded after success
3036-  ---
3037-  duration_ms: 3.488799
3038-  type: 'test'
3039-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/settings-utility.test.cjs:18:1'
3040-  failureType: 'testCodeFailure'
3041-  error: |-
3042-    The input did not match the regular expression /กู้คืนจาก Backup/. Input:
3043-    
3044-    "import { createAppUpdater, capacitorUpdaterBridge, DEFAULT_UPDATE_METADATA_URL } from './app-update.mjs';\n" +
3045-      '\n' +
3046-      'const $=id=>document.getElementById(id);\n' +
3047-      "const LATEST_BACKUP_KEY='metro-settings-latest-backup';\n" +
3048-      'let updateController=null;\n' +
3049-      '\n' +
3050-      "function makeSection(id,title,description=''){\n" +
3051-      "  const section=document.createElement('section');\n" +
3052-      '  section.id=id;\n' +
3053-      "  section.className='settings-utility-panel hidden';\n" +
3054-      '  section.dataset.settingsPanel=id;\n' +
3055-      "  const back=document.createElement('button');\n" +
3056-      "  back.type='button';\n" +
3057-      "  back.className='secondary settings-back-btn';\n" +
3058-      "  back.textContent='‹ ตั้งค่า';\n" +
3059-      "  back.addEventListener('click',showIndex);\n" +
3060-      "  const heading=document.createElement('h3');\n" +
3061-      '  heading.textContent=title;\n' +
3062-      '  section.append(back,heading);\n' +
3063-      "  if(description){const p=document.createElement('p');p.className='muted';p.textContent=description;section.append(p);}\n" +
3064-      '  return section;\n' +
3065-      '}\n' +
3066-      '\n' +
3067-      "function makeIndexRow(target,title,summary=''){\n" +
```

## Summary tail
```text
        makeIndexRow('settingsSecurity','ความปลอดภัย','รหัสผ่านและการล็อกแอป'),
        makeIndexRow('settingsUpdatePanel','การอัปเดตแอป','ตรวจรุ่น · ดาวน์โหลด APK · ติดตั้งผ่าน Android'),
        makeIndexRow('settingsAbout','เกี่ยวกับแอป','เวอร์ชันและข้อมูลแอป'),
        makeIndexRow('settingsAdvanced','ขั้นสูง','กู้คืน · ข้อมูลทางเทคนิค · ล้างข้อมูล')
      );
    
      const usage=makeSection('settingsUsage','การใช้งาน','ยังไม่มีค่าการแสดงผลที่ผู้ใช้ปรับเองในรุ่นนี้ จึงไม่มีสวิตช์จำลอง');
      const permissions=makeSection('settingsPermissions','การแจ้งเตือนและสิทธิ์','สิทธิ์ที่ Android เป็นเจ้าของต้องอ่านสถานะจริงจาก Android ก่อนจึงจะแสดงหรือจัดการได้');
      const permissionState=document.createElement('p');
      permissionState.dataset.permissionOwnerUnavailable='true';
      permissionState.className='muted permission-owner-unavailable';
      permissionState.textContent='สิทธิ์ติดตั้ง APK จัดการจากหน้า “การอัปเดตแอป” เมื่อจำเป็น';
      permissions.append(permissionState);
    
      const data=makeSection('settingsData','ข้อมูลและการสำรอง','สำรองข้อมูล = สร้างสำเนาปัจจุบัน · นำเข้าข้อมูล = เพิ่มข้อมูลภายนอก · กู้คืน = คืนสถานะจากข้อมูลสำรอง');
      const latest=document.createElement('p');latest.id='settingsLatestBackup';latest.className='muted';data.append(latest,dataSection);
      dataSection.querySelector('h3')?.remove();
      const backup=$('backupBtn');if(backup)backup.textContent='สำรองข้อมูล';
      const restore=$('openRestoreRouteBtn');if(restore){restore.textContent='กู้คืนจากข้อมูลสำรอง';restore.classList.remove('hidden');restore.removeAttribute('aria-hidden');restore.tabIndex=0;}
    
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
ok 485 - normal APK update view stays human-facing while Web cache status is advanced
  ---
  duration_ms: 0.606574
  type: 'test'
  ...
# Subtest: Reset All lives only in Advanced Danger Zone and clears local Settings metadata
ok 486 - Reset All lives only in Advanced Danger Zone and clears local Settings metadata
  ---
  duration_ms: 0.507799
  type: 'test'
  ...
# Subtest: permission area never fabricates Android permission truth
ok 487 - permission area never fabricates Android permission truth
  ---
  duration_ms: 0.455311
  type: 'test'
  ...
# Subtest: Settings utility has dedicated presentation styling
ok 488 - Settings utility has dedicated presentation styling
  ---
  duration_ms: 0.264805
  type: 'test'
  ...
1..488
# tests 488
# suites 0
# pass 477
# fail 11
# cancelled 0
# skipped 0
# todo 0
# duration_ms 47880.066979
```
