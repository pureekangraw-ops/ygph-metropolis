import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBrowserShell } from '../src/browser-shell.mjs';

test('Income surface renders real cash-in and pending ride credit as distinct truths', () => {
  const html = renderBrowserShell({
    route:{ top:'manual', manualHouse:'income' },
    income:{ cashInSatang:42000, pendingRideCreditSatang:18000, recent:[] },
  });
  assert.match(html, /420(?:\.00)? บาท/);
  assert.match(html, /180(?:\.00)? บาท/);
  assert.match(html, /เงินเข้าจริง/);
  assert.match(html, /เครดิตวิ่งงานที่ยังไม่ถอน/);
});

test('Outcome surface renders spending allowance against real daily cash-out without inventing a limit', () => {
  const withAllowance = renderBrowserShell({
    route:{ top:'manual', manualHouse:'outcome' },
    outcome:{ allowanceSatang:10000, spentSatang:6500, remainingSatang:3500, overSatang:0, exceeded:false },
  });
  assert.match(withAllowance, /วงเงินใช้จ่าย/);
  assert.match(withAllowance, /ใช้ไป/);
  assert.match(withAllowance, /เหลือ/);
  assert.match(withAllowance, /100(?:\.00)? บาท/);
  assert.match(withAllowance, /65(?:\.00)? บาท/);
  assert.match(withAllowance, /35(?:\.00)? บาท/);

  const withoutAllowance = renderBrowserShell({
    route:{ top:'manual', manualHouse:'outcome' },
    outcome:{ allowanceSatang:null, spentSatang:6500, remainingSatang:null, overSatang:null, exceeded:false },
  });
  assert.match(withoutAllowance, /ยังไม่ได้ตั้งวงเงินใช้จ่าย/);
  assert.doesNotMatch(withoutAllowance, /วงเงินใช้จ่าย[^<]*0 บาท/);
});

test('Ledger surface renders real balance and recent transaction history', () => {
  const html = renderBrowserShell({
    route:{ top:'manual', manualHouse:'ledger' },
    ledger:{ balanceSatang:35500, history:[
      { recordId:'TX-OUT', title:'ข้าว', direction:'OUT', amountSatang:6500, owner:'outcome' },
      { recordId:'TX-IN', title:'วิ่งงาน', direction:'IN', amountSatang:42000, owner:'income' },
    ] },
  });
  assert.match(html, /ยอดเงินจริง/);
  assert.match(html, /355(?:\.00)? บาท/);
  assert.match(html, /ข้าว/);
  assert.match(html, /วิ่งงาน/);
});

test('Calendar surface renders month cells from the one Calendar projection', () => {
  const html = renderBrowserShell({
    route:{ top:'manual', manualHouse:'calendar' },
    calendar:{ year:2026, month:9, cells:[
      { date:'2026-09-01', inMonth:true, items:[] },
      { date:'2026-09-02', inMonth:true, items:[{ recordId:'Q-1', title:'ค่าซ่อมห้อง', owner:'outcome', status:'OPEN' }] },
    ] },
  });
  assert.match(html, /กันยายน 2026/);
  assert.match(html, /2026-09-02/);
  assert.match(html, /ค่าซ่อมห้อง/);
  assert.equal((html.match(/data-calendar-item="Q-1"/g) || []).length, 1);
});
