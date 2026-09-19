export const PROJECT_STATUS_ENVELOPE_VERSION = 1;
export const PROJECT_STATUS_SOURCES = Object.freeze(['github','board','factory','lighthouse','drive']);
export const PROJECT_STATUS_COMMON_STATUSES = Object.freeze(['IDLE','ACTIVE','VERIFY','BLOCKED','DONE']);
export const PROJECT_STATUS_FRESHNESS = Object.freeze(['LIVE','STALE','OFFLINE','UNKNOWN']);

const SOURCE_SET = new Set(PROJECT_STATUS_SOURCES);
const STATUS_SET = new Set(PROJECT_STATUS_COMMON_STATUSES);
const FRESHNESS_SET = new Set(PROJECT_STATUS_FRESHNESS);

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function requiredText(value, code) {
  const output = String(value ?? '').trim();
  if (!output) throw new Error(code);
  return output;
}

function optionalText(value) {
  const output = String(value ?? '').trim();
  return output || null;
}

export function createProjectStatusEnvelope(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('PROJECT_STATUS_ENVELOPE_INVALID');
  const source = requiredText(input.source, 'PROJECT_STATUS_SOURCE_REQUIRED').toLowerCase();
  if (!SOURCE_SET.has(source)) throw new Error('PROJECT_STATUS_SOURCE_INVALID');
  const status = requiredText(input.status, 'PROJECT_STATUS_STATUS_REQUIRED').toUpperCase();
  if (!STATUS_SET.has(status)) throw new Error('PROJECT_STATUS_STATUS_INVALID');
  const freshness = String(input.freshness ?? 'UNKNOWN').trim().toUpperCase();
  if (!FRESHNESS_SET.has(freshness)) throw new Error('PROJECT_STATUS_FRESHNESS_INVALID');
  const detail = input.detail == null ? null : clone(input.detail);
  if (detail != null && (!detail || typeof detail !== 'object' || Array.isArray(detail))) {
    throw new Error('PROJECT_STATUS_DETAIL_INVALID');
  }
  return deepFreeze({
    envelopeVersion:PROJECT_STATUS_ENVELOPE_VERSION,
    projectId:requiredText(input.projectId, 'PROJECT_STATUS_PROJECT_ID_REQUIRED'),
    source,
    status,
    sourceStatus:optionalText(input.sourceStatus),
    title:optionalText(input.title) || source.toUpperCase(),
    summary:optionalText(input.summary),
    sourceRef:optionalText(input.sourceRef),
    updatedAt:optionalText(input.updatedAt),
    freshness,
    detail,
  });
}

function commonStatus({ boardState, circulationState, routeMode } = {}) {
  const pins = Array.isArray(boardState?.pins) ? boardState.pins : [];
  if (routeMode === 'EMERGENCY' || pins.some(pin => pin?.status === 'PENDING_RECOVERY')) return 'BLOCKED';
  if (pins.some(pin => pin?.status === 'VERIFY')) return 'VERIFY';
  const activeTickets = circulationState?.active && typeof circulationState.active === 'object'
    ? Object.keys(circulationState.active).length
    : 0;
  if (activeTickets > 0 || pins.some(pin => ['OPEN','DOING','REOPENED'].includes(String(pin?.status || '')))) return 'ACTIVE';
  if (pins.length > 0 && pins.every(pin => pin?.status === 'ARCHIVED')) return 'DONE';
  return 'IDLE';
}

export function createProjectStatusProjection({
  projectId = 'LIGHTHOUSE',
  buildIdentity = null,
  boardState = null,
  circulationState = null,
  hubStatus = {},
  snapshotStatus = {},
  routeMode = 'UNKNOWN',
  extraSources = [],
} = {}) {
  const status = commonStatus({ boardState, circulationState, routeMode });
  const sources = [];

  if (buildIdentity) {
    sources.push(createProjectStatusEnvelope({
      projectId,
      source:'github',
      status,
      sourceStatus:'SOURCE_COMMIT',
      title:'GitHub',
      summary:optionalText(buildIdentity.versionName),
      sourceRef:optionalText(buildIdentity.sourceCommit),
      updatedAt:null,
      freshness:'UNKNOWN',
      detail:{
        repo:optionalText(buildIdentity.sourceRepository),
        branch:optionalText(buildIdentity.sourceRef),
        sha:optionalText(buildIdentity.sourceCommit),
        versionName:optionalText(buildIdentity.versionName),
        versionCode:Number.isSafeInteger(Number(buildIdentity.versionCode)) ? Number(buildIdentity.versionCode) : null,
      },
    }));
  }

  if (boardState) {
    const pins = Array.isArray(boardState.pins) ? boardState.pins : [];
    const current = [...pins].filter(pin => pin?.status !== 'ARCHIVED').sort((a,b) =>
      String(b?.updatedAt || '').localeCompare(String(a?.updatedAt || '')),
    )[0] || null;
    sources.push(createProjectStatusEnvelope({
      projectId,
      source:'board',
      status,
      sourceStatus:optionalText(current?.status) || (pins.length ? 'READY' : 'EMPTY'),
      title:'Centre Board',
      summary:optionalText(current?.title),
      sourceRef:optionalText(boardState.boardId),
      updatedAt:optionalText(boardState.updatedAt),
      freshness:snapshotStatus?.freshness || 'UNKNOWN',
      detail:{
        boardId:optionalText(boardState.boardId),
        workId:optionalText(boardState.workId),
        pinId:optionalText(current?.pinId),
        employeeId:optionalText(current?.ownerEmployeeId),
        revision:Number.isSafeInteger(Number(boardState.revision)) ? Number(boardState.revision) : null,
        nextAction:optionalText(current?.nextAction),
      },
    }));
  }

  const tickets = circulationState?.active && typeof circulationState.active === 'object'
    ? Object.values(circulationState.active)
    : [];
  const ticket = tickets.find(item => item?.status === 'RECOVERY') || tickets[0] || null;
  sources.push(createProjectStatusEnvelope({
    projectId,
    source:'lighthouse',
    status,
    sourceStatus:optionalText(ticket?.status) || routeMode || 'IDLE',
    title:'LIGHTHOUSE',
    summary:ticket ? 'กำลังหมุนงาน' : 'พร้อมรับงาน',
    sourceRef:optionalText(ticket?.ticketId),
    updatedAt:optionalText(ticket?.updatedAt ?? circulationState?.updatedAt ?? snapshotStatus?.updatedAt),
    freshness:snapshotStatus?.freshness || 'UNKNOWN',
    detail:ticket ? {
      workingTicket:optionalText(ticket.ticketId),
      circulation:optionalText(ticket.status),
      workId:optionalText(ticket.workId),
      employeeId:optionalText(ticket.employeeId),
      pinIds:Array.isArray(ticket.pinIds) ? [...ticket.pinIds] : [],
      boardRevision:Number.isSafeInteger(Number(ticket.boardRevision)) ? Number(ticket.boardRevision) : null,
      blocker:optionalText(hubStatus?.error?.message ?? hubStatus?.error),
    } : null,
  }));

  for (const source of Array.isArray(extraSources) ? extraSources : []) {
    sources.push(createProjectStatusEnvelope({ projectId, ...clone(source) }));
  }

  return deepFreeze({
    projectId,
    status,
    updatedAt:optionalText(snapshotStatus?.updatedAt ?? boardState?.updatedAt ?? circulationState?.updatedAt),
    sources,
  });
}
