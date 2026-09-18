const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('LIGHTHOUSE Settings exposes GO Hub pairing without collecting Owner passcode', () => {
  const html = read('lighthouse-next/index.html');
  const settings = read('lighthouse-next/settings-operations.mjs');
  assert.match(html, /id="go-hub-status"/);
  assert.match(html, /id="go-hub-bootstrap"/);
  assert.match(html, /id="go-hub-sync-now"/);
  assert.match(html, /id="go-hub-disconnect"/);
  assert.doesNotMatch(html, /go-hub-owner-passcode|x-go-owner-passcode/i);
  assert.match(settings, /createLighthouseHubControlPortTransport/);
  assert.match(settings, /lighthouse:hub-sync-request/);
  assert.doesNotMatch(settings, /x-go-owner-passcode/i);
});

test('LIGHTHOUSE app reconciles GO Hub through existing Control Port sync only after unlock', () => {
  const app = read('lighthouse-next/app.mjs');
  assert.match(app, /createLighthouseControlPortSync\(\{ runtime:controlPortRuntime \}\)/);
  assert.match(app, /pullInbox:\(\) => hubControlPortTransport\.pullInbox\(\)/);
  assert.match(app, /pushOutbox:receipts => hubControlPortTransport\.pushOutbox\(receipts\)/);
  assert.match(app, /pushState:packet => hubControlPortTransport\.pushState\(packet\)/);
  assert.match(app, /showApp\(\); void syncGoHubControlPort\(\{ force:true \}\)/);
  assert.match(app, /visibilitychange/);
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
