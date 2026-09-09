"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const providerPath = 'master-input/go-client-manager-provider.mjs';

function samplePacket(){
  return {
    source:'CLIENT',
    reason:'CLIENT_HELP',
    stage:'ESTIMATE',
    lastClientMessage:'พี่ครับ ช่วยดูราคานี้ให้หน่อย',
    jobType:'COMPANY_PROFILE',
    package:'STANDARD',
    estimate:{ priceBaht:790, pageCount:10, turnaroundDays:null },
    checklistSummary:{ received:4, waiting:1, optional:2, verify:0 },
    recentContext:[
      { role:'user', text:'อยากทำ Company Profile' },
      { role:'assistant', text:'ส่งข้อมูลมาได้ครับ' },
      { role:'user', text:'พี่ครับ ช่วยดูราคานี้ให้หน่อย' },
    ],
  };
}

test('GO Client manager provider exists in the existing master-input provider stack', () => {
  assert.ok(fs.existsSync(providerPath), `missing ${providerPath}`);
});

if (fs.existsSync(providerPath)) {
  test('manager peek uses the same model family and strict non-authoritative output', async () => {
    const { buildGoClientManagerRequest, GO_CLIENT_MANAGER_MODEL } = await import('../master-input/go-client-manager-provider.mjs');
    const { INTERPRETER_PROVIDER_MODEL } = await import('../master-input/interpreter-provider.mjs');
    const request = buildGoClientManagerRequest(samplePacket());
    assert.equal(GO_CLIENT_MANAGER_MODEL, INTERPRETER_PROVIDER_MODEL);
    assert.equal(request.model, INTERPRETER_PROVIDER_MODEL);
    assert.equal(request.store, false);
    assert.equal(request.text.format.type, 'json_schema');
    assert.equal(request.text.format.strict, true);
    const schema = JSON.stringify(request.text.format.schema);
    assert.match(schema, /WHISPER/);
    assert.match(schema, /DIRECT_REPLY/);
    assert.match(schema, /TAKEOVER/);
    assert.match(schema, /L1/);
    assert.match(schema, /L5/);
    assert.doesNotMatch(schema, /runtimeMethod|commands|domain|mutation/);
  });

  test('manager peek sends only compact operational packet fields', async () => {
    const { buildGoClientManagerRequest } = await import('../master-input/go-client-manager-provider.mjs');
    const packet = { ...samplePacket(), giantInternalState:'DO_NOT_SEND', ownerPin:'123456', files:[{bytes:'SECRET'}] };
    packet.recentContext = Array.from({length:20},(_,i)=>({role:i%2?'assistant':'user',text:`message-${i}-`+'x'.repeat(1000)}));
    const request = buildGoClientManagerRequest(packet);
    const input = JSON.stringify(request.input);
    assert.equal(input.includes('DO_NOT_SEND'), false);
    assert.equal(input.includes('123456'), false);
    assert.equal(input.includes('SECRET'), false);
    assert.ok(input.length < 7000, `manager peek prompt too large: ${input.length}`);
  });

  test('manager decision gate enforces whisper versus visible reply semantics', async () => {
    const { gateGoClientManagerDecision } = await import('../master-input/go-client-manager-provider.mjs');
    assert.deepEqual(gateGoClientManagerDecision({
      disposition:'WHISPER', severity:'L2', signalIntent:'PRICE', managerReply:null, reasonCode:'PRICE_SCOPE',
    }), {
      disposition:'WHISPER', severity:'L2', signalIntent:'PRICE', managerReply:null, reasonCode:'PRICE_SCOPE',
    });
    assert.throws(() => gateGoClientManagerDecision({
      disposition:'WHISPER', severity:'L2', signalIntent:null, managerReply:'ผมมาช่วยเองครับ', reasonCode:'PRICE_SCOPE',
    }), /INTERPRETER_INVALID_OUTPUT/);
    assert.throws(() => gateGoClientManagerDecision({
      disposition:'TAKEOVER', severity:'L5', signalIntent:null, managerReply:null, reasonCode:'CRITICAL',
    }), /INTERPRETER_INVALID_OUTPUT/);
  });

  test('manager provider parses a strict decision without leaking client text in errors', async () => {
    const { interpretGoClientManagerWithOpenAI } = await import('../master-input/go-client-manager-provider.mjs');
    const goodFetch = async (_url, options) => {
      assert.equal(options.headers.authorization, 'Bearer TEST_KEY');
      const result = { disposition:'WHISPER', severity:'L2', signalIntent:'PRICE', managerReply:null, reasonCode:'PRICE_SCOPE' };
      return new Response(JSON.stringify({ output:[{ type:'message', content:[{ type:'output_text', text:JSON.stringify(result) }] }] }), {status:200,headers:{'content-type':'application/json'}});
    };
    const result = await interpretGoClientManagerWithOpenAI({ apiKey:'TEST_KEY', packet:samplePacket(), fetchImpl:goodFetch });
    assert.equal(result.disposition, 'WHISPER');
    assert.equal(result.signalIntent, 'PRICE');

    const badFetch = async () => new Response(JSON.stringify({ output:[{type:'message',content:[{type:'output_text',text:'bad-json'}]}] }), {status:200,headers:{'content-type':'application/json'}});
    await assert.rejects(() => interpretGoClientManagerWithOpenAI({ apiKey:'TEST_KEY', packet:{...samplePacket(),lastClientMessage:'PRIVATE CUSTOMER TEXT'}, fetchImpl:badFetch }), error => {
      assert.equal(error.code, 'INTERPRETER_INVALID_OUTPUT');
      assert.equal(String(error.message).includes('PRIVATE CUSTOMER TEXT'), false);
      return true;
    });
  });
}

test('manager whisper is resolved locally with no need for another AI interpretation', async () => {
  const flow = await import('../ui/go-client-flow.mjs');
  assert.equal(typeof flow.resolveManagerDecision, 'function');
  const result = flow.resolveManagerDecision({
    disposition:'WHISPER', severity:'L2', signalIntent:'PRICE', managerReply:null, reasonCode:'PRICE_SCOPE',
  }, {stage:'SALES'});
  assert.equal(result.disposition, 'WHISPER');
  assert.equal(result.managerVisible, false);
  assert.match(result.text, /490/);
});

test('same interpreter endpoint routes GO_CLIENT_MANAGER through the same rate-limited Worker', async () => {
  const { handleApiRequest } = await import('../worker/index.mjs');
  let managerCalls = 0;
  let limiterCalls = 0;
  const env = {
    OPENAI_API_KEY:'TEST_KEY',
    INTERPRET_RATE_LIMITER:{ async limit(){ limiterCalls += 1; return {success:true}; } },
  };
  const deps = {
    interpretGoClientManager:async ({packet}) => {
      managerCalls += 1;
      assert.equal(packet.reason, 'CLIENT_HELP');
      return { disposition:'WHISPER', severity:'L2', signalIntent:'PRICE', managerReply:null, reasonCode:'PRICE_SCOPE' };
    },
  };
  const response = await handleApiRequest(new Request('https://metro.example/api/v1/interpret', {
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({version:'1',text:'manager peek',context:{surface:'GO_CLIENT_MANAGER',managerPacket:samplePacket()}}),
  }), env, deps);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.surface, 'GO_CLIENT_MANAGER');
  assert.equal(body.disposition, 'WHISPER');
  assert.equal(managerCalls, 1);
  assert.equal(limiterCalls, 1);
});

test('client help button calls manager peek and uses whisper locally instead of a second classifier call', () => {
  const source = fs.readFileSync('ui/go-client.mjs','utf8');
  assert.match(source, /surface:'GO_CLIENT_MANAGER'/);
  assert.match(source, /resolveManagerDecision/);
  assert.match(source, /async function callManager/);
  assert.match(source, /disposition === 'WHISPER'/);
  assert.match(source, /ygph:go-client-manager-call/);
});
