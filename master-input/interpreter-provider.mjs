const MODEL = 'gpt-5.4-mini';
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

const SYSTEM_PROMPT = `คุณเป็นล่ามภาษาไทยหน้าประตูของ METRO เท่านั้น
หน้าที่คือแปลงข้อความผู้ใช้เป็น semantic proposal ห้ามเลือก domain, owner, Runtime method, command หรือสิทธิ์การเขียน
คืนเฉพาะ action + object + fields ตาม schema

กฎ v1 ที่ต้องตีความ แต่การอนุญาตจริงเป็นหน้าที่ deterministic gate:
- CREATE: EXPENSE, OTHER_INCOME, RIDE_START, RIDE_JOB, RIDE_END, SALE, PURCHASE
- QUERY: RIDE_TODAY_SUMMARY
- ถ้าผู้ใช้พูดว่าแก้/เปลี่ยน/อัปเดตของเดิม ให้ action=UPDATE
- ถ้าผู้ใช้พูดว่าลบ/ล้างรายการ ให้ action=DELETE
- ถ้าความหมายกำกวมจนเลือกไม่ได้ ให้ action=UNKNOWN หรือ object=UNKNOWN อย่าเดา

ความหมายตัวอย่าง:
- "ข้าว 65", "ข้าว65" => CREATE / EXPENSE / title=ข้าว / amountBaht=65
- "ได้เงินอื่น 500", "รับเงินอื่น500" => CREATE / OTHER_INCOME / amountBaht=500
- "เริ่มวิ่ง", "เริ่มรอบ" => CREATE / RIDE_START
- "งาน 380 เงินสด", "งาน380สด" => CREATE / RIDE_JOB / amountBaht=380 / paymentMode=CASH
- "งาน 380 เครดิต" => CREATE / RIDE_JOB / amountBaht=380 / paymentMode=CREDIT
- "งาน 380" => CREATE / RIDE_JOB / amountBaht=380 / paymentMode=null
- "จบรอบ", "เลิกวิ่ง" => CREATE / RIDE_END
- "วันนี้วิ่งได้เท่าไร", "วันนี้วิ่งได้กี่บาท" => QUERY / RIDE_TODAY_SUMMARY
- "ขาย 800" => CREATE / SALE
- "ซื้อของ 500" => CREATE / PURCHASE
- "แก้เมื่อกี้" => UPDATE
- "ลบเที่ยววิ่งล่าสุด" => DELETE

จำนวนเงินใน amountBaht เป็นหน่วยบาท ไม่ใช่สตางค์ และต้องมีทศนิยมไม่เกิน 2 ตำแหน่ง
paymentMode ใช้ CASH หรือ CREDIT เท่านั้น
อย่าเติมข้อมูลที่ผู้ใช้ไม่ได้ให้ ถ้าไม่มีให้ null`;

const INTENT_SCHEMA = Object.freeze({
  type:'object',
  additionalProperties:false,
  properties:{
    action:{ type:'string', enum:['CREATE','QUERY','UPDATE','DELETE','UNKNOWN'] },
    object:{ type:'string', enum:['EXPENSE','OTHER_INCOME','RIDE_START','RIDE_JOB','RIDE_END','RIDE_TODAY_SUMMARY','SALE','PURCHASE','UNKNOWN'] },
    fields:{
      type:'object',
      additionalProperties:false,
      properties:{
        title:{ type:['string','null'] },
        amountBaht:{ type:['number','null'] },
        paymentMode:{ anyOf:[{ type:'string', enum:['CASH','CREDIT'] },{ type:'null' }] },
        note:{ type:['string','null'] },
      },
      required:['title','amountBaht','paymentMode','note'],
    },
  },
  required:['action','object','fields'],
});

export class InterpreterProviderError extends Error {
  constructor(code, status = 502) {
    super(code);
    this.name = 'InterpreterProviderError';
    this.code = code;
    this.status = status;
  }
}

function outputText(payload) {
  if (!payload || !Array.isArray(payload.output)) return null;
  for (const item of payload.output) {
    if (item?.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (content?.type === 'refusal') throw new InterpreterProviderError('INTERPRETER_REFUSED', 422);
      if (content?.type === 'output_text' && typeof content.text === 'string') return content.text;
    }
  }
  return null;
}

export function buildOpenAIInterpretRequest(text) {
  if (typeof text !== 'string' || !text.trim()) throw new InterpreterProviderError('INTERPRETER_INVALID_INPUT', 400);
  return {
    model:MODEL,
    store:false,
    input:[
      { role:'system', content:SYSTEM_PROMPT },
      { role:'user', content:text.trim() },
    ],
    max_output_tokens:220,
    text:{
      format:{
        type:'json_schema',
        name:'metro_master_input_intent_v1',
        strict:true,
        schema:INTENT_SCHEMA,
      },
    },
  };
}

export async function interpretTextWithOpenAI({ apiKey, text, fetchImpl = globalThis.fetch } = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new InterpreterProviderError('INTERPRETER_NOT_CONFIGURED', 503);
  if (typeof fetchImpl !== 'function') throw new InterpreterProviderError('INTERPRETER_PROVIDER_UNAVAILABLE', 503);
  const requestBody = buildOpenAIInterpretRequest(text);
  let response;
  try {
    response = await fetchImpl(OPENAI_RESPONSES_URL, {
      method:'POST',
      headers:{
        'content-type':'application/json',
        authorization:`Bearer ${apiKey.trim()}`,
      },
      body:JSON.stringify(requestBody),
    });
  } catch {
    throw new InterpreterProviderError('INTERPRETER_PROVIDER_ERROR', 502);
  }
  if (!response || !response.ok) throw new InterpreterProviderError('INTERPRETER_PROVIDER_ERROR', 502);
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new InterpreterProviderError('INTERPRETER_INVALID_OUTPUT', 502);
  }
  const textOutput = outputText(payload);
  if (!textOutput) throw new InterpreterProviderError('INTERPRETER_INVALID_OUTPUT', 502);
  try {
    const proposal = JSON.parse(textOutput);
    if (proposal === null || typeof proposal !== 'object' || Array.isArray(proposal)) throw new Error('bad');
    return proposal;
  } catch (error) {
    if (error instanceof InterpreterProviderError) throw error;
    throw new InterpreterProviderError('INTERPRETER_INVALID_OUTPUT', 502);
  }
}

export const INTERPRETER_PROVIDER_MODEL = MODEL;
