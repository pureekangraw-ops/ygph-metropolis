function normalizeText(value) {
  return String(value ?? '').replace(/[“”"]/gu, '').replace(/\s+/gu, ' ').trim();
}

function comparable(value) {
  return normalizeText(value).toLocaleLowerCase('en-US');
}

function optionalText(value) {
  const output = normalizeText(value);
  return !output || output === 'ไม่มี' ? null : output;
}

const PHONE_CUES = new Set(['มือถือ', 'โทรศัพท์', 'โทสับ']);
const COLORS = new Set([
  'ดำ', 'ขาว', 'แดง', 'เขียว', 'ฟ้า', 'น้ำเงิน', 'เหลือง', 'ส้ม', 'ม่วง', 'ชมพู', 'เทา', 'เงิน', 'ทอง', 'ครีม', 'น้ำตาล',
]);
const QUANTITY_UNITS = '(?:ขวด|เครื่อง|ชิ้น|อัน|ชุด|กล่อง|แพ็ค|แพ็ก|ใบ|ลูก|ตัว|เส้น|คู่)';

function parsePositiveInteger(value) {
  const output = Number(String(value ?? '').replaceAll(',', ''));
  return Number.isSafeInteger(output) && output > 0 ? output : null;
}

function normalizeDraftIdentity(input = {}) {
  const draft = { name:normalizeText(input.name) };
  const model = optionalText(input.model);
  const color = optionalText(input.color);
  const descriptors = Array.isArray(input.descriptors)
    ? [...new Set(input.descriptors.map(optionalText).filter(Boolean))]
    : [];
  if (model) draft.model = model;
  if (color) draft.color = color;
  if (descriptors.length) draft.descriptors = descriptors;
  return draft;
}

function productMatches(product, draft) {
  if (!product?.productId || !product?.name || comparable(product.name) !== comparable(draft.name)) return false;
  if (draft.model && comparable(product.model) !== comparable(draft.model)) return false;
  if (draft.color && comparable(product.color) !== comparable(draft.color)) return false;
  if (draft.descriptors?.length) {
    const candidate = new Set((Array.isArray(product.descriptors) ? product.descriptors : []).map(comparable));
    if (!draft.descriptors.every(value => candidate.has(comparable(value)))) return false;
  }
  return true;
}

function differingMissingField(candidates, draft) {
  const fields = ['model', 'color'];
  for (const field of fields) {
    if (draft[field]) continue;
    const values = new Set(candidates.map(product => optionalText(product?.[field]) ?? '').filter(Boolean).map(comparable));
    if (values.size > 1) return field;
  }
  if (!draft.descriptors?.length) {
    const descriptorKeys = new Set(candidates.map(product => JSON.stringify((Array.isArray(product?.descriptors) ? product.descriptors : []).map(comparable).sort())));
    if (descriptorKeys.size > 1) return 'descriptors';
  }
  return null;
}

export function parseProductAddText(text) {
  let clean = normalizeText(text);
  if (!clean) return null;
  const action = /^(?:เพิ่ม|เติม|รับเข้า)\s*/u.exec(clean);
  if (!action) return null;
  clean = clean.slice(action[0].length).trim();
  if (!clean) return null;

  let quantity = null;
  const quantityMatch = new RegExp(`(?:^|\\s)([0-9][0-9,]*)\\s*${QUANTITY_UNITS}?\\s*$`, 'u').exec(clean);
  if (quantityMatch) {
    quantity = parsePositiveInteger(quantityMatch[1]);
    if (quantity) clean = clean.slice(0, quantityMatch.index).trim();
  }
  if (!clean) return null;

  const tokens = clean.split(' ').filter(Boolean);
  let color = null;
  if (tokens.length > 1 && COLORS.has(tokens[tokens.length - 1])) color = tokens.pop();

  let model = null;
  if (tokens.length > 1 && /^(?:[0-9]+(?:GB|TB)|[0-9]+\/[0-9]+GB)$/iu.test(tokens[tokens.length - 1])) {
    model = tokens.pop();
  }

  const name = normalizeText(tokens.join(' '));
  if (!name) return null;
  const draft = { name };
  if (model) draft.model = model;
  if (color) draft.color = color;
  if (quantity) draft.quantity = quantity;
  return draft;
}

export function suggestProductQuestion(draft = {}, products = []) {
  const identity = normalizeDraftIdentity(draft);
  if (!identity.name) return null;
  const candidates = (Array.isArray(products) ? products : []).filter(product => productMatches(product, identity));
  if (candidates.length > 1) {
    const field = differingMissingField(candidates, identity);
    if (field === 'model' && !draft.modelExplicitlyAbsent) return { field:'model', prompt:'รุ่นไหนครับ?' };
    if (field === 'color' && !draft.colorExplicitlyAbsent) return { field:'color', prompt:'สีอะไรครับ?' };
    if (field === 'descriptors') return { field:'descriptors', prompt:'มีรายละเอียดอะไรที่ใช้แยกสินค้านี้ครับ?' };
  }
  if (PHONE_CUES.has(comparable(identity.name)) && !identity.model && !draft.modelExplicitlyAbsent) {
    return { field:'model', prompt:'รุ่นไหนครับ?' };
  }
  return null;
}

export function resolveProductDraft(draft = {}, products = []) {
  const identity = normalizeDraftIdentity(draft);
  if (!identity.name) return { status:'NEW' };
  const candidates = (Array.isArray(products) ? products : []).filter(product => productMatches(product, identity));
  if (candidates.length === 1) return { status:'EXACT', productId:candidates[0].productId };
  if (candidates.length > 1) {
    const result = { status:'AMBIGUOUS', candidates:candidates.map(product => product.productId) };
    const missingField = differingMissingField(candidates, identity);
    if (missingField) result.missingField = missingField;
    return result;
  }
  return { status:'NEW' };
}
