const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = (path) => fs.readFileSync(path, 'utf8');

test('existing-app Android staging packages sw.js used by the shipped UI', () => {
  const stage = read('android-shell/tools/stage-existing-full-app.mjs');
  assert.match(stage, /['"]sw\.js['"]/);
});

test('existing-app Android staging packages every local asset preloaded by sw.js', () => {
  const stage = read('android-shell/tools/stage-existing-full-app.mjs');
  const worker = read('sw.js');
  assert.match(worker, /\.\/styles\/settings-utility\.css/);
  assert.match(stage, /requiredDirectories\s*=\s*\[[\s\S]*['"]styles['"]/);
  assert.ok(fs.existsSync('styles/settings-utility.css'));
});

test('display identity is LIGHTHOUSE without renaming compatibility storage identifiers', () => {
  const release = read('ui/release-status.mjs');
  assert.match(release, /document\.title\s*=\s*['"]LIGHTHOUSE['"]/);
  assert.match(release, /brand-lockup/);
  assert.match(release, /LIGHTHOUSE/);

  const persistence = read('greenfield/persistence.mjs');
  assert.match(persistence, /ygph-metropolis-greenfield/i);
});

test('bounded typo vocabulary expands only through explicit known aliases', () => {
  const vocabulary = read('lighthouse/intent-vocabulary.mjs');
  assert.match(vocabulary, /ปฎิทิน/);
  assert.match(vocabulary, /น้ำมัน/);
  assert.doesNotMatch(vocabulary, /editDistance|levenshtein|fuzzy/i);
});

test('full APK updater is a Settings-only feature and never replaces app startup', () => {
  const settings = read('ui/settings-ui.mjs');
  const release = read('ui/release-status.mjs');
  const stage = read('android-shell/tools/stage-existing-full-app.mjs');
  assert.match(settings, /app-update\.mjs/);
  assert.match(settings, /settingsUpdatePanel/);
  assert.match(settings, /ตรวจหาอัปเดต/);
  assert.match(settings, /ดาวน์โหลดและติดตั้ง/);
  assert.doesNotMatch(release, /settingsCheckUpdateBtn/);
  assert.doesNotMatch(stage, /app-update\.mjs|canonical-bootstrap\.mjs/);
});
