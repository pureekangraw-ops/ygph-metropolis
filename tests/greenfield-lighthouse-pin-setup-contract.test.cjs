const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = process.cwd();
const setupPath = path.join(root, 'lighthouse-next/setup.html');
const indexPath = path.join(root, 'lighthouse-next/index.html');

function read(file) {
  assert.equal(fs.existsSync(file), true, `missing ${path.relative(root, file)}`);
  return fs.readFileSync(file, 'utf8');
}

test('PIN-facing surfaces preserve the existing six-character credential format', () => {
  const setup = read(setupPath);
  const index = read(indexPath);

  assert.match(setup, /สร้าง PIN ครั้งแรก/);
  assert.match(setup, /<label for="setup-password">PIN<\/label>/);
  assert.match(setup, /<label for="setup-confirm-password">ยืนยัน PIN<\/label>/);
  assert.match(setup, /อย่างน้อย 6 ตัวอักษร/);
  assert.match(setup, /ควรต่างจาก PIN/);
  assert.match(setup, /หากลืมทั้ง PIN กับ Recovery Code/);
  assert.match(index, /<label for="device-password">PIN<\/label>/);
  assert.match(index, /<label for="new-password">PIN ใหม่<\/label>/);

  assert.doesNotMatch(setup, /inputmode="numeric"/);
  assert.doesNotMatch(index, /inputmode="numeric"/);
  assert.doesNotMatch(setup, /รหัสเข้าแอป/);
  assert.doesNotMatch(setup, /6 หลัก/);
});
