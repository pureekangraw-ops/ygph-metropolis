const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = process.cwd();
const htmlPath = path.join(root, 'lighthouse-next/preview.html');
const cssPath = path.join(root, 'lighthouse-next/preview.css');

function read(file) {
  assert.equal(fs.existsSync(file), true, `missing ${path.relative(root, file)}`);
  return fs.readFileSync(file, 'utf8');
}

test('LIGHTHOUSE visual preview shows the complete ten-screen owner review set without changing the live demo flow', () => {
  const html = read(htmlPath);
  const css = read(cssPath);

  const requiredScreens = [
    'PIN / First Entry',
    'หน้าหลัก',
    'แชต',
    'MANUAL Hub',
    'MANUAL — การเงิน',
    'MANUAL — ร้านค้า',
    'MANUAL — งานวิ่ง',
    'MANUAL — ปฏิทิน',
    'MANUAL — รายการทั้งหมด',
    'ตั้งค่า',
  ];

  for (const label of requiredScreens) {
    assert.match(html, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `preview must include ${label}`);
  }

  assert.match(html, /VISUAL PREVIEW/i, 'preview must be visibly labeled as review-only');
  assert.match(html, /ข้อมูลตัวอย่าง/, 'preview must disclose fake/example data');
  assert.match(html, /หน้าหลัก[\s\S]*แชต[\s\S]*MANUAL[\s\S]*ตั้งค่า/, 'preview must preserve the four locked root tabs');
  assert.doesNotMatch(html, /Metropolis|Registry|Gateway|Ledger Authority|Pending|Intent|Confidence Score/i, 'user-facing preview must not expose backend vocabulary');

  assert.match(css, /--bg\s*:\s*#0B0E14/i, 'preview must follow the approved cosmic dark background token');
  assert.match(css, /--surface\s*:\s*#1E293B/i, 'preview must follow the approved slate surface token');
  assert.match(css, /--gold\s*:\s*#F59E0B/i, 'preview must use warm gold as the primary accent');
  assert.match(css, /--cyan\s*:\s*#06B6D4/i, 'preview must use cyan as the secondary accent');
  assert.match(css, /--violet\s*:\s*#8B5CF6/i, 'preview must keep violet as a restrained status accent');
  assert.match(css, /minmax\(320px,\s*411px\)/i, 'preview grid must model the Android width range from the design handoff');
  assert.match(css, /min-height\s*:\s*44px/i, 'interactive mock controls must respect the minimum touch target');
  assert.match(css, /overflow-wrap\s*:\s*anywhere/i, 'long Thai copy must wrap instead of causing horizontal overflow');
});
