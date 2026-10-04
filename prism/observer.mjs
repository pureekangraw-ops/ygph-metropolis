export function observerReadiness(evidence,now=Date.now()){
  if(!evidence?.pageObserverState)return {state:'LOCAL_ONLY',detail:'ตาในเครื่อง · ยังไม่จับคู่การอ่านหน้าเว็บ'};
  const captured=Number(evidence.pageCapturedAt||0),published=Number(evidence.pagePublishedAt||0),expires=Number(evidence.pageObserverExpiresAt||0);
  const live=evidence.pageObserverState==='PUBLISHED'&&captured>0&&published>0&&now>=captured&&now-captured<=30000&&expires>now;
  const state=live?'LIVE':evidence.pageObserverState==='PUBLISHED'?'STALE':evidence.pageObserverState;
  return {state,detail:live?'ส่งหลักฐานหน้าเว็บจากปริซึมแล้ว':({PAIRING_REQUIRED:'รอจับคู่การอ่านหน้าเว็บ',CAPTURE_PENDING:'จับคู่แล้ว · รอหน้าเว็บที่เปิดอยู่',STALE:'รอหลักฐานหน้าเว็บใหม่',OFFLINE:'ส่งหลักฐานไม่ได้ · รอเชื่อมต่อใหม่',UNSUPPORTED:'หน้านี้ยังอ่านไม่ได้',REJECTED:'หลักฐานถูกปฏิเสธ'}[state]||'ยังไม่ยืนยันการส่งหลักฐาน')};
}
