const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const importer = fs.readFileSync(path.join(root, 'ui', 'obligation-import-ui.mjs'), 'utf8');

test('Settings exposes one normal import door without asking the user to choose an internal file type', () => {
  const settings = html.match(/<dialog id="settingsDialog"[\s\S]*?<\/dialog>/)?.[0] || '';
  assert.match(settings, /<h3>ข้อมูลของฉัน<\/h3>/);
  assert.match(settings, /id="settingsImportFile"[^>]*type="file"/);
  assert.match(settings, /id="settingsImportBtn"[^>]*>นำเข้าไฟล์<\/button>/);
  assert.match(settings, /id="backupBtn"[^>]*>สำรองข้อมูล<\/button>/);
  assert.equal((settings.match(/type="file"/g) || []).length, 1);
  assert.doesNotMatch(settings, />Restore</);
  assert.doesNotMatch(settings, />Backup</);
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

test('one import UI routes through existing mutation authorities and reads back after additive imports', () => {
  assert.match(importer, /detectMetroImport/);
  assert.match(importer, /previewMetroImport/);
  assert.match(importer, /runtime\.importFinanceSeed/);
  assert.match(importer, /verifyFinanceSeedReadback/);
  assert.match(importer, /runtime\.obligation/);
  assert.match(importer, /verifyObligationImportReadback/);
  assert.match(importer, /openGreenfieldRuntimeFromBackup/);
});
