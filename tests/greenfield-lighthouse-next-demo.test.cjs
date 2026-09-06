const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = process.cwd();
const htmlPath = path.join(root, 'lighthouse-next/index.html');
const cssPath = path.join(root, 'lighthouse-next/styles.css');
const appPath = path.join(root, 'lighthouse-next/app.mjs');

function read(file) {
  assert.equal(fs.existsSync(file), true, `missing ${path.relative(root, file)}`);
  return fs.readFileSync(file, 'utf8');
}

test('LIGHTHOUSE next demo ships the three isolated static source files', () => {
  assert.equal(fs.existsSync(htmlPath), true, 'missing lighthouse-next/index.html');
  assert.equal(fs.existsSync(cssPath), true, 'missing lighthouse-next/styles.css');
  assert.equal(fs.existsSync(appPath), true, 'missing lighthouse-next/app.mjs');
});

test('user surface is LIGHTHOUSE, Dashboard-first, with exactly four root nav labels', () => {
  const html = read(htmlPath);
  assert.match(html, /LIGHTHOUSE/);
  for (const label of ['เงินจริง', 'เงินเข้า', 'เงินออก', 'สุทธิ', 'ภาระใกล้ที่สุด', 'ยังขาด', 'เป้าวันนี้']) {
    assert.match(html, new RegExp(label));
  }
  for (const label of ['หน้าหลัก', 'แชต', 'MANUAL', 'ตั้งค่า']) {
    const matches = html.match(new RegExp(`>${label}<`, 'g')) || [];
    assert.equal(matches.length, 1, `${label} must appear exactly once as a root nav label`);
  }
  assert.doesNotMatch(html, /เปิดแชต|เปิด MANUAL/);
});

test('normal demo surface hides architecture vocabulary and GO persona chrome', () => {
  const html = read(htmlPath);
  const visibleText = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  assert.doesNotMatch(visibleText, /Module Registry|Ledger Gateway|durable readback|\bcapability\b|\bowner\b|\bactor\b|\bmanifest\b|GO\s*(ออนไลน์|online|avatar)/i);
});

test('demo persists only its own namespaced state and restores deep pending across reload', () => {
  const app = read(appPath);
  assert.match(app, /const STORAGE_KEY = ['"]lighthouse-next-demo-v1['"]/);
  assert.match(app, /localStorage\.getItem\(STORAGE_KEY\)/);
  assert.match(app, /localStorage\.setItem\(STORAGE_KEY/);
  assert.match(app, /restorePending/);
});

test('CHAT encodes Ambiguity Lock B-A-B-A and a supported local side-query reminder', () => {
  const app = read(appPath);
  assert.match(app, /AMBIGUITY_LOCK\s*=\s*['"]BABA['"]/);
  assert.match(app, /วันนี้วันที่เท่าไร/);
  assert.match(app, /ยังรอจำนวนของ/);
  assert.match(app, /answerLocalSideQuery/);
});

test('MANUAL exposes user jobs and Settings labels the environment as fake/local demo data', () => {
  const html = read(htmlPath);
  for (const label of ['การเงิน', 'ภาระ', 'ร้านค้า', 'งานวิ่ง', 'ปฏิทิน', 'รายการทั้งหมด']) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /ข้อมูลจำลอง/);
  assert.match(html, /รีเซ็ตเดโม/);
});
