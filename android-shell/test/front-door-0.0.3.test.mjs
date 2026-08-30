import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (relative) => readFile(new URL(relative, root), 'utf8');

test('0.0.3 front door ships as a patch input while packaged 0.0.1 stays unchanged', async () => {
  const packagedHtml = await read('www/app/ui.html');
  assert.match(packagedHtml, /LIGHTHOUSE APK Foundation Proof/);

  const input = JSON.parse(await read('test/fixtures/front-door-0.0.3-input.json'));
  assert.equal(input.baseVersion, '0.0.1');
  assert.equal(input.version, '0.0.3');
  assert.deepEqual(Object.keys(input.files).sort(), ['logic.mjs', 'ui.css', 'ui.html']);
});

test('0.0.3 patch UI is chat-first and never claims connected intent execution', async () => {
  const input = JSON.parse(await read('test/fixtures/front-door-0.0.3-input.json'));
  const html = input.files['ui.html'];
  const logic = input.files['logic.mjs'];

  assert.match(html, /LIGHTHOUSE/);
  assert.match(html, /textarea|input[^>]+(?:message|chat|command)/i);
  assert.match(html, /settings/i);
  assert.doesNotMatch(html, /Foundation Proof/i);
  assert.doesNotMatch(html, /ความมั่นใจ|confidence/i);
  assert.doesNotMatch(html, /บันทึกสำเร็จ|บันทึกและอ่านกลับแล้ว/i);
  assert.doesNotMatch(logic, /\/api\/v1\/interpret|prepareMasterExecution|executePreparedMasterIntent/);
  assert.match(logic, /ยังไม่เชื่อม|not connected/i);
});

test('patch management is exposed through settings using manual file import and rollback proxies', async () => {
  const input = JSON.parse(await read('test/fixtures/front-door-0.0.3-input.json'));
  const html = input.files['ui.html'];
  const css = input.files['ui.css'];
  const logic = input.files['logic.mjs'];

  assert.match(html, /เลือกไฟล์ Patch|นำเข้า Patch/i);
  assert.match(html, /Rollback/);
  assert.doesNotMatch(html, /ตรวจหา Patch ใหม่/i);
  assert.match(html, /data-lighthouse-version/);
  assert.match(logic, /patch-file/);
  assert.match(logic, /patch-rollback/);
  assert.match(logic, /\.click\(\)/);
  assert.match(css, /\.patch-controls\s*\{[^}]*display\s*:\s*none/is);
});

test('0.0.3 patch keeps real problems distinct from normal chat and stays web-only', async () => {
  const input = JSON.parse(await read('test/fixtures/front-door-0.0.3-input.json'));
  const html = input.files['ui.html'];
  const logic = input.files['logic.mjs'];

  assert.match(html, /role=["']alert["']|data-system-alert/i);
  assert.match(logic, /showSystemAlert|systemAlert/);
  assert.match(logic, /setTimeout/);
  assert.doesNotMatch(logic, /geolocation|navigator\.permissions|google\.maps|capacitor/i);
});
