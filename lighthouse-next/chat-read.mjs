import {
  projectFinanceView,
  projectStoreView,
  projectRideView,
  projectCalendarView,
  projectLedgerHistoryView,
} from './view-model.mjs';

function formatSatang(value) {
  return `฿${(Number(value || 0) / 100).toLocaleString('en-US', { maximumFractionDigits:2 })}`;
}

function messageFor(domain, view) {
  if (view.status === 'UNAVAILABLE') return 'ยังอ่านข้อมูลจริงไม่ได้';
  if (domain === 'STORE') {
    if (view.status === 'EMPTY') return 'ร้านค้า · ยังไม่มีสินค้า';
    const stock = view.products.reduce((sum, product) => sum + Number(product.quantity || 0), Number(view.legacyUnassignedQuantity || 0));
    return `ร้านค้า · ${view.products.length} สินค้า · สต็อกรวม ${stock} ชิ้น`;
  }
  if (domain === 'RIDE') {
    if (view.status === 'EMPTY') return 'งานวิ่ง · ยังไม่มีข้อมูลงานวิ่ง';
    const round = view.todayRoundState === 'ACTIVE' ? 'กำลังวิ่ง' : view.todayRoundState === 'COMPLETED' ? 'จบรอบแล้ว' : 'ยังไม่เริ่มรอบ';
    return `งานวิ่ง · ${round} · รายได้ ${formatSatang(view.generatedSatang)} · เงินสด ${formatSatang(view.cashJobSatang)} · เครดิตค้างรับ ${formatSatang(view.pendingCreditSatang)}`;
  }
  if (domain === 'CALENDAR') {
    if (view.status === 'EMPTY') return 'ปฏิทิน · ยังไม่มีรายการ';
    return `ปฏิทิน · ${view.total} รายการ`;
  }
  if (domain === 'LEDGER') {
    if (view.status === 'EMPTY') return 'Ledger · ยังไม่มีรายการ';
    return `Ledger · ${view.transactions.length} รายการ`;
  }
  if (domain === 'INCOME') {
    return `รายรับวันนี้ ${formatSatang(view.todayIncomeSatang)} · เงินสดจริง ${formatSatang(view.cashSatang)} · สุทธิวันนี้ ${formatSatang(view.netSatang)}`;
  }
  return 'ยังอ่านข้อมูลจริงไม่ได้';
}

function readResult(domain, view, truth) {
  return Object.freeze({
    status:view.status,
    domain,
    view,
    truth,
    message:messageFor(domain, view),
  });
}

export function createChatReadCapability({ ledgerBridge, storeBridge } = {}) {
  if (!ledgerBridge || !storeBridge) throw new Error('LIGHTHOUSE_CHAT_READ_DEPS_REQUIRED');

  async function resolve(query) {
    if (query === 'STORE_SUMMARY') {
      const truth = await storeBridge.readStoreTruth();
      return readResult('STORE', projectStoreView(truth), truth);
    }
    if (query === 'RIDE_SUMMARY') {
      const truth = await ledgerBridge.readRideTruth();
      return readResult('RIDE', projectRideView(truth), truth);
    }
    if (query === 'CALENDAR_LIST') {
      const truth = await ledgerBridge.readCalendarTruth();
      return readResult('CALENDAR', projectCalendarView(truth), truth);
    }
    if (query === 'LEDGER_LIST') {
      const truth = await ledgerBridge.readLedgerTruth();
      return readResult('LEDGER', projectLedgerHistoryView(truth), truth);
    }
    if (query === 'INCOME_SUMMARY') {
      const truth = await ledgerBridge.readIncomeTruth();
      return readResult('INCOME', projectFinanceView(truth), truth);
    }
    throw new Error(`LIGHTHOUSE_CHAT_READ_QUERY_UNSUPPORTED:${query}`);
  }

  return Object.freeze({ resolve });
}
