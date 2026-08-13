const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'ui', 'app.mjs'), 'utf8');

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

test('locked login surface exposes only password, sign in, and forgot password actions', () => {
  const loginSurface = between(html, '<section id="gate"', '<section id="recoveryPanel"');

  assert.match(loginSurface, /<label>รหัสผ่าน\s*<input id="devicePin"[^>]*autocomplete="current-password"/);
  assert.match(loginSurface, /<button id="unlockBtn"[^>]*>เข้าสู่ระบบ<\/button>/);
  assert.match(loginSurface, /<button id="forgotPasswordBtn"[^>]*>ลืมรหัสผ่าน\?<\/button>/);

  for (const forbidden of ['Vault', 'Device PIN', 'Evidence', 'Backup', 'Recovery', 'crypto']) {
    assert.equal(loginSurface.includes(forbidden), false, `login surface leaked technical term: ${forbidden}`);
  }
  assert.equal((loginSurface.match(/<input\b/g) || []).length, 1, 'login surface should have one input');
  assert.equal((loginSurface.match(/<button\b/g) || []).length, 2, 'login surface should have two actions');
  assert.equal(loginSurface.includes('<details'), false, 'login surface must not expose advanced tools');
});

test('forgot password opens a simple recovery surface and keeps technician tools deeper', () => {
  const recoverySurface = between(html, '<section id="recoveryPanel"', '<div id="workspace"');

  assert.match(recoverySurface, /id="recoveryPanel"[^>]*class="[^"]*hidden/);
  assert.match(recoverySurface, /<label>รหัสกู้คืน\s*<input id="recoveryPassphrase"/);
  assert.match(recoverySurface, /<label>รหัสผ่านใหม่\s*<input id="recoveryNewPassword"/);
  assert.match(recoverySurface, /<button id="resetPasswordBtn"[^>]*>ตั้งรหัสผ่านใหม่<\/button>/);
  assert.match(recoverySurface, /<details id="lockedAdvancedRecovery"[^>]*>\s*<summary>ตัวเลือกขั้นสูง<\/summary>/);
  assert.match(recoverySurface, /id="evidenceFile"/);
  assert.match(recoverySurface, /id="restoreFile"/);

  assert.match(ui, /\$\('forgotPasswordBtn'\)\.addEventListener\('click'/);
  assert.match(ui, /\$\('recoveryBackBtn'\)\.addEventListener\('click'/);
  assert.match(ui, /\$\('resetPasswordBtn'\)\.addEventListener\('click'/);
  assert.match(ui, /enrollGreenfieldDeviceUnlock\(\{ vaultPassphrase:recoveryPassphrase\(\), pin:recoveryNewPassword\(\) \}\)/);
});

test('system routes security access tools under settings then advanced', () => {
  const system = between(html, '<section class="area-page" data-area-page="system">', '</section>\n      </div>');

  assert.match(system, /<details[^>]*>\s*<summary>ความปลอดภัย<\/summary>/);
  assert.match(system, /<details id="accessSettings"[^>]*>\s*<summary>การเข้าถึง<\/summary>/);
  assert.match(system, /<details id="advancedAccessSettings"[^>]*>\s*<summary>ขั้นสูง<\/summary>/);
  assert.match(system, /id="changePasswordBtn"[^>]*>เปลี่ยนรหัสผ่าน<\/button>/);
  assert.match(system, /id="backupBtn"/);
  assert.match(system, /id="openRestoreRouteBtn"/);
  assert.match(system, /id="advancedDiagnostics"/);
});

test('login errors stay user-facing instead of leaking device unlock internals', () => {
  assert.match(ui, /DEVICE_UNLOCK_NOT_ENROLLED[\s\S]*ลืมรหัสผ่าน\?/);
  assert.equal(ui.includes('เครื่องนี้ยังไม่ได้ตั้งรหัสเข้าแอป — เปิด “กู้คืนการเข้าถึง”'), false);
});
