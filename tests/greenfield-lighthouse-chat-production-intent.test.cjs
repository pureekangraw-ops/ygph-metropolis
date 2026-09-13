const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(process.cwd(), 'lighthouse-next/app.mjs'), 'utf8');

test('CHAT production imports and uses the shared intent interpreter', () => {
  assert.match(app, /from ['"]\.\/chat-intent\.mjs['"]/);
  assert.match(app, /interpretChatIntent\(clean,\s*\{\s*storeProducts:\s*storeTruth\?\.products\s*\|\|\s*\[\]\s*\}\)/);
});

test('CHAT pending recovery imports and uses local slot recovery', () => {
  assert.match(app, /from ['"]\.\/chat-intent-recovery\.mjs['"]/);
  assert.match(app, /recoverIntentSlot\(/);
});
