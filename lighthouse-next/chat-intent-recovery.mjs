function clone(value) {
  return structuredClone(value);
}

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeIncomeSource(value) {
  const source = normalizeText(value).replace(/^จาก\s*/u, '').trim();
  return source && source.length <= 80 ? source : null;
}

function parsePositiveNumber(value) {
  const match = normalizeText(value).match(/([0-9][0-9,]*(?:\.[0-9]{1,2})?)/u);
  if (!match) return null;
  const number = Number(match[1].replaceAll(',', ''));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function finish(intent) {
  const next = clone(intent);
  next.status = next.missing.length || next.ambiguous.length ? 'INCOMPLETE' : 'READY';
  return next;
}

function recomputeStoreMissing(intent) {
  const next = clone(intent);
  const missing = [];
  if (!next.slots.quantity) missing.push('quantity');
  if (!next.slots.priceBaht) missing.push('priceBaht');
  if (next.slots.quantity > 1 && !next.slots.priceBasis) missing.push('priceBasis');
  next.missing = missing;
  if (next.slots.quantity === 1 && next.slots.priceBaht && !next.slots.priceBasis) next.slots.priceBasis = 'UNIT';
  return finish(next);
}

function recoverGeneralIncome(intent, answer) {
  if (intent.missing[0] !== 'source') return intent;
  const source = normalizeIncomeSource(answer);
  if (!source) return intent;
  const next = clone(intent);
  next.slots.source = source;
  next.missing = next.missing.filter(slot => slot !== 'source');
  return finish(next);
}

function recoverAmbiguousProduct(intent, answer) {
  const ambiguity = Array.isArray(intent.ambiguous)
    ? intent.ambiguous.find(item => item?.slot === 'product')
    : null;
  if (!ambiguity) return null;
  const clean = normalizeText(answer).toLocaleLowerCase('th-TH');
  const candidates = Array.isArray(ambiguity.candidates) ? ambiguity.candidates : [];
  const matches = candidates.filter(candidate => {
    const name = normalizeText(candidate?.productName).toLocaleLowerCase('th-TH');
    return name && clean === name;
  });
  if (matches.length !== 1) return intent;
  const chosen = matches[0];
  const next = clone(intent);
  next.slots.productId = chosen.productId;
  next.slots.productName = chosen.productName;
  next.ambiguous = next.ambiguous.filter(item => item?.slot !== 'product');
  return recomputeStoreMissing(next);
}

function recoverStoreSale(intent, answer) {
  const ambiguous = recoverAmbiguousProduct(intent, answer);
  if (ambiguous) return ambiguous;

  const missing = intent.missing[0];
  const clean = normalizeText(answer);
  const next = clone(intent);

  if (missing === 'quantity') {
    const quantity = parsePositiveNumber(clean);
    if (!Number.isSafeInteger(quantity)) return intent;
    next.slots.quantity = quantity;
    return recomputeStoreMissing(next);
  }

  if (missing === 'priceBaht') {
    const priceBaht = parsePositiveNumber(clean);
    if (!priceBaht) return intent;
    next.slots.priceBaht = priceBaht;
    return recomputeStoreMissing(next);
  }

  if (missing === 'priceBasis') {
    let priceBasis = null;
    if (/^(?:ต่อชิ้น|ราคาต่อชิ้น|ชิ้นละ|unit)$/iu.test(clean)) priceBasis = 'UNIT';
    if (/^(?:ยอดรวม|รวม|ทั้งหมด|total)$/iu.test(clean)) priceBasis = 'TOTAL';
    if (!priceBasis) return intent;
    next.slots.priceBasis = priceBasis;
    return recomputeStoreMissing(next);
  }

  return intent;
}

export function recoverIntentSlot(rawIntent, answer) {
  if (!rawIntent || typeof rawIntent !== 'object' || Array.isArray(rawIntent)) return rawIntent;
  const intent = clone(rawIntent);
  if (intent.kind === 'GENERAL_INCOME') return recoverGeneralIncome(intent, answer);
  if (intent.kind === 'STORE_SALE') return recoverStoreSale(intent, answer);
  return intent;
}
