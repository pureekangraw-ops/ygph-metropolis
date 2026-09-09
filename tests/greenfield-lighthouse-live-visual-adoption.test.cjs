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
  const sendControl = read('lighthouse-next/send-control.mjs');

  assert.match(polish, /--bg\s*:\s*#0B0E14/i, 'live surface should use the approved cosmic dark background token');
  assert.match(polish, /--panel\s*:\s*#1E293B/i, 'live cards should use the approved slate surface token');
  assert.match(polish, /--gold\s*:\s*#F59E0B/i, 'live primary accent should use the approved warm gold token');
  assert.match(polish, /--cyan\s*:\s*#06B6D4/i, 'live secondary accent should use the approved cyan token');
  assert.match(polish, /--violet\s*:\s*#8B5CF6/i, 'live status accent should use the approved violet token');

  assert.match(html, /id="chat-send"[^>]*class="send-button"[^>]*disabled/i, 'send control must start disabled when the composer is empty');
  assert.match(html, /class="send-icon"/, 'send control should use the new paper-plane icon instead of the oversized arrow glyph');
  assert.match(html, /src="\.\/send-control\.mjs"/, 'live page should load the focused send-control behavior');

  assert.match(polish, /\.chat-composer\s*\{[^}]*grid-template-columns\s*:\s*minmax\(0,1fr\)\s+44px[^}]*gap\s*:\s*6px[^}]*padding\s*:\s*4px[^}]*border-radius\s*:\s*22px/is, 'composer should remain one compact capsule while following the approved Figma rounding');
  assert.match(polish, /\.send-button\s*\{[^}]*width\s*:\s*44px[^}]*height\s*:\s*44px[^}]*border-radius\s*:\s*16px/is, 'send button should stay compact and touch-safe inside the approved Figma capsule');
  assert.match(polish, /\.send-button:disabled\s*\{[^}]*opacity\s*:/is, 'disabled send state must be visually distinct');

  assert.match(sendControl, /const chatSend = document\.querySelector\('#chat-send'\)/, 'focused send controller must own the button state');
  assert.match(sendControl, /chatSend\.disabled\s*=\s*!chatInput\.value\.trim\(\)/, 'send availability must follow whether the input contains text');
  assert.match(app, /event\.key\s*===\s*['"]Enter['"]\s*&&\s*!event\.shiftKey/, 'Enter should continue to send');
});
