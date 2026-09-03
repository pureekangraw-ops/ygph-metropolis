import { appendChatEvent, meaningfulChange } from './chat-state.mjs';

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function uid(prefix) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function assistantMessage(text, { relatedMessageId = null, kind = 'reply' } = {}) {
  return {
    id:uid('assistant'),
    conversationId:null,
    role:'assistant',
    text:String(text || ''),
    rawText:null,
    createdAt:new Date().toISOString(),
    relatedMessageId,
    kind,
    executionState:'SUCCESS',
    syncState:'SUCCESS',
    archived:false,
  };
}

function draftReply(draft) {
  return `${draft.summary || 'ตรวจรายการนี้'}\nตรวจแล้วเลือก แก้ไข / ยืนยัน / ยกเลิก`;
}

function errorReply() {
  return 'ยังยืนยันผลไม่ได้ ลองอีกครั้งได้';
}

function normalizeDraft(proposal, message, work) {
  return {
    messageId:message.id,
    workId:work.id,
    rawText:String(proposal?.rawText || message.rawText || ''),
    originalRawText:String(message.rawText || ''),
    owner:proposal?.owner || null,
    action:proposal?.action || null,
    fields:clone(proposal?.fields || {}),
    summary:String(proposal?.summary || ''),
    request:clone(proposal?.request || null),
    status:'CONFIRMATION_REQUIRED',
    revision:1,
  };
}

function viewFromDocument(document) {
  const active = (document.messages || []).filter(message => message.archived !== true);
  const messages = active.map(message => ({
    id:message.id,
    side:message.role === 'user' ? 'user' : 'assistant',
    text:message.text,
    relatedMessageId:message.relatedMessageId || null,
    kind:message.kind || 'message',
    executionState:message.executionState || null,
    syncState:message.syncState || null,
  }));
  const pending = (document.drafts || []).find(draft => draft.status === 'CONFIRMATION_REQUIRED') || null;
  return { messages, pending:pending ? clone(pending) : null };
}

function recordTransition(document, messageId, workId, executionState, syncState, { workStatus = executionState, evidence = null } = {}) {
  const message = document.messages.find(item => item.id === messageId);
  if (!message) throw new Error('CHAT_MESSAGE_NOT_FOUND');
  const previous = { executionState:message.executionState || null, syncState:message.syncState || null };
  const event = {
    id:uid('event'),
    messageId,
    workId,
    executionState,
    syncState,
    at:new Date().toISOString(),
    evidence:clone(evidence),
  };
  const next = appendChatEvent(document, event);
  const work = next.work.find(item => item.id === workId);
  if (work) {
    work.status = workStatus;
    work.updatedAt = event.at;
  }
  const current = { executionState, syncState };
  if (meaningfulChange(previous, current)) {
    next.changeMarkers ||= {};
    next.changeMarkers[messageId] = {
      eventId:event.id,
      executionState,
      syncState,
      at:event.at,
    };
  }
  return next;
}

export function createChatController({ store, interpret, commit, readback } = {}) {
  if (!store || typeof store.read !== 'function' || typeof store.commitUserMessage !== 'function' || typeof store.updateDocument !== 'function') {
    throw new Error('CHAT_CONTROLLER_STORE_INVALID');
  }
  for (const [name, fn] of Object.entries({ interpret, commit, readback })) {
    if (typeof fn !== 'function') throw new Error(`CHAT_CONTROLLER_${name.toUpperCase()}_INVALID`);
  }

  function persistAssistant(document, text, options = {}) {
    const message = assistantMessage(text, options);
    message.conversationId = document.conversation.id;
    document.messages.push(message);
    return message;
  }

  function snapshot() { return viewFromDocument(store.read()); }

  function ensureLocalCommitEvent(messageId, workId) {
    return store.updateDocument(document => {
      if (document.events.some(event => event.messageId === messageId && event.workId === workId)) return document;
      return recordTransition(document, messageId, workId, 'WAITING', 'WAITING', { workStatus:'WAITING', evidence:{ phase:'LOCAL_MESSAGE_COMMIT' } });
    });
  }

  async function interpretMessage(messageId) {
    let document = store.read();
    const message = document.messages.find(item => item.id === messageId && item.role === 'user');
    const work = document.work.find(item => item.messageId === messageId);
    if (!message || !work) throw new Error('CHAT_CONTROLLER_RECORD_MISSING');
    const existingDraft = document.drafts.find(item => item.messageId === messageId && item.status === 'CONFIRMATION_REQUIRED');
    const alreadyInterpreted = document.messages.some(item => item.relatedMessageId === messageId && item.kind === 'draft');
    if (existingDraft || alreadyInterpreted) return viewFromDocument(document);

    const proposal = await interpret(message.rawText);
    document = store.updateDocument(next => {
      const target = next.messages.find(item => item.id === messageId);
      const targetWork = next.work.find(item => item.id === work.id);
      if (!target || !targetWork) throw new Error('CHAT_CONTROLLER_RECORD_MISSING');
      targetWork.attempts = Number(targetWork.attempts || 0) + 1;

      if (proposal?.type === 'draft') {
        const draft = normalizeDraft(proposal, target, targetWork);
        next.drafts = next.drafts.filter(item => item.messageId !== target.id);
        next.drafts.push(draft);
        targetWork.kind = 'QUICK_CAPTURE';
        persistAssistant(next, draftReply(draft), { relatedMessageId:target.id, kind:'draft' });
        return recordTransition(next, target.id, targetWork.id, 'CONFIRMATION_REQUIRED', 'WAITING', { workStatus:'CONFIRMATION_REQUIRED', evidence:{ phase:'DRAFT_READY', revision:draft.revision } });
      }

      persistAssistant(next, String(proposal?.text || 'รับทราบ'), { relatedMessageId:target.id });
      return recordTransition(next, target.id, targetWork.id, 'SUCCESS', 'SUCCESS', { workStatus:'SUCCESS', evidence:{ phase:'REPLY_READY' } });
    });
    return viewFromDocument(document);
  }

  async function send(rawText, { submitToken = null } = {}) {
    const created = store.commitUserMessage(rawText, { submitToken });
    ensureLocalCommitEvent(created.message.id, created.work.id);
    return interpretMessage(created.message.id);
  }

  async function edit(messageId, rawText) {
    const current = store.read();
    const message = current.messages.find(item => item.id === messageId && item.role === 'user');
    const work = current.work.find(item => item.messageId === messageId);
    if (!message || !work) throw new Error('CHAT_MESSAGE_NOT_FOUND');
    const proposal = await interpret(String(rawText || '').trim());
    if (proposal?.type !== 'draft') throw new Error('CHAT_EDIT_NOT_DRAFT');
    const document = store.updateDocument(next => {
      const target = next.messages.find(item => item.id === messageId);
      const targetWork = next.work.find(item => item.messageId === messageId);
      const previous = next.drafts.find(item => item.messageId === messageId);
      const draft = normalizeDraft(proposal, target, targetWork);
      draft.rawText = String(rawText || '').trim();
      draft.originalRawText = previous?.originalRawText || target.rawText;
      draft.revision = Number(previous?.revision || 1) + 1;
      next.drafts = next.drafts.filter(item => item.messageId !== messageId);
      next.drafts.push(draft);
      targetWork.kind = 'QUICK_CAPTURE';
      persistAssistant(next, draftReply(draft), { relatedMessageId:messageId, kind:'draft' });
      return recordTransition(next, messageId, targetWork.id, 'CONFIRMATION_REQUIRED', 'WAITING', { workStatus:'CONFIRMATION_REQUIRED', evidence:{ phase:'DRAFT_EDITED', revision:draft.revision } });
    });
    return viewFromDocument(document);
  }

  async function confirm(messageId) {
    let document = store.read();
    const draft = document.drafts.find(item => item.messageId === messageId && item.status === 'CONFIRMATION_REQUIRED');
    if (!draft) throw new Error('CHAT_DRAFT_NOT_FOUND');

    document = store.updateDocument(next => {
      const work = next.work.find(item => item.id === draft.workId);
      if (!work) throw new Error('CHAT_CONTROLLER_RECORD_MISSING');
      work.attempts = Number(work.attempts || 0) + 1;
      return recordTransition(next, messageId, draft.workId, 'WAITING', 'WAITING', { workStatus:'WAITING', evidence:{ phase:'EXECUTION_QUEUED' } });
    });

    let result;
    try {
      result = await commit(clone(draft));
    } catch (error) {
      store.updateDocument(next => {
        const work = next.work.find(item => item.id === draft.workId);
        if (work) work.lastError = String(error?.message || error || 'ERROR');
        const updated = recordTransition(next, messageId, draft.workId, 'ERROR', 'ERROR', { workStatus:'ERROR', evidence:{ phase:'EXECUTION_FAILED' } });
        persistAssistant(updated, 'ดำเนินการไม่สำเร็จ ลองอีกครั้งได้', { relatedMessageId:messageId, kind:'error' });
        return updated;
      });
      return snapshot();
    }

    store.updateDocument(next => {
      const work = next.work.find(item => item.id === draft.workId);
      if (work) work.lastResult = clone(result);
      return recordTransition(next, messageId, draft.workId, 'SUCCESS', 'WAITING', { workStatus:'WAITING', evidence:{ phase:'DOMAIN_COMMITTED' } });
    });

    let proof;
    try { proof = await readback(result, clone(draft)); }
    catch { proof = { ok:false }; }

    document = store.updateDocument(next => {
      const work = next.work.find(item => item.id === draft.workId);
      if (proof?.ok === true) {
        if (work) work.readback = clone(proof.evidence || null);
        next.drafts = next.drafts.filter(item => item.messageId !== messageId);
        const updated = recordTransition(next, messageId, draft.workId, 'SUCCESS', 'SUCCESS', { workStatus:'SUCCESS', evidence:{ phase:'READBACK_PROVEN', readback:proof.evidence || null } });
        const alreadyReported = updated.messages.some(item => item.relatedMessageId === messageId && item.kind === 'success');
        if (!alreadyReported) persistAssistant(updated, 'บันทึกแล้ว', { relatedMessageId:messageId, kind:'success' });
        return updated;
      }

      if (work) work.lastError = 'READBACK_UNVERIFIED';
      const updated = recordTransition(next, messageId, draft.workId, 'SUCCESS', 'ERROR', { workStatus:'ERROR', evidence:{ phase:'READBACK_UNVERIFIED' } });
      const alreadyReported = updated.messages.some(item => item.relatedMessageId === messageId && item.kind === 'readback-error');
      if (!alreadyReported) persistAssistant(updated, errorReply(), { relatedMessageId:messageId, kind:'readback-error' });
      return updated;
    });
    return viewFromDocument(document);
  }

  async function retry(messageId) {
    const document = store.read();
    const draft = document.drafts.find(item => item.messageId === messageId);
    if (!draft) throw new Error('CHAT_DRAFT_NOT_FOUND');
    return confirm(messageId);
  }

  async function cancel(messageId) {
    const document = store.updateDocument(next => {
      const work = next.work.find(item => item.messageId === messageId);
      if (!work) throw new Error('CHAT_MESSAGE_NOT_FOUND');
      next.drafts = next.drafts.filter(item => item.messageId !== messageId);
      const updated = recordTransition(next, messageId, work.id, 'CANCELLED', 'SUCCESS', { workStatus:'CANCELLED', evidence:{ phase:'USER_CANCELLED' } });
      persistAssistant(updated, 'ยกเลิกแล้ว', { relatedMessageId:messageId, kind:'cancelled' });
      return updated;
    });
    return viewFromDocument(document);
  }

  function archive(messageId) {
    store.archive(messageId);
    return snapshot();
  }

  async function recover() {
    const pending = store.read().work.filter(work => work.status === 'WAITING');
    for (const work of pending) {
      const current = store.read();
      const message = current.messages.find(item => item.id === work.messageId);
      if (!message || message.archived) continue;
      if (work.kind === 'INTERPRET') {
        ensureLocalCommitEvent(message.id, work.id);
        await interpretMessage(message.id);
        continue;
      }
      if (work.kind === 'QUICK_CAPTURE' && current.drafts.some(draft => draft.messageId === message.id && draft.status === 'CONFIRMATION_REQUIRED')) {
        await confirm(message.id);
      }
    }
    return snapshot();
  }

  return Object.freeze({ send, edit, confirm, cancel, retry, archive, recover, snapshot });
}
