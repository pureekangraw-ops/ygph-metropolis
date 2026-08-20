const FORMAT = 'YGPH_METROPOLIS_RUNTIME_PAYLOAD';
const ENTRY_POINT = 'runtime.obligation';

function nonEmpty(value, code) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(code);
  return text;
}

function satang(value, code) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error(code);
  return amount;
}

function dueDate(value) {
  const text = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('INVALID_OBLIGATION_IMPORT_DUE_DATE');
  const date = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) throw new Error('INVALID_OBLIGATION_IMPORT_DUE_DATE');
  return text;
}

export function parseObligationImportFile(file) {
  if (!file || typeof file !== 'object' || file.format !== FORMAT) throw new Error('INVALID_OBLIGATION_IMPORT_FORMAT');
  if (Number(file.version) !== 1) throw new Error('INVALID_OBLIGATION_IMPORT_VERSION');
  if (file.entryPoint !== ENTRY_POINT) throw new Error('INVALID_OBLIGATION_IMPORT_ENTRY_POINT');
  if (file.uploadableByCurrentUI !== true) throw new Error('OBLIGATION_IMPORT_NOT_UI_UPLOADABLE');
  const payload = file.payload;
  if (!payload || typeof payload !== 'object') throw new Error('INVALID_OBLIGATION_IMPORT_PAYLOAD');
  const installments = payload.installments;
  if (!Array.isArray(installments) || installments.length === 0) throw new Error('INVALID_OBLIGATION_IMPORT_INSTALLMENTS');
  const normalizedInstallments = installments.map(item => ({
    queueId:nonEmpty(item?.queueId, 'INVALID_OBLIGATION_IMPORT_QUEUE_ID'),
    amountSatang:satang(item?.amountSatang, 'INVALID_OBLIGATION_IMPORT_INSTALLMENT_AMOUNT'),
    dueDate:dueDate(item?.dueDate),
  }));
  const totalSatang = satang(payload.totalSatang, 'INVALID_OBLIGATION_IMPORT_TOTAL');
  const installmentTotal = normalizedInstallments.reduce((sum, item) => sum + item.amountSatang, 0);
  if (!Number.isSafeInteger(installmentTotal) || installmentTotal !== totalSatang) throw new Error('OBLIGATION_IMPORT_TOTAL_MISMATCH');
  const uniqueQueues = new Set(normalizedInstallments.map(item => item.queueId));
  if (uniqueQueues.size !== normalizedInstallments.length) throw new Error('DUPLICATE_OBLIGATION_IMPORT_QUEUE_ID');
  return {
    workflowId:nonEmpty(payload.workflowId, 'INVALID_OBLIGATION_IMPORT_WORKFLOW_ID'),
    obligationId:nonEmpty(payload.obligationId, 'INVALID_OBLIGATION_IMPORT_OBLIGATION_ID'),
    title:nonEmpty(payload.title, 'INVALID_OBLIGATION_IMPORT_TITLE'),
    totalSatang,
    detail:String(payload.detail ?? '').trim(),
    installments:normalizedInstallments,
  };
}

export function verifyObligationImportReadback(state, payload) {
  const obligationId = String(payload?.obligationId || '');
  const obligation = state?.domains?.LEDGER?.records?.[obligationId]?.record;
  if (!obligation || obligation.type !== 'OBLIGATION') throw new Error('OBLIGATION_IMPORT_READBACK_MISMATCH');
  const expectedTotal = Number(payload?.totalSatang);
  if (Number(obligation.amountSatang ?? obligation.totalSatang ?? obligation.remainingSatang) !== expectedTotal) throw new Error('OBLIGATION_IMPORT_READBACK_MISMATCH');
  for (const expected of payload?.installments || []) {
    const queue = state?.domains?.CALENDAR?.records?.[expected.queueId]?.record;
    if (!queue) throw new Error('OBLIGATION_IMPORT_READBACK_MISMATCH');
    if (Number(queue.amountSatang) !== Number(expected.amountSatang) || String(queue.dueDate) !== String(expected.dueDate)) throw new Error('OBLIGATION_IMPORT_READBACK_MISMATCH');
  }
  return true;
}
