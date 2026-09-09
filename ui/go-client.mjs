import {
  detectLocalIntent,
  resolveSalesResponse,
  resolveManagerDecision,
  getChecklist,
  mapMaterialToChecklist,
  evaluateChecklist,
  estimatePackage,
  buildJobSummary,
  buildManagerPacket,
  GO_CLIENT_PACKAGES,
} from './go-client-flow.mjs';

const CLIENT_SURFACE = 'client';
const JOB_LABELS = Object.freeze({
  PROPOSAL:'Proposal',
  COMPANY_PROFILE:'Company Profile',
  PORTFOLIO_CASE_STUDY:'Portfolio / Case Study',
  REPORT_SUMMARY:'Report / Summary',
  OTHER:'Presentation อื่น ๆ',
});

const state = {
  stage:'SALES',
  messages:[],
  jobType:null,
  package:null,
  estimate:null,
  desiredDate:null,
  checklist:null,
  receivedItemIds:new Set(),
  materials:[],
  clientConfirmedComplete:false,
  estimateAccepted:false,
  lastClientMessage:null,
  managerPacket:null,
  managerMode:'AUTO',
  managerBusy:false,
};

const $ = (id) => document.getElementById(id);

export function isGoClientMode() {
  if (!globalThis.location?.href) return false;
  return new URL(globalThis.location.href).searchParams.get('surface') === CLIENT_SURFACE;
}

function ensureStylesheet() {
  if (document.querySelector('link[data-go-client-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'go-client.css';
  link.dataset.goClientStyle = 'true';
  document.head.append(link);
}

function ensureShell() {
  if ($('goClientShell')) return $('goClientShell');
  const wrapper = document.createElement('section');
  wrapper.id = 'goClientShell';
  wrapper.className = 'go-client-shell';
  wrapper.innerHTML = `
    <header class="go-client-header">
      <div>
        <p class="go-client-eyebrow">GO CLIENT · PRESENTATION</p>
        <h1>ออกแบบ Presentation จากข้อมูลที่คุณมี</h1>
        <p class="go-client-muted">แชทนี้เป็นระบบกึ่ง AI สำหรับแนะนำบริการ รับรายละเอียด และเตรียมงานก่อนส่งต่อให้ทีมวางแผนครับ</p>
      </div>
      <button id="goClientHelp" class="go-client-help" type="button">ขอให้ GO ช่วยดู</button>
    </header>

    <main class="go-client-main">
      <section class="go-client-card go-client-offer" aria-labelledby="goClientOfferTitle">
        <div class="go-client-section-head">
          <div><p class="go-client-eyebrow">บริการ</p><h2 id="goClientOfferTitle">เริ่มถามได้ตามปกติ</h2></div>
          <span class="go-client-chip">Feedback 2 รอบ</span>
        </div>
        <p>รับออกแบบ Proposal, Company Profile, Portfolio / Case Study และ Report / Summary จากข้อมูลที่ลูกค้ามีอยู่แล้ว</p>
        <div class="go-client-package-grid" aria-label="แพ็กเกจ">
          <button type="button" data-go-client-package="STARTER"><small>Starter</small><strong>490 บาท</strong><span>ไม่เกิน 5 หน้า</span></button>
          <button type="button" data-go-client-package="STANDARD"><small>Standard</small><strong>790 บาท</strong><span>ไม่เกิน 10 หน้า</span></button>
          <button type="button" data-go-client-package="BUSINESS"><small>Business</small><strong>1,390 บาท</strong><span>ไม่เกิน 20 หน้า</span></button>
        </div>
        <p class="go-client-muted">เกินแพ็กเกจเพิ่ม 70 บาท/หน้า · ถ้ายังไม่รู้จำนวนหน้า ส่งข้อมูลมาให้ประเมินก่อนได้ครับ</p>
      </section>

      <section class="go-client-card" aria-labelledby="goClientChatTitle">
        <div class="go-client-section-head"><div><p class="go-client-eyebrow">คุยกับ GO Client</p><h2 id="goClientChatTitle">สอบถามหรือเริ่มงาน</h2></div></div>
        <div id="goClientThread" class="go-client-thread" aria-live="polite"></div>

        <div id="goClientJobChoices" class="go-client-choice-row" aria-label="ประเภทงาน">
          <button type="button" data-go-client-job="PROPOSAL">Proposal</button>
          <button type="button" data-go-client-job="COMPANY_PROFILE">Company Profile</button>
          <button type="button" data-go-client-job="PORTFOLIO_CASE_STUDY">Portfolio / Case Study</button>
          <button type="button" data-go-client-job="REPORT_SUMMARY">Report / Summary</button>
          <button type="button" data-go-client-job="OTHER">งาน Presentation อื่น</button>
        </div>

        <form id="goClientForm" class="go-client-composer">
          <label class="go-client-sr-only" for="goClientInput">พิมพ์ข้อความ</label>
          <textarea id="goClientInput" rows="2" maxlength="1200" placeholder="ถามราคา ส่งรายละเอียด หรือบอกงานที่สนใจได้เลยครับ"></textarea>
          <button class="go-client-send" type="submit">ส่ง</button>
        </form>
      </section>

      <section id="goClientIntake" class="go-client-card go-client-intake" hidden>
        <div class="go-client-section-head"><div><p class="go-client-eyebrow">รับบรีฟ</p><h2>ข้อมูลและไฟล์</h2></div><span id="goClientIntakeStage" class="go-client-chip">INTAKE</span></div>
        <p id="goClientChecklistIntro" class="go-client-muted"></p>
        <div id="goClientChecklist" class="go-client-checklist"></div>
        <label class="go-client-file-drop" for="goClientFiles">
          <strong>ส่งไฟล์ที่มีอยู่</strong>
          <span>Word / PDF / PowerPoint / รูปภาพ / ตาราง และไฟล์อ้างอิง</span>
          <input id="goClientFiles" type="file" multiple accept=".doc,.docx,.pdf,.ppt,.pptx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.webp,text/plain,application/pdf,image/*">
        </label>
        <div id="goClientMaterialList" class="go-client-material-list"></div>
        <div class="go-client-inline-actions">
          <button id="goClientCompleteProvided" type="button">มีข้อมูลเท่านี้ครับ</button>
        </div>
      </section>

      <section id="goClientEstimate" class="go-client-card" hidden>
        <div class="go-client-section-head"><div><p class="go-client-eyebrow">ประเมินเบื้องต้น</p><h2>แพ็กเกจและขอบเขต</h2></div></div>
        <label>จำนวนหน้าคร่าว ๆ (ถ้าทราบ)
          <input id="goClientPageCount" type="number" min="1" max="500" inputmode="numeric" placeholder="เช่น 8">
        </label>
        <button id="goClientEstimateButton" type="button" class="go-client-primary">ประเมินแพ็กเกจ</button>
        <div id="goClientEstimateResult" class="go-client-estimate-result"></div>
        <label>วันที่อยากรับงาน (ถ้ามี)
          <input id="goClientDesiredDate" type="date">
        </label>
        <p class="go-client-muted">หากยังไม่แน่ใจเรื่องวันรับงาน สามารถเว้นไว้ได้ ระยะเวลาจริงจะยืนยันตามขอบเขตงานก่อนเริ่มครับ</p>
      </section>

      <section id="goClientSummaryCard" class="go-client-card" hidden>
        <div class="go-client-section-head"><div><p class="go-client-eyebrow">สรุปก่อนเริ่ม</p><h2>รายละเอียดงาน</h2></div></div>
        <div id="goClientSummary" class="go-client-summary"></div>
        <button id="goClientConfirm" type="button" class="go-client-primary">ยืนยันรายละเอียดนี้</button>
        <p id="goClientContact" class="go-client-muted"></p>
      </section>
    </main>`;
  document.body.append(wrapper);
  return wrapper;
}

function addMessage(role, text) {
  const value = String(text || '').trim();
  if (!value) return;
  state.messages.push({ role, text:value });
  state.messages = state.messages.slice(-30);
  renderThread();
}

function renderThread() {
  const thread = $('goClientThread');
  if (!thread) return;
  thread.replaceChildren();
  for (const message of state.messages) {
    const bubble = document.createElement('article');
    bubble.className = `go-client-message ${message.role === 'user' ? 'is-user' : 'is-assistant'}`;
    bubble.textContent = message.text;
    thread.append(bubble);
  }
  thread.scrollTop = thread.scrollHeight;
}

function selectedChecklistResult() {
  if (!state.checklist) return null;
  return evaluateChecklist(state.checklist, {
    receivedItemIds:state.receivedItemIds,
    clientConfirmedComplete:state.clientConfirmedComplete,
  });
}

function checklistSummary() {
  if (!state.checklist) return null;
  const result = selectedChecklistResult();
  return {
    received:state.receivedItemIds.size,
    waiting:result?.blockingMissing.length || 0,
    optional:result?.optionalMissing.length || 0,
    verify:state.materials.filter((material) => material.confidence === 'UNKNOWN').length,
  };
}

function renderChecklist() {
  const region = $('goClientChecklist');
  if (!region || !state.checklist) return;
  region.replaceChildren();
  for (const item of state.checklist.items) {
    const row = document.createElement('div');
    const received = state.receivedItemIds.has(item.id);
    row.className = `go-client-check-row ${received ? 'is-received' : ''}`;
    const status = document.createElement('span');
    status.className = 'go-client-check-status';
    status.textContent = received ? '✓' : item.required ? '?' : '○';
    const copy = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = item.label;
    const hint = document.createElement('small');
    hint.textContent = received ? 'ได้รับแล้ว' : item.required ? 'จำเป็นต่อการเริ่มงาน' : 'ถ้ามีส่งมาได้';
    copy.append(title, hint);
    row.append(status, copy);
    region.append(row);
  }
  updateReadinessMessage();
}

function updateReadinessMessage() {
  const result = selectedChecklistResult();
  if (!result || !state.checklist) return;
  if (result.ready) {
    $('goClientChecklistIntro').textContent = 'ข้อมูลหลักครบพอสำหรับประเมินและเตรียมส่งต่อแล้วครับ';
    showEstimateSection();
    return;
  }
  const missingLabels = state.checklist.items.filter((item) => result.blockingMissing.includes(item.id)).map((item) => item.label);
  if (result.completeAsProvided) {
    $('goClientChecklistIntro').textContent = `รับทราบว่ามีข้อมูลเท่านี้ครับ ระบบจะไม่ถามวน แต่ยังขาดข้อมูลสำคัญ: ${missingLabels.join(', ')}`;
    return;
  }
  $('goClientChecklistIntro').textContent = `ตอนนี้ยังขาดข้อมูลที่มีผลต่อการเริ่มงาน: ${missingLabels.join(', ')}`;
}

function renderMaterials() {
  const list = $('goClientMaterialList');
  if (!list) return;
  list.replaceChildren();
  for (const material of state.materials) {
    const row = document.createElement('div');
    row.className = 'go-client-material';
    const title = document.createElement('strong');
    title.textContent = material.name;
    const meta = document.createElement('small');
    const mapped = material.matchedItemIds.length ? `${material.matchedItemIds.length} หมวด` : 'รอตรวจเพิ่ม';
    meta.textContent = `${mapped} · ${material.type || 'ไม่ระบุประเภท'}`;
    row.append(title, meta);
    list.append(row);
  }
}

function showIntake() {
  state.stage = state.stage === 'PRE_ESTIMATE' ? 'PRE_ESTIMATE' : 'INTAKE';
  const section = $('goClientIntake');
  section.hidden = false;
  $('goClientIntakeStage').textContent = state.stage;
  if (!state.jobType) {
    $('goClientChecklistIntro').textContent = 'เลือกประเภทงานก่อน แล้วระบบจะขอเฉพาะข้อมูลที่เกี่ยวกับงานนั้นครับ';
    return;
  }
  if (!state.checklist) state.checklist = getChecklist(state.jobType);
  $('goClientChecklistIntro').textContent = `สำหรับ ${JOB_LABELS[state.jobType] || state.checklist.label} ส่งข้อมูลตามที่มีได้เลยครับ ไม่จำเป็นต้องจัดให้เรียบร้อยก่อน`;
  renderChecklist();
}

function setJobType(jobType) {
  state.jobType = JOB_LABELS[jobType] ? jobType : 'OTHER';
  state.checklist = getChecklist(state.jobType);
  state.receivedItemIds = new Set();
  state.clientConfirmedComplete = false;
  showIntake();
  addMessage('assistant', `รับเป็นงาน ${JOB_LABELS[state.jobType]} ครับ รบกวนส่งข้อมูลและไฟล์ที่มีอยู่ตามรายการด้านล่างได้เลย`);
}

function setPackage(packageId) {
  if (!GO_CLIENT_PACKAGES[packageId]) return;
  state.package = packageId;
  const pkg = GO_CLIENT_PACKAGES[packageId];
  state.estimate = { package:packageId, priceBaht:pkg.priceBaht, pageCount:null, extraPages:0, turnaroundDays:null };
  addMessage('assistant', `เลือก ${pkg.label} ราคา ${pkg.priceBaht.toLocaleString('th-TH')} บาทแล้วครับ เดี๋ยวตรวจข้อมูลจริงอีกครั้งว่าขอบเขตยังอยู่ในแพ็กเกจนี้หรือไม่`);
  showIntake();
  showEstimateSection();
}

function showEstimateSection() {
  $('goClientEstimate').hidden = false;
  renderEstimate();
}

function renderEstimate() {
  const region = $('goClientEstimateResult');
  if (!region) return;
  region.replaceChildren();
  if (!state.estimate) {
    region.textContent = 'หากทราบจำนวนหน้าคร่าว ๆ ระบุด้านบนได้เลยครับ ถ้ายังไม่ทราบ ระบบจะไม่เดาจำนวนหน้าให้เอง';
    renderSummary();
    return;
  }
  const packageId = state.estimate.package;
  const pkg = GO_CLIENT_PACKAGES[packageId];
  const box = document.createElement('div');
  box.className = 'go-client-result-box';
  const pageText = Number.isInteger(state.estimate.pageCount) ? `${state.estimate.pageCount} หน้า` : 'จำนวนหน้ายังไม่ยืนยัน';
  box.innerHTML = `<strong>${pkg?.label || packageId} · ${Number(state.estimate.priceBaht || 0).toLocaleString('th-TH')} บาท</strong><span>${pageText}</span><span>ระยะเวลาจัดส่ง: รอประเมินตามขอบเขตจริง</span>`;
  if (state.estimate.packageMismatch) {
    const warning = document.createElement('p');
    warning.className = 'go-client-warning';
    warning.textContent = `จำนวนหน้าที่ระบุเกินแพ็กเกจที่เลือกไว้ ระบบจึงประเมินเป็น ${pkg?.label || packageId} ก่อนครับ`;
    region.append(box, warning);
  } else {
    region.append(box);
  }
  renderSummary();
}

function renderSummary() {
  const card = $('goClientSummaryCard');
  const region = $('goClientSummary');
  if (!card || !region) return;
  const readiness = selectedChecklistResult();
  if (!state.jobType || !state.estimate || !readiness?.ready) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  const summary = buildJobSummary({
    ...state,
    package:state.estimate.package || state.package,
  });
  const rows = [
    ['ประเภทงาน', JOB_LABELS[summary.jobType] || summary.jobType || '—'],
    ['แพ็กเกจ', GO_CLIENT_PACKAGES[summary.package]?.label || summary.package || '—'],
    ['จำนวนหน้า', summary.pageCount ? `${summary.pageCount} หน้า` : 'ยังไม่ยืนยัน'],
    ['ราคา', summary.priceBaht !== null ? `${summary.priceBaht.toLocaleString('th-TH')} บาท` : 'รอประเมิน'],
    ['ระยะเวลา', summary.turnaroundDays || 'รอประเมินตามขอบเขตจริง'],
    ['วันที่อยากรับงาน', summary.desiredDate || 'ไม่ได้ระบุ'],
    ['รอบ Feedback', `${summary.feedbackRounds} รอบ`],
  ];
  region.replaceChildren();
  for (const [label,value] of rows) {
    const row = document.createElement('div');
    const key = document.createElement('span');
    key.textContent = label;
    const val = document.createElement('strong');
    val.textContent = value;
    row.append(key,val);
    region.append(row);
  }
}

function registerFiles(files) {
  if (!state.checklist) {
    addMessage('assistant', 'เลือกประเภทงานก่อนครับ แล้วผมจะจับไฟล์ลง Checklist ให้ตรงกับงาน');
    return;
  }
  let received = 0;
  for (const file of files) {
    const mapped = mapMaterialToChecklist({ name:file.name, type:file.type }, state.checklist);
    state.materials.push({ name:file.name, type:file.type, size:Number(file.size || 0), ...mapped });
    for (const itemId of mapped.matchedItemIds) state.receivedItemIds.add(itemId);
    received += 1;
  }
  renderMaterials();
  renderChecklist();
  addMessage('assistant', `รับไฟล์เพิ่ม ${received} ไฟล์แล้วครับ ผมเช็กจากชื่อไฟล์และประเภทไฟล์ก่อน โดยยังไม่ได้อ่านเนื้อหาทั้งไฟล์`);
}

function runEstimate() {
  const raw = Number($('goClientPageCount')?.value || 0);
  if (Number.isInteger(raw) && raw > 0) {
    const result = estimatePackage({ pageCount:raw, selectedPackage:state.package });
    if (result) {
      if (result.packageMismatch) {
        state.estimate = result;
        state.package = result.package;
      } else {
        state.estimate = { ...result, turnaroundDays:null };
        state.package = result.package;
      }
    }
  } else if (state.package) {
    const pkg = GO_CLIENT_PACKAGES[state.package];
    state.estimate = { package:state.package, priceBaht:pkg.priceBaht, pageCount:null, extraPages:0, turnaroundDays:null };
  } else {
    addMessage('assistant', 'ถ้ายังไม่ทราบจำนวนหน้า ไม่เป็นไรครับ ส่งข้อมูลที่มีให้ครบก่อน แล้วค่อยให้ GO ประเมินจากขอบเขตจริง');
  }
  showEstimateSection();
}

function updateDesiredDate() {
  state.desiredDate = $('goClientDesiredDate')?.value || null;
  renderSummary();
}

async function requestManagerDecision(packet) {
  const response = await fetch('/api/v1/interpret', {
    method:'POST',
    headers:{ 'content-type':'application/json' },
    body:JSON.stringify({
      version:'1',
      text:'manager peek',
      context:{surface:'GO_CLIENT_MANAGER',managerPacket:packet},
    }),
  });
  if (!response.ok) throw new Error('GO_CLIENT_MANAGER_FAILED');
  return response.json();
}

async function callManager(reason = 'OTHER', source = 'CLIENT') {
  if (state.managerBusy) return null;
  const packet = buildManagerPacket({
    ...state,
    recentMessages:state.messages,
    checklistSummary:checklistSummary(),
  }, reason, source);
  state.managerPacket = packet;
  globalThis.dispatchEvent(new CustomEvent('ygph:go-client-manager-call', { detail:packet }));
  const helpButton = $('goClientHelp');
  state.managerBusy = true;
  if (helpButton) helpButton.disabled = true;
  try {
    const resolved = resolveManagerDecision(await requestManagerDecision(packet), state);
    if (resolved.disposition === 'WHISPER') {
      state.managerMode = 'AUTO';
      addMessage('assistant', resolved.text);
      return resolved;
    }
    if (resolved.disposition === 'DIRECT_REPLY') {
      state.managerMode = 'AUTO';
      addMessage('assistant', resolved.text);
      return resolved;
    }
    state.managerMode = 'TAKEOVER';
    addMessage('assistant', resolved.text);
    return resolved;
  } catch {
    state.managerMode = 'AUTO';
    addMessage('assistant', 'ตอนนี้เรียก GO มาดูเคสไม่ได้ครับ คุณยังพิมพ์รายละเอียดต่อได้ตามปกติ แล้วระบบจะช่วยพา Flow ต่อจากข้อมูลที่มี');
    return null;
  } finally {
    state.managerBusy = false;
    if (helpButton) helpButton.disabled = false;
  }
}

async function classifyWithApi(text) {
  const response = await fetch('/api/v1/interpret', {
    method:'POST',
    headers:{ 'content-type':'application/json' },
    body:JSON.stringify({
      version:'1',
      text,
      context:{ surface:'GO_CLIENT', stage:state.stage, jobType:state.jobType, package:state.package },
    }),
  });
  if (!response.ok) throw new Error('GO_CLIENT_INTERPRET_FAILED');
  return response.json();
}

function applyInterpretation(result = {}) {
  if (result.jobType) {
    state.jobType = result.jobType;
    if (!state.checklist) state.checklist = getChecklist(state.jobType);
  }
  if (result.package && GO_CLIENT_PACKAGES[result.package]) state.package = result.package;
  if (Number.isInteger(result.pageCount) && result.pageCount > 0) {
    const estimate = estimatePackage({ pageCount:result.pageCount, selectedPackage:state.package });
    if (estimate) state.estimate = { ...estimate, turnaroundDays:null };
  }
  if (result.desiredDate) state.desiredDate = result.desiredDate;
  if (result.clientConfirmedComplete === true) state.clientConfirmedComplete = true;
  return result;
}

function maybeMarkComplete(text) {
  if (!/(ครบแล้ว|มีเท่านี้|มีแค่นี้|ทั้งหมดที่มี|ส่งหมดแล้ว)/i.test(text)) return false;
  state.clientConfirmedComplete = true;
  if (state.checklist) renderChecklist();
  return true;
}

async function handleClientText(text) {
  const value = String(text || '').trim();
  if (!value) return;
  state.lastClientMessage = value;
  addMessage('user', value);
  maybeMarkComplete(value);

  if (state.managerMode === 'TAKEOVER') {
    await callManager('TAKEOVER_CONTINUE', 'CLIENT');
    return;
  }

  let route = detectLocalIntent(value);
  if (route.jobType && !state.jobType) state.jobType = route.jobType;
  if (route.package && GO_CLIENT_PACKAGES[route.package]) state.package = route.package;

  if (route.intent === 'UNKNOWN') {
    try {
      route = applyInterpretation(await classifyWithApi(value));
    } catch {
      route = { intent:'UNKNOWN' };
    }
  }

  if (route.wantsManager || route.intent === 'HELP') {
    await callManager(route.intent === 'HELP' ? 'CLIENT_HELP' : route.intent, 'CLIENT');
    return;
  }

  if (route.jobType && !state.checklist && ['START','PRE_ESTIMATE'].includes(route.intent)) {
    state.jobType = route.jobType;
    state.checklist = getChecklist(state.jobType);
  }

  if (route.intent === 'START' || route.intent === 'PRE_ESTIMATE') {
    state.stage = route.intent === 'PRE_ESTIMATE' ? 'PRE_ESTIMATE' : 'INTAKE';
    const response = resolveSalesResponse(route.intent, state);
    addMessage('assistant', response.text);
    showIntake();
    if (state.jobType) renderChecklist();
    if (route.intent === 'PRE_ESTIMATE') showEstimateSection();
    return;
  }

  const response = resolveSalesResponse(route.intent, state);
  addMessage('assistant', response.text);

  if (state.stage !== 'SALES' && state.checklist) {
    const mapped = mapMaterialToChecklist({ name:value, type:'client-message' }, state.checklist);
    if (mapped.matchedItemIds.length && !/(ขาด|ไม่มี|ต้องส่ง|ถาม|ไหม|หรือเปล่า)/i.test(value)) {
      for (const itemId of mapped.matchedItemIds) state.receivedItemIds.add(itemId);
      renderChecklist();
    }
  }
}

function confirmJob() {
  const readiness = selectedChecklistResult();
  if (!readiness?.ready || !state.estimate || !state.jobType) {
    addMessage('assistant', 'ยังมีข้อมูลสำคัญที่ต้องเคลียร์ก่อนยืนยันงานครับ หากติดตรงไหนกด “ขอให้ GO ช่วยดู” ได้เลย');
    return;
  }
  state.stage = 'CONFIRMED';
  state.estimateAccepted = true;
  renderSummary();
  $('goClientContact').textContent = 'ยืนยันรายละเอียดแล้วครับ ขั้นตอนถัดไปเจ้าหน้าที่จะส่งช่องทางติดต่อสำหรับเริ่มงานและส่งต่อเข้า Deep Planning';
  addMessage('assistant', 'รับการยืนยันแล้วครับ รายละเอียดชุดนี้จะใช้เป็นฐานสำหรับขั้นตอนถัดไป โดยจะไม่เติมข้อมูลที่ลูกค้าไม่ได้ให้มาเอง');
}

function bindControls() {
  $('goClientForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = $('goClientInput');
    const value = input.value;
    input.value = '';
    await handleClientText(value);
  });

  document.querySelectorAll('[data-go-client-package]').forEach((button) => {
    button.addEventListener('click', () => setPackage(button.dataset.goClientPackage));
  });
  document.querySelectorAll('[data-go-client-job]').forEach((button) => {
    button.addEventListener('click', () => setJobType(button.dataset.goClientJob));
  });
  $('goClientFiles').addEventListener('change', (event) => registerFiles(Array.from(event.currentTarget.files || [])));
  $('goClientCompleteProvided').addEventListener('click', () => {
    state.clientConfirmedComplete = true;
    renderChecklist();
    addMessage('assistant', 'รับทราบครับ จะถือว่านี่คือข้อมูลทั้งหมดที่มีตอนนี้และจะไม่ถามรายการเดิมวนซ้ำ');
  });
  $('goClientEstimateButton').addEventListener('click', runEstimate);
  $('goClientDesiredDate').addEventListener('change', updateDesiredDate);
  $('goClientConfirm').addEventListener('click', confirmJob);
  $('goClientHelp').addEventListener('click', () => { void callManager('CLIENT_HELP', 'CLIENT'); });
}

export function activateGoClientMode() {
  if (!isGoClientMode()) return false;
  ensureStylesheet();
  ensureShell();
  document.body.classList.add('go-client-mode');
  document.querySelector('.appbar')?.setAttribute('aria-hidden', 'true');
  document.querySelector('.layout')?.setAttribute('aria-hidden', 'true');
  bindControls();
  if (!state.messages.length) {
    addMessage('assistant', 'สวัสดีครับ สามารถพิมพ์ถามได้ตามปกติเลย เช่น ราคา ประเภทงานที่รับ การแก้ไข ระยะเวลา หรือถ้าสนใจเริ่มงานก็แจ้งได้ทันทีครับ');
  }
  $('goClientInput')?.focus();
  return true;
}
