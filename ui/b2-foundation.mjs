import { withRuntimeSession } from '../greenfield/runtime-session.mjs';
import { translateIntentToAppLanguage } from '../foundation/output-gate.mjs';
import { FOUNDATION_MANUAL_AREAS, executeManualAppLanguage } from '../foundation/manual-runtime.mjs';

const $ = id => document.getElementById(id);
let pendingAppLanguage = null;
let selectedArea = 'OUTCOME';
let installed = false;

function installStyle() {
  if (document.querySelector('link[data-b2-foundation-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'ui/b2-foundation.css';
  link.dataset.b2FoundationStyle = 'true';
  document.head.append(link);
}

function createShell() {
  const workspace = $('workspace');
  if (!workspace || $('b2Workspace')) return;
  const shell = document.createElement('section');
  shell.id = 'b2Workspace';
  shell.className = 'b2-workspace hidden';
  shell.setAttribute('aria-label', 'YGPH Personal Helper');
  shell.innerHTML = `
    <nav class="b2-tabs" aria-label="โหมดทำงาน">
      <button type="button" data-b2-tab="ai" class="active">AI</button>
      <button type="button" data-b2-tab="manual">Manual</button>
    </nav>

    <section class="b2-page active" data-b2-page="ai">
      <header class="b2-page-head"><small>PERSONAL HELPER</small><h1>คุยกับ YGPH</h1></header>
      <div id="b2Conversation" class="b2-conversation" aria-live="polite"></div>
      <form id="b2AiForm" class="b2-composer">
        <input name="text" autocomplete="off" maxlength="1200" placeholder="พิมพ์ เช่น ข้าว 65" required>
        <button class="primary-action" type="submit">ตีความ</button>
      </form>
      <section class="b2-preview" aria-labelledby="b2PreviewTitle">
        <small id="b2PreviewTitle">App Language</small>
        <pre id="b2AppLanguage" class="b2-code">—</pre>
      </section>
      <button id="b2SendToManual" type="button" disabled>ส่งเข้า Manual</button>
    </section>

    <section class="b2-page" data-b2-page="manual" hidden>
      <header class="b2-page-head"><small>AUDIT + CONTROL</small><h1>Manual</h1></header>
      <div id="b2ManualAreas" class="b2-area-tabs" role="tablist" aria-label="พื้นที่ Manual"></div>
      <form id="b2ManualForm" class="b2-manual-form">
        <label>รายการ <input name="title" autocomplete="off" required></label>
        <label>จำนวน (บาท) <input name="amount" inputmode="decimal" required></label>
        <button class="primary-action" type="submit">บันทึก</button>
      </form>
      <div id="b2ManualResult" class="b2-list" aria-live="polite"></div>
      <details class="b2-audit"><summary>Audit</summary><pre id="b2Audit" class="b2-code">—</pre></details>
    </section>

    <p id="b2Status" class="status" aria-live="polite"></p>`;
  workspace.before(shell);

  shell.querySelectorAll('[data-b2-tab]').forEach(button => {
    button.addEventListener('click', () => setPage(button.dataset.b2Tab));
  });
  $('b2AiForm').addEventListener('submit', event => {
    event.preventDefault();
    void interpretAiText();
  });
  $('b2SendToManual').addEventListener('click', () => void sendPendingToManual());
  $('b2ManualForm').addEventListener('submit', event => {
    event.preventDefault();
    void submitManualForm(event.currentTarget);
  });
  renderAreaTabs();
}

function setPage(page) {
  document.querySelectorAll('[data-b2-tab]').forEach(button => button.classList.toggle('active', button.dataset.b2Tab === page));
  document.querySelectorAll('[data-b2-page]').forEach(node => {
    const active = node.dataset.b2Page === page;
    node.classList.toggle('active', active);
    node.hidden = !active;
  });
  if (page === 'manual') void refreshManual();
}

function areaById(id) {
  return FOUNDATION_MANUAL_AREAS.find(area => area.id === id) || FOUNDATION_MANUAL_AREAS[0];
}

function renderAreaTabs() {
  const host = $('b2ManualAreas');
  if (!host) return;
  host.replaceChildren();
  for (const area of FOUNDATION_MANUAL_AREAS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.b2Area = area.id;
    button.setAttribute('role', 'tab');
    button.textContent = area.id;
    button.classList.toggle('active', area.id === selectedArea);
    button.addEventListener('click', () => {
      selectedArea = area.id;
      renderAreaTabs();
      void refreshManual();
    });
    host.append(button);
  }
  const form = $('b2ManualForm');
  if (form) form.hidden = areaById(selectedArea)?.mode !== 'execute';
}

function setStatus(message = '', error = false) {
  const node = $('b2Status');
  if (!node) return;
  node.textContent = message;
  node.classList.toggle('error', Boolean(error));
}

function addConversation(role, text) {
  const host = $('b2Conversation');
  if (!host) return;
  const row = document.createElement('p');
  row.className = `b2-message ${role}`;
  row.textContent = text;
  host.append(row);
  host.scrollTop = host.scrollHeight;
}

function formatSatang(value) {
  const number = Number(value ?? 0) / 100;
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits:0, maximumFractionDigits:2 }).format(number);
}

function parseBaht(value) {
  const normalized = String(value ?? '').replace(/,/g, '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error('กรอกจำนวนเงินให้ถูกต้อง');
  const [whole, fraction = ''] = normalized.split('.');
  const satang = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(satang) || satang <= 0) throw new Error('จำนวนเงินต้องมากกว่า 0');
  return satang;
}

function makeId(prefix) {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function intentSummary(intent) {
  const amount = intent?.fields?.amountSatang == null ? '' : ` ${formatSatang(intent.fields.amountSatang)} บาท`;
  if (intent?.object === 'EXPENSE') return `รายจ่าย · ${intent.fields?.title || 'รายการ'} ·${amount}`;
  if (intent?.object === 'OTHER_INCOME') return `รายรับ · ${intent.fields?.title || 'รายการ'} ·${amount}`;
  return intent?.question || 'ความหมายนี้ยังไม่อยู่ใน Foundation';
}

async function requestInterpretation(text) {
  const response = await fetch('/api/v1/interpret', {
    method:'POST',
    headers:{ 'content-type':'application/json' },
    body:JSON.stringify({ version:'1', text, context:{} }),
  });
  let body;
  try { body = await response.json(); } catch { throw new Error('คำตอบจาก AI อ่านไม่ได้'); }
  if (!response.ok) {
    const code = String(body?.code || 'AI_REQUEST_FAILED');
    const friendly = {
      INTERPRETER_NOT_CONFIGURED:'AI ยังไม่พร้อมใน environment นี้',
      INTERPRETER_PROVIDER_ERROR:'AI ติดต่อผู้ให้บริการไม่สำเร็จ',
      INTERPRETER_INVALID_OUTPUT:'ความหมายจาก AI ไม่ผ่านการตรวจ',
      INTERPRETER_REFUSED:'AI ไม่สามารถตีความข้อความนี้ได้',
      RATE_LIMITED:'เรียก AI ถี่เกินไป ลองใหม่อีกครั้งภายหลัง',
    };
    throw new Error(friendly[code] || 'ตีความไม่สำเร็จ');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) || String(body.version) !== '1') throw new Error('ความหมายจาก AI ไม่อยู่ในรูปที่รองรับ');
  return body;
}

async function interpretAiText() {
  const form = $('b2AiForm');
  const input = form?.elements?.text;
  const text = String(input?.value || '').trim();
  if (!text) return;
  pendingAppLanguage = null;
  $('b2SendToManual').disabled = true;
  $('b2AppLanguage').textContent = 'กำลังตีความ…';
  setStatus('กำลังตีความ');
  addConversation('user', text);
  try {
    const intent = await requestInterpretation(text);
    if (intent.status === 'ASK') {
      $('b2AppLanguage').textContent = '—';
      addConversation('assistant', intent.question || 'ขอข้อมูลเพิ่มอีกนิด');
      setStatus('ยังไม่มีข้อมูลถูกส่งเข้า Manual');
      return;
    }
    if (intent.status === 'UNSUPPORTED') {
      $('b2AppLanguage').textContent = '—';
      addConversation('assistant', intent.question || 'รายการนี้ยังไม่รองรับใน Foundation');
      setStatus('หยุดที่ AI โดยไม่มีการเขียนข้อมูล');
      return;
    }
    const appLanguage = translateIntentToAppLanguage(intent);
    pendingAppLanguage = appLanguage;
    $('b2AppLanguage').textContent = JSON.stringify(appLanguage, null, 2);
    $('b2SendToManual').disabled = false;
    addConversation('assistant', `เข้าใจว่า ${intentSummary(intent)}`);
    setStatus('Output Gate ผ่านแล้ว พร้อมส่งเข้า Manual');
  } catch (error) {
    $('b2AppLanguage').textContent = '—';
    addConversation('assistant', String(error?.message || error || 'ตีความไม่สำเร็จ'));
    setStatus('Output Gate หยุดรายการนี้', true);
  }
}

async function withActiveRuntime(task) {
  try {
    return await withRuntimeSession(async runtime => {
      const state = await runtime.readState();
      if (!state) throw new Error('RUNTIME_SESSION_LOCKED');
      return task(runtime, state);
    });
  } catch (error) {
    if (String(error?.message || error || '') === 'RUNTIME_SESSION_LOCKED') throw new Error('Runtime ยังไม่พร้อม กรุณาเข้าแอปใหม่');
    throw error;
  }
}

async function executeAppLanguage(appLanguage, source) {
  setStatus('Manual กำลังส่งงานเข้า Runtime');
  const execution = await withActiveRuntime(async runtime => {
    const result = await executeManualAppLanguage({ runtime, appLanguage, makeId });
    const state = await runtime.readState();
    return { result, state };
  });
  selectedArea = execution.result.area;
  renderAreaTabs();
  $('b2Audit').textContent = JSON.stringify({ source, appLanguage, destination:execution.result.area, status:'READBACK_OK' }, null, 2);
  renderManualState(execution.state);
  setPage('manual');
  setStatus(`บันทึกและอ่านกลับแล้ว · ${execution.result.area}`);
  globalThis.dispatchEvent(new CustomEvent('ygph:daily-lifecycle'));
}

async function sendPendingToManual() {
  if (!pendingAppLanguage) return;
  const appLanguage = pendingAppLanguage;
  $('b2SendToManual').disabled = true;
  try {
    await executeAppLanguage(appLanguage, 'AI_OUTPUT_GATE');
    pendingAppLanguage = null;
  } catch (error) {
    setStatus(String(error?.message || error || 'ส่งเข้า Manual ไม่สำเร็จ'), true);
    $('b2SendToManual').disabled = false;
  }
}

async function submitManualForm(form) {
  const area = areaById(selectedArea);
  if (!area || area.mode !== 'execute') return;
  const title = String(form.elements.title?.value || '').trim();
  if (!title) return;
  try {
    const appLanguage = Object.freeze({
      version:'1', action:'CREATE', target:area.id,
      fields:Object.freeze({ title, amountSatang:parseBaht(form.elements.amount?.value) }),
    });
    await executeAppLanguage(appLanguage, 'MANUAL_FORM');
    form.reset();
  } catch (error) {
    setStatus(String(error?.message || error || 'บันทึกไม่สำเร็จ'), true);
  }
}

function domainRecords(state, domain) {
  return Object.values(state?.domains?.[domain]?.records || {}).map(entry => entry?.record).filter(Boolean);
}

function recordsForArea(state, area) {
  if (area === 'CALENDAR') return domainRecords(state, 'CALENDAR');
  const ledger = domainRecords(state, 'LEDGER');
  if (area === 'LEDGER') return ledger;
  if (area === 'INCOME') return ledger.filter(record => record?.type === 'TRANSACTION' && record?.direction === 'IN');
  if (area === 'OUTCOME') return ledger.filter(record => record?.type === 'TRANSACTION' && record?.direction === 'OUT');
  return [];
}

function renderManualState(state) {
  const host = $('b2ManualResult');
  if (!host) return;
  host.replaceChildren();
  const records = recordsForArea(state, selectedArea).sort((a, b) => String(b?.createdAt || b?.updatedAt || '').localeCompare(String(a?.createdAt || a?.updatedAt || '')));
  if (!records.length) {
    const quiet = document.createElement('p');
    quiet.className = 'quiet';
    quiet.textContent = 'ยังไม่มีรายการในพื้นที่นี้';
    host.append(quiet);
    return;
  }
  for (const record of records.slice(0, 80)) {
    const row = document.createElement('article');
    row.className = 'b2-record';
    const title = document.createElement('strong');
    title.textContent = String(record.title || record.recordId || 'รายการ');
    const meta = document.createElement('small');
    const amount = Number.isSafeInteger(Number(record.amountSatang)) ? ` · ${formatSatang(record.amountSatang)} บาท` : '';
    meta.textContent = `${String(record.type || record.direction || selectedArea)}${amount}${record.status ? ` · ${record.status}` : ''}`;
    row.append(title, meta);
    host.append(row);
  }
}

async function refreshManual() {
  if (!$('b2Workspace') || $('b2Workspace').classList.contains('hidden')) return;
  renderAreaTabs();
  try {
    const state = await withActiveRuntime((_runtime, current) => current);
    renderManualState(state);
  } catch (error) {
    setStatus(String(error?.message || error || 'อ่านข้อมูล Manual ไม่สำเร็จ'), true);
  }
}

function syncUnlockedState() {
  const workspace = $('workspace');
  const shell = $('b2Workspace');
  if (!workspace || !shell) return;
  const unlocked = !workspace.classList.contains('hidden');
  shell.classList.toggle('hidden', !unlocked);
  document.body.classList.toggle('b2-foundation-active', unlocked);
  if (unlocked) {
    void refreshManual();
  } else {
    pendingAppLanguage = null;
    $('b2AppLanguage').textContent = '—';
    $('b2SendToManual').disabled = true;
    setStatus('');
  }
}

function install() {
  if (installed) return;
  const workspace = $('workspace');
  if (!workspace) return;
  installed = true;
  installStyle();
  createShell();
  const observer = new MutationObserver(syncUnlockedState);
  observer.observe(workspace, { attributes:true, attributeFilter:['class'] });
  syncUnlockedState();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
else install();
