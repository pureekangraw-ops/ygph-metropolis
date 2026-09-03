const DEFAULT_KEY = 'lighthouse.chat.v2';

function defaultIdFactory(prefix) {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function defaultStorage() {
  if (!globalThis.localStorage) throw new Error('CHAT_STORAGE_REQUIRED');
  return globalThis.localStorage;
}

function emptyDocument(conversationId, now) {
  return {
    schemaVersion:1,
    conversation:{ id:conversationId, createdAt:now, updatedAt:now, archived:false },
    messages:[],
    drafts:[],
    work:[],
    events:[],
    changeMarkers:{},
    submitTokens:{},
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createChatStore({ storage = defaultStorage(), key = DEFAULT_KEY, idFactory = defaultIdFactory, now = () => new Date().toISOString() } = {}) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') throw new Error('CHAT_STORAGE_INVALID');
  if (typeof idFactory !== 'function' || typeof now !== 'function') throw new Error('CHAT_STORE_DEPENDENCY_INVALID');

  function write(document) {
    storage.setItem(key, JSON.stringify(document));
    return clone(document);
  }

  function read() {
    const raw = storage.getItem(key);
    if (!raw) return emptyDocument(null, null);
    const parsed = JSON.parse(raw);
    return clone(parsed);
  }

  function ensureDocument() {
    const existing = read();
    if (existing.conversation?.id) return existing;
    const at = now();
    return emptyDocument(idFactory('conversation'), at);
  }

  function updateDocument(mutator) {
    const document = ensureDocument();
    const updated = mutator(clone(document)) || document;
    if (updated.conversation?.id) updated.conversation.updatedAt = now();
    return write(updated);
  }

  function commitUserMessage(rawText, { submitToken = null } = {}) {
    const text = String(rawText ?? '').trim();
    if (!text) throw new Error('CHAT_MESSAGE_EMPTY');
    const document = ensureDocument();
    if (submitToken && document.submitTokens?.[submitToken]) {
      const messageId = document.submitTokens[submitToken];
      return {
        message:clone(document.messages.find(item => item.id === messageId)),
        work:clone(document.work.find(item => item.messageId === messageId)),
      };
    }
    const at = now();
    const message = {
      id:idFactory('message'), conversationId:document.conversation.id, role:'user', text, rawText:text,
      createdAt:at, executionState:'WAITING', syncState:'WAITING', archived:false,
    };
    const work = {
      id:idFactory('work'), messageId:message.id, kind:'INTERPRET', status:'WAITING', attempts:0, createdAt:at, updatedAt:at,
    };
    message.workId = work.id;
    document.messages.push(message);
    document.work.push(work);
    if (!document.submitTokens) document.submitTokens = {};
    if (submitToken) document.submitTokens[submitToken] = message.id;
    document.conversation.updatedAt = at;
    write(document);
    return { message:clone(message), work:clone(work) };
  }

  function updateMessage(messageId, patch) {
    return updateDocument(document => {
      const message = document.messages.find(item => item.id === messageId);
      if (!message) throw new Error('CHAT_MESSAGE_NOT_FOUND');
      Object.assign(message, clone(patch || {}));
      return document;
    });
  }

  function archive(messageId) {
    return updateMessage(messageId, { archived:true });
  }

  function activeMessages() {
    return read().messages.filter(message => message.archived !== true);
  }

  return Object.freeze({ read, commitUserMessage, updateDocument, updateMessage, archive, activeMessages });
}
