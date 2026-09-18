const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = process.cwd();
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('Calendar recovery restores the proven month navigation surface', () => {
  const surface = read('lighthouse-next/surface-contract.mjs');
  assert.match(surface, /projectCalendarMonth/);
  assert.match(surface, /data-calendar-prev/);
  assert.match(surface, /data-calendar-today/);
  assert.match(surface, /data-calendar-next/);
  assert.match(surface, /calendar-month-grid/);
  assert.match(surface, /ledgerBridge\.readCalendarTruth\(\)/);
});

test('Calendar month projection is a read-only 42-cell view over durable records', async () => {
  const moduleUrl = pathToFileURL(path.join(root, 'lighthouse-next/calendar-month.mjs')).href + `?t=${Date.now()}`;
  const { projectCalendarMonth } = await import(moduleUrl);
  const records = [
    { recordId:'Q-10', type:'PAY_OBLIGATION_INSTALLMENT', title:'ค่าซ่อมห้อง', dueDate:'2026-09-10', status:'OPEN' },
    { recordId:'TASK-12', type:'TASK', title:'โทรหาร้าน', dueDate:'2026-09-12', status:'OPEN' },
  ];
  const before = JSON.stringify(records);
  const month = projectCalendarMonth(records, { year:2026, month:9 });
  assert.equal(month.cells.length, 42);
  assert.equal(month.cells.find(cell => cell.date === '2026-09-10').items[0].recordId, 'Q-10');
  assert.equal(month.cells.find(cell => cell.date === '2026-09-12').items[0].title, 'โทรหาร้าน');
  assert.equal(JSON.stringify(records), before);
});
