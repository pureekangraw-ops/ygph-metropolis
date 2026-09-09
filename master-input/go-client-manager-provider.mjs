import { InterpreterProviderError, INTERPRETER_PROVIDER_MODEL } from './interpreter-provider.mjs';

const MODEL = INTERPRETER_PROVIDER_MODEL;
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

const DISPOSITIONS = Object.freeze(['WHISPER','DIRECT_REPLY','TAKEOVER']);
const SEVERITIES = Object.freeze(['L1','L2','L3','L4','L5']);
const SIGNAL_INTENTS = Object.freeze([
  'SERVICE','PRICE','INCLUDED','MATERIALS','REVISION','SCOPE_CHANGE','TIMELINE','PAGE_COUNT',
  'OLD_FILE','UNORGANIZED_CONTENT','GRAPH_TABLE_DIAGRAM','PORTFOLIO','START','PRE_ESTIMATE','UNKNOWN',
]);
const REASON_CODES = Object.freeze([
  'SIMPLE_GUIDANCE','PRICE_SCOPE','SCOPE','TIMELINE','AMBIGUITY','CUSTOMER_DISTRESS','CRITICAL','OTHER',
]);

const SYSTEM_PROMPT = `คุณคือ GO Manager สำหรับ GO Client ฝั่งรับงาน Presentation
คุณถูกเรียกมาเพื่อ PEEK เคสจาก packet สั้น ๆ แล้วตัดสินระดับความแรงและวิธีช่วย โดยไม่เปิดข้อมูลเพิ่มเอง

เป้าหมาย: แก้ปัญหาลูกค้าด้วย context และ API ต่ำที่สุดที่ยังตอบถูก
- L1-L2: ถ้า Client ปกติตอบได้ ให้ WHISPER เป็นค่าเริ่มต้น
- L3: WHISPER หรือ DIRECT_REPLY ตามความจำเป็น
- L4: DIRECT_REPLY หรือ TAKEOVER เมื่อความเสี่ยง/ความขัดแย้งสูง
- L5: เคสวิกฤต ลูกค้าร้องขอคนช่วยชัด หรือความเชื่อมั่น/ราคา/Scope/Deadline พัง ให้ TAKEOVER และเคลียร์ให้จบ

กฎ output:
- WHISPER = GO ไม่ออกหน้า: signalIntent ต้องไม่เป็น null และ managerReply ต้องเป็น null เพื่อให้ Client ใช้ local response node ต่อโดยไม่ยิง AI รอบสอง
- DIRECT_REPLY = GO ออกหน้าตอบเฉพาะจุด: managerReply ต้องมีข้อความลูกค้าอ่านได้
- TAKEOVER = GO รับช่วง: managerReply ต้องมีข้อความลูกค้าอ่านได้และต้องพาเคสไปสู่การเคลียร์ ไม่ใช่แค่บอกว่ารับทราบ
- ห้ามสร้างราคา เงื่อนไข วันส่ง หรือข้อเท็จจริงใหม่ที่ packet ไม่รองรับ
- ห้ามมี Runtime/domain/command/mutation authority
- ห้ามเรียกหรืออ่านไฟล์เพิ่มจาก PEEK นี้
- UNKNOWN คือยังไม่รู้ ไม่ใช่ผิด
- ถ้าเคสรุนแรงจริง คุณภาพการเคลียร์ลูกค้ามาก่อนการประหยัด API`;

const RESULT_SCHEMA = Object.freeze({
  type:'object',
  additionalProperties:false,
  properties:{
    disposition:{ type:'string', enum:DISPOSITIONS },
    severity:{ type:'string', enum:SEVERITIES },
    signalIntent:{ anyOf:[{ type:'string', enum:SIGNAL_INTENTS },{ type:'null' }] },
    managerReply:{ anyOf:[{ type:'string', minLength:1, maxLength:1200 },{ type:'null' }] },
    reasonCode:{ type:'string', enum:REASON_CODES },
  },
  required:['disposition','severity','signalIntent','managerReply','reasonCode'],
});

function cleanString(value, max = 500) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text.slice(0, max) : null;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function sanitizeGoClientManagerPacket(packet = {}) {
  const recent = Array.isArray(packet.recentContext) ? packet.recentContext : [];
  return {
    source:cleanString(packet.source, 20),
    reason:cleanString(packet.reason, 60),
    stage:cleanString(packet.stage, 40),
    lastClientMessage:cleanString(packet.lastClientMessage, 700),
    jobType:cleanString(packet.jobType, 40),
    package:cleanString(packet.package, 20),
    estimate:packet.estimate && typeof packet.estimate === 'object' ? {
      priceBaht:finiteNumber(packet.estimate.priceBaht),
      pageCount:Number.isInteger(packet.estimate.pageCount) ? packet.estimate.pageCount : null,
      turnaroundDays:cleanString(packet.estimate.turnaroundDays, 80),
    } : null,
    checklistSummary:packet.checklistSummary && typeof packet.checklistSummary === 'object' ? {
      received:finiteNumber(packet.checklistSummary.received),
      waiting:finiteNumber(packet.checklistSummary.waiting),
      optional:finiteNumber(packet.checklistSummary.optional),
      verify:finiteNumber(packet.checklistSummary.verify),
    } : null,
    recentContext:recent.slice(-4).map((message) => ({
      role:cleanString(message?.role, 20),
      text:cleanString(message?.text, 500),
    })),
  };
}

export function buildGoClientManagerRequest(packet) {
  const compactPacket = sanitizeGoClientManagerPacket(packet);
  return {
    model:MODEL,
    store:false,
    input:[
      { role:'system', content:SYSTEM_PROMPT },
      { role:'user', content:JSON.stringify(compactPacket) },
    ],
    max_output_tokens:420,
    text:{
      format:{
        type:'json_schema',
        name:'go_client_manager_decision_v1',
        strict:true,
        schema:RESULT_SCHEMA,
      },
    },
  };
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

function exactKeys(object, expected) {
  const actual = Object.keys(object || {}).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key,index) => key === wanted[index]);
}

function invalidOutput() {
  throw new InterpreterProviderError('INTERPRETER_INVALID_OUTPUT', 502);
}

export function gateGoClientManagerDecision(decision) {
  const required = ['disposition','severity','signalIntent','managerReply','reasonCode'];
  if (!decision || typeof decision !== 'object' || Array.isArray(decision) || !exactKeys(decision, required)) invalidOutput();
  if (!DISPOSITIONS.includes(decision.disposition)) invalidOutput();
  if (!SEVERITIES.includes(decision.severity)) invalidOutput();
  if (decision.signalIntent !== null && !SIGNAL_INTENTS.includes(decision.signalIntent)) invalidOutput();
  if (!REASON_CODES.includes(decision.reasonCode)) invalidOutput();
  if (decision.managerReply !== null && (typeof decision.managerReply !== 'string' || !decision.managerReply.trim() || decision.managerReply.length > 1200)) invalidOutput();

  if (decision.disposition === 'WHISPER') {
    if (decision.signalIntent === null || decision.managerReply !== null) invalidOutput();
  } else if (decision.managerReply === null) {
    invalidOutput();
  }

  return {
    disposition:decision.disposition,
    severity:decision.severity,
    signalIntent:decision.signalIntent,
    managerReply:decision.managerReply === null ? null : decision.managerReply.trim(),
    reasonCode:decision.reasonCode,
  };
}

export async function interpretGoClientManagerWithOpenAI({ apiKey, packet, fetchImpl = globalThis.fetch } = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new InterpreterProviderError('INTERPRETER_NOT_CONFIGURED', 503);
  if (typeof fetchImpl !== 'function') throw new InterpreterProviderError('INTERPRETER_PROVIDER_UNAVAILABLE', 503);
  const requestBody = buildGoClientManagerRequest(packet);
  let response;
  try {
    response = await fetchImpl(OPENAI_RESPONSES_URL, {
      method:'POST',
      headers:{ 'content-type':'application/json', authorization:`Bearer ${apiKey.trim()}` },
      body:JSON.stringify(requestBody),
    });
  } catch {
    throw new InterpreterProviderError('INTERPRETER_PROVIDER_ERROR', 502);
  }
  if (!response || !response.ok) throw new InterpreterProviderError('INTERPRETER_PROVIDER_ERROR', 502);
  let payload;
  try { payload = await response.json(); }
  catch { throw new InterpreterProviderError('INTERPRETER_INVALID_OUTPUT', 502); }
  const raw = outputText(payload);
  if (!raw) throw new InterpreterProviderError('INTERPRETER_INVALID_OUTPUT', 502);
  let decision;
  try { decision = JSON.parse(raw); }
  catch { throw new InterpreterProviderError('INTERPRETER_INVALID_OUTPUT', 502); }
  return gateGoClientManagerDecision(decision);
}

export const GO_CLIENT_MANAGER_MODEL = MODEL;
