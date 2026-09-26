const OBSERVER_HEALTH_SCHEMA = 'lighthouse-observer-health-v1';
const MAP_EVIDENCE_SCHEMA = 'lighthouse-map-evidence-v1';
const PREVIEW_CONSENT_REQUIRED = 'MAP_PREVIEW_CONSENT_REQUIRED';

function text(value) {
  const output = String(value ?? '').trim();
  return output || null;
}

function freeze(value) {
  if (!value || typeof value !== 'object') return value;
  for (const nested of Object.values(value)) freeze(nested);
  return Object.freeze(value);
}

function timestamp(value) {
  const output = value == null ? null : String(value).trim();
  if (!output) return null;
  const parsed = Date.parse(output);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function point(value, includeCoordinates) {
  if (!value || typeof value !== 'object') return null;
  const output = {
    label:text(value.label),
    address:text(value.address),
  };
  if (includeCoordinates) {
    const lat = Number(value.lat);
    const lng = Number(value.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      output.lat = lat;
      output.lng = lng;
    }
  }
  return Object.values(output).some(Boolean) ? output : null;
}

export function createBrowserObserverHealth({
  nowMs = Date.now(),
  lastSeenAt = null,
  staleAfterMs = 90_000,
  sessionState = 'UNKNOWN',
  workerState = 'UNKNOWN',
  extensionVerified = false,
  observerVersion = null,
  workerDeploymentId = null,
  signedXpiSha256 = null,
} = {}) {
  const current = Number(nowMs);
  const seenAt = timestamp(lastSeenAt);
  const seenMs = seenAt ? Date.parse(seenAt) : NaN;
  const ageMs = Number.isFinite(current) && Number.isFinite(seenMs) ? Math.max(0, current - seenMs) : null;
  const limit = Number.isFinite(Number(staleAfterMs)) && Number(staleAfterMs) >= 0 ? Number(staleAfterMs) : 90_000;
  let status = 'STALE';
  if (String(workerState).toUpperCase() === 'HUB_UNAVAILABLE') status = 'HUB_UNAVAILABLE';
  else if (extensionVerified !== true) status = 'EXTENSION_NOT_VERIFIED';
  else if (String(sessionState).toUpperCase() === 'INACTIVE') status = 'SESSION_INACTIVE';
  else if (ageMs == null || ageMs > limit) status = 'STALE';
  else status = 'LIVE';

  return freeze({
    schemaVersion:OBSERVER_HEALTH_SCHEMA,
    status,
    healthy:status === 'LIVE',
    lastSeenAt:seenAt,
    ageMs,
    staleAfterMs:limit,
    sessionState:text(sessionState) || 'UNKNOWN',
    workerState:text(workerState) || 'UNKNOWN',
    extensionVerified:extensionVerified === true,
    observerVersion:text(observerVersion),
    workerDeploymentId:text(workerDeploymentId),
    signedXpiSha256:text(signedXpiSha256),
  });
}

export function createRideMapEvidence({
  jobId = null,
  packageState = 'UNKNOWN',
  packageVersion = null,
  packageSha256 = null,
  packageByteLength = null,
  region = null,
  lastOpenedAt = null,
  pickup = null,
  dropoff = null,
  shareCoordinates = false,
} = {}) {
  const state = text(packageState) || 'UNKNOWN';
  const mapAvailable = state === 'ACTIVE';
  return freeze({
    schemaVersion:MAP_EVIDENCE_SCHEMA,
    status:mapAvailable ? 'ACTIVE' : state,
    mapAvailable,
    jobId:text(jobId),
    package:{
      state,
      version:text(packageVersion),
      sha256:text(packageSha256),
      byteLength:Number.isSafeInteger(Number(packageByteLength)) ? Number(packageByteLength) : null,
      region:text(region),
    },
    lastOpenedAt:timestamp(lastOpenedAt),
    pickup:point(pickup, shareCoordinates === true),
    dropoff:point(dropoff, shareCoordinates === true),
    coordinatesShared:shareCoordinates === true,
  });
}

export function createMapEvidenceBridge({ now = () => new Date().toISOString() } = {}) {
  if (typeof now !== 'function') throw new TypeError('MAP_EVIDENCE_CLOCK_REQUIRED');
  return Object.freeze({
    build({ job = {}, mapStatus = {}, includePreview = false, preview = null, consent = false, shareCoordinates = false } = {}) {
      if (includePreview === true && consent !== true) throw new Error(PREVIEW_CONSENT_REQUIRED);
      const evidence = createRideMapEvidence({
        ...mapStatus,
        jobId:mapStatus.jobId ?? job.recordId ?? job.jobId,
        pickup:mapStatus.pickup ?? job.pickup,
        dropoff:mapStatus.dropoff ?? job.dropoff,
        shareCoordinates,
      });
      return freeze({
        schemaVersion:MAP_EVIDENCE_SCHEMA,
        capturedAt:timestamp(now()) || new Date().toISOString(),
        evidence,
        preview:includePreview === true && consent === true ? text(preview) : null,
        previewShared:includePreview === true && consent === true && Boolean(text(preview)),
      });
    },
  });
}

export { OBSERVER_HEALTH_SCHEMA, MAP_EVIDENCE_SCHEMA, PREVIEW_CONSENT_REQUIRED };
