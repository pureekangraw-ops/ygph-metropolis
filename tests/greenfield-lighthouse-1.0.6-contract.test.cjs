const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('CHAT is a conversation surface, not the visible Master Input workbench', () => {
  const chat = read('ui/chat-ui.mjs');
  const shell = read('ui/lighthouse-shell.mjs');
  assert.match(shell, /chat-ui\.mjs/);
  assert.match(chat, /dataset\.chatMessage/);
  assert.match(chat, /setAttribute\('data-chat-role',message\.role\)/);
  assert.match(chat, /role:'user'/);
  assert.match(chat, /role:'assistant'/);
  assert.match(chat, /localStorage/);
  assert.match(chat, /masterInputForm/);
  assert.doesNotMatch(chat, />\s*ตีความ\s*</);
  assert.doesNotMatch(chat, />\s*IDLE\s*</);
});

test('CHAT composer is mobile-safe and follows the visual viewport', () => {
  const chat = read('ui/chat-ui.mjs');
  const shellCss = read('lighthouse.css');
  const chatCss = read('ui/chat-ui.css');
  assert.match(chat, /visualViewport/);
  assert.match(shellCss, /100dvh/);
  assert.match(shellCss, /safe-area-inset-top/);
  assert.match(chatCss, /safe-area-inset-bottom/);
  assert.match(chatCss, /\.lighthouse-chat-composer/);
  assert.match(chatCss, /overflow-y:\s*auto/);
});

test('navigation owns one state and exposes Back and Home semantics', () => {
  const shell = read('ui/lighthouse-shell.mjs');
  assert.match(shell, /function navigate\(/);
  assert.match(shell, /history\.pushState/);
  assert.match(shell, /history\.back\(\)/);
  assert.match(shell, /data-lighthouse-home/);
  assert.match(shell, /data-lighthouse-back/);
  assert.match(shell, /resetCurrentTabHome/);
});

test('MANUAL exposes one calendar home and category filters instead of duplicate calendars', () => {
  const shell = read('ui/lighthouse-shell.mjs');
  assert.match(shell, /calendar:Object\.freeze/);
  assert.match(shell, /destination:'calendar'/);
  assert.match(shell, /data-calendar-filter/);
  const calendarTiles = shell.match(/title:'ปฏิทิน'/g) || [];
  assert.equal(calendarTiles.length, 1);
});

test('new chat assets are included in packaged app staging', () => {
  const assets = read('.assetsignore');
  assert.match(assets, /!\/ui\/chat-ui\.mjs/);
  assert.match(assets, /!\/ui\/chat-ui\.css/);
});

test('Android release identity advances to 1.0.6 vc1007', () => {
  const version = JSON.parse(read('android-shell/version.json'));
  assert.equal(version.versionName, '1.0.6');
  assert.equal(version.versionCode, 1007);
});
