function freezeMessage(side, text) {
  return Object.freeze({ side, text: String(text ?? '') });
}

function draftPrompt(draft) {
  return `${draft.summary} — พิมพ์ ยืนยัน แก้ไข หรือ ยกเลิก`;
}

export function createChatSession({ interpret, commit, readback }) {
  if (typeof interpret !== 'function' || typeof commit !== 'function' || typeof readback !== 'function') {
    throw new Error('CHAT_DEPENDENCY_REQUIRED');
  }

  const messages = [];
  let pending = null;

  function snapshot() {
    return Object.freeze({
      messages: Object.freeze([...messages]),
      pending,
    });
  }

  async function interpretIntoDraft(text) {
    const result = await interpret(text);
    if (result?.type === 'draft') {
      pending = Object.freeze({
        ...result,
        fields: Object.freeze({ ...(result.fields || {}) }),
      });
      messages.push(freezeMessage('assistant', draftPrompt(pending)));
      return;
    }
    pending = null;
    messages.push(freezeMessage('assistant', result?.text || 'ยังทำไม่ได้'));
  }

  return Object.freeze({
    async receive(rawText) {
      const text = String(rawText ?? '').trim();
      if (!text) return snapshot();
      messages.push(freezeMessage('user', text));

      if (pending && text === 'ยืนยัน') {
        const receipt = await commit(pending);
        const proof = await readback(receipt, pending);
        if (proof?.ok === true) {
          pending = null;
          messages.push(freezeMessage('assistant', 'บันทึกแล้ว'));
        } else {
          messages.push(freezeMessage('assistant', 'ยังยืนยันผลไม่ได้'));
        }
        return snapshot();
      }

      if (pending && text === 'ยกเลิก') {
        pending = null;
        messages.push(freezeMessage('assistant', 'ยกเลิกแล้ว'));
        return snapshot();
      }

      if (pending && text.startsWith('แก้ไข')) {
        await interpretIntoDraft(text.replace(/^แก้ไข\s*/, ''));
        return snapshot();
      }

      await interpretIntoDraft(text);
      return snapshot();
    },
    snapshot,
  });
}
