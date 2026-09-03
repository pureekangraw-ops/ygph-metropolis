function recordsOf(domain) {
  return Object.values(domain?.records || {})
    .map(entry => entry?.record)
    .filter(Boolean);
}

function timestamp(record) {
  const value = Date.parse(record?.createdAt || '');
  return Number.isFinite(value) ? value : 0;
}

function ledgerOwner(record) {
  if (record?.type !== 'TRANSACTION') return null;
  if (record.direction === 'IN') return 'income';
  if (record.direction === 'OUT') return 'outcome';
  return null;
}

export function projectLedgerView(state = {}) {
  const transactions = recordsOf(state?.domains?.LEDGER)
    .filter(record => record?.type === 'TRANSACTION');

  const balanceSatang = transactions.reduce((sum, record) => {
    const amount = Number(record?.amountSatang || 0);
    if (record.direction === 'IN') return sum + amount;
    if (record.direction === 'OUT') return sum - amount;
    return sum;
  }, 0);

  const history = transactions
    .map(record => Object.freeze({
      recordId: record.recordId,
      title: record.title || '',
      direction: record.direction || null,
      amountSatang: Number(record.amountSatang || 0),
      createdAt: record.createdAt || null,
      owner: ledgerOwner(record),
      sourceRecord: record,
    }))
    .sort((a, b) => timestamp(b) - timestamp(a));

  return Object.freeze({
    balanceSatang,
    history: Object.freeze(history),
  });
}

export function createManualControl({ runtime, owners = {} } = {}) {
  if (!runtime || typeof runtime.readState !== 'function') {
    throw new Error('MANUAL_CONTROL_RUNTIME_REQUIRED');
  }

  function requireOwner(item) {
    const owner = item?.owner;
    const target = owner ? owners[owner] : null;
    if (!target) throw new Error('MANUAL_CONTROL_OWNER_UNPROVEN');
    return target;
  }

  async function execute(action, { item, changes } = {}) {
    const target = requireOwner(item);
    const method = action === 'edit'
      ? target.editRecord
      : action === 'cancel'
        ? target.cancelRecord
        : null;

    if (typeof method !== 'function') {
      throw new Error('MANUAL_CONTROL_ACTION_UNSUPPORTED');
    }

    const input = action === 'edit'
      ? { recordId:item.recordId, changes }
      : { recordId:item.recordId };
    const ownerResult = await method.call(target, input);
    const readback = await runtime.readState();

    return Object.freeze({ ownerResult, readback });
  }

  return Object.freeze({
    edit(input) {
      return execute('edit', input);
    },
    cancel(input) {
      return execute('cancel', input);
    },
    fromChat({ action, item, changes } = {}) {
      if (!['edit', 'cancel'].includes(action)) {
        throw new Error('MANUAL_CONTROL_ACTION_UNSUPPORTED');
      }
      return execute(action, { item, changes });
    },
  });
}
