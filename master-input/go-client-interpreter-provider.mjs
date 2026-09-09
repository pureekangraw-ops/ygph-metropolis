import { InterpreterProviderError, INTERPRETER_PROVIDER_MODEL } from './interpreter-provider.mjs';

const MODEL = INTERPRETER_PROVIDER_MODEL;
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

const INTENTS = Object.freeze([
  'SERVICE','PRICE','INCLUDED','MATERIALS','REVISION','SCOPE_CHANGE','TIMELINE','PAGE_COUNT',
  'OLD_FILE','UNORGANIZED_CONTENT','GRAPH_TABLE_DIAGRAM','PORTFOLIO','START','PRE_ESTIMATE','HELP','UNKNOWN',
]);
const JOB_TYPES = Object.freeze(['PROPOSAL','COMPANY_PROFILE','PORTFOLIO_CASE_STUDY','REPORT_SUMMARY','OTHER']);
const PACKAGES = Object.freeze(['STARTER','STANDARD','BUSINESS']);

const SYSTEM_PROMPT = `คุณเป็นตัวจำแนก intent สำหรับ GO Client ฝั่งรับงาน Presentation เท่านั้น
หน้าที่คืออ่านข้อความลูกค้าและคืนผลตาม schema ห้ามตอบขาย ห้ามคิดราคาใหม่ ห้ามสร้างเนื้อหา ห้ามสร้างข้อเท็จจริง

ประเภทงานหลัก:
- PROPOSAL
- COMPANY_PROFILE
- PORTFOLIO_CASE_STUDY
- REPORT_SUMMARY
- OTHER เมื่อโจทย์อยู่นอกกลุ่มหรือยังไม่แน่ใจ

กฎ:
- อย่าเดา pageCount ถ้าลูกค้าไม่ได้ระบุจำนวนหน้าชัดเจน
- อย่าเดา desiredDate ถ้าลูกค้าไม่ได้ระบุวัน/วันที่
- package ใช้เฉพาะเมื่อลูกค้าระบุ Starter / Standard / Business ชัดเจน
- wantsEstimate=true เมื่อขอให้ประเมินราคา/แพ็กเกจ/จำนวนหน้า/ระยะเวลา
- wantsManager=true เมื่อขอคนช่วยโดยตรง ขอเจ้าหน้าที่ หรือประเด็นต้องใช้ดุลยพินิจชัดเจน
- clientConfirmedComplete=true เมื่อบอกชัดว่าไฟล์/ข้อมูลที่ส่งมาคือทั้งหมดที่มีหรือครบแล้ว
- UNKNOWN ไม่ใช่ผิด ถ้า intent ยังไม่พอให้เลือกให้คืน UNKNOWN
- ห้ามคืน domain, Runtime method, command, owner authority หรือคำสั่ง mutation`;

const RESULT_SCHEMA = Object.freeze({
  type:'object',
  additionalProperties:false,
  properties:{
    intent:{ type:'string', enum:INTENTS },
    jobType:{ anyOf:[{ type:'string', enum:JOB_TYPES },{ type:'null' }] },
    package:{ anyOf:[{ type:'string', enum:PACKAGES },{ type:'null' }] },
    pageCount:{ anyOf:[{ type:'integer', minimum:1, maximum:500 },{ type:'null' }] },
    desiredDate:{ type:['string','null'] },
    wantsEstimate:{ type:'boolean' },
    wantsManager:{ type:'boolean' },
    clientConfirmedComplete:{ type:'boolean' },
  },
  required:['intent','jobType','package','pageCount','desiredDate','wantsEstimate','wantsManager','clientConfirmedComplete'],
});

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

function compactContext(context = {}) {
  const allowed = {
    stage:typeof context.stage === 'string' ? context.stage.slice(0, 40) : null,
    jobType:typeof context.jobType === 'string' ? context.jobType.slice(0, 40) : null,
    package:typeof context.package === 'string' ? context.package.slice(0, 40) : null,
  };
  return Object.entries(allowed).filter(([,value]) => value).map(([key,value]) => `${key}=${value}`).join('; ') || 'none';
}

export function buildGoClientInterpretRequest(text, context = {}) {
  if (typeof text !== 'string' || !text.trim()) throw new InterpreterProviderError('INTERPRETER_INVALID_INPUT', 400);
  return {
    model:MODEL,
    store:false,
    input:[
      { role:'system', content:SYSTEM_PROMPT },
      { role:'system', content:`current_context: ${compactContext(context)}` },
      { role:'user', content:text.trim() },
    ],
    max_output_tokens:260,
    text:{
      format:{
        type:'json_schema',
        name:'go_client_intent_v1',
        strict:true,
        schema:RESULT_SCHEMA,
      },
    },
  };
}

function exactKeys(object, expected) {
  const keys = Object.keys(object || {}).sort();
  return keys.length === expected.length && keys.every((key,index) => key === [...expected].sort()[index]);
}

export function gateGoClientProposal(proposal) {
  const required = ['intent','jobType','package','pageCount','desiredDate','wantsEstimate','wantsManager','clientConfirmedComplete'];
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal) || !exactKeys(proposal, required)) {
    throw new InterpreterProviderError('INTERPRETER_INVALID_OUTPUT', 502);
  }
  if (!INTENTS.includes(proposal.intent)) throw new InterpreterProviderError('INTERPRETER_INVALID_OUTPUT', 502);
  if (proposal.jobType !== null && !JOB_TYPES.includes(proposal.jobType)) throw new InterpreterProviderError('INTERPRETER_INVALID_OUTPUT', 502);
  if (proposal.package !== null && !PACKAGES.includes(proposal.package)) throw new InterpreterProviderError('INTERPRETER_INVALID_OUTPUT', 502);
  if (proposal.pageCount !== null && (!Number.isInteger(proposal.pageCount) || proposal.pageCount < 1 || proposal.pageCount > 500)) throw new InterpreterProviderError('INTERPRETER_INVALID_OUTPUT', 502);
  if (proposal.desiredDate !== null && typeof proposal.desiredDate !== 'string') throw new InterpreterProviderError('INTERPRETER_INVALID_OUTPUT', 502);
  for (const key of ['wantsEstimate','wantsManager','clientConfirmedComplete']) {
    if (typeof proposal[key] !== 'boolean') throw new InterpreterProviderError('INTERPRETER_INVALID_OUTPUT', 502);
  }
  return {
    intent:proposal.intent,
    jobType:proposal.jobType,
    package:proposal.package,
    pageCount:proposal.pageCount,
    desiredDate:proposal.desiredDate,
    wantsEstimate:proposal.wantsEstimate,
    wantsManager:proposal.wantsManager,
    clientConfirmedComplete:proposal.clientConfirmedComplete,
  };
}

export async function interpretGoClientTextWithOpenAI({ apiKey, text, context = {}, fetchImpl = globalThis.fetch } = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new InterpreterProviderError('INTERPRETER_NOT_CONFIGURED', 503);
  if (typeof fetchImpl !== 'function') throw new InterpreterProviderError('INTERPRETER_PROVIDER_UNAVAILABLE', 503);
  const requestBody = buildGoClientInterpretRequest(text, context);
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
  const textOutput = outputText(payload);
  if (!textOutput) throw new InterpreterProviderError('INTERPRETER_INVALID_OUTPUT', 502);
  let proposal;
  try { proposal = JSON.parse(textOutput); }
  catch { throw new InterpreterProviderError('INTERPRETER_INVALID_OUTPUT', 502); }
  return gateGoClientProposal(proposal);
}

export const GO_CLIENT_PROVIDER_MODEL = MODEL;
