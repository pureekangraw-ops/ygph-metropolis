function recordsOf(domain) {
  return Object.values(domain?.records || {})
    .map(entry => entry?.record)
    .filter(Boolean);
}

function timestamp(record) {
  const value = Date.parse(record?.createdAt || '');
  return Number.isFinite(value) ? value : 0;
}

function freezeItem(item) {
  return Object.freeze({ ...item });
}

export function projectIncomeView(state = {}) {
  const ledger = recordsOf(state?.domains?.LEDGER);
  const ride = recordsOf(state?.domains?.RIDE);

  const incoming = ledger.filter(record => record.type === 'TRANSACTION' && record.direction === 'IN');
  const cashInSatang = incoming.reduce((sum, record) => sum + Number(record.amountSatang || 0), 0);

  const recentCash = incoming.map(record => freezeItem({
    kind: 'cash-in',
    recordId: record.recordId,
    title: record.title || '',
    amountSatang: Number(record.amountSatang || 0),
    sourceRef: record.sourceRef || null,
    createdAt: record.createdAt || null,
  }));

  const pendingRideCredit = ride
    .filter(record => record.type === 'JOB' && record.paymentMode === 'CREDIT')
    .map(record => freezeItem({
      kind: 'ride-credit',
      recordId: record.recordId,
      title: record.note || 'รายได้วิ่งงานแบบเครดิต',
      amountSatang: Number(record.amountSatang || 0),
      sourceRef: `RIDE/${record.recordId}`,
      createdAt: record.createdAt || null,
    }));

  const pendingRideCreditSatang = pendingRideCredit.reduce((sum, item) => sum + item.amountSatang, 0);
  const recent = [...recentCash, ...pendingRideCredit]
    .sort((a, b) => timestamp(b) - timestamp(a));

  return Object.freeze({
    cashInSatang,
    pendingRideCreditSatang,
    recent: Object.freeze(recent),
  });
}
