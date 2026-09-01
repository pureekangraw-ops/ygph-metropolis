"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Settings is a grouped utility index instead of a fifth working house', () => {
  const html = read('index.html');
  const settings = read('ui/settings-ui.mjs');
  assert.match(html, /id="settingsBtn"[^>]*aria-label="ตั้งค่า"/);
  assert.doesNotMatch(html, /data-area-page="settings"/);
  for (const label of ['การใช้งาน','การแจ้งเตือนและสิทธิ์','ข้อมูลและการสำรอง','ความปลอดภัย','เกี่ยวกับแอป','ขั้นสูง']) {
    assert.match(settings, new RegExp(label));
  }
});

test('Backup Import and Restore remain separate concepts and latest backup is only recorded after success', () => {
  const settings = read('ui/settings-ui.mjs');
  assert.match(settings, /สำรองข้อมูล/);
  assert.match(settings, /นำเข้าข้อมูล/);
  assert.match(settings, /กู้คืนจาก Backup/);
  assert.match(settings, /latestBackup/);
  assert.match(settings, /recordLatestBackup/);
});

test('normal update view stays human-facing while technical status is advanced', () => {
  const settings = read('ui/settings-ui.mjs');
  const release = read('ui/release-status.mjs');
  assert.match(settings, /เวอร์ชัน/);
  assert.match(settings, /สถานะอัปเดต/);
  assert.match(settings, /ข้อมูลทางเทคนิค/);
  assert.match(release, /data-settings-technical/);
});

test('Reset All lives only in Advanced Danger Zone and retains deliberate confirmation', () => {
  const reset = read('ui/reset-all-ui.mjs');
  assert.match(reset, /settingsDangerZone/);
  assert.match(reset, /Danger Zone/);
  assert.match(reset, /confirm\(/);
  assert.match(reset, /ยืนยันอีกครั้ง/);
  assert.doesNotMatch(reset, /settings\.append\(section\)/);
});

test('permission area never fabricates Android permission truth', () => {
  const settings = read('ui/settings-ui.mjs');
  assert.match(settings, /permission-owner-unavailable/);
  assert.doesNotMatch(settings, /Location\s*\[ON\]|Notification\s*\[ON\]|Alarm\s*\[ON\]/);
});
