function node(documentRef, tag, attrs = {}, text = '') {
  const element = documentRef.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'className') element.className = value;
    else if (key === 'dataset') Object.assign(element.dataset, value);
    else element.setAttribute(key, value);
  }
  if (text) element.textContent = text;
  return element;
}

function field(documentRef, labelText, name, options = {}) {
  const label = node(documentRef, 'label', {}, labelText);
  const input = options.select ? node(documentRef, 'select', { name }) : node(documentRef, 'input', { name, ...(options.type ? { type:options.type } : {}), ...(options.inputmode ? { inputmode:options.inputmode } : {}) });
  if (options.required) input.required = true;
  if (options.placeholder) input.placeholder = options.placeholder;
  if (options.value != null) input.value = String(options.value);
  if (options.select) for (const [value, copy] of options.select) input.append(node(documentRef, 'option', { value }, copy));
  label.append(input);
  return { label, input };
}

function moneyText(amountSatang) {
  const value = Number(amountSatang || 0) / 100;
  return new Intl.NumberFormat('th-TH', { maximumFractionDigits:2 }).format(value);
}

function formCard(documentRef, id, title) {
  const card = node(documentRef, 'section', { className:'card manual-card' });
  card.append(node(documentRef, 'h3', {}, title));
  const form = node(documentRef, 'form', { id, className:'stack' });
  card.append(form);
  return { card, form };
}

function createSurface(documentRef) {
  if (documentRef.getElementById('manualFourHouses')) return;
  const financePage = documentRef.querySelector('[data-area-page="finance"]');
  if (!financePage) return;
  const root = node(documentRef, 'section', { id:'manualFourHouses', className:'manual-four-houses', 'aria-labelledby':'manualFourHousesTitle' });
  root.append(node(documentRef, 'div', { className:'subhead' }, 'MANUAL · ชีวิตของรายการ'));
  root.append(node(documentRef, 'h2', { id:'manualFourHousesTitle' }, 'Income · Outcome · Calendar · Ledger'));
  root.append(node(documentRef, 'p', { className:'muted' }, 'ใช้เงินจริงจากฟอร์มเดิม และเติมเฉพาะ Target / Ceiling / Receivable / Calendar / Ledger lifecycle ที่ขาด'));

  const income = node(documentRef, 'div', { className:'manual-house' });
  income.append(node(documentRef, 'h3', {}, 'Income — เงินเข้า'));
  const target = formCard(documentRef, 'incomeTargetForm', 'Target');
  const targetTitle = field(documentRef, 'ชื่อเป้า ', 'title', { required:true, value:'เป้ารายได้' });
  const targetAmount = field(documentRef, 'เป้าหมาย (บาท) ', 'amount', { required:true, inputmode:'decimal' });
  target.form.append(targetTitle.label, targetAmount.label, node(documentRef, 'button', { type:'submit' }, 'ตั้ง / แก้ Target'));
  target.card.append(node(documentRef, 'p', { id:'incomeTargetProgress', className:'muted' }, 'ยังไม่มี Target'));
  income.append(target.card);
  const receivable = formCard(documentRef, 'receivableForm', 'Receivable');
  const rTitle = field(documentRef, 'รายการ ', 'title', { required:true });
  const rAmount = field(documentRef, 'ยอดที่ต้องรับ (บาท) ', 'amount', { required:true, inputmode:'decimal' });
  const rDue = field(documentRef, 'ครบกำหนด ', 'dueDate', { type:'date' });
  receivable.form.append(rTitle.label, rAmount.label, rDue.label, node(documentRef, 'button', { type:'submit' }, 'สร้างลูกหนี้'));
  receivable.card.append(node(documentRef, 'div', { id:'receivableList', className:'list' }));
  income.append(receivable.card);

  const outcome = node(documentRef, 'div', { className:'manual-house' });
  outcome.append(node(documentRef, 'h3', {}, 'Outcome — เงินออกและภาระ'));
  const ceiling = formCard(documentRef, 'outcomeCeilingForm', 'Ceiling');
  const ceilingTitle = field(documentRef, 'ชื่อเพดาน ', 'title', { required:true, value:'เพดานรายจ่าย' });
  const ceilingAmount = field(documentRef, 'เพดาน (บาท) ', 'amount', { required:true, inputmode:'decimal' });
  ceiling.form.append(ceilingTitle.label, ceilingAmount.label, node(documentRef, 'button', { type:'submit' }, 'ตั้ง / แก้ Ceiling'));
  ceiling.card.append(node(documentRef, 'p', { id:'outcomeCeilingProgress', className:'muted' }, 'ยังไม่มี Ceiling'));
  outcome.append(ceiling.card);

  const calendar = node(documentRef, 'div', { className:'manual-house' });
  calendar.append(node(documentRef, 'h3', {}, 'Calendar — อะไรต้องเกิดเมื่อไร'));
  const cal = formCard(documentRef, 'calendarItemForm', 'Create Item');
  const cType = field(documentRef, 'ชนิด ', 'type', { select:[['APPOINTMENT','Appointment'],['TODO','Todo'],['DEBT_FOLLOW_UP','Debt Follow-up']] });
  const cTitle = field(documentRef, 'รายการ ', 'title', { required:true });
  const cDue = field(documentRef, 'วันที่ ', 'dueDate', { required:true, type:'date' });
  const cDetail = field(documentRef, 'รายละเอียด ', 'detail');
  cal.form.append(cType.label, cTitle.label, cDue.label, cDetail.label, node(documentRef, 'button', { type:'submit' }, 'สร้างรายการ'));
  cal.card.append(node(documentRef, 'div', { id:'manualCalendarViews', className:'list' }));
  calendar.append(cal.card);

  const ledger = node(documentRef, 'div', { className:'manual-house' });
  ledger.append(node(documentRef, 'h3', {}, 'Ledger — คุมความจริง'));
  const search = formCard(documentRef, 'ledgerSearchForm', 'Search / Filter');
  const q = field(documentRef, 'ค้นหา ', 'text', { placeholder:'ชื่อ / รหัส / รายละเอียด' });
  const direction = field(documentRef, 'ทิศทาง ', 'direction', { select:[['','ทั้งหมด'],['IN','เงินเข้า'],['OUT','เงินออก']] });
  const type = field(documentRef, 'ชนิด ', 'type', { select:[['','ทั้งหมด'],['TRANSACTION','Transaction'],['TARGET','Target'],['CEILING','Ceiling'],['RECEIVABLE','Receivable'],['OBLIGATION','Obligation']] });
  const life = field(documentRef, 'สถานะ ', 'status', { select:[['','ทั้งหมด'],['OPEN','Open'],['PARTIAL','Partial'],['COMPLETED','Complete'],['CANCELLED','Cancelled']] });
  search.form.append(q.label, direction.label, type.label, life.label, node(documentRef, 'button', { type:'submit' }, 'ค้น'));
  search.card.append(node(documentRef, 'div', { id:'ledgerSearchResults', className:'list' }), node(documentRef, 'div', { id:'ledgerDetail', className:'list' }));
  ledger.append(search.card);

  root.append(income, outcome, calendar, ledger);
  const schedule = documentRef.getElementById('financeSchedule');
  if (schedule) schedule.before(root); else financePage.append(root);
}

function currentExpectationId(kind) { return kind === 'TARGET' ? 'MANUAL-TARGET-CURRENT' : 'MANUAL-CEILING-CURRENT'; }
function makeId(prefix) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`; }

export function createManualFinanceUi({ documentRef = globalThis.document, getManual, onChanged = async()=>{}, notify = ()=>{} } = {}) {
  if (!documentRef || typeof getManual !== 'function') throw new TypeError('MANUAL_FINANCE_UI_REQUIRED');
  createSurface(documentRef);
  let bound = false;

  async function mutate(task, copy) {
    try { await task(); await onChanged(copy); }
    catch (error) { notify(String(error?.message || error), true); }
  }

  function bind() {
    if (bound) return;
    bound = true;
    const manual = () => getManual();
    documentRef.getElementById('incomeTargetForm')?.addEventListener('submit', event => { event.preventDefault(); const data=new FormData(event.currentTarget); mutate(()=>manual().setTarget({ workflowId:makeId('WF-TARGET'), recordId:currentExpectationId('TARGET'), title:data.get('title'), amountSatang:Math.round(Number(data.get('amount'))*100) }), 'อัปเดต Target แล้ว'); });
    documentRef.getElementById('outcomeCeilingForm')?.addEventListener('submit', event => { event.preventDefault(); const data=new FormData(event.currentTarget); mutate(()=>manual().setCeiling({ workflowId:makeId('WF-CEILING'), recordId:currentExpectationId('CEILING'), title:data.get('title'), amountSatang:Math.round(Number(data.get('amount'))*100) }), 'อัปเดต Ceiling แล้ว'); });
    documentRef.getElementById('receivableForm')?.addEventListener('submit', event => { event.preventDefault(); const data=new FormData(event.currentTarget); mutate(()=>manual().createReceivable({ workflowId:makeId('WF-RCV'), recordId:makeId('RCV'), title:data.get('title'), amountSatang:Math.round(Number(data.get('amount'))*100), dueDate:data.get('dueDate')||undefined }), 'สร้าง Receivable แล้ว'); });
    documentRef.getElementById('calendarItemForm')?.addEventListener('submit', event => { event.preventDefault(); const data=new FormData(event.currentTarget); mutate(()=>manual().createCalendarItem({ workflowId:makeId('WF-CAL'), recordId:makeId('CAL'), type:data.get('type'), title:data.get('title'), dueDate:data.get('dueDate'), detail:data.get('detail')||'' }), 'สร้าง Calendar item แล้ว'); });
    documentRef.getElementById('ledgerSearchForm')?.addEventListener('submit', event => { event.preventDefault(); renderLedger(new FormData(event.currentTarget)); });
  }

  function recordLine(record) {
    const item = node(documentRef, 'article', { className:'item' });
    const title = node(documentRef, 'b', {}, record.title || record.recordId);
    const meta = node(documentRef, 'div', { className:'muted' }, [record.type, record.status, Number.isSafeInteger(Number(record.amountSatang)) ? `${moneyText(record.amountSatang)} บาท` : ''].filter(Boolean).join(' · '));
    item.append(title, meta);
    return item;
  }

  async function openLedgerDetail(record) {
    const manual = getManual();
    const detail = documentRef.getElementById('ledgerDetail');
    detail.textContent='';
    const current = await manual.getRecord('LEDGER', record.recordId);
    const history = await manual.history('LEDGER', record.recordId);
    const related = await manual.related('LEDGER', record.recordId);
    detail.append(recordLine(current), node(documentRef,'p',{className:'muted'},`History ${history.length} · Related ${related.length}`));
    const actions=node(documentRef,'div',{className:'item-actions'});
    const edit=node(documentRef,'button',{type:'button'},'Edit'); edit.addEventListener('click',()=>{const title=globalThis.prompt?.('ชื่อใหม่',current.title||''); if(title) mutate(()=>manual.editLedgerMetadata({workflowId:makeId('WF-LEDGER-EDIT'),recordId:current.recordId,title}),'แก้ metadata แล้ว');}); actions.append(edit);
    if (['TARGET','CEILING','RECEIVABLE','OBLIGATION'].includes(current.type) && !['COMPLETED','CANCELLED'].includes(current.status)) { const cancel=node(documentRef,'button',{type:'button'},'Cancel'); cancel.addEventListener('click',()=>mutate(()=>manual.cancelExpected({workflowId:makeId('WF-CANCEL'),recordId:current.recordId}),'ยกเลิกรายการ Expected แล้ว')); actions.append(cancel); }
    if (current.type==='TRANSACTION') {
      const refund=node(documentRef,'button',{type:'button'},'Refund'); refund.addEventListener('click',()=>{const amount=Number(globalThis.prompt?.('ยอดคืน (บาท)','0')); if(amount>0) mutate(()=>manual.refund({workflowId:makeId('WF-REFUND'),originalRecordId:current.recordId,recordId:makeId('TX-REF'),amountSatang:Math.round(amount*100),reason:'Manual refund'}),'บันทึก Refund แล้ว');});
      const reverse=node(documentRef,'button',{type:'button'},'Reverse'); reverse.addEventListener('click',()=>mutate(()=>manual.reverse({workflowId:makeId('WF-REV'),originalRecordId:current.recordId,recordId:makeId('TX-REV'),reason:'Manual reversal'}),'บันทึก Reverse แล้ว')); actions.append(refund,reverse);
    }
    detail.append(actions);
  }

  async function renderLedger(data = null) {
    const manual=getManual();
    const options=data ? { text:data.get('text')||'', direction:data.get('direction')||null, type:data.get('type')||null, status:data.get('status')||null } : {};
    const results=await manual.searchLedger(options);
    const list=documentRef.getElementById('ledgerSearchResults'); list.textContent='';
    for (const record of results) { const item=recordLine(record); item.tabIndex=0; item.addEventListener('click',()=>openLedgerDetail(record)); list.append(item); }
    if (!results.length) list.textContent='ไม่พบรายการ';
  }

  async function render() {
    if (!getManual()) return;
    bind();
    try {
      const manual=getManual();
      const income=await manual.incomeSummary();
      const outcome=await manual.outcomeSummary();
      const target=documentRef.getElementById('incomeTargetProgress');
      target.textContent=income.target ? `Actual ${moneyText(income.target.actualSatang)} / Target ${moneyText(income.target.amountSatang)} · Delta ${moneyText(income.target.deltaSatang)} บาท` : `Actual ${moneyText(income.actualSatang)} บาท · ยังไม่มี Target`;
      const ceiling=documentRef.getElementById('outcomeCeilingProgress');
      ceiling.textContent=outcome.ceiling ? `Actual ${moneyText(outcome.ceiling.actualSatang)} / Ceiling ${moneyText(outcome.ceiling.amountSatang)} · Delta ${moneyText(outcome.ceiling.deltaSatang)} บาท` : `Actual ${moneyText(outcome.actualSatang)} บาท · ยังไม่มี Ceiling`;

      const receivables=await manual.searchLedger({type:'RECEIVABLE'}); const rList=documentRef.getElementById('receivableList'); rList.textContent='';
      for (const record of receivables) { const item=recordLine(record); if (!['COMPLETED','CANCELLED'].includes(record.status)) { const actions=node(documentRef,'div',{className:'item-actions'}); const amount=node(documentRef,'input',{inputmode:'decimal','aria-label':'ยอดรับ'}); amount.value=moneyText(record.remainingSatang); const receive=node(documentRef,'button',{type:'button'},'รับเงิน'); receive.addEventListener('click',()=>mutate(()=>manual.receiveReceivable({workflowId:makeId('WF-RCV-PAY'),receivableId:record.recordId,transactionId:makeId('TX-RCV'),amountSatang:Math.round(Number(amount.value)*100)}),'รับเงินและอัปเดต Remaining แล้ว')); actions.append(amount,receive); item.append(actions); } rList.append(item); }
      if(!receivables.length)rList.textContent='ยังไม่มี Receivable';

      const [todayItems,upcoming,overdue]=await Promise.all([manual.calendarToday(),manual.calendarUpcoming(),manual.calendarOverdue()]); const c=documentRef.getElementById('manualCalendarViews'); c.textContent='';
      for (const [label,items] of [['Today',todayItems],['Upcoming',upcoming],['Overdue',overdue]]) { c.append(node(documentRef,'b',{},`${label} ${items.length}`)); for(const record of items)c.append(recordLine(record)); }
      await renderLedger();
    } catch (error) { notify(String(error?.message || error), true); }
  }

  bind();
  return Object.freeze({ render, renderLedger });
}
