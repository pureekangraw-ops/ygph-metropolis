function recordsOf(domain) {
  return Object.values(domain?.records || {})
    .map(entry => entry?.record)
    .filter(Boolean);
}

function bangkokDate(isoTimestamp) {
  const timestamp = Date.parse(isoTimestamp || '');
  if (!Number.isFinite(timestamp)) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone:'Asia/Bangkok',
    year:'numeric',
    month:'2-digit',
    day:'2-digit',
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function transactionSubtype(record) {
  const explicit = String(record?.subtype || '').trim();
  if (explicit) return explicit;
  const detail = String(record?.detail || '');
  const separator = detail.indexOf(':');
  return separator >= 0 ? detail.slice(separator + 1) : '';
}

function isRealDailyCashOut(record, date) {
  if (record?.type !== 'TRANSACTION' || record?.direction !== 'OUT') return false;
  if (transactionSubtype(record) === 'BALANCE_ADJUSTMENT') return false;
  return bangkokDate(record?.createdAt) === date;
}

export function projectOutcomeView(state = {}, { date, spendingAllowance = null } = {}) {
  const day = String(date || '');
  const ledger = recordsOf(state?.domains?.LEDGER);
  const spentSatang = ledger
    .filter(record => isRealDailyCashOut(record, day))
    .reduce((sum, record) => sum + Number(record.amountSatang || 0), 0);

  const hasAllowance = spendingAllowance != null && Number.isSafeInteger(Number(spendingAllowance.allowanceSatang)) && Number(spendingAllowance.allowanceSatang) >= 0;
  if (!hasAllowance) {
    return Object.freeze({
      allowanceSatang:null,
      spentSatang,
      remainingSatang:null,
      overSatang:null,
      exceeded:false,
    });
  }

  const allowanceSatang = Number(spendingAllowance.allowanceSatang);
  const difference = allowanceSatang - spentSatang;
  return Object.freeze({
    allowanceSatang,
    spentSatang,
    remainingSatang:Math.max(difference, 0),
    overSatang:Math.max(-difference, 0),
    exceeded:spentSatang > allowanceSatang,
  });
}
