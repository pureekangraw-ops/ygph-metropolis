const RAW_CAPABILITIES = [
  { id:'system.health', readable:true, editable:false, owner:'CONTROL_PORT', action:null, confirmationRequired:false, readback:'health', derived:true },
  { id:'system.appState', readable:true, editable:false, owner:'CONTROL_PORT', action:null, confirmationRequired:false, readback:'query.appState', derived:true },
  { id:'system.commandPack', readable:false, editable:true, owner:'CONTROL_PORT', action:'commitCommandPack', confirmationRequired:true, readback:'perItemReadback', derived:false },

  { id:'centreBoard.read', readable:true, editable:false, owner:'LIGHTHOUSE:CENTRE_BOARD', action:null, confirmationRequired:false, readback:'readBoard', derived:false },
  { id:'centreBoard.initialize', readable:false, editable:true, owner:'LIGHTHOUSE:CENTRE_BOARD', action:'initializeBoard', confirmationRequired:false, readback:'readBoard', derived:false },
  { id:'centreBoard.claim', readable:false, editable:true, owner:'LIGHTHOUSE:CENTRE_BOARD', action:'claimPins', confirmationRequired:false, readback:'readBoard', derived:false },
  { id:'centreBoard.return', readable:false, editable:true, owner:'LIGHTHOUSE:CENTRE_BOARD', action:'returnPins', confirmationRequired:false, readback:'readBoard', derived:false },
  { id:'centreBoard.recover', readable:false, editable:true, owner:'LIGHTHOUSE:CENTRE_BOARD', action:'recoverEmergency', confirmationRequired:false, readback:'readBoard', derived:false },

  { id:'finance.balance', readable:true, editable:false, owner:'GREENFIELD:LEDGER', action:null, confirmationRequired:false, readback:'readLedgerTruth.balanceSatang', derived:true },
  { id:'finance.todayIn', readable:true, editable:false, owner:'GREENFIELD:LEDGER', action:null, confirmationRequired:false, readback:'readLedgerTruth.todayInSatang', derived:true },
  { id:'finance.todayOut', readable:true, editable:false, owner:'GREENFIELD:LEDGER', action:null, confirmationRequired:false, readback:'readLedgerTruth.todayOutSatang', derived:true },
  { id:'finance.net', readable:true, editable:false, owner:'GREENFIELD:LEDGER', action:null, confirmationRequired:false, readback:'readLedgerTruth.netSatang', derived:true },
  { id:'finance.transactions', readable:true, editable:false, owner:'GREENFIELD:LEDGER', action:null, confirmationRequired:false, readback:'readLedgerTruth.transactions', derived:false },
  { id:'finance.dailyGoal', readable:true, editable:true, owner:'GREENFIELD:META', action:'setDailyGoal', confirmationRequired:false, readback:'readPlanningTruth.goalSatang', derived:false },
  { id:'finance.income.create', readable:false, editable:true, owner:'GREENFIELD:LEDGER', action:'recordOtherIncome', confirmationRequired:true, readback:'readLedgerTruth.transactions', derived:false },
  { id:'finance.expense.create', readable:false, editable:true, owner:'GREENFIELD:LEDGER', action:'recordExpense', confirmationRequired:true, readback:'readLedgerTruth.transactions', derived:false },
  { id:'finance.obligations', readable:true, editable:false, owner:'GREENFIELD:LEDGER', action:null, confirmationRequired:false, readback:'readLedgerTruth.obligations', derived:false },
  { id:'finance.obligation.create', readable:false, editable:true, owner:'GREENFIELD:LEDGER', action:'createObligation', confirmationRequired:true, readback:'readLedgerTruth.obligations', derived:false },
  { id:'finance.obligation.dueDate', readable:true, editable:true, owner:'GREENFIELD:CALENDAR', action:'rescheduleCalendar', confirmationRequired:true, readback:'readCalendarTruth.records', derived:false },
  { id:'finance.obligation.payment', readable:false, editable:true, owner:'GREENFIELD:LEDGER', action:'payObligation', confirmationRequired:true, readback:'readLedgerTruth.obligations', derived:false },
  { id:'finance.receivables', readable:true, editable:false, owner:'GREENFIELD:STORE', action:null, confirmationRequired:false, readback:'readIncomeTruth.receivables', derived:true },
  { id:'finance.receivable.payment', readable:false, editable:true, owner:'GREENFIELD:STORE', action:'receiveReceivablePayment', confirmationRequired:true, readback:'readIncomeTruth.receivables', derived:false },

  { id:'calendar.records', readable:true, editable:false, owner:'GREENFIELD:CALENDAR', action:null, confirmationRequired:false, readback:'readCalendarTruth.records', derived:false },
  { id:'calendar.status', readable:true, editable:true, owner:'GREENFIELD:CALENDAR', action:'setCalendarStatus', confirmationRequired:true, readback:'readCalendarTruth.records', derived:false },

  { id:'store.products', readable:true, editable:false, owner:'GREENFIELD:STORE', action:null, confirmationRequired:false, readback:'readStoreTruth.products', derived:false },
  { id:'store.product.create', readable:false, editable:true, owner:'GREENFIELD:STORE', action:'createProductWithStock', confirmationRequired:true, readback:'readStoreTruth.products', derived:false },
  { id:'store.stock.add', readable:false, editable:true, owner:'GREENFIELD:STORE', action:'addProductStock', confirmationRequired:true, readback:'readStoreTruth.products', derived:false },

  { id:'ride.summary', readable:true, editable:false, owner:'GREENFIELD:RIDE', action:null, confirmationRequired:false, readback:'readRideTruth', derived:true },

  { id:'security.pin', readable:false, editable:false, owner:'DEVICE_SECURITY', action:null, confirmationRequired:true, readback:null, derived:false },
  { id:'security.recoveryCode', readable:false, editable:false, owner:'DEVICE_SECURITY', action:null, confirmationRequired:true, readback:null, derived:false },
  { id:'security.vault', readable:false, editable:false, owner:'DEVICE_SECURITY', action:null, confirmationRequired:true, readback:null, derived:false },
];

function freezeCapability(entry) {
  return Object.freeze({ ...entry });
}

function validate(entry) {
  if (!entry || typeof entry !== 'object') throw new Error('LIGHTHOUSE_CAPABILITY_INVALID');
  if (!/^[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+$/.test(String(entry.id || ''))) {
    throw new Error('LIGHTHOUSE_CAPABILITY_ID_INVALID');
  }
  if (typeof entry.readable !== 'boolean' || typeof entry.editable !== 'boolean') {
    throw new Error(`LIGHTHOUSE_CAPABILITY_ACCESS_INVALID:${entry.id}`);
  }
  if (!String(entry.owner || '').trim()) throw new Error(`LIGHTHOUSE_CAPABILITY_OWNER_REQUIRED:${entry.id}`);
  if (entry.editable && !String(entry.action || '').trim()) {
    throw new Error(`LIGHTHOUSE_CAPABILITY_ACTION_REQUIRED:${entry.id}`);
  }
  if (!entry.editable && entry.action !== null) {
    throw new Error(`LIGHTHOUSE_CAPABILITY_READONLY_ACTION_FORBIDDEN:${entry.id}`);
  }
  if (typeof entry.confirmationRequired !== 'boolean') {
    throw new Error(`LIGHTHOUSE_CAPABILITY_CONFIRMATION_INVALID:${entry.id}`);
  }
  if (entry.readable && !String(entry.readback || '').trim()) {
    throw new Error(`LIGHTHOUSE_CAPABILITY_READBACK_REQUIRED:${entry.id}`);
  }
  if (entry.derived && entry.editable) {
    throw new Error(`LIGHTHOUSE_DERIVED_CAPABILITY_MUST_BE_READONLY:${entry.id}`);
  }
}

const ids = new Set();
for (const entry of RAW_CAPABILITIES) {
  validate(entry);
  if (ids.has(entry.id)) throw new Error(`LIGHTHOUSE_CAPABILITY_DUPLICATE:${entry.id}`);
  ids.add(entry.id);
}

export const LIGHTHOUSE_CAPABILITIES = Object.freeze(RAW_CAPABILITIES.map(freezeCapability));
const BY_ID = new Map(LIGHTHOUSE_CAPABILITIES.map(entry => [entry.id, entry]));

export function getLighthouseCapability(id) {
  return BY_ID.get(String(id || '')) || null;
}

export function listLighthouseCapabilities() {
  return LIGHTHOUSE_CAPABILITIES;
}

export function canReadLighthouseCapability(id) {
  return getLighthouseCapability(id)?.readable === true;
}

export function canEditLighthouseCapability(id) {
  return getLighthouseCapability(id)?.editable === true;
}
