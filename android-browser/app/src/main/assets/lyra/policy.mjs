const modes = {GENOME:['SHOP','OFFICE'], LYRA:['INSIDE','OUTSIDE']};
const allowedBrowserActions = new Set(['click','fill','scroll','navigate','back','forward','reload']);
const nonempty = v => typeof v === 'string' && v.trim().length > 0;
const fresh = (t, now, age) => Number.isSafeInteger(t) && t <= now && now-t <= age;
const workOf = ctx => nonempty(ctx.work?.workId) && nonempty(ctx.work?.checkpointId)
  ? {workId:ctx.work.workId,checkpointId:ctx.work.checkpointId} : null;
const sensitive = /password|passcode|otp|token|secret|payment|authorization|cookie|รหัสผ่าน|รหัสยืนยัน|รหัสลับ|บัตรเครดิต|ชำระ/i;

export function evaluateAgent(input, now = Date.now()) {
  if (!input || !modes[input.agent]) throw new Error('AGENT_UNKNOWN');
  if (!modes[input.agent].includes(input.mode)) throw new Error('MODE_INVALID');
  if (!nonempty(input.text) || input.text.length>8000) throw new Error('TEXT_INVALID');
  if (!Number.isSafeInteger(now) || now<0) throw new Error('CLOCK_INVALID');
  const ctx = input.context ?? {};
  if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)) throw new Error('CONTEXT_INVALID');
  const plan = {agent:input.agent,mode:input.mode,action:'CLARIFY',status:'WAITING',reason:null,
    reply:'อยากให้ช่วยอะไรต่อจากข้อมูลนี้ครับ?',workContext:workOf(ctx),evidenceRefs:[],
    proposal:null,businessOutcome:'UNKNOWN',commercial:{payment:'UNKNOWN'}};
  const answer = fields => ({...plan,...fields});
  if (ctx.mode && ctx.mode!==input.mode) return answer({status:'BLOCKED',reason:'CONTEXT_MODE_MISMATCH',reply:'บริบทคนละพื้นที่ กรุณาเปิดบริบทของหน้านี้ใหม่ครับ'});

  if (input.agent==='GENOME' && input.mode==='SHOP') {
    if (/โอน|ชำระ|จ่ายแล้ว|payment|paid/i.test(input.text)) return answer({action:'REVIEW_PAYMENT',reply:'รับทราบเรื่องการชำระครับ ต้องตรวจหลักฐานก่อนยืนยันยอด'});
    if (/ร้องเรียน|ไม่พอใจ|งานช้า|refund|complaint/i.test(input.text)) return answer({action:'HANDOFF',reason:'COMPLAINT',reply:'รับทราบปัญหาครับ จะเตรียมรายละเอียดให้ทีมตรวจต่อ'});
    if (/คุย.*(?:คน|ทีม|พนักงาน)|เจ้าหน้าที่|human|manager/i.test(input.text)) return answer({action:'HANDOFF',reason:'HUMAN_REQUEST',reply:'ได้ครับ จะเตรียมข้อมูลที่คุยไว้ให้ทีมรับต่อ'});
    if (/ราคา|ประเมิน|ใบเสนอ|estimate|quote/i.test(input.text)) return answer({action:'REQUEST_ESTIMATE',reply:'ได้ครับ จะเตรียมขอบเขตให้ทีมประเมิน ยังไม่มีราคาที่ตรวจยืนยันครับ'});
    const brief=ctx.brief ?? {};
    if (/เปลี่ยน|เพิ่ม|change|เพิ่มขอบเขต/i.test(input.text) && brief.confirmed) return answer({action:'RECONFIRM_SCOPE',reply:'ขอบเขตเปลี่ยนแล้วครับ ช่วยยืนยันรายละเอียดส่วนที่เปลี่ยนก่อนส่งต่อได้ไหม?'});
    if (!nonempty(brief.goal)) return answer({reply:'งานนี้อยากนำไปใช้ทำอะไรครับ?'});
    if (!nonempty(brief.scope)) return answer({reply:'อยากให้ช่วยทำส่วนไหนของงานนี้ครับ?'});
    if (!brief.confirmed) return answer({action:'CONFIRM_BRIEF',reply:'รายละเอียดที่สรุปไว้ตรงกับงานที่ต้องการไหมครับ?'});
    return answer({action:'PREPARE_HANDOFF',reply:'สรุปพร้อมให้ทีมรับต่อแล้วครับ ยังรอหลักฐานการรับงาน'});
  }

  if (input.agent==='GENOME') {
    if (!plan.workContext) return answer({status:'BLOCKED',reason:'WORK_CONTEXT_REQUIRED',reply:'ยังไม่มี Work และ checkpoint ที่ยืนยันสำหรับอ่านงานนี้ครับ'});
    const owner=ctx.ownerReadback;
    if (!owner) return answer({action:'READ_OWNER',status:'UNKNOWN',reason:'OWNER_READBACK_REQUIRED',reply:'ต้องอ่านสถานะจากเจ้าของงานก่อนครับ'});
    if (owner.workId!==plan.workContext.workId || owner.checkpointId!==plan.workContext.checkpointId)
      return answer({status:'BLOCKED',reason:'WORK_CONTEXT_MISMATCH',reply:'ข้อมูลผลกลับไม่ตรงกับงานหรือ checkpoint ปัจจุบันครับ'});
    if (!fresh(owner.observedAtEpochMs,now,60000) || !Array.isArray(owner.evidenceRefs) || !owner.evidenceRefs.length || !owner.evidenceRefs.every(nonempty) || !nonempty(owner.status))
      return answer({action:'READ_OWNER',status:'UNKNOWN',reason:'CURRENT_EVIDENCE_REQUIRED',reply:'หลักฐานสถานะยังไม่ครบหรือเก่าแล้ว ต้องอ่านใหม่ครับ'});
    return answer({action:'REPORT',status:'OBSERVED',evidenceRefs:[...owner.evidenceRefs],ownerStatus:owner.status,reply:`สถานะจากเจ้าของงาน: ${owner.status} ตรวจเมื่อ ${new Date(owner.observedAtEpochMs).toISOString()}`});
  }

  if (ctx.receipt) return answer({action:'WAIT_READBACK',status:'UNKNOWN',reply:'มี receipt แล้ว แต่ยังต้องอ่านผลจริงก่อนยืนยันว่าสำเร็จครับ'});

  if (input.mode==='INSIDE') {
    const b=ctx.browser, req=ctx.request;
    if (req && !allowedBrowserActions.has(req.action)) return answer({status:'BLOCKED',reason:'ACTION_NOT_ALLOWED',reply:'คำสั่งนี้อยู่นอกชุดคำสั่งบราวเซอร์ที่รองรับครับ'});
    if (!b || b.foreground!==true || b.interactive!==true || !fresh(b.capturedAtEpochMs,now,30000))
      return answer({action:'REFRESH_OBSERVATION',status:'BLOCKED',reason:'CURRENT_CAPTURE_REQUIRED',reply:'เปิดหน้าเว็บและแชร์ภาพสถานะใหม่ก่อนครับ'});
    if (!req) return answer({action:'OBSERVE',status:'OBSERVED',reply:'มี snapshot สดแล้วครับ อยากให้ช่วยอ่านหรือทำอะไรบนหน้านี้?'});
    const authority=`browser.${req.action}`;
    if (!plan.workContext || !Array.isArray(ctx.authorities) || !ctx.authorities.includes(authority))
      return answer({status:'BLOCKED',reason:'AUTHORITY_REQUIRED',reply:'ยังไม่มีสิทธิ์และบริบทงานสำหรับคำสั่งนี้ครับ'});
    if (![b.deviceId,b.tabId,b.captureId].every(nonempty) || !Number.isSafeInteger(b.revision) || b.revision<0 || !Number.isSafeInteger(b.epoch) || b.epoch<0)
      return answer({status:'BLOCKED',reason:'CAPTURE_IDENTITY_INVALID',reply:'ตัวตน snapshot ไม่ครบ ต้องอ่านหน้าใหม่ครับ'});
    const params={};
    if (['click','fill'].includes(req.action)) {
      const target=nonempty(req.targetId) && Array.isArray(b.targets) ? b.targets.find(t=>t && nonempty(t.id) && t.id===req.targetId) : null;
      if (!target || target.sensitive===true || sensitive.test(`${target.type||''} ${target.kind||''} ${target.label||''} ${target.role||''}`))
        return answer({status:'BLOCKED',reason:'TARGET_UNAVAILABLE_OR_SENSITIVE',reply:'เป้าหมายนี้ไม่มีในภาพปัจจุบันหรือเป็นข้อมูลอ่อนไหวครับ'});
      params.targetId=req.targetId;
      if (req.action==='fill') {
        if (typeof req.value!=='string' || req.value.length>4000) return answer({status:'BLOCKED',reason:'VALUE_INVALID'});
        params.value=req.value;
      }
    }
    if (req.action==='navigate') {
      let url;try{url=new URL(req.url);}catch{return answer({status:'BLOCKED',reason:'URL_INVALID'});}
      if (url.protocol!=='https:' || url.username || url.password) return answer({status:'BLOCKED',reason:'HTTPS_REQUIRED'});
      params.url=url.href;
    }
    if (req.action==='scroll') {
      if (!Number.isFinite(req.x)||!Number.isFinite(req.y)||Math.abs(req.x)>10000||Math.abs(req.y)>10000) return answer({status:'BLOCKED',reason:'SCROLL_INVALID'});
      params.x=String(req.x);params.y=String(req.y);
    }
    return answer({action:'PROPOSE_BROWSER',status:'PROPOSED',reply:'เตรียมข้อเสนอคำสั่งแล้วครับ ยังไม่ได้ execute',proposal:{...plan.workContext,deviceId:b.deviceId,tabId:b.tabId,captureId:b.captureId,revision:b.revision,epoch:b.epoch,action:req.action.toUpperCase(),authority,parameters:params,issuedAtEpochMs:now,expiresAtEpochMs:now+30000}});
  }

  if (ctx.request?.action!==undefined && ctx.request.action!=='UPSERT_PIN') return answer({status:'BLOCKED',reason:'ACTION_NOT_ALLOWED',reply:'คำสั่งแผนที่นี้ยังไม่รองรับครับ'});
  // Native app supplies read-only map context; observation grants no mutation authority.
  if (ctx.mapSummary && !ctx.request) return answer({action:'OBSERVE',status:'OBSERVED',reply:'มีข้อมูลแผนที่ที่เปิดอยู่แล้วครับ อยากสำรวจหรือเปรียบเทียบตรงไหน?'});
  const coordinate=ctx.coordinate;
  if (!coordinate || coordinate.status!=='VERIFIED') return answer({action:'RECOMMEND_AREA',status:'UNKNOWN',reply:'ตำแหน่งยังไม่ยืนยัน ให้ใช้เป็นพื้นที่โดยประมาณก่อนครับ'});
  const validPoint=Number.isFinite(coordinate.longitude) && coordinate.longitude>=-180 && coordinate.longitude<=180 && Number.isFinite(coordinate.latitude) && coordinate.latitude>=-90 && coordinate.latitude<=90;
  if (!validPoint || !nonempty(coordinate.source) || !fresh(coordinate.observedAtEpochMs,now,30000) || (coordinate.availableUntil!=null && (!Number.isSafeInteger(coordinate.availableUntil)||coordinate.availableUntil<now)))
    return answer({action:'RECOMMEND_AREA',status:'UNKNOWN',reason:'CURRENT_COORDINATE_EVIDENCE_REQUIRED',reply:'หลักฐานพิกัดยังไม่พอสำหรับจุดแม่นยำครับ'});
  if (!plan.workContext || !Array.isArray(ctx.authorities) || !ctx.authorities.includes('map.upsert_pin')) return answer({status:'BLOCKED',reason:'AUTHORITY_REQUIRED',reply:'ยังไม่มีสิทธิ์เสนอ pin สำหรับงานนี้ครับ'});
  const bounds=ctx.grid?.bounds;
  if (!nonempty(ctx.grid?.id) || !bounds || !['west','south','east','north'].every(k=>Number.isFinite(bounds[k])) || bounds.west>bounds.east || bounds.south>bounds.north || coordinate.longitude<bounds.west || coordinate.longitude>bounds.east || coordinate.latitude<bounds.south || coordinate.latitude>bounds.north)
    return answer({status:'BLOCKED',reason:'GRID_REQUIRED',reply:'ต้องมีกริดเจ้าของที่ครอบคลุมพิกัดก่อนครับ'});
  if (!nonempty(ctx.request?.pinId) || !nonempty(ctx.request?.label)) return answer({reason:'PIN_IDENTITY_REQUIRED',reply:'จุดนี้ใช้ชื่อและตัวตน pin อะไรครับ?'});
  return answer({action:'PROPOSE_PIN',status:'PROPOSED',evidenceRefs:[coordinate.source],reply:'เตรียมข้อเสนอ pin จากพิกัดที่ยืนยันแล้ว ยังรอแผนที่รับและอ่านผลกลับครับ',proposal:{action:'UPSERT_PIN',pin:{id:ctx.request.pinId,label:ctx.request.label,gridId:ctx.grid.id,point:{longitude:coordinate.longitude,latitude:coordinate.latitude},evidence:{coordinate:'VERIFIED',source:coordinate.source,observedAt:coordinate.observedAtEpochMs,availableUntil:Math.min(coordinate.observedAtEpochMs+30000,coordinate.availableUntil??Infinity)}}}});
}
