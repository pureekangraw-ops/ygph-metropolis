const THAI_DIGITS = Object.freeze({ '๐':'0','๑':'1','๒':'2','๓':'3','๔':'4','๕':'5','๖':'6','๗':'7','๘':'8','๙':'9' });
const THAI_WORD_DIGITS = Object.freeze({ 'ศูนย์':0, 'หนึ่ง':1, 'สอง':2, 'สาม':3, 'สี่':4, 'ห้า':5, 'หก':6, 'เจ็ด':7, 'แปด':8, 'เก้า':9, 'เอ็ด':1, 'ยี่':2 });
const THAI_WORD_TOKENS = ['หนึ่ง','สอง','สาม','สี่','ห้า','หก','เจ็ด','แปด','เก้า','ศูนย์','เอ็ด','ยี่','สิบ','ร้อย','พัน'];

function normalizeThaiDigits(value) {
  return [...value].map(char => THAI_DIGITS[char] ?? char).join('');
}

function invalid(kind = 'NUMBER') {
  return Object.freeze({ state:'INVALID', kind, value:null, amountSatang:null });
}

function resolved(value, amountSatang, kind = 'NUMBER') {
  return Object.freeze({ state:'RESOLVED', kind, value, amountSatang });
}

function parseDigitNumber(rawValue) {
  const normalized = normalizeThaiDigits(rawValue.trim());
  const match = /^([^.]*)?(?:\.(\d+))?$/.exec(normalized);
  if (!match) return invalid();
  const integerRaw = match[1] ?? '';
  const fractionRaw = match[2] ?? '';
  if (!integerRaw) return invalid();
  const integerValid = /^\d+$/.test(integerRaw) || /^\d{1,3}(?:,\d{3})+$/.test(integerRaw);
  if (!integerValid) return invalid();
  if (fractionRaw.length > 2) return invalid('MONEY_PRECISION');
  const integerDigits = integerRaw.replaceAll(',', '');
  if (!/^\d+$/.test(integerDigits)) return invalid();
  const integer = Number(integerDigits);
  if (!Number.isSafeInteger(integer)) return invalid();
  const fraction = fractionRaw ? Number(fractionRaw.padEnd(2, '0')) : 0;
  const amountSatang = integer * 100 + fraction;
  if (!Number.isSafeInteger(amountSatang) || amountSatang <= 0) return invalid();
  const value = fractionRaw ? Number(`${integer}.${fractionRaw}`) : integer;
  return resolved(value, amountSatang);
}

function tokenizeThaiWords(input) {
  const tokens = [];
  let offset = 0;
  while (offset < input.length) {
    const token = THAI_WORD_TOKENS.find(candidate => input.startsWith(candidate, offset));
    if (!token) return null;
    tokens.push(token);
    offset += token.length;
  }
  return tokens;
}

function parseThaiWords(rawValue) {
  const input = rawValue.trim();
  if (!input) return invalid();
  const tokens = tokenizeThaiWords(input);
  if (!tokens || tokens.length === 0) return invalid();
  let total = 0;
  let digit = null;
  let lastMagnitude = Infinity;
  for (const token of tokens) {
    if (Object.hasOwn(THAI_WORD_DIGITS, token)) {
      if (digit !== null) return invalid();
      digit = THAI_WORD_DIGITS[token];
      continue;
    }
    const magnitude = token === 'พัน' ? 1000 : token === 'ร้อย' ? 100 : 10;
    if (magnitude >= lastMagnitude) return invalid();
    if (token === 'สิบ' && digit === 0) return invalid();
    const factor = digit === null ? 1 : digit;
    total += factor * magnitude;
    digit = null;
    lastMagnitude = magnitude;
  }
  if (digit !== null) total += digit;
  if (!Number.isSafeInteger(total) || total <= 0) return invalid();
  const amountSatang = total * 100;
  if (!Number.isSafeInteger(amountSatang)) return invalid();
  return resolved(total, amountSatang, 'THAI_WORD_NUMBER');
}

export function parseNumericText(rawValue) {
  if (typeof rawValue !== 'string') return invalid();
  const input = rawValue.trim();
  if (!input) return invalid();
  if (/^[0-9๐-๙,.]+$/u.test(input)) return parseDigitNumber(input);
  return parseThaiWords(input);
}
