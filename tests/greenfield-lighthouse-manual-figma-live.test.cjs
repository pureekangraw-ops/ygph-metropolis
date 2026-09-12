const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function manualMarkup(html) {
  const match = html.match(/<div id="page-manual"[\s\S]*?<div id="page-settings"/);
  assert.ok(match, 'MANUAL root must exist before Settings');
  return match[0];
}

test('MANUAL live hub adopts the approved compact capability grid without inventing Client as a live capability', () => {
  const html = read('lighthouse-next/index.html');
  const manual = manualMarkup(html);

  assert.match(manual, /class="page-title-block manual-heading"/);
  for (const task of ['finance', 'store', 'ride', 'calendar', 'ledger']) {
    assert.match(manual, new RegExp(`data-task="${task}"`), `${task} must remain reachable from MANUAL`);
  }
  assert.doesNotMatch(manual, /data-task="client"/);

  assert.match(manual, /<strong>Finance<\/strong><small>Income · Outcome<\/small>/);
  assert.match(manual, /<strong>Store<\/strong><small>จาก Store<\/small>/);
  assert.match(manual, /<strong>Ride<\/strong><small>ยังไม่เชื่อม<\/small>/);
  assert.match(manual, /<strong>Calendar<\/strong><small>ยังไม่เชื่อม<\/small>/);
  assert.match(manual, /<strong>Ledger<\/strong><small>จาก Ledger<\/small>/);
});

test('MANUAL live hub carries truth-source and connection-state summaries from the approved Figma blueprint', () => {
  const html = read('lighthouse-next/index.html');
  const manual = manualMarkup(html);

  assert.match(manual, /class="manual-summary-card"[^>]*data-manual-summary="truth"/);
  assert.match(manual, /ภาพรวมข้อมูลจริง/);
  assert.match(manual, /Ledger \+ Store/);
  assert.match(manual, /แสดงค่าจริงเมื่อ Runtime อ่านสำเร็จ/);

  assert.match(manual, /class="manual-summary-card manual-connection-card"[^>]*data-manual-summary="connection"/);
  assert.match(manual, /สถานะการเชื่อมต่อ/);
  assert.match(manual, /ไม่ใช้ข้อมูลตัวอย่างแทนของจริง/);
  assert.match(manual, /Calendar \/ Ride แสดง “ยังไม่เชื่อม” จนมี source จริง/);
});

test('MANUAL Figma slice uses a two-column compact grid and per-capability accents while preserving nav clearance', () => {
  const html = read('lighthouse-next/index.html');

  assert.match(html, /#manual-hub \.task-grid\s*\{[^}]*grid-template-columns\s*:\s*repeat\(2,minmax\(0,1fr\)\)[^}]*gap\s*:\s*12px/is);
  assert.match(html, /#manual-hub \.task-card\s*\{[^}]*min-height\s*:\s*78px[^}]*border-radius\s*:\s*17px/is);
  assert.match(html, /\.task-card\[data-task="finance"\][^{]*\{[^}]*rgba\(34,216,255,/is);
  assert.match(html, /\.task-card\[data-task="ride"\][^{]*\{[^}]*rgba\(255,100,200,/is);
  assert.match(html, /\.task-card\[data-task="calendar"\][^{]*\{[^}]*rgba\(108,140,255,/is);
  assert.match(html, /\.task-card\[data-task="ledger"\][^{]*\{[^}]*rgba\(255,211,106,/is);
  assert.match(html, /\.manual-summary-card\s*\{[^}]*border-radius\s*:\s*16px/is);
  assert.match(html, /#manual-hub\s*\{[^}]*padding-bottom\s*:\s*calc\(var\(--nav-height\)\s*\+\s*28px\)/is);
});
