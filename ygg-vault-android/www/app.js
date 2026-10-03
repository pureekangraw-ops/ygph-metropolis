const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],enc=new TextEncoder(),dec=new TextDecoder();
let key=null,entries=[],salt=null;
const SALT_KEY="ygg-vault-salt-v1",DATA_KEY="ygg-vault-data-v1";
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));

function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.remove("hidden");clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.add("hidden"),1600)}
async function derive(password,s){const base=await crypto.subtle.importKey("raw",enc.encode(password),"PBKDF2",false,["deriveKey"]);return crypto.subtle.deriveKey({name:"PBKDF2",salt:s,iterations:250000,hash:"SHA-256"},base,{name:"AES-GCM",length:256},false,["encrypt","decrypt"])}
async function seal(value){const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,enc.encode(JSON.stringify(value)));return{version:1,iv:b64(iv),ciphertext:b64(cipher)}}
async function openData(blob){const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(blob.iv)},key,unb64(blob.ciphertext));return JSON.parse(dec.decode(plain))}
async function save(){localStorage.setItem(DATA_KEY,JSON.stringify(await seal(entries)))}

async function unlock(){
  const password=$("#master").value;
  if(!password)return toast("ใส่ Master Password");
  const savedSalt=localStorage.getItem(SALT_KEY);
  if(savedSalt)salt=unb64(savedSalt); else{salt=crypto.getRandomValues(new Uint8Array(16));localStorage.setItem(SALT_KEY,b64(salt))}
  key=await derive(password,salt);
  const saved=localStorage.getItem(DATA_KEY);
  if(saved){try{entries=await openData(JSON.parse(saved))}catch{key=null;return toast("Master Password ไม่ถูกต้อง")}}
  else{entries=[];await save()}
  $("#auth").classList.add("hidden");$("#vault").classList.remove("hidden");$("#lock").classList.remove("hidden");render();
}
function lock(){key=null;entries=[];$("#master").value="";$("#vault").classList.add("hidden");$("#auth").classList.remove("hidden");$("#lock").classList.add("hidden")}
async function copy(value){if(!value)return toast("ช่องนี้ว่าง");try{await navigator.clipboard.writeText(value)}catch{const t=document.createElement("textarea");t.value=value;document.body.append(t);t.select();document.execCommand("copy");t.remove()}toast("Copied");setTimeout(()=>navigator.clipboard&&navigator.clipboard.writeText("").catch(()=>{}),45000)}
function escapeHtml(value=""){const div=document.createElement("div");div.textContent=value;return div.innerHTML}
function render(){
  const q=$("#search").value.trim().toLowerCase(),group=$("#filter").value;
  const list=entries.filter(e=>(!group||e.group===group)&&(!q||[e.title,e.username,e.type,e.status,e.url,e.notes].join(" ").toLowerCase().includes(q)));
  $("#list").innerHTML=list.map(e=>`<article class="card entry" data-id="${e.id}">
    <div class="entryTop"><div><div class="entryTitle">${escapeHtml(e.title)}</div><div class="chips"><span class="chip">${escapeHtml(e.group)}</span><span class="chip">${escapeHtml(e.type)}</span><span class="chip">${escapeHtml(e.status)}</span></div></div><button class="ghost edit">Edit</button></div>
    ${e.username?`<div class="meta">ID: ${escapeHtml(e.username)}</div>`:""}${e.url?`<div class="meta">${escapeHtml(e.url)}</div>`:""}
    <div class="entryBtns">${e.username?'<button class="ghost quickId">Copy ID</button>':""}${(e.secret||e.clientSecret)?'<button class="ghost quickSecret">Copy Secret</button>':""}${e.url?'<button class="ghost quickOpen">Open URL</button>':""}</div></article>`).join("");
  $$(".edit").forEach(b=>b.onclick=()=>openForm(b.closest(".entry").dataset.id));
  $$(".quickId").forEach(b=>b.onclick=()=>{const e=entries.find(x=>x.id===b.closest(".entry").dataset.id);copy(e.username)});
  $$(".quickSecret").forEach(b=>b.onclick=()=>{const e=entries.find(x=>x.id===b.closest(".entry").dataset.id);copy(e.clientSecret||e.secret)});
  $$(".quickOpen").forEach(b=>b.onclick=()=>{const e=entries.find(x=>x.id===b.closest(".entry").dataset.id);if(e.url)location.href=e.url});
}
function syncType(){
  const oauth=$("#type").value==="OAuth",identifier=$("#type").value==="Identifier";
  $("#oauth").classList.toggle("hidden",!oauth);$("#secretWrap").classList.toggle("hidden",oauth);
  $("#secret").required=!oauth&&!identifier;$("#secretStar").classList.toggle("hidden",identifier);
  $("#clientId").required=oauth;$("#clientSecret").required=oauth;
}
function openForm(id){
  $("#form").reset();$("#id").value="";$("#status").value="Active";$("#delete").classList.add("hidden");
  if(id){const e=entries.find(x=>x.id===id);$("#formTitle").textContent="แก้ไขรายการ";["id","title","group","type","status","username","secret","url","notes","clientId","clientSecret","resourceUrl"].forEach(k=>$("#"+k).value=e[k]||"");$("#delete").classList.remove("hidden")}
  else $("#formTitle").textContent="เพิ่มรายการ";
  syncType();$("#dlg").showModal();
}
$("#form").onsubmit=async ev=>{ev.preventDefault();const id=$("#id").value||crypto.randomUUID();const item={id,title:$("#title").value.trim(),group:$("#group").value,type:$("#type").value,status:$("#status").value,username:$("#username").value.trim(),secret:$("#secret").value,url:$("#url").value.trim(),notes:$("#notes").value.trim(),clientId:$("#clientId").value.trim(),clientSecret:$("#clientSecret").value,resourceUrl:$("#resourceUrl").value.trim()};const i=entries.findIndex(x=>x.id===id);if(i>=0)entries[i]=item;else entries.unshift(item);await save();$("#dlg").close();render();toast("Saved")};
$("#delete").onclick=async()=>{const id=$("#id").value;if(id&&confirm("ลบรายการนี้?")){entries=entries.filter(x=>x.id!==id);await save();$("#dlg").close();render();toast("Deleted")}};
$("#unlock").onclick=unlock;$("#master").onkeydown=e=>{if(e.key==="Enter")unlock()};$("#lock").onclick=lock;$("#add").onclick=()=>openForm();$("#close").onclick=$("#cancel").onclick=()=>$("#dlg").close();$("#type").onchange=syncType;$("#search").oninput=render;$("#filter").onchange=render;
document.addEventListener("click",ev=>{const c=ev.target.closest("[data-copy]");if(c)copy($("#"+c.dataset.copy).value);const s=ev.target.closest("[data-show]");if(s){const i=$("#"+s.dataset.show);i.type=i.type==="password"?"text":"password"}const o=ev.target.closest("[data-open]");if(o){const u=$("#"+o.dataset.open).value;if(u)location.href=u}});
$("#export").onclick=()=>{const payload=localStorage.getItem(DATA_KEY),savedSalt=localStorage.getItem(SALT_KEY);if(!payload||!savedSalt)return toast("ยังไม่มีข้อมูล");const body={format:"YGG-VAULT-ENCRYPTED",version:1,salt:savedSalt,payload:JSON.parse(payload),exportedAt:new Date().toISOString()};const blob=new Blob([JSON.stringify(body,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="YGG-VAULT-BACKUP.json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)};
$("#import").onchange=async ev=>{const file=ev.target.files[0];if(!file)return;try{const body=JSON.parse(await file.text());if(body.format!=="YGG-VAULT-ENCRYPTED"||!body.salt||!body.payload)throw new Error("bad");localStorage.setItem(SALT_KEY,body.salt);localStorage.setItem(DATA_KEY,JSON.stringify(body.payload));toast("Imported — Lock/Unlock ใหม่")}catch{toast("Backup ไม่ถูกต้อง")}ev.target.value=""};
