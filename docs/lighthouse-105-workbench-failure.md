# LIGHTHOUSE 1.0.5 Gate D/E web diagnostic

Exit code: 1

## Failed tests
```text
1205-ok 200 - P1Q02 UI highlights a question and searches durable records 10 -> 6 -> 1 without writes
1206-  ---
1207-  duration_ms: 6034.693336
1208-  type: 'test'
1209-  ...
1210-# Subtest: P1Q03 duplicates select newest recording time, not insertion order or business date
1211-ok 201 - P1Q03 duplicates select newest recording time, not insertion order or business date
1212-  ---
1213-  duration_ms: 1773.619682
1214-  type: 'test'
1215-  ...
1216-# Subtest: P1Q04 no exact amount match reports not found rather than choosing a nearby amount
1217-ok 202 - P1Q04 no exact amount match reports not found rather than choosing a nearby amount
1218-  ---
1219-  duration_ms: 1668.479941
1220-  type: 'test'
1221-  ...
1222-# Subtest: P1Q05 correcting a question rejoins its query instead of turning into a create
1223:not ok 203 - P1Q05 correcting a question rejoins its query instead of turning into a create
1224-  ---
1225-  duration_ms: 1264.333253
1226-  type: 'test'
1227-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-intent-question.test.cjs:98:1'
1228-  failureType: 'testCodeFailure'
1229-  error: |-
1230-    Expected values to be strictly equal:
1231-    
1232-    'WAITING' !== 'รอ'
1233-    
1234-  code: 'ERR_ASSERTION'
1235-  name: 'AssertionError'
1236-  expected: 'รอ'
1237-  actual: 'WAITING'
1238-  operator: 'strictEqual'
1239-  stack: |-
1240-    TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-intent-question.test.cjs:103:12)
1241-    async Test.run (node:internal/test_runner/test:1054:7)
1242-    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
1243-  ...
1244-# Subtest: P1Q06 questions preserve prohibition, condition and unsupported multi-group boundaries
1245-ok 204 - P1Q06 questions preserve prohibition, condition and unsupported multi-group boundaries
1246-  ---
1247-  duration_ms: 1087.59929
1248-  type: 'test'
1249-  ...
1250-# Subtest: P1Q07 unrepresented query units or clock time are not discarded to return a match
1251-ok 205 - P1Q07 unrepresented query units or clock time are not discarded to return a match
1252-  ---
1253-  duration_ms: 1311.2216
1254-  type: 'test'
1255-  ...
--
1695-ok 279 - unknown title plus amount is NO_MATCH, not guessed expense
1696-  ---
1697-  duration_ms: 1.287295
1698-  type: 'test'
1699-  ...
1700-# Subtest: unsafe or ambiguous money is NO_MATCH
1701-ok 280 - unsafe or ambiguous money is NO_MATCH
1702-  ---
1703-  duration_ms: 0.509856
1704-  type: 'test'
1705-  ...
1706-# Subtest: P1F01 production Master Input walks local Direct intent through explicit execute to real durable LEDGER readback
1707-ok 281 - P1F01 production Master Input walks local Direct intent through explicit execute to real durable LEDGER readback
1708-  ---
1709-  duration_ms: 1480.462682
1710-  type: 'test'
1711-  ...
1712-# Subtest: P1F02 production recovery walks invalid -> still invalid -> valid -> explicit execute and reaches real durable truth
1713:not ok 282 - P1F02 production recovery walks invalid -> still invalid -> valid -> explicit execute and reaches real durable truth
1714-  ---
1715-  duration_ms: 469.624221
1716-  type: 'test'
1717-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-phase1-final-gate.test.cjs:23:1'
1718-  failureType: 'testCodeFailure'
1719-  error: |-
1720-    Expected values to be strictly equal:
1721-    
1722-    'WAITING' !== 'รอ'
1723-    
1724-  code: 'ERR_ASSERTION'
1725-  name: 'AssertionError'
1726-  expected: 'รอ'
1727-  actual: 'WAITING'
1728-  operator: 'strictEqual'
1729-  stack: |-
1730-    TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-phase1-final-gate.test.cjs:26:12)
1731-    async Test.run (node:internal/test_runner/test:1054:7)
1732-    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
1733-  ...
1734-# Subtest: P1F03 production front door keeps prohibition and understood unsupported condition stopped before provider and Runtime
1735-ok 283 - P1F03 production front door keeps prohibition and understood unsupported condition stopped before provider and Runtime
1736-  ---
1737-  duration_ms: 663.986373
1738-  type: 'test'
1739-  ...
1740-# Subtest: P1F04 whole-input replacement exits recovery, becomes a fresh routable input, and still requires explicit execute
1741:not ok 284 - P1F04 whole-input replacement exits recovery, becomes a fresh routable input, and still requires explicit execute
1742-  ---
1743-  duration_ms: 574.15927
1744-  type: 'test'
1745-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-phase1-final-gate.test.cjs:60:1'
1746-  failureType: 'testCodeFailure'
1747-  error: |-
1748-    Expected values to be strictly equal:
1749-    
1750-    'WAITING' !== 'รอ'
1751-    
1752-  code: 'ERR_ASSERTION'
1753-  name: 'AssertionError'
1754-  expected: 'รอ'
1755-  actual: 'WAITING'
1756-  operator: 'strictEqual'
1757-  stack: |-
1758-    TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-phase1-final-gate.test.cjs:63:12)
1759-    async Test.run (node:internal/test_runner/test:1054:7)
1760-    async Test.processPendingSubtests (node:internal/test_runner/test:744:7)
1761-  ...
1762-# Subtest: P1A01 attached raw ข้าว65 crosses Intent bridge -> PATH -> real durable LEDGER
1763-ok 285 - P1A01 attached raw ข้าว65 crosses Intent bridge -> PATH -> real durable LEDGER
1764-  ---
1765-  duration_ms: 1395.446423
1766-  type: 'test'
1767-  ...
1768-# Subtest: P1A02 prohibited group never becomes a PATH request or Runtime mutation
1769-ok 286 - P1A02 prohibited group never becomes a PATH request or Runtime mutation
1770-  ---
1771-  duration_ms: 1.206874
1772-  type: 'test'
1773-  ...
--
1907-ok 309 - P1C106 a scalar reply answers the only waiting numeric slot instead of becoming a new command
1908-  ---
1909-  duration_ms: 0.499567
1910-  type: 'test'
1911-  ...
1912-# Subtest: P1C107 semantic waiting directives are closed to the five approved UI types and numeric waiting maps to ENTER_VALUE without AI
1913-ok 310 - P1C107 semantic waiting directives are closed to the five approved UI types and numeric waiting maps to ENTER_VALUE without AI
1914-  ---
1915-  duration_ms: 0.798998
1916-  type: 'test'
1917-  ...
1918-# Subtest: P1C108 a real paused session carries the Architecture Lock minimum contract including durable baseRevision and semantic directive
1919-ok 311 - P1C108 a real paused session carries the Architecture Lock minimum contract including durable baseRevision and semantic directive
1920-  ---
1921-  duration_ms: 0.740248
1922-  type: 'test'
1923-  ...
1924-# Subtest: LIGHTHOUSE user surfaces use human Thai instead of system/developer copy
1925:not ok 312 - LIGHTHOUSE user surfaces use human Thai instead of system/developer copy
1926-  ---
1927-  duration_ms: 12.316915
1928-  type: 'test'
1929-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-user-copy.test.cjs:9:1'
1930-  failureType: 'testCodeFailure'
1931-  error: |-
1932-    forbidden user copy survived: 'Complete'
1933-    
1934-    true !== false
1935-    
1936-  code: 'ERR_ASSERTION'
1937-  name: 'AssertionError'
1938-  expected: false
1939-  actual: true
1940-  operator: 'strictEqual'
1941-  stack: |-
1942-    TestContext.<anonymous> (/home/runner/work/ygph-metropolis/ygph-metropolis/tests/greenfield-lighthouse-user-copy.test.cjs:21:13)
1943-    async Test.run (node:internal/test_runner/test:1054:7)
1944-    async startSubtestAfterBootstrap (node:internal/test_runner/harness:296:3)
1945-  ...
1946-# Subtest: normal Settings copy does not expose raw updater error codes/messages directly
1947-ok 313 - normal Settings copy does not expose raw updater error codes/messages directly
1948-  ---
1949-  duration_ms: 3.021951
1950-  type: 'test'
1951-  ...
1952-# Subtest: locked login surface exposes only password, sign in, and recovery entry actions
1953-ok 314 - locked login surface exposes only password, sign in, and recovery entry actions
1954-  ---
1955-  duration_ms: 1.234456
1956-  type: 'test'
1957-  ...
--
2991-ok 487 - Store workflow allows final projected stock exactly zero
2992-  ---
2993-  duration_ms: 654.491016
2994-  type: 'test'
2995-  ...
2996-# Subtest: Store workflow may repair a negative imported baseline when the committed final stock is non-negative
2997-ok 488 - Store workflow may repair a negative imported baseline when the committed final stock is non-negative
2998-  ---
2999-  duration_ms: 669.087458
3000-  type: 'test'
3001-  ...
3002-# Subtest: Settings is a grouped utility index instead of a fifth working house
3003-ok 489 - Settings is a grouped utility index instead of a fifth working house
3004-  ---
3005-  duration_ms: 1.758276
3006-  type: 'test'
3007-  ...
3008-# Subtest: Backup Import and Restore remain separate concepts and latest backup is only recorded after success
3009:not ok 490 - Backup Import and Restore remain separate concepts and latest backup is only recorded after success
3010-  ---
3011-  duration_ms: 3.420583
3012-  type: 'test'
3013-  location: '/home/runner/work/ygph-metropolis/ygph-metropolis/tests/settings-utility.test.cjs:18:1'
3014-  failureType: 'testCodeFailure'
3015-  error: |-
3016-    The input did not match the regular expression /กู้คืนจาก Backup/. Input:
3017-    
3018-    "import { createAppUpdater, capacitorUpdaterBridge, DEFAULT_UPDATE_METADATA_URL } from './app-update.mjs';\n" +
3019-      '\n' +
3020-      'const $=id=>document.getElementById(id);\n' +
3021-      "const LATEST_BACKUP_KEY='metro-settings-latest-backup';\n" +
3022-      'let updateController=null;\n' +
3023-      '\n' +
3024-      "function makeSection(id,title,description=''){\n" +
3025-      "  const section=document.createElement('section');\n" +
3026-      '  section.id=id;\n' +
3027-      "  section.className='settings-utility-panel hidden';\n" +
3028-      '  section.dataset.settingsPanel=id;\n' +
3029-      "  const back=document.createElement('button');\n" +
3030-      "  back.type='button';\n" +
3031-      "  back.className='secondary settings-back-btn';\n" +
3032-      "  back.textContent='‹ ตั้งค่า';\n" +
3033-      "  back.addEventListener('click',showIndex);\n" +
3034-      "  const heading=document.createElement('h3');\n" +
3035-      '  heading.textContent=title;\n' +
3036-      '  section.append(back,heading);\n' +
3037-      "  if(description){const p=document.createElement('p');p.className='muted';p.textContent=description;section.append(p);}\n" +
3038-      '  return section;\n' +
3039-      '}\n' +
3040-      '\n' +
3041-      "function makeIndexRow(target,title,summary=''){\n" +
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
ok 491 - normal APK update view stays human-facing while Web cache status is advanced
  ---
  duration_ms: 0.615093
  type: 'test'
  ...
# Subtest: Reset All lives only in Advanced Danger Zone and clears local Settings metadata
ok 492 - Reset All lives only in Advanced Danger Zone and clears local Settings metadata
  ---
  duration_ms: 0.508092
  type: 'test'
  ...
# Subtest: permission area never fabricates Android permission truth
ok 493 - permission area never fabricates Android permission truth
  ---
  duration_ms: 0.423123
  type: 'test'
  ...
# Subtest: Settings utility has dedicated presentation styling
ok 494 - Settings utility has dedicated presentation styling
  ---
  duration_ms: 0.263244
  type: 'test'
  ...
1..494
# tests 494
# suites 0
# pass 489
# fail 5
# cancelled 0
# skipped 0
# todo 0
# duration_ms 54088.331537
```
