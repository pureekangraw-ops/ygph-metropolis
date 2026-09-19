const TERMINAL = new Set(['COMPLETE','CANCELLED']);

function optionalText(value) {
  const output = String(value ?? '').trim();
  return output || null;
}

function routeMode({ hubStatus = {}, runtimeState = {}, snapshotStatus = {}, emergencyCount = 0 } = {}) {
  const pairing = optionalText(hubStatus?.pairing?.status);
  const realtime = optionalText(hubStatus?.realtime?.status);
  const transport = optionalText(hubStatus?.report?.transport);
  const nextAction = optionalText(runtimeState?.work?.nextAction);
  const inbox = Object.values(runtimeState?.inbox || {});
  const pending = inbox.some(entry => !TERMINAL.has(String(entry?.status || '')));
  const recovering = nextAction === 'VERIFY_READBACK'
    || nextAction === 'RETRY_WHEN_RUNTIME_AVAILABLE'
    || nextAction === 'REVIEW_ERROR'
    || nextAction === 'REQUIRES_ALLOWED_CAPABILITY';

  if (emergencyCount > 0 || (transport === 'OFFLINE' && pending)) return 'EMERGENCY';
  if (realtime === 'LIVE') return 'LIVE';
  if (realtime === 'CONNECTING' || realtime === 'RECONNECT_WAIT' || recovering) return 'RECOVERY';
  if (transport === 'ONLINE' || pairing === 'PAIRED') {
    return snapshotStatus?.freshness === 'OFFLINE' ? 'RECOVERY' : 'FALLBACK';
  }
  if (pairing === 'EXPIRED') return 'EMERGENCY';
  if (pairing === 'UNPAIRED') return 'OFFLINE';
  return 'UNKNOWN';
}

function pinView(pin = {}) {
  return Object.freeze({
    pinId:optionalText(pin.pinId),
    workId:optionalText(pin.workId),
    title:optionalText(pin.title) || 'Centre Board Pin',
    detail:optionalText(pin.detail),
    status:optionalText(pin.status) || 'UNKNOWN',
    ownerEmployeeId:optionalText(pin.ownerEmployeeId),
    touchedBy:Object.freeze(Array.isArray(pin.touchedBy) ? [...pin.touchedBy] : []),
    result:optionalText(pin.result),
    nextAction:optionalText(pin.nextAction),
    revision:Number.isSafeInteger(Number(pin.revision)) ? Number(pin.revision) : null,
    updatedAt:optionalText(pin.updatedAt),
  });
}

export function createGoBoardView({
  hubStatus = {},
  runtimeState = {},
  snapshotStatus = {},
  board = null,
  emergencyCapsules = [],
} = {}) {
  const inbox = Object.values(runtimeState?.inbox || {});
  const outbox = Object.values(runtimeState?.outbox || {});
  const pending = inbox.filter(entry => !TERMINAL.has(String(entry?.status || '')));
  const confirmations = inbox.filter(entry => entry?.status === 'CONFIRMATION_REQUIRED');
  const recovery = inbox.filter(entry => ['BLOCKED','ERROR','READBACK'].includes(String(entry?.status || '')));
  const pins = Object.freeze(Array.isArray(board?.pins) ? board.pins.map(pinView) : []);
  const activePins = pins.filter(pin => pin.status !== 'ARCHIVED');
  const currentPin = activePins.find(pin => pin.status === 'DOING')
    || activePins.find(pin => pin.status === 'VERIFY' || pin.status === 'PENDING_RECOVERY')
    || activePins[0]
    || null;
  const work = runtimeState?.work && typeof runtimeState.work === 'object' ? runtimeState.work : {};

  return Object.freeze({
    route:Object.freeze({
      mode:routeMode({
        hubStatus,
        runtimeState,
        snapshotStatus,
        emergencyCount:Array.isArray(emergencyCapsules) ? emergencyCapsules.length : 0,
      }),
      pairing:optionalText(hubStatus?.pairing?.status) || 'UNKNOWN',
      realtime:optionalText(hubStatus?.realtime?.status) || 'UNKNOWN',
      transport:optionalText(hubStatus?.report?.transport) || 'UNKNOWN',
      retryInMs:Number.isFinite(Number(hubStatus?.realtime?.retryInMs))
        ? Number(hubStatus.realtime.retryInMs)
        : null,
      error:optionalText(hubStatus?.error?.message ?? hubStatus?.error ?? hubStatus?.realtime?.reason),
    }),
    truth:Object.freeze({
      freshness:optionalText(snapshotStatus?.freshness) || 'UNKNOWN',
      runtimeRevision:Number.isSafeInteger(Number(snapshotStatus?.revision)) ? Number(snapshotStatus.revision) : null,
      runtimeUpdatedAt:optionalText(snapshotStatus?.updatedAt),
      boardRevision:Number.isSafeInteger(Number(board?.revision)) ? Number(board.revision) : null,
      boardUpdatedAt:optionalText(board?.updatedAt),
      boardId:optionalText(board?.boardId),
      workId:optionalText(board?.workId),
    }),
    work:Object.freeze({
      workId:optionalText(board?.workId),
      employeeId:currentPin?.ownerEmployeeId || null,
      pinId:currentPin?.pinId || null,
      pinStatus:currentPin?.status || null,
      nextAction:currentPin?.nextAction || optionalText(work.nextAction) || 'WAITING_COMMAND',
      pendingRequestId:optionalText(work.pendingRequestId),
      blocker:optionalText(work.blocker),
      lastSuccessfulReadback:work.lastSuccessfulReadback || null,
    }),
    board:Object.freeze({
      available:Boolean(board),
      pins,
      activePins:Object.freeze(activePins),
    }),
    queue:Object.freeze({
      pending:pending.length,
      confirmations:confirmations.length,
      recovery:recovery.length,
      receipts:outbox.length,
      pendingItems:Object.freeze(pending.map(entry => Object.freeze({
        requestId:optionalText(entry.requestId),
        capabilityId:optionalText(entry.capabilityId),
        status:optionalText(entry.status) || 'UNKNOWN',
        owner:optionalText(entry.owner),
        updatedAt:optionalText(entry.updatedAt ?? entry.receivedAt),
      }))),
    }),
    emergency:Object.freeze({
      count:Array.isArray(emergencyCapsules) ? emergencyCapsules.length : 0,
      items:Object.freeze((Array.isArray(emergencyCapsules) ? emergencyCapsules : []).map(item => Object.freeze({
        capsuleId:optionalText(item.capsuleId),
        workId:optionalText(item.workId),
        employeeId:optionalText(item.employeeId),
        reason:optionalText(item.reason),
        baseBoardRevision:Number.isSafeInteger(Number(item.baseBoardRevision))
          ? Number(item.baseBoardRevision)
          : null,
        status:optionalText(item.status) || 'PENDING_RECOVERY',
        at:optionalText(item.at),
      }))),
    }),
  });
}
