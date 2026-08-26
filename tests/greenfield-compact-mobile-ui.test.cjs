const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const importUi = fs.readFileSync(path.join(root, 'ui', 'obligation-import-ui.mjs'), 'utf8');
const releaseStatus = fs.readFileSync(path.join(root, 'ui', 'release-status.mjs'), 'utf8');

test('compact mobile layout preserves touch targets while reducing oversized chrome', () => {
  assert.match(css, /button\{[^}]*min-height:44px/s);
  assert.match(css, /\.city-action-launcher\.primary-action\{[^}]*min-height:44px/s);
  assert.match(css, /\.city-inspection-links button\{[^}]*min-height:48px/s);
  assert.match(css, /\.compact-status\{[^}]*margin:/s);
  assert.match(css, /@media\(max-width:700px\)[\s\S]*\.finance-schedule\{[^}]*padding:/s);
});

test('Settings replaces the native visible file control with a compact choose-file row', () => {
  assert.match(importUi, /settingsChooseImportFileBtn/);
  assert.match(importUi, /settingsImportFileName/);
  assert.match(importUi, /input\.className='settings-file-native hidden'/);
  assert.match(importUi, /input\.click\(\)/);
  assert.match(importUi, /fileName\.textContent=file\.name/);
  assert.match(importUi, /actionRow\.insertBefore\(button,\s*backupButton\)/);
});

test('Update Log is collapsed by default and expands only on request', () => {
  assert.match(releaseStatus, /document\.createElement\('details'\)/);
  assert.match(releaseStatus, /document\.createElement\('summary'\)/);
  assert.match(releaseStatus, /update-log-summary/);
  assert.match(releaseStatus, /update-log-body/);
});
