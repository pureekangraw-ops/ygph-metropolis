const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const appPath = path.join(root, 'lighthouse-next/app.mjs');

function readApp() {
  assert.equal(fs.existsSync(appPath), true, 'missing lighthouse-next/app.mjs');
  return fs.readFileSync(appPath, 'utf8');
}

function functionBody(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `missing ${name}`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : source.length;
  assert.notEqual(end, -1, `missing ${nextName}`);
  return source.slice(start, end);
}

test('LIGHTHOUSE CHAT imports the real Store bridge and adaptive product parser', () => {
  const app = readApp();
  assert.match(app, /from ['"]\.\/runtime-store\.mjs['"]/);
  assert.match(app, /createLighthouseStoreBridge/);
  assert.match(app, /from ['"]\.\/store-product\.mjs['"]/);
  for (const symbol of ['parseProductAddText', 'suggestProductQuestion', 'resolveProductDraft']) {
    assert.match(app, new RegExp(`\\b${symbol}\\b`));
  }
  assert.match(app, /const storeBridge\s*=\s*createLighthouseStoreBridge\(\)/);
  assert.match(app, /let storeTruth\s*=\s*null/);
});

test('login loads real Store truth before showing the app and lock clears it', () => {
  const app = readApp();
  const login = functionBody(app, 'submitLogin', 'submitRecovery');
  const storeRead = login.indexOf('storeTruth = await storeBridge.readStoreTruth()');
  const show = login.indexOf('showApp()');
  assert.ok(storeRead >= 0, 'login must read Store truth');
  assert.ok(show > storeRead, 'Store truth must load before showApp');
  assert.match(login, /storeTruth\s*=\s*null/);

  const lock = functionBody(app, 'lockApp', 'selectRoot');
  assert.match(lock, /storeTruth\s*=\s*null/);
});

test('localStorage keeps UI pending state but never authoritative Product inventory', () => {
  const app = readApp();
  const save = functionBody(app, 'saveState', 'formatBaht');
  assert.doesNotMatch(save, /products\s*:\s*state\.products/);

  const load = functionBody(app, 'loadState', 'saveState');
  assert.doesNotMatch(load, /normalizeStoredProducts\(parsed\.products\)/);
});

test('real add/restock confirmation owns stable retry identity and delegates to exactly one Store bridge mutation', () => {
  const app = readApp();
  assert.match(app, /kind\s*:\s*['"]STORE_PRODUCT_ADD['"]/);
  for (const field of ['workflowId', 'productId', 'stockRecordId']) {
    assert.match(app, new RegExp(`if \\(!pending\\.${field}\\)`), `${field} must be allocated only when absent`);
  }
  assert.match(app, /await storeBridge\.createProductWithStock\(/);
  assert.match(app, /await storeBridge\.addProductStock\(/);
  assert.match(app, /ยังบันทึกไม่สำเร็จ รายการยังค้างอยู่ ลองอีกครั้งได้/);

  const createCall = (app.match(/await storeBridge\.createProductWithStock\(/g) || []).length;
  const restockCall = (app.match(/await storeBridge\.addProductStock\(/g) || []).length;
  assert.equal(createCall, 1, 'new product path must call createProductWithStock once');
  assert.equal(restockCall, 1, 'restock path must call addProductStock once');
});

test('real add/restock path never mutates demo Product stock authority', () => {
  const app = readApp();
  const start = app.indexOf('async function confirmStoreProductAdd');
  assert.notEqual(start, -1, 'missing confirmStoreProductAdd');
  const end = app.indexOf('function confirmStoreSale', start);
  assert.notEqual(end, -1, 'missing following sale function');
  const body = app.slice(start, end);
  assert.doesNotMatch(body, /state\.products/);
  assert.doesNotMatch(body, /\.stock\s*[+\-]=/);
  assert.doesNotMatch(body, /\.stock\s*=/);
});
