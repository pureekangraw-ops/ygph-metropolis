"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const branchConfig = fs.readFileSync('wrangler.jsonc', 'utf8');

test('Cloudflare routes only the GO Client public path through the Worker before assets', () => {
  assert.match(branchConfig, /"\/client"/);
  assert.match(branchConfig, /"\/client\/\*"/);
});

test('GO Client recognizes /client while keeping the existing query-string entry mode', async () => {
  const goClient = await import('../ui/go-client.mjs');
  const originalLocation = globalThis.location;
  try {
    globalThis.location = { href:'https://metro.example/client' };
    assert.equal(goClient.isGoClientMode(), true);
    globalThis.location = { href:'https://metro.example/?surface=client' };
    assert.equal(goClient.isGoClientMode(), true);
  } finally {
    if (originalLocation === undefined) delete globalThis.location;
    else globalThis.location = originalLocation;
  }
});

test('GO Client selects the public alias only when entered through /client', async () => {
  const { resolveGoClientInterpretEndpoint } = await import('../ui/go-client.mjs');
  assert.equal(resolveGoClientInterpretEndpoint('https://metro.example/client'), '/client/api/v1/interpret');
  assert.equal(resolveGoClientInterpretEndpoint('https://metro.example/client/'), '/client/api/v1/interpret');
  assert.equal(resolveGoClientInterpretEndpoint('https://metro.example/?surface=client'), '/api/v1/interpret');
  assert.equal(resolveGoClientInterpretEndpoint('https://metro.example/'), '/api/v1/interpret');
});

test('GET /client serves its own staged shell instead of transforming the owner root', async () => {
  const { handleApiRequest } = await import('../worker/index.mjs');
  const seen = [];
  const clientHtml = '<!doctype html><html><head><title>GO Client</title><link rel="stylesheet" href="/client/assets/styles.css"><link rel="stylesheet" href="/client/assets/go-client.css" data-go-client-style></head><body class="go-client-mode"><script type="module" src="/client/assets/ui/go-client-entry.mjs"></script></body></html>';
  const env = {
    ASSETS:{
      async fetch(request) {
        const pathname = new URL(request.url).pathname;
        seen.push(pathname);
        if (pathname === '/client/index.html') return new Response(clientHtml, { status:200, headers:{'content-type':'text/html; charset=utf-8'} });
        return new Response('missing', { status:404 });
      },
    },
  };

  const response = await handleApiRequest(new Request('https://metro.example/client'), env);
  assert.equal(response.status, 200);
  assert.deepEqual(seen, ['/client/index.html']);
  const html = await response.text();
  assert.match(html, /<body class="go-client-mode">/);
  assert.match(html, /href="\/client\/assets\/styles\.css"/);
  assert.match(html, /href="\/client\/assets\/go-client\.css"[^>]*data-go-client-style/);
  assert.match(html, /src="\/client\/assets\/ui\/go-client-entry\.mjs"/);
  assert.doesNotMatch(html, /YGPH METROPOLIS|ui\/master-input\.mjs|src="app\.mjs"/);
});

test('public client asset proxy exposes only the small allowlist, never owner runtime modules', async () => {
  const { handleApiRequest } = await import('../worker/index.mjs');
  const seen = [];
  const env = {
    ASSETS:{
      async fetch(request) {
        const pathname = new URL(request.url).pathname;
        seen.push(pathname);
        return new Response(`asset:${pathname}`, { status:200 });
      },
    },
  };

  const clientModule = await handleApiRequest(new Request('https://metro.example/client/assets/ui/go-client.mjs'), env);
  assert.equal(clientModule.status, 200);
  assert.equal(await clientModule.text(), 'asset:/client/assets/ui/go-client.mjs');
  assert.deepEqual(seen, ['/client/assets/ui/go-client.mjs']);

  const ownerRuntime = await handleApiRequest(new Request('https://metro.example/client/assets/greenfield/runtime.mjs'), env);
  assert.equal(ownerRuntime.status, 404);
  assert.deepEqual(seen, ['/client/assets/ui/go-client.mjs']);
});

test('public client interpret alias forces GO_CLIENT and preserves GO_CLIENT_MANAGER without opening legacy METRO', async () => {
  const { handleApiRequest } = await import('../worker/index.mjs');
  let legacyCalls = 0;
  let clientCalls = 0;
  let managerCalls = 0;
  let rateLimitCalls = 0;
  const env = {
    OPENAI_API_KEY:'TEST_KEY',
    INTERPRET_RATE_LIMITER:{ async limit(){ rateLimitCalls += 1; return { success:true }; } },
  };
  const deps = {
    interpretText:async () => {
      legacyCalls += 1;
      return { action:'CREATE', object:'EXPENSE', fields:{ title:'x', amountBaht:1, paymentMode:null, note:null } };
    },
    interpretGoClientText:async ({ context }) => {
      clientCalls += 1;
      assert.equal(context.surface, 'GO_CLIENT');
      return { intent:'PRICE', jobType:null, package:null, pageCount:null, desiredDate:null, wantsEstimate:false, wantsManager:false, clientConfirmedComplete:false };
    },
    interpretGoClientManager:async () => {
      managerCalls += 1;
      return { disposition:'WHISPER', severity:'L1', signalIntent:'PRICE', managerReply:null, reasonCode:'SIMPLE_GUIDANCE' };
    },
  };

  const clientResponse = await handleApiRequest(new Request('https://metro.example/client/api/v1/interpret', {
    method:'POST', headers:{'content-type':'application/json'},
    body:JSON.stringify({ version:'1', text:'ราคา', context:{ surface:'METRO', stage:'SALES' } }),
  }), env, deps);
  assert.equal(clientResponse.status, 200);
  assert.equal((await clientResponse.json()).surface, 'GO_CLIENT');

  const managerResponse = await handleApiRequest(new Request('https://metro.example/client/api/v1/interpret', {
    method:'POST', headers:{'content-type':'application/json'},
    body:JSON.stringify({ version:'1', text:'manager peek', context:{ surface:'GO_CLIENT_MANAGER', managerPacket:{ source:'CLIENT', reason:'PRICE' } } }),
  }), env, deps);
  assert.equal(managerResponse.status, 200);
  assert.equal((await managerResponse.json()).surface, 'GO_CLIENT_MANAGER');

  assert.equal(clientCalls, 1);
  assert.equal(managerCalls, 1);
  assert.equal(legacyCalls, 0);
  assert.equal(rateLimitCalls, 2);
});
