export const CHAT_EXECUTION_STATES = Object.freeze([
  'LOCAL',
  'WAITING',
  'CONFIRMATION_REQUIRED',
  'SUCCESS',
  'BLOCKED',
  'ERROR',
  'CANCELLED',
]);

export const CHAT_READBACK_STATES = Object.freeze([
  'IDLE',
  'PENDING',
  'VERIFIED',
  'ERROR',
]);

const DEFAULT_KEY = 'lighthouse-next-chat-lifecycle-v1';
const MAX_MESSAGES = 120;
const MAX_EVENTS = 1200;
const MAX_CHANGES = 400;

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function emptyEnvelope() {
  return {
    version:1,
    conversationId:'owner',
    messages:{},
    events:[],
    changes:[],
  };
}

function text(value, code) {
  const output = String(value ?? '').trim();
  if (!output) throw new Error(code);
  return output;
}

function validExecutionState(value) {
  if (!CHAT_EXECUTION_STATES.includes(value)) throw new Error('CHAT_EXECUTION_STATE_INVALID');
  return value;
}

function validReadbackState(value) {
  if (!CHAT_READBACK_STATES.includes(value)) throw new Error('CHAT_READBACK_STATE_INVALID');
  return value;
}

function safeParse(raw) {
  if (!raw) return emptyEnvelope();
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || typeof parsed.messages !== 'object' || !Array.isArray(parsed.events) || !Array.isArray(parsed.changes)) {
      return emptyEnvelope();
    }
    return parsed;
  } catch {
    return emptyEnvelope();
  }
}

function stableComparable(value) {
  return JSON.stringify(value ?? null);
}

function meaningful(before, after) {
  if (!before) return true;
  return before.executionState !== after.executionState ||
    before.readbackState !== after.readbackState ||
    before.requestId !== after.requestId ||
    stableComparable(before.result) !== stableComparable(after.result) ||
    before.error !== after.error;
}

function compact(envelope) {
  const ids = Object.values(envelope.messages)
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))
    .slice(0, MAX_MESSAGES)
    .map(message => message.id);
  const keep = new Set(ids);
  envelope.messages = Object.fromEntries(ids.map(id => [id, envelope.messages[id]]).filter(([, value]) => value));
  envelope.events = envelope.events.filter(event => keep.has(event.messageId)).slice(-MAX_EVENTS);
  envelope.changes = envelope.changes.filter(change => keep.has(change.messageId)).slice(-MAX_CHANGES);
  return envelope;
}

export function createChatLifecycle({
  storage = globalThis.localStorage,
  key = DEFAULT_KEY,
  now = () => new Date().toISOString(),
} = {}) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    throw new TypeError('CHAT_LIFECYCLE_STORAGE_REQUIRED');
  }

  function read() {
    return safeParse(storage.getItem(key));
  }

  function write(envelope) {
    const compacted = compact(envelope);
    storage.setItem(key, JSON.stringify(compacted));
    return compacted;
  }

  function commitMessage({ id, body, role = 'user', createdAt = now(), requestId = null } = {}) {
    const messageId = text(id, 'CHAT_MESSAGE_ID_REQUIRED');
    const content = text(body, 'CHAT_MESSAGE_BODY_REQUIRED');
    const envelope = read();
    if (envelope.messages[messageId]) return clone(envelope.messages[messageId]);

    const message = {
      id:messageId,
      conversationId:envelope.conversationId,
      body:content,
      role:String(role || 'user'),
      createdAt:String(createdAt),
      updatedAt:String(createdAt),
      executionState:'LOCAL',
      readbackState:'IDLE',
      requestId:requestId == null ? null : String(requestId),
      result:null,
      error:null,
    };
    envelope.messages[messageId] = message;
    const event = {
      id:`${messageId}:event:${envelope.events.length + 1}`,
      messageId,
      type:'MESSAGE_COMMITTED',
      at:String(createdAt),
      executionState:'LOCAL',
      readbackState:'IDLE',
    };
    envelope.events.push(event);
    envelope.changes.push({
      id:`${messageId}:change:${envelope.changes.length + 1}`,
      messageId,
      at:String(createdAt),
      eventType:'MESSAGE_COMMITTED',
      from:null,
      to:{ executionState:'LOCAL', readbackState:'IDLE', requestId:message.requestId, result:null, error:null },
    });
    write(envelope);
    return clone(message);
  }

  function transition(messageIdInput, {
    executionState,
    readbackState,
    requestId,
    result,
    error,
    eventType = 'STATE_UPDATED',
  } = {}) {
    const messageId = text(messageIdInput, 'CHAT_MESSAGE_ID_REQUIRED');
    const envelope = read();
    const current = envelope.messages[messageId];
    if (!current) throw new Error('CHAT_MESSAGE_NOT_FOUND');

    const before = clone(current);
    const next = {
      ...current,
      executionState:executionState === undefined ? current.executionState : validExecutionState(executionState),
      readbackState:readbackState === undefined ? current.readbackState : validReadbackState(readbackState),
      requestId:requestId === undefined ? current.requestId : requestId == null ? null : String(requestId),
      result:result === undefined ? current.result : clone(result),
      error:error === undefined ? current.error : error == null ? null : String(error),
      updatedAt:String(now()),
    };
    envelope.messages[messageId] = next;
    envelope.events.push({
      id:`${messageId}:event:${envelope.events.length + 1}`,
      messageId,
      type:text(eventType, 'CHAT_EVENT_TYPE_REQUIRED'),
      at:next.updatedAt,
      executionState:next.executionState,
      readbackState:next.readbackState,
      requestId:next.requestId,
      result:clone(next.result),
      error:next.error,
    });

    if (meaningful(before, next)) {
      envelope.changes.push({
        id:`${messageId}:change:${envelope.changes.length + 1}`,
        messageId,
        at:next.updatedAt,
        eventType:String(eventType),
        from:{
          executionState:before.executionState,
          readbackState:before.readbackState,
          requestId:before.requestId,
          result:clone(before.result),
          error:before.error,
        },
        to:{
          executionState:next.executionState,
          readbackState:next.readbackState,
          requestId:next.requestId,
          result:clone(next.result),
          error:next.error,
        },
      });
    }
    write(envelope);
    return clone(next);
  }

  function getMessage(messageId) {
    return clone(read().messages[String(messageId)] ?? null);
  }

  function getEvents(messageId) {
    const id = String(messageId);
    return clone(read().events.filter(event => event.messageId === id));
  }

  function getChanges(messageId) {
    const id = String(messageId);
    return clone(read().changes.filter(change => change.messageId === id));
  }

  function snapshot() {
    return clone(read());
  }

  function clear() {
    storage.removeItem?.(key);
  }

  return Object.freeze({ commitMessage, transition, getMessage, getEvents, getChanges, snapshot, clear });
}
