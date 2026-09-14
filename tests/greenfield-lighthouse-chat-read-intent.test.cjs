const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const moduleUrl = pathToFileURL(path.join(process.cwd(), 'lighthouse-next/chat-intent.mjs')).href;

async function loadIntent() {
  return import(`${moduleUrl}?t=${Date.now()}-${Math.random()}`);
}

const readyRead = query => ({
  kind:'READ_QUERY',
  status:'READY',
  query,
  slots:{},
  missing:[],
  ambiguous:[],
});

test('CHAT recognizes explicit Store, Ride, Calendar, Ledger and Income reads without mutation intent', async () => {
  const { interpretChatIntent } = await loadIntent();
  const cases = [
    ['สรุปร้านวันนี้', 'STORE_SUMMARY'],
    ['สรุปงานวิ่งวันนี้', 'RIDE_SUMMARY'],
    ['ดูปฏิทินวันนี้', 'CALENDAR_LIST'],
    ['ดูรายการเงินวันนี้', 'LEDGER_LIST'],
    ['สรุปรายรับวันนี้', 'INCOME_SUMMARY'],
  ];

  for (const [text, query] of cases) {
    assert.deepEqual(interpretChatIntent(text, { storeProducts: [] }), readyRead(query), text);
  }
});

test('read-only CHAT intent stays separate from existing write intents', async () => {
  const { interpretChatIntent } = await loadIntent();
  assert.equal(interpretChatIntent('สรุปร้านวันนี้', { storeProducts: [] }).kind, 'READ_QUERY');
  assert.equal(interpretChatIntent('ได้เงิน 500', { storeProducts: [] }).kind, 'GENERAL_INCOME');
});
