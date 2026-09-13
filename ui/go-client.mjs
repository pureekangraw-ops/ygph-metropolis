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
  resolveCustomerDeskView,
  GO_CLIENT_PACKAGES,
} from './go-client-flow.mjs';

const CLIENT_SURFACE = 'client';
const PUBLIC_CLIENT_PATH = '/client';
const JOB_LABELS = Object.freeze({
  PROPOSAL:'Proposal',
  COMPANY_PROFILE:'Company Profile',
  PORTFOLIO_CASE_STUDY:'Portfolio / Case Study',
  REPORT_SUMMARY:'Report / Summary',
  OTHER:'Presentation อื่น ๆ',
});

const VIEW_COPY = Object.freeze({
  LANDING:{ title:'', sub:'', status:'พร้อมช่วยรับรายละเอียดงาน' },
  ACTIVE_CHAT:{ title:'คุยกับ GO', sub:'เล่างานแบบที่คุณสะดวกได้เลย', status:'พร้อมช่วยรับรายละเอียดงาน' },
  INTAKE_FILES:{ title:'รับรายละเอียด + ไฟล์', sub:'เก็บสิ่งที่ต้องมีก่อน แล้วค่อยเติมสิ่งที่ยังขาด', status:'กำลังรับรายละเอียดงาน' },
  ESTIMATE_SUMMARY:{ title:'ประมาณการ + สรุปก่อนเริ่ม', sub:'เช็กขอบเขต ราคา และวันรับงานก่อนยืนยัน', status:'กำลังสรุปขอบเขตงาน' },
  GO_ASSISTING:{ title:'GO กำลังช่วยดูเรื่องนี้', sub:'คุยต่อได้ตามปกติ ไม่ต้องทำอะไรเพิ่ม', status:'GO กำลังช่วยดูเรื่องนี้' },
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

function urlOf(href) {
  try { return new URL(String(href || ''), 'https://go-client.invalid'); }
  catch { return new URL('https://go-client.invalid/'); }
}

function isPublicClientPath(href) {
  const pathname = urlOf(href).pathname;
  return pathname === PUBLIC_CLIENT_PATH || pathname === `${PUBLIC_CLIENT_PATH}/`;
}

export function resolveGoClientInterpretEndpoint(href = globalThis.location?.href) {
  return isPublicClientPath(href) ? '/client/api/v1/interpret' : '/api/v1/interpret';
}

export function isGoClientMode() {
  if (!globalThis.location?.href) return false;
  const url = urlOf(globalThis.location.href);
  return isPublicClientPath(url.href) || url.searchParams.get('surface') === CLIENT_SURFACE;
}

function ensureStylesheet() {
  if (document.querySelector('link[data-go-client-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = isPublicClientPath(globalThis.location?.href) ? '/client/assets/go-client.css' : 'go-client.css';
  link.dataset.goClientStyle = 'true';
  document.head.append(link);
}

function ensureShell() {
  if ($('goClientShell')) return $('goClientShell');
  const wrapper = document.createElement('section');
  wrapper.id = 'goClientShell';
  wrapper.className = 'go-client-shell';
  wrapper.setAttribute('data-go-customer-view', 'LANDING');
  wrapper.innerHTML = `
    <header class="go-customer-topbar" aria-label="GO Customer Desk">
      <div class="go-customer-brand-mark" aria-hidden="true"><span>GO</span></div>
      <div class="go-customer-brand-copy">
        <strong><span>GO</span> Customer Desk</strong>
        <small id="goCustomerTopStatus">พร้อมช่วยรับรายละเอียดงาน</small>
      </div>
      <span class="go-customer-live-dot" aria-label="พร้อมใช้งาน"></span>
    </header>

    <section id="goCustomerStateIntro" class="go-customer-state-intro" hidden>
      <h1 id="goCustomerStateTitle"></h1>
      <p id="goCustomerStateSub"></p>
    </section>

    <section id="goCustomerAssistBanner" class="go-customer-assist-banner" hidden>
      <div class="go-customer-assist-avatar" aria-hidden="true">GO</div>
      <div><strong>GO กำลังช่วยดูเรื่องนี้</strong><span>คุยต่อได้ตามปกติ ไม่ต้องทำอะไรเพิ่ม</span></div>
    </section>

    <header class="go-client-header">
      <div class="go-client-hero-copy">
        <h1>เล่างานมาได้เลย<br>เดี๋ยว GO ช่วยพาไปต่อ</h1>
        <p class="go-client-lead">ส่งรายละเอียดเท่าที่มี แล้วค่อยเติมข้อมูลที่หลังได้ ไม่ต้องเตรียมบรีฟให้ครบก่อน</p>
        <div class="go-client-hero-actions">
          <button id="goClientPrimaryStart" class="go-client-primary-route" type="button">เริ่มคุย / ส่งงานมาให้ดู</button>
          <button id="goClientViewPricing" class="go-client-secondary-route" type="button">ดูราคา</button>
        </div>
      </div>
    </header>

    <section class="go-client-trust-strip" aria-label="มาตรฐานการทำงาน">
      <div><span class="go-customer-trust-icon">✓</span><strong>ยึดข้อมูลของคุณ</strong><span>ไม่แต่งข้อมูลเพิ่มเอง</span></div>
      <div><span class="go-customer-trust-icon">✓</span><strong>Feedback 2 รอบ</strong><span>รวมแก้เป็นรอบชัดเจน</span></div>
      <div><span class="go-customer-trust-icon">✓</span><strong>ยังไม่รู้จำนวนหน้าก็เริ่มได้</strong><span>ค่อยประเมินระหว่างคุย</span></div>
      <div><span class="go-customer-trust-icon">✓</span><strong>ข้อมูลยังไม่เรียบร้อยก็ส่งได้</strong><span>GO ช่วยจัดทางให้</span></div>
    </section>

    <main class="go-client-main">
      <section id="goClientChatCard" class="go-client-card go-client-chat-card" aria-labelledby="goClientChatTitle">
        <div class="go-client-section-head">
          <div><h2 id="goClientChatTitle">เล่างานแบบที่คุณสะดวกได้เลย</h2><p class="go-client-card-intro">พิมพ์สั้น ๆ ก่อนก็ได้ GO จะค่อย ๆ ถามต่อให้</p></div>
        </div>

        <div class="go-client-quick-row" aria-label="ทางลัดเริ่มคุย">
          <button type="button" data-go-client-quick="อยากทำสไลด์">ทำสไลด์</button>
          <button type="button" data-go-client-quick="มีไฟล์แล้ว อยากเริ่มงาน">มีไฟล์แล้ว</button>
          <button type="button" data-go-client-quick="อยากทราบราคา">อยากทราบราคา</button>
          <button type="button" data-go-client-quick="ยังไม่รู้จำนวนหน้า">ยังไม่รู้จำนวนหน้า</button>
        </div>

        <div id="goClientThread" class="go-client-thread" aria-live="polite"></div>

        <details class="go-client-job-types">
          <summary>รู้ประเภทงานแล้ว? เลือกได้เลย</summary>
          <div id="goClientJobChoices" class="go-client-choice-row" aria-label="ประเภทงาน">
            <button type="button" data-go-client-job="PROPOSAL">Proposal</button>
            <button type="button" data-go-client-job="COMPANY_PROFILE">Company Profile</button>
            <button type="button" data-go-client-job="PORTFOLIO_CASE_STUDY">Portfolio / Case Study</button>
            <button type="button" data-go-client-job="REPORT_SUMMARY">Report / Summary</button>
            <button type="button" data-go-client-job="OTHER">งาน Presentation อื่น</button>
          </div>
        </details>

        <div id="goCustomerFileTruth" class="go-customer-file-truth" hidden>
          <span aria-hidden="true">!</span>
          <p>GO จะตรวจชื่อไฟล์และประเภทไฟล์ก่อน<br>ยังไม่ได้อ่านเนื้อหาทั้งไฟล์</p>
        </div>

        <form id="goClientForm" class="go-client-composer">
          <label class="go-customer-attach" for="goClientFiles" title="เลือกไฟล์"><span aria-hidden="true">⌕</span><span class="go-client-sr-only">เลือกไฟล์</span></label>
          <label class="go-client-sr-only" for="goClientInput">พิมพ์ข้อความ</label>
          <textarea id="goClientInput" rows="1" maxlength="1200" placeholder="พิมพ์รายละเอียดงาน..."></textarea>
          <button class="go-client-send" type="submit"><span aria-hidden="true">➤</span><span class="go-client-sr-only">ส่ง</span></button>
        </form>
      </section>

      <section id="goClientIntake" class="go-client-card go-client-intake" hidden>
        <div class="go-client-section-head">
          <div><span class="go-customer-section-icon" aria-hidden="true">☷</span><h2>รายละเอียดที่ได้รับ</h2></div>
          <span id="goClientIntakeStage" class="go-client-chip">INTAKE</span>
        </div>
        <p id="goClientChecklistIntro" class="go-client-muted"></p>
        <div id="goClientChecklist" class="go-client-checklist"></div>
        <div class="go-customer-files-panel">
          <h3>ไฟล์</h3>
          <label class="go-client-file-drop" for="goClientFiles">
            <strong><span aria-hidden="true">⇧</span> เลือกไฟล์</strong>
            <span>Word / PDF / PowerPoint / รูปภาพ / ตาราง และไฟล์อ้างอิง</span>
            <input id="goClientFiles" type="file" multiple accept=".doc,.docx,.pdf,.ppt,.pptx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.webp,text/plain,application/pdf,image/*">
          </label>
          <div id="goClientMaterialList" class="go-client-material-list"></div>
          <p class="go-customer-file-note">เลือกไฟล์แล้ว ระบบจะตรวจชื่อไฟล์และประเภทไฟล์เบื้องต้น โดยยังไม่ได้อ่านเนื้อหาทั้งไฟล์</p>
        </div>
        <div class="go-client-inline-actions">
          <button id="goClientCompleteProvided" type="button">มีข้อมูลเท่านี้ครับ</button>
        </div>
      </section>

      <section id="goClientEstimate" class="go-client-card go-client-estimate" hidden>
        <div class="go-client-section-head"><div><span class="go-customer-section-icon" aria-hidden="true">▦</span><h2>ประมาณการเบื้องต้น</h2></div></div>
        <label>จำนวนหน้าคร่าว ๆ (ถ้าทราบ)
          <input id="goClientPageCount" type="number" min="1" max="500" inputmode="numeric" placeholder="เช่น 10">
        </label>
        <button id="goClientEstimateButton" type="button" class="go-client-primary">ดูประมาณการงาน</button>
        <div id="goClientEstimateResult" class="go-client-estimate-result"></div>
        <label>วันที่อยากรับงาน (ถ้ามี)
          <input id="goClientDesiredDate" type="date">
        </label>
        <p class="go-client-muted">หากยังไม่แน่ใจเรื่องวันรับงาน สามารถเว้นไว้ได้ ระยะเวลาจริงจะยืนยันตามขอบเขตงานก่อนเริ่มครับ</p>
      </section>

      <section id="goClientSummaryCard" class="go-client-card go-client-summary-card" hidden>
        <div class="go-client-section-head"><div><h2>สรุปก่อนเริ่มงาน</h2></div></div>
        <div id="goClientSummary" class="go-client-summary"></div>
        <button id="goClientConfirm" type="button" class="go-client-primary">ยืนยันรายละเอียดนี้</button>
        <p id="goClientContact" class="go-client-muted"></p>
      </section>

      <section id="goClientPricing" class="go-client-card go-client-pricing" aria-labelledby="goClientOfferTitle">
        <div class="go-client-section-head">
          <div><h2 id="goClientOfferTitle">แพ็กเกจตามขนาดงาน</h2></div>
          <span class="go-client-chip">Feedback 2 รอบ</span>
        </div>
        <p class="go-client-card-intro">ยังไม่แน่ใจว่าเหมาะกับแพ็กเกจไหนไม่เป็นไรครับ ส่งข้อมูลมาให้ดูก่อนได้</p>
        <div class="go-client-package-grid" aria-label="แพ็กเกจ">
          <button type="button" data-go-client-package="STARTER"><small>Starter</small><strong>490 บาท</strong><span>ไม่เกิน 5 หน้า</span></button>
          <button type="button" data-go-client-package="STANDARD"><small>Standard</small><strong>790 บาท</strong><span>ไม่เกิน 10 หน้า</span></button>
          <button type="button" data-go-client-package="BUSINESS"><small>Business</small><strong>1,390 บาท</strong><span>ไม่เกิน 20 หน้า</span></button>
        </div>
        <p class="go-client-muted">เกินแพ็กเกจเพิ่ม 70 บาท/หน้า · ถ้ายังไม่รู้จำนวนหน้า ส่งข้อมูลมาให้ประเมินก่อนได้ครับ</p>
      </section>

      <section id="goClientHelpLane" class="go-client-help-lane" aria-labelledby="goClientHelpTitle">
        <div class="go-customer-help-icon" aria-hidden="true">◉</div>
        <div>
          <h2 id="goClientHelpTitle">ติดตรงไหน ให้ GO ช่วยดู</h2>
          <p>ถ้าเรื่องนี้ต้องดูละเอียดขึ้น เรียก GO เข้ามาช่วยได้เลย</p>
        </div>
        <button id="goClientHelp" class="go-client-help" type="button">ขอให้ GO ช่วยดู</button>
      </section>
    </main>`;
  document.body.append(wrapper);
  return wrapper;
}

function syncCustomerDeskView() {
  const shell = $('goClientShell');
  if (!shell) return;
  const view = resolveCustomerDeskView(state);
  shell.setAttribute('data-go-customer-view', view);
  const copy = VIEW_COPY[view] || VIEW_COPY.LANDING;
  const topStatus = $('goCustomerTopStatus');
  const intro = $('goCustomerStateIntro');
  const title = $('goCustomerStateTitle');
  const sub = $('goCustomerStateSub');
  const assist = $('goCustomerAssistBanner');
  if (topStatus) topStatus.textContent = copy.status;
  if (intro) intro.hidden = !copy.title || view === 'GO_ASSISTING';
  if (title) title.textContent = copy.title;
  if (sub) sub.textContent = copy.sub;
  if (assist) assist.hidden = view !== 'GO_ASSISTING';
  const help = $('goClientHelpLane');
  if (help) help.hidden = view === 'GO_ASSISTING';
  const truth = $('goCustomerFileTruth');
  if (truth) truth.hidden = state.materials.length === 0;
}

function addMessage(role, text) {
  const value = String(text || '').trim();
  if (!value) return;
  state.messages.push({ role, text:value });
  state.messages = state.messages.slice(-30);
  renderThread();
  syncCustomerDeskView();
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
    status.textContent = received ? '✓' : item.required ? '!' : '○';
    const copy = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = item.label;
    const hint = document.createElement('small');
    hint.textContent = received ? 'ได้รับข้อมูลแล้ว' : item.required ? 'ยังต้องมีข้อมูลส่วนนี้' : 'ถ้ามีส่งมาได้';
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
    $('goClientChecklistIntro').textContent = `รับทราบว่ามีข้อมูลเท่านี้ครับ จะไม่ถามรายการเดิมวนซ้ำ แต่ยังขาดข้อมูลสำคัญ: ${missingLabels.join(', ')}`;
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
    const icon = document.createElement('span');
    icon.className = 'go-customer-file-icon';
    icon.textContent = '▤';
    const copy = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = material.name;
    const meta = document.createElement('small');
    meta.textContent = `${material.type || 'ไม่ระบุประเภท'} · เลือกไฟล์แล้ว · ตรวจชื่อและประเภทไฟล์เบื้องต้น`;
    copy.append(title, meta);
    row.append(icon, copy);
    list.append(row);
  }
  syncCustomerDeskView();
}

function showIntake() {
  state.stage = state.stage === 'PRE_ESTIMATE' ? 'PRE_ESTIMATE' : 'INTAKE';
  const section = $('goClientIntake');
  section.hidden = false;
  $('goClientIntakeStage').textContent = state.stage;
  if (!state.jobType) {
    $('goClientChecklistIntro').textContent = 'ถ้ารู้ประเภทงานแล้วเลือกได้เลยครับ ถ้ายังไม่แน่ใจ พิมพ์เล่างานต่อได้ตามปกติ';
    syncCustomerDeskView();
    return;
  }
  if (!state.checklist) state.checklist = getChecklist(state.jobType);
  $('goClientChecklistIntro').textContent = `สำหรับ ${JOB_LABELS[state.jobType] || state.checklist.label} ส่งข้อมูลตามที่มีได้เลยครับ ไม่จำเป็นต้องจัดให้เรียบร้อยก่อน`;
  renderChecklist();
  syncCustomerDeskView();
}

function setJobType(jobType) {
  state.jobType = JOB_LABELS[jobType] ? jobType : 'OTHER';
  state.checklist = getChecklist(state.jobType);
  state.receivedItemIds = new Set();
  state.clientConfirmedComplete = false;
  showIntake();
  addMessage('assistant', `รับเป็นงาน ${JOB_LABELS[state.jobType]} ครับ ส่งข้อมูลและไฟล์ที่มีอยู่ตามรายการด้านล่างได้เลย`);
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
  syncCustomerDeskView();
}

function renderEstimate() {
  const region = $('goClientEstimateResult');
  if (!region) return;
  region.replaceChildren();
  if (!state.estimate) {
    region.textContent = 'หากทราบจำนวนหน้าคร่าว ๆ ระบุด้านบนได้เลยครับ ถ้ายังไม่ทราบ เราจะไม่เดาจำนวนหน้าให้เอง';
    renderSummary();
    return;
  }
  const packageId = state.estimate.package;
  const pkg = GO_CLIENT_PACKAGES[packageId];
  const box = document.createElement('div');
  box.className = 'go-client-result-box';
  const pageText = Number.isInteger(state.estimate.pageCount) ? `${state.estimate.pageCount} หน้า` : 'จำนวนหน้ายังไม่ยืนยัน';
  box.innerHTML = `<strong>${pkg?.label || packageId} · ${Number(state.estimate.priceBaht || 0).toLocaleString('th-TH')} บาท</strong><span>${pageText}</span><span>ระยะเวลาจัดส่ง: รอยืนยันตามขอบเขต</span>`;
  if (state.estimate.packageMismatch) {
    const warning = document.createElement('p');
    warning.className = 'go-client-warning';
    warning.textContent = `จำนวนหน้าที่ระบุเกินแพ็กเกจที่เลือกไว้ จึงประเมินเป็น ${pkg?.label || packageId} ก่อนครับ`;
    region.append(box, warning);
  } else {
    region.append(box);
  }
  renderSummary();
  syncCustomerDeskView();
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
  const summary = buildJobSummary({ ...state, package:state.estimate.package || state.package });
  const rows = [
    ['ประเภทงาน', JOB_LABELS[summary.jobType] || summary.jobType || '—'],
    ['แพ็กเกจ', GO_CLIENT_PACKAGES[summary.package]?.label || summary.package || '—'],
    ['จำนวนหน้า', summary.pageCount ? `${summary.pageCount} หน้า` : 'ยังไม่ยืนยัน'],
    ['ราคา', summary.priceBaht !== null ? `${summary.priceBaht.toLocaleString('th-TH')} บาท` : 'รอประเมิน'],
    ['ระยะเวลา', summary.turnaroundDays || 'รอยืนยันตามขอบเขต'],
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
  syncCustomerDeskView();
}

function registerFiles(files) {
  if (!state.checklist) {
    addMessage('assistant', 'เลือกประเภทงานก่อนครับ แล้ว GO จะจับไฟล์ลง Checklist ให้ตรงกับงาน');
    return;
  }
  let selected = 0;
  for (const file of files) {
    const mapped = mapMaterialToChecklist({ name:file.name, type:file.type }, state.checklist);
    state.materials.push({ name:file.name, type:file.type, size:Number(file.size || 0), ...mapped });
    for (const itemId of mapped.matchedItemIds) state.receivedItemIds.add(itemId);
    selected += 1;
  }
  renderMaterials();
  renderChecklist();
  addMessage('assistant', `เลือกไฟล์แล้ว ${selected} ไฟล์ครับ ตอนนี้ตรวจชื่อไฟล์และประเภทไฟล์เบื้องต้น โดยยังไม่ได้อ่านเนื้อหาทั้งไฟล์`);
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
  const response = await fetch(resolveGoClientInterpretEndpoint(), {
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
  syncCustomerDeskView();
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
    addMessage('assistant', 'ตอนนี้เรียก GO มาดูเคสไม่ได้ครับ คุณยังพิมพ์รายละเอียดต่อได้ตามปกติ แล้วเราจะพา Flow ต่อจากข้อมูลที่มี');
    return null;
  } finally {
    state.managerBusy = false;
    if (helpButton) helpButton.disabled = false;
    syncCustomerDeskView();
  }
}

async function classifyWithApi(text) {
  const response = await fetch(resolveGoClientInterpretEndpoint(), {
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
  syncCustomerDeskView();
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

function focusStartRoute() {
  $('goClientChatCard')?.scrollIntoView({ behavior:'smooth', block:'start' });
  $('goClientInput')?.focus({ preventScroll:true });
}

function bindControls() {
  $('goClientForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = $('goClientInput');
    const value = input.value;
    input.value = '';
    await handleClientText(value);
  });

  $('goClientPrimaryStart').addEventListener('click', focusStartRoute);
  $('goClientViewPricing').addEventListener('click', () => {
    $('goClientPricing')?.scrollIntoView({ behavior:'smooth', block:'start' });
  });
  document.querySelectorAll('[data-go-client-quick]').forEach((button) => {
    button.addEventListener('click', () => { void handleClientText(button.dataset.goClientQuick); });
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
    addMessage('assistant', 'สวัสดีครับ เล่างานมาได้เลยครับ มีไฟล์ก็เลือกไว้ได้ หรือบอกแค่ว่าอยากทำอะไร เดี๋ยว GO ช่วยพาไปต่อให้');
  }
  syncCustomerDeskView();
  return true;
}