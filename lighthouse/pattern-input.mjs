import { validatePathRequest } from './path-contract.mjs';

const FOUNDATION_EXPENSE_TERMS = new Set(['ข้าว']);

function defaultRequestIdFactory() {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `REQ-${suffix}`;
}

function noMatch() {
  return Object.freeze({ status:'NO_MATCH', source:'PATTERN' });
}

function amountToSatang(text) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const baht = Number(match[1]);
  if (!Number.isSafeInteger(baht)) return null;
  const satangPart = match[2] ? Number(match[2].padEnd(2, '0')) : 0;
  const amountSatang = baht * 100 + satangPart;
  if (!Number.isSafeInteger(amountSatang) || amountSatang <= 0) return null;
  return amountSatang;
}

export function normalizePatternInput(input, { requestIdFactory = defaultRequestIdFactory } = {}) {
  if (typeof requestIdFactory !== 'function') throw new Error('PATTERN_REQUEST_ID_FACTORY_INVALID');
  if (typeof input !== 'string') return noMatch();
  const match = /^([^\s]+)\s+(\d+(?:\.\d{1,2})?)$/.exec(input.trim());
  if (!match) return noMatch();

  const title = match[1];
  if (!FOUNDATION_EXPENSE_TERMS.has(title)) return noMatch();

  const amountSatang = amountToSatang(match[2]);
  if (amountSatang == null) return noMatch();

  const request = validatePathRequest({
    version:'1',
    source:'PATTERN',
    requestId:requestIdFactory(),
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

  return Object.freeze({ status:'MATCH', request });
}

export const FOUNDATION_PATTERN_EXPENSE_TERMS = Object.freeze([...FOUNDATION_EXPENSE_TERMS]);
