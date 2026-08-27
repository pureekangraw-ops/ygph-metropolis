"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const contractPath = 'master-input/intent-contract.mjs';
const providerPath = 'master-input/interpreter-provider.mjs';
const routerPath = 'greenfield/master-input-router.mjs';
const uiPath = 'ui/master-input.mjs';
const requiredModules = [contractPath, providerPath, routerPath, uiPath];
const modulesReady = requiredModules.every(path => fs.existsSync(path));

test('Master Input v1 implementation modules exist', () => {
  for (const path of requiredModules) assert.ok(fs.existsSync(path), `missing ${path}`);
});

if (modulesReady) {
  test('intent gate allows only approved CREATE and QUERY semantics', async () => {
    const { gateIntentProposal } = await import('../master-input/intent-contract.mjs');

    assert.deepEqual(gateIntentProposal({
      action:'CREATE', object:'EXPENSE',
      fields:{ title:'ข้าว', amountBaht:65, paymentMode:null, note:null },
    }), {
      version:'1', status:'READY', action:'CREATE', object:'EXPENSE',
      fields:{ title:'ข้าว', amountSatang:6500, paymentMode:null, note:null },
      missing:[], question:null, manual:false,
    });

    assert.deepEqual(gateIntentProposal({
      action:'CREATE', object:'OTHER_INCOME',
      fields:{ title:'รายรับอื่น', amountBaht:500, paymentMode:null, note:null },
    }).status, 'READY');

    const rideQuery = gateIntentProposal({
      action:'QUERY', object:'RIDE_TODAY_SUMMARY',
      fields:{ title:null, amountBaht:null, paymentMode:null, note:null },
    });
    assert.equal(rideQuery.status, 'READY');
    assert.equal(rideQuery.action, 'QUERY');
  });

  test('intent gate asks instead of guessing required ride-job fields', async () => {
    const { gateIntentProposal } = await import('../master-input/intent-contract.mjs');
    const result = gateIntentProposal({
      action:'CREATE', object:'RIDE_JOB',
      fields:{ title:null, amountBaht:380, paymentMode:null, note:null },
    });
    assert.equal(result.status, 'ASK');
    assert.deepEqual(result.missing, ['paymentMode']);
    assert.match(result.question, /เงินสด|เครดิต/);
  });

  test('intent gate keeps EDIT manual, DELETE off, and SALE/PURCHASE default denied', async () => {
    const { gateIntentProposal } = await import('../master-input/intent-contract.mjs');
    const blank = { title:null, amountBaht:null, paymentMode:null, note:null };

    const edit = gateIntentProposal({ action:'UPDATE', object:'UNKNOWN', fields:blank });
    assert.equal(edit.status, 'UNSUPPORTED');
    assert.equal(edit.manual, true);

    const remove = gateIntentProposal({ action:'DELETE', object:'RIDE_END', fields:blank });
    assert.equal(remove.status, 'UNSUPPORTED');
    assert.equal(remove.manual, false);

    for (const object of ['SALE','PURCHASE']) {
      const denied = gateIntentProposal({ action:'CREATE', object, fields:blank });
      assert.equal(denied.status, 'UNSUPPORTED');
    }
  });

  test('intent gate fails closed on malformed, invented, or unsafe proposal fields', async () => {
    const { gateIntentProposal } = await import('../master-input/intent-contract.mjs');
    assert.throws(() => gateIntentProposal(null), /INVALID_INTENT_PROPOSAL/);
    assert.throws(() => gateIntentProposal({ action:'CREATE', object:'EXPENSE', fields:{ title:'ข้าว', amountBaht:65, paymentMode:null, note:null, domain:'LEDGER' } }), /INVALID_INTENT_FIELDS/);
    assert.throws(() => gateIntentProposal({ action:'EXECUTE_COMMAND', object:'EXPENSE', fields:{ title:'ข้าว', amountBaht:65, paymentMode:null, note:null } }), /INVALID_INTENT_ACTION/);
    assert.throws(() => gateIntentProposal({ action:'CREATE', object:'LEDGER_CREATE_TRANSACTION', fields:{ title:'ข้าว', amountBaht:65, paymentMode:null, note:null } }), /INVALID_INTENT_OBJECT/);
  });

  test('safe router maps READY intent only to approved high-level Runtime methods', async () => {
    const { prepareMasterExecution } = await import('../greenfield/master-input-router.mjs');
    const fixed = (() => { let i=0; return prefix => `${prefix}-TEST-${++i}`; })();
    const base = { version:'1', status:'READY', action:'CREATE', missing:[], question:null, manual:false };

    const expense = prepareMasterExecution({ ...base, object:'EXPENSE', fields:{ title:'ข้าว', amountSatang:6500, paymentMode:null, note:null } }, {
      projection:{ ride:{ activeRound:null } }, idFactory:fixed,
    });
    assert.equal(expense.method, 'expense');
    assert.equal(expense.input.amountSatang, 6500);
    assert.match(expense.input.workflowId, /^WF-MASTER-/);
    assert.match(expense.input.ledgerTransactionId, /^TX-MASTER-/);
    assert.equal('commands' in expense, false);
    assert.equal('domain' in expense, false);

    const income = prepareMasterExecution({ ...base, object:'OTHER_INCOME', fields:{ title:'อื่น', amountSatang:50000, paymentMode:null, note:null } }, {
      projection:{ ride:{ activeRound:null } }, idFactory:fixed,
    });
    assert.equal(income.method, 'otherIncome');
  });

  test('safe router resolves ride state locally and never accepts provider-owned Runtime ids', async () => {
    const { prepareMasterExecution } = await import('../greenfield/master-input-router.mjs');
    const fixed = prefix => `${prefix}-SAFE`;
    const base = { version:'1', status:'READY', action:'CREATE', missing:[], question:null, manual:false };

    assert.throws(() => prepareMasterExecution({ ...base, object:'RIDE_JOB', fields:{ title:null, amountSatang:38000, paymentMode:'CASH', note:null } }, {
      projection:{ ride:{ activeRound:null } }, idFactory:fixed,
    }), /MASTER_INPUT_RIDE_ROUND_REQUIRED/);

    const job = prepareMasterExecution({ ...base, object:'RIDE_JOB', fields:{ title:null, amountSatang:38000, paymentMode:'CASH', note:'ทดสอบ' } }, {
      projection:{ ride:{ activeRound:{ recordId:'ROUND-LOCAL' } } }, idFactory:fixed,
    });
    assert.equal(job.method, 'rideJob');
    assert.equal(job.input.roundId, 'ROUND-LOCAL');
    assert.equal(job.input.jobId, 'JOB-MASTER-SAFE');
    assert.equal(job.input.ledgerTransactionId, 'TX-MASTER-SAFE');

    assert.throws(() => prepareMasterExecution({ ...base, object:'RIDE_START', fields:{ title:null, amountSatang:null, paymentMode:null, note:null } }, {
      projection:{ ride:{ activeRound:{ recordId:'ROUND-EXISTING' } } }, idFactory:fixed,
    }), /MASTER_INPUT_RIDE_ROUND_ACTIVE/);
  });

  test('QUERY resolver reads current projection without mutation', async () => {
    const { prepareMasterExecution, executePreparedMasterIntent } = await import('../greenfield/master-input-router.mjs');
    const intent = {
      version:'1', status:'READY', action:'QUERY', object:'RIDE_TODAY_SUMMARY',
      fields:{ title:null, amountSatang:null, paymentMode:null, note:null }, missing:[], question:null, manual:false,
    };
    const projection = { ride:{ generatedSatang:46000, cashJobSatang:30000, creditJobSatang:16000, expenseSatang:7000, pendingCreditSatang:16000, todayRoundState:'COMPLETED', activeRound:null } };
    const prepared = prepareMasterExecution(intent, { projection, idFactory:() => { throw new Error('QUERY_MUST_NOT_CREATE_ID'); } });
    assert.equal(prepared.kind, 'QUERY');
    let writes = 0;
    const runtime = {
      async readState(){ return { revision:9, domains:{} }; },
      project(){ return projection; },
      expense(){ writes += 1; }, otherIncome(){ writes += 1; }, rideStartRound(){ writes += 1; }, rideJob(){ writes += 1; }, rideEndRound(){ writes += 1; },
    };
    const result = await executePreparedMasterIntent(runtime, prepared);
    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.readback.generatedSatang, 46000);
    assert.equal(writes, 0);
  });

  test('CREATE execution uses high-level Runtime and verifies durable readback', async () => {
    const { prepareMasterExecution, executePreparedMasterIntent } = await import('../greenfield/master-input-router.mjs');
    const intent = {
      version:'1', status:'READY', action:'CREATE', object:'EXPENSE',
      fields:{ title:'ข้าว', amountSatang:6500, paymentMode:null, note:null }, missing:[], question:null, manual:false,
    };
    const projection = { ledgerBalanceSatang:100000, ride:{ activeRound:null } };
    const prepared = prepareMasterExecution(intent, { projection, idFactory:prefix => `${prefix}-ONE` });
    const state = { revision:2, domains:{ LEDGER:{ records:{} }, RIDE:{ records:{} } } };
    let called = null;
    const runtime = {
      async expense(input) {
        called = input;
        state.revision = 3;
        state.domains.LEDGER.records[input.ledgerTransactionId] = { record:{ recordId:input.ledgerTransactionId, type:'TRANSACTION', direction:'OUT', amountSatang:input.amountSatang, title:input.title, subtype:'EXPENSE' } };
      },
      async readState(){ return structuredClone(state); },
      project(){ return { ledgerBalanceSatang:93500, ride:{ activeRound:null } }; },
    };
    const result = await executePreparedMasterIntent(runtime, prepared);
    assert.equal(called.amountSatang, 6500);
    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.readback.recordId, prepared.input.ledgerTransactionId);
    assert.equal(result.readback.amountSatang, 6500);
  });

  test('retry after an already-committed Runtime write returns verified success instead of duplicating truth', async () => {
    const { prepareMasterExecution, executePreparedMasterIntent } = await import('../greenfield/master-input-router.mjs');
    const intent = {
      version:'1', status:'READY', action:'CREATE', object:'OTHER_INCOME',
      fields:{ title:'อื่น', amountSatang:50000, paymentMode:null, note:null }, missing:[], question:null, manual:false,
    };
    const prepared = prepareMasterExecution(intent, { projection:{ ledgerBalanceSatang:0, ride:{ activeRound:null } }, idFactory:prefix => `${prefix}-RETRY` });
    const recordId = prepared.input.ledgerTransactionId;
    const state = { revision:8, domains:{ LEDGER:{ records:{ [recordId]:{ record:{ recordId, type:'TRANSACTION', direction:'IN', amountSatang:50000, title:'อื่น', subtype:'OTHER_INCOME' } } } }, RIDE:{ records:{} } } };
    let calls=0;
    const runtime = {
      async otherIncome(){ calls += 1; throw new Error(`DUPLICATE_COMMAND:${prepared.input.workflowId}:LEDGER:${recordId}`); },
      async readState(){ return structuredClone(state); },
      project(){ return { ledgerBalanceSatang:50000, ride:{ activeRound:null } }; },
    };
    const result = await executePreparedMasterIntent(runtime, prepared);
    assert.equal(calls, 1);
    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.recovered, true);
  });

  test('OpenAI adapter uses strict Structured Outputs and never grants authority fields', async () => {
    const { buildOpenAIInterpretRequest } = await import('../master-input/interpreter-provider.mjs');
    const request = buildOpenAIInterpretRequest('ข้าว 65');
    assert.equal(request.store, false);
    assert.match(request.model, /^gpt-/);
    assert.equal(request.text.format.type, 'json_schema');
    assert.equal(request.text.format.strict, true);
    const schemaText = JSON.stringify(request.text.format.schema);
    assert.equal(schemaText.includes('domain'), false);
    assert.equal(schemaText.includes('runtimeMethod'), false);
    assert.equal(schemaText.includes('commands'), false);
    assert.equal(schemaText.includes('DELETE'), true);
    assert.equal(schemaText.includes('UPDATE'), true);
  });

  test('OpenAI adapter accepts structured proposal and rejects malformed provider output', async () => {
    const { interpretTextWithOpenAI } = await import('../master-input/interpreter-provider.mjs');
    const goodFetch = async (_url, options) => {
      const sent = JSON.parse(options.body);
      assert.equal(options.headers.authorization, 'Bearer TEST_KEY');
      assert.equal(JSON.stringify(sent).includes('ข้าว 65'), true);
      return new Response(JSON.stringify({ output:[{ type:'message', content:[{ type:'output_text', text:JSON.stringify({ action:'CREATE', object:'EXPENSE', fields:{ title:'ข้าว', amountBaht:65, paymentMode:null, note:null } }) }] }] }), { status:200, headers:{'content-type':'application/json'} });
    };
    const proposal = await interpretTextWithOpenAI({ apiKey:'TEST_KEY', text:'ข้าว 65', fetchImpl:goodFetch });
    assert.equal(proposal.action, 'CREATE');
    assert.equal(proposal.object, 'EXPENSE');

    const badFetch = async () => new Response(JSON.stringify({ output:[{ type:'message', content:[{ type:'output_text', text:'not-json' }] }] }), { status:200, headers:{'content-type':'application/json'} });
    await assert.rejects(() => interpretTextWithOpenAI({ apiKey:'TEST_KEY', text:'SECRET USER TEXT', fetchImpl:badFetch }), error => {
      assert.equal(error.code, 'INTERPRETER_INVALID_OUTPUT');
      assert.equal(String(error.message).includes('SECRET USER TEXT'), false);
      return true;
    });
  });

  test('Worker configured interpreter returns gated intent without echoing user text', async () => {
    const { handleApiRequest } = await import('../worker/index.mjs');
    const prompt = 'PRIVATE USER TEXT ข้าว 65';
    const response = await handleApiRequest(new Request('https://metro.example/api/v1/interpret', {
      method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ version:'1', text:prompt, context:{} }),
    }), {
      OPENAI_API_KEY:'TEST_KEY',
      INTERPRET_RATE_LIMITER:{ async limit(){ return { success:true }; } },
    }, {
      interpretText: async () => ({ action:'CREATE', object:'EXPENSE', fields:{ title:'ข้าว', amountBaht:65, paymentMode:null, note:null } }),
    });
    assert.equal(response.status, 200);
    const text = await response.text();
    const body = JSON.parse(text);
    assert.equal(body.status, 'READY');
    assert.equal(body.action, 'CREATE');
    assert.equal(body.object, 'EXPENSE');
    assert.equal(body.fields.amountSatang, 6500);
    assert.equal(text.includes(prompt), false);
    assert.match(body.requestId, /^req_[0-9a-f-]{36}$/i);
  });

  test('Master Input browser surface is same-origin, stateful, and does not contain a client secret', () => {
    const source = fs.readFileSync(uiPath, 'utf8');
    assert.match(source, /\/api\/v1\/interpret/);
    assert.match(source, /INTERPRETING/);
    assert.match(source, /READY/);
    assert.match(source, /ASK/);
    assert.match(source, /UNSUPPORTED/);
    assert.match(source, /SUCCESS/);
    assert.match(source, /executePreparedMasterIntent/);
    assert.doesNotMatch(source, /OPENAI_API_KEY/);
    assert.doesNotMatch(source, /api\.openai\.com/);
  });
}
