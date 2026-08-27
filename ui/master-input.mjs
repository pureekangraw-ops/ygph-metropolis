import { openGreenfieldRuntimeWithDevicePin } from '../greenfield/runtime.mjs';
import { prepareMasterExecution, executePreparedMasterIntent } from '../greenfield/master-input-router.mjs';

const STATES = Object.freeze(['IDLE','INTERPRETING','READY','ASK','UNSUPPORTED','SUCCESS','ERROR']);
const $ = id => document.getElementById(id);
let preparedExecution = null;
let currentIntent = null;

function installStyle() {
  if (document.querySelector('link[data-master-input-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'ui/master-input.css';
  link.dataset.masterInputStyle = 'true';
  document.head.append(link);
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateGatedIntent(value) {
  if (!plainObject(value) || value.version !== '1' || !STATES.includes(value.status)) throw new Error('MASTER_INPUT_RESPONSE_INVALID');
  if (!['READY','ASK','UNSUPPORTED'].includes(value.status)) throw new Error('MASTER_INPUT_RESPONSE_INVALID');
  if (!['CREATE','QUERY','UPDATE','DELETE','UNKNOWN'].includes(value.action)) throw new Error('MASTER_INPUT_RESPONSE_INVALID');
  if (!['EXPENSE','OTHER_INCOME','RIDE_START','RIDE_JOB','RIDE_END','RIDE_TODAY_SUMMARY','SALE','PURCHASE','UNKNOWN'].includes(value.object)) throw new Error('MASTER_INPUT_RESPONSE_INVALID');
  if (!plainObject(value.fields)) throw new Error('MASTER_INPUT_RESPONSE_INVALID');
  const expected = ['title','amountSatang','paymentMode','note'];
  if (Object.keys(value.fields).some(key => !expected.includes(key)) || expected.some(key => !(key in value.fields))) throw new Error('MASTER_INPUT_RESPONSE_INVALID');
  if (value.fields.amountSatang != null && (!Number.isSafeInteger(value.fields.amountSatang) || value.fields.amountSatang <= 0)) throw new Error('MASTER_INPUT_RESPONSE_INVALID');
  if (value.fields.paymentMode != null && !['CASH','CREDIT'].includes(value.fields.paymentMode)) throw new Error('MASTER_INPUT_RESPONSE_INVALID');
  if (!Array.isArray(value.missing) || typeof value.manual !== 'boolean') throw new Error('MASTER_INPUT_RESPONSE_INVALID');
  return value;
}

function formatSatang(value) {
  const amount = Number(value || 0) / 100;
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits:0, maximumFractionDigits:2 }).format(amount);
}

function previewText(intent) {
  const fields = intent.fields || {};
  const amount = fields.amountSatang == null ? '' : ` ${formatSatang(fields.amountSatang)} บาท`;
  if (intent.object === 'EXPENSE') return `รายจ่าย · ${fields.title || 'รายการ'} ·${amount}`;
  if (intent.object === 'OTHER_INCOME') return `รายรับอื่น · ${fields.title || 'รายการ'} ·${amount}`;
  if (intent.object === 'RIDE_START') return 'เริ่มรอบวิ่งใหม่';
  if (intent.object === 'RIDE_END') return 'จบรอบวิ่งที่กำลังทำงาน';
  if (intent.object === 'RIDE_JOB') return `งานวิ่ง${amount} · ${fields.paymentMode === 'CASH' ? 'เงินสด' : 'เครดิต'}`;
  if (intent.object === 'RIDE_TODAY_SUMMARY') return 'ดูยอดวิ่งของวันนี้';
  return 'รายการนี้ยังไม่รองรับ';
}

function readbackText(object, readback = {}) {
  if (object === 'EXPENSE' || object === 'OTHER_INCOME') {
    const direction = readback.direction === 'OUT' ? 'เงินออก' : 'เงินเข้า';
    return `${direction} ${formatSatang(readback.amountSatang)} บาท · คงเหลือ ${formatSatang(readback.ledgerBalanceSatang)} บาท`;
  }
  if (object === 'RIDE_START') return 'รอบวิ่งเริ่มแล้ว';
  if (object === 'RIDE_END') return 'รอบวิ่งจบและอ่านกลับแล้ว';
  if (object === 'RIDE_JOB') return `งาน ${formatSatang(readback.amountSatang)} บาท · วันนี้สร้างได้ ${formatSatang(readback.generatedSatang)} บาท`;
  if (object === 'RIDE_TODAY_SUMMARY') {
    return `สร้างได้ ${formatSatang(readback.generatedSatang)} บาท · เงินสด ${formatSatang(readback.cashJobSatang)} · เครดิต ${formatSatang(readback.creditJobSatang)} · ค่าใช้จ่าย ${formatSatang(readback.expenseSatang)}`;
  }
  return 'อ่านกลับสำเร็จ';
}

function friendlyError(error) {
  const code = String(error?.code || error?.message || error || 'MASTER_INPUT_ERROR');
  const map = {
    INTERPRETER_NOT_CONFIGURED:'ล่ามยังไม่พร้อมใช้งาน',
    INTERPRETER_PROVIDER_ERROR:'ล่ามติดต่อผู้ให้บริการไม่สำเร็จ',
    INTERPRETER_INVALID_OUTPUT:'ล่ามส่งความหมายที่ตรวจไม่ผ่าน',
    INTERPRETER_REFUSED:'ล่ามไม่สามารถตีความข้อความนี้ได้',
    RATE_LIMITED:'เรียกใช้งานถี่เกินไป ลองใหม่ภายหลัง',
    RATE_LIMITER_NOT_CONFIGURED:'ระบบจำกัดการเรียกใช้งานยังไม่พร้อม',
    MASTER_INPUT_RIDE_ROUND_REQUIRED:'ยังไม่มีรอบวิ่งที่กำลังทำงาน',
    MASTER_INPUT_RIDE_ROUND_ACTIVE:'มีรอบวิ่งกำลังทำงานอยู่แล้ว',
    MASTER_INPUT_RUNTIME_LOCKED:'กรุณาปลดล็อกแอปก่อนใช้ Master Input',
    DEVICE_PIN_INVALID:'รหัสผ่านไม่ถูกต้อง',
    MASTER_INPUT_RESPONSE_INVALID:'คำตอบจากล่ามไม่ผ่านสัญญาระบบ',
  };
  return map[code] || 'ดำเนินการไม่สำเร็จ';
}

function createShell() {
  const workspace = $('workspace');
  if (!workspace || $('masterInputShell')) return;
  const shell = document.createElement('section');
  shell.id = 'masterInputShell';
  shell.className = 'master-input-shell';
  shell.setAttribute('aria-label', 'Master Input');
  shell.innerHTML = `
    <div class="master-input-head">
      <div><small>MASTER INPUT</small><h2>พิมพ์ตามที่พูดจริงได้เลย</h2></div>
      <span id="masterInputState" class="master-input-state">IDLE</span>
    </div>
    <form id="masterInputForm" class="master-input-form">
      <textarea id="masterInputText" rows="1" maxlength="1200" placeholder="เช่น ข้าว 65 · งาน 380 เงินสด · วันนี้วิ่งได้เท่าไร" aria-label="ข้อความ Master Input" required></textarea>
      <button id="masterInputInterpret" class="primary-action" type="submit">ตีความ</button>
    </form>
    <div id="masterInputResult" class="master-input-result" aria-live="polite" hidden>
      <strong id="masterInputTitle"></strong>
      <p id="masterInputCopy"></p>
      <p id="masterInputMeta" class="muted"></p>
      <div id="masterInputActions" class="master-input-actions"></div>
    </div>`;
  workspace.prepend(shell);

  $('masterInputForm').addEventListener('submit', event => {
    event.preventDefault();
    void interpretCurrentText();
  });
  $('masterInputText').addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      $('masterInputForm').requestSubmit();
    }
  });
}

function setState(state, { title = '', copy = '', meta = '', execute = false } = {}) {
  if (!STATES.includes(state)) throw new Error('MASTER_INPUT_UI_STATE_INVALID');
  $('masterInputState').textContent = state;
  const result = $('masterInputResult');
  result.classList.toggle('master-input-error', state === 'ERROR');
  const show = Boolean(title || copy || meta || execute);
  result.hidden = !show;
  $('masterInputTitle').textContent = title;
  $('masterInputCopy').textContent = copy;
  $('masterInputMeta').textContent = meta;
  const actions = $('masterInputActions');
  actions.replaceChildren();
  if (execute) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'primary-action';
    button.textContent = currentIntent?.action === 'QUERY' ? 'ดูข้อมูล' : 'บันทึก';
    button.addEventListener('click', () => void executePrepared());
    actions.append(button);
  }
  const busy = state === 'INTERPRETING';
  $('masterInputInterpret').disabled = busy;
  $('masterInputText').disabled = busy;
}

async function requestInterpretation(text) {
  const response = await fetch('/api/v1/interpret', {
    method:'POST',
    headers:{ 'content-type':'application/json' },
    body:JSON.stringify({ version:'1', text, context:{} }),
  });
  let body;
  try { body = await response.json(); } catch { throw new Error('MASTER_INPUT_RESPONSE_INVALID'); }
  if (!response.ok) {
    const error = new Error(String(body?.code || 'MASTER_INPUT_BACKEND_ERROR'));
    error.code = body?.code || 'MASTER_INPUT_BACKEND_ERROR';
    throw error;
  }
  return validateGatedIntent(body);
}

async function openRuntime() {
  const workspace = $('workspace');
  if (!workspace || workspace.classList.contains('hidden')) throw new Error('MASTER_INPUT_RUNTIME_LOCKED');
  const pin = String($('devicePin')?.value || '');
  if (pin.length < 6) throw new Error('MASTER_INPUT_RUNTIME_LOCKED');
  const runtime = await openGreenfieldRuntimeWithDevicePin({ pin });
  const state = await runtime.readState();
  if (!state) {
    runtime.close();
    throw new Error('MASTER_INPUT_RUNTIME_LOCKED');
  }
  return runtime;
}

async function interpretCurrentText() {
  const text = $('masterInputText').value.trim();
  if (!text) return;
  preparedExecution = null;
  currentIntent = null;
  setState('INTERPRETING', { title:'กำลังตีความ', copy:'ยังไม่มีการเขียนข้อมูล' });
  try {
    const intent = await requestInterpretation(text);
    currentIntent = intent;
    if (intent.status === 'ASK') {
      setState('ASK', { title:'ขอข้อมูลเพิ่ม', copy:intent.question || 'ข้อมูลยังไม่พอสำหรับดำเนินการ', meta:'ยังไม่มีการเขียนข้อมูล' });
      return;
    }
    if (intent.status === 'UNSUPPORTED') {
      const meta = intent.manual ? 'รายการแก้ไขยังทำจากหน้าจอเดิม' : 'Master Input v1 จะไม่ทำรายการนี้';
      setState('UNSUPPORTED', { title:'ยังไม่รองรับ', copy:intent.question || 'รายการนี้อยู่นอกขอบเขต v1', meta });
      return;
    }
    let runtime = null;
    try {
      runtime = await openRuntime();
      preparedExecution = prepareMasterExecution(intent, { projection:runtime.project() });
    } finally { runtime?.close(); }
    setState('READY', { title:'ระบบเข้าใจว่า', copy:previewText(intent), meta:'ตรวจขอบเขตและสถานะในเครื่องแล้ว', execute:true });
  } catch (error) {
    const code = String(error?.code || error?.message || '');
    if (code === 'MASTER_INPUT_RIDE_ROUND_REQUIRED') {
      setState('ASK', { title:'ยังทำรายการนี้ไม่ได้', copy:friendlyError(error), meta:'ยังไม่มีการเขียนข้อมูล' });
      return;
    }
    if (code === 'MASTER_INPUT_RIDE_ROUND_ACTIVE') {
      setState('UNSUPPORTED', { title:'สถานะไม่อนุญาต', copy:friendlyError(error), meta:'ยังไม่มีการเขียนข้อมูล' });
      return;
    }
    setState('ERROR', { title:'Master Input หยุดอย่างปลอดภัย', copy:friendlyError(error), meta:'ไม่มีการเขียนข้อมูลจากคำสั่งนี้' });
  }
}

async function executePrepared() {
  if (!preparedExecution || !currentIntent) return;
  setState('INTERPRETING', { title:'กำลังดำเนินการ', copy:'Runtime กำลังตรวจและอ่านกลับผลจริง' });
  let runtime = null;
  try {
    runtime = await openRuntime();
    const result = await executePreparedMasterIntent(runtime, preparedExecution);
    const query = currentIntent.action === 'QUERY';
    setState('SUCCESS', {
      title:query ? 'อ่านข้อมูลแล้ว' : 'บันทึกและอ่านกลับแล้ว',
      copy:readbackText(currentIntent.object, result.readback),
      meta:query ? 'QUERY ไม่ได้แก้ไขข้อมูล' : result.recovered ? 'ตรวจพบ retry และยืนยัน truth เดิมโดยไม่เขียนซ้ำ' : 'ผลนี้มาจาก durable readback',
    });
    preparedExecution = null;
    if (!query) globalThis.dispatchEvent(new CustomEvent('ygph:daily-lifecycle'));
  } catch (error) {
    setState('ERROR', { title:'Runtime หยุดอย่างปลอดภัย', copy:friendlyError(error), meta:'ตรวจ readback ไม่สำเร็จ จึงไม่สรุปว่าเสร็จ' });
  } finally { runtime?.close(); }
}

installStyle();
createShell();
