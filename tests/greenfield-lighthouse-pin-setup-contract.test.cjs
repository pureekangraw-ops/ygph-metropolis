const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = process.cwd();
const setupPath = path.join(root, 'lighthouse-next/setup.html');

function read(file) {
  assert.equal(fs.existsSync(file), true, `missing ${path.relative(root, file)}`);
  return fs.readFileSync(file, 'utf8');
}

test('first-run setup uses the same PIN language as the unlock surface', () => {
  const html = read(setupPath);

  assert.match(html, /สร้าง PIN ครั้งแรก/);
  assert.match(html, /<label for="setup-password">PIN<\/label>/);
  assert.match(html, /<label for="setup-confirm-password">ยืนยัน PIN<\/label>/);
  assert.match(html, /inputmode="numeric"/);
  assert.match(html, /อย่างน้อย 6 หลัก/);
  assert.match(html, /ควรต่างจาก PIN/);
  assert.match(html, /หากลืมทั้ง PIN กับ Recovery Code/);

  assert.doesNotMatch(html, /รหัสเข้าแอป/);
  assert.doesNotMatch(html, /6 ตัวอักษร/);
});
