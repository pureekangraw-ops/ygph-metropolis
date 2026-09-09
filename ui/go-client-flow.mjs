const PACKAGES = Object.freeze({
  STARTER:Object.freeze({ id:'STARTER', label:'Starter', maxPages:5, priceBaht:490 }),
  STANDARD:Object.freeze({ id:'STANDARD', label:'Standard', maxPages:10, priceBaht:790 }),
  BUSINESS:Object.freeze({ id:'BUSINESS', label:'Business', maxPages:20, priceBaht:1390 }),
});

const ADDITIONAL_PAGE_BAHT = 70;

const CHECKLISTS = Object.freeze({
  PROPOSAL:Object.freeze({
    jobType:'PROPOSAL',
    label:'Proposal',
    items:Object.freeze([
      { id:'proposal_content', label:'เนื้อหาข้อเสนอ / สิ่งที่ต้องการเสนอ', required:true },
      { id:'offer_details', label:'รายละเอียดสินค้า บริการ หรือโครงการ', required:true },
      { id:'pricing_terms', label:'ราคา / แพ็กเกจ / เงื่อนไข', required:false },
      { id:'company_info', label:'ข้อมูลบริษัทหรือผู้เสนอ', required:false },
      { id:'visuals', label:'โลโก้ / รูปภาพที่ต้องการใช้', required:false },
      { id:'proof', label:'ผลงาน / ลูกค้าเดิม / หลักฐานสนับสนุน', required:false },
      { id:'reference', label:'Proposal เดิม / Reference', required:false },
    ]),
  }),
  COMPANY_PROFILE:Object.freeze({
    jobType:'COMPANY_PROFILE',
    label:'Company Profile',
    items:Object.freeze([
      { id:'company_info', label:'ข้อมูลบริษัท / แนะนำบริษัท', required:true },
      { id:'services', label:'สินค้า / บริการ', required:true },
      { id:'strengths', label:'จุดเด่นหรือความสามารถของบริษัท', required:false },
      { id:'projects_clients', label:'ผลงาน / ลูกค้า / โปรเจกต์ที่ผ่านมา', required:false },
      { id:'logo_visuals', label:'โลโก้และรูปภาพบริษัท / สินค้า / บริการ', required:false },
      { id:'contact', label:'ข้อมูลติดต่อ', required:true },
      { id:'team_timeline', label:'ทีมงาน / ประวัติ / Timeline', required:false },
      { id:'proof', label:'ตัวเลข / รางวัล / หลักฐานความน่าเชื่อถือ', required:false },
      { id:'reference', label:'Company Profile เดิม / Brand Guideline / Reference', required:false },
    ]),
  }),
  PORTFOLIO_CASE_STUDY:Object.freeze({
    jobType:'PORTFOLIO_CASE_STUDY',
    label:'Portfolio / Case Study',
    items:Object.freeze([
      { id:'owner_info', label:'ข้อมูลเจ้าของ Portfolio / บริษัท', required:true },
      { id:'project_list', label:'รายการผลงานที่ต้องการนำเสนอ', required:true },
      { id:'project_details', label:'รายละเอียดแต่ละผลงาน / บทบาท / Scope', required:true },
      { id:'project_visuals', label:'รูปภาพของแต่ละงาน', required:true },
      { id:'results', label:'ผลลัพธ์ของงานที่ยืนยันได้', required:false },
      { id:'project_meta', label:'ชื่อลูกค้า / ปี / สถานที่', required:false },
      { id:'before_after', label:'Before–After', required:false },
      { id:'reference', label:'Portfolio เดิม / Reference', required:false },
    ]),
  }),
  REPORT_SUMMARY:Object.freeze({
    jobType:'REPORT_SUMMARY',
    label:'Report / Summary',
    items:Object.freeze([
      { id:'source_data', label:'ข้อมูลต้นทางที่ต้องการนำมาสรุป', required:true },
      { id:'scope_period', label:'ช่วงเวลาหรือขอบเขตของรายงาน', required:true },
      { id:'numbers_tables', label:'ตัวเลข / ตาราง / ข้อมูลสำคัญ', required:false },
      { id:'key_points', label:'ข้อสรุปหรือ Key Point ที่มีอยู่แล้ว', required:false },
      { id:'visuals', label:'รูปภาพ / กราฟ / เอกสารประกอบ', required:false },
      { id:'sources', label:'แหล่งที่มาของข้อมูล', required:false },
      { id:'reference', label:'Report เดิม / รูปแบบองค์กร / Reference', required:false },
    ]),
  }),
  OTHER:Object.freeze({
    jobType:'OTHER',
    label:'Presentation อื่น ๆ',
    items:Object.freeze([
      { id:'primary_content', label:'เนื้อหาหลักที่ต้องการนำเสนอ', required:true },
      { id:'purpose', label:'วัตถุประสงค์ / ใช้กับใครหรือในโอกาสไหน', required:true },
      { id:'source_files', label:'ไฟล์ต้นฉบับที่มีอยู่', required:false },
      { id:'visuals', label:'โลโก้ / รูปภาพ / Visual', required:false },
      { id:'numbers_tables', label:'ตัวเลข / ตาราง', required:false },
      { id:'reference', label:'ไฟล์เดิม / Reference / Mood & Tone', required:false },
    ]),
  }),
});

const SALES_RESPONSES = Object.freeze({
  SERVICE:'รับออกแบบ Presentation จากข้อมูลที่ลูกค้ามีอยู่แล้วครับ เช่น Proposal, Company Profile, Portfolio / Case Study และ Report / Summary โดยช่วยจัดลำดับเนื้อหา ปรับข้อความ วาง Layout และออกแบบภาพรวมให้เหมาะกับการนำเสนอ',
  PRICE:'แพ็กเกจปัจจุบัน: Starter 490 บาทไม่เกิน 5 หน้า, Standard 790 บาทไม่เกิน 10 หน้า, Business 1,390 บาทไม่เกิน 20 หน้า และหน้าเพิ่มเติม 70 บาท/หน้าครับ ทุกแพ็กเกจรวม Feedback 2 รอบ',
  INCLUDED:'ภายในแพ็กเกจช่วยจัดหมวดและเรียงข้อมูล ลดความซ้ำ ปรับข้อความให้อ่านบนสไลด์ง่าย วาง Layout จัดสี ฟอนต์ ภาพ และทำตาราง กราฟ หรือ Diagram เมื่อข้อมูลต้นทางรองรับครับ',
  MATERIALS:'ส่งข้อมูลมาได้ตามที่มีครับ เช่น ข้อความ Word PDF PowerPoint รูปภาพ ตารางหรือตัวเลข Presentation เดิม Logo Brand Guideline หรือ Reference ไม่จำเป็นต้องจัดให้เรียบร้อยก่อน',
  REVISION:'ทุกแพ็กเกจรวม Feedback 2 รอบครับ 1 รอบหมายถึงรวบรวมรายการแก้ไขของงานทั้งชุดแล้วส่งมาในครั้งเดียว ข้อผิดพลาดจากทางเราแก้ฟรีและไม่นับรอบ',
  SCOPE_CHANGE:'หากเพิ่มหน้า เพิ่มเนื้อหาใหม่จำนวนมาก เปลี่ยนแนวทางทั้งชุด รื้อโครงเดิม หรือเปลี่ยนวัตถุประสงค์หลังเริ่มงาน จะประเมินราคาเพิ่มและแจ้งก่อนดำเนินการทุกครั้งครับ',
  TIMELINE:'ระยะเวลาขึ้นอยู่กับจำนวนหน้า ปริมาณข้อมูล และความซับซ้อนของงานครับ หากมีข้อมูลต้นทางแล้วสามารถส่งมาให้ประเมินระยะเวลาเบื้องต้นได้',
  PAGE_COUNT:'ไม่จำเป็นต้องรู้จำนวนหน้าตั้งแต่แรกครับ ส่งข้อมูลที่มีมาให้ดูก่อนได้ แล้วค่อยประเมินจำนวนหน้าและแพ็กเกจที่เหมาะสม',
  OLD_FILE:'ได้ครับ สามารถใช้ Presentation เดิม หรือข้อมูลจาก Word / PDF มาจัดโครง ปรับลำดับ และออกแบบใหม่ได้ หากต้องรื้อโครงจำนวนมากจะประเมิน Scope ก่อนเริ่มงาน',
  UNORGANIZED_CONTENT:'ได้ครับ หากมีข้อมูลต้นทางอยู่แล้ว สามารถช่วยจัดหมวด ลดความซ้ำ เรียงลำดับ และปรับข้อความให้เหมาะกับ Presentation ได้ แต่จะไม่สร้างข้อเท็จจริง ตัวเลข สถิติ หรือ Claim ที่ลูกค้าไม่ได้ให้มา',
  GRAPH_TABLE_DIAGRAM:'ทำได้ครับเมื่อข้อมูลต้นทางรองรับ โดยจะเลือกใช้ตาราง กราฟ หรือ Diagram ตามความเหมาะสมโดยไม่สร้างตัวเลขหรือข้อสรุปที่ไม่มีในข้อมูลต้นทาง',
  PORTFOLIO:'ตัวอย่างผลงานกำลังจัดเตรียมครับ ระหว่างนี้สามารถสอบถามรายละเอียดงาน ราคา หรือส่งลักษณะงานที่สนใจมาให้ดูก่อนได้',
  START:'ได้ครับ หากทราบแพ็กเกจที่ต้องการแล้วสามารถเลือก Starter / Standard / Business ได้เลย หากยังไม่แน่ใจสามารถส่งข้อมูลมาให้ประเมินแพ็กเกจก่อนได้ครับ',
  PRE_ESTIMATE:'ได้ครับ รบกวนระบุประเภท Presentation ที่ต้องการและส่งข้อมูลหรือไฟล์ที่มีอยู่มาให้ดูก่อนได้ จะประเมินจำนวนหน้าประมาณ แพ็กเกจ ราคา และระยะเวลาทำงานเบื้องต้นให้ครับ',
  HELP:'รับทราบครับ เดี๋ยวส่งเคสนี้ให้ GO ช่วยดูให้ โดยจะเริ่มจากข้อมูลที่จำเป็นที่สุดก่อนครับ',
  UNKNOWN:'พิมพ์ถามได้ตามปกติเลยครับ หากเป็นเรื่องราคา ประเภทงาน ไฟล์ที่ต้องใช้ การแก้ไข ระยะเวลา หรืออยากเริ่มงาน ผมช่วยพาไปต่อได้ครับ',
});

function textOf(value) {
  return String(value ?? '').trim().toLowerCase();
}

function hasAny(text, patterns) {
  return patterns.some((pattern) => typeof pattern === 'string' ? text.includes(pattern) : pattern.test(text));
}

function normalizeJobType(value) {
  const text = textOf(value).replace(/[\s/-]+/g, '_');
  if (!text) return null;
  if (text.includes('company') || text.includes('profile') || text.includes('บริษัท')) return 'COMPANY_PROFILE';
  if (text.includes('proposal') || text.includes('ข้อเสนอ')) return 'PROPOSAL';
  if (text.includes('portfolio') || text.includes('case_study') || text.includes('case') || text.includes('ผลงาน')) return 'PORTFOLIO_CASE_STUDY';
  if (text.includes('report') || text.includes('summary') || text.includes('รายงาน') || text.includes('สรุป')) return 'REPORT_SUMMARY';
  return 'OTHER';
}

function normalizePackage(value) {
  const text = textOf(value).toUpperCase();
  if (!text) return null;
  if (text.includes('STARTER') || text === '490') return 'STARTER';
  if (text.includes('STANDARD') || text === '790') return 'STANDARD';
  if (text.includes('BUSINESS') || text === '1390' || text === '1,390') return 'BUSINESS';
  return null;
}

export function detectLocalIntent(input) {
  const text = textOf(input);
  const jobType = normalizeJobType(text);
  const packageId = normalizePackage(text);

  if (!text) return { intent:'UNKNOWN', jobType:null, package:null };
  if (hasAny(text, ['ขอให้ go ช่วยดู','ขอคนช่วย','คุยกับเจ้าหน้าที่','คุยกับคน','ช่วยดูเคส','ช่วยด้วย'])) return { intent:'HELP', jobType:jobType === 'OTHER' ? null : jobType, package:packageId };
  if (hasAny(text, ['ตัวอย่าง','ผลงาน','portfolio ให้ดู','ขอดูงาน'])) return { intent:'PORTFOLIO', jobType:jobType === 'OTHER' ? null : jobType, package:packageId };
  if (hasAny(text, ['แก้งาน','feedback','กี่รอบ','รอบแก้'])) return { intent:'REVISION', jobType:jobType === 'OTHER' ? null : jobType, package:packageId };
  if (hasAny(text, ['เพิ่มหน้า','เปลี่ยน scope','เปลี่ยนขอบเขต','รื้อโครง','เปลี่ยนแนว'])) return { intent:'SCOPE_CHANGE', jobType:jobType === 'OTHER' ? null : jobType, package:packageId };
  if (hasAny(text, ['ราคา','เท่าไร','กี่บาท','แพ็กเกจ','package'])) return { intent:'PRICE', jobType:jobType === 'OTHER' ? null : jobType, package:packageId };
  if (hasAny(text, ['รวมอะไร','ได้อะไรบ้าง','ช่วยอะไรบ้าง'])) return { intent:'INCLUDED', jobType:jobType === 'OTHER' ? null : jobType, package:packageId };
  if (hasAny(text, ['ต้องเตรียม','ส่งอะไร','ไฟล์อะไร','มีแค่ word','มีแค่ pdf'])) return { intent:'MATERIALS', jobType:jobType === 'OTHER' ? null : jobType, package:packageId };
  if (hasAny(text, ['กี่วัน','ใช้เวลา','งานด่วน','วันส่ง','ระยะเวลา'])) return { intent:'TIMELINE', jobType:jobType === 'OTHER' ? null : jobType, package:packageId };
  if (hasAny(text, ['กี่หน้า','ไม่รู้จำนวนหน้า','ควรกี่หน้า'])) return { intent:'PAGE_COUNT', jobType:jobType === 'OTHER' ? null : jobType, package:packageId };
  if (hasAny(text, ['ไฟล์เดิม','สไลด์เก่า','จัดใหม่','redesign'])) return { intent:'OLD_FILE', jobType:jobType === 'OTHER' ? null : jobType, package:packageId };
  if (hasAny(text, ['ข้อมูลยังไม่เรียบร้อย','ข้อมูลกระจัดกระจาย','ช่วยจัดโครง'])) return { intent:'UNORGANIZED_CONTENT', jobType:jobType === 'OTHER' ? null : jobType, package:packageId };
  if (hasAny(text, ['กราฟ','ตาราง','diagram','ไดอะแกรม'])) return { intent:'GRAPH_TABLE_DIAGRAM', jobType:jobType === 'OTHER' ? null : jobType, package:packageId };
  if (hasAny(text, ['ประเมิน','ไม่รู้แพ็กเกจ','เลือกแพ็กเกจไม่ถูก'])) return { intent:'PRE_ESTIMATE', jobType:jobType === 'OTHER' ? null : jobType, package:packageId };
  if (hasAny(text, ['สนใจ','เริ่มงาน','เริ่มเลย','อยากทำ','ให้ทำ','เอา starter','เอา standard','เอา business']) || (jobType && jobType !== 'OTHER' && hasAny(text, ['ทำ','ออกแบบ']))) return { intent:'START', jobType:jobType === 'OTHER' ? null : jobType, package:packageId };
  if (hasAny(text, ['รับทำ','ทำอะไรบ้าง','ประเภทงาน'])) return { intent:'SERVICE', jobType:jobType === 'OTHER' ? null : jobType, package:packageId };
  return { intent:'UNKNOWN', jobType:jobType === 'OTHER' ? null : jobType, package:packageId };
}

export function resolveSalesResponse(intent, state = {}) {
  const key = String(intent || 'UNKNOWN').toUpperCase();
  return {
    intent:key in SALES_RESPONSES ? key : 'UNKNOWN',
    text:SALES_RESPONSES[key] || SALES_RESPONSES.UNKNOWN,
    nextStage:key === 'START' || key === 'PRE_ESTIMATE' ? 'INTAKE' : state.stage || 'SALES',
  };
}

export function resolveManagerDecision(decision, state = {}) {
  const disposition = String(decision?.disposition || '').toUpperCase();
  if (!['WHISPER','DIRECT_REPLY','TAKEOVER'].includes(disposition)) throw new Error('INVALID_MANAGER_DECISION');
  if (disposition === 'WHISPER') {
    const signalIntent = String(decision?.signalIntent || '').toUpperCase();
    if (!signalIntent) throw new Error('INVALID_MANAGER_DECISION');
    const response = resolveSalesResponse(signalIntent, state);
    return { ...decision, disposition, managerVisible:false, text:response.text };
  }
  const text = String(decision?.managerReply || '').trim();
  if (!text) throw new Error('INVALID_MANAGER_DECISION');
  return { ...decision, disposition, managerVisible:true, text };
}

export function getChecklist(jobType) {
  const normalized = normalizeJobType(jobType) || 'OTHER';
  const source = CHECKLISTS[normalized] || CHECKLISTS.OTHER;
  return {
    jobType:source.jobType,
    label:source.label,
    items:source.items.map((item) => ({ ...item })),
  };
}

function materialTokens(fileLike) {
  const name = textOf(fileLike?.name).replace(/[._-]+/g, ' ');
  const type = textOf(fileLike?.type);
  return `${name} ${type}`;
}

function itemMatchesMaterial(itemId, tokens) {
  const rules = {
    proposal_content:['proposal','ข้อเสนอ','เสนอราคา','เสนอ'],
    offer_details:['service','services','product','products','สินค้า','บริการ','project','โครงการ'],
    pricing_terms:['price','pricing','rate','ราคา','แพ็กเกจ','package','term','condition','เงื่อนไข'],
    company_info:['company','about','profile','บริษัท','แนะนำบริษัท','องค์กร'],
    services:['service','services','product','products','สินค้า','บริการ'],
    strengths:['strength','capability','จุดเด่น','ความสามารถ'],
    projects_clients:['client','clients','project','projects','ลูกค้า','โปรเจกต์','ผลงาน'],
    logo_visuals:['logo','brand','visual','image','photo','รูป','ภาพ'],
    contact:['contact','phone','email','address','ติดต่อ','โทร','อีเมล','ที่อยู่'],
    team_timeline:['team','staff','timeline','history','ทีม','ประวัติ'],
    proof:['award','certificate','proof','ลูกค้า','ผลงาน','รางวัล','สถิติ'],
    reference:['reference','ref','guideline','brand guide','mood','ตัวอย่าง','เดิม','old'],
    visuals:['logo','visual','image','photo','picture','รูป','ภาพ'],
    owner_info:['profile','about','owner','company','ผู้จัดทำ','บริษัท'],
    project_list:['portfolio','projects','project list','ผลงาน','รายการงาน'],
    project_details:['scope','role','detail','case','รายละเอียด','บทบาท'],
    project_visuals:['image','photo','portfolio','before','after','รูป','ภาพ'],
    results:['result','results','outcome','ผลลัพธ์'],
    project_meta:['client','year','location','ลูกค้า','ปี','สถานที่'],
    before_after:['before','after','ก่อน','หลัง'],
    source_data:['data','report','summary','source','ข้อมูล','รายงาน','สรุป'],
    scope_period:['period','date','month','year','ช่วงเวลา','ขอบเขต','ปี','เดือน'],
    numbers_tables:['table','sheet','excel','xlsx','csv','number','data','ตาราง','ตัวเลข'],
    key_points:['summary','key point','highlight','สรุป','ประเด็น'],
    sources:['source','reference','citation','แหล่งที่มา'],
    primary_content:['content','brief','document','docx','pdf','ppt','pptx','เนื้อหา','ข้อมูล'],
    purpose:['purpose','audience','use','objective','วัตถุประสงค์','คนดู','ใช้'],
    source_files:['docx','pdf','ppt','pptx','xlsx','xls','csv','document'],
  };
  return (rules[itemId] || []).some((keyword) => tokens.includes(keyword));
}

export function mapMaterialToChecklist(fileLike, checklist) {
  const tokens = materialTokens(fileLike);
  const matchedItemIds = checklist.items.filter((item) => itemMatchesMaterial(item.id, tokens)).map((item) => item.id);
  return {
    name:String(fileLike?.name || ''),
    type:String(fileLike?.type || ''),
    matchedItemIds:[...new Set(matchedItemIds)],
    confidence:matchedItemIds.length ? 'LIKELY' : 'UNKNOWN',
  };
}

function toSet(value) {
  if (value instanceof Set) return value;
  if (Array.isArray(value)) return new Set(value);
  return new Set();
}

export function evaluateChecklist(checklist, checklistState = {}) {
  const received = toSet(checklistState.receivedItemIds);
  const blockingMissing = checklist.items.filter((item) => item.required && !received.has(item.id)).map((item) => item.id);
  const optionalMissing = checklist.items.filter((item) => !item.required && !received.has(item.id)).map((item) => item.id);
  const completeAsProvided = checklistState.clientConfirmedComplete === true;
  return {
    ready:blockingMissing.length === 0,
    completeAsProvided,
    blockingMissing,
    optionalMissing,
    shouldAskForMissing:blockingMissing.length > 0 && !completeAsProvided,
  };
}

export function estimatePackage({ pageCount, selectedPackage = null } = {}) {
  if (!Number.isInteger(pageCount) || pageCount <= 0) return null;
  const candidates = Object.values(PACKAGES).map((pkg, index) => {
    const extraPages = Math.max(0, pageCount - pkg.maxPages);
    return {
      package:pkg.id,
      priceBaht:pkg.priceBaht + extraPages * ADDITIONAL_PAGE_BAHT,
      pageCount,
      extraPages,
      index,
    };
  });
  candidates.sort((left, right) => left.priceBaht - right.priceBaht || left.index - right.index);
  const { index:unusedIndex, ...best } = candidates[0];
  void unusedIndex;
  const result = { ...best };
  const selected = normalizePackage(selectedPackage);
  if (selected) {
    result.selectedPackage = selected;
    result.packageMismatch = selected !== result.package;
  }
  return result;
}

export function buildJobSummary(state = {}) {
  return {
    jobType:state.jobType || null,
    package:state.package || state.estimate?.package || null,
    pageCount:Number.isInteger(state.estimate?.pageCount) ? state.estimate.pageCount : null,
    priceBaht:Number.isFinite(Number(state.estimate?.priceBaht)) ? Number(state.estimate.priceBaht) : null,
    turnaroundDays:state.estimate?.turnaroundDays || null,
    desiredDate:state.desiredDate || null,
    feedbackRounds:2,
    completeAsProvided:state.clientConfirmedComplete === true,
  };
}

export function buildManagerPacket(state = {}, reason = 'OTHER', source = 'SYSTEM') {
  const recentMessages = Array.isArray(state.recentMessages) ? state.recentMessages : [];
  return {
    source:String(source || 'SYSTEM').toUpperCase(),
    reason:String(reason || 'OTHER').toUpperCase(),
    stage:state.stage || null,
    lastClientMessage:state.lastClientMessage || null,
    jobType:state.jobType || null,
    package:state.package || null,
    estimate:state.estimate ? {
      priceBaht:Number.isFinite(Number(state.estimate.priceBaht)) ? Number(state.estimate.priceBaht) : null,
      pageCount:Number.isInteger(state.estimate.pageCount) ? state.estimate.pageCount : null,
      turnaroundDays:state.estimate.turnaroundDays || null,
    } : null,
    checklistSummary:state.checklistSummary ? { ...state.checklistSummary } : null,
    recentContext:recentMessages.slice(-4).map((message) => ({ role:message.role || null, text:String(message.text || '').slice(0, 500) })),
  };
}

export const GO_CLIENT_PACKAGES = PACKAGES;
export const GO_CLIENT_ADDITIONAL_PAGE_BAHT = ADDITIONAL_PAGE_BAHT;
