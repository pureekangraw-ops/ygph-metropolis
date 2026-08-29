import { validateMultiGroupPlan } from './multi-group-contract.mjs';

const SUPPORTED = new Set(['CREATE/SALE', 'APPLY/CUSTOMER_PAYMENT']);

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
  return 'CAPABILITY_NOT_CONNECTED';
}

function domainRecords(state, domain) {
  return Object.values(state?.domains?.[domain]?.records || {}).map(entry => entry?.record).filter(Boolean);
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
      const result = String(spec?.type ?? '').trim().toUpperCase() === 'GROUP_RESULT'
        ? groupResultReference(spec, group, preparedById)
        : resolveSnapshotReference(snapshot, spec);
      if (result.status === 'NEEDS_INFO') return stop('NEEDS_INFO', 'REFERENCE_NOT_FOUND', { groupId:group.groupId, reference:name });
      if (result.status === 'AMBIGUOUS') return stop('AMBIGUOUS', 'REFERENCE_AMBIGUOUS', { groupId:group.groupId, reference:name, matches:result.matches });
      if (result.status === 'BLOCKED') return stop('BLOCKED', result.reason, { groupId:group.groupId, reference:name });
      resolvedReferences[name] = result.value;
    }

    const item = frozen({ group, outputs, resolvedReferences:frozen(resolvedReferences) });
    prepared.push(item);
    preparedById.set(group.groupId, item);
  }

  return frozen({ status:'PREPARED', reason:null, plan, snapshotRevision:snapshot.revision, groups:Object.freeze(prepared) });
}
