const ACTIONS = new Set(['CREATE','QUERY','UPDATE','DELETE','UNKNOWN']);
const OBJECTS = new Set(['EXPENSE','OTHER_INCOME','RIDE_START','RIDE_JOB','RIDE_END','RIDE_TODAY_SUMMARY','SALE','PURCHASE','UNKNOWN']);
const FIELD_KEYS = new Set(['title','amountBaht','paymentMode','note']);
const CREATE_ALLOWLIST = new Set(['EXPENSE','OTHER_INCOME','RIDE_START','RIDE_JOB','RIDE_END']);
const QUERY_ALLOWLIST = new Set(['RIDE_TODAY_SUMMARY']);

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function textOrNull(value, { max = 160, code = 'INVALID_INTENT_TEXT' } = {}) {
  if (value == null) return null;
  if (typeof value !== 'string') throw new Error(code);
  const output = value.trim();
  if (!output) return null;
  if (output.length > max) throw new Error(code);
  return output;
}

function amountBahtToSatang(value) {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error('INVALID_INTENT_AMOUNT');
  const satang = Math.round(value * 100);
  if (!Number.isSafeInteger(satang) || satang <= 0 || Math.abs(satang / 100 - value) > 1e-9) throw new Error('INVALID_INTENT_AMOUNT');
  return satang;
}

function normalizeFields(fields) {
  if (!plainObject(fields)) throw new Error('INVALID_INTENT_FIELDS');
  for (const key of Object.keys(fields)) if (!FIELD_KEYS.has(key)) throw new Error('INVALID_INTENT_FIELDS');
  for (const key of FIELD_KEYS) if (!(key in fields)) throw new Error('INVALID_INTENT_FIELDS');
  const paymentMode = fields.paymentMode == null ? null : String(fields.paymentMode).trim().toUpperCase();
  if (paymentMode !== null && paymentMode !== 'CASH' && paymentMode !== 'CREDIT') throw new Error('INVALID_INTENT_PAYMENT_MODE');
  return Object.freeze({
    title:textOrNull(fields.title, { max:120, code:'INVALID_INTENT_TITLE' }),
    amountSatang:amountBahtToSatang(fields.amountBaht),
    paymentMode,
    note:textOrNull(fields.note, { max:240, code:'INVALID_INTENT_NOTE' }),
  });
}

function result({ status, action, object, fields, missing = [], question = null, manual = false }) {
  return Object.freeze({
    version:'1', status, action, object, fields:{ ...fields }, missing:[...missing], question, manual:Boolean(manual),
  });
}

function ask(action, object, fields, missing, question) {
  return result({ status:'ASK', action, object, fields, missing, question });
}

function unsupported(action, object, fields, { manual = false, question = null } = {}) {
  return result({ status:'UNSUPPORTED', action, object, fields, missing:[], question, manual });
}

export function gateIntentProposal(proposal) {
  if (!plainObject(proposal)) throw new Error('INVALID_INTENT_PROPOSAL');
  const keys = Object.keys(proposal);
  if (keys.length !== 3 || !keys.includes('action') || !keys.includes('object') || !keys.includes('fields')) throw new Error('INVALID_INTENT_PROPOSAL');
  const action = String(proposal.action || '').trim().toUpperCase();
  const object = String(proposal.object || '').trim().toUpperCase();
  if (!ACTIONS.has(action)) throw new Error('INVALID_INTENT_ACTION');
  if (!OBJECTS.has(object)) throw new Error('INVALID_INTENT_OBJECT');
  const fields = normalizeFields(proposal.fields);

  if (action === 'UPDATE') return unsupported(action, object, fields, { manual:true, question:'รายการแก้ไขยังใช้หน้าจอเดิม' });
  if (action === 'DELETE') return unsupported(action, object, fields, { question:'Master Input v1 ยังไม่รองรับการลบ' });
  if (action === 'UNKNOWN' || object === 'UNKNOWN') return ask(action, object, fields, ['intent'], 'ช่วยบอกเพิ่มว่าต้องการบันทึกหรือดูข้อมูลอะไร');

  if (action === 'CREATE') {
    if (!CREATE_ALLOWLIST.has(object)) return unsupported(action, object, fields, { question:'รายการนี้ยังไม่เปิดให้สร้างผ่าน Master Input v1' });
    if (object === 'EXPENSE' || object === 'OTHER_INCOME') {
      const missing = [];
      if (!fields.title) missing.push('title');
      if (fields.amountSatang == null) missing.push('amountSatang');
      if (missing.length) return ask(action, object, fields, missing, 'บอกชื่อรายการและจำนวนเงินให้ครบ');
    }
    if (object === 'RIDE_JOB') {
      const missing = [];
      if (fields.amountSatang == null) missing.push('amountSatang');
      if (!fields.paymentMode) missing.push('paymentMode');
      if (missing.length) {
        const question = missing.includes('paymentMode') && !missing.includes('amountSatang')
          ? 'งานนี้รับเป็นเงินสดหรือเครดิต?'
          : 'บอกจำนวนเงินและว่าเป็นเงินสดหรือเครดิต';
        return ask(action, object, fields, missing, question);
      }
    }
    return result({ status:'READY', action, object, fields });
  }

  if (action === 'QUERY') {
    if (!QUERY_ALLOWLIST.has(object)) return unsupported(action, object, fields, { question:'คำถามนี้ยังไม่อยู่ใน QUERY allowlist ของ v1' });
    return result({ status:'READY', action, object, fields });
  }

  return unsupported(action, object, fields);
}

export const MASTER_INPUT_V1 = Object.freeze({
  actions:Object.freeze(['CREATE','QUERY']),
  createObjects:Object.freeze([...CREATE_ALLOWLIST]),
  queryObjects:Object.freeze([...QUERY_ALLOWLIST]),
  manualActions:Object.freeze(['UPDATE']),
  disabledActions:Object.freeze(['DELETE']),
});
