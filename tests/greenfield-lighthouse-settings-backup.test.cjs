const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = process.cwd();
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('LIGHTHOUSE Settings backup borrows the active Runtime session and never touches Chat intent', async () => {
  const modulePath = path.join(root, 'lighthouse-next/settings-operations.mjs');
  assert.equal(fs.existsSync(modulePath), true, 'settings operations module must exist');
  const source = read('lighthouse-next/settings-operations.mjs');
  assert.match(source, /withRuntimeSession/);
  assert.match(source, /runtime\.exportBackup\(/);
  assert.doesNotMatch(source, /submitChatText|parseGeneralIncome|parseStoreSale|intent/i);

  const { createSettingsBackup } = await import(modulePath);
  let calls = 0;
  const result = await createSettingsBackup({
    withSession: async operation => operation({
      exportBackup: async () => { calls += 1; return { format:'YGPH_GREENFIELD_BACKUP', version:1 }; },
    }),
  });
  assert.equal(calls, 1);
  assert.equal(result.format, 'YGPH_GREENFIELD_BACKUP');
});

test('Settings surface exposes one human backup action and stages the module into release bundles', () => {
  const html = read('lighthouse-next/index.html');
  const stage = read('scripts/stage-lighthouse-next-bundle.mjs');
  const pkg = read('package.json');

  assert.match(html, /id="backup-data"/);
  assert.match(html, /สำรองข้อมูล/);
  assert.match(html, /settings-operations\.mjs/);
  assert.match(stage, /'settings-operations\.mjs'/);
  assert.match(pkg, /node --check lighthouse-next\/settings-operations\.mjs/);
});
