function defaultIdFactory(prefix) {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function requiredReadyIntent(intent) {
  if (!intent || intent.version !== '1' || intent.status !== 'READY') throw new Error('MASTER_INPUT_INTENT_NOT_READY');
  if (intent.action !== 'CREATE' && intent.action !== 'QUERY') throw new Error('MASTER_INPUT_ACTION_NOT_ALLOWED');
  return intent;
}

function activeRoundId(projection) {
  const id = projection?.ride?.activeRound?.recordId;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

function id(factory, prefix) {
  const value = factory(prefix);
  if (typeof value !== 'string' || !value.trim()) throw new Error('MASTER_INPUT_ID_FACTORY_INVALID');
  return value.trim();
}

function createPrepared(object, method, input, verify) {
  return Object.freeze({ kind:'CREATE', action:'CREATE', object, method, input:Object.freeze({ ...input }), verify:Object.freeze({ ...verify }) });
}

export function prepareMasterExecution(intent, { projection, idFactory = defaultIdFactory } = {}) {
  intent = requiredReadyIntent(intent);
  if (typeof idFactory !== 'function') throw new Error('MASTER_INPUT_ID_FACTORY_INVALID');

  if (intent.action === 'QUERY') {
    if (intent.object !== 'RIDE_TODAY_SUMMARY') throw new Error('MASTER_INPUT_QUERY_NOT_ALLOWED');
    return Object.freeze({ kind:'QUERY', action:'QUERY', object:'RIDE_TODAY_SUMMARY', method:null, input:null, verify:Object.freeze({ type:'RIDE_TODAY_SUMMARY' }) });
  }

  const fields = intent.fields || {};
  if (intent.object === 'EXPENSE') {
    const workflowId = id(idFactory, 'WF-MASTER');
    const ledgerTransactionId = id(idFactory, 'TX-MASTER');
    return createPrepared('EXPENSE', 'expense', {
      workflowId, ledgerTransactionId, title:fields.title, amountSatang:fields.amountSatang,
    }, { type:'LEDGER_TRANSACTION', recordId:ledgerTransactionId, direction:'OUT', subtype:'EXPENSE', amountSatang:fields.amountSatang });
  }

  if (intent.object === 'OTHER_INCOME') {
    const workflowId = id(idFactory, 'WF-MASTER');
    const ledgerTransactionId = id(idFactory, 'TX-MASTER');
    return createPrepared('OTHER_INCOME', 'otherIncome', {
      workflowId, ledgerTransactionId, title:fields.title, amountSatang:fields.amountSatang,
    }, { type:'LEDGER_TRANSACTION', recordId:ledgerTransactionId, direction:'IN', subtype:'OTHER_INCOME', amountSatang:fields.amountSatang });
  }

  if (intent.object === 'RIDE_START') {
    if (activeRoundId(projection)) throw new Error('MASTER_INPUT_RIDE_ROUND_ACTIVE');
    const workflowId = id(idFactory, 'WF-MASTER');
    const roundId = id(idFactory, 'ROUND-MASTER');
    return createPrepared('RIDE_START', 'rideStartRound', { workflowId, roundId }, { type:'RIDE_ROUND_ACTIVE', roundId });
  }

  if (intent.object === 'RIDE_JOB') {
    const roundId = activeRoundId(projection);
    if (!roundId) throw new Error('MASTER_INPUT_RIDE_ROUND_REQUIRED');
    const workflowId = id(idFactory, 'WF-MASTER');
    const jobId = id(idFactory, 'JOB-MASTER');
    const input = {
      workflowId, roundId, jobId, amountSatang:fields.amountSatang, paymentMode:fields.paymentMode, note:fields.note || '',
    };
    const verify = { type:'RIDE_JOB', roundId, jobId, amountSatang:fields.amountSatang, paymentMode:fields.paymentMode };
    if (fields.paymentMode === 'CASH') {
      const ledgerTransactionId = id(idFactory, 'TX-MASTER');
      input.ledgerTransactionId = ledgerTransactionId;
      verify.ledgerTransactionId = ledgerTransactionId;
    }
    return createPrepared('RIDE_JOB', 'rideJob', input, verify);
  }

  if (intent.object === 'RIDE_END') {
    const roundId = activeRoundId(projection);
    if (!roundId) throw new Error('MASTER_INPUT_RIDE_ROUND_REQUIRED');
    const workflowId = id(idFactory, 'WF-MASTER');
    return createPrepared('RIDE_END', 'rideEndRound', { workflowId, roundId }, { type:'RIDE_ROUND_CLOSED', roundId });
  }

  throw new Error('MASTER_INPUT_OBJECT_NOT_ALLOWED');
}

function record(state, domain, recordId) {
  return state?.domains?.[domain]?.records?.[recordId]?.record || null;
}

function verifyReadback(state, projection, prepared) {
  const check = prepared.verify;
  if (check.type === 'LEDGER_TRANSACTION') {
    const found = record(state, 'LEDGER', check.recordId);
    if (!found || found.type !== 'TRANSACTION' || found.direction !== check.direction || Number(found.amountSatang) !== check.amountSatang || String(found.subtype || '') !== check.subtype) {
      throw new Error('MASTER_INPUT_READBACK_MISMATCH');
    }
    return {
      recordId:found.recordId,
      direction:found.direction,
      amountSatang:Number(found.amountSatang),
      subtype:found.subtype,
      revision:state?.revision ?? null,
      ledgerBalanceSatang:Number(projection?.ledgerBalanceSatang ?? 0),
    };
  }

  if (check.type === 'RIDE_ROUND_ACTIVE') {
    const found = record(state, 'RIDE', check.roundId);
    if (!found || found.type !== 'ROUND' || found.status !== 'ACTIVE') throw new Error('MASTER_INPUT_READBACK_MISMATCH');
    return { roundId:found.recordId, status:found.status, revision:state?.revision ?? null };
  }

  if (check.type === 'RIDE_JOB') {
    const found = record(state, 'RIDE', check.jobId);
    if (!found || found.type !== 'JOB' || found.roundId !== check.roundId || Number(found.amountSatang) !== check.amountSatang || found.paymentMode !== check.paymentMode) {
      throw new Error('MASTER_INPUT_READBACK_MISMATCH');
    }
    if (check.paymentMode === 'CASH') {
      const ledger = record(state, 'LEDGER', check.ledgerTransactionId);
      if (!ledger || ledger.type !== 'TRANSACTION' || ledger.direction !== 'IN' || Number(ledger.amountSatang) !== check.amountSatang || String(ledger.subtype || '') !== 'RIDE_CASH') {
        throw new Error('MASTER_INPUT_READBACK_MISMATCH');
      }
    }
    return {
      jobId:found.recordId,
      roundId:found.roundId,
      amountSatang:Number(found.amountSatang),
      paymentMode:found.paymentMode,
      revision:state?.revision ?? null,
      generatedSatang:Number(projection?.ride?.generatedSatang ?? 0),
    };
  }

  if (check.type === 'RIDE_ROUND_CLOSED') {
    const found = record(state, 'RIDE', check.roundId);
    if (!found || found.type !== 'ROUND' || found.status !== 'CLOSED') throw new Error('MASTER_INPUT_READBACK_MISMATCH');
    return { roundId:found.recordId, status:found.status, revision:state?.revision ?? null };
  }

  throw new Error('MASTER_INPUT_READBACK_RULE_UNKNOWN');
}

function queryReadback(projection, prepared) {
  if (prepared.verify?.type !== 'RIDE_TODAY_SUMMARY') throw new Error('MASTER_INPUT_QUERY_NOT_ALLOWED');
  const ride = projection?.ride || {};
  return {
    generatedSatang:Number(ride.generatedSatang || 0),
    cashJobSatang:Number(ride.cashJobSatang || 0),
    creditJobSatang:Number(ride.creditJobSatang || 0),
    expenseSatang:Number(ride.expenseSatang || 0),
    pendingCreditSatang:Number(ride.pendingCreditSatang || 0),
    todayRoundState:String(ride.todayRoundState || 'NOT_STARTED'),
  };
}

function duplicateError(error) {
  return String(error?.message || error || '').startsWith('DUPLICATE_COMMAND:');
}

export async function executePreparedMasterIntent(runtime, prepared) {
  if (!runtime || typeof runtime.readState !== 'function' || typeof runtime.project !== 'function') throw new Error('MASTER_INPUT_RUNTIME_INVALID');
  if (!prepared || (prepared.kind !== 'CREATE' && prepared.kind !== 'QUERY')) throw new Error('MASTER_INPUT_EXECUTION_INVALID');

  if (prepared.kind === 'QUERY') {
    await runtime.readState();
    return { status:'SUCCESS', action:'QUERY', object:prepared.object, recovered:false, readback:queryReadback(runtime.project(), prepared) };
  }

  if (typeof runtime[prepared.method] !== 'function') throw new Error('MASTER_INPUT_RUNTIME_METHOD_REJECTED');
  let recovered = false;
  try {
    await runtime[prepared.method](prepared.input);
  } catch (error) {
    if (!duplicateError(error)) throw error;
    recovered = true;
  }
  const state = await runtime.readState();
  const projection = runtime.project();
  const readback = verifyReadback(state, projection, prepared);
  return { status:'SUCCESS', action:'CREATE', object:prepared.object, recovered, readback };
}
