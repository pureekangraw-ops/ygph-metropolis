import {
  projectFinanceView,
  projectStoreView,
  projectRideView,
  projectCalendarView,
  projectLedgerHistoryView,
} from './view-model.mjs';

function readyResult(domain, view, truth) {
  return Object.freeze({
    status:view.status,
    domain,
    view,
    truth,
  });
}

export function createChatReadCapability({ ledgerBridge, storeBridge } = {}) {
  if (!ledgerBridge || !storeBridge) throw new Error('LIGHTHOUSE_CHAT_READ_DEPS_REQUIRED');

  async function resolve(query) {
    if (query === 'STORE_SUMMARY') {
      const truth = await storeBridge.readStoreTruth();
      return readyResult('STORE', projectStoreView(truth), truth);
    }
    if (query === 'RIDE_SUMMARY') {
      const truth = await ledgerBridge.readRideTruth();
      return readyResult('RIDE', projectRideView(truth), truth);
    }
    if (query === 'CALENDAR_LIST') {
      const truth = await ledgerBridge.readCalendarTruth();
      return readyResult('CALENDAR', projectCalendarView(truth), truth);
    }
    if (query === 'LEDGER_LIST') {
      const truth = await ledgerBridge.readLedgerTruth();
      return readyResult('LEDGER', projectLedgerHistoryView(truth), truth);
    }
    if (query === 'INCOME_SUMMARY') {
      const truth = await ledgerBridge.readIncomeTruth();
      return readyResult('INCOME', projectFinanceView(truth), truth);
    }
    throw new Error(`LIGHTHOUSE_CHAT_READ_QUERY_UNSUPPORTED:${query}`);
  }

  return Object.freeze({ resolve });
}
