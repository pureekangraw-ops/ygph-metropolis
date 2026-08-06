import {
  createId,
  dateKey,
  isValidISODate,
  parseQuantity,
  parseSatang,
  validateState,
} from './core.js';

function clone(value) {
  return structuredClone(value);
}

function findById(items, id, label) {
  const item = items.find(entry => entry.id === id);
  if (!item) throw new Error(`ไม่พบ${label}`);
  return item;
}

function newRecord(prefix, now, idFactory) {
  return {
    id: idFactory(prefix),
    createdAt: now,
    updatedAt: now,
    revision: 1,
  };
}

function addAudit(state, event, note, now, idFactory) {
  state.audit.push({
    id: idFactory('AUD'),
    at: now,
    event,
    note,
  });
}

function addTransaction(state, input, now, idFactory) {
  parseSatang(input.amountSatang, { allowZero: false, label: 'ยอดธุรกรรม' });
  if (!['IN', 'OUT'].includes(input.direction)) throw new Error('ทิศทางธุรกรรมไม่ถูกต้อง');
  if (state.ledger.transactions.some(tx => tx.actionKey === input.actionKey)) {
    throw new Error(`actionKey ซ้ำ ${input.actionKey}`);
  }
  const tx = {
    ...newRecord('TX', now, idFactory),
    direction: input.direction,
    amountSatang: input.amountSatang,
    label: input.label,
    source: input.source,
    sourceId: input.sourceId,
    subtype: input.subtype,
    actionKey: input.actionKey,
    status: 'ACTIVE',
    reversedBy: null,
  };
  state.ledger.transactions.push(tx);
  return tx;
}

function finish(state, type, now, idFactory) {
  state.revision = Number(state.revision || 0) + 1;
  state.updatedAt = now;
  addAudit(state, type, `คำสั่ง ${type}`, now, idFactory);
  const result = validateState(state);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return state;
}

export function applyCommand(sourceState, command, {
  now = new Date().toISOString(),
  idFactory = createId,
} = {}) {
  if (!command?.type) throw new Error('ไม่มีชนิดคำสั่ง');
  const payload = command.payload || {};
  const state = clone(sourceState);

  switch (command.type) {
    case 'STORE_PURCHASE': {
      const qty = parseQuantity(payload.qty, { label: 'จำนวนสินค้าเข้า' });
      const totalSatang = parseSatang(payload.totalSatang, { allowZero: false, label: 'ยอดซื้อสินค้า' });
      const purchase = {
        ...newRecord('BUY', now, idFactory),
        name: String(payload.name || 'สินค้าเข้า').trim(),
        qty,
        costSatang: totalSatang,
        paidAmountSatang: totalSatang,
        date: dateKey(now),
        status: 'ACTIVE',
      };
      state.store.purchases.push(purchase);
      state.store.stockQty += qty;
      state.store.stockValueSatang += totalSatang;
      addTransaction(state, {
        direction: 'OUT',
        amountSatang: totalSatang,
        label: `ซื้อสินค้า ${purchase.name}`,
        source: 'STORE',
        sourceId: purchase.id,
        subtype: 'PURCHASE_PAYMENT',
        actionKey: `store:purchase:${purchase.id}`,
      }, now, idFactory);
      break;
    }

    case 'STORE_SALE': {
      const qty = parseQuantity(payload.qty, { label: 'จำนวนขาย' });
      const totalSatang = parseSatang(payload.totalSatang, { allowZero: false, label: 'ยอดขาย' });
      if (qty > state.store.stockQty) throw new Error('สินค้าในสต็อกไม่พอ');
      const paymentMode = payload.paymentMode === 'CREDIT' ? 'CREDIT' : 'CASH';
      const avgCost = state.store.stockQty > 0 ? state.store.stockValueSatang / state.store.stockQty : 0;
      const costReleasedSatang = Math.min(state.store.stockValueSatang, Math.round(avgCost * qty));
      const sale = {
        ...newRecord('SALE', now, idFactory),
        name: String(payload.name || 'ขายสินค้า').trim(),
        qty,
        totalSatang,
        paymentMode,
        costReleasedSatang,
        date: dateKey(now),
        status: paymentMode === 'CASH' ? 'SETTLED' : 'RECEIVABLE',
      };
      state.store.sales.push(sale);
      state.store.stockQty -= qty;
      state.store.stockValueSatang -= costReleasedSatang;
      if (state.store.stockQty === 0) state.store.stockValueSatang = 0;
      if (paymentMode === 'CASH') {
        addTransaction(state, {
          direction: 'IN',
          amountSatang: totalSatang,
          label: `ยอดขาย ${sale.name}`,
          source: 'STORE',
          sourceId: sale.id,
          subtype: 'SALE_RECEIPT',
          actionKey: `store:sale:${sale.id}`,
        }, now, idFactory);
      } else {
        state.calendar.push({
          ...newRecord('CAL', now, idFactory),
          owner: 'STORE',
          source: 'STORE',
          sourceId: sale.id,
          actionType: 'CONFIRM_STORE_RECEIPT',
          title: `ติดตามรับเงิน ${sale.name}`,
          amountSatang: totalSatang,
          due: isValidISODate(payload.due) ? payload.due : dateKey(now),
          status: 'OPEN',
          appliedActions: {},
        });
      }
      break;
    }

    case 'STORE_WITHDRAW': {
      const qty = parseQuantity(payload.qty, { label: 'จำนวนเบิก' });
      if (qty > state.store.stockQty) throw new Error('สินค้าในสต็อกไม่พอ');
      const avgCost = state.store.stockQty > 0 ? state.store.stockValueSatang / state.store.stockQty : 0;
      const valueSatang = Math.min(state.store.stockValueSatang, Math.round(avgCost * qty));
      const withdrawal = {
        ...newRecord('WD', now, idFactory),
        qty,
        valueSatang,
        note: String(payload.note || 'เบิกสินค้า').trim(),
        date: dateKey(now),
        status: 'ACTIVE',
      };
      state.store.withdrawals.push(withdrawal);
      state.store.stockQty -= qty;
      state.store.stockValueSatang -= valueSatang;
      if (state.store.stockQty === 0) state.store.stockValueSatang = 0;
      break;
    }

    case 'RIDE_ROUND_START': {
      if (state.ride.currentRound) throw new Error('มีรอบงานที่กำลังเปิดอยู่');
      const round = {
        ...newRecord('ROUND', now, idFactory),
        startedAt: now,
        endedAt: null,
        status: 'OPEN',
      };
      state.ride.rounds.push(round);
      state.ride.currentRound = round.id;
      break;
    }

    case 'RIDE_ROUND_CLOSE': {
      if (!state.ride.currentRound) throw new Error('ไม่มีรอบงานที่กำลังเปิด');
      const round = findById(state.ride.rounds, state.ride.currentRound, 'รอบงาน');
      round.status = 'CLOSED';
      round.endedAt = now;
      round.updatedAt = now;
      round.revision += 1;
      state.ride.currentRound = null;
      break;
    }

    case 'RIDE_JOB_ADD': {
      const amountSatang = parseSatang(payload.amountSatang, { allowZero: false, label: 'รายได้งานวิ่ง' });
      const paymentMode = payload.paymentMode === 'CREDIT' ? 'CREDIT' : 'CASH';
      const job = {
        ...newRecord('JOB', now, idFactory),
        origin: String(payload.origin || '').trim(),
        destination: String(payload.destination || '').trim(),
        amountSatang,
        paymentMode,
        roundId: state.ride.currentRound,
        date: dateKey(now),
        status: paymentMode === 'CASH' ? 'SETTLED' : 'PENDING_CREDIT',
      };
      if (!job.origin || !job.destination) throw new Error('กรอกต้นทางและปลายทาง');
      state.ride.jobs.push(job);
      if (paymentMode === 'CASH') {
        addTransaction(state, {
          direction: 'IN',
          amountSatang,
          label: `งานวิ่ง ${job.origin} → ${job.destination}`,
          source: 'RIDE',
          sourceId: job.id,
          subtype: 'RIDE_CASH_INCOME',
          actionKey: `ride:cash:${job.id}`,
        }, now, idFactory);
      } else {
        state.ride.creditBalanceSatang += amountSatang;
      }
      break;
    }

    case 'RIDE_EXPENSE_ADD': {
      const amountSatang = parseSatang(payload.amountSatang, { allowZero: false, label: 'ค่าใช้จ่ายงานวิ่ง' });
      const expense = {
        ...newRecord('EXP', now, idFactory),
        label: String(payload.label || 'ค่าใช้จ่ายงานวิ่ง').trim(),
        amountSatang,
        roundId: state.ride.currentRound,
        date: dateKey(now),
        status: 'ACTIVE',
      };
      state.ride.expenses.push(expense);
      addTransaction(state, {
        direction: 'OUT',
        amountSatang,
        label: expense.label,
        source: 'RIDE',
        sourceId: expense.id,
        subtype: 'RIDE_EXPENSE',
        actionKey: `ride:expense:${expense.id}`,
      }, now, idFactory);
      break;
    }

    case 'RIDE_CREDIT_WITHDRAW_REQUEST': {
      const amountSatang = parseSatang(payload.amountSatang, { allowZero: false, label: 'ยอดเบิกเครดิต' });
      const pendingReserved = state.ride.creditWithdrawals
        .filter(item => item.status === 'PENDING')
        .reduce((sum, item) => sum + Number(item.amountSatang || 0), 0);
      const availableCredit = state.ride.creditBalanceSatang - pendingReserved;
      if (amountSatang > availableCredit) throw new Error('เครดิตที่ยังไม่ได้จองไม่พอ');
      if (!isValidISODate(payload.due)) throw new Error('วันเงินเข้าไม่ถูกต้อง');
      const withdrawal = {
        ...newRecord('CWD', now, idFactory),
        amountSatang,
        due: payload.due,
        status: 'PENDING',
        confirmedAt: null,
        cancelledAt: null,
      };
      state.ride.creditWithdrawals.push(withdrawal);
      state.calendar.push({
        ...newRecord('CAL', now, idFactory),
        owner: 'RIDE',
        source: 'RIDE',
        sourceId: withdrawal.id,
        actionType: 'CONFIRM_RIDE_CREDIT_WITHDRAWAL',
        title: 'ยืนยันเงินเครดิตงานวิ่งเข้า',
        amountSatang,
        due: payload.due,
        status: 'OPEN',
        appliedActions: {},
      });
      break;
    }

    case 'LEDGER_OBLIGATION_ADD': {
      const amountSatang = parseSatang(payload.amountSatang, { allowZero: false, label: 'ยอดค้างชำระ' });
      if (!isValidISODate(payload.due)) throw new Error('วันครบกำหนดไม่ถูกต้อง');
      const obligation = {
        ...newRecord('OBL', now, idFactory),
        name: String(payload.name || 'ยอดค้างชำระ').trim(),
        originalSatang: amountSatang,
        paidSatang: 0,
        remainingSatang: amountSatang,
        firstDue: payload.due,
        status: 'OPEN',
      };
      state.ledger.obligations.push(obligation);
      state.calendar.push({
        ...newRecord('CAL', now, idFactory),
        owner: 'LEDGER',
        source: 'LEDGER',
        sourceId: obligation.id,
        actionType: 'PAY_OBLIGATION',
        title: `ชำระ ${obligation.name}`,
        amountSatang,
        due: payload.due,
        status: 'OPEN',
        appliedActions: {},
      });
      break;
    }

    case 'CALENDAR_COMPLETE': {
      const item = findById(state.calendar, payload.id, 'รายการปฏิทิน');
      if (['COMPLETED', 'CANCELLED'].includes(item.status)) throw new Error('รายการนี้ทำรายการแล้ว');
      if (item.actionType === 'CONFIRM_RIDE_CREDIT_WITHDRAWAL') {
        const withdrawal = findById(state.ride.creditWithdrawals, item.sourceId, 'รายการเบิกเครดิต');
        if (withdrawal.status !== 'PENDING') throw new Error('รายการเบิกเครดิตทำรายการแล้ว');
        if (withdrawal.amountSatang > state.ride.creditBalanceSatang) throw new Error('ยอดเครดิตคงเหลือไม่พอ');
        state.ride.creditBalanceSatang -= withdrawal.amountSatang;
        withdrawal.status = 'CONFIRMED';
        withdrawal.confirmedAt = now;
        withdrawal.updatedAt = now;
        withdrawal.revision += 1;
        addTransaction(state, {
          direction: 'IN',
          amountSatang: withdrawal.amountSatang,
          label: 'รับเงินเครดิตงานวิ่ง',
          source: 'RIDE',
          sourceId: withdrawal.id,
          subtype: 'RIDE_CREDIT_WITHDRAWAL',
          actionKey: `ride:credit-withdraw:${withdrawal.id}`,
        }, now, idFactory);
      } else if (item.actionType === 'CONFIRM_STORE_RECEIPT') {
        const sale = findById(state.store.sales, item.sourceId, 'รายการขาย');
        if (sale.status !== 'RECEIVABLE') throw new Error('รายการขายทำรายการแล้ว');
        sale.status = 'SETTLED';
        sale.updatedAt = now;
        sale.revision += 1;
        addTransaction(state, {
          direction: 'IN',
          amountSatang: sale.totalSatang,
          label: `รับเงินยอดขาย ${sale.name}`,
          source: 'STORE',
          sourceId: sale.id,
          subtype: 'SALE_RECEIPT',
          actionKey: `store:credit-receipt:${sale.id}`,
        }, now, idFactory);
      } else if (item.actionType === 'PAY_OBLIGATION') {
        const obligation = findById(state.ledger.obligations, item.sourceId, 'ยอดค้างชำระ');
        if (obligation.status !== 'OPEN') throw new Error('ยอดค้างชำระทำรายการแล้ว');
        obligation.paidSatang = obligation.originalSatang;
        obligation.remainingSatang = 0;
        obligation.status = 'PAID';
        obligation.updatedAt = now;
        obligation.revision += 1;
        addTransaction(state, {
          direction: 'OUT',
          amountSatang: obligation.originalSatang,
          label: `ชำระ ${obligation.name}`,
          source: 'LEDGER',
          sourceId: obligation.id,
          subtype: 'OBLIGATION_PAYMENT',
          actionKey: `ledger:obligation:${obligation.id}`,
        }, now, idFactory);
      }
      item.status = 'COMPLETED';
      item.completedAt = now;
      item.updatedAt = now;
      item.revision += 1;
      break;
    }

    case 'CALENDAR_CANCEL': {
      const item = findById(state.calendar, payload.id, 'รายการปฏิทิน');
      if (['COMPLETED', 'CANCELLED'].includes(item.status)) throw new Error('รายการนี้ทำรายการแล้ว');
      item.status = 'CANCELLED';
      item.cancelledAt = now;
      item.updatedAt = now;
      item.revision += 1;
      if (item.actionType === 'CONFIRM_RIDE_CREDIT_WITHDRAWAL') {
        const withdrawal = findById(state.ride.creditWithdrawals, item.sourceId, 'รายการเบิกเครดิต');
        withdrawal.status = 'CANCELLED';
        withdrawal.cancelledAt = now;
        withdrawal.updatedAt = now;
        withdrawal.revision += 1;
      }
      break;
    }

    case 'TRANSACTION_REVERSE': {
      const original = findById(state.ledger.transactions, payload.id, 'ธุรกรรม');
      if (original.reversedBy) throw new Error('ธุรกรรมนี้ถูกกลับรายการแล้ว');
      const reversal = addTransaction(state, {
        direction: original.direction === 'IN' ? 'OUT' : 'IN',
        amountSatang: original.amountSatang,
        label: `กลับรายการ: ${original.label}`,
        source: original.source,
        sourceId: original.sourceId,
        subtype: `REVERSAL_${original.subtype}`,
        actionKey: `reversal:${original.id}`,
      }, now, idFactory);
      reversal.reason = String(payload.reason || 'กลับรายการ');
      reversal.reversalOf = original.id;
      original.reversedBy = reversal.id;
      original.updatedAt = now;
      original.revision += 1;
      break;
    }

    default:
      throw new Error(`ไม่รองรับคำสั่ง ${command.type}`);
  }

  return finish(state, command.type, now, idFactory);
}
