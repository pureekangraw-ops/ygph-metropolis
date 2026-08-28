import { withRuntimeSession } from '../greenfield/runtime-session.mjs';
import { prepareMasterExecution, executePreparedMasterIntent } from '../greenfield/master-input-router.mjs';
import { routeMasterInputText } from '../lighthouse/master-input-route.mjs';
import { createRecoverySession, applySessionOwnerInput } from '../lighthouse/master-input-recovery-session.mjs';
import { createPathKernel } from '../lighthouse/path-kernel.mjs';
import { createExpenseCapability } from '../lighthouse/capabilities/expense.mjs';

const STATES = Object.freeze(['IDLE','INTERPRETING','READY','ASK','UNSUPPORTED','SUCCESS','ERROR']);
const $ = id => document.getElementById(id);
const localPathKernel = createPathKernel({ capabilities:[createExpenseCapability()] });
let preparedExecution = null;
let preparedPathRequest = null;
let currentIntent = null;
let activeRecoverySession = null;

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
    MASTER_INPUT_RUNTIME_LOCKED:'Runtime ของแอปยังไม่พร้อม กรุณาเข้าแอปใหม่',
    MASTER_INPUT_RESPONSE_INVALID:'คำตอบจากล่ามไม่ผ่านสัญญาระบบ',
    MASTER_INPUT_PATH_NOT_PROVEN:'PATH ยังยืนยันผลจริงไม่ได้',
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

async function withMasterRuntime(operation) {
  const workspace = $('workspace');
  if (!workspace || workspace.classList.contains('hidden')) throw new Error('MASTER_INPUT_RUNTIME_LOCKED');
  try {
    return await withRuntimeSession(async runtime => {
      const state = await runtime.readState();
      if (!state) throw new Error('MASTER_INPUT_RUNTIME_LOCKED');
      return operation(runtime);
    });
  } catch (error) {
    if (String(error?.message || error || '') === 'RUNTIME_SESSION_LOCKED') throw new Error('MASTER_INPUT_RUNTIME_LOCKED');
    throw error;
  }
}

function localRequestId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `MI-${uuid}` : `MI-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function localInputId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `MI-I-${uuid}` : `MI-I-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function localIntentFromRequest(request) {
  return Object.freeze({ action:'CREATE', object:'EXPENSE', fields:Object.freeze({ ...request.fields }) });
}

function showLocalStop(routed) {
  if (routed.status === 'RECOVERY_REQUIRED') {
    activeRecoverySession = createRecoverySession(routed, { inputId:localInputId() });
    setState('ASK', { title:'ขอแก้เฉพาะจุด', copy:'ข้อความนี้ยังมีจุดที่ต้องกู้หรือระบุให้ชัดก่อนส่งทำงาน', meta:'เปิด recovery session ในหน่วยความจำแล้ว · ยังไม่มีการเขียนข้อมูล' });
    return;
  }
  if (routed.status === 'REFERENCE') {
    setState('UNSUPPORTED', { title:'เป็นข้อความอ้างอิง', copy:'ข้อความนี้ยังไม่ได้สั่งให้บันทึก', meta:'ไม่มีการเขียนข้อมูล' });
    return;
  }
  if (routed.status === 'BLOCKED') {
    setState('UNSUPPORTED', { title:'ไม่ส่งทำงาน', copy:'ตรวจพบคำห้าม จึงหยุดก่อน PATH และ Runtime', meta:'ไม่มีการเขียนข้อมูล' });
    return;
  }
  setState('UNSUPPORTED', { title:'ยังไม่รองรับ', copy:'เข้าใจความหมายส่วนนี้แล้ว แต่ปลายทางยังทำตามเงื่อนไขนี้ไม่ได้', meta:'เก็บความหมายไว้และไม่มีการเขียนข้อมูล' });
}

function handlePendingRecoveryInput(text) {
  if (!activeRecoverySession) return { status:'NEW_INPUT', payload:text };
  const recoveryInput = applySessionOwnerInput(activeRecoverySession, text);
  activeRecoverySession = recoveryInput.state;

  if (recoveryInput.status === 'NEW_INPUT') return recoveryInput;
  if (recoveryInput.status === 'REPLACE') {
    activeRecoverySession = recoveryInput.state;
    activeRecoverySession = null;
    return recoveryInput;
  }
  if (recoveryInput.status === 'APPLIED') {
    setState('ASK', {
      title:'รับการแก้ไขแล้ว',
      copy:'แก้จุดที่เลือกไว้ใน recovery session แล้ว',
      meta:'C2 ยังไม่ประกอบกลับหรือส่งทำงานอัตโนมัติ · ไม่มีการเขียนข้อมูล',
    });
    return recoveryInput;
  }
  if (recoveryInput.status === 'SELECTION_REQUIRED') {
    setState('ASK', {
      title:'มีหลายจุดให้แก้',
      copy:'ระบุจุดที่ต้องการแก้ก่อน เพื่อไม่เดาบ้านของค่าใหม่',
      meta:'ยังไม่มีการเขียนข้อมูล',
    });
    return recoveryInput;
  }
  setState('ASK', {
    title:'ยังแก้จุดนี้ไม่ได้',
    copy:'ไม่พบจุดที่ตรงกับการแก้ไขนี้ใน recovery session ปัจจุบัน',
    meta:'ยังไม่มีการเขียนข้อมูล',
  });
  return recoveryInput;
}

async function interpretCurrentText() {
  let text = $('masterInputText').value.trim();
  if (!text) return;
  preparedExecution = null;
  preparedPathRequest = null;
  currentIntent = null;

  const recoveryInput = handlePendingRecoveryInput(text);
  if (recoveryInput.status === 'APPLIED' || recoveryInput.status === 'SELECTION_REQUIRED' || recoveryInput.status === 'NO_MATCH') return;
  if (recoveryInput.status === 'REPLACE') {
    text = recoveryInput.payload;
    $('masterInputText').value = text;
  }

  setState('INTERPRETING', { title:'กำลังตีความ', copy:'ยังไม่มีการเขียนข้อมูล' });
  try {
    const receivedAt = new Date().toISOString();
    const routed = await routeMasterInputText(text, {
      receivedAt,
      timeZone:'Asia/Bangkok',
      requestIdFactory:localRequestId,
      interpretFallback:requestInterpretation,
    });

    if (routed.route === 'STOP') {
      showLocalStop(routed);
      return;
    }

    if (routed.route === 'LOCAL_PATH') {
      preparedPathRequest = routed.prepared.request;
      currentIntent = localIntentFromRequest(preparedPathRequest);
      setState('READY', { title:'ระบบเข้าใจว่า', copy:previewText(currentIntent), meta:'Local Intent ผ่าน safety gate และเตรียม PATH แล้ว · ยังไม่มีการเขียนข้อมูล', execute:true });
      return;
    }

    const intent = routed.intent;
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
    preparedExecution = await withMasterRuntime(runtime => prepareMasterExecution(intent, { projection:runtime.project() }));
    setState('READY', { title:'ระบบเข้าใจว่า', copy:previewText(intent), meta:'ตรวจขอบเขตและสถานะใน Runtime ที่เปิดอยู่แล้ว', execute:true });
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
  if ((!preparedPathRequest && !preparedExecution) || !currentIntent) return;
  setState('INTERPRETING', { title:'กำลังดำเนินการ', copy:'Runtime กำลังตรวจและอ่านกลับผลจริง' });

  if (preparedPathRequest) {
    try {
      const output = await withMasterRuntime(async runtime => {
        const result = await localPathKernel.run(preparedPathRequest, { runtime });
        if (result.status !== 'COMPLETE') throw new Error('MASTER_INPUT_PATH_NOT_PROVEN');
        return { result, projection:runtime.project() };
      });
      const readback = {
        ...output.result.readback,
        ledgerBalanceSatang:Number(output.projection?.ledgerBalanceSatang ?? 0),
      };
      setState('SUCCESS', {
        title:'บันทึกและอ่านกลับแล้ว',
        copy:readbackText(currentIntent.object, readback),
        meta:'ผลนี้ผ่าน PATH และมาจาก durable readback',
      });
      preparedPathRequest = null;
      globalThis.dispatchEvent(new CustomEvent('ygph:daily-lifecycle'));
    } catch (error) {
      setState('ERROR', { title:'PATH ยังยืนยันผลไม่ได้', copy:friendlyError(error), meta:'ยังเก็บ operation เดิมไว้ให้ retry โดยไม่สร้าง request ใหม่', execute:true });
    }
    return;
  }

  try {
    const result = await withMasterRuntime(runtime => executePreparedMasterIntent(runtime, preparedExecution));
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
  }
}

installStyle();
createShell();