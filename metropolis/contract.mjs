const REQUIRED = Object.freeze(['workId', 'ownerSystem', 'checkpointId']);

export const METROPOLIS_CONTRACT_VERSION = '0.1.0';

export const METROPOLIS_ROLES = Object.freeze({
  METROPOLIS: 'connection_environment',
  CITY_HALL: 'intake_return_data',
  HERMES: 'intake_registration_index',
  WORK_SYSTEM: 'work_identity_lifecycle_continuity',
  STATION: 'connection_point',
  RAIL: 'owner_connection',
  OATH: 'transport',
  MIMIR: 'return_organization_index',
  OWNER_SYSTEM: 'domain_operation',
  DATA_MANAGEMENT: 'durable_information_evidence_lineage',
  AGENT: 'traveller',
});

export const RECONCILIATION_STATUS = Object.freeze({
  MATCH: 'MATCH',
  DRIFT: 'DRIFT',
  CONFLICT: 'CONFLICT',
  UNKNOWN: 'UNKNOWN',
});

function requiredString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name}_REQUIRED`);
  return value.trim();
}

function credentialReference(value) {
  const reference = requiredString(value, 'credentialRef');
  if (!reference.startsWith('credential://')) throw new TypeError('credentialRef_MUST_BE_REFERENCE');
  return reference;
}

function plainObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name}_MUST_BE_OBJECT`);
  return value;
}

export function createWorkIdentity(input = {}) {
  for (const name of REQUIRED) requiredString(input[name], name);
  return Object.freeze({
    kind: 'WORK_IDENTITY',
    contractVersion: METROPOLIS_CONTRACT_VERSION,
    workId: input.workId.trim(),
    ownerSystem: input.ownerSystem.trim(),
    checkpointId: input.checkpointId.trim(),
    ownerRef: input.ownerRef == null ? null : requiredString(input.ownerRef, 'ownerRef'),
    handoffId: input.handoffId == null ? null : requiredString(input.handoffId, 'handoffId'),
  });
}

export function createStation(input = {}) {
  return Object.freeze({
    kind: 'STATION',
    stationId: requiredString(input.stationId, 'stationId'),
    ownerSystem: requiredString(input.ownerSystem, 'ownerSystem'),
    credentialRef: credentialReference(input.credentialRef),
  });
}

export function createRail(input = {}) {
  return Object.freeze({
    kind: 'RAIL',
    railId: requiredString(input.railId, 'railId'),
    stationId: requiredString(input.stationId, 'stationId'),
    ownerSystem: requiredString(input.ownerSystem, 'ownerSystem'),
    credentialRef: credentialReference(input.credentialRef),
  });
}

export function createOathEnvelope(input = {}) {
  const payload = input.payload == null ? {} : plainObject(input.payload, 'payload');
  return Object.freeze({
    kind: 'OATH',
    contractVersion: METROPOLIS_CONTRACT_VERSION,
    oathId: requiredString(input.oathId, 'oathId'),
    workId: requiredString(input.workId, 'workId'),
    stationId: requiredString(input.stationId, 'stationId'),
    railId: requiredString(input.railId, 'railId'),
    operation: requiredString(input.operation, 'operation'),
    payload,
    requestedAt: requiredString(input.requestedAt, 'requestedAt'),
  });
}

export function classifyReconciliation({
  expectedOwnerSystem,
  observedOwnerSystem,
  expectedRevision,
  observedRevision,
  observedAt,
} = {}) {
  if (!observedAt || !expectedOwnerSystem || !observedOwnerSystem) {
    return { status: RECONCILIATION_STATUS.UNKNOWN, reason: 'OWNER_READBACK_INCOMPLETE' };
  }
  if (expectedOwnerSystem !== observedOwnerSystem) {
    return { status: RECONCILIATION_STATUS.CONFLICT, reason: 'OWNER_SYSTEM_MISMATCH' };
  }
  if (expectedRevision == null || observedRevision == null) {
    return { status: RECONCILIATION_STATUS.UNKNOWN, reason: 'REVISION_UNAVAILABLE' };
  }
  if (expectedRevision === observedRevision) {
    return { status: RECONCILIATION_STATUS.MATCH, reason: 'OWNER_READBACK_MATCH' };
  }
  return { status: RECONCILIATION_STATUS.DRIFT, reason: 'OWNER_REVISION_CHANGED' };
}
