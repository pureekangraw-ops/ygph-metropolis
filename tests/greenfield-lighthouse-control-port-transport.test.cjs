const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const credentialUrl = pathToFileURL(path.resolve(__dirname, '../lighthouse-next/control-port/control-port-credential.mjs')).href;
const transportUrl = pathToFileURL(path.resolve(__dirname, '../lighthouse-next/control-port/control-port-transport.mjs')).href;
const token = 'a'.repeat(64);
const bootstrap = Object.freeze({
  ok:true,
  contract:'lighthouse-control-port-v1',
  hub_origin:'https://hub.example',
  session_id:'lh-session-1',
  session_token:token,
  expires_at:9999999999999,
  device_label:'Xiaomi 15T',
});

test('GO Hub bootstrap accepts only runtime pairing fields and never owner passcode', async () => {
  const { parseLighthouseHubBootstrap } = await import(credentialUrl);
  const parsed = parseLighthouseHubBootstrap(JSON.stringify(bootstrap));
  assert.equal(parsed.hubOrigin, 'https://hub.example');
  assert.equal(parsed.sessionId, 'lh-session-1');
  assert.equal(parsed.sessionToken, token);
  assert.throws(() => parseLighthouseHubBootstrap({ ...bootstrap, owner_passcode:'never' }), /UNEXPECTED_FIELD/);
  assert.throws(() => parseLighthouseHubBootstrap({ ...bootstrap, hub_origin:'http://evil.example' }), /BOOTSTRAP_INVALID/);
});

test('GO Hub transport pulls commands and pushes receipts/state with paired credential', async () => {
  const { createMemoryLighthouseHubCredentialStore, parseLighthouseHubBootstrap } = await import(credentialUrl);
  const { createLighthouseHubControlPortTransport } = await import(transportUrl);
  const store = createMemoryLighthouseHubCredentialStore();
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    requests.push({ url, init });
    if (url.endsWith('/pull')) return new Response(JSON.stringify({ commands:[{ requestId:'hub-1', capabilityId:'system.appState', payload:{} }] }), { status:200, headers:{'content-type':'application/json'} });
    if (url.endsWith('/receipts')) return new Response(JSON.stringify({ accepted:1 }), { status:200, headers:{'content-type':'application/json'} });
    if (url.endsWith('/state')) return new Response(JSON.stringify({ ok:true }), { status:200, headers:{'content-type':'application/json'} });
    if (url.endsWith('/board')) return new Response(JSON.stringify({ board:{ schemaVersion:1, boardId:'BOARD-LIGHTHOUSE-CENTRE', workId:'WORK-GO-HUB-CENTRE-BOARD', revision:9, updatedAt:'2026-09-19T16:00:00.000Z', pins:[], audit:[] } }), { status:200, headers:{'content-type':'application/json'} });
    if (url.endsWith('/session/stop')) return new Response(JSON.stringify({ ok:true }), { status:200, headers:{'content-type':'application/json'} });
    return new Response('{}', { status:404 });
  };
  const transport = createLighthouseHubControlPortTransport({ fetchImpl, credentialStore:store, now:() => 1 });
  await transport.pair(bootstrap);
  const status = await transport.status();
  assert.equal(status.status, 'PAIRED');
  assert.equal(Object.hasOwn(status, 'sessionToken'), false);

  const commands = await transport.pullInbox();
  assert.equal(commands[0].requestId, 'hub-1');
  await transport.pushOutbox([{ requestId:'hub-1', capabilityId:'system.appState', status:'DONE' }]);
  await transport.pushState({ work:{ nextAction:'WAITING_COMMAND' }, snapshot:{ freshness:'LIVE' } });
  const board = await transport.pullBoard();
  assert.equal(board.boardId, 'BOARD-LIGHTHOUSE-CENTRE');
  assert.equal(board.revision, 9);

  for (const request of requests) {
    assert.equal(request.init.headers['x-lighthouse-session-id'], 'lh-session-1');
    assert.equal(request.init.headers['x-lighthouse-session-token'], token);
  }
  assert.deepEqual(JSON.parse(requests.find(item => item.url.endsWith('/receipts')).init.body).receipts[0].status, 'DONE');

  await transport.disconnect();
  assert.equal((await transport.status()).status, 'UNPAIRED');
});

test('expired local pairing fails before network request', async () => {
  const { createMemoryLighthouseHubCredentialStore, parseLighthouseHubBootstrap } = await import(credentialUrl);
  const { createLighthouseHubControlPortTransport } = await import(transportUrl);
  const store = createMemoryLighthouseHubCredentialStore(parseLighthouseHubBootstrap({ ...bootstrap, expires_at:100 }));
  let called = false;
  const transport = createLighthouseHubControlPortTransport({
    credentialStore:store,
    now:() => 101,
    fetchImpl:async () => { called = true; return new Response('{}'); },
  });
  await assert.rejects(transport.pullInbox(), /SESSION_EXPIRED/);
  assert.equal(called, false);
});

test('HTTP pull does not start when Runtime authority is revoked during credential read', async () => {
  const { parseLighthouseHubBootstrap } = await import(credentialUrl);
  const { createLighthouseHubControlPortTransport } = await import(transportUrl);
  let releaseCredential;
  const credentialReady = new Promise(resolve => { releaseCredential = resolve; });
  let authority = true;
  let fetchCalls = 0;
  const transport = createLighthouseHubControlPortTransport({
    credentialStore:{
      async load() { await credentialReady; return parseLighthouseHubBootstrap(bootstrap); },
      async save() {},
    },
    now:() => 1,
    fetchImpl:async () => { fetchCalls += 1; return new Response('{}'); },
  });

  const pulling = transport.pullInbox({ isActive:() => authority });
  authority = false;
  releaseCredential();
  await assert.rejects(pulling, /LIGHTHOUSE_HUB_PULL_INACTIVE/);
  assert.equal(fetchCalls, 0);
});


test('realtime transport authenticates after connect, keeps credentials out of URL, and triggers authoritative pull on live signals', async () => {
  const { createMemoryLighthouseHubCredentialStore } = await import(credentialUrl);
  const { createLighthouseHubControlPortTransport } = await import(transportUrl);
  const store = createMemoryLighthouseHubCredentialStore();
  const sockets = [];
  const scheduled = [];

  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.listeners = new Map();
      this.sent = [];
      this.closed = false;
      sockets.push(this);
    }
    addEventListener(type, handler) {
      const list = this.listeners.get(type) || [];
      list.push(handler);
      this.listeners.set(type, list);
    }
    emit(type, event = {}) {
      for (const handler of this.listeners.get(type) || []) handler(event);
    }
    send(value) { this.sent.push(String(value)); }
    close() { this.closed = true; }
  }

  const signals = [];
  const statuses = [];
  const transport = createLighthouseHubControlPortTransport({
    fetchImpl:async () => new Response('{}', { status:200, headers:{'content-type':'application/json'} }),
    WebSocketImpl:FakeWebSocket,
    credentialStore:store,
    now:() => 1,
    setTimeoutImpl:fn => { scheduled.push(fn); return scheduled.length; },
    clearTimeoutImpl:() => {},
  });
  await transport.pair(bootstrap);
  const controller = await transport.openLive({
    onSignal:signal => signals.push(signal),
    onStatus:status => statuses.push(status),
    minRetryMs:10,
    maxRetryMs:20,
  });

  assert.equal(sockets.length, 1);
  const liveUrl = new URL(sockets[0].url);
  assert.equal(liveUrl.protocol, 'wss:');
  assert.equal(liveUrl.pathname, '/hub/api/lighthouse-control-port/live');
  assert.equal(liveUrl.search, '');
  assert.equal(sockets[0].url.includes(token), false);

  sockets[0].emit('open');
  assert.equal(sockets[0].sent.length, 1);
  const auth = JSON.parse(sockets[0].sent[0]);
  assert.deepEqual(auth, { type:'AUTH', sessionId:'lh-session-1', sessionToken:token });

  sockets[0].emit('message', { data:JSON.stringify({ type:'READY', sessionId:'lh-session-1' }) });
  sockets[0].emit('message', { data:JSON.stringify({ type:'COMMAND_AVAILABLE', requestId:'r1', capabilityId:'finance.expense.create' }) });
  sockets[0].emit('message', { data:JSON.stringify({ type:'BOARD_UPDATED', workId:'WORK-LIVE-1', boardRevision:8, status:'DOING' }) });
  sockets[0].emit('message', { data:JSON.stringify({ type:'STATE_UPDATED' }) });
  assert.deepEqual(signals.map(value => value.type), ['READY','COMMAND_AVAILABLE','BOARD_UPDATED']);
  assert.equal(signals[2].boardRevision, 8);
  assert.equal(statuses.some(value => value.status === 'LIVE'), true);

  sockets[0].emit('close', { reason:'network' });
  assert.equal(scheduled.length, 1);
  scheduled[0]();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(sockets.length, 2, 'reconnect should create a new socket while controller is active');

  controller.close();
  assert.equal(sockets[1].closed, true);
});

test('realtime transport does not create a socket when live authority is revoked during credential read', async () => {
  const { parseLighthouseHubBootstrap } = await import(credentialUrl);
  const { createLighthouseHubControlPortTransport } = await import(transportUrl);
  let releaseCredential;
  const credentialReady = new Promise(resolve => { releaseCredential = resolve; });
  const paired = parseLighthouseHubBootstrap(bootstrap);
  const sockets = [];
  let liveAuthority = true;
  class FakeWebSocket { constructor(url) { sockets.push(url); } }
  const transport = createLighthouseHubControlPortTransport({
    fetchImpl:async () => new Response('{}'),
    WebSocketImpl:FakeWebSocket,
    credentialStore:{
      async load() { await credentialReady; return paired; },
      async save() {},
    },
    now:() => 1,
  });

  const opening = transport.openLive({ isActive:() => liveAuthority });
  liveAuthority = false;
  releaseCredential();
  await assert.rejects(opening, /LIGHTHOUSE_HUB_LIVE_INACTIVE/);
  assert.equal(sockets.length, 0);
});

test('LIGHTHOUSE app uses live notification as primary trigger while retaining 30-second reconcile and online recovery', () => {
  const fs = require('node:fs');
  const appSource = fs.readFileSync(path.resolve(__dirname, '../lighthouse-next/app.mjs'), 'utf8');
  assert.match(appSource, /hubControlPortTransport\.openLive\(/);
  assert.match(appSource, /signal\?\.type === 'READY' \|\| signal\?\.type === 'COMMAND_AVAILABLE' \|\| signal\?\.type === 'BOARD_UPDATED'/);
  assert.match(appSource, /hubControlPortTransport\.pullBoard\(\)/);
  assert.match(appSource, /syncGoHubControlPort\(\{ force:true \}\)/);
  assert.match(appSource, /window\.setInterval\(\(\) => \{ void syncGoHubControlPort\(\); \}, 30_000\)/);
  assert.match(appSource, /installControlPortBackgroundSync\(\{/);
  assert.doesNotMatch(appSource, /stopGoHubRealtime\('APP_BACKGROUND'\)/);
  assert.match(appSource, /const pairing = await hubControlPortTransport\.status\(\);\s*if \(!runtimeGate\.isUnlocked\(\)\) return null/);
  assert.match(appSource, /pullInbox:\(\) => runtimeGate\.isUnlocked\(\)\s*\? hubControlPortTransport\.pullInbox\(\{ isActive:\(\) => runtimeGate\.isUnlocked\(\) \}\)\s*:\s*\[\]/);
  assert.match(appSource, /isActive:\(\) => runtimeGate\.isUnlocked\(\)/);
  assert.match(appSource, /function markReadbackVerified[\s\S]*syncGoHubControlPort\(\{ force:true \}\)/);
});
