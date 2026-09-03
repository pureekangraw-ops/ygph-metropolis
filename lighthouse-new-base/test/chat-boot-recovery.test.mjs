import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync(new URL('../main.mjs', import.meta.url), 'utf8');

test('product boot recovers durable CHAT work before projecting the first interactive app frame', () => {
  const recoverIndex = main.indexOf('await chatController.recover()');
  const modelReadIndex = main.indexOf('await browserModel.read(today)');
  const appStartIndex = main.indexOf('app.start()');
  assert.ok(recoverIndex >= 0, 'startProduct must invoke chatController.recover()');
  assert.ok(modelReadIndex >= 0, 'startProduct must read the browser model');
  assert.ok(appStartIndex >= 0, 'startProduct must start the browser app');
  assert.ok(recoverIndex < modelReadIndex, 'CHAT recovery must happen before the first projected model read');
  assert.ok(recoverIndex < appStartIndex, 'CHAT recovery must complete before the UI becomes interactive');
});
