import { withRuntimeSession } from '../../greenfield/runtime-session.mjs';
import { createLighthouseLedgerBridge } from '../runtime-ledger.mjs';
import { createLighthouseStoreBridge } from '../runtime-store.mjs';
import {
  getLighthouseCapability,
  listLighthouseCapabilities,
} from './capability-registry.mjs';

export const CONTROL_PORT_GUARD = Object.freeze({
  DIRECT:'DIRECT',
  CONFIRM_REQUIRED:'CONFIRM_REQUIRED',
  FORBIDDEN:'FORBIDDEN',
});

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function requestId(value) {
  const id = String(value ?? '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)) throw new Error('LIGHTHOUSE_CONTROL_PORT_REQUEST_ID_INVALID');
  return id;
}

function capabilityId(value) {
  const id = String(value ?? '').trim();
  if (!id) throw new Error('LIGHTHOUSE_CONTROL_PORT_CAPABILITY_REQUIRED');
  return id;
}

function safeId(value) {
  return String(value).replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 96);
}

function ownerIds(id) {
  const token = safeId(id);
  return Object.freeze({
    workflowId:`CP-${token}`,
    ledgerTransactionId:`CP-TX-${token}`,
    obligationId:`CP-OB-${token}`,
    queueId:`CP-Q-${token}`,
    productId:`CP-PRODUCT-${token}`,
    stockRecordId:`CP-STOCK-${token}`,
  });
}

function guardFor(capability) {
  if (!capability || capability.editable !== true) return CONTROL_PORT_GUARD.FORBIDDEN;
  return capability.confirmationRequired ? CONTROL_PORT_GUARD.CONFIRM_REQUIRED : CONTROL_PORT_GUARD.DIRECT;
}

function stateSummary(state) {
  const domains = {};
  for (const name of ['LEDGER','STORE','CALENDAR','RIDE']) {
    domains[name] = Object.keys(state?.domains?.[name]?.records || {}).length;
  }
  return Object.freeze({
    schema:state?.schema ?? null,
    createdAt:state?.createdAt ?? null,
    domainRecordCounts:Object.freeze(domains),
  });
}

function wrap(meta, payload) {
  return Object.freeze({
    ...payload,
    revision:meta?.revision ?? null,
    updatedAt:meta?.updatedAt ?? null,
  });
}

export function createLighthouseControlPort(deps = {}) {
  const withSession = deps.withSession ?? withRuntimeSession;
  const ledger = deps.ledgerBridge ?? createLighthouseLedgerBridge({ withSession });
  const store = deps.storeBridge ?? createLighthouseStoreBridge({ withSession });
  const now = deps.now ?? (() => new Date().toISOString());

  async function meta() {
    return withSession(async runtime => {
      const state = await runtime.readState();
      if (!state) throw new Error('LIGHTHOUSE_CONTROL_PORT_STATE_UNAVAILABLE');
      return Object.freeze({
        revision:Number.isSafeInteger(Number(state.revision)) ? Number(state.revision) : null,
        updatedAt:state.updatedAt ? String(state.updatedAt) : null,
        summary:stateSummary(state),
      });
    });
  }

  async function status() {
    try {
      const current = await meta();
      return wrap(current, {
        status:'READY',
        runtime:'ACTIVE',
        checkedAt:now(),
      });
    } catch (error) {
      const code = String(error?.message || error || 'CONTROL_PORT_STATUS_FAILED');
      return Object.freeze({
        status:code === 'RUNTIME_SESSION_LOCKED' ? 'LOCKED' : 'UNAVAILABLE',
        runtime:'INACTIVE',
        checkedAt:now(),
        revision:null,
        updatedAt:null,
        error:code,
      });
    }
  }

  async function health() {
    const currentStatus = await status();
    if (currentStatus.status !== 'READY') {
      return Object.freeze({
        status:'DEGRADED',
        runtime:currentStatus.runtime,
        checks:Object.freeze({ runtime:currentStatus.status }),
        checkedAt:now(),
        revision:currentStatus.revision,
        updatedAt:currentStatus.updatedAt,
      });
    }

    const checks = {};
    const probes = [
      ['ledger', () => ledger.readLedgerTruth()],
      ['receivables', () => ledger.readIncomeTruth()],
      ['calendar', () => ledger.readCalendarTruth()],
      ['ride', () => ledger.readRideTruth()],
      ['store', () => store.readStoreTruth()],
    ];
    for (const [name, probe] of probes) {
      try {
        await probe();
        checks[name] = 'OK';
      } catch (error) {
        checks[name] = String(error?.message || error || 'FAILED');
      }
    }
    const healthy = Object.values(checks).every(value => value === 'OK');
    return Object.freeze({
      status:healthy ? 'HEALTHY' : 'DEGRADED',
      runtime:'ACTIVE',
      checks:Object.freeze(checks),
      checkedAt:now(),
      revision:currentStatus.revision,
      updatedAt:currentStatus.updatedAt,
    });
  }

  async function capabilities() {
    let current = null;
    try { current = await meta(); } catch {}
    return wrap(current, {
      status:'OK',
      capabilities:listLighthouseCapabilities().map(clone),
    });
  }

  async function readProjection(id) {
    if (['finance.balance','finance.todayIn','finance.todayOut','finance.net','finance.transactions','finance.obligations'].includes(id)) {
      return ledger.readLedgerTruth();
    }
    if (id === 'finance.dailyGoal') return ledger.readPlanningTruth();
    if (id === 'finance.receivables') return ledger.readIncomeTruth();
    if (['calendar.records','calendar.status','finance.obligation.dueDate'].includes(id)) return ledger.readCalendarTruth();
    if (id === 'store.products') return store.readStoreTruth();
    if (id === 'ride.summary') return ledger.readRideTruth();
    throw new Error(`LIGHTHOUSE_CONTROL_PORT_QUERY_UNSUPPORTED:${id}`);
  }

  function selectValue(id, projection) {
    if (id === 'finance.balance') return projection.balanceSatang;
    if (id === 'finance.todayIn') return projection.todayInSatang;
    if (id === 'finance.todayOut') return projection.todayOutSatang;
    if (id === 'finance.net') return projection.netSatang;
    if (id === 'finance.transactions') return projection.transactions;
    if (id === 'finance.obligations') return projection.obligations;
    if (id === 'finance.dailyGoal') return projection.goalSatang;
    if (id === 'finance.receivables') return projection.receivables;
    if (id === 'calendar.records' || id === 'calendar.status' || id === 'finance.obligation.dueDate') return projection.records;
    if (id === 'store.products') return projection.products;
    if (id === 'ride.summary') return projection;
    return projection;
  }

  async function query({ capabilityId:idValue } = {}) {
    const id = capabilityId(idValue);
    const capability = getLighthouseCapability(id);
    if (!capability) throw new Error(`LIGHTHOUSE_CONTROL_PORT_CAPABILITY_UNKNOWN:${id}`);
    if (!capability.readable) throw new Error(`LIGHTHOUSE_CONTROL_PORT_READ_FORBIDDEN:${id}`);

    if (id === 'system.health') return health();
    if (id === 'system.appState') {
      const current = await meta();
      return wrap(current, { status:'OK', capabilityId:id, value:clone(current.summary) });
    }

    const [projection, current] = await Promise.all([readProjection(id), meta()]);
    return wrap(current, {
      status:'OK',
      capabilityId:id,
      value:clone(selectValue(id, projection)),
    });
  }

  function propose({ requestId:idValue, capabilityId:idValue2, payload = {} } = {}) {
    const id = requestId(idValue);
    const capId = capabilityId(idValue2);
    const capability = getLighthouseCapability(capId);
    const guard = guardFor(capability);
    return Object.freeze({
      requestId:id,
      capabilityId:capId,
      owner:capability?.owner ?? null,
      action:capability?.action ?? null,
      guard,
      payload:clone(payload) ?? {},
      proposedAt:now(),
    });
  }

  async function dispatch(proposal) {
    const id = proposal.requestId;
    const payload = proposal.payload || {};
    const ids = ownerIds(id);

    switch (proposal.capabilityId) {
      case 'finance.dailyGoal':
        return ledger.setDailyGoal({ goalBaht:payload.goalBaht });
      case 'finance.income.create':
        return ledger.recordOtherIncome({
          workflowId:ids.workflowId,
          ledgerTransactionId:ids.ledgerTransactionId,
          source:payload.source,
          amountBaht:payload.amountBaht,
        });
      case 'finance.expense.create':
        return ledger.recordExpense({
          workflowId:ids.workflowId,
          ledgerTransactionId:ids.ledgerTransactionId,
          title:payload.title,
          amountBaht:payload.amountBaht,
        });
      case 'finance.obligation.create':
        return ledger.createObligation({
          workflowId:ids.workflowId,
          obligationId:payload.obligationId || ids.obligationId,
          queueId:payload.queueId || ids.queueId,
          title:payload.title,
          amountBaht:payload.amountBaht,
          dueDate:payload.dueDate,
          detail:payload.detail || '',
        });
      case 'finance.obligation.dueDate':
        return ledger.rescheduleCalendar({
          workflowId:ids.workflowId,
          queueId:payload.queueId,
          dueDate:payload.dueDate,
        });
      case 'finance.obligation.payment':
        return ledger.payObligation({
          workflowId:ids.workflowId,
          obligationId:payload.obligationId,
          queueId:payload.queueId,
          ledgerTransactionId:ids.ledgerTransactionId,
          amountBaht:payload.amountBaht,
        });
      case 'finance.receivable.payment':
        return ledger.receiveReceivablePayment({
          workflowId:ids.workflowId,
          saleId:payload.saleId,
          queueId:payload.queueId,
          ledgerTransactionId:ids.ledgerTransactionId,
          amountBaht:payload.amountBaht,
        });
      case 'calendar.status':
        return ledger.setCalendarStatus({
          workflowId:ids.workflowId,
          queueId:payload.queueId,
          status:payload.status,
        });
      case 'store.product.create':
        return store.createProductWithStock({
          workflowId:ids.workflowId,
          productId:payload.productId || ids.productId,
          stockRecordId:ids.stockRecordId,
          name:payload.name,
          model:payload.model,
          color:payload.color,
          descriptors:payload.descriptors,
          quantity:payload.quantity,
        });
      case 'store.stock.add':
        return store.addProductStock({
          workflowId:ids.workflowId,
          productId:payload.productId,
          stockRecordId:ids.stockRecordId,
          title:payload.title || 'Hub stock adjustment',
          quantity:payload.quantity,
        });
      default:
        throw new Error(`LIGHTHOUSE_CONTROL_PORT_MUTATION_UNSUPPORTED:${proposal.capabilityId}`);
    }
  }

  async function mutationReadback(capId) {
    if (capId === 'finance.dailyGoal') return ledger.readPlanningTruth();
    if (['finance.income.create','finance.expense.create','finance.obligation.create','finance.obligation.payment'].includes(capId)) {
      return ledger.readLedgerTruth();
    }
    if (capId === 'finance.receivable.payment') return ledger.readIncomeTruth();
    if (['finance.obligation.dueDate','calendar.status'].includes(capId)) return ledger.readCalendarTruth();
    if (['store.product.create','store.stock.add'].includes(capId)) return store.readStoreTruth();
    throw new Error(`LIGHTHOUSE_CONTROL_PORT_READBACK_UNSUPPORTED:${capId}`);
  }

  async function readback({ requestId:idValue, capabilityId:idValue2, ownerResult = null } = {}) {
    const id = requestId(idValue);
    const capId = capabilityId(idValue2);
    const [evidence, current] = await Promise.all([mutationReadback(capId), meta()]);
    return wrap(current, {
      status:'VERIFIED',
      requestId:id,
      capabilityId:capId,
      ownerStatus:ownerResult?.status ?? null,
      ownerRecovered:Boolean(ownerResult?.recovered),
      evidence:clone(evidence),
      readbackAt:now(),
    });
  }

  async function commit(proposal, { confirmed = false } = {}) {
    if (!proposal || typeof proposal !== 'object') throw new Error('LIGHTHOUSE_CONTROL_PORT_PROPOSAL_REQUIRED');
    const id = requestId(proposal.requestId);
    const capId = capabilityId(proposal.capabilityId);
    const capability = getLighthouseCapability(capId);
    const guard = guardFor(capability);

    if (guard === CONTROL_PORT_GUARD.FORBIDDEN) {
      throw new Error(`LIGHTHOUSE_CONTROL_PORT_MUTATION_FORBIDDEN:${capId}`);
    }

    if (guard === CONTROL_PORT_GUARD.CONFIRM_REQUIRED && confirmed !== true) {
      let current = null;
      try { current = await meta(); } catch {}
      return wrap(current, {
        status:'CONFIRMATION_REQUIRED',
        requestId:id,
        capabilityId:capId,
        guard,
      });
    }

    const before = await meta();
    const ownerResult = await dispatch(Object.freeze({
      ...proposal,
      requestId:id,
      capabilityId:capId,
      payload:clone(proposal.payload) || {},
    }));
    if (!ownerResult || ownerResult.status !== 'VERIFIED') {
      throw new Error(`LIGHTHOUSE_CONTROL_PORT_OWNER_NOT_VERIFIED:${capId}`);
    }
    const result = await readback({ requestId:id, capabilityId:capId, ownerResult });
    if (Number.isSafeInteger(before.revision) && Number.isSafeInteger(result.revision) && result.revision < before.revision) {
      throw new Error('LIGHTHOUSE_CONTROL_PORT_REVISION_REGRESSION');
    }
    return Object.freeze({
      ...result,
      guard,
      beforeRevision:before.revision,
      afterRevision:result.revision,
    });
  }

  return Object.freeze({
    status,
    health,
    capabilities,
    query,
    propose,
    commit,
    readback,
  });
}
