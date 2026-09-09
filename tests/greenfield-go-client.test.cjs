"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const flowPath = 'ui/go-client-flow.mjs';
const providerPath = 'master-input/go-client-interpreter-provider.mjs';
const appPath = 'ui/go-client.mjs';
const htmlPath = 'index.html';
const stylePath = 'go-client.css';

const flowReady = fs.existsSync(flowPath);
const providerReady = fs.existsSync(providerPath);

test('GO Client flow kernel exists inside the existing app', () => {
  assert.ok(flowReady, `missing ${flowPath}`);
});

if (flowReady) {
  test('package estimate follows published page thresholds and never invents page count', async () => {
    const { estimatePackage } = await import('../ui/go-client-flow.mjs');
    assert.deepEqual(estimatePackage({ pageCount:5 }), { package:'STARTER', priceBaht:490, pageCount:5, extraPages:0 });
    assert.deepEqual(estimatePackage({ pageCount:10 }), { package:'STANDARD', priceBaht:790, pageCount:10, extraPages:0 });
    assert.deepEqual(estimatePackage({ pageCount:20 }), { package:'BUSINESS', priceBaht:1390, pageCount:20, extraPages:0 });
    assert.deepEqual(estimatePackage({ pageCount:23 }), { package:'BUSINESS', priceBaht:1600, pageCount:23, extraPages:3 });
    assert.equal(estimatePackage({ pageCount:null }), null);
  });

  test('local sales router catches cheap obvious intents before API fallback', async () => {
    const { detectLocalIntent } = await import('../ui/go-client-flow.mjs');
    assert.equal(detectLocalIntent('ราคาเท่าไรครับ').intent, 'PRICE');
    assert.equal(detectLocalIntent('แก้งานได้กี่รอบ').intent, 'REVISION');
    assert.equal(detectLocalIntent('ขอให้ GO ช่วยดู').intent, 'HELP');
    assert.equal(detectLocalIntent('สนใจทำ Company Profile ครับ').intent, 'START');
    assert.equal(detectLocalIntent('ประโยคแปลกมากที่ยังไม่รู้จะพาไปไหน').intent, 'UNKNOWN');
  });

  test('checklists are fixed per supported job type with a general fallback', async () => {
    const { getChecklist } = await import('../ui/go-client-flow.mjs');
    const company = getChecklist('COMPANY_PROFILE');
    assert.equal(company.jobType, 'COMPANY_PROFILE');
    assert.ok(company.items.some(item => item.id === 'company_info' && item.required));
    assert.ok(company.items.some(item => item.id === 'logo_visuals'));

    const fallback = getChecklist('OTHER');
    assert.equal(fallback.jobType, 'OTHER');
    assert.ok(fallback.items.some(item => item.id === 'primary_content' && item.required));
  });

  test('filename/type mapping can satisfy multiple checklist items without reading file content', async () => {
    const { getChecklist, mapMaterialToChecklist } = await import('../ui/go-client-flow.mjs');
    const checklist = getChecklist('COMPANY_PROFILE');
    const result = mapMaterialToChecklist({ name:'company_services_contact.docx', type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }, checklist);
    assert.ok(result.matchedItemIds.includes('company_info'));
    assert.ok(result.matchedItemIds.includes('services'));
    assert.ok(result.matchedItemIds.includes('contact'));
  });

  test('client complete-as-provided stops repeated asking but does not fake readiness', async () => {
    const { getChecklist, evaluateChecklist } = await import('../ui/go-client-flow.mjs');
    const checklist = getChecklist('PROPOSAL');
    const state = {
      receivedItemIds:new Set(['visuals']),
      clientConfirmedComplete:true,
    };
    const result = evaluateChecklist(checklist, state);
    assert.equal(result.completeAsProvided, true);
    assert.equal(result.ready, false);
    assert.ok(result.blockingMissing.length > 0);
    assert.equal(result.shouldAskForMissing, false);
  });

  test('manager packet is compact and keeps only operational context', async () => {
    const { buildManagerPacket } = await import('../ui/go-client-flow.mjs');
    const packet = buildManagerPacket({
      stage:'ESTIMATE',
      lastClientMessage:'พี่ครับ ราคานี้แรงไปนิด',
      jobType:'COMPANY_PROFILE',
      package:'STANDARD',
      estimate:{ priceBaht:790, pageCount:10, turnaroundDays:'4-5' },
      checklistSummary:{ received:4, waiting:1, verify:0 },
      recentMessages:Array.from({length:12}, (_,i)=>({role:i%2?'assistant':'user', text:`m${i}`})),
      giantInternalState:'SHOULD_NOT_LEAK',
    }, 'PRICE', 'CLIENT');
    assert.equal(packet.source, 'CLIENT');
    assert.equal(packet.reason, 'PRICE');
    assert.equal(packet.stage, 'ESTIMATE');
    assert.equal(packet.recentContext.length <= 4, true);
    assert.equal('giantInternalState' in packet, false);
  });
}

test('GO Client interpreter provider exists in the existing master-input stack', () => {
  assert.ok(providerReady, `missing ${providerPath}`);
});

if (providerReady) {
  test('GO Client adapter uses the same model family and strict Structured Outputs', async () => {
    const { buildGoClientInterpretRequest, GO_CLIENT_PROVIDER_MODEL } = await import('../master-input/go-client-interpreter-provider.mjs');
    const { INTERPRETER_PROVIDER_MODEL } = await import('../master-input/interpreter-provider.mjs');
    const request = buildGoClientInterpretRequest('ราคาเท่าไรครับ', { stage:'SALES' });
    assert.equal(GO_CLIENT_PROVIDER_MODEL, INTERPRETER_PROVIDER_MODEL);
    assert.equal(request.model, INTERPRETER_PROVIDER_MODEL);
    assert.equal(request.store, false);
    assert.equal(request.text.format.type, 'json_schema');
    assert.equal(request.text.format.strict, true);
    const schemaText = JSON.stringify(request.text.format.schema);
    assert.equal(schemaText.includes('runtimeMethod'), false);
    assert.equal(schemaText.includes('commands'), false);
    assert.equal(schemaText.includes('domain'), false);
    assert.equal(schemaText.includes('PRICE'), true);
    assert.equal(schemaText.includes('COMPANY_PROFILE'), true);
  });

  test('GO Client adapter parses strict result and does not leak private prompt in errors', async () => {
    const { interpretGoClientTextWithOpenAI } = await import('../master-input/go-client-interpreter-provider.mjs');
    const goodFetch = async (_url, options) => {
      const sent = JSON.parse(options.body);
      assert.equal(options.headers.authorization, 'Bearer TEST_KEY');
      assert.equal(JSON.stringify(sent).includes('SECRET CLIENT TEXT'), true);
      const result = {
        intent:'PRICE', jobType:'COMPANY_PROFILE', package:null,
        pageCount:null, desiredDate:null, wantsEstimate:false,
        wantsManager:false, clientConfirmedComplete:false,
      };
      return new Response(JSON.stringify({ output:[{ type:'message', content:[{ type:'output_text', text:JSON.stringify(result) }] }] }), { status:200, headers:{'content-type':'application/json'} });
    };
    const result = await interpretGoClientTextWithOpenAI({ apiKey:'TEST_KEY', text:'SECRET CLIENT TEXT', context:{stage:'SALES'}, fetchImpl:goodFetch });
    assert.equal(result.intent, 'PRICE');
    assert.equal(result.jobType, 'COMPANY_PROFILE');

    const badFetch = async () => new Response(JSON.stringify({ output:[{ type:'message', content:[{ type:'output_text', text:'not-json' }] }] }), { status:200, headers:{'content-type':'application/json'} });
    await assert.rejects(() => interpretGoClientTextWithOpenAI({ apiKey:'TEST_KEY', text:'PRIVATE CLIENT MATERIAL', fetchImpl:badFetch }), error => {
      assert.equal(error.code, 'INTERPRETER_INVALID_OUTPUT');
      assert.equal(String(error.message).includes('PRIVATE CLIENT MATERIAL'), false);
      return true;
    });
  });

  test('same /api/v1/interpret endpoint branches GO_CLIENT without changing legacy interpreter', async () => {
    const { handleApiRequest } = await import('../worker/index.mjs');
    let legacyCalls = 0;
    let clientCalls = 0;
    const env = {
      OPENAI_API_KEY:'TEST_KEY',
      INTERPRET_RATE_LIMITER:{ async limit(){ return { success:true }; } },
    };
    const deps = {
      interpretText:async () => { legacyCalls += 1; return { action:'CREATE', object:'EXPENSE', fields:{ title:'ข้าว', amountBaht:65, paymentMode:null, note:null } }; },
      interpretGoClientText:async () => { clientCalls += 1; return { intent:'PRICE', jobType:null, package:null, pageCount:null, desiredDate:null, wantsEstimate:false, wantsManager:false, clientConfirmedComplete:false }; },
    };

    const clientResponse = await handleApiRequest(new Request('https://metro.example/api/v1/interpret', {
      method:'POST', headers:{'content-type':'application/json'},
      body:JSON.stringify({ version:'1', text:'ราคาเท่าไร', context:{surface:'GO_CLIENT',stage:'SALES'} }),
    }), env, deps);
    assert.equal(clientResponse.status, 200);
    const clientBody = await clientResponse.json();
    assert.equal(clientBody.intent, 'PRICE');
    assert.equal(clientBody.surface, 'GO_CLIENT');
    assert.equal(clientCalls, 1);
    assert.equal(legacyCalls, 0);

    const legacyResponse = await handleApiRequest(new Request('https://metro.example/api/v1/interpret', {
      method:'POST', headers:{'content-type':'application/json'},
      body:JSON.stringify({ version:'1', text:'ข้าว 65', context:{} }),
    }), env, deps);
    assert.equal(legacyResponse.status, 200);
    const legacyBody = await legacyResponse.json();
    assert.equal(legacyBody.object, 'EXPENSE');
    assert.equal(legacyCalls, 1);
    assert.equal(clientCalls, 1);
  });
}

test('GO Client is one mode of the existing root app, not a second HTML app', () => {
  assert.equal(fs.existsSync('go-client/index.html'), false);
  assert.ok(fs.existsSync(htmlPath));
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.match(html, /id="gate"/);
  assert.match(html, /id="workspace"/);
});

test('root app explicitly skips owner bootstrap when client mode is active', () => {
  const rootApp = fs.readFileSync('app.mjs', 'utf8');
  assert.match(rootApp, /from '\.\/ui\/go-client\.mjs'/);
  assert.match(rootApp, /if \(isGoClientMode\(\)\)/);
  assert.match(rootApp, /activateGoClientMode\(\)/);
  const clientBranch = rootApp.indexOf('if (isGoClientMode())');
  const bootstrap = rootApp.lastIndexOf('bootstrapEntry()');
  assert.ok(clientBranch >= 0 && bootstrap > clientBranch, 'client-mode gate must exist before owner bootstrap call');
});

test('client browser module creates the public shell in the same document and uses filename metadata only', () => {
  assert.ok(fs.existsSync(appPath), `missing ${appPath}`);
  assert.ok(fs.existsSync(stylePath), `missing ${stylePath}`);
  const source = fs.readFileSync(appPath, 'utf8');
  assert.match(source, /\.\/go-client-flow\.mjs/);
  assert.match(source, /go-client\.css/);
  assert.match(source, /id="goClientShell"/);
  assert.match(source, /ระบบกึ่ง AI/);
  assert.match(source, /id="goClientForm"/);
  assert.match(source, /id="goClientInput"/);
  assert.match(source, /id="goClientFiles"[^>]*multiple/);
  assert.match(source, /id="goClientHelp"/);
  assert.match(source, /data-go-client-package="STARTER"/);
  assert.match(source, /data-go-client-package="STANDARD"/);
  assert.match(source, /data-go-client-package="BUSINESS"/);
  assert.match(source, /\/api\/v1\/interpret/);
  assert.match(source, /surface:'GO_CLIENT'/);
  assert.match(source, /mapMaterialToChecklist/);
  assert.match(source, /buildJobSummary/);
  assert.doesNotMatch(source, /OPENAI_API_KEY/);
  assert.doesNotMatch(source, /api\.openai\.com/);
  assert.doesNotMatch(source, /openGreenfieldRuntime/);
  assert.doesNotMatch(source, /\.arrayBuffer\(/);
  assert.doesNotMatch(source, /file\.text\(/);
});
