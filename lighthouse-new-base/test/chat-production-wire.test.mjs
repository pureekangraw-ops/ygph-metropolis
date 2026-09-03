import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync(new URL('../main.mjs', import.meta.url), 'utf8');

test('production entry creates durable CHAT store/controller and passes it to the single browser app', () => {
  assert.match(main, /createChatStore/);
  assert.match(main, /createChatController/);
  assert.match(main, /createExpenseChatBridge/);
  assert.match(main, /createBrowserApp\(\{[\s\S]*?\bchatController(?:\s*:|\s*,)/);
  assert.doesNotMatch(main, /chat:\s*\{\s*messages:\s*\[\]\s*\}/);
});

test('production CHAT bridge borrows the active Runtime owner instead of creating a second money owner', () => {
  assert.match(main, /withRuntimeSession/);
  assert.match(main, /createExpenseChatBridge\(\{\s*runtime/);
});
