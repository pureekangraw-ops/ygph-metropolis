function clone(value) {
  return structuredClone(value);
}

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function finish(intent) {
  const next = clone(intent);
  next.status = next.missing.length || next.ambiguous.length ? 'INCOMPLETE' : 'READY';
  return next;
}

function recoverGeneralIncome(intent, answer) {
  if (intent.missing[0] !== 'source') return intent;
  const source = normalizeText(answer);
  if (!source) return intent;
  const next = clone(intent);
  next.slots.source = source;
  next.missing = next.missing.filter(slot => slot !== 'source');
  return finish(next);
}

function recoverStoreSale(intent, answer) {
  const missing = intent.missing[0];
  if (missing !== 'priceBasis') return intent;
  const clean = normalizeText(answer);
  let priceBasis = null;
  if (/^(?:ต่อชิ้น|ราคาต่อชิ้น|ชิ้นละ|unit)$/iu.test(clean)) priceBasis = 'UNIT';
  if (/^(?:ยอดรวม|รวม|ทั้งหมด|total)$/iu.test(clean)) priceBasis = 'TOTAL';
  if (!priceBasis) return intent;
  const next = clone(intent);
  next.slots.priceBasis = priceBasis;
  next.missing = next.missing.filter(slot => slot !== 'priceBasis');
  return finish(next);
}

export function recoverIntentSlot(rawIntent, answer) {
  if (!rawIntent || typeof rawIntent !== 'object' || Array.isArray(rawIntent)) return rawIntent;
  if (!Array.isArray(rawIntent.missing) || !rawIntent.missing.length) return clone(rawIntent);
  const intent = clone(rawIntent);
  if (intent.kind === 'GENERAL_INCOME') return recoverGeneralIncome(intent, answer);
  if (intent.kind === 'STORE_SALE') return recoverStoreSale(intent, answer);
  return intent;
}
