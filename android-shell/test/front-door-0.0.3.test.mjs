import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('0.0.3 front door is chat-first and does not claim connected intent execution', async () => {
  const html = await read('www/app/ui.html');
  const logic = await read('www/app/logic.mjs');

  assert.match(html, /LIGHTHOUSE/);
  assert.match(html, /textarea|input[^>]+(?:message|chat|command)/i);
  assert.match(html, /settings/i);
  assert.doesNotMatch(html, /Foundation Proof/i);
  assert.doesNotMatch(html, /ความมั่นใจ|confidence/i);
  assert.doesNotMatch(html, /บันทึกสำเร็จ|บันทึกและอ่านกลับแล้ว/i);
  assert.doesNotMatch(logic, /\/api\/v1\/interpret|prepareMasterExecution|executePreparedMasterIntent/);
  assert.match(logic, /ยังไม่เชื่อม|not connected/i);
});

test('patch management is exposed through settings while preserving manual file import and rollback proxies', async () => {
  const html = await read('www/app/ui.html');
  const css = await read('www/app/ui.css');
  const logic = await read('www/app/logic.mjs');

  assert.match(html, /เลือกไฟล์ Patch|นำเข้า Patch/i);
  assert.match(html, /Rollback/);
  assert.doesNotMatch(html, /ตรวจหา Patch ใหม่/i);
  assert.match(html, /data-lighthouse-version/);
  assert.match(logic, /patch-file/);
  assert.match(logic, /patch-rollback/);
  assert.match(logic, /\.click\(\)/);
  assert.match(css, /\.patch-controls\s*\{[^}]*display\s*:\s*none/is);
});

test('0.0.3 stays inside patchable web assets and keeps system-problem UI distinct from normal chat', async () => {
  const html = await read('www/app/ui.html');
  const logic = await read('www/app/logic.mjs');

  assert.match(html, /role=["']alert["']|data-system-alert/i);
  assert.match(logic, /showSystemAlert|systemAlert/);
  assert.match(logic, /setTimeout/);
  assert.doesNotMatch(logic, /geolocation|navigator\.permissions|google\.maps|capacitor/i);
});
