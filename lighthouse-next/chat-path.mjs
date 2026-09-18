import { validatePathRequest } from '../lighthouse/path-contract.mjs';
import { createPathKernel } from '../lighthouse/path-kernel.mjs';
import { normalizePatternInput } from '../lighthouse/pattern-input.mjs';
import { createExpenseCapability } from '../lighthouse/capabilities/expense.mjs';
import { withRuntimeSession } from '../greenfield/runtime-session.mjs';

const expenseKernel = createPathKernel({
  capabilities:[createExpenseCapability()],
});

function draftRequest(draft) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) throw new Error('LIGHTHOUSE_EXPENSE_DRAFT_INVALID');
  if (draft.kind !== 'DIRECT_EXPENSE' || draft.stage !== 'CONFIRM_DIRECT_EXPENSE') throw new Error('LIGHTHOUSE_EXPENSE_DRAFT_INVALID');
  const requestId = String(draft.requestId || '').trim();
  const title = String(draft.title || '').trim();
  const amountSatang = Number(draft.amountSatang);
  return validatePathRequest({
    version:'1',
    source:'PATTERN',
    requestId,
    action:'CREATE',
    object:'EXPENSE',
    fields:{ title, amountSatang },
    requiredResult:{
      kind:'LEDGER_TRANSACTION',
      effect:{
        direction:'OUT',
        subtype:'EXPENSE',
        title,
        amountSatang,
      },
    },
  });
}

export function createExpenseDraft(text, { requestIdFactory } = {}) {
  const options = requestIdFactory ? { requestIdFactory } : undefined;
  const normalized = normalizePatternInput(text, options);
  if (normalized?.status !== 'MATCH') return null;
  const request = normalized.request;
  return Object.freeze({
    kind:'DIRECT_EXPENSE',
    stage:'CONFIRM_DIRECT_EXPENSE',
    requestId:request.requestId,
    title:request.fields.title,
    amountSatang:request.fields.amountSatang,
  });
}

export async function commitExpenseDraft(
  draft,
  { withSession = withRuntimeSession, pathKernel = expenseKernel } = {},
) {
  const request = draftRequest(draft);
  if (typeof withSession !== 'function' || !pathKernel || typeof pathKernel.run !== 'function') {
    throw new Error('LIGHTHOUSE_EXPENSE_PATH_UNAVAILABLE');
  }
  return withSession(runtime => pathKernel.run(request, { runtime }));
}
