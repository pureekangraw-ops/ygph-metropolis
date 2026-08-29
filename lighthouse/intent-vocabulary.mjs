import { parseNumericText } from './intent-number.mjs';

const WORDS = Object.freeze([
  { forms:['ปฏิทิน'], canonical:'ปฏิทิน', role:'TARGET', possibleRoles:['TARGET'] },
  { forms:['ปติธิน','ปฏิธิน','ปติทิน'], canonical:'ปฏิทิน', role:'TARGET', possibleRoles:['TARGET'], correction:true },
  { forms:['น้ำมัน'], canonical:'น้ำมัน', role:'TARGET', possibleRoles:['TARGET'] },
  { forms:['น้ามัน'], canonical:'น้ำมัน', role:'TARGET', possibleRoles:['TARGET'], correction:true },
  { forms:['ไม่ต้อง'], canonical:'ไม่ต้อง', role:'PROHIBITION', possibleRoles:['PROHIBITION'] },
  { forms:['หรือยัง'], canonical:'หรือยัง', role:'QUESTION', possibleRoles:['QUESTION'] },
  { forms:['วันที่'], canonical:'วันที่', role:'TEMPORAL_MARKER', possibleRoles:['TEMPORAL'] },
  { forms:['ถ้า'], canonical:'ถ้า', role:'CONDITION_MARKER', possibleRoles:['CONDITION'] },
  { forms:['ให้หน่อย'], canonical:'ให้หน่อย', role:'POLITE', possibleRoles:['POLITE'], optional:true },
  { forms:['นะครับ','นะคะ','ครับ','ค่ะ','คะ'], canonical:null, role:'POLITE', possibleRoles:['POLITE'], optional:true },
  { forms:['ช่วย'], canonical:'ช่วย', role:'POLITE', possibleRoles:['POLITE'], optional:true },
  { forms:['ฉัน'], canonical:'ฉัน', role:'PRONOUN', possibleRoles:['SUBJECT','OWNER'] },
  { forms:['ขอ'], canonical:'ขอ', role:'POLITE', possibleRoles:['POLITE','INTENT_MARKER'], optional:true },
  { forms:['ลง'], canonical:'ลง', role:'VERB', possibleRoles:['VERB'] },
  { forms:['ข้าว'], canonical:'ข้าว', role:'TARGET', possibleRoles:['TARGET'] },
]);

const NUMBER_RE = /[0-9๐-๙][0-9๐-๙,]*(?:\.[0-9๐-๙]+)?/uy;
const DATE_RE = /วันที่[0-9๐-๙]+/uy;

function freeze(value) {
  return Object.freeze(value);
}

function token({ rawText, start, end, role, canonical = null, state = 'KNOWN', possibleRoles = [], optional = false, resolvedValue = null }) {
  return freeze({
    raw:rawText.slice(start, end),
    rawSpan:freeze({ start, end }),
    role,
    canonical,
    state,
    possibleRoles:freeze([...possibleRoles]),
    optional,
    resolvedValue:resolvedValue == null ? null : freeze(resolvedValue),
  });
}

function matchKnownWord(rawText, index) {
  for (const entry of WORDS) {
    for (const form of entry.forms) {
      if (rawText.startsWith(form, index)) return { entry, form };
    }
  }
  return null;
}

function nextKnownStart(rawText, from) {
  for (let index = from; index < rawText.length; index += 1) {
    DATE_RE.lastIndex = index;
    if (DATE_RE.exec(rawText)) return index;
    NUMBER_RE.lastIndex = index;
    if (NUMBER_RE.exec(rawText)) return index;
    if (matchKnownWord(rawText, index)) return index;
  }
  return rawText.length;
}

export function scanIntentVocabulary(rawText) {
  if (typeof rawText !== 'string') throw new TypeError('INTENT_VOCAB_TEXT_REQUIRED');
  const tokens = [];
  let index = 0;

  while (index < rawText.length) {
    DATE_RE.lastIndex = index;
    const date = DATE_RE.exec(rawText);
    if (date) {
      const end = index + date[0].length;
      tokens.push(token({ rawText, start:index, end, role:'TEMPORAL', canonical:null, possibleRoles:['TEMPORAL'], resolvedValue:{ dayText:date[0].slice('วันที่'.length) } }));
      index = end;
      continue;
    }

    const known = matchKnownWord(rawText, index);
    if (known) {
      const end = index + known.form.length;
      tokens.push(token({
        rawText,
        start:index,
        end,
        role:known.entry.role,
        canonical:known.entry.canonical,
        state:known.entry.correction ? 'CORRECTED_KNOWN_FORM' : 'KNOWN',
        possibleRoles:known.entry.possibleRoles,
        optional:known.entry.optional === true,
      }));
      index = end;
      continue;
    }

    NUMBER_RE.lastIndex = index;
    const numeric = NUMBER_RE.exec(rawText);
    if (numeric) {
      const end = index + numeric[0].length;
      const parsed = parseNumericText(numeric[0]);
      tokens.push(token({
        rawText,
        start:index,
        end,
        role:'NUMBER',
        canonical:null,
        state:parsed.state === 'RESOLVED' ? 'KNOWN' : 'AMBIGUOUS',
        possibleRoles:['MONEY','QUANTITY','TEMPORAL'],
        resolvedValue:parsed.state === 'RESOLVED' ? { value:parsed.value, amountSatang:parsed.amountSatang } : null,
      }));
      index = end;
      continue;
    }

    const end = nextKnownStart(rawText, index + 1);
    tokens.push(token({ rawText, start:index, end, role:'PENDING', canonical:null, state:'UNKNOWN', possibleRoles:[] }));
    index = end;
  }

  return freeze(tokens);
}
