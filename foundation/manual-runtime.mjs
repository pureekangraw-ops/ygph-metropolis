import { createManualGate } from './manual-gate.mjs';

export const FOUNDATION_MANUAL_AREAS = Object.freeze([
  Object.freeze({ id:'INCOME', label:'Income', mode:'execute' }),
  Object.freeze({ id:'OUTCOME', label:'Outcome', mode:'execute' }),
  Object.freeze({ id:'LEDGER', label:'Ledger', mode:'view' }),
  Object.freeze({ id:'CALENDAR', label:'Calendar', mode:'view' }),
]);

const gate = createManualGate(FOUNDATION_MANUAL_AREAS);

export async function executeManualAppLanguage({ runtime, appLanguage, makeId }) {
  if (!runtime || typeof makeId !== 'function') throw new Error('MANUAL_RUNTIME_INVALID_CONTEXT');
  const area = gate.route(appLanguage);
  if (appLanguage?.action !== 'CREATE') throw new Error(`MANUAL_RUNTIME_UNSUPPORTED_ACTION:${String(appLanguage?.action || 'UNKNOWN')}`);

  if (area.id === 'OUTCOME') {
    if (typeof runtime.expense !== 'function') throw new Error('MANUAL_RUNTIME_EXPENSE_UNAVAILABLE');
    const result = await runtime.expense({
      workflowId:makeId('WF-OUTCOME'),
      ledgerTransactionId:makeId('TX-OUTCOME'),
      title:appLanguage.fields?.title,
      amountSatang:appLanguage.fields?.amountSatang,
    });
    return Object.freeze({ area:area.id, result });
  }

  if (area.id === 'INCOME') {
    if (typeof runtime.otherIncome !== 'function') throw new Error('MANUAL_RUNTIME_INCOME_UNAVAILABLE');
    const result = await runtime.otherIncome({
      workflowId:makeId('WF-INCOME'),
      ledgerTransactionId:makeId('TX-INCOME'),
      title:appLanguage.fields?.title,
      amountSatang:appLanguage.fields?.amountSatang,
    });
    return Object.freeze({ area:area.id, result });
  }

  throw new Error(`MANUAL_RUNTIME_AREA_READ_ONLY:${area.id}`);
}
