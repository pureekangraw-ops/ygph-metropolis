const OWNERS = new Set(['LEDGER', 'CALENDAR']);
const REFERENCE_KEYS = 'owner,recordId,version';

export function createRecordReference(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('CONTEXT_REFERENCE_INVALID');
  if (Object.keys(input).sort().join(',') !== REFERENCE_KEYS) throw new Error('CONTEXT_REFERENCE_INVALID');
  const recordId = String(input.recordId ?? '').trim();
  if (input.version !== 1 || !OWNERS.has(input.owner) || !recordId) throw new Error('CONTEXT_REFERENCE_INVALID');
  return Object.freeze({ version:1, owner:input.owner, recordId });
}

export async function resolveRecordReference(manual, input) {
  if (!manual || typeof manual.getRecord !== 'function') throw new Error('CONTEXT_REFERENCE_RESOLVER_REQUIRED');
  const reference = createRecordReference(input);
  const found = await manual.getRecord(reference.owner, reference.recordId);
  if (!found || found.recordId !== reference.recordId) throw new Error('CONTEXT_REFERENCE_NOT_FOUND');
  const record = Object.freeze(structuredClone(found));
  return Object.freeze({ reference, record, type:record.type ?? null });
}
