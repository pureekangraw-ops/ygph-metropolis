const TERMINAL_INBOX = new Set(['COMPLETE','CANCELLED']);
const ACTIVE_PIN_PRIORITY = new Map([
  ['PENDING_RECOVERY', 0],
  ['VERIFY', 1],
  ['DOING', 2],
  ['REOPENED', 3],
  ['OPEN', 4],
  ['ARCHIVED', 9],
]);

function text(value) {
  const output = String(value ?? '').trim();
  return output || null;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizePin(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.freeze({
    pinId:text(source.pinId),
    workId:text(source.workId),
    employeeId:text(source.ownerEmployeeId),
    ownerEmployeeId:text(source.ownerEmployeeId),
    title:text(source.title) || 'Centre Board Pin',
    detail:text(source.detail),
    status:text(source.status) || 'UNKNOWN',
    result:text(source.result),
    nextAction:text(source.nextAction),
    revision:numberOrNull(source.revision),
    touchedBy:Object.freeze(Array.isArray(source.touchedBy) ? source.touchedBy.map(text).filter(Boolean) : []),
    updatedAt:text(source.updatedAt),
  });
}

function activePin(pins) {
  return [...pins]
    .filter(pin => pin.status !== 'ARCHIVED')
    .sort((a, b) => {
      const pa = ACTIVE_PIN_PRIORITY.get(a.status) ?? 8;
      const pb = ACTIVE_PIN_PRIORITY.get(b.status) ?? 8;
      if (pa !== pb) return pa - pb;
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    })[0] || null;
}

function routeMode({ hubStatus = {}, runtimeState = {}, snapshotStatus = {}, emergencyCount = 0 } = {}) {
  const pairing = text(hubStatus?.pairing?.status);
  const realtime = text(hubStatus?.realtime?.status);
  const transport = text(hubStatus?.report?.transport);
  const nextAction = text(runtimeState?.work?.nextAction);
  const inbox = Object.values(runtimeState?.inbox || {});
  const hasPending = inbox.some(entry => !TERMINAL_INBOX.has(String(entry?.status || '')));
  const recovery = nextAction === 'VERIFY_READBACK' ||
    nextAction === 'RETRY_WHEN_RUNTIME_AVAILABLE' ||
    nextAction === 'REVIEW_ERROR' ||
    nextAction === 'REQUIRES_ALLOWED_CAPABILITY';

  if (emergencyCount > 0) return 'EMERGENCY';
  if (realtime === 'LIVE') return 'LIVE';
  if (realtime === 'CONNECTING' || realtime === 'RECONNECT_WAIT') return 'RECOVERY';
  if (recovery) return 'RECOVERY';
  if (transport === 'OFFLINE') return hasPending ? 'EMERGENCY' : 'OFFLINE';
  if (transport === 'ONLINE') return 'FALLBACK';
  if (pairing === 'EXPIRED') return 'EMERGENCY';
  if (pairing === 'PAIRED') return snapshotStatus?.freshness === 'OFFLINE' ? 'EMERGENCY' : 'FALLBACK';
  if (pairing === 'UNPAIRED') return 'OFFLINE';
  return 'UNKNOWN';
}

export function createGoBoardView({
  hubStatus = {},
  runtimeState = {},
  snapshotStatus = {},
  boardState = null,
  emergencyCapsules = [],
  circulationState = null,
} = {}) {
  const inbox = Object.values(runtimeState?.inbox || {});
  const outbox = Object.values(runtimeState?.outbox || {});
  const pins = Object.freeze(Array.isArray(boardState?.pins) ? boardState.pins.map(normalizePin) : []);
  const currentPin = activePin(pins);
  const work = runtimeState?.work && typeof runtimeState.work === 'object' ? runtimeState.work : {};
  const pending = inbox.filter(entry => !TERMINAL_INBOX.has(String(entry?.status || '')));
  const confirmations = inbox.filter(entry => entry?.status === 'CONFIRMATION_REQUIRED');
  const recoveryItems = inbox.filter(entry => ['BLOCKED','ERROR','READBACK'].includes(String(entry?.status || '')));
  const circulationTickets = Object.values(
    circulationState?.active && typeof circulationState.active === 'object' && !Array.isArray(circulationState.active)
      ? circulationState.active
      : {},
  );
  const circulationRecovery = circulationTickets.filter(ticket => ticket?.status === 'RECOVERY');
  const circulationTicket = circulationRecovery[0] || circulationTickets[0] || null;

  return Object.freeze({
    route:Object.freeze({
      mode:routeMode({
        hubStatus,
        runtimeState,
        snapshotStatus,
        emergencyCount:Array.isArray(emergencyCapsules) ? emergencyCapsules.length : 0,
      }),
      pairing:text(hubStatus?.pairing?.status) || 'UNKNOWN',
      realtime:text(hubStatus?.realtime?.status) || 'UNKNOWN',
      transport:text(hubStatus?.report?.transport) || 'UNKNOWN',
      retryInMs:numberOrNull(hubStatus?.realtime?.retryInMs),
      error:text(hubStatus?.error?.message ?? hubStatus?.error ?? hubStatus?.realtime?.reason),
    }),
    truth:Object.freeze({
      freshness:text(snapshotStatus?.freshness) || 'UNKNOWN',
      revision:numberOrNull(snapshotStatus?.revision),
      updatedAt:text(snapshotStatus?.updatedAt),
      capturedAt:text(snapshotStatus?.capturedAt),
      appVersion:text(snapshotStatus?.appVersion),
      mainSha:text(snapshotStatus?.mainSha),
    }),
    work:Object.freeze({
      boardId:text(boardState?.boardId),
      workId:text(boardState?.workId),
      employeeId:text(currentPin?.ownerEmployeeId),
      pinId:text(currentPin?.pinId),
      pinStatus:text(currentPin?.status),
      nextAction:text(currentPin?.nextAction) || text(work.nextAction) || 'WAITING_COMMAND',
      pendingRequestId:text(work.pendingRequestId),
      blocker:text(work.blocker),
      lastSuccessfulReadback:work.lastSuccessfulReadback || null,
    }),
    queue:Object.freeze({
      total:inbox.length,
      pending:pending.length,
      confirmations:confirmations.length,
      recovery:recoveryItems.length,
      receipts:outbox.length,
      pendingItems:Object.freeze(pending.map(entry => Object.freeze({
        requestId:text(entry.requestId),
        capabilityId:text(entry.capabilityId),
        status:text(entry.status) || 'UNKNOWN',
        owner:text(entry.owner),
        updatedAt:text(entry.updatedAt ?? entry.receivedAt),
      }))),
    }),
    circulation:Object.freeze({
      active:circulationTickets.length,
      recovery:circulationRecovery.length,
      status:circulationTicket?.status || 'IDLE',
      ticketId:text(circulationTicket?.ticketId),
      workId:text(circulationTicket?.workId),
      employeeId:text(circulationTicket?.employeeId),
      pinIds:Object.freeze(Array.isArray(circulationTicket?.pinIds) ? [...circulationTicket.pinIds] : []),
      boardRevision:numberOrNull(circulationTicket?.boardRevision),
      updatedAt:text(circulationTicket?.updatedAt ?? circulationState?.updatedAt),
      revision:numberOrNull(circulationState?.revision),
    }),
    board:Object.freeze({
      available:Boolean(boardState && pins.length >= 0 && text(boardState.boardId) && text(boardState.workId)),
      boardId:text(boardState?.boardId),
      workId:text(boardState?.workId),
      revision:numberOrNull(boardState?.revision),
      updatedAt:text(boardState?.updatedAt),
      total:pins.length,
      active:pins.filter(pin => pin.status !== 'ARCHIVED').length,
      doing:pins.filter(pin => pin.status === 'DOING').length,
      verify:pins.filter(pin => pin.status === 'VERIFY').length,
      recovery:pins.filter(pin => pin.status === 'PENDING_RECOVERY').length,
      pins,
    }),
    emergency:Object.freeze({
      count:Array.isArray(emergencyCapsules) ? emergencyCapsules.length : 0,
      items:Object.freeze((Array.isArray(emergencyCapsules) ? emergencyCapsules : []).map(capsule => Object.freeze({
        capsuleId:text(capsule?.capsuleId),
        workId:text(capsule?.workId),
        employeeId:text(capsule?.employeeId),
        reason:text(capsule?.reason),
        status:text(capsule?.status) || 'PENDING_RECOVERY',
        baseBoardRevision:numberOrNull(capsule?.baseBoardRevision),
        at:text(capsule?.at),
      }))),
    }),
  });
}
