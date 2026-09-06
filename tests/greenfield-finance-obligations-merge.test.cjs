const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = process.cwd();
const htmlPath = path.join(root, 'lighthouse-next/index.html');
const mergePath = path.join(root, 'lighthouse-next/manual-finance-merge.mjs');

function read(file) {
  assert.equal(fs.existsSync(file), true, `missing ${path.relative(root, file)}`);
  return fs.readFileSync(file, 'utf8');
}

test('MANUAL combines finance and obligations into one user task', () => {
  const html = read(htmlPath);
  assert.doesNotMatch(html, /data-task=["']obligations["']/);
  assert.match(html, /data-task=["']finance["'][\s\S]*?<strong>การเงิน<\/strong>[\s\S]*?ภาระ/);
  assert.match(html, /manual-finance-merge\.mjs/);
  assert.equal(fs.existsSync(mergePath), true, 'missing lighthouse-next/manual-finance-merge.mjs');
});

test('finance detail carries the next obligation, gap, and daily target into the same view', () => {
  const merge = read(mergePath);
  assert.match(merge, /ภาระใกล้สุด/);
  assert.match(merge, /ยังขาด/);
  assert.match(merge, /เป้าวันนี้/);
  assert.match(merge, /obligation-amount/);
  assert.match(merge, /gap-row/);
  assert.match(merge, /target-row/);
});
