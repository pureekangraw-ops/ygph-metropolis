export const PRISM_SURFACES = Object.freeze(['HOME','WORK','HANDOFF','MONITOR','LAB']);

const clean = value => String(value ?? '').trim();

export function normalizeWork(item = {}) {
  return Object.freeze({
    workId: clean(item.workId) || 'UNKNOWN',
    checkpointId: clean(item.checkpointId) || '',
    title: clean(item.title) || 'งานไม่มีชื่อ',
    status: clean(item.status).toUpperCase() || 'UNKNOWN',
    holder: clean(item.holder) || null,
    route: Array.isArray(item.route) ? item.route.map(clean).filter(Boolean) : [],
    decision: item.decision && typeof item.decision === 'object' ? Object.freeze({
      kind: clean(item.decision.kind).toUpperCase() || 'UNKNOWN',
      summary: clean(item.decision.summary),
      consequence: clean(item.decision.consequence),
      authorityRequired: clean(item.decision.authorityRequired) || null,
    }) : null,
    evidence: Array.isArray(item.evidence) ? item.evidence.filter(Boolean) : [],
    updatedAt: clean(item.updatedAt) || null,
  });
}

export function buildPrismHome(snapshot = {}) {
  const works = Array.isArray(snapshot.works) ? snapshot.works.map(normalizeWork) : [];
  const decisions = works.filter(work => work.decision && work.decision.kind !== 'NONE');
  const active = works.filter(work => !['COMPLETE','CANCEL'].includes(work.status));
  return Object.freeze({
    decisions,
    active,
    monitorStatus: clean(snapshot.monitorStatus).toUpperCase() || 'UNKNOWN',
    live: snapshot.live === true,
  });
}

export function buildHandoff({
  workId,
  checkpointId,
  destination,
  requestedResult,
  message,
  attachments = [],
} = {}) {
  const envelope = {
    schemaVersion: 'prism-handoff-v1',
    workId: clean(workId),
    checkpointId: clean(checkpointId),
    destination: clean(destination).toUpperCase(),
    requestedResult: clean(requestedResult),
    message: clean(message),
    attachments: Array.isArray(attachments) ? attachments.filter(Boolean) : [],
  };
  const missing = Object.entries(envelope)
    .filter(([key,value]) => ['workId','checkpointId','destination','requestedResult'].includes(key) && !value)
    .map(([key]) => key);
  return Object.freeze({
    ...envelope,
    ready: missing.length === 0,
    missing: Object.freeze(missing),
  });
}

export function resolveDispatchRoute(capabilities = {}, preferred = []) {
  const ordered = preferred.length ? preferred : ['COUNTER','DIRECT_API','DEVICE_BRIDGE'];
  for (const route of ordered) {
    const key = String(route).toUpperCase();
    if (capabilities[key] === true) return Object.freeze({ route:key, fallback:false });
  }
  return Object.freeze({ route:'MANUAL', fallback:true });
}

export function decisionLabel(kind) {
  const labels = {
    MERGE_APPROVAL:'รออนุมัติ Merge',
    OWNER_DECISION:'ต้องตัดสินใจ',
    BLOCKER:'ติด Blocker',
    VERIFY:'รอตรวจ',
  };
  return labels[String(kind || '').toUpperCase()] || 'ต้องตรวจสอบ';
}
