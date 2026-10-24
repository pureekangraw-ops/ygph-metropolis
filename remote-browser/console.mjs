/* Owner console for a shared remote browser session. One Worker, not another engine. */
export const consoleHtml=String.raw`<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>YGG Observatory · Shared Browser</title>
<style nonce="__NONCE__">
:root{color-scheme:dark;font:16px system-ui,-apple-system,sans-serif;background:#101516;color:#f4f6f2}
*{box-sizing:border-box}body{margin:0;padding:18px;max-width:1000px;margin-inline:auto}
header{display:flex;align-items:center;justify-content:space-between;gap:15px;flex-wrap:wrap}
h1{font-size:1.35rem;letter-spacing:.03em;margin:6px 0;color:#c7f464}h2{font-size:1.05rem;margin:12px 0}
small,.muted{color:#bbc6c1}.pill{border:1px solid #41534c;padding:6px 12px;border-radius:999px;font-size:.82rem}
section{background:#20292a;border:1px solid #3a4749;border-radius:16px;padding:16px;margin:14px 0}
label{display:block;margin:4px 0 8px}input,button{font:inherit;min-height:46px;border-radius:10px}
input{color:#f6fbf9;border:1px solid #546464;background:#141e1f;padding:9px 12px;min-width:0;width:100%}
input[type=checkbox]{width:22px;height:22px;min-height:0;vertical-align:middle;margin:0 8px 0 0}
button{background:#2d3e3d;color:#f7faf6;border:1px solid #596f68;padding:10px 14px;cursor:pointer}
button.primary{background:#c7f464;color:#131b13;font-weight:700;border-color:#a4d443}
button:disabled{opacity:.5;cursor:not-allowed}button:focus-visible,input:focus-visible{outline:3px solid #c7f464;outline-offset:2px}
.row{display:flex;gap:9px;flex-wrap:wrap;align-items:center}.row>*{flex:1 1 auto}
.stack{display:grid;gap:12px;grid-template-columns:1fr 1fr}
.status{white-space:pre-wrap;color:#d6e1d9;overflow-wrap:anywhere}
#pageInfo{min-height:52px}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:340px;overflow-y:auto;background:#0e1718;padding:12px;border-radius:10px;font-size:.85rem}
#login{max-width:640px}#workspace[hidden],#login[hidden]{display:none}
@media(max-width:650px){body{padding:10px}.stack{grid-template-columns:1fr}.row>*{flex:1 1 140px}}
</style></head><body>
<header><div><h1>◉ YGG OBSERVATORY</h1><div class="muted">Browser Mode · BIG × GO</div></div><span class="pill" id="connection">ไม่ได้เชื่อม</span></header>
<section id="login"><h2>เชื่อมต่อหอดูดาวของบิ๊ก</h2>
<label for="secret">OWNER_TOKEN ของ Worker (ใช้บนหน้านี้เท่านั้น ไม่บันทึกลงเครื่อง)</label>
<input id="secret" type="password" autocomplete="off" placeholder="วางคีย์เจ้าของที่ตั้งไว้ใน Cloudflare">
<div class="row"><button class="primary" id="connect">เชื่อมต่อ</button><button id="clear">ล้างคีย์</button></div>
<p class="muted">คีย์ไม่ถูกบันทึกใน LocalStorage หรือ Cookie อย่าส่งคีย์ผ่านแชตหรือภาพหน้าจอ</p></section>
<div id="workspace" hidden>
<section><div class="row"><div><h2>เซสชันเดียวกับ GO และมือถือ</h2><div class="muted" id="who">ผู้ควบคุม: BIG</div></div><button id="disconnect">ออกจากหน้าควบคุม</button></div>
<label for="address">เปิดเว็บไซต์ HTTPS</label><div class="row">
<input id="address" value="https://shop.yggmetro.com/" inputmode="url"><button class="primary" id="open">เปิดเว็บ</button>
</div><label><input type="checkbox" id="recording">บันทึกเซสชันไว้ดูย้อนหลังบน Cloudflare (อาจมีข้อมูลหน้าเว็บ)</label>
<div class="row"><button id="live">▶ ดูสด</button><button id="observe">👁 อ่านหน้า</button><button id="invite">เรียก GO มาดู</button></div>
<p id="pageInfo" class="status" role="status" aria-live="polite">ยังไม่มีเซสชัน</p></section>
<div class="stack">
<section><h2>🖐️ สลับการควบคุม</h2>
<div class="row"><button id="delegate">ให้ GO ทำแทน</button><button id="takeover">ฉันควบคุมเอง</button></div>
<p class="muted">GO เริ่มงานเมื่อมีคำสั่งผ่านเครื่องมือที่เชื่อมแล้วเท่านั้น บิ๊กยึดคืนได้ทุกเมื่อ</p></section>
<section><h2>🌙 เบื้องหลัง</h2>
<div class="row"><button id="audit">ตรวจหน้านี้บนคลาวด์</button><button id="job">ดูผลงาน</button><button id="stop">หยุดงาน</button></div>
<p class="muted">ปิดหน้านี้ได้หลังส่งงานให้ระบบแล้ว งานจะรับสถานะจาก Durable Object</p></section>
</div>
<section><h2>🤖 GO / สถานะงาน</h2><p id="note" class="status" aria-live="polite">ยังไม่มีข้อความ</p><pre id="detail" hidden></pre>
<div class="row"><button id="close">⏹ ปิดเซสชัน Cloudflare</button></div>
<p class="muted">ปิดเมื่อไม่ใช้เพื่อไม่สิ้นเปลืองเวลา Browser Run · GOVIEW ยังอยู่ใน APK และใช้แผนที่ออฟไลน์ได้</p></section>
</div>
<script nonce="__NONCE__">
(()=>{"use strict";
const q=id=>document.getElementById(id);
let token="",connected=false,busy=false,refresh=null,noteAt="",jobSeen="";
const show=(message)=>{q("pageInfo").textContent=String(message);};
const tell=(message)=>{q("note").textContent=String(message);};
async function api(method,path,body){
  if(!token)throw Error("ยังไม่ได้เชื่อม OWNER_TOKEN");
  const response=await fetch(path,{method,headers:{"Authorization":"Bearer "+token,"Accept":"application/json","Content-Type":"application/json"},
    ...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();
  if(!response.ok||data.error)throw Error(String(data.error||"HTTP "+response.status));
  return data;
}
async function op(fn){
  if(busy)return;
  busy=true;try{await fn()}catch(e){show("ทำไม่สำเร็จ · "+String(e.message||e).slice(0,130))}
  finally{busy=false}
}
function render(data){
  if(data.pageUrl){q("address").value=data.pageUrl}
  q("who").textContent="ผู้ควบคุม: "+(data.controller||"BIG")+" · "+(data.mode||"IDLE")+" · "+(data.status||"IDLE")+
    " · GO อ่าน: "+(data.goCanObserve?"อนุญาต":"ปิด");
  if(data.note&&data.note.at!==noteAt){noteAt=data.note.at;tell("GO: "+data.note.message)}
  const job=data.job;
  if(job){
    const value=job.status+":"+job.progress+":"+job.total;
    if(value!==jobSeen){jobSeen=value;tell("งาน "+job.status+" · "+job.progress+"/"+job.total+" ขั้น "+(data.note?.message||""))}
  }
}
async function refreshState(){if(!connected||busy)return;try{render(await api("GET","/v1/session"))}catch(e){q("connection").textContent="เชื่อมต่อขัดข้อง";tell(String(e.message))}}
q("connect").addEventListener("click",()=>op(async()=>{
  const raw=q("secret").value.trim();
  if(raw.length<32||raw.length>256)throw Error("ความยาว OWNER_TOKEN ไม่ถูกต้อง");
  token=raw;q("secret").value="";
  const data=await api("GET","/v1/session");
  connected=true;q("login").hidden=true;q("workspace").hidden=false;
  q("connection").textContent="● CONNECTED";render(data);
  if(refresh)clearInterval(refresh);refresh=setInterval(refreshState,5000);
}));
function exit(){token="";connected=false;if(refresh)clearInterval(refresh);refresh=null;noteAt="";jobSeen="";
  q("login").hidden=false;q("workspace").hidden=true;q("connection").textContent="ไม่ได้เชื่อม";}
q("clear").addEventListener("click",()=>{q("secret").value="";exit()});
q("disconnect").addEventListener("click",exit);
q("open").addEventListener("click",()=>op(async()=>{
 const address=q("address").value.trim();
 if(!address.startsWith("https://"))throw Error("ใช้ HTTPS เท่านั้น");
 const data=await api("POST","/v1/session",{url:address,recording:q("recording").checked});
 render(data);show("เปิดเซสชันแล้ว · กดดูสดเพื่อเปิด Live View");
}));
q("live").addEventListener("click",()=>{
 const target=window.open("about:blank","_blank");
 op(async()=>{
   if(!target)throw Error("เบราว์เซอร์บล็อกการเปิดแท็บ");
   try{
     const response=await api("GET","/v1/view");
     const link=response.url||"";
     if(!link.startsWith("https://live.browser.run/"))throw Error("Live View URL ไม่ถูกต้อง");
     target.location.href=link;show("เปิด Live View ในแท็บใหม่แล้ว");
   }catch(e){target.close();throw e}
 });
});
q("observe").addEventListener("click",()=>op(async()=>{
 const data=await api("GET","/v1/observe");
 q("detail").hidden=false;
 q("detail").textContent=(data.title||"")+"\\n"+(data.url||"")+"\\n\\n"+(data.text||"").slice(0,8000)+
   "\\n\\nControls: "+JSON.stringify(data.controls||[]);
 show("อ่านหน้าที่เปิดอยู่แล้ว");
}));
q("invite").addEventListener("click",()=>op(async()=>{
 if(!confirm("ให้ GO ที่เชื่อมแล้วอ่านข้อมูลหน้าเว็บนี้แบบไม่แก้ไขใช่ไหม?"))return;
 render(await api("POST","/v1/observe-access",{allow:true}));show("อนุญาตให้ GO อ่านหน้าเว็บนี้แล้ว");
}));
q("delegate").addEventListener("click",()=>op(async()=>{
 if(!confirm("ให้ GO ควบคุมและกด/พิมพ์บนโดเมนที่อนุญาตใช่ไหม?"))return;
 render(await api("POST","/v1/control",{controller:"GO"}));show("ให้ GO ควบคุมแล้ว · เปิด Live View เพื่อดูสด");
}));
q("takeover").addEventListener("click",()=>op(async()=>{render(await api("POST","/v1/control",{controller:"BIG"}));show("BIG รับการควบคุมแล้ว")}));
q("audit").addEventListener("click",()=>op(async()=>{
 const url=q("address").value.trim();
 if(!confirm("ตรวจ "+url+" บนคลาวด์แบบอ่านอย่างเดียว?"))return;
 const result=await api("POST","/v1/audit",{urls:[url],requestId:crypto.randomUUID()});
 show("ส่งงานแล้ว · Job ID: "+result.jobId+" · ปิดหน้านี้ได้");
}));
q("job").addEventListener("click",()=>op(async()=>{
 const result=await api("GET","/v1/job");
 q("detail").hidden=false;q("detail").textContent=JSON.stringify(result.job||{status:"NO_JOB"},null,2).slice(0,16000);
 show("อ่านผลล่าสุดแล้ว");
}));
q("stop").addEventListener("click",()=>op(async()=>{
 if(!confirm("ขอหยุดงานที่กำลังทำ? การกดที่ส่งไปแล้วอาจย้อนคืนไม่ได้"))return;
 render(await api("POST","/v1/stop",{}));show("ส่งคำขอหยุดแล้ว · รอผลยืนยันจากงาน");
}));
q("close").addEventListener("click",()=>op(async()=>{
 if(!confirm("ปิดเซสชัน Cloudflare ปัจจุบัน?"))return;
 render(await api("POST","/v1/close",{}));show("ปิดเซสชันแล้ว ถ้าเปิดบันทึกสามารถดูย้อนหลังใน Cloudflare Runs");
}));
})();
</script></body></html>`;
