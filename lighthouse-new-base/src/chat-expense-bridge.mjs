import { normalizePatternInput } from '../../lighthouse/pattern-input.mjs';
import { createPathKernel } from '../../lighthouse/path-kernel.mjs';
import { createExpenseCapability } from '../../lighthouse/capabilities/expense.mjs';

function formatBaht(amountSatang) {
  const value = amountSatang / 100;
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

export function createExpenseChatBridge({ runtime, requestIdFactory } = {}) {
  if (!runtime) throw new Error('CHAT_EXPENSE_RUNTIME_REQUIRED');

  const kernel = createPathKernel({ capabilities: [createExpenseCapability()] });
  let readback = null;

  return Object.freeze({
    async interpret(text) {
      const normalized = normalizePatternInput(text, { requestIdFactory });
      if (normalized.status !== 'MATCH') {
        return Object.freeze({ type: 'reply', text: 'ยังไม่แน่ใจว่าต้องบันทึกอะไร' });
      }

      const request = normalized.request;
      return Object.freeze({
        type: 'draft',
        owner: 'outcome',
        action: 'expense',
        fields: request.fields,
        request,
        summary: `รายจ่าย ${request.fields.title} ${formatBaht(request.fields.amountSatang)} บาท`,
      });
    },

    async commit(pending) {
      return kernel.run(pending.request, { runtime });
    },

    async readback(result) {
      if (result?.status === 'COMPLETE' && result.readback) {
        readback = result.readback;
        return Object.freeze({ ok: true, evidence: result.readback });
      }
      return Object.freeze({ ok: false });
    },

    lastReadback() {
      return readback;
    },
  });
}
