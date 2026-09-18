const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');

const root = process.cwd();
const modulePath = path.join(root, 'lighthouse-next', 'chat-read.mjs');
const appPath = path.join(root, 'lighthouse-next', 'app.mjs');

async function loadRead() {
  assert.equal(fs.existsSync(modulePath), true, 'missing lighthouse-next/chat-read.mjs');
  return import(`${pathToFileURL(modulePath).href}?t=${Date.now()}-${Math.random()}`);
}

function fixture() {
  const calls = [];
  const ledgerBridge = {
    async readLedgerTruth() {
      calls.push('readLedgerTruth');
      return { balanceSatang:42000, todayInSatang:12500, todayOutSatang:3000, netSatang:9500, transactions:[{ recordId:'tx-1', type:'TRANSACTION', direction:'IN', title:'ทิป', amountSatang:5900 }] };
    },
    async readIncomeTruth() {
      calls.push('readIncomeTruth');
      return { balanceSatang:42000, todayInSatang:12500, todayOutSatang:3000, netSatang:9500, transactions:[], outstandingReceivableSatang:7000, receivables:[] };
    },
    async readRideTruth() {
      calls.push('readRideTruth');
      return { recordCount:2, todayRoundState:'ACTIVE', generatedSatang:18000, cashJobSatang:12000, creditJobSatang:6000, expenseSatang:2000, pendingCreditSatang:6000 };
    },
    async readCalendarTruth() {
      calls.push('readCalendarTruth');
      return { total:1, byStatus:{ OPEN:1 }, records:[{ recordId:'cal-1', type:'VERIFY', title:'นัด', dueDate:'2026-09-14', status:'OPEN' }] };
    },
    recordExpense() { throw new Error('MUTATION_CALLED'); },
    recordOtherIncome() { throw new Error('MUTATION_CALLED'); },
  };
  const storeBridge = {
    async readStoreTruth() {
      calls.push('readStoreTruth');
      return { products:[{ productId:'p1', name:'มือถือ', quantity:3 }], legacyUnassignedQuantity:0 };
    },
    sellProduct() { throw new Error('MUTATION_CALLED'); },
  };
  return { calls, ledgerBridge, storeBridge };
}

test('shared CHAT read capability resolves each query through read-only owner bridges', async () => {
  const { createChatReadCapability } = await loadRead();
  const expected = [
    ['STORE_SUMMARY', 'readStoreTruth', 'STORE'],
    ['RIDE_SUMMARY', 'readRideTruth', 'RIDE'],
    ['CALENDAR_LIST', 'readCalendarTruth', 'CALENDAR'],
    ['LEDGER_LIST', 'readLedgerTruth', 'LEDGER'],
    ['INCOME_SUMMARY', 'readIncomeTruth', 'INCOME'],
  ];
  for (const [query, call, domain] of expected) {
    const fx = fixture();
    const capability = createChatReadCapability({ ledgerBridge:fx.ledgerBridge, storeBridge:fx.storeBridge });
    const result = await capability.resolve(query);
    assert.equal(result.status, 'READY');
    assert.equal(result.domain, domain);
    assert.deepEqual(fx.calls, [call], query);
  }
});

test('shared CHAT read capability fails closed on unknown query and never mutates', async () => {
  const { createChatReadCapability } = await loadRead();
  const fx = fixture();
  const capability = createChatReadCapability({ ledgerBridge:fx.ledgerBridge, storeBridge:fx.storeBridge });
  await assert.rejects(() => capability.resolve('DELETE_EVERYTHING'), /LIGHTHOUSE_CHAT_READ_QUERY_UNSUPPORTED/);
  assert.deepEqual(fx.calls, []);
});

test('production CHAT routes READ_QUERY through the shared read capability', () => {
  const app = fs.readFileSync(appPath, 'utf8');
  assert.match(app, /from ['"]\.\/chat-read\.mjs['"]/);
  assert.match(app, /intent\.kind === ['"]READ_QUERY['"]/);
  assert.match(app, /chatRead\.resolve\(intent\.query\)/);
});
