import { withRuntimeSession } from '../greenfield/runtime-session.mjs';
import { prepareMasterExecution, executePreparedMasterIntent } from '../greenfield/master-input-router.mjs';
import { routeMasterInputText } from '../lighthouse/master-input-route.mjs';
import { executeFrontdoorMultiGroupBoxes } from '../lighthouse/multi-group-frontdoor-runtime.mjs';
import {
  createFrontdoorMultiGroupRecoverySession,
  updateFrontdoorMultiGroupRecoverySession,
  rejoinFrontdoorMultiGroupRecoverySession,
} from '../lighthouse/multi-group-frontdoor-recovery.mjs';
import {
  createRecoverySession,
  applySessionOwnerInput,
  rejoinRecoverySession,
  waitingDirectiveForSession,
} from '../lighthouse/master-input-recovery-session.mjs';
import { createPathKernel } from '../lighthouse/path-kernel.mjs';
import { createExpenseCapability } from '../lighthouse/capabilities/expense.mjs';

const STATES = Object.freeze(['IDLE','INTERPRETING','READY','ASK','WAITING','UNSUPPORTED','SUCCESS','ERROR']);
const STATE_LABELS = Object.freeze({ WAITING:'รอ' });
const $ = id => document.getElementById(id);
const localPathKernel = createPathKernel({ capabilities:[createExpenseCapability()] });
let preparedExecution = null;
let preparedPathRequest = null;
let preparedMultiGroupRoute = null;
let currentIntent = null;
let activeRecoverySession = null;
let activeRecoverySelection = null;

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

function commandStatusText(commands = []) {
  return commands.map(command => `${command.rawText || command.groupId || 'คำสั่ง'} · ${command.status}`).join(' · ');
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
      <p id="masterInputQuestionBox" hidden>คำถาม · <mark id="masterInputQuestion"></mark></p>
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
  $('masterInputState').textContent = STATE_LABELS[state] ?? state;
  const result = $('masterInputResult');
  result.classList.toggle('master-input-error', state === 'ERROR');
  if (state !== 'WAITING') delete result.dataset.waitingDirective;
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

function submitRecoveryValue(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return;
  $('masterInputText').value = `แก้ไข ${normalized}`;
  $('masterInputForm').requestSubmit();
}

function renderWaitingDirective(directive) {
  if (!directive) return;
  const result = $('masterInputResult');
  result.dataset.waitingDirective = directive.type;
  const actions = $('masterInputActions');

  if (directive.type === 'SELECT_TARGET' && directive.options.length) {
    for (const option of directive.options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = option.label;
      button.addEventListener('click', () => {
        activeRecoverySelection = option.value;
        $('masterInputMeta').textContent = `${directive.telemetryTag} · เลือกจุดแล้ว กรอกคำตอบเพื่อทำงานเดิมต่อ`;
      });
      actions.append(button);
    }
    return;
  }

  if (directive.type === 'PICK_DATE') {
    const picker = document.createElement('input');
    picker.type = 'datetime-local';
    picker.setAttribute('aria-label', 'เลือกวันที่และเวลา');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'ใช้วันที่นี้';
    button.addEventListener('click', () => submitRecoveryValue(picker.value));
    actions.append(picker, button);
    return;
  }

  if (directive.type === 'ENTER_VALUE') {
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.placeholder = 'กรอกค่า';
    input.setAttribute('aria-label', 'กรอกข้อมูลที่ขาด');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'ใช้ค่านี้';
    button.addEventListener('click', () => submitRecoveryValue(input.value));
    actions.append(input, button);
  }
}

function showWaitingSession({ title = 'รอข้อมูลเพิ่ม', copy = null, meta = null } = {}) {
  const directive = activeRecoverySession?.uiDirective ?? waitingDirectiveForSession(activeRecoverySession);
  const fallback = 'งานเดิมหยุดรอข้อมูลที่ยังขาดอยู่';
  const defaultMeta = directive
    ? `${directive.telemetryTag} · ${directive.type} · ยังไม่มีการเขียนข้อมูล`
    : 'WAITING · ยังไม่มีการเขียนข้อมูล';
  setState('WAITING', {
    title,
    copy:copy || directive?.prompt || fallback,
    meta:meta || defaultMeta,
  });
  renderWaitingDirective(directive);
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
      return operation(runtime, state);
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

function localPauseId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `MI-P-${uuid}` : `MI-P-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function localIntentFromRequest(request) {
  return Object.freeze({ action:'CREATE', object:'EXPENSE', fields:Object.freeze({ ...request.fields }) });
}

async function showLocalStop(routed) {
  if (routed.status === 'RECOVERY_REQUIRED') {
    const pauseContext = await withMasterRuntime((_runtime, state) => ({ baseRevision:state.revision }));
    activeRecoverySession = createRecoverySession(routed, {
      inputId:localInputId(),
      pauseId:localPauseId(),
      baseRevision:pauseContext.baseRevision,
    });
    activeRecoverySelection = null;
    showWaitingSession({ title:'รอให้ระบุเฉพาะจุด' });
    return;
  }
  if (routed.status === 'WAITING') {
    setState('WAITING', {
      title:'รอข้อมูลของคำสั่งนี้',
      copy:commandStatusText(routed.commands),
      meta:'คำสั่งที่ยังไม่พร้อมจะไม่ถูกส่งทำงาน',
    });
    return;
  }
  if (routed.status === 'REFERENCE') {
    setState('UNSUPPORTED', { title:'เป็นข้อความอ้างอิง', copy:'ข้อความนี้ยังไม่ได้สั่งให้บันทึก', meta:'ไม่มีการเขียนข้อมูล' });
    return;
  }
  if (routed.status === 'BLOCKED') {
    setState('UNSUPPORTED', { title:'ไม่ส่งทำงาน', copy:commandStatusText(routed.commands) || 'คำสั่งนี้ยังไม่ผ่าน capability gate', meta:'ไม่มีการเขียนข้อมูล' });
    return;
  }
  setState('UNSUPPORTED', { title:'ยังไม่รองรับ', copy:'เข้าใจความหมายส่วนนี้แล้ว แต่ปลายทางยังทำตามเงื่อนไขนี้ไม่ได้', meta:'เก็บความหมายไว้และไม่มีการเขียนข้อมูล' });
}

function handlePendingRecoveryInput(text) {
  if (!activeRecoverySession) return { status:'NEW_INPUT', payload:text };
  const recoveryInput = applySessionOwnerInput(activeRecoverySession, text, { selection:activeRecoverySelection });

  if (recoveryInput.status === 'ABORTED') {
    activeRecoverySession = null;
    activeRecoverySelection = null;
    return recoveryInput;
  }

  activeRecoverySession = recoveryInput.state;
  if (recoveryInput.status === 'REPLACE') {
    activeRecoverySession = null;
    activeRecoverySelection = null;
    return recoveryInput;
  }
  if (recoveryInput.status === 'APPLIED') {
    activeRecoverySelection = null;
    return recoveryInput;
  }
  if (recoveryInput.status === 'SELECTION_REQUIRED') {
    showWaitingSession({
      title:'รอเลือกจุดที่จะตอบ',
      copy:'มีหลายจุดที่รับค่านี้ได้ เลือกจุดก่อนเพื่อไม่เดาแทน',
    });
    return recoveryInput;
  }
  showWaitingSession({
    title:'รอข้อมูลที่ตรงกับจุดค้าง',
    copy:'ยังจับคำตอบเข้ากับจุดที่รออยู่ไม่ได้',
  });
  return recoveryInput;
}

function markQuestion(routed) {
  const question = routed?.prepared?.parsed?.groups?.find(group => group.question)?.question;
  $('masterInputQuestionBox').hidden = !question;
  $('masterInputQuestion').textContent = question?.rawText || '';
}

async function answerLocalQuestion(routed) {
  markQuestion(routed);
  currentIntent = routed.intent;
  setState('INTERPRETING', { title:'กำลังค้นรายการ', copy:previewText(currentIntent), meta:'คำถาม · อ่านข้อมูลที่เก็บไว้เท่านั้น' });
  const result = await withMasterRuntime(async runtime => {
    const prepared = prepareMasterExecution(routed.intent, { projection:runtime.project() });
    return executePreparedMasterIntent(runtime, prepared);
  });
  const { found, record, matchCount, steps, selectionReason } = result.readback;
  const counts = steps.map(step => step.count).join(' → ');
  if (selectionReason === 'LATEST_RECORD_TIME_UNKNOWN') {
    setState('SUCCESS', {
      title:'พบรายการที่บันทึกแล้ว',
      copy:`พบ ${matchCount} รายการตรงกัน แต่ระบุรายการล่าสุดไม่ได้ เพราะเวลาบันทึกไม่ครบหรือไม่ถูกต้อง`,
      meta:`กรองตามกล่อง ${counts} · ยังไม่เลือกรายการใด · ไม่มีการเขียนข้อมูล`,
    });
    return;
  }
  const recordedAt = record?.createdAt && Number.isFinite(Date.parse(record.createdAt))
    ? new Intl.DateTimeFormat('th-TH', { dateStyle:'short', timeStyle:'short', timeZone:'Asia/Bangkok' }).format(new Date(record.createdAt))
    : 'ไม่ระบุเวลาบันทึก';
  setState('SUCCESS', {
    title:found ? 'พบรายการที่บันทึกแล้ว' : 'ไม่พบรายการตรงกัน',
    copy:record ? `${record.title} · ${formatSatang(record.amountSatang)} บาท · บันทึก ${recordedAt}` : 'ไม่พบรายการที่ตรงกับกล่องข้อมูลของคำถามนี้',
    meta:`กรองตามกล่อง ${counts}${record ? ` · ${record.recordId}` : ''}${matchCount > 1 ? ' · เลือกรายการล่าสุดที่ตรงกัน' : ''} · ไม่มีการเขียนข้อมูล`,
  });
}

async function interpretCurrentText() {
  let text = $('masterInputText').value.trim();
  if (!text) return;
  preparedExecution = null;
  preparedPathRequest = null;
  preparedMultiGroupRoute = null;
  currentIntent = null;
  markQuestion(null);

  const recoveryInput = handlePendingRecoveryInput(text);
  if (recoveryInput.status === 'SELECTION_REQUIRED' || recoveryInput.status === 'NO_MATCH') return;
  if (recoveryInput.status === 'ABORTED') {
    if (!recoveryInput.payload) {
      $('masterInputText').value = '';
      setState('IDLE');
      return;
    }
    text = recoveryInput.payload;
    $('masterInputText').value = text;
  }
  if (recoveryInput.status === 'APPLIED') {
    setState('INTERPRETING', { title:'กำลังประกอบผลแก้ไข', copy:'ยังไม่มีการเขียนข้อมูล' });
    try {
      if (recoveryInput.state?.mode === 'MULTI_GROUP') {
        const rejoined = await withMasterRuntime((_runtime, state) => rejoinFrontdoorMultiGroupRecoverySession(recoveryInput.state, {
          receivedAt:new Date().toISOString(),
          timeZone:'Asia/Bangkok',
          currentRevision:state.revision,
        }));
        text = rejoined.text;
        $('masterInputText').value = text;
        markQuestion(rejoined.routed);

        if (rejoined.routed.route === 'LOCAL_MULTI_GROUP') {
          preparedMultiGroupRoute = rejoined.routed;
          const readyCommands = rejoined.routed.commands.filter(command => command.status === 'READY');
          const waitingCommands = rejoined.routed.commands.filter(command => command.status === 'WAITING');
          if (waitingCommands.length > 0) {
            const refreshed = createFrontdoorMultiGroupRecoverySession(rejoined.routed, {
              inputId:recoveryInput.state.inputId,
              pauseId:recoveryInput.state.pauseId,
              baseRevision:rejoined.revalidation.currentRevision,
            });
            activeRecoverySession = updateFrontdoorMultiGroupRecoverySession(refreshed, rejoined.routed.commands);
            activeRecoverySelection = null;
            if (readyCommands.length === 0) {
              showWaitingSession({
                title:'รออีกจุดก่อนทำงานต่อ',
                copy:commandStatusText(rejoined.routed.commands),
              });
              return;
            }
          } else {
            activeRecoverySession = null;
            activeRecoverySelection = null;
          }
          const realityMeta = rejoined.revalidation.revisionChanged ? ' · ตรวจ durable revision ใหม่แล้ว' : '';
          setState('READY', {
            title:'ประกอบคำสั่งที่รอกลับแล้ว',
            copy:commandStatusText(rejoined.routed.commands),
            meta:`Resume กล่องเดิมด้วย compile identity เดิม${realityMeta} · COMPLETE เดิมจะไม่ถูกทำซ้ำ`,
            execute:readyCommands.length > 0,
          });
          return;
        }

        activeRecoverySession = null;
        activeRecoverySelection = null;
        await showLocalStop(rejoined.routed);
        return;
      }

      const rejoined = await withMasterRuntime((_runtime, state) => rejoinRecoverySession(recoveryInput.state, {
        receivedAt:new Date().toISOString(),
        timeZone:'Asia/Bangkok',
        requestIdFactory:localRequestId,
        currentRevision:state.revision,
        capabilityPreflight:request => localPathKernel.preflight(request),
      }));
      text = rejoined.text;
      $('masterInputText').value = text;
      markQuestion(rejoined.routed);

      if (rejoined.routed.route === 'LOCAL_QUERY') {
        await answerLocalQuestion(rejoined.routed);
        activeRecoverySession = null;
        activeRecoverySelection = null;
        return;
      }

      if (rejoined.routed.route === 'LOCAL_PATH') {
        activeRecoverySession = null;
        activeRecoverySelection = null;
        preparedPathRequest = rejoined.routed.prepared.request;
        currentIntent = localIntentFromRequest(preparedPathRequest);
        const realityMeta = rejoined.revalidation?.revisionChanged ? ' · ตรวจ durable revision ใหม่แล้ว' : '';
        setState('READY', {
          title:'ระบบเข้าใจว่า',
          copy:previewText(currentIntent),
          meta:`Recovery ประกอบกลับเข้า Local Intent/PATH แล้ว${realityMeta} · ยังไม่มีการเขียนข้อมูล`,
          execute:true,
        });
        return;
      }

      if (rejoined.routed.status === 'RECOVERY_REQUIRED') {
        activeRecoverySession = rejoined.recoverySession ?? recoveryInput.state;
        activeRecoverySelection = null;
        showWaitingSession({
          title:'รออีกจุดก่อนทำงานต่อ',
          copy:'ค่าที่แก้ถูกใส่กลับบ้านเดิมแล้ว แต่ยังมีจุดที่ต้องระบุเพิ่ม',
        });
        return;
      }

      activeRecoverySession = null;
      activeRecoverySelection = null;
      await showLocalStop(rejoined.routed);
      return;
    } catch (error) {
      setState('ERROR', { title:'ประกอบผลแก้ไขไม่สำเร็จ', copy:friendlyError(error), meta:'ไม่มีการเขียนข้อมูลจากคำสั่งนี้' });
      return;
    }
  }
  if (recoveryInput.status === 'REPLACE') {
    text = recoveryInput.payload;
    $('masterInputText').value = text;
  }

  setState('INTERPRETING', { title:'กำลังตีความ', copy:'ยังไม่มีการเขียนข้อมูล' });
  try {
    const receivedAt = new Date().toISOString();
    const routeContext = await withMasterRuntime((_runtime, state) => ({ baseRevision:state.revision }));
    const routed = await routeMasterInputText(text, {
      receivedAt,
      timeZone:'Asia/Bangkok',
      baseRevision:routeContext.baseRevision,
      requestIdFactory:localRequestId,
      interpretFallback:requestInterpretation,
    });
    markQuestion(routed);

    if (routed.route === 'LOCAL_QUERY') {
      await answerLocalQuestion(routed);
      return;
    }

    if (routed.route === 'LOCAL_MULTI_GROUP') {
      preparedMultiGroupRoute = routed;
      const readyCount = routed.commands.filter(command => command.status === 'READY').length;
      const waitingCount = routed.commands.filter(command => command.status === 'WAITING').length;
      const blockedCount = routed.commands.filter(command => command.status === 'BLOCKED').length;
      if (routed.commands.some(command => command.status === 'WAITING')) {
        activeRecoverySession = createFrontdoorMultiGroupRecoverySession(routed, {
          inputId:localInputId(),
          pauseId:localPauseId(),
          baseRevision:routeContext.baseRevision,
        });
        activeRecoverySelection = null;
      }
      if (readyCount === 0 && waitingCount > 0) {
        showWaitingSession({ title:'รอข้อมูลของคำสั่งนี้', copy:commandStatusText(routed.commands) });
        return;
      }
      setState('READY', {
        title:'แยกคำสั่งเป็นกล่องแล้ว',
        copy:commandStatusText(routed.commands),
        meta:`READY ${readyCount}${waitingCount ? ` · WAITING ${waitingCount}` : ''}${blockedCount ? ` · BLOCKED ${blockedCount}` : ''} · ยังไม่มีการเขียนข้อมูล`,
        execute:readyCount > 0,
      });
      return;
    }

    if (routed.route === 'STOP') {
      await showLocalStop(routed);
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
  if (!preparedMultiGroupRoute && (((!preparedPathRequest && !preparedExecution) || !currentIntent))) return;
  setState('INTERPRETING', { title:'กำลังดำเนินการ', copy:'Runtime กำลังตรวจและอ่านกลับผลจริง' });

  if (preparedMultiGroupRoute) {
    try {
      const result = await withMasterRuntime(runtime => executeFrontdoorMultiGroupBoxes(runtime, preparedMultiGroupRoute));
      const copy = commandStatusText(result.commands);
      if (activeRecoverySession?.mode === 'MULTI_GROUP') {
        activeRecoverySession = updateFrontdoorMultiGroupRecoverySession(activeRecoverySession, result.commands);
      }
      if (result.status === 'COMPLETE') {
        setState('SUCCESS', {
          title:'บันทึกและอ่านกลับแล้ว',
          copy,
          meta:'แต่ละคำสั่งขึ้น COMPLETE หลัง durable readback เท่านั้น',
        });
        preparedMultiGroupRoute = null;
        activeRecoverySession = null;
        activeRecoverySelection = null;
        globalThis.dispatchEvent(new CustomEvent('ygph:daily-lifecycle'));
        return;
      }

      preparedMultiGroupRoute = Object.freeze({ ...preparedMultiGroupRoute, commands:result.commands });
      if (result.commands.some(command => command.status === 'ERROR')) {
        setState('ERROR', { title:'มีคำสั่งที่ Runtime ทำไม่สำเร็จ', copy, meta:'แสดงสถานะจริงรายคำสั่ง · ไม่สรุปทั้งก้อนว่าเสร็จ', execute:true });
        return;
      }
      if (result.commands.some(command => command.status === 'BLOCKED')) {
        setState('UNSUPPORTED', { title:'มีคำสั่งที่ทำไม่ได้', copy, meta:'คำสั่ง BLOCKED ไม่ถูกส่งต่อ · สถานะคำสั่งอื่นยังคงแยกกัน' });
        return;
      }
      if (result.commands.some(command => command.status === 'WAITING')) {
        showWaitingSession({
          title:'ยังมีคำสั่งรอข้อมูล',
          copy,
          meta:'กล่องที่ COMPLETE ยืนยันจาก durable readback แล้ว · กล่อง WAITING ยังไม่ถูกทำ',
        });
        return;
      }
      setState('READY', { title:'ยังยืนยันผลไม่ครบ', copy, meta:'ยังไม่ประกาศ COMPLETE จนกว่า durable readback จะพิสูจน์ได้', execute:true });
    } catch (error) {
      setState('ERROR', { title:'Multi-Group หยุดอย่างปลอดภัย', copy:friendlyError(error), meta:'ไม่สรุปว่าเสร็จเมื่อยังตรวจ readback ไม่ครบ', execute:true });
    }
    return;
  }

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