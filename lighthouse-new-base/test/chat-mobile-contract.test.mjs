import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderBrowserShell } from '../src/browser-shell.mjs';

const appSource = fs.readFileSync(new URL('../src/browser-app.mjs', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('CHAT renders user and assistant on distinct sides and exposes only real draft actions', () => {
  const html = renderBrowserShell({
    route:{ top:'chat', manualHouse:null },
    chat:{
      messages:[
        { id:'u1', side:'user', text:'ข้าว 65' },
        { id:'a1', side:'assistant', text:'รายจ่าย ข้าว 65 บาท', relatedMessageId:'u1', kind:'draft' },
      ],
      pending:{ messageId:'u1', rawText:'ข้าว 65', fields:{ title:'ข้าว', amountSatang:6500 } },
    },
  });
  assert.match(html, /data-chat-message="user"/);
  assert.match(html, /data-chat-message="assistant"/);
  assert.match(html, /data-chat-action="edit"/);
  assert.match(html, /data-chat-action="confirm"/);
  assert.match(html, /data-chat-action="cancel"/);
  assert.doesNotMatch(html, /Master Input|execution state|durable readback|work queue/i);
});

test('CHAT composer advertises keyboard send and browser app owns submit plus Enter handling', () => {
  const html = renderBrowserShell({ route:{ top:'chat', manualHouse:null }, chat:{ messages:[] } });
  assert.match(html, /data-chat-form/);
  assert.match(html, /enterkeyhint="send"/);
  assert.match(appSource, /addEventListener\('submit'/);
  assert.match(appSource, /addEventListener\('keydown'/);
  assert.match(appSource, /event\.key === 'Enter'/);
  assert.match(appSource, /!event\.shiftKey/);
});

test('CHAT layout uses dynamic viewport, safe areas, and a visual viewport bridge', () => {
  assert.match(css, /100dvh/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /--lh-visual-viewport-height/);
  assert.match(appSource, /visualViewport/);
  assert.match(appSource, /scrollIntoView/);
});

test('retry and archive controls render only for actionable message states', () => {
  const errorHtml = renderBrowserShell({
    route:{ top:'chat', manualHouse:null },
    chat:{ messages:[{ id:'u1', side:'user', text:'ข้าว 65', executionState:'SUCCESS', syncState:'ERROR' }] },
  });
  assert.match(errorHtml, /data-chat-action="retry"/);

  const successHtml = renderBrowserShell({
    route:{ top:'chat', manualHouse:null },
    chat:{ messages:[{ id:'u1', side:'user', text:'ข้าว 65', executionState:'SUCCESS', syncState:'SUCCESS' }] },
  });
  assert.match(successHtml, /data-chat-action="archive"/);
});
