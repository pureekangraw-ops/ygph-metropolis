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

test('paid sale parsing resolves only against durable Store truth', () => {
  const app = readApp();
  const handle = functionBody(app, 'handleChatInput', 'submitChatText');
  assert.match(handle, /parseStoreSale\(clean,\s*storeTruth\?\.products\s*\|\|\s*\[\]\)/);
  assert.doesNotMatch(handle, /parseStoreSale\(clean,\s*state\.products\)/);
});

test('paid sale pending owns stable Store and Ledger retry identities plus deterministic total', () => {
  const app = readApp();
  for (const field of ['workflowId', 'saleId', 'ledgerTransactionId']) {
    assert.match(app, new RegExp(`if \\(!pending\\.${field}\\)`), `${field} must be allocated only when absent`);
  }
  for (const field of ['priceBaht', 'priceBasis', 'totalBaht']) {
    assert.match(app, new RegExp(`\\b${field}\\b`));
  }
  const total = functionBody(app, 'totalSaleBaht', 'confirmStoreSale');
  assert.match(total, /priceBasis\s*===\s*['"]TOTAL['"]/);
  assert.match(total, /priceBasis\s*===\s*['"]UNIT['"]/);
  assert.match(total, /priceBaht\s*\*\s*pending\.quantity/);
  assert.match(total, /quantity\s*===\s*1/);
  assert.match(total, /LIGHTHOUSE_STORE_PRICE_BASIS_REQUIRED/);
});

test('paid sale asks only for missing quantity, price, or unit-vs-total basis before confirmation', () => {
  const app = readApp();
  assert.match(app, /ขายเท่าไหร่ครับ\?/);
  assert.match(app, /จำนวนสินค้า/);
  assert.match(app, /ราคานี้เป็นราคาต่อชิ้นหรือยอดรวมครับ\?/);
  assert.match(app, /STORE_SALE_PRICE_BASIS/);
});

test('paid sale confirmation delegates to one atomic Store mutation and refreshes both truths', () => {
  const app = readApp();
  const body = functionBody(app, 'confirmStoreSale', 'confirmPending');
  assert.match(body, /await storeBridge\.sellProduct\(/);
  assert.equal((body.match(/await storeBridge\.sellProduct\(/g) || []).length, 1, 'sale must delegate exactly once');
  assert.match(body, /await storeBridge\.readStoreTruth\(\)/);
  assert.match(body, /await ledgerBridge\.readLedgerTruth\(\)/);
  assert.match(body, /สินค้าไม่พอ/);
  assert.match(body, /ยังบันทึกไม่สำเร็จ รายการยังค้างอยู่ ลองอีกครั้งได้/);
});

test('real paid sale path never mutates demo cash, stock, or transaction authority', () => {
  const app = readApp();
  const body = functionBody(app, 'confirmStoreSale', 'confirmPending');
  assert.doesNotMatch(body, /state\.products/);
  assert.doesNotMatch(body, /product\.stock\s*[+\-]=/);
  assert.doesNotMatch(body, /state\.cash\s*[+\-]=/);
  assert.doesNotMatch(body, /state\.todayIncome\s*[+\-]=/);
  assert.doesNotMatch(body, /state\.transactions\.push/);
});

test('Manual Store renders durable Product attributes and quantity instead of demo inventory', () => {
  const app = readApp();
  const body = functionBody(app, 'renderStoreDetail', 'renderCalendarDetail');
  assert.match(body, /storeTruth\?\.products\s*\|\|\s*\[\]/);
  assert.doesNotMatch(body, /state\.products/);
  for (const field of ['name', 'model', 'color', 'descriptors', 'quantity']) {
    assert.match(body, new RegExp(`product\\.${field}\\b`), `Manual Store must render Product ${field}`);
  }
});

test('Manual Store keeps legacy unassigned stock separate from named Product inventory', () => {
  const app = readApp();
  const body = functionBody(app, 'renderStoreDetail', 'renderCalendarDetail');
  assert.match(body, /storeTruth\?\.legacyUnassignedQuantity/);
  assert.match(body, /สต็อกเดิมที่ยังไม่ผูกสินค้า/);
});
