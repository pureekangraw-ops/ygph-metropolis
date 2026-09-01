const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.mjs'), 'utf8');
const importer = fs.readFileSync(path.join(root, 'ui', 'obligation-import-ui.mjs'), 'utf8');
const releaseStatus = fs.readFileSync(path.join(root, 'ui', 'release-status.mjs'), 'utf8');

test('Settings exposes one additive import door without asking the user to choose an internal file type while Restore stays separate', () => {
  assert.match(html, /id="settingsDialog"/);
  assert.match(html, /id="backupBtn"/);
  assert.match(importer, /settingsImportFile/);
  assert.match(importer, /settingsImportBtn/);
  assert.match(importer, /นำเข้าข้อมูล/);
  assert.match(importer, /สำรองข้อมูล/);
  assert.match(importer, /openRestoreRouteBtn/);
  assert.match(importer, /classList\.remove\(['"]hidden['"]\)/);
  assert.match(importer, /BACKUP_RESTORE_ROUTE_REQUIRED/);
  assert.doesNotMatch(importer, /data-city-action-open=[\\"']finance-actions/);
  assert.doesNotMatch(importer, /นำเข้าการเงินจากไฟล์/);
  assert.doesNotMatch(importer, /รองรับ YGPH_METRO_FINANCE_SEED/);
});

test('one import router detects backup, finance seed, and obligation payload and gives human previews', async () => {
  const routerPath = path.join(root, 'greenfield', 'import-router.mjs');
  assert.equal(fs.existsSync(routerPath), true, 'greenfield/import-router.mjs must own document detection');
  const { detectMetroImport, previewMetroImport } = await import(pathToFileURL(routerPath).href);

  const backup = { backupFormat:'ygph-metropolis-greenfield-backup', backupVersion:1 };
  const financeSeed = { format:'YGPH_METRO_FINANCE_SEED', commands:[{}, {}] };
  const obligation = { format:'YGPH_METROPOLIS_RUNTIME_PAYLOAD', entryPoint:'runtime.obligation', installments:[{}, {}] };

  assert.equal(detectMetroImport(backup), 'BACKUP');
  assert.equal(detectMetroImport(financeSeed), 'FINANCE_SEED');
  assert.equal(detectMetroImport(obligation), 'OBLIGATION');
  assert.match(previewMetroImport(backup), /แทนที่ข้อมูลปัจจุบันทั้งหมด/);
  assert.match(previewMetroImport(financeSeed), /เพิ่ม 2 รายการ/);
  assert.match(previewMetroImport(obligation), /ภาระ 1 รายการ.*กำหนดชำระ 2 รายการ/);
  assert.throws(() => detectMetroImport({ hello:'world' }), /UNSUPPORTED_METRO_IMPORT/);
});

test('additive import uses existing mutation authorities while backup restore stays owned by the app recovery route', () => {
  assert.match(importer, /detectMetroImport/);
  assert.match(importer, /previewMetroImport/);
  assert.match(importer, /runtime\.importFinanceSeed/);
  assert.match(importer, /verifyFinanceSeedReadback/);
  assert.match(importer, /runtime\.obligation/);
  assert.match(importer, /verifyObligationImportReadback/);
  assert.doesNotMatch(importer, /openGreenfieldRuntimeFromBackup/);
  assert.match(app, /openGreenfieldRuntimeFromBackup/);
  assert.match(app, /performRestore/);
});

test('update log tells the device owner that one import door has shipped', () => {
  assert.match(releaseStatus, /24 ส\.ค\. 2026 · 08:15/);
  assert.match(releaseStatus, /นำเข้าไฟล์/);
  assert.match(releaseStatus, /ตรวจไฟล์.*เลือกวิธีนำเข้า/);
});
