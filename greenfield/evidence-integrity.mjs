export function flowCanonical(value) {
  if (Array.isArray(value)) return `[${value.map(flowCanonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).filter(key => key !== 'checksum').sort().map(key => `${JSON.stringify(key)}:${flowCanonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function flowChecksum(value) {
  const text = flowCanonical(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateEventEnvelope(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('INVALID_EVIDENCE_EVENT_ENVELOPE:?');
  const id = nonEmpty(event.eventId) ? event.eventId : '?';
  if (!nonEmpty(event.eventId) || !nonEmpty(event.idempotencyKey) || !nonEmpty(event.owner) || !nonEmpty(event.eventType) || !nonEmpty(event.source)) {
    throw new Error(`INVALID_EVIDENCE_EVENT_ENVELOPE:${id}`);
  }
  if (!event.route || typeof event.route !== 'object' || Array.isArray(event.route)) throw new Error(`INVALID_EVIDENCE_EVENT_ENVELOPE:${id}`);
  return id;
}

export function validateEvidenceIntegrity(evidence) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) throw new Error('INVALID_EVIDENCE');
  if (!Array.isArray(evidence.events)) throw new Error('INVALID_EVIDENCE_EVENTS');
  if (!nonEmpty(evidence.checksum) || evidence.checksum !== flowChecksum(evidence)) throw new Error('EVIDENCE_PACKAGE_CHECKSUM_MISMATCH');

  for (const event of evidence.events) {
    const id = validateEventEnvelope(event);
    if (!nonEmpty(event.checksum) || event.checksum !== flowChecksum(event)) throw new Error(`EVIDENCE_EVENT_CHECKSUM_MISMATCH:${id}`);
  }
  return { status:'PASS', events:evidence.events.length };
}
