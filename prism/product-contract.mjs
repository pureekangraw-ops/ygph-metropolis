import { buildPrismHome, summarizeProjects } from './spectrum.mjs';

export const PRISM_PRODUCT_SCHEMA = 'prism-product-spec-v1';

export const PRISM_BOUNDARIES = Object.freeze({
  PRISM: 'OWNER_INTERFACE_AND_WORK_RUNTIME',
  GO_HUB: 'COORDINATION_AND_BACKEND_ORCHESTRATION',
  FACTORY: 'PRODUCTION_AND_MUTATION',
  LIGHT: 'WORK_INTELLIGENCE_AND_NOTION',
  FACTORY_EYE: 'OBSERVATION',
  LEDGER: 'FINANCIAL_TRUTH',
  GATE: 'COMPLETED_WORK_HISTORY_AND_RECALL',
});

export const PRISM_PRODUCT_LAWS = Object.freeze([
  'UNKNOWN_IS_NOT_WRONG',
  'DO_IS_NOT_DONE',
  'REQUEST_IS_NOT_RESULT',
  'RESULT_IS_NOT_VERIFIED',
  'NO_SELF_AUTHORED_WORK_WITHOUT_EXTERNAL_OUTPUT',
]);

export const PRISM_PRIVACY_BOUNDARY = Object.freeze({
  excluded: Object.freeze(['PASSWORDS', 'SECRET_INPUT_VALUES', 'RAW_PRIVATE_DATA', 'OUT_OF_SCOPE_PAGES']),
  observerScope: 'MINIMUM_STATE_AND_EVIDENCE_REQUIRED_FOR_PRISM_WORK',
});

const OBSERVER_STATES = new Set(['LIVE', 'BACKGROUND', 'STALE', 'OFFLINE']);
const RELEASE_STATES = new Set(['DONE', 'WAIT VERIFY', 'UNKNOWN']);
const clean = value => String(value ?? '').trim();

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freeze(nested);
  return Object.freeze(value);
}

function safeCount(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

export function normalizeObserverState(input = {}) {
  const rawStatus = clean(input.status).toUpperCase();
  const status = OBSERVER_STATES.has(rawStatus) ? rawStatus : 'UNKNOWN';
  return freeze({
    status,
    active: status === 'LIVE' || status === 'BACKGROUND',
    live: status === 'LIVE',
    heartbeatAt: clean(input.heartbeatAt) || null,
    activeTab: clean(input.activeTab) || null,
    tabCount: safeCount(input.tabCount),
    sessionState: clean(input.sessionState).toUpperCase() || 'UNKNOWN',
    unknowns: Array.isArray(input.unknowns) ? input.unknowns.map(clean).filter(Boolean) : [],
  });
}

export function normalizeEvidenceState(evidence, observerStatus = 'UNKNOWN') {
  const observer = clean(observerStatus).toUpperCase();
  let status = 'UNKNOWN';
  let reason = 'EVIDENCE_NOT_AVAILABLE';
  if (observer === 'OFFLINE') {
    status = 'OFFLINE';
    reason = 'OBSERVER_OFFLINE';
  } else if (observer === 'STALE') {
    status = 'STALE';
    reason = 'OBSERVER_STALE';
  } else if (evidence && typeof evidence === 'object') {
    status = 'PRESENT';
    reason = 'EVIDENCE_PRESENT_WITHOUT_VERIFIED_RESULT';
  }
  return freeze({
    status,
    reason,
    sourceUrl: clean(evidence?.url || evidence?.sourceUrl) || null,
    capturedAt: clean(evidence?.capturedAt) || null,
    verified: evidence?.verified === true,
    schemaVersion: clean(evidence?.schemaVersion) || null,
  });
}

function normalizeRelease(release = {}) {
  const implementation = RELEASE_STATES.has(clean(release.implementation).toUpperCase())
    ? clean(release.implementation).toUpperCase()
    : 'UNKNOWN';
  const ci = RELEASE_STATES.has(clean(release.ci).toUpperCase())
    ? clean(release.ci).toUpperCase()
    : 'UNKNOWN';
  const physicalAcceptance = RELEASE_STATES.has(clean(release.physicalAcceptance).toUpperCase())
    ? clean(release.physicalAcceptance).toUpperCase()
    : 'UNKNOWN';
  return freeze({
    implementation,
    ci,
    physicalAcceptance,
    merge: clean(release.merge).toUpperCase() || 'NOT_REQUESTED',
    artifact: clean(release.artifact) || null,
  });
}

function normalizeDispatch(input = {}) {
  const selected = input.route && typeof input.route === 'object'
    ? input.route
    : null;
  const route = clean(selected?.route || input.routeName).toUpperCase() || 'UNKNOWN';
  const fallback = selected?.fallback === true || route === 'MANUAL';
  return freeze({
    route,
    fallback,
    routeSelected: route !== 'UNKNOWN',
    dispatchable: route !== 'UNKNOWN' && !fallback,
    outcome: route === 'UNKNOWN' ? 'UNKNOWN' : fallback ? 'MANUAL_REQUIRED' : 'ROUTE_SELECTED',
    executed: input.executed === true,
    verified: input.verified === true,
  });
}

export function buildPrismProductSnapshot(snapshot = {}) {
  const home = buildPrismHome(snapshot);
  const observer = normalizeObserverState(snapshot.observer || snapshot.observerState);
  const evidence = normalizeEvidenceState(snapshot.browserEvidence || snapshot.evidence, observer.status);
  const dispatch = normalizeDispatch(snapshot.dispatch || {
    route: snapshot.route,
    routeName: snapshot.routeName,
    executed: snapshot.executed,
    verified: snapshot.verified,
  });
  const projects = summarizeProjects(snapshot);
  const decisions = home.decisions.map(work => Object.freeze({
    workId: work.workId,
    checkpointId: work.checkpointId,
    title: work.title,
    kind: work.decision?.kind || 'UNKNOWN',
    summary: work.decision?.summary || '',
    status: work.status,
  }));

  return freeze({
    schemaVersion: PRISM_PRODUCT_SCHEMA,
    projection: Object.freeze({
      readOnly: true,
      sourceOfTruth: 'UPSTREAM_WORK_AND_DOMAIN_SYSTEMS',
    }),
    surfaces: Object.freeze(['COPILOT', 'PROJECTS', 'HANDOFF', 'MAP', 'LEDGER', 'MONITOR']),
    boundaries: PRISM_BOUNDARIES,
    laws: PRISM_PRODUCT_LAWS,
    privacy: PRISM_PRIVACY_BOUNDARY,
    home,
    projects,
    decisions,
    dispatch,
    observer,
    evidence,
    release: normalizeRelease(snapshot.release),
    unknowns: Array.isArray(snapshot.unknowns) ? snapshot.unknowns.map(clean).filter(Boolean) : [],
  });
}
