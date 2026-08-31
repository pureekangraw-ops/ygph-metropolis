export const LEDGER_CORE = Object.freeze({
  id: 'LEDGER',
  manualRole: 'HEAD',
  runtimeRoot: 'GREENFIELD_RUNTIME',
  truthDomain: 'LEDGER',
  storageOwner: 'GREENFIELD_VAULT',
  runtimeAnchors: Object.freeze(['adjustBalance', 'obligation', 'payObligation']),
  domainAnchors: Object.freeze([
    'LEDGER_CREATE_TRANSACTION',
    'LEDGER_CREATE_OBLIGATION',
    'LEDGER_APPLY_OBLIGATION_PAYMENT',
    'LEDGER_REVERSE_TRANSACTION',
  ]),
  projectionAnchors: Object.freeze(['projectLedgerBalance']),
});
