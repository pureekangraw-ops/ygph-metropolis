const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = process.cwd();

function read(relative) {
  const file = path.join(root, relative);
  assert.equal(fs.existsSync(file), true, `missing ${relative}`);
  return fs.readFileSync(file, 'utf8');
}

test('live LIGHTHOUSE adopts the approved preview visual system and a compact input-owned send control', () => {
  const html = read('lighthouse-next/index.html');
  const polish = read('lighthouse-next/owner-polish.css');
  const app = read('lighthouse-next/app.mjs');

  assert.match(polish, /--bg\s*:\s*#0B0E14/i, 'live surface should use the approved cosmic dark background token');
  assert.match(polish, /--panel\s*:\s*#1E293B/i, 'live cards should use the approved slate surface token');
  assert.match(polish, /--gold\s*:\s*#F59E0B/i, 'live primary accent should use the approved warm gold token');
  assert.match(polish, /--cyan\s*:\s*#06B6D4/i, 'live secondary accent should use the approved cyan token');
  assert.match(polish, /--violet\s*:\s*#8B5CF6/i, 'live status accent should use the approved violet token');

  assert.match(html, /id="chat-send"[^>]*class="send-button"[^>]*disabled/i, 'send control must start disabled when the composer is empty');
  assert.match(html, /class="send-icon"/, 'send control should use the new paper-plane icon instead of the oversized arrow glyph');

  assert.match(polish, /\.chat-composer\s*\{[^}]*grid-template-columns\s*:\s*minmax\(0,1fr\)\s+44px[^}]*gap\s*:\s*6px[^}]*padding\s*:\s*4px[^}]*border-radius\s*:\s*18px/is, 'composer should be one compact capsule with the action inside it');
  assert.match(polish, /\.send-button\s*\{[^}]*width\s*:\s*44px[^}]*height\s*:\s*44px[^}]*border-radius\s*:\s*14px/is, 'send button should be compact and touch-safe');
  assert.match(polish, /\.send-button:disabled\s*\{[^}]*opacity\s*:/is, 'disabled send state must be visually distinct');

  assert.match(app, /const chatSend = root\.querySelector\('#chat-send'\)/, 'app must own the send control state');
  assert.match(app, /chatSend\.disabled\s*=\s*!chatInput\.value\.trim\(\)/, 'send availability must follow whether the input contains text');
  assert.match(app, /event\.key === 'Enter' && !event\.shiftKey/, 'Enter should continue to send');
});
