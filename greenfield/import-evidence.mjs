import { assertGreenfieldState } from './core.mjs';
import { validateEvidenceIntegrity } from './evidence-integrity.mjs';

const CUTOVER_IMPORT_DOMAINS = Object.freeze(['STORE', 'LEDGER', 'CALENDAR']);

function text(value, code) {
  const output = String(value ?? '').trim();
  if (!output) throw new Error(code);
  return output;
}

export function importEvidenceSnapshot(state, evidence, {
  expectedPackageId,
  expectedRevision,
  importedAt = new Date().toISOString(),
} = {}) {
  assertGreenfieldState(state);
  if (state.meta?.importedFrom) throw new Error('IMPORT_ALREADY_APPLIED');
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) throw new Error('INVALID_EVIDENCE');
  if (evidence.format !== 'YGPH_FLOW_EVENT_EXCHANGE' || Number(evidence.formatVersion) !== 3) throw new Error('UNSUPPORTED_EVIDENCE_FORMAT');
  if (evidence.packageMode !== 'SNAPSHOT_AND_DELTA') throw new Error('UNSUPPORTED_EVIDENCE_MODE');
  validateEvidenceIntegrity(evidence);
  if (expectedPackageId && evidence.packageId !== expectedPackageId) throw new Error('UNEXPECTED_EVIDENCE_PACKAGE');
  if (expectedRevision != null && Number(evidence.sourceRevision) !== Number(expectedRevision)) throw new Error('UNEXPECTED_EVIDENCE_REVISION');
  if (evidence.reconciliation?.status !== 'PASS' || (evidence.reconciliation?.blockingIssues?.length ?? 0) > 0) throw new Error('EVIDENCE_RECONCILIATION_NOT_PASS');

  const next = structuredClone(state);
  const counts = { STORE: 0, LEDGER: 0, CALENDAR: 0 };
  const excludedByPolicy = {};

  for (const event of evidence.events) {
    const source = text(event?.source, 'INVALID_EVIDENCE_SOURCE');
    if (!CUTOVER_IMPORT_DOMAINS.includes(source)) {
      excludedByPolicy[source] = Number(excludedByPolicy[source] || 0) + 1;
      continue;
    }
    const record = event?.payload?.record;
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error(`INVALID_EVIDENCE_RECORD:${event?.eventId || '?'}`);
    const recordId = text(record.recordId ?? record.id, `INVALID_RECORD_ID:${event?.eventId || '?'}`);
    if (next.domains[source].records[recordId]) throw new Error(`DUPLICATE_IMPORTED_RECORD:${source}/${recordId}`);
    next.domains[source].records[recordId] = {
      record: structuredClone(record),
      provenance: {
        origin: 'EVIDENCE_IMPORT',
        eventId: event.eventId ?? null,
        source,
        owner: event.owner ?? null,
        changeType: event.changeType ?? null,
        checksum: event.checksum ?? null,
        ownerConfirmation: event.validation?.ownerConfirmation ?? 'UNCONFIRMED',
        sourceRevision: Number(event.sourceRevision ?? evidence.sourceRevision),
      },
    };
    counts[source] += 1;
  }

  next.meta.importedFrom = {
    packageId: evidence.packageId,
    sourceRevision: Number(evidence.sourceRevision),
    snapshotAsOf: evidence.snapshotAsOf ?? null,
    evidenceSchemaVersion: evidence.evidenceSchemaVersion ?? null,
    importedAt,
  };
  next.importReport = {
    imported: counts,
    excludedByPolicy,
    totalEvidenceEvents: evidence.events.length,
    reconciliationStatus: evidence.reconciliation.status,
  };
  next.revision += 1;
  next.updatedAt = importedAt;
  return assertGreenfieldState(next);
}
