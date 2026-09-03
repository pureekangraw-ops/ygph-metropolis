function clone(value) { return JSON.parse(JSON.stringify(value)); }

function assistantMessage(text, { relatedMessageId = null, kind = 'reply' } = {}) {
  return {
    id:`assistant-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`,
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

  async function send(rawText, { submitToken = null } = {}) {
    const created = store.commitUserMessage(rawText, { submitToken });
    let document = store.read();
    const existingDraft = document.drafts.find(item => item.messageId === created.message.id && item.status === 'CONFIRMATION_REQUIRED');
    const alreadyInterpreted = document.messages.some(item => item.relatedMessageId === created.message.id && item.kind === 'draft');
    if (existingDraft || alreadyInterpreted) return viewFromDocument(document);

    const proposal = await interpret(created.message.rawText);
    document = store.updateDocument(next => {
      const message = next.messages.find(item => item.id === created.message.id);
      const work = next.work.find(item => item.id === created.work.id);
      if (!message || !work) throw new Error('CHAT_CONTROLLER_RECORD_MISSING');
      work.attempts = Number(work.attempts || 0) + 1;
      work.updatedAt = new Date().toISOString();

      if (proposal?.type === 'draft') {
        const draft = normalizeDraft(proposal, message, work);
        next.drafts = next.drafts.filter(item => item.messageId !== message.id);
        next.drafts.push(draft);
        message.executionState = 'CONFIRMATION_REQUIRED';
        message.syncState = 'WAITING';
        work.kind = 'QUICK_CAPTURE';
        work.status = 'CONFIRMATION_REQUIRED';
        persistAssistant(next, draftReply(draft), { relatedMessageId:message.id, kind:'draft' });
      } else {
        message.executionState = 'SUCCESS';
        message.syncState = 'SUCCESS';
        work.status = 'SUCCESS';
        persistAssistant(next, String(proposal?.text || 'รับทราบ'), { relatedMessageId:message.id });
      }
      return next;
    });
    return viewFromDocument(document);
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
      target.executionState = 'CONFIRMATION_REQUIRED';
      target.syncState = 'WAITING';
      targetWork.status = 'CONFIRMATION_REQUIRED';
      persistAssistant(next, draftReply(draft), { relatedMessageId:messageId, kind:'draft' });
      return next;
    });
    return viewFromDocument(document);
  }

  async function confirm(messageId) {
    let document = store.read();
    const draft = document.drafts.find(item => item.messageId === messageId && item.status === 'CONFIRMATION_REQUIRED');
    if (!draft) throw new Error('CHAT_DRAFT_NOT_FOUND');

    document = store.updateDocument(next => {
      const message = next.messages.find(item => item.id === messageId);
      const work = next.work.find(item => item.id === draft.workId);
      if (!message || !work) throw new Error('CHAT_CONTROLLER_RECORD_MISSING');
      message.executionState = 'WAITING';
      message.syncState = 'WAITING';
      work.status = 'WAITING';
      work.attempts = Number(work.attempts || 0) + 1;
      return next;
    });

    let result;
    try {
      result = await commit(clone(draft));
    } catch (error) {
      store.updateDocument(next => {
        const message = next.messages.find(item => item.id === messageId);
        const work = next.work.find(item => item.id === draft.workId);
        message.executionState = 'ERROR';
        message.syncState = 'ERROR';
        work.status = 'ERROR';
        work.lastError = String(error?.message || error || 'ERROR');
        persistAssistant(next, 'ดำเนินการไม่สำเร็จ ลองอีกครั้งได้', { relatedMessageId:messageId, kind:'error' });
        return next;
      });
      return snapshot();
    }

    store.updateDocument(next => {
      const message = next.messages.find(item => item.id === messageId);
      const work = next.work.find(item => item.id === draft.workId);
      message.executionState = 'SUCCESS';
      message.syncState = 'WAITING';
      work.status = 'WAITING';
      work.lastResult = clone(result);
      return next;
    });

    let proof;
    try { proof = await readback(result, clone(draft)); }
    catch { proof = { ok:false }; }

    document = store.updateDocument(next => {
      const message = next.messages.find(item => item.id === messageId);
      const work = next.work.find(item => item.id === draft.workId);
      if (proof?.ok === true) {
        message.executionState = 'SUCCESS';
        message.syncState = 'SUCCESS';
        work.status = 'SUCCESS';
        work.readback = clone(proof.evidence || null);
        next.drafts = next.drafts.filter(item => item.messageId !== messageId);
        const alreadyReported = next.messages.some(item => item.relatedMessageId === messageId && item.kind === 'success');
        if (!alreadyReported) persistAssistant(next, 'บันทึกแล้ว', { relatedMessageId:messageId, kind:'success' });
      } else {
        message.executionState = 'SUCCESS';
        message.syncState = 'ERROR';
        work.status = 'ERROR';
        work.lastError = 'READBACK_UNVERIFIED';
        const alreadyReported = next.messages.some(item => item.relatedMessageId === messageId && item.kind === 'readback-error');
        if (!alreadyReported) persistAssistant(next, errorReply(), { relatedMessageId:messageId, kind:'readback-error' });
      }
      return next;
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
      const message = next.messages.find(item => item.id === messageId);
      const work = next.work.find(item => item.messageId === messageId);
      if (!message || !work) throw new Error('CHAT_MESSAGE_NOT_FOUND');
      next.drafts = next.drafts.filter(item => item.messageId !== messageId);
      message.executionState = 'CANCELLED';
      message.syncState = 'SUCCESS';
      work.status = 'CANCELLED';
      persistAssistant(next, 'ยกเลิกแล้ว', { relatedMessageId:messageId, kind:'cancelled' });
      return next;
    });
    return viewFromDocument(document);
  }

  function archive(messageId) {
    store.archive(messageId);
    return snapshot();
  }

  return Object.freeze({ send, edit, confirm, cancel, retry, archive, snapshot });
}
