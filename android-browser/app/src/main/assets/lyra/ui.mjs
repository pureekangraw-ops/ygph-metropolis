import {createObservatoryLyra} from './app-agent.mjs';
if(!globalThis.structuredClone)globalThis.structuredClone=x=>JSON.parse(JSON.stringify(x));
const native=globalThis.ObservatoryNative;
const pending=new Map();let counter=0;
function provider(request){return new Promise((resolve,reject)=>{const id=String(++counter);const timer=setTimeout(()=>{pending.delete(id);reject(Error('timeout'));},25000);pending.set(id,{resolve,reject,timer});native.ask(JSON.stringify({id,system:request.system,text:request.text,context:request.context}));});}
globalThis.lyraReceive=(id,response)=>{const p=pending.get(id);if(!p)return;pending.delete(id);clearTimeout(p.timer);response.error?p.reject(Error('unavailable')):p.resolve(response);};
const info=JSON.parse(native.info());const model=info.configured?provider:null;
const agent=createObservatoryLyra({mode:info.mode,provider:model,timeoutMs:26000});
const status=document.querySelector('#status'),log=document.querySelector('#messages'),input=document.querySelector('#question'),send=document.querySelector('#send');
status.textContent=`${info.mode==='INSIDE'?'หน้าเว็บ':'แผนที่'} · ${info.configured?'ตั้งค่า AI แล้ว':'ยังไม่เชื่อม AI'}`;
function add(text,owner=false,state=''){const bubble=document.createElement('div');bubble.className='message'+(owner?' owner':'');bubble.textContent=text;if(state){const line=document.createElement('div');line.className='state';line.textContent=state;bubble.append(line);}log.append(bubble);log.scrollTop=log.scrollHeight;}
add('ไลร่าอยู่ตรงนี้ครับ บิ๊กอยากให้ช่วยดูอะไร?');
document.querySelector('#chat').addEventListener('submit',async event=>{event.preventDefault();const text=input.value.trim();if(!text||send.disabled)return;input.value='';add(text,true);send.disabled=true;try{const context=JSON.parse(native.context());const r=await agent.respond({text,context});add(r.reply,false,({RESPONDED:'AI ตอบจากบริบทที่ส่ง',NOT_CONFIGURED:'ยังไม่เชื่อม AI',UNAVAILABLE:'ติดต่อ AI ไม่ได้',INVALID_OUTPUT:'คำตอบ AI ไม่ผ่านการตรวจ'})[r.modelStatus]||'อ่านตามบริบท');}catch{add('อ่านบริบทไม่ได้ครับ ลองเปิดหน้านี้ใหม่');}finally{send.disabled=false;}});
