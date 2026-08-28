"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');

function request(source = 'PATTERN') {
  return {
    version:'1', source, action:'CREATE', object:'EXPENSE',
    fields:{ title:'ข้าว', amountSatang:6500 },
    requiredResult:{
      kind:'LEDGER_TRANSACTION',
      effect:{ direction:'OUT', subtype:'EXPENSE', title:'ข้าว', amountSatang:6500 },
    },
  };
}

function provenCapability({ id = 'EXPENSE_CREATE', evidenceStatus = 'PROVEN' } = {}) {
  const seen = { matches:[], execute:[] };
  return {
    id,
    seen,
    matches(candidate) {
      seen.matches.push(candidate);
      return candidate.action === 'CREATE' && candidate.object === 'EXPENSE';
    },
    async execute({ request:executionRequest }) {
      seen.execute.push(executionRequest);
      if (evidenceStatus === 'MISMATCH') {
        return { evidenceStatus:'MISMATCH', reason:'LEDGER_READBACK_MISMATCH' };
      }
      return { evidenceStatus:'PROVEN', readback:{ recordId:'TX-LH-1', amountSatang:6500 } };
    },
  };
}

test('Path Kernel routes identical Required Results the same for Pattern and AI while source stays provenance-only', async () => {
  const { createPathKernel } = await import('../lighthouse/path-kernel.mjs');
  const sourceSensitive = {
    id:'SOURCE_SENSITIVE_FORBIDDEN',
    matches(candidate) { return candidate.source === 'AI'; },
    async execute() { throw new Error('SOURCE_MUST_NOT_ROUTE'); },
  };
  const direct = provenCapability();
  let gemCalls = 0;
  const kernel = createPathKernel({
    capabilities:[sourceSensitive, direct],
    gemProcessor:async () => { gemCalls += 1; return { status:'UNRESOLVED' }; },
  });

  const pattern = await kernel.run(request('PATTERN'), { runtime:{} });
  const ai = await kernel.run(request('AI'), { runtime:{} });

  assert.equal(pattern.status, 'COMPLETE');
  assert.equal(ai.status, 'COMPLETE');
  assert.equal(pattern.route, 'DIRECT');
  assert.equal(ai.route, 'DIRECT');
  assert.equal(pattern.capabilityId, 'EXPENSE_CREATE');
  assert.equal(ai.capabilityId, 'EXPENSE_CREATE');
  assert.equal(pattern.source, 'PATTERN');
  assert.equal(ai.source, 'AI');
  assert.equal(gemCalls, 0);

  for (const candidate of direct.seen.matches) assert.equal(candidate.source, undefined);
  for (const execution of direct.seen.execute) assert.equal(execution.source, undefined);
});

test('Path Kernel blocks safely when no legal Direct capability exists and does not invent a Gem route', async () => {
  const { createPathKernel } = await import('../lighthouse/path-kernel.mjs');
  let gemCalls = 0;
  const kernel = createPathKernel({
    capabilities:[],
    gemProcessor:async () => { gemCalls += 1; return { status:'RESOLVED' }; },
  });
  const result = await kernel.run(request(), { runtime:{} });
  assert.deepEqual(result, { status:'BLOCKED', route:null, source:'PATTERN', reason:'NO_LEGAL_PATH' });
  assert.equal(gemCalls, 0);
});

test('Path Kernel returns VERIFY on readback mismatch and COMPLETE only on proven durable evidence', async () => {
  const { createPathKernel } = await import('../lighthouse/path-kernel.mjs');
  const mismatch = provenCapability({ evidenceStatus:'MISMATCH' });
  const verifyKernel = createPathKernel({ capabilities:[mismatch] });
  const verify = await verifyKernel.run(request(), { runtime:{} });
  assert.deepEqual(verify, {
    status:'VERIFY', route:'DIRECT', capabilityId:'EXPENSE_CREATE', source:'PATTERN', reason:'LEDGER_READBACK_MISMATCH',
  });

  const proven = provenCapability();
  const completeKernel = createPathKernel({ capabilities:[proven] });
  const complete = await completeKernel.run(request(), { runtime:{} });
  assert.deepEqual(complete, {
    status:'COMPLETE', route:'DIRECT', capabilityId:'EXPENSE_CREATE', source:'PATTERN',
    readback:{ recordId:'TX-LH-1', amountSatang:6500 },
  });
});
