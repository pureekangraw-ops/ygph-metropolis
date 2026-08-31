export const INCOME_CORE = Object.freeze({
  id: 'INCOME',
  manualRole: 'HOME',
  runtimeRoot: 'GREENFIELD_RUNTIME',
  truthDomain: 'LEDGER',
  storageOwner: 'GREENFIELD_VAULT',
  runtimeAnchors: Object.freeze(['otherIncome']),
  domainAnchors: Object.freeze(['LEDGER_CREATE_TRANSACTION']),
  projectionAnchors: Object.freeze([]),
});
