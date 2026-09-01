function node(documentRef, tag, attrs = {}, text = '') {
  const element = documentRef.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'className') element.className = value;
    else if (key === 'dataset') Object.assign(element.dataset, value);
    else if (key === 'hidden') element.hidden = Boolean(value);
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

function statusText(status) {
  return ({ OPEN:'รอดำเนินการ', PARTIAL:'ดำเนินการบางส่วน', COMPLETED:'เสร็จแล้ว', CANCELLED:'ยกเลิกแล้ว' })[status] || status || '—';
}

function addManualStyles(documentRef) {
  if (documentRef.getElementById('manualFinanceStyles')) return;
  const link = node(documentRef, 'link', { id:'manualFinanceStyles', rel:'stylesheet', href:'./ui/manual-finance.css' });
  documentRef.head?.append(link);
}

function storyCard(documentRef, id, title) {
  const card = node(documentRef, 'section', { className:'card manual-story-card' });
  card.append(node(documentRef, 'h3', {}, title));
  const form = node(documentRef, 'form', { id, className:'stack' });
  card.append(form);
  return { card, form };
}

function disclosure(documentRef, summaryText = 'รายละเอียดเพิ่มเติม') {
  const details = node(documentRef, 'details', { className:'manual-form-disclosure' });
  details.append(node(documentRef, 'summary', {}, summaryText));
  return details;
}

function createSurface(documentRef) {
  if (documentRef.getElementById('manualFourHouses')) return;
  const financePage = documentRef.querySelector('[data-area-page="finance"]');
  if (!financePage) return;
  addManualStyles(documentRef);

  const root = node(documentRef, 'section', { id:'manualFourHouses', className:'manual-four-houses', 'aria-labelledby':'manualFourHousesTitle' });
  root.append(node(documentRef, 'div', { className:'subhead' }, 'MANUAL · ชีวิตของรายการ'));
  root.append(node(documentRef, 'h2', { id:'manualFourHousesTitle' }, 'Income · Outcome · Calendar · Ledger'));
  root.append(node(documentRef, 'p', { className:'muted' }, 'มองสถานะ → แตะเข้าเรื่อง → ทำ Action → อ่าน Truth ใหม่'));

  const income = node(documentRef, 'section', { className:'manual-house', 'aria-labelledby':'manualIncomeTitle' });
  income.append(node(documentRef, 'h3', { id:'manualIncomeTitle' }, 'Income — เงินเข้า'));
  const target = storyCard(documentRef, 'incomeTargetForm', 'Target');
  const targetAmount = field(documentRef, 'เป้าหมาย (บาท) ', 'amount', { required:true, inputmode:'decimal' });
  const targetMore = disclosure(documentRef);
  const targetTitle = field(documentRef, 'ชื่อเป้า ', 'title', { required:true, value:'เป้ารายได้' });
  targetMore.append(targetTitle.label);
  target.form.append(targetAmount.label, targetMore, node(documentRef, 'button', { type:'submit' }, 'ตั้ง / แก้ Target'));
  target.card.append(node(documentRef, 'p', { id:'incomeTargetProgress', className:'muted' }, 'ยังไม่มี Target'));
  income.append(target.card);

  const receivableCreate = node(documentRef, 'section', { className:'manual-list-section' });
  const receivableDisclosure = disclosure(documentRef, '+ สร้าง Receivable');
  const receivableForm = node(documentRef, 'form', { id:'receivableForm', className:'stack' });
  const rAmount = field(documentRef, 'ยอดที่ต้องรับ (บาท) ', 'amount', { required:true, inputmode:'decimal' });
  const rTitle = field(documentRef, 'รายการ ', 'title', { required:true });
  const rDue = field(documentRef, 'ครบกำหนด ', 'dueDate', { type:'date' });
  const rMore = disclosure(documentRef);
  rMore.append(rDue.label);
  receivableForm.append(rAmount.label, rTitle.label, rMore, node(documentRef, 'button', { type:'submit' }, 'สร้างลูกหนี้'));
  receivableDisclosure.append(receivableForm);
  receivableCreate.append(receivableDisclosure, node(documentRef, 'div', { id:'receivableList', className:'manual-list' }), node(documentRef, 'div', { id:'receivableDetail', className:'manual-record-detail', dataset:{ recordDetail:'receivable' }, hidden:true }));
  income.append(receivableCreate);

  const outcome = node(documentRef, 'section', { className:'manual-house', 'aria-labelledby':'manualOutcomeTitle' });
  outcome.append(node(documentRef, 'h3', { id:'manualOutcomeTitle' }, 'Outcome — เงินออกและภาระ'));
  const ceiling = storyCard(documentRef, 'outcomeCeilingForm', 'Ceiling');
  const ceilingAmount = field(documentRef, 'เพดาน (บาท) ', 'amount', { required:true, inputmode:'decimal' });
  const ceilingMore = disclosure(documentRef);
  const ceilingTitle = field(documentRef, 'ชื่อเพดาน ', 'title', { required:true, value:'เพดานรายจ่าย' });
  ceilingMore.append(ceilingTitle.label);
  ceiling.form.append(ceilingAmount.label, ceilingMore, node(documentRef, 'button', { type:'submit' }, 'ตั้ง / แก้ Ceiling'));
  ceiling.card.append(node(documentRef, 'p', { id:'outcomeCeilingProgress', className:'muted' }, 'ยังไม่มี Ceiling'));
  outcome.append(ceiling.card, node(documentRef, 'div', { id:'outcomeObligationList', className:'manual-list' }), node(documentRef, 'div', { id:'outcomeDetail', className:'manual-record-detail', dataset:{ recordDetail:'outcome' }, hidden:true }));

  const calendar = node(documentRef, 'section', { className:'manual-house', 'aria-labelledby':'manualCalendarTitle' });
  calendar.append(node(documentRef, 'h3', { id:'manualCalendarTitle' }, 'Calendar — อะไรต้องเกิดเมื่อไร'));
  const calDisclosure = disclosure(documentRef, '+ สร้างรายการ');
  const calForm = node(documentRef, 'form', { id:'calendarItemForm', className:'stack' });
  const cTitle = field(documentRef, 'รายการ ', 'title', { required:true });
  const cDue = field(documentRef, 'วันที่ ', 'dueDate', { required:true, type:'date' });
  const cMore = disclosure(documentRef);
  const cType = field(documentRef, 'ชนิด ', 'type', { select:[['APPOINTMENT','Appointment'],['TODO','Todo'],['DEBT_FOLLOW_UP','Debt Follow-up']] });
  const cDetail = field(documentRef, 'รายละเอียด ', 'detail');
  cMore.append(cType.label, cDetail.label);
  calForm.append(cTitle.label, cDue.label, cMore, node(documentRef, 'button', { type:'submit' }, 'สร้างรายการ'));
  calDisclosure.append(calForm);
  calendar.append(calDisclosure, node(documentRef, 'div', { id:'manualCalendarViews', className:'manual-list' }), node(documentRef, 'div', { id:'manualCalendarDetail', className:'manual-record-detail', dataset:{ recordDetail:'calendar' }, hidden:true }));

  const ledger = node(documentRef, 'section', { className:'manual-house', 'aria-labelledby':'manualLedgerTitle' });
  ledger.append(node(documentRef, 'h3', { id:'manualLedgerTitle' }, 'Ledger — คุมความจริง'));
  const searchDisclosure = disclosure(documentRef, 'ค้นหา / กรอง');
  const searchForm = node(documentRef, 'form', { id:'ledgerSearchForm', className:'stack' });
  const q = field(documentRef, 'ค้นหา ', 'text', { placeholder:'ชื่อ / รหัส / รายละเอียด' });
  const searchMore = disclosure(documentRef);
  const direction = field(documentRef, 'ทิศทาง ', 'direction', { select:[['','ทั้งหมด'],['IN','เงินเข้า'],['OUT','เงินออก']] });
  const type = field(documentRef, 'ชนิด ', 'type', { select:[['','ทั้งหมด'],['TRANSACTION','Transaction'],['TARGET','Target'],['CEILING','Ceiling'],['RECEIVABLE','Receivable'],['OBLIGATION','Obligation']] });
  const life = field(documentRef, 'สถานะ ', 'status', { select:[['','ทั้งหมด'],['OPEN','Open'],['PARTIAL','Partial'],['COMPLETED','Complete'],['CANCELLED','Cancelled']] });
  searchMore.append(direction.label, type.label, life.label);
  searchForm.append(q.label, searchMore, node(documentRef, 'button', { type:'submit' }, 'ค้น'));
  searchDisclosure.append(searchForm);
  ledger.append(searchDisclosure, node(documentRef, 'div', { id:'ledgerSearchResults', className:'manual-list' }), node(documentRef, 'div', { id:'ledgerDetail', className:'manual-record-detail', dataset:{ recordDetail:'ledger' }, hidden:true }));

  const sheet = node(documentRef, 'div', { id:'manualActionSheet', className:'manual-action-sheet', hidden:true, role:'presentation' });
  const sheetPanel = node(documentRef, 'section', { className:'manual-action-sheet-panel', role:'dialog', 'aria-modal':'true', 'aria-labelledby':'manualActionSheetTitle' });
  sheetPanel.append(node(documentRef, 'h3', { id:'manualActionSheetTitle' }, 'Action'), node(documentRef, 'div', { id:'manualActionSheetBody' }), node(documentRef, 'button', { id:'manualActionSheetClose', type:'button', className:'secondary' }, 'ปิด'));
  sheet.append(sheetPanel);

  root.append(income, outcome, calendar, ledger, sheet);
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

  function closeManualActionSheet() {
    const sheet = documentRef.getElementById('manualActionSheet');
    if (sheet) sheet.hidden = true;
  }

  function showManualActionSheet({ title, build }) {
    const sheet = documentRef.getElementById('manualActionSheet');
    const heading = documentRef.getElementById('manualActionSheetTitle');
    const body = documentRef.getElementById('manualActionSheetBody');
    if (!sheet || !heading || !body) return;
    heading.textContent = title;
    body.textContent = '';
    build(body);
    sheet.hidden = false;
    body.querySelector?.('button,input,select')?.focus?.();
  }

  function row(record, { onOpen, amountField = 'amountSatang', prefix = '' } = {}) {
    const button = node(documentRef, 'button', { type:'button', className:'manual-list-row', dataset:{ recordRow:record.recordId || '' } });
    const copy = node(documentRef, 'span', { className:'manual-list-row-copy' });
    copy.append(node(documentRef, 'span', { className:'manual-list-row-title' }, `${prefix}${record.title || record.recordId || 'รายการ'}`));
    const amount = Number(record[amountField]);
    const meta = [statusText(record.status), Number.isSafeInteger(amount) && amount !== 0 ? `${moneyText(amount)} บาท` : '', record.dueDate ? String(record.dueDate).slice(0,10) : ''].filter(Boolean).join(' · ');
    copy.append(node(documentRef, 'span', { className:'manual-list-row-meta manual-status-text' }, meta));
    button.append(copy, node(documentRef, 'span', { className:'manual-list-row-arrow', 'aria-hidden':'true' }, '›'));
    if (onOpen) button.addEventListener('click', onOpen);
    return button;
  }

  function detailShell(container, record, { truth = '', primary = null, secondary = [], history = [], related = [] } = {}) {
    container.textContent = '';
    container.hidden = false;
    container.dataset.recordDetail = record.recordId || 'record';
    const head = node(documentRef, 'div', { className:'manual-detail-head' });
    head.append(node(documentRef, 'small', { className:'manual-status-text' }, statusText(record.status)), node(documentRef, 'h3', {}, record.title || record.recordId || 'รายการ'));
    if (truth) head.append(node(documentRef, 'div', { className:'manual-detail-truth' }, truth));
    const facts = [record.type, record.dueDate ? `วันที่ ${String(record.dueDate).slice(0,10)}` : '', record.recordId ? `#${record.recordId}` : ''].filter(Boolean).join(' · ');
    if (facts) head.append(node(documentRef, 'div', { className:'muted' }, facts));
    container.append(head);

    if (primary) {
      const actions = node(documentRef, 'div', { className:'manual-detail-actions' });
      const button = node(documentRef, 'button', { type:'button', className:'manual-primary-action', dataset:{ primaryAction:primary.label } }, primary.label);
      button.addEventListener('click', primary.run);
      actions.append(button);
      container.append(actions);
    }

    if (secondary.length) {
      const menu = node(documentRef, 'details', { className:'manual-secondary-actions', dataset:{ secondaryActions:'true' } });
      menu.append(node(documentRef, 'summary', {}, '⋮ การจัดการอื่น'));
      const body = node(documentRef, 'div', { className:'manual-secondary-actions-body' });
      for (const action of secondary) {
        const button = node(documentRef, 'button', { type:'button', className:'secondary' }, action.label);
        button.addEventListener('click', action.run);
        body.append(button);
      }
      menu.append(body);
      container.append(menu);
    }

    if (history.length || related.length) {
      const context = node(documentRef, 'div', { className:'manual-detail-history' });
      if (history.length) context.append(node(documentRef, 'div', { className:'muted' }, `History ${history.length}`));
      if (related.length) context.append(node(documentRef, 'div', { className:'muted' }, `Related ${related.length}`));
      container.append(context);
    }
  }

  function bind() {
    if (bound) return;
    bound = true;
    const manual = () => getManual();
    documentRef.getElementById('manualActionSheetClose')?.addEventListener('click', closeManualActionSheet);
    documentRef.getElementById('manualActionSheet')?.addEventListener('click', event => { if (event.target === event.currentTarget) closeManualActionSheet(); });
    documentRef.getElementById('incomeTargetForm')?.addEventListener('submit', event => { event.preventDefault(); const data=new FormData(event.currentTarget); mutate(()=>manual().setTarget({ workflowId:makeId('WF-TARGET'), recordId:currentExpectationId('TARGET'), title:data.get('title'), amountSatang:Math.round(Number(data.get('amount'))*100) }), 'อัปเดต Target แล้ว'); });
    documentRef.getElementById('outcomeCeilingForm')?.addEventListener('submit', event => { event.preventDefault(); const data=new FormData(event.currentTarget); mutate(()=>manual().setCeiling({ workflowId:makeId('WF-CEILING'), recordId:currentExpectationId('CEILING'), title:data.get('title'), amountSatang:Math.round(Number(data.get('amount'))*100) }), 'อัปเดต Ceiling แล้ว'); });
    documentRef.getElementById('receivableForm')?.addEventListener('submit', event => { event.preventDefault(); const data=new FormData(event.currentTarget); mutate(()=>manual().createReceivable({ workflowId:makeId('WF-RCV'), recordId:makeId('RCV'), title:data.get('title'), amountSatang:Math.round(Number(data.get('amount'))*100), dueDate:data.get('dueDate')||undefined }), 'สร้าง Receivable แล้ว'); });
    documentRef.getElementById('calendarItemForm')?.addEventListener('submit', event => { event.preventDefault(); const data=new FormData(event.currentTarget); mutate(()=>manual().createCalendarItem({ workflowId:makeId('WF-CAL'), recordId:makeId('CAL'), type:data.get('type'), title:data.get('title'), dueDate:data.get('dueDate'), detail:data.get('detail')||'' }), 'สร้าง Calendar item แล้ว'); });
    documentRef.getElementById('ledgerSearchForm')?.addEventListener('submit', event => { event.preventDefault(); renderLedger(new FormData(event.currentTarget)); });
  }

  function receivableSheet(record) {
    const manual = getManual();
    showManualActionSheet({ title:`รับเงิน · ${record.title || record.recordId}`, build:body => {
      const remaining = Number(record.remainingSatang ?? record.amountSatang ?? 0);
      body.append(node(documentRef, 'p', { className:'muted' }, `คงเหลือ ${moneyText(remaining)} บาท`));
      const actions = node(documentRef, 'div', { className:'manual-action-sheet-actions' });
      const full = node(documentRef, 'button', { type:'button' }, 'เต็มจำนวน');
      const partial = node(documentRef, 'button', { type:'button', className:'secondary' }, 'บางส่วน');
      full.addEventListener('click', async()=>{ closeManualActionSheet(); await mutate(()=>manual.receiveReceivable({workflowId:makeId('WF-RCV-PAY'),receivableId:record.recordId,transactionId:makeId('TX-RCV'),amountSatang:remaining}),'รับเงินและอ่าน Remaining ใหม่แล้ว'); });
      partial.addEventListener('click', ()=>{
        actions.textContent='';
        const amount = field(documentRef, 'ยอดรับ (บาท) ', 'manualPartialAmount', { required:true, inputmode:'decimal' });
        const execute = node(documentRef, 'button', { type:'button' }, 'รับเงิน');
        execute.addEventListener('click', async()=>{ const satang=Math.round(Number(amount.input.value)*100); if(!Number.isSafeInteger(satang)||satang<=0||satang>remaining){notify('ยอดรับไม่ถูกต้อง',true);return;} closeManualActionSheet(); await mutate(()=>manual.receiveReceivable({workflowId:makeId('WF-RCV-PAY'),receivableId:record.recordId,transactionId:makeId('TX-RCV'),amountSatang:satang}),'รับเงินและอ่าน Remaining ใหม่แล้ว'); });
        actions.append(amount.label,execute);
      });
      actions.append(full, partial);
      body.append(actions);
    }});
  }

  async function openReceivableDetail(record) {
    const manual=getManual();
    const current=await manual.getRecord('LEDGER',record.recordId) || record;
    const history=await manual.history('LEDGER',record.recordId);
    const related=await manual.related('LEDGER',record.recordId);
    const remaining=Number(current.remainingSatang ?? current.amountSatang ?? 0);
    detailShell(documentRef.getElementById('receivableDetail'),current,{
      truth:`รับแล้ว ${moneyText(Number(current.amountSatang||0)-remaining)} บาท · เหลือ ${moneyText(remaining)} บาท`,
      primary:!['COMPLETED','CANCELLED'].includes(current.status)&&remaining>0?{label:'รับเงิน',run:()=>receivableSheet(current)}:null,
      secondary:!['COMPLETED','CANCELLED'].includes(current.status)?[{label:'ยกเลิก Receivable',run:()=>mutate(()=>manual.cancelExpected({workflowId:makeId('WF-RCV-CANCEL'),recordId:current.recordId}),'ยกเลิก Receivable และอ่าน Truth ใหม่แล้ว')}]:[],
      history,related,
    });
  }

  async function openOutcomeDetail(record) {
    const manual=getManual();
    const current=await manual.getRecord('LEDGER',record.recordId) || record;
    const history=await manual.history('LEDGER',record.recordId);
    const related=await manual.related('LEDGER',record.recordId);
    const remaining=Number(current.remainingSatang ?? current.amountSatang ?? 0);
    detailShell(documentRef.getElementById('outcomeDetail'),current,{
      truth:`ต้องจ่ายคงเหลือ ${moneyText(remaining)} บาท`,
      secondary:!['COMPLETED','CANCELLED'].includes(current.status)?[{label:'ยกเลิกภาระ',run:()=>mutate(()=>manual.cancelExpected({workflowId:makeId('WF-OBL-CANCEL'),recordId:current.recordId}),'ยกเลิกภาระและอ่าน Truth ใหม่แล้ว')}]:[],
      history,related,
    });
  }

  async function openCalendarDetail(record) {
    const manual=getManual();
    const current=await manual.getRecord('CALENDAR',record.recordId) || record;
    const history=await manual.history('CALENDAR',record.recordId);
    const related=await manual.related('CALENDAR',record.recordId);
    const active=!['COMPLETED','CANCELLED'].includes(current.status);
    const secondary=[];
    if(active){
      secondary.push({label:'แก้รายการ',run:()=>showManualActionSheet({title:`แก้ไข · ${current.title}`,build:body=>{const title=field(documentRef,'ชื่อรายการ ','title',{required:true,value:current.title||''});const detail=field(documentRef,'รายละเอียด ','detail',{value:current.detail||''});const save=node(documentRef,'button',{type:'button'},'บันทึก');save.addEventListener('click',async()=>{closeManualActionSheet();await mutate(()=>manual.editCalendar({workflowId:makeId('WF-CAL-EDIT'),recordId:current.recordId,title:title.input.value,detail:detail.input.value}),'แก้รายการและอ่าน Truth ใหม่แล้ว');});body.append(title.label,detail.label,save);}})});
      secondary.push({label:'เลื่อนวัน',run:()=>showManualActionSheet({title:`เลื่อนวัน · ${current.title}`,build:body=>{const due=field(documentRef,'วันที่ใหม่ ','dueDate',{required:true,type:'date',value:String(current.dueDate||'').slice(0,10)});const save=node(documentRef,'button',{type:'button'},'เลื่อนวัน');save.addEventListener('click',async()=>{closeManualActionSheet();await mutate(()=>manual.rescheduleCalendar({workflowId:makeId('WF-CAL-MOVE'),recordId:current.recordId,dueDate:due.input.value}),'เลื่อนวันและอ่าน Truth ใหม่แล้ว');});body.append(due.label,save);}})});
      secondary.push({label:'ยกเลิกรายการ',run:()=>showManualActionSheet({title:`ยกเลิก · ${current.title}`,build:body=>{body.append(node(documentRef,'p',{},'ยกเลิกรายการนี้โดยไม่สร้างหรือย้อนเงินจริง'));const confirm=node(documentRef,'button',{type:'button'},'ยืนยันยกเลิก');confirm.addEventListener('click',async()=>{closeManualActionSheet();await mutate(()=>manual.cancelCalendar({workflowId:makeId('WF-CAL-CANCEL'),recordId:current.recordId}),'ยกเลิกและอ่าน Truth ใหม่แล้ว');});body.append(confirm);}})});
    }
    detailShell(documentRef.getElementById('manualCalendarDetail'),current,{
      truth:current.dueDate?`กำหนด ${String(current.dueDate).slice(0,10)}`:'ไม่มีกำหนดวัน',
      primary:active?{label:'Complete',run:()=>mutate(()=>manual.completeCalendar({workflowId:makeId('WF-CAL-DONE'),recordId:current.recordId}),'Complete และอ่าน Truth ใหม่แล้ว')}:null,
      secondary,history,related,
    });
  }

  function ledgerSecondaryActions(manual,current) {
    const actions=[];
    actions.push({label:'แก้ชื่อ/รายละเอียด',run:()=>showManualActionSheet({title:`แก้ไข · ${current.title||current.recordId}`,build:body=>{const title=field(documentRef,'ชื่อรายการ ','title',{required:true,value:current.title||''});const detail=field(documentRef,'รายละเอียด ','detail',{value:current.detail||''});const save=node(documentRef,'button',{type:'button'},'บันทึก Amendment');save.addEventListener('click',async()=>{closeManualActionSheet();await mutate(()=>manual.editLedgerMetadata({workflowId:makeId('WF-LEDGER-EDIT'),recordId:current.recordId,title:title.input.value,detail:detail.input.value}),'แก้ metadata และอ่าน Truth ใหม่แล้ว');});body.append(title.label,detail.label,save);}})});
    if(['TARGET','CEILING','RECEIVABLE','OBLIGATION'].includes(current.type)&&!['COMPLETED','CANCELLED'].includes(current.status)) actions.push({label:'ยกเลิก Expected',run:()=>showManualActionSheet({title:'ยืนยันยกเลิก',build:body=>{body.append(node(documentRef,'p',{},'ยกเลิก Expected โดยไม่ลบ Actual Truth'));const confirm=node(documentRef,'button',{type:'button'},'ยืนยันยกเลิก');confirm.addEventListener('click',async()=>{closeManualActionSheet();await mutate(()=>manual.cancelExpected({workflowId:makeId('WF-CANCEL'),recordId:current.recordId}),'ยกเลิก Expected และอ่าน Truth ใหม่แล้ว');});body.append(confirm);}})});
    if(current.type==='TRANSACTION'){
      actions.push({label:'Refund',run:()=>showManualActionSheet({title:`Refund · ${current.title||current.recordId}`,build:body=>{const amount=field(documentRef,'ยอดคืน (บาท) ','amount',{required:true,inputmode:'decimal'});const confirm=node(documentRef,'button',{type:'button'},'บันทึก Refund');confirm.addEventListener('click',async()=>{const satang=Math.round(Number(amount.input.value)*100);if(!Number.isSafeInteger(satang)||satang<=0){notify('ยอดคืนไม่ถูกต้อง',true);return;}closeManualActionSheet();await mutate(()=>manual.refund({workflowId:makeId('WF-REFUND'),originalRecordId:current.recordId,recordId:makeId('TX-REF'),amountSatang:satang,reason:'Manual refund'}),'บันทึก Refund และอ่าน Truth ใหม่แล้ว');});body.append(amount.label,confirm);}})});
      actions.push({label:'Reverse',run:()=>showManualActionSheet({title:`Reverse · ${current.title||current.recordId}`,build:body=>{body.append(node(documentRef,'p',{},'สร้างรายการย้อนกลับโดยรักษา Original Truth ไว้'));const confirm=node(documentRef,'button',{type:'button'},'ยืนยัน Reverse');confirm.addEventListener('click',async()=>{closeManualActionSheet();await mutate(()=>manual.reverse({workflowId:makeId('WF-REV'),originalRecordId:current.recordId,recordId:makeId('TX-REV'),reason:'Manual reversal'}),'บันทึก Reverse และอ่าน Truth ใหม่แล้ว');});body.append(confirm);}})});
    }
    return actions;
  }

  async function openLedgerDetail(record) {
    const manual=getManual();
    const detail=documentRef.getElementById('ledgerDetail');
    const current=await manual.getRecord('LEDGER',record.recordId) || record;
    const history=await manual.history('LEDGER',record.recordId);
    const related=await manual.related('LEDGER',record.recordId);
    const amount=Number(current.amountSatang);
    const truth=Number.isSafeInteger(amount)?`${current.direction==='IN'?'เงินเข้า':current.direction==='OUT'?'เงินออก':'ยอด'} ${moneyText(amount)} บาท`:statusText(current.status);
    detailShell(detail,current,{truth,secondary:ledgerSecondaryActions(manual,current),history,related});
  }

  async function renderLedger(data = null) {
    const manual=getManual();
    const options=data ? { text:data.get('text')||'', direction:data.get('direction')||null, type:data.get('type')||null, status:data.get('status')||null } : {};
    const results=await manual.searchLedger(options);
    const list=documentRef.getElementById('ledgerSearchResults'); list.textContent='';
    for (const record of results) list.append(row(record,{onOpen:()=>openLedgerDetail(record)}));
    if(!results.length) list.textContent='ไม่พบรายการ';
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

      const receivables=await manual.searchLedger({type:'RECEIVABLE'});
      const rList=documentRef.getElementById('receivableList'); rList.textContent='';
      for(const record of receivables) rList.append(row(record,{amountField:'remainingSatang',onOpen:()=>openReceivableDetail(record)}));
      if(!receivables.length) rList.textContent='ยังไม่มี Receivable';

      const obligations=await manual.searchLedger({type:'OBLIGATION'});
      const oList=documentRef.getElementById('outcomeObligationList'); oList.textContent='';
      for(const record of obligations) oList.append(row(record,{amountField:'remainingSatang',onOpen:()=>openOutcomeDetail(record)}));
      if(!obligations.length) oList.textContent='ยังไม่มี Obligation';

      const [todayItems,upcoming,overdue]=await Promise.all([manual.calendarToday(),manual.calendarUpcoming(),manual.calendarOverdue()]);
      const c=documentRef.getElementById('manualCalendarViews'); c.textContent='';
      for(const [label,items] of [['Today',todayItems],['Upcoming',upcoming],['Overdue',overdue]]){
        const group=node(documentRef,'section',{className:'manual-list-group'});
        group.append(node(documentRef,'b',{},`${label} ${items.length}`));
        for(const record of items) group.append(row(record,{onOpen:()=>openCalendarDetail(record)}));
        c.append(group);
      }
      await renderLedger();
    } catch (error) { notify(String(error?.message || error), true); }
  }

  bind();
  return Object.freeze({ render, renderLedger, showManualActionSheet });
}
