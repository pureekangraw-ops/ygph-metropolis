"use strict";

function flowCanonical(value) {
  if (Array.isArray(value)) return `[${value.map(flowCanonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).filter(key => key !== 'checksum').sort().map(key => `${JSON.stringify(key)}:${flowCanonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function flowChecksum(value) {
  const text = flowCanonical(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function defaultRoute(source) {
  return source === 'CALENDAR'
    ? { from:'LEDGER', to:'CALENDAR', permission:'READ' }
    : { from:source, to:'REVIEW_CENTER', permission:'READ' };
}

function signEvent(event, index = 0) {
  const next = structuredClone(event);
  next.eventId ||= `E${index + 1}`;
  next.idempotencyKey ||= `TEST:${next.eventId}`;
  next.owner ||= next.source;
  next.eventType ||= 'SNAPSHOT_RECORD';
  next.route ||= defaultRoute(next.source);
  next.checksum = flowChecksum(next);
  return next;
}

function signEvidence(evidence) {
  const next = structuredClone(evidence);
  next.events = (next.events || []).map(signEvent);
  next.checksum = flowChecksum(next);
  return next;
}

module.exports = { flowCanonical, flowChecksum, signEvent, signEvidence };
