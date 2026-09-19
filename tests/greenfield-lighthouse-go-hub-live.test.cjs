const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('LIGHTHOUSE Settings preserves the latest GO Hub sync result instead of overwriting it', () => {
  const settings = read('lighthouse-next/settings-operations.mjs');
  assert.match(settings, /let lastSyncText = ''/);
  assert.match(settings, /refresh\(\{ preserveSync = false \} = \{\}\)/);
  assert.match(settings, /void refresh\(\{ preserveSync:true \}\)/);
  assert.match(settings, /เชื่อมแล้ว · sync/);
  assert.doesNotMatch(settings, /if \(detail\.error\) status\.textContent = hubOperationError/);
});

test('LIGHTHOUSE Settings exposes GO Hub pairing without collecting Owner passcode', () => {
  const html = read('lighthouse-next/index.html');
  const settings = read('lighthouse-next/settings-operations.mjs');
  assert.match(html, /id="go-hub-status"/);
  assert.match(html, /id="go-hub-bootstrap"/);
  assert.match(html, /id="go-hub-sync-now"/);
  assert.match(html, /id="go-hub-disconnect"/);
  assert.match(html, /id="go-hub-confirmation"/);
  assert.match(html, /id="go-hub-command-confirm"/);
  assert.match(html, /id="go-hub-command-reject"/);
  assert.doesNotMatch(html, /go-hub-owner-passcode|x-go-owner-passcode/i);
  assert.match(settings, /createLighthouseHubControlPortTransport/);
  assert.match(settings, /lighthouse:hub-sync-request/);
  assert.doesNotMatch(settings, /x-go-owner-passcode/i);
});

test('LIGHTHOUSE app reconciles GO Hub through existing Control Port sync only after unlock', () => {
  const app = read('lighthouse-next/app.mjs');
  assert.match(app, /createLighthouseControlPortSync\(\{ runtime:controlPortRuntime \}\)/);
  assert.match(app, /installGoHubCommandConfirmation\(\{ root, runtime:controlPortRuntime \}\)/);
  const confirmation = read('lighthouse-next/control-port/control-port-confirmation.mjs');
  assert.match(confirmation, /entry\?\.status === 'CONFIRMATION_REQUIRED'/);
  assert.match(confirmation, /await runtime\.confirm\(requestId\)/);
  assert.match(confirmation, /runtime\.cancel\(requestId\)/);
  assert.match(app, /pullInbox:\(\) => runtimeGate\.isUnlocked\(\) \? hubControlPortTransport\.pullInbox\(\{ isActive:\(\) => runtimeGate\.isUnlocked\(\) \}\) : \[\]/);
  assert.match(app, /pushOutbox:receipts => hubControlPortTransport\.pushOutbox\(receipts\)/);
  assert.match(app, /pushState:packet => hubControlPortTransport\.pushState\(packet\)/);
  assert.match(app, /showApp\(\); void syncGoHubControlPort\(\{ force:true \}\)/);
  assert.match(app, /installControlPortBackgroundSync\(\{/);
  assert.match(app, /30_000/);
  assert.doesNotMatch(app, /confirmed:\s*true/);
  assert.doesNotMatch(app, /runtime\.(?:readState|write|commit)/);
});

test('GO Hub transport credential stays outside localStorage and Runtime truth', () => {
  const credential = read('lighthouse-next/control-port/control-port-credential.mjs');
  const transport = read('lighthouse-next/control-port/control-port-transport.mjs');
  assert.match(credential, /indexedDBImpl\.open\(LIGHTHOUSE_HUB_CREDENTIAL_DB/);
  assert.doesNotMatch(credential, /localStorage/);
  assert.match(credential, /LIGHTHOUSE_HUB_BOOTSTRAP_UNEXPECTED_FIELD/);
  assert.doesNotMatch(transport, /ownerPasscode|x-go-owner-passcode/);
});


test('LIGHTHOUSE renders the Centre Board from GO Hub instead of treating local Board memory as authority', () => {
  const app = read('lighthouse-next/app.mjs');
  const transport = read('lighthouse-next/control-port/control-port-transport.mjs');
  assert.match(transport, /async function pullBoard\(\)/);
  assert.match(transport, /post\('\/board'\)/);
  assert.match(app, /const board = await hubControlPortTransport\.pullBoard\(\)/);
  assert.match(app, /latestCentreBoard = board/);
  assert.match(app, /LIGHTHOUSE แสดงผลเท่านั้น/);
});
