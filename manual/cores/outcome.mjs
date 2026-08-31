export const OUTCOME_CORE = Object.freeze({
  id: 'OUTCOME',
  manualRole: 'HOME',
  runtimeRoot: 'GREENFIELD_RUNTIME',
  truthDomain: 'LEDGER',
  storageOwner: 'GREENFIELD_VAULT',
  runtimeAnchors: Object.freeze(['expense', 'verifiedExpense']),
  domainAnchors: Object.freeze(['LEDGER_CREATE_TRANSACTION']),
  projectionAnchors: Object.freeze([]),
});
