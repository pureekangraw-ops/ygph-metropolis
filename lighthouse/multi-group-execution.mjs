import { validateMultiGroupPlan } from './multi-group-contract.mjs';
import { buildSaleWorkflow, buildReceiveCustomerPaymentWorkflow, buildExpenseWorkflow } from '../greenfield/business-workflows.mjs';

const SUPPORTED = new Set(['CREATE/SALE', 'APPLY/CUSTOMER_PAYMENT', 'CREATE/EXPENSE']);

function frozen(value) {
  return Object.freeze(value);
}

function stop(status, reason, extras = {}) {
  return frozen({ status, reason, ...extras });
}

function token(value) {
  const output = String(value ?? '').trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return output || 'X';
}

function validIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''));
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
}

function allocatedOutputs(planId, group) {
  const prefix = `MG-${token(planId)}-${token(group.groupId)}`;
  if (group.action === 'CREATE' && group.object === 'SALE') {
    return frozen({
      workflowId:group.fields.workflowId || `${prefix}-WF`,
      saleId:group.fields.saleId || `${prefix}-SALE`,
      ledgerTransactionId:group.fields.ledgerTransactionId || `${prefix}-TX-INITIAL`,
      queueId:group.fields.calendarQueueId || `${prefix}-QUEUE`,
    });
  }
  if (group.action === 'APPLY' && group.object === 'CUSTOMER_PAYMENT') {
    return frozen({
      workflowId:group.fields.workflowId || `${prefix}-WF`,
      ledgerTransactionId:group.fields.ledgerTransactionId || `${prefix}-TX-PAYMENT`,
    });
  }
  if (group.action === 'CREATE' && group.object === 'EXPENSE') {
    return frozen({
      workflowId:group.fields.workflowId || `${prefix}-WF`,
      ledgerTransactionId:group.fields.ledgerTransactionId || `${prefix}-TX-EXPENSE`,
    });
  }
  return frozen({});
}

function capabilityFields(group) {
  if (group.action === 'CREATE' && group.object === 'SALE') {
    const title = String(group.fields.title ?? '').trim();
    const amount = Number(group.fields.amountSatang);
    const quantity = Number(group.fields.quantity);
    const received = Number(group.fields.receivedSatang ?? 0);
    if (!title || !Number.isSafeInteger(amount) || amount <= 0 || !Number.isSafeInteger(quantity) || quantity <= 0 || !Number.isSafeInteger(received) || received < 0 || received > amount) {
      return 'REQUIRED_FIELD_INVALID';
    }
    if (amount > received && !/^\d{4}-\d{2}-\d{2}$/.test(String(group.fields.dueDate ?? ''))) return 'REQUIRED_FIELD_INVALID';
    return null;
  }
  if (group.action === 'APPLY' && group.object === 'CUSTOMER_PAYMENT') {
    const amount = Number(group.fields.amountSatang);
    if (!Number.isSafeInteger(amount) || amount <= 0) return 'REQUIRED_FIELD_INVALID';
    if (!group.references.saleId || !group.references.queueId) return 'REFERENCE_REQUIRED';
    return null;
  }
  if (group.action === 'CREATE' && group.object === 'EXPENSE') {
    const title = String(group.fields.title ?? '').trim();
    const amount = Number(group.fields.amountSatang);
    const businessDate = group.fields.businessDate == null ? null : String(group.fields.businessDate);
    if (!title || !Number.isSafeInteger(amount) || amount <= 0 || (businessDate != null && !validIsoDate(businessDate))) return 'REQUIRED_FIELD_INVALID';
    const required = group.requiredResult;
    const effect = required?.effect;
    if (required?.kind !== 'LEDGER_TRANSACTION' || !effect || effect.direction !== 'OUT' || effect.subtype !== 'EXPENSE' || effect.title !== title || effect.amountSatang !== amount) {
      return 'REQUIRED_RESULT_MISMATCH';
    }
    const effectBusinessDate = effect.businessDate == null ? null : String(effect.businessDate);
    if (effectBusinessDate !== businessDate) return 'REQUIRED_RESULT_MISMATCH';
    return null;
  }
  return 'CAPABILITY_NOT_CONNECTED';
}

function domainRecords(state, domain) {
  return Object.values(state?.domains?.[domain]?.records || {}).map(entry => entry?.record).filter(Boolean);
}

function domainRecord(state, domain, recordId) {
  return state?.domains?.[domain]?.records?.[recordId]?.record || null;
}

function matchesWhere(record, where = {}) {
  return Object.entries(where).every(([key, value]) => record?.[key] === value);
}

function resolveQuery(state, spec) {
  const domain = String(spec.domain ?? '').trim().toUpperCase();
  if (!domain) return { status:'NEEDS_INFO' };
  return { domain, candidates:domainRecords(state, domain).filter(record => matchesWhere(record, spec.where || {})) };
}

function resolveSnapshotReference(state, spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return { status:'NEEDS_INFO' };
  const type = String(spec.type ?? '').trim().toUpperCase();
  if (type === 'EXPLICIT_ID') {
    const domain = String(spec.domain ?? '').trim().toUpperCase();
    const recordId = String(spec.recordId ?? '').trim();
    if (!domain || !recordId) return { status:'NEEDS_INFO' };
    const found = domainRecords(state, domain).find(record => String(record?.recordId ?? '') === recordId);
    return found ? { status:'RESOLVED', value:found.recordId, record:found } : { status:'NEEDS_INFO' };
  }
  if (type === 'QUERY_BASED' || type === 'IMPLICIT_CONTEXT') {
    const query = resolveQuery(state, spec);
    if (!query.candidates) return { status:'NEEDS_INFO' };
    if (query.candidates.length === 0) return { status:'NEEDS_INFO' };
    if (query.candidates.length > 1) return { status:'AMBIGUOUS', matches:query.candidates.length };
    return { status:'RESOLVED', value:query.candidates[0].recordId, record:query.candidates[0] };
  }
  if (type === 'RELATIVE_POINTER') {
    if (String(spec.pointer ?? '').trim().toUpperCase() !== 'LATEST') return { status:'NEEDS_INFO' };
    const query = resolveQuery(state, spec);
    if (!query.candidates || query.candidates.length === 0) return { status:'NEEDS_INFO' };
    if (query.candidates.length === 1) return { status:'RESOLVED', value:query.candidates[0].recordId, record:query.candidates[0] };
    if (query.candidates.some(record => !Number.isFinite(Date.parse(record?.createdAt)))) return { status:'AMBIGUOUS', matches:query.candidates.length };
    query.candidates.sort((a, b) => (Date.parse(b.createdAt) - Date.parse(a.createdAt)) || String(a.recordId).localeCompare(String(b.recordId)));
    return { status:'RESOLVED', value:query.candidates[0].recordId, record:query.candidates[0] };
  }
  return { status:'NEEDS_INFO' };
}

function groupResultReference(spec, group, preparedById) {
  const sourceId = String(spec?.groupId ?? '').trim();
  const field = String(spec?.field ?? '').trim();
  if (!sourceId || !field || !group.dependsOn.includes(sourceId)) return { status:'BLOCKED', reason:'INVALID_GROUP_RESULT_DEPENDENCY' };
  const source = preparedById.get(sourceId);
  if (!source || !Object.hasOwn(source.outputs, field)) return { status:'BLOCKED', reason:'GROUP_RESULT_FIELD_NOT_DECLARED' };
  return { status:'RESOLVED', value:source.outputs[field] };
}

function prepareGroups(plan, snapshot, { retryOnly = false } = {}) {
  const prepared = [];
  const preparedById = new Map();
  const seen = new Set();

  for (const group of plan.groups) {
    for (const dependency of group.dependsOn) {
      if (!seen.has(dependency)) return stop('BLOCKED', 'INVALID_DEPENDENCY_ORDER', { groupId:group.groupId, dependency });
    }
    seen.add(group.groupId);

    if (!SUPPORTED.has(`${group.action}/${group.object}`)) return stop('BLOCKED', 'CAPABILITY_NOT_CONNECTED', { groupId:group.groupId });
    if (group.confirmation === 'REQUIRED') return stop('AWAITING_CONFIRMATION', 'CONFIRMATION_REQUIRED', { groupId:group.groupId });
    const fieldError = capabilityFields(group);
    if (fieldError) return stop('BLOCKED', fieldError, { groupId:group.groupId });

    const outputs = allocatedOutputs(plan.planId, group);
    const resolvedReferences = {};
    for (const [name, spec] of Object.entries(group.references)) {
      const type = String(spec?.type ?? '').trim().toUpperCase();
      let result;
      if (type === 'GROUP_RESULT') {
        result = groupResultReference(spec, group, preparedById);
      } else if (retryOnly && type === 'EXPLICIT_ID') {
        const value = String(spec?.recordId ?? '').trim();
        result = value ? { status:'RESOLVED', value } : { status:'NEEDS_INFO' };
      } else if (retryOnly) {
        return stop('BLOCKED', 'STALE_RETRY_REQUIRES_IMMUTABLE_REFERENCES', { groupId:group.groupId, reference:name });
      } else {
        result = resolveSnapshotReference(snapshot, spec);
      }
      if (result.status === 'NEEDS_INFO') return stop('NEEDS_INFO', 'REFERENCE_NOT_FOUND', { groupId:group.groupId, reference:name });
      if (result.status === 'AMBIGUOUS') return stop('AMBIGUOUS', 'REFERENCE_AMBIGUOUS', { groupId:group.groupId, reference:name, matches:result.matches });
      if (result.status === 'BLOCKED') return stop('BLOCKED', result.reason, { groupId:group.groupId, reference:name });
      resolvedReferences[name] = result.value;
    }

    const item = frozen({ group, outputs, resolvedReferences:frozen(resolvedReferences) });
    prepared.push(item);
    preparedById.set(group.groupId, item);
  }

  return frozen({ status:'PREPARED', groups:Object.freeze(prepared) });
}

export async function prepareMultiGroupPlan(runtime, inputPlan) {
  if (!runtime || typeof runtime.readState !== 'function') throw new Error('MULTI_GROUP_RUNTIME_INVALID');
  let plan;
  try {
    plan = validateMultiGroupPlan(inputPlan);
  } catch (error) {
    return stop('BLOCKED', String(error?.message || error || 'MULTI_GROUP_INVALID_PLAN'));
  }

  const snapshot = await runtime.readState();
  if (!snapshot || !Number.isSafeInteger(snapshot.revision)) return stop('BLOCKED', 'MULTI_GROUP_RUNTIME_STATE_INVALID');
  if (snapshot.revision !== plan.baseRevision) return stop('BLOCKED', 'STALE_BASE_REVISION', { expectedRevision:plan.baseRevision, actualRevision:snapshot.revision });

  const groupResult = prepareGroups(plan, snapshot);
  if (groupResult.status !== 'PREPARED') return groupResult;
  return frozen({ status:'PREPARED', reason:null, plan, snapshotRevision:snapshot.revision, snapshot:structuredClone(snapshot), groups:groupResult.groups });
}

function prepareImmutableRetryCandidate(inputPlan) {
  let plan;
  try {
    plan = validateMultiGroupPlan(inputPlan);
  } catch {
    return null;
  }
  const result = prepareGroups(plan, null, { retryOnly:true });
  if (result.status !== 'PREPARED') return null;
  return frozen({ status:'PREPARED', reason:null, plan, snapshotRevision:plan.baseRevision, snapshot:null, groups:result.groups, retryOnly:true });
}

function compilePreparedGroups(prepared) {
  const commands = [];
  for (const item of prepared.groups) {
    const { group, outputs, resolvedReferences } = item;
    let workflow;
    if (group.action === 'CREATE' && group.object === 'SALE') {
      workflow = buildSaleWorkflow({
        workflowId:outputs.workflowId,
        saleId:outputs.saleId,
        ledgerTransactionId:outputs.ledgerTransactionId,
        calendarQueueId:outputs.queueId,
        title:group.fields.title,
        amountSatang:group.fields.amountSatang,
        quantity:group.fields.quantity,
        receivedSatang:group.fields.receivedSatang ?? 0,
        storeCostSatang:group.fields.storeCostSatang ?? 0,
        dueDate:group.fields.dueDate,
      });
    } else if (group.action === 'APPLY' && group.object === 'CUSTOMER_PAYMENT') {
      workflow = buildReceiveCustomerPaymentWorkflow({
        workflowId:outputs.workflowId,
        saleId:resolvedReferences.saleId,
        queueId:resolvedReferences.queueId,
        ledgerTransactionId:outputs.ledgerTransactionId,
        amountSatang:group.fields.amountSatang,
      });
    } else if (group.action === 'CREATE' && group.object === 'EXPENSE') {
      workflow = buildExpenseWorkflow({
        workflowId:outputs.workflowId,
        ledgerTransactionId:outputs.ledgerTransactionId,
        title:group.fields.title,
        amountSatang:group.fields.amountSatang,
        businessDate:group.fields.businessDate ?? null,
      });
    } else {
      throw new Error(`MULTI_GROUP_COMPILER_CAPABILITY_NOT_CONNECTED:${group.groupId}`);
    }
    commands.push(...workflow.commands);
  }
  return Object.freeze(commands);
}

function expectedSaleFromRecord(record) {
  if (!record) return null;
  const total = Number(record.totalSatang ?? record.amountSatang);
  const received = Number(record.receivedSatang ?? 0);
  const outstanding = Number(record.outstandingSatang ?? (total - received));
  if (![total, received, outstanding].every(Number.isSafeInteger)) return null;
  return {
    recordId:record.recordId,
    totalSatang:total,
    quantity:Number(record.quantity),
    receivedSatang:received,
    outstandingSatang:outstanding,
    status:String(record.status || ''),
  };
}

function expectedQueueFromRecord(record) {
  if (!record) return null;
  const remaining = Number(record.amountSatang ?? 0);
  const paid = Number(record.paidSatang ?? 0);
  if (![remaining, paid].every(Number.isSafeInteger)) return null;
  return { recordId:record.recordId, amountSatang:remaining, paidSatang:paid, status:String(record.status || ''), detail:String(record.detail || '') };
}

function buildExpectedReadback(prepared, fallbackState) {
  const sales = new Map();
  const queues = new Map();
  const transactions = new Map();
  let primarySaleId = null;
  let primaryQueueId = null;

  for (const item of prepared.groups) {
    const { group, outputs, resolvedReferences } = item;
    if (group.action === 'CREATE' && group.object === 'SALE') {
      const total = Number(group.fields.amountSatang);
      const received = Number(group.fields.receivedSatang ?? 0);
      const outstanding = total - received;
      sales.set(outputs.saleId, {
        recordId:outputs.saleId,
        totalSatang:total,
        quantity:Number(group.fields.quantity),
        receivedSatang:received,
        outstandingSatang:outstanding,
        status:outstanding === 0 ? 'COMPLETED' : received > 0 ? 'PARTIAL' : 'OPEN',
      });
      primarySaleId = outputs.saleId;
      if (received > 0) transactions.set(outputs.ledgerTransactionId, { recordId:outputs.ledgerTransactionId, amountSatang:received, direction:'IN', detail:'IN:SALE', sourceRef:`STORE/${outputs.saleId}` });
      if (outstanding > 0) {
        queues.set(outputs.queueId, { recordId:outputs.queueId, amountSatang:outstanding, paidSatang:0, status:'OPEN', detail:`STORE/${outputs.saleId}` });
        primaryQueueId = outputs.queueId;
      }
      continue;
    }

    if (group.action === 'CREATE' && group.object === 'EXPENSE') {
      transactions.set(outputs.ledgerTransactionId, {
        recordId:outputs.ledgerTransactionId,
        amountSatang:Number(group.fields.amountSatang),
        direction:'OUT',
        detail:'OUT:EXPENSE',
        sourceRef:'LEDGER/MANUAL',
        title:String(group.fields.title),
        ...(group.fields.businessDate != null ? { businessDate:String(group.fields.businessDate) } : {}),
      });
      continue;
    }

    if (group.action === 'APPLY' && group.object === 'CUSTOMER_PAYMENT') {
      const saleId = resolvedReferences.saleId;
      const queueId = resolvedReferences.queueId;
      const amount = Number(group.fields.amountSatang);
      let sale = sales.get(saleId);
      if (!sale) sale = expectedSaleFromRecord(domainRecord(fallbackState, 'STORE', saleId));
      let queue = queues.get(queueId);
      if (!queue) queue = expectedQueueFromRecord(domainRecord(fallbackState, 'CALENDAR', queueId));
      if (!sale || !queue || amount > sale.outstandingSatang || amount > queue.amountSatang) return null;
      sale = { ...sale, receivedSatang:sale.receivedSatang + amount, outstandingSatang:sale.outstandingSatang - amount };
      sale.status = sale.outstandingSatang === 0 ? 'COMPLETED' : 'PARTIAL';
      queue = { ...queue, paidSatang:queue.paidSatang + amount, amountSatang:queue.amountSatang - amount };
      queue.status = queue.amountSatang === 0 ? 'COMPLETED' : 'PARTIAL';
      sales.set(saleId, sale);
      queues.set(queueId, queue);
      transactions.set(outputs.ledgerTransactionId, { recordId:outputs.ledgerTransactionId, amountSatang:amount, direction:'IN', detail:'IN:SALE_RECEIPT', sourceRef:`STORE/${saleId}` });
      primarySaleId = saleId;
      primaryQueueId = queueId;
    }
  }

  return { sales, queues, transactions, primarySaleId, primaryQueueId };
}

function compareFields(actual, expected, fields, label, mismatches) {
  if (!actual) {
    mismatches.push(`${label}:MISSING`);
    return;
  }
  for (const field of fields) if (actual[field] !== expected[field]) mismatches.push(`${label}:${field}:${String(actual[field])}/${String(expected[field])}`);
}

function proveDurableReadback(durable, expected) {
  if (!expected) return stop('VERIFY', 'MULTI_GROUP_EXPECTATION_UNAVAILABLE');
  const mismatches = [];
  const groups = [];
  for (const [recordId, sale] of expected.sales) {
    const actual = domainRecord(durable, 'STORE', recordId);
    compareFields(actual, sale, ['recordId','totalSatang','quantity','receivedSatang','outstandingSatang','status'], `STORE/${recordId}`, mismatches);
    groups.push({ domain:'STORE', recordId, record:actual ? structuredClone(actual) : null });
  }
  for (const [recordId, queue] of expected.queues) {
    const actual = domainRecord(durable, 'CALENDAR', recordId);
    compareFields(actual, queue, ['recordId','amountSatang','paidSatang','status','detail'], `CALENDAR/${recordId}`, mismatches);
    groups.push({ domain:'CALENDAR', recordId, record:actual ? structuredClone(actual) : null });
  }
  for (const [recordId, transaction] of expected.transactions) {
    const actual = domainRecord(durable, 'LEDGER', recordId);
    const fields = ['recordId','amountSatang','direction','detail','sourceRef'];
    if (transaction.title != null) fields.push('title');
    if (Object.hasOwn(transaction, 'businessDate')) fields.push('businessDate');
    compareFields(actual, transaction, fields, `LEDGER/${recordId}`, mismatches);
    groups.push({ domain:'LEDGER', recordId, record:actual ? structuredClone(actual) : null });
  }
  if (mismatches.length > 0) return stop('VERIFY', 'MULTI_GROUP_DURABLE_READBACK_MISMATCH', { mismatches:Object.freeze(mismatches), groups:Object.freeze(groups) });
  return frozen({
    status:'COMPLETE', reason:null,
    groups:Object.freeze(groups),
    sale:expected.primarySaleId ? structuredClone(domainRecord(durable, 'STORE', expected.primarySaleId)) : null,
    queue:expected.primaryQueueId ? structuredClone(domainRecord(durable, 'CALENDAR', expected.primaryQueueId)) : null,
  });
}

export async function executeMultiGroupPlan(runtime, inputPlan) {
  if (!runtime || typeof runtime.readState !== 'function' || typeof runtime.executeMultiGroupCommands !== 'function') throw new Error('MULTI_GROUP_RUNTIME_INVALID');

  let prepared = await prepareMultiGroupPlan(runtime, inputPlan);
  let retryOnly = false;
  if (prepared.status === 'BLOCKED' && prepared.reason === 'STALE_BASE_REVISION') {
    const retryCandidate = prepareImmutableRetryCandidate(inputPlan);
    if (!retryCandidate) return prepared;
    prepared = retryCandidate;
    retryOnly = true;
  } else if (prepared.status !== 'PREPARED') {
    return prepared;
  }

  const commands = compilePreparedGroups(prepared);
  const execution = await runtime.executeMultiGroupCommands({ baseRevision:prepared.plan.baseRevision, commands });
  if (execution?.status === 'STALE') return stop('BLOCKED', 'STALE_BASE_REVISION', { expectedRevision:prepared.plan.baseRevision, actualRevision:execution.actualRevision });
  if (execution?.status === 'VERIFY') return stop('VERIFY', execution.reason || 'MULTI_GROUP_RUNTIME_VERIFY');

  const durable = await runtime.readState();
  const expectedBase = prepared.snapshot || (retryOnly ? durable : null);
  const expected = buildExpectedReadback(prepared, expectedBase);
  const readback = proveDurableReadback(durable, expected);
  if (readback.status !== 'COMPLETE') return readback;
  return frozen({ status:'COMPLETE', reason:null, executionStatus:execution?.status || 'VERIFIED', readback, revision:durable.revision });
}
