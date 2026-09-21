import { getLighthouseCapability, listLighthouseCapabilities } from './capability-registry.mjs';

export const LIGHTHOUSE_TRANSFER_CONTRACT = 'lighthouse-transfer-v1';

const PAYLOAD_TEMPLATES = Object.freeze({
  'system.commandPack':Object.freeze({
    title:'',
    commands:[
      { requestId:'', capabilityId:'finance.expense.create', payload:{ title:'', amountBaht:0 } },
    ],
  }),
  'centreBoard.initialize':Object.freeze({ boardId:'', workId:'' }),
  'centreBoard.pin.create':Object.freeze({ workId:'', expectedRevision:0, pinId:'', title:'', detail:'', evidence:[], links:[], nextAction:'' }),
  'centreBoard.claim':Object.freeze({ workId:'', employeeId:'', pinIds:[], expectedRevision:0 }),
  'centreBoard.return':Object.freeze({ workId:'', employeeId:'', expectedRevision:0, updates:[] }),
  'centreBoard.recover':Object.freeze({ capsuleId:'', capsule:{} }),
  'board.initialize':Object.freeze({ boardId:'', workId:'' }),
  'pin.create':Object.freeze({ workId:'', expectedRevision:0, pinId:'', title:'', detail:'', evidence:[], links:[], nextAction:'' }),
  'board.claim':Object.freeze({ workId:'', employeeId:'', pinIds:[], expectedRevision:0 }),
  'board.return':Object.freeze({ workId:'', employeeId:'', expectedRevision:0, updates:[] }),
  'board.recover':Object.freeze({ capsuleId:'', capsule:{} }),
  'finance.dailyGoal':Object.freeze({ goalBaht:0 }),
  'finance.income.create':Object.freeze({ source:'', amountBaht:0 }),
  'finance.expense.create':Object.freeze({ title:'', amountBaht:0 }),
  'finance.obligation.create':Object.freeze({ obligationId:'', queueId:'', title:'', amountBaht:0, dueDate:'YYYY-MM-DD', detail:'' }),
  'finance.obligation.dueDate':Object.freeze({ queueId:'', dueDate:'YYYY-MM-DD' }),
  'finance.obligation.payment':Object.freeze({ obligationId:'', queueId:'', amountBaht:0 }),
  'finance.receivable.payment':Object.freeze({ saleId:'', queueId:'', amountBaht:0 }),
  'calendar.status':Object.freeze({ queueId:'', status:'' }),
  'store.product.create':Object.freeze({ productId:'', name:'', model:'', color:'', descriptors:[], quantity:0 }),
  'store.stock.add':Object.freeze({ productId:'', title:'', quantity:0 }),
});

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function clean(value) {
  return String(value == null ? '' : value).trim();
}

function requestId(value) {
  const id = clean(value);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)) {
    throw new Error('LIGHTHOUSE_TRANSFER_REQUEST_ID_INVALID');
  }
  return id;
}

function payloadObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('LIGHTHOUSE_TRANSFER_PAYLOAD_INVALID');
  }
  return clone(value);
}

function routeFor(capability) {
  return Object.freeze({
    owner:capability.owner,
    action:capability.action,
    readback:capability.readback,
    confirmationRequired:capability.confirmationRequired,
  });
}

export function listLighthouseTransferCapabilities() {
  return listLighthouseCapabilities().map(capability => Object.freeze({
    ...capability,
    payloadTemplate:clone(PAYLOAD_TEMPLATES[capability.id] || {}),
  }));
}

export function createLighthouseTransferEnvelope({ requestId:requestIdValue, capabilityId, payload = {} } = {}) {
  const capability = getLighthouseCapability(clean(capabilityId));
  if (!capability) throw new Error('LIGHTHOUSE_TRANSFER_CAPABILITY_UNKNOWN');
  if (capability.editable !== true) throw new Error('LIGHTHOUSE_TRANSFER_CAPABILITY_NOT_WRITABLE');
  return Object.freeze({
    contract:LIGHTHOUSE_TRANSFER_CONTRACT,
    targetId:'lighthouse',
    requestId:requestId(requestIdValue),
    capabilityId:capability.id,
    route:routeFor(capability),
    payload:payloadObject(payload),
  });
}

export function normalizeLighthouseTransferEnvelope(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('LIGHTHOUSE_TRANSFER_ENVELOPE_INVALID');
  if (clean(value.contract) !== LIGHTHOUSE_TRANSFER_CONTRACT) throw new Error('LIGHTHOUSE_TRANSFER_CONTRACT_INVALID');
  if (clean(value.targetId).toLowerCase() !== 'lighthouse') throw new Error('LIGHTHOUSE_TRANSFER_TARGET_INVALID');
  return createLighthouseTransferEnvelope({
    requestId:value.requestId,
    capabilityId:value.capabilityId,
    payload:value.payload,
  });
}

export async function submitLighthouseTransfer({ runtime, envelope, dispatch = event => globalThis.dispatchEvent?.(event) } = {}) {
  if (!runtime || typeof runtime.receive !== 'function' || typeof runtime.process !== 'function') {
    throw new Error('LIGHTHOUSE_TRANSFER_RUNTIME_REQUIRED');
  }
  const normalized = normalizeLighthouseTransferEnvelope(envelope);
  runtime.receive({
    requestId:normalized.requestId,
    capabilityId:normalized.capabilityId,
    payload:normalized.payload,
  });
  const receipt = await runtime.process(normalized.requestId);
  if (receipt?.status === 'COMPLETE') {
    try { await runtime.refreshSnapshot?.(); } catch {}
  }
  const EventCtor = globalThis.CustomEvent;
  if (typeof EventCtor === 'function') {
    dispatch(new EventCtor('lighthouse:control-port-updated', {
      detail:{ requestId:normalized.requestId, capabilityId:normalized.capabilityId, receipt:clone(receipt) },
    }));
  }
  return Object.freeze({ envelope:normalized, receipt:clone(receipt) });
}

function exportFilename(requestIdValue, now = new Date()) {
  const id = clean(requestIdValue) || 'lighthouse-transfer';
  const stamp = now.toISOString().slice(0, 10);
  return `${id}-${stamp}.json`;
}

export function downloadLighthouseTransfer(envelope, {
  documentRef = globalThis.document,
  urlApi = globalThis.URL,
  now = new Date(),
} = {}) {
  const normalized = normalizeLighthouseTransferEnvelope(envelope);
  if (!documentRef?.createElement || !globalThis.Blob || !urlApi?.createObjectURL) {
    throw new Error('LIGHTHOUSE_TRANSFER_DOWNLOAD_UNAVAILABLE');
  }
  const blob = new Blob([`${JSON.stringify(normalized, null, 2)}\n`], { type:'application/json;charset=utf-8' });
  const url = urlApi.createObjectURL(blob);
  try {
    const anchor = documentRef.createElement('a');
    anchor.href = url;
    anchor.download = exportFilename(normalized.requestId, now);
    anchor.rel = 'noopener';
    anchor.click();
    return anchor.download;
  } finally {
    urlApi.revokeObjectURL?.(url);
  }
}

export async function readLighthouseTransferFile(file) {
  if (!file || typeof file.text !== 'function') throw new Error('LIGHTHOUSE_TRANSFER_FILE_REQUIRED');
  let value;
  try { value = JSON.parse(await file.text()); }
  catch { throw new Error('LIGHTHOUSE_TRANSFER_FILE_INVALID'); }
  return normalizeLighthouseTransferEnvelope(value);
}

function formError(error) {
  const code = clean(error?.message || error);
  const known = {
    LIGHTHOUSE_TRANSFER_CONTRACT_INVALID:'ไฟล์นี้ไม่ใช่ LIGHTHOUSE Transfer',
    LIGHTHOUSE_TRANSFER_TARGET_INVALID:'ไฟล์นี้ไม่ได้ส่งเข้า LIGHTHOUSE',
    LIGHTHOUSE_TRANSFER_CAPABILITY_UNKNOWN:'ไม่พบจุดลงนี้ใน LIGHTHOUSE',
    LIGHTHOUSE_TRANSFER_CAPABILITY_NOT_WRITABLE:'จุดลงนี้เป็น Read only',
    LIGHTHOUSE_TRANSFER_PAYLOAD_INVALID:'Payload ต้องเป็น JSON object',
    LIGHTHOUSE_TRANSFER_REQUEST_ID_INVALID:'Request ID ไม่ถูกต้อง',
    LIGHTHOUSE_TRANSFER_FILE_INVALID:'ไฟล์ JSON ไม่ถูกต้อง',
    LIGHTHOUSE_TRANSFER_FILE_REQUIRED:'ยังไม่ได้เลือกไฟล์',
    RUNTIME_SESSION_LOCKED:'แอปถูกล็อก กรุณาเข้าใหม่',
  };
  return known[code] || 'ยังส่งข้อมูลเข้า LIGHTHOUSE ไม่ได้';
}

export function installLighthouseTransferForm({
  root = globalThis.document,
  runtime,
} = {}) {
  if (!root?.querySelector || !runtime || typeof runtime.receive !== 'function' || typeof runtime.process !== 'function') return false;
  const toggle = root.querySelector('#lighthouse-transfer-toggle');
  const form = root.querySelector('#lighthouse-transfer-form');
  const request = root.querySelector('#lighthouse-transfer-request');
  const capabilitySelect = root.querySelector('#lighthouse-transfer-capability');
  const payload = root.querySelector('#lighthouse-transfer-payload');
  const owner = root.querySelector('#lighthouse-transfer-owner');
  const action = root.querySelector('#lighthouse-transfer-action');
  const readback = root.querySelector('#lighthouse-transfer-readback');
  const guard = root.querySelector('#lighthouse-transfer-guard');
  const importButton = root.querySelector('#lighthouse-transfer-import');
  const exportButton = root.querySelector('#lighthouse-transfer-export');
  const fileInput = root.querySelector('#lighthouse-transfer-file');
  const status = root.querySelector('#lighthouse-transfer-status');
  if (!toggle || !form || !request || !capabilitySelect || !payload || !owner || !action || !readback || !guard ||
      !importButton || !exportButton || !fileInput || !status || toggle.dataset.bound === 'true') {
    return false;
  }
  toggle.dataset.bound = 'true';

  const catalog = listLighthouseTransferCapabilities();
  const writable = catalog.filter(item => item.editable === true);

  function nextRequestId() {
    return `LH-${Date.now().toString(36).toUpperCase()}`;
  }

  function selectedCapability() {
    return writable.find(item => item.id === capabilitySelect.value) || null;
  }

  function currentEnvelope() {
    const selected = selectedCapability();
    if (!selected) throw new Error('LIGHTHOUSE_TRANSFER_CAPABILITY_UNKNOWN');
    let value;
    try { value = JSON.parse(payload.value || '{}'); }
    catch { throw new Error('LIGHTHOUSE_TRANSFER_PAYLOAD_INVALID'); }
    return createLighthouseTransferEnvelope({
      requestId:request.value,
      capabilityId:selected.id,
      payload:value,
    });
  }

  function renderRoute({ resetPayload = true } = {}) {
    const selected = selectedCapability();
    owner.textContent = selected?.owner || '—';
    action.textContent = selected?.action || '—';
    readback.textContent = selected?.readback || '—';
    guard.textContent = selected?.confirmationRequired ? 'ยืนยันบนเครื่อง' : 'ตรง';
    if (resetPayload && selected) payload.value = JSON.stringify(selected.payloadTemplate || {}, null, 2);
  }

  for (const item of writable) {
    const option = root.createElement('option');
    option.value = item.id;
    option.textContent = item.id;
    capabilitySelect.append(option);
  }
  capabilitySelect.value = writable.find(item => item.id === 'system.commandPack')?.id || writable[0]?.id || '';
  request.value = nextRequestId();
  renderRoute();

  toggle.addEventListener('click', () => {
    form.hidden = !form.hidden;
    if (!form.hidden) payload.focus();
  });

  capabilitySelect.addEventListener('change', () => renderRoute());

  importButton.addEventListener('click', () => {
    fileInput.value = '';
    fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    status.textContent = 'กำลังอ่านไฟล์…';
    try {
      const envelope = await readLighthouseTransferFile(file);
      const selected = writable.find(item => item.id === envelope.capabilityId);
      if (!selected) throw new Error('LIGHTHOUSE_TRANSFER_CAPABILITY_NOT_WRITABLE');
      request.value = envelope.requestId;
      capabilitySelect.value = envelope.capabilityId;
      payload.value = JSON.stringify(envelope.payload, null, 2);
      renderRoute({ resetPayload:false });
      status.textContent = `พร้อมส่ง · ${envelope.capabilityId}`;
    } catch (error) {
      status.textContent = formError(error);
    } finally {
      fileInput.value = '';
    }
  });

  exportButton.addEventListener('click', () => {
    try {
      const filename = downloadLighthouseTransfer(currentEnvelope());
      status.textContent = `ส่งออกแล้ว · ${filename}`;
    } catch (error) {
      status.textContent = formError(error);
    }
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    status.textContent = 'กำลังส่งเข้า Control Port…';
    try {
      const result = await submitLighthouseTransfer({ runtime, envelope:currentEnvelope() });
      if (result.receipt?.reason === 'CONFIRMATION_REQUIRED' || result.receipt?.status === 'BLOCKED') {
        status.textContent = 'ส่งเข้าแล้ว · รอยืนยันบนเครื่อง';
      } else {
        status.textContent = `บันทึกและอ่านกลับแล้ว · ${result.envelope.capabilityId}`;
        request.value = nextRequestId();
      }
    } catch (error) {
      status.textContent = formError(error);
    } finally {
      submit.disabled = false;
    }
  });

  globalThis.addEventListener?.('lighthouse:control-port-updated', event => {
    const detail = event?.detail || {};
    if (!detail.requestId || detail.requestId !== request.value) return;
    const receipt = runtime.outbox?.().find?.(item => item?.requestId === detail.requestId);
    if (receipt?.status === 'COMPLETE') {
      status.textContent = `ยืนยันและอ่านกลับแล้ว · ${detail.capabilityId || capabilitySelect.value}`;
      request.value = nextRequestId();
    } else if (receipt?.status === 'CANCELLED' || receipt?.reason === 'CANCELLED') {
      status.textContent = 'ยกเลิกรายการแล้ว';
      request.value = nextRequestId();
    }
  });

  status.textContent = `พร้อม · จุดข้อมูลทั้งหมด ${catalog.length} · ส่งเข้าได้ ${writable.length}`;
  return true;
}

export { exportFilename, formError };
