const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appPath = path.join(process.cwd(), 'lighthouse-next/app.mjs');

function readApp() {
  assert.equal(fs.existsSync(appPath), true, 'missing lighthouse-next/app.mjs');
  return fs.readFileSync(appPath, 'utf8');
}

test('CHAT pending intent recovery uses local slot repair instead of reparsing the whole utterance', () => {
  const app = readApp();
  assert.match(app, /from ['"]\.\/chat-intent-recovery\.mjs['"]/);
  assert.match(app, /recoverIntentSlot/);
});
