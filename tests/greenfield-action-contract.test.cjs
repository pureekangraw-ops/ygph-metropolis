"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function rootFile(name) { return fs.readFileSync(path.join(__dirname, '..', name), 'utf8'); }

function minimalState() {
  return {
    schema:2, revision:7,
    domains:{
      STORE:{records:{}},
      LEDGER:{records:{
        OBL1:{record:{recordId:'OBL1',type:'OBLIGATION',title:'ค่าซ่อม',totalSatang:60000,remainingSatang:60000,status:'OPEN',installmentPlan:[{queueId:'Q1',amountSatang:30000,dueDate:'2026-08-15'},{queueId:'Q2',amountSatang:30000,dueDate:'2026-09-15'}]}}
      }},
      CALENDAR:{records:{
        Q1:{record:{recordId:'Q1',type:'PAY_OBLIGATION_INSTALLMENT',title:'จ่ายงวดภาระ',detail:'',amountSatang:30000,paidSatang:0,dueDate:'2026-08-15',status:'OPEN'}}
      }},
      RIDE:{records:{}}
    }
  };
}

test('Calendar payment action resolves canonical Ledger owner from obligation installment plan even when queue detail is missing', async () => {
  const { resolveCalendarAction } = await import('../ui/action-contract.mjs');
  const state = minimalState();
  const queue = state.domains.CALENDAR.records.Q1.record;
  const action = resolveCalendarAction(state, queue);
  assert.equal(action.available, true);
  assert.equal(action.kind, 'PAY_OBLIGATION');
  assert.equal(action.owner, 'LEDGER');
  assert.equal(action.sourceId, 'OBL1');
  assert.equal(action.method, 'payObligation');
});

test('Calendar action fails closed when no unique source owner can be proven', async () => {
  const { resolveCalendarAction } = await import('../ui/action-contract.mjs');
  const state = minimalState();
  state.domains.LEDGER.records = {};
  const queue = state.domains.CALENDAR.records.Q1.record;
  const action = resolveCalendarAction(state, queue);
  assert.equal(action.available, false);
  assert.match(action.reason, /SOURCE/);
});

test('every static non-submit button has an explicit action owner', () => {
  const html = rootFile('index.html');
  const sources = [rootFile('app.mjs'), rootFile('ui/app.mjs'), rootFile('ui/ride-ui.mjs'), rootFile('ui/action-popups.mjs')].join('\n');
  const tags = [...html.matchAll(/<button\b([^>]*)>/g)].map(match => match[1]);
  const orphan = [];
  for (const attrs of tags) {
    const type = /\btype="([^"]+)"/.exec(attrs)?.[1] || 'submit';
    if (type === 'submit') continue;
    if (/\bdata-(?:destination|city-entry|store-open|ride-open)="/.test(attrs)) continue;
    const id = /\bid="([^"]+)"/.exec(attrs)?.[1];
    if (!id) { orphan.push(attrs.trim()); continue; }
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const explicit = new RegExp(`(?:\\$\\(['\"]${escaped}['\"]\\)|getElementById\\(['\"]${escaped}['\"]\\))[\\s\\S]{0,1200}?addEventListener\\(['\"](?:click|submit)['\"]`).test(sources);
    if (!explicit) orphan.push(id);
  }
  assert.deepEqual(orphan, [], `orphan buttons: ${orphan.join(', ')}`);
});
