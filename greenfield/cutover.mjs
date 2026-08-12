import { createGreenfieldState } from './core.mjs';
import { importEvidenceSnapshot } from './import-evidence.mjs';
import { checkLedgerSnapshot } from './projections.mjs';
import { commitEncryptedState, readEncryptedState } from './persistence.mjs';

function domainCounts(state) {
  return {
    STORE: Object.keys(state.domains.STORE.records).length,
    LEDGER: Object.keys(state.domains.LEDGER.records).length,
    CALENDAR: Object.keys(state.domains.CALENDAR.records).length,
  };
}

export async function initializeGreenfieldFromEvidence({
  store,
  passphrase,
  evidence,
  expectedPackageId,
  expectedRevision,
  now = new Date().toISOString(),
}) {
  const existing = await readEncryptedState({ store, passphrase });
  if (existing) {
    return {
      status: 'ALREADY_INITIALIZED',
      state: existing,
      counts: domainCounts(existing),
      ledger: checkLedgerSnapshot(existing),
    };
  }

  const imported = importEvidenceSnapshot(createGreenfieldState({ now }), evidence, {
    expectedPackageId,
    expectedRevision,
    importedAt: now,
  });
  const ledger = checkLedgerSnapshot(imported);
  if (ledger.status !== 'PASS') {
    throw new Error(`GREENFIELD_LEDGER_RECONCILIATION_FAILED:${ledger.calculatedBalanceSatang}/${ledger.snapshotBalanceSatang}`);
  }

  const commit = await commitEncryptedState({ store, passphrase, state: imported, expectedDurableRevision: null });
  const durable = await readEncryptedState({ store, passphrase });
  return { status: 'IMPORTED_VERIFIED', state: durable, counts: domainCounts(durable), ledger, commit };
}
