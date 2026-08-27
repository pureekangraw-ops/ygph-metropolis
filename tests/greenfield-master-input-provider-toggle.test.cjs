"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('production explicitly enables provider while staging remains disabled', () => {
  const config = fs.readFileSync('wrangler.jsonc','utf8');
  assert.match(config, /"vars"\s*:\s*\{\s*"INTERPRETER_PROVIDER_ENABLED"\s*:\s*"true"\s*\}/);
  assert.match(config, /"staging"[\s\S]*?"vars"\s*:\s*\{\s*"INTERPRETER_PROVIDER_ENABLED"\s*:\s*"false"\s*\}/);
});

test('Worker fails closed when provider flag is not explicitly enabled even if a secret exists', async () => {
  const { handleApiRequest } = await import('../worker/index.mjs');
  let providerCalls = 0;
  const response = await handleApiRequest(new Request('https://metro.example/api/v1/interpret', {
    method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({version:'1',text:'ข้าว 65',context:{}}),
  }), {
    OPENAI_API_KEY:'TEST_KEY',
    INTERPRETER_PROVIDER_ENABLED:'false',
    INTERPRET_RATE_LIMITER:{ async limit(){ return {success:true}; } },
  }, {
    interpretText: async () => { providerCalls += 1; return {action:'CREATE',object:'EXPENSE',fields:{title:'ข้าว',amountBaht:65,paymentMode:null,note:null}}; },
  });
  assert.equal(response.status,503);
  assert.equal((await response.json()).code,'INTERPRETER_NOT_CONFIGURED');
  assert.equal(providerCalls,0);
});
