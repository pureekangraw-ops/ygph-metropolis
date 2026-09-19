const TERMINAL_INBOX = new Set(['COMPLETE','CANCELLED']);

function text(value) {
  const output = String(value ?? '').trim();
  return output || null;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function boardRecords(boardState) {
  if (!boardState || typeof boardState !== 'object' || Array.isArray(boardState)) return [];
  if (Array.isArray(boardState.cards)) return boardState.cards;
  if (Array.isArray(boardState.pins)) return boardState.pins;
  return [];
}

function normalizeBoardCard(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.freeze({
    workId:text(source.workId),
    employeeId:text(source.employeeId),
    owner:text(source.owner ?? source.ownerId),
    title:text(source.title ?? source.task ?? source.name) || 'งานบน Centre Board',
    status:text(source.status ?? source.phase) || 'UNKNOWN',
    phase:text(source.phase),
    checkpointId:text(source.checkpointId),
    returnAddress:text(source.returnAddress),
    updatedAt:text(source.updatedAt ?? source.observedAt),
  });
}

function routeMode({ hubStatus = {}, runtimeState = {}, snapshotStatus = {} } = {}) {
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

function firstActiveBoardWork(boardState, cards) {
  const explicit = boardState && typeof boardState === 'object' && !Array.isArray(boardState)
    ? (boardState.activeWork || boardState.work || null)
    : null;
  if (explicit && typeof explicit === 'object' && !Array.isArray(explicit)) return explicit;
  return cards.find(card => !['COMPLETED','CANCELLED','SUPERSEDED','RETURNED'].includes(String(card.status || '').toUpperCase())) || null;
}

export function createGoBoardView({
  hubStatus = {},
  runtimeState = {},
  snapshotStatus = {},
  boardState = null,
} = {}) {
  const inbox = Object.values(runtimeState?.inbox || {});
  const outbox = Object.values(runtimeState?.outbox || {});
  const cards = Object.freeze(boardRecords(boardState).map(normalizeBoardCard));
  const activeBoardWork = firstActiveBoardWork(boardState, cards);
  const work = runtimeState?.work && typeof runtimeState.work === 'object' ? runtimeState.work : {};
  const pending = inbox.filter(entry => !TERMINAL_INBOX.has(String(entry?.status || '')));
  const confirmations = inbox.filter(entry => entry?.status === 'CONFIRMATION_REQUIRED');
  const recoveryItems = inbox.filter(entry => ['BLOCKED','ERROR','READBACK'].includes(String(entry?.status || '')));
  const latestReceipt = outbox.length ? outbox[outbox.length - 1] : null;

  return Object.freeze({
    route:Object.freeze({
      mode:routeMode({ hubStatus, runtimeState, snapshotStatus }),
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
      workId:text(activeBoardWork?.workId),
      employeeId:text(activeBoardWork?.employeeId),
      owner:text(activeBoardWork?.owner ?? activeBoardWork?.ownerId),
      phase:text(activeBoardWork?.phase ?? activeBoardWork?.status),
      checkpointId:text(activeBoardWork?.checkpointId),
      returnAddress:text(activeBoardWork?.returnAddress),
      pendingRequestId:text(work.pendingRequestId),
      blocker:text(work.blocker),
      nextAction:text(work.nextAction) || 'WAITING_COMMAND',
      lastSuccessfulReadback:work.lastSuccessfulReadback || null,
    }),
    queue:Object.freeze({
      total:inbox.length,
      pending:pending.length,
      confirmations:confirmations.length,
      recovery:recoveryItems.length,
      receipts:outbox.length,
      latestReceipt:latestReceipt ? Object.freeze({
        requestId:text(latestReceipt.requestId),
        capabilityId:text(latestReceipt.capabilityId),
        status:text(latestReceipt.status),
        updatedAt:text(latestReceipt.updatedAt),
        reason:text(latestReceipt.reason),
      }) : null,
      pendingItems:Object.freeze(pending.map(entry => Object.freeze({
        requestId:text(entry.requestId),
        capabilityId:text(entry.capabilityId),
        status:text(entry.status) || 'UNKNOWN',
        owner:text(entry.owner),
        updatedAt:text(entry.updatedAt ?? entry.receivedAt),
      }))),
    }),
    board:Object.freeze({
      available:cards.length > 0 || Boolean(activeBoardWork),
      revision:numberOrNull(boardState?.revision),
      updatedAt:text(boardState?.updatedAt),
      cards,
    }),
  });
}
