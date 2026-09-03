import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBrowserShell } from '../src/browser-shell.mjs';

function count(html, needle) {
  return html.split(needle).length - 1;
}

test('browser shell renders exactly CHAT MANUAL SETTINGS as bottom navigation', () => {
  const html = renderBrowserShell({ route:{ top:'chat', manualHouse:null } });
  assert.equal(count(html, 'data-top-route="chat"'), 1);
  assert.equal(count(html, 'data-top-route="manual"'), 1);
  assert.equal(count(html, 'data-top-route="settings"'), 1);
  assert.match(html, />CHAT</);
  assert.match(html, />MANUAL</);
  assert.match(html, />SETTINGS</);
});

test('CHAT is a conversation surface with thread and composer rather than Master Input identity', () => {
  const html = renderBrowserShell({ route:{ top:'chat', manualHouse:null }, chat:{ messages:[{ role:'assistant', text:'พร้อมคุยครับ' }] } });
  assert.match(html, /data-chat-thread/);
  assert.match(html, /data-chat-input/);
  assert.match(html, /พร้อมคุยครับ/);
  assert.doesNotMatch(html, /MASTER_INPUT|Master Input|METROPOLIS/);
});

test('MANUAL dashboard asks today first and exposes exactly four current house doors', () => {
  const html = renderBrowserShell({ route:{ top:'manual', manualHouse:null }, manual:{ summary:{ moneyInSatang:42000, moneyOutSatang:6500, dueCount:2, eventCount:1 } } });
  assert.match(html, /วันนี้เป็นอย่างไร/);
  for (const house of ['income','outcome','calendar','ledger']) {
    assert.equal(count(html, `data-manual-house="${house}"`), 1);
  }
  for (const legacy of ['store','ride','money']) {
    assert.equal(count(html, `data-manual-house="${legacy}"`), 0);
  }
});

test('each Manual house renders one real destination surface label', () => {
  const labels = { income:'Income', outcome:'Outcome', calendar:'Calendar', ledger:'Ledger' };
  for (const [house, label] of Object.entries(labels)) {
    const html = renderBrowserShell({ route:{ top:'manual', manualHouse:house } });
    assert.match(html, new RegExp(`<h1[^>]*>${label}</h1>`));
  }
});

test('SETTINGS renders truthful app operations and does not offer rollback when unsupported', () => {
  const html = renderBrowserShell({ route:{ top:'settings', manualHouse:null }, settings:{ version:'0.1.0-new-base', rollbackSupported:false } });
  assert.match(html, /0\.1\.0-new-base/);
  for (const action of ['check-update','backup','restore','reset']) {
    assert.equal(count(html, `data-settings-action="${action}"`), 1);
  }
  assert.equal(count(html, 'data-settings-action="rollback"'), 0);
});

test('Failed updater state keeps one clear recovery action without exposing internal candidate metadata', () => {
  const html = renderBrowserShell({
    route:{ top:'settings', manualHouse:null },
    settings:{ version:'2.0.1', updaterStatus:{ state:'Failed', message:'ดาวน์โหลดอัปเดตไม่สำเร็จ' } },
  });
  assert.equal(count(html, 'data-updater-action="retry"'), 1);
  assert.match(html, /ลองอีกครั้ง/);
  assert.doesNotMatch(html, /SharedPreferences|candidateVersionCode|archiveVersionCode/);
});
