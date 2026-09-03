function text(value, code = 'MANUAL_TEXT_REQUIRED') {
  const output = String(value ?? '').trim();
  if (!output) throw new Error(code);
  return output;
}

function satang(value, code = 'MANUAL_AMOUNT_INVALID') {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error(code);
  return amount;
}

function command(workflowId, index, domain, type, payload, suffix = type) {
  return {
    commandId:`${workflowId}:${index}`,
    idempotencyKey:`${workflowId}:${suffix}`,
    domain,
    type,
    payload,
  };
}

function records(state, domain) {
  return Object.values(state?.domains?.[domain]?.records || {}).map(entry => entry?.record).filter(Boolean);
}

function entry(state, domain, recordId) {
  return state?.domains?.[domain]?.records?.[recordId] ?? null;
}

function transactionDirection(record) {
  if (record?.direction === 'IN' || record?.direction === 'OUT') return record.direction;
  return null;
}

function actualTransactions(state, direction = null) {
  return records(state, 'LEDGER').filter(record => record.type === 'TRANSACTION' && (!direction || transactionDirection(record) === direction));
}

function sumAmount(list) {
  return list.reduce((sum, record) => sum + (Number.isSafeInteger(Number(record.amountSatang)) ? Number(record.amountSatang) : 0), 0);
}

function compareRecord(expectation, actualSatang) {
  if (!expectation) return null;
  const amountSatang = Number(expectation.amountSatang);
  return {
    ...structuredClone(expectation),
    actualSatang,
    deltaSatang:amountSatang - actualSatang,
  };
}

function dateKey(record) {
  return String(record?.dueDate || '').slice(0, 10);
}

function relatedTo(record, domain, recordId) {
  const ref = `${domain}/${recordId}`;
  return record?.sourceRef === ref || record?.detail === ref || record?.reversalOf === recordId || record?.refundOf === recordId || record?.amendmentOf === recordId || record?.relatedRecordId === recordId || (Array.isArray(record?.relatedRecords) && record.relatedRecords.includes(ref));
}

export function createManualFourHouses(runtime, { today = new Date().toISOString().slice(0, 10) } = {}) {
  if (!runtime || typeof runtime.readState !== 'function' || typeof runtime.executeMultiGroupCommands !== 'function') {
    throw new TypeError('MANUAL_RUNTIME_REQUIRED');
  }

  async function execute(workflowId, specs) {
    workflowId = text(workflowId, 'MANUAL_WORKFLOW_ID_REQUIRED');
    const current = await runtime.readState();
    if (!current) throw new Error('GREENFIELD_NOT_INITIALIZED');
    const commands = specs.map((spec, index) => command(workflowId, index + 1, spec.domain, spec.type, spec.payload, spec.suffix));
    const result = await runtime.executeMultiGroupCommands({ baseRevision:current.revision, commands });
    if (!['COMMITTED', 'RECOVERED', 'VERIFIED'].includes(result?.status)) {
      if (result?.status === 'STALE' || result?.status === 'VERIFY') throw new Error(result.reason || result.status);
    }
    return runtime.readState();
  }

  async function getRecord(domain, recordId) {
    const state = await runtime.readState();
    const found = entry(state, text(domain), text(recordId));
    return found ? structuredClone(found.record) : null;
  }

  async function history(domain, recordId) {
    const state = await runtime.readState();
    const found = entry(state, text(domain), text(recordId));
    return structuredClone(found?.history || []);
  }

  async function addIncome({ workflowId, recordId, title, amountSatang, businessDate } = {}) {
    const result = await runtime.otherIncome({ workflowId, ledgerTransactionId:recordId, title, amountSatang, ...(businessDate ? { businessDate } : {}) });
    const readback = await getRecord('LEDGER', recordId);
    if (!readback || readback.direction !== 'IN' || Number(readback.amountSatang) !== Number(amountSatang)) throw new Error('MANUAL_INCOME_READBACK_MISMATCH');
    return { ...result, status:'VERIFIED', readback };
  }

  async function addExpense({ workflowId, recordId, title, amountSatang, businessDate } = {}) {
    const result = await runtime.expense({ workflowId, ledgerTransactionId:recordId, title, amountSatang, ...(businessDate ? { businessDate } : {}) });
    const readback = await getRecord('LEDGER', recordId);
    if (!readback || readback.direction !== 'OUT' || Number(readback.amountSatang) !== Number(amountSatang)) throw new Error('MANUAL_EXPENSE_READBACK_MISMATCH');
    return { ...result, status:'VERIFIED', readback };
  }

  async function upsertExpectation({ workflowId, recordId, type, title, amountSatang } = {}) {
    const state = await runtime.readState();
    const existing = entry(state, 'LEDGER', recordId)?.record;
    const spec = existing
      ? { domain:'LEDGER', type:'LEDGER_UPDATE_EXPECTATION', payload:{ recordId, type, title, amountSatang }, suffix:`LEDGER:${recordId}:EDIT` }
      : { domain:'LEDGER', type:'LEDGER_CREATE_EXPECTATION', payload:{ recordId, type, title, amountSatang }, suffix:`LEDGER:${recordId}` };
    await execute(workflowId, [spec]);
    const readback = await getRecord('LEDGER', recordId);
    if (!readback || readback.type !== type || Number(readback.amountSatang) !== Number(amountSatang) || readback.direction != null) throw new Error('MANUAL_EXPECTATION_READBACK_MISMATCH');
    return { status:'VERIFIED', readback };
  }

  const setTarget = input => upsertExpectation({ ...input, type:'TARGET' });
  const editTarget = setTarget;
  const setCeiling = input => upsertExpectation({ ...input, type:'CEILING' });
  const editCeiling = setCeiling;

  async function createReceivable({ workflowId, recordId, title, amountSatang, dueDate } = {}) {
    await execute(workflowId, [{
      domain:'LEDGER', type:'LEDGER_CREATE_RECEIVABLE',
      payload:{ recordId, title, totalSatang:amountSatang, dueDate }, suffix:`LEDGER:${recordId}`,
    }]);
    const readback = await getRecord('LEDGER', recordId);
    if (!readback || readback.type !== 'RECEIVABLE' || readback.status !== 'OPEN') throw new Error('MANUAL_RECEIVABLE_READBACK_MISMATCH');
    return { status:'VERIFIED', readback };
  }

  async function receiveReceivable({ workflowId, receivableId, transactionId, amountSatang } = {}) {
    const amount = satang(amountSatang);
    await execute(workflowId, [
      { domain:'LEDGER', type:'LEDGER_APPLY_RECEIVABLE_PAYMENT', payload:{ recordId:receivableId, amountSatang:amount }, suffix:`LEDGER:${receivableId}:RECEIPT` },
      { domain:'LEDGER', type:'LEDGER_CREATE_TRANSACTION', payload:{ recordId:transactionId, direction:'IN', amountSatang:amount, title:`รับชำระ ${receivableId}`, subtype:'RECEIVABLE_RECEIPT', sourceRef:`LEDGER/${receivableId}` }, suffix:`LEDGER:${transactionId}` },
    ]);
    const readback = await getRecord('LEDGER', receivableId);
    const transaction = await getRecord('LEDGER', transactionId);
    if (!readback || !transaction || transaction.direction !== 'IN' || transaction.sourceRef !== `LEDGER/${receivableId}`) throw new Error('MANUAL_RECEIVABLE_SETTLE_READBACK_MISMATCH');
    return { status:'VERIFIED', readback, transaction };
  }

  async function createObligation({ workflowId, recordId, queueId, title, amountSatang, dueDate, detail = '' } = {}) {
    const amount = satang(amountSatang);
    const result = await runtime.obligation({ workflowId, obligationId:recordId, title, totalSatang:amount, detail, installments:[{ queueId, dueDate, amountSatang:amount }] });
    const readback = await getRecord('LEDGER', recordId);
    if (!readback || readback.type !== 'OBLIGATION' || readback.status !== 'OPEN') throw new Error('MANUAL_OBLIGATION_READBACK_MISMATCH');
    return { ...result, status:'VERIFIED', readback };
  }

  async function payObligation({ workflowId, obligationId, queueId, transactionId, amountSatang } = {}) {
    const result = await runtime.payObligation({ workflowId, queueId, ledgerTransactionId:transactionId, amountSatang });
    const readback = await getRecord('LEDGER', obligationId);
    const transaction = await getRecord('LEDGER', transactionId);
    if (!readback || !transaction || transaction.direction !== 'OUT') throw new Error('MANUAL_OBLIGATION_SETTLE_READBACK_MISMATCH');
    return { ...result, status:'VERIFIED', readback, transaction };
  }

  async function createCalendarItem({ workflowId, recordId, type, title, dueDate, detail = '', amountSatang = 0 } = {}) {
    await execute(workflowId, [{ domain:'CALENDAR', type:'CALENDAR_CREATE_RECORD', payload:{ record:{ recordId, type, title, dueDate, detail, amountSatang, status:'OPEN' } }, suffix:`CALENDAR:${recordId}` }]);
    const readback = await getRecord('CALENDAR', recordId);
    if (!readback || readback.status !== 'OPEN') throw new Error('MANUAL_CALENDAR_READBACK_MISMATCH');
    return { status:'VERIFIED', readback };
  }

  async function editCalendar({ workflowId, recordId, title, detail } = {}) {
    await execute(workflowId, [{ domain:'CALENDAR', type:'CALENDAR_EDIT_RECORD', payload:{ recordId, ...(title != null ? { title } : {}), ...(detail != null ? { detail } : {}) }, suffix:`CALENDAR:${recordId}:EDIT` }]);
    return { status:'VERIFIED', readback:await getRecord('CALENDAR', recordId) };
  }

  async function rescheduleCalendar({ workflowId, recordId, dueDate } = {}) {
    const result = await runtime.calendarReschedule({ workflowId, queueId:recordId, dueDate });
    return { ...result, status:'VERIFIED', readback:await getRecord('CALENDAR', recordId) };
  }

  async function completeCalendar({ workflowId, recordId } = {}) {
    const result = await runtime.calendarStatus({ workflowId, queueId:recordId, status:'COMPLETED' });
    return { ...result, status:'VERIFIED', readback:await getRecord('CALENDAR', recordId) };
  }

  async function cancelCalendar({ workflowId, recordId } = {}) {
    const result = await runtime.calendarStatus({ workflowId, queueId:recordId, status:'CANCELLED' });
    return { ...result, status:'VERIFIED', readback:await getRecord('CALENDAR', recordId) };
  }

  async function editLedgerMetadata({ workflowId, recordId, title, detail } = {}) {
    await execute(workflowId, [{ domain:'LEDGER', type:'LEDGER_EDIT_METADATA', payload:{ recordId, ...(title != null ? { title } : {}), ...(detail != null ? { detail } : {}) }, suffix:`LEDGER:${recordId}:EDIT` }]);
    return { status:'VERIFIED', readback:await getRecord('LEDGER', recordId) };
  }

  async function refund({ workflowId, originalRecordId, recordId, amountSatang, reason } = {}) {
    await execute(workflowId, [{ domain:'LEDGER', type:'LEDGER_REFUND_TRANSACTION', payload:{ originalRecordId, refundRecordId:recordId, amountSatang, reason }, suffix:`LEDGER:${recordId}` }]);
    return { status:'VERIFIED', readback:await getRecord('LEDGER', recordId) };
  }

  async function reverse({ workflowId, originalRecordId, recordId, reason } = {}) {
    await execute(workflowId, [{ domain:'LEDGER', type:'LEDGER_REVERSE_TRANSACTION', payload:{ originalRecordId, reversalRecordId:recordId, reason }, suffix:`LEDGER:${recordId}` }]);
    return { status:'VERIFIED', readback:await getRecord('LEDGER', recordId) };
  }

  async function cancelExpected({ workflowId, recordId } = {}) {
    await execute(workflowId, [{ domain:'LEDGER', type:'LEDGER_CANCEL_EXPECTED_RECORD', payload:{ recordId }, suffix:`LEDGER:${recordId}:CANCEL` }]);
    return { status:'VERIFIED', readback:await getRecord('LEDGER', recordId) };
  }

  async function viewIncome() { return actualTransactions(await runtime.readState(), 'IN').map(item => structuredClone(item)); }
  async function viewExpense() { return actualTransactions(await runtime.readState(), 'OUT').map(item => structuredClone(item)); }
  async function searchIncome({ text:query = '' } = {}) { const q=String(query).trim().toLowerCase(); return (await viewIncome()).filter(r=>!q || `${r.title} ${r.detail}`.toLowerCase().includes(q)); }
  async function searchExpense({ text:query = '' } = {}) { const q=String(query).trim().toLowerCase(); return (await viewExpense()).filter(r=>!q || `${r.title} ${r.detail}`.toLowerCase().includes(q)); }

  async function incomeSummary() {
    const state = await runtime.readState();
    const actualSatang = sumAmount(actualTransactions(state, 'IN'));
    const target = records(state, 'LEDGER').filter(r=>r.type==='TARGET' && r.status!=='CANCELLED').sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')))[0] || null;
    return { actualSatang, target:compareRecord(target, actualSatang) };
  }

  async function outcomeSummary() {
    const state = await runtime.readState();
    const actualSatang = sumAmount(actualTransactions(state, 'OUT'));
    const ceiling = records(state, 'LEDGER').filter(r=>r.type==='CEILING' && r.status!=='CANCELLED').sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')))[0] || null;
    return { actualSatang, ceiling:compareRecord(ceiling, actualSatang) };
  }

  async function targetProgress() { return (await incomeSummary()).target; }
  async function ceilingProgress() { return (await outcomeSummary()).ceiling; }
  async function trackReceivable(recordId) { return getRecord('LEDGER', recordId); }

  async function calendarList(kind) {
    const state = await runtime.readState();
    return records(state, 'CALENDAR').filter(record => {
      if (record.status === 'COMPLETED' || record.status === 'CANCELLED') return false;
      const due = dateKey(record);
      if (!due) return false;
      if (kind === 'today') return due === today;
      if (kind === 'upcoming') return due > today;
      return due < today;
    }).sort((a,b)=>dateKey(a).localeCompare(dateKey(b))).map(item => structuredClone(item));
  }

  const calendarToday = () => calendarList('today');
  const calendarUpcoming = () => calendarList('upcoming');
  const calendarOverdue = () => calendarList('overdue');

  async function searchLedger({ text:query = '', direction = null, type = null, status = null } = {}) {
    const q = String(query).trim().toLowerCase();
    return records(await runtime.readState(), 'LEDGER').filter(record => {
      if (q && !`${record.recordId} ${record.title || ''} ${record.detail || ''}`.toLowerCase().includes(q)) return false;
      if (direction && record.direction !== direction) return false;
      if (type && record.type !== type) return false;
      if (status && record.status !== status) return false;
      return true;
    }).map(item => structuredClone(item));
  }

  const filterLedger = searchLedger;

  async function ledgerSummary() {
    const state = await runtime.readState();
    const incomeActualSatang = sumAmount(actualTransactions(state, 'IN'));
    const expenseActualSatang = sumAmount(actualTransactions(state, 'OUT'));
    return { incomeActualSatang, expenseActualSatang, netActualSatang:incomeActualSatang-expenseActualSatang };
  }

  async function dashboard() {
    const summary = await ledgerSummary();
    const state = await runtime.readState();
    const balanceSatang = runtime.project().ledgerBalanceSatang;
    const obligations = records(state, 'LEDGER').filter(r=>r.type==='OBLIGATION' && !['COMPLETED','CANCELLED'].includes(r.status));
    const receivables = records(state, 'LEDGER').filter(r=>r.type==='RECEIVABLE' && !['COMPLETED','CANCELLED'].includes(r.status));
    return { balanceSatang, ...summary, obligationRemainingSatang:obligations.reduce((s,r)=>s+Number(r.remainingSatang||0),0), receivableRemainingSatang:receivables.reduce((s,r)=>s+Number(r.remainingSatang||0),0) };
  }

  async function related(domain, recordId) {
    const state = await runtime.readState();
    const all = ['STORE','LEDGER','CALENDAR','RIDE'].flatMap(owner => records(state, owner));
    return all.filter(record => record.recordId !== recordId && relatedTo(record, domain, recordId)).map(item => structuredClone(item));
  }

  async function analyze() {
    const state = await runtime.readState();
    const lifecycle = { OPEN:0, PARTIAL:0, COMPLETED:0, CANCELLED:0 };
    for (const domain of ['STORE','LEDGER','CALENDAR','RIDE']) {
      for (const record of records(state, domain)) if (Object.hasOwn(lifecycle, record.status)) lifecycle[record.status] += 1;
    }
    return { lifecycle, ...(await ledgerSummary()) };
  }

  return Object.freeze({
    addIncome, viewIncome, searchIncome, incomeSummary, setTarget, editTarget, targetProgress,
    createReceivable, trackReceivable, receiveReceivable,
    addExpense, viewExpense, searchExpense, outcomeSummary, setCeiling, editCeiling, ceilingProgress,
    createObligation, payObligation, refund, reverse,
    createCalendarItem, calendarToday, calendarUpcoming, calendarOverdue, getRecord, editCalendar, rescheduleCalendar, completeCalendar, cancelCalendar,
    history, editLedgerMetadata, cancelExpected, searchLedger, filterLedger, ledgerSummary, dashboard, related,
    readback:getRecord, analyze,
  });
}
