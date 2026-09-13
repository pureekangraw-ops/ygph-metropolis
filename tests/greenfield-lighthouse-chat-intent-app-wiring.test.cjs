const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appPath = path.join(process.cwd(), 'lighthouse-next/app.mjs');

function readApp() {
  assert.equal(fs.existsSync(appPath), true, 'missing lighthouse-next/app.mjs');
  return fs.readFileSync(appPath, 'utf8');
}

test('CHAT production path consumes the central intent interpreter instead of independently chaining Store and income parsers', () => {
  const app = readApp();
  assert.match(app, /from ['"]\.\/chat-intent\.mjs['"]/);
  assert.match(app, /interpretChatIntent/);
  const start = app.indexOf('async function handleChatInput');
  assert.notEqual(start, -1, 'missing handleChatInput');
  const end = app.indexOf('function submitChatText', start);
  assert.notEqual(end, -1, 'missing submitChatText');
  const body = app.slice(start, end);
  assert.match(body, /interpretChatIntent\(clean,/);
  assert.doesNotMatch(body, /parseStoreSale\(clean,/);
  assert.doesNotMatch(body, /parseGeneralIncome\(clean\)/);
});
