"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.mjs'), 'utf8');

test('recovery entry is one direct file restore action', () => {
  assert.match(app, /function showRecovery\(\)/);
  assert.match(app, /เลือกไฟล์สำรอง ระบบจะตรวจสอบไฟล์ให้เองก่อนกู้คืน/);
  assert.match(app, /id="restoreFile"/);
  assert.match(app, /id="directRestoreBtn"/);
  assert.doesNotMatch(app, /verifyGreenfieldRecoveryCode|resetGreenfieldDevicePassword|importEvidenceBtn|evidenceFile/);
});

test('first-run setup stays separate from file recovery', () => {
  const setup = /function showFirstSetup\(\)[\s\S]*?function showRecovery/.exec(app)?.[0] || '';
  assert.match(setup, /id="firstPassword"/);
  assert.match(setup, /id="firstRecoveryCode"/);
  assert.doesNotMatch(setup, /restoreFile|directRestoreBtn|type="file"|ไฟล์สำรอง/);
});

test('existing data asks once before replacement while file validation stays behind the scenes', () => {
  assert.match(app, /GREENFIELD_RESTORE_CONFIRM_REQUIRED/);
  assert.match(app, /กู้คืนไฟล์นี้แทนที่ข้อมูลปัจจุบันหรือไม่/);
  assert.match(app, /openGreenfieldRuntimeFromBackup/);
});

test('restore UX maps internal failures to user-facing copy', () => {
  assert.match(app, /function restoreErrorText/);
  assert.match(app, /ไฟล์นี้ไม่ใช่ไฟล์สำรองที่ METRO ใช้ได้/);
  assert.match(app, /กู้คืนไม่สำเร็จ ระบบหยุดก่อนใช้ข้อมูลที่ตรวจไม่ผ่าน/);
});
