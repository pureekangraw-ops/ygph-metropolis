function clone(value) { return JSON.parse(JSON.stringify(value)); }

export function appendChatEvent(document, event) {
  if (!document || !Array.isArray(document.events)) throw new Error('CHAT_DOCUMENT_INVALID');
  if (!event?.id || !event?.messageId) throw new Error('CHAT_EVENT_INVALID');
  if (document.events.some(item => item.id === event.id)) return clone(document);
  const next = clone(document);
  next.events.push(clone(event));
  const message = next.messages?.find(item => item.id === event.messageId);
  if (message) {
    if (event.executionState) message.executionState = event.executionState;
    if (event.syncState) message.syncState = event.syncState;
  }
  const work = next.work?.find(item => item.id === event.workId);
  if (work && event.executionState) work.status = event.executionState;
  return next;
}

export function deriveChatSnapshot(document, messageId) {
  const message = document?.messages?.find(item => item.id === messageId);
  if (!message) return null;
  const events = (document.events || []).filter(event => event.messageId === messageId);
  const latest = events.at(-1) || null;
  return Object.freeze({
    messageId,
    executionState:latest?.executionState || message.executionState || null,
    syncState:latest?.syncState || message.syncState || null,
    latestEventId:latest?.id || null,
  });
}

export function meaningfulChange(previous, next) {
  if (!next) return false;
  if (!previous) return true;
  return previous.executionState !== next.executionState || previous.syncState !== next.syncState;
}
