'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

function fileInput(source, id) {
  return source.match(new RegExp(`<input\\b[^>]*\\bid=["']${id}["'][^>]*>`, 'i'))?.[0] || '';
}

test('METRO documents picker-open runtime-strict as the file intake rule', () => {
  const policy = read('docs/file-intake-compatibility.md');
  assert.match(policy, /Picker open|picker.*open/i);
  assert.match(policy, /Runtime strict|runtime.*strict/i);
  assert.match(policy, /MIME.*not.*security|MIME.*not.*proof|MIME.*ไม่ใช่.*หลักฐาน/i);
  assert.match(policy, /content.*validat|เนื้อหา.*ตรวจ/i);
});

test('known JSON intake doors keep JSON UX hints and validate content in-app', () => {
  const index = read('index.html');
  const app = read('app.mjs');
  const uiApp = read('ui/app.mjs');
  const settingsImport = read('ui/obligation-import-ui.mjs');

  assert.match(fileInput(index, 'evidenceFile'), /accept=["']application\/json,\.json["']/i);
  assert.match(fileInput(index, 'restoreFile'), /accept=["']application\/json,\.json["']/i);
  assert.match(app, /id=["']restoreFile["'][^>]*type=["']file["'][^>]*accept=["']application\/json,\.json["']/i);
  assert.match(settingsImport, /input\.accept\s*=\s*["']application\/json,\.json["']/i);

  assert.match(uiApp, /function\s+jsonFile\([^)]*\)[\s\S]*JSON\.parse\(await file\.text\(\)\)/);
  assert.match(app, /async function selectedBackup\(\)[\s\S]*JSON\.parse\(await file\.text\(\)\)/);
  assert.match(app, /prepareBackupForRestore\(/);
  assert.match(settingsImport, /JSON\.parse\(await file\.text\(\)\)/);
  assert.match(settingsImport, /detectMetroImport\(/);
  assert.match(settingsImport, /validateForKind\(/);
  assert.match(settingsImport, /verifyPortableGreenfieldBackup\(/);
});

test('LIGHTHOUSE custom extension picker is unrestricted while runtime stays strict', () => {
  const index = read('android-shell/www/index.html');
  const runtime = read('android-shell/www/patch/patch-runtime.mjs');
  const contract = read('android-shell/www/patch/patch-contract.mjs');
  const picker = fileInput(index, 'patch-file');

  assert.ok(picker, 'LIGHTHOUSE patch picker must exist');
  assert.doesNotMatch(picker, /\baccept\s*=/i, 'custom extension must not be blocked by OS picker hints');
  assert.match(runtime, /parseSelectedPatchFile\(/);
  assert.match(runtime, /endsWith\(['"]\.lhpatch['"]\)/);
  assert.match(runtime, /JSON\.parse\(await file\.text\(\)\)/);
  assert.match(runtime, /verifyPatchBundle\(/);
  assert.match(contract, /PATCH_SCHEMA\s*=\s*['"]lighthouse\.patch\.v1['"]/);
  assert.match(contract, /PATCH_MAX_BYTES\s*=\s*2\s*\*\s*1024\s*\*\s*1024/);
  assert.match(contract, /SHA-256/);
  assert.match(contract, /ECDSA/);
  assert.match(contract, /keyId/);
  assert.match(contract, /currentVersion/);
});
