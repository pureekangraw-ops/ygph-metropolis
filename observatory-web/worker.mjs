import { parseGeoJSONImport, planGeoJSONMerge } from "./geojson-import.mjs";

const PAGE = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>YGG Observatory · Map</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>
:root{font-family:system-ui,-apple-system,"Noto Sans Thai",sans-serif;color:#ecf5e8;background:#10191c}
*{box-sizing:border-box}body{margin:0}header{display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:12px 14px;background:#111d21;border-bottom:1px solid #31464d}
h1{font-size:16px;margin:0 12px 0 0;font-weight:750;letter-spacing:.3px}small{color:#b0c5c8}
main{display:grid;grid-template-columns:minmax(0,1fr) 300px;height:calc(100dvh - 69px);min-height:430px}
#map{height:100%;min-height:430px;z-index:0}
aside{background:#172328;border-left:1px solid #344750;display:flex;flex-direction:column;min-height:0;overflow:auto}
.actions{display:flex;gap:8px;flex-wrap:wrap;padding:12px}
button{font:inherit;background:#2a3f47;border:1px solid #527079;color:#fff;border-radius:11px;padding:9px 12px;cursor:pointer}
button:hover{background:#365461}button.primary{background:#b8ed6b;color:#17200d;border-color:#b8ed6b;font-weight:700}
button:focus-visible,input:focus-visible{outline:2px solid #b8ed6b;outline-offset:2px}
#filter{width:calc(100% - 24px);margin:0 12px 12px;border:1px solid #557079;background:#0c1518;border-radius:10px;color:white;padding:10px}
#pins{list-style:none;padding:0 12px;margin:0;overflow:auto;flex:1;min-height:120px}
#pins li{border:1px solid #364b52;border-radius:12px;padding:10px;margin-bottom:9px}
#pins strong{display:block;overflow-wrap:anywhere}
#pins small{display:block;margin:4px 0}
.pin-buttons{display:flex;gap:6px;margin-top:8px}
.pin-buttons button{padding:6px 8px;font-size:12px}
.editor,.importer{padding:10px 12px;border-top:1px solid #344750}
.editor h2,.importer h2{font-size:14px;margin:0 0 8px}
.editor label,.importer label{display:block;font-size:12px;color:#b0c5c8;margin:6px 0 3px}
.editor input,.importer input{width:100%;border:1px solid #557079;background:#0c1518;border-radius:8px;color:white;padding:8px;font:inherit}
.coordinates{display:grid;grid-template-columns:1fr 1fr;gap:4px 8px}
.editor .actions{padding:8px 0 2px}
.importer p,#pins-summary{font-size:12px;line-height:1.4;color:#b0c5c8;margin:7px 0}
.importer button{margin-top:7px}
#geojson-apply[disabled]{opacity:.5;cursor:not-allowed}
footer{padding:10px 12px;border-top:1px solid #344750;font-size:12px;line-height:1.5;color:#b0c5c8}
#feedback{color:#c5eea0;font-size:13px}a{color:#c6efa3}
@media(max-width:760px){header{min-height:95px}main{height:auto;display:flex;flex-direction:column}#map{height:56dvh;min-height:350px;order:0}aside{height:auto;min-height:290px;max-height:70dvh;overflow:auto;order:1;border-left:0;border-top:1px solid #344750}}
</style></head><body>
<header><h1>◉ YGG Observatory · Map</h1><small>แผนที่จริง · คลิกจุดเพื่อเติมพิกัด แล้วบันทึกหมุด</small><span id="feedback" aria-live="polite"></span></header>
<main><div id="map" role="application" aria-label="แผนที่สำหรับปักหมุด"></div>
<aside><div class="actions"><button id="locate" class="primary" type="button">⌖ ตำแหน่งฉัน</button><button id="share" type="button">แชร์ลิงก์หมุด</button><button id="export" type="button">ส่งออก GeoJSON</button><button id="clear" type="button">ลบทั้งหมด</button></div>
<section class="editor" aria-label="เพิ่มหรือแก้ไขหมุด"><h2>เพิ่ม / แก้ไขหมุด</h2>
<label for="pin-name">ชื่อ</label><input id="pin-name" maxlength="140" autocomplete="off" placeholder="ชื่อหมุด">
<div class="coordinates"><label for="pin-lat">ละติจูด</label><input id="pin-lat" aria-label="ละติจูด" type="number" step="any" inputmode="decimal"><label for="pin-lng">ลองจิจูด</label><input id="pin-lng" aria-label="ลองจิจูด" type="number" step="any" inputmode="decimal"></div>
<div class="actions"><button id="pin-save" class="primary" type="button">เพิ่มหมุด</button><button id="pin-cancel" type="button" hidden>ยกเลิกแก้ไข</button></div><small id="edit-state" aria-live="polite">เพิ่มหมุด หรือเลือกจุดแล้วกดแก้ไข</small></section>
<section class="importer" aria-label="นำเข้า GeoJSON"><h2>นำเข้า GeoJSON</h2>
<label for="geojson-file">เลือกไฟล์ .geojson / .json</label><input id="geojson-file" aria-label="เลือกไฟล์ GeoJSON" type="file" accept=".geojson,.json,application/geo+json,application/json">
<button id="geojson-preview" type="button">ตรวจสอบและแสดงตัวอย่าง</button><p id="geojson-status" aria-live="polite">รองรับ FeatureCollection ที่มี Point 2D สูงสุด 500 รายการ; ข้อมูลยังอยู่ในเบราว์เซอร์นี้</p>
<button id="geojson-apply" class="primary" type="button" disabled>นำเข้าหมุดที่ตรวจสอบแล้ว</button></section>
<input id="filter" type="search" placeholder="ค้นหาหมุด" aria-label="ค้นหาหมุด"><p id="pins-summary" aria-live="polite"></p><ol id="pins"></ol>
<div class="actions"><button id="pins-prev" type="button">ก่อนหน้า</button><button id="pins-next" type="button">ถัดไป</button></div>
<footer>หมุดบันทึกอยู่ <b>เฉพาะในเบราว์เซอร์นี้</b> ยังไม่ได้ซิงก์กับ Android หรือ GO • ตำแหน่ง GPS ใช้เมื่อคุณกดอนุญาต • © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a></footer></aside></main>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(()=>{
'use strict';
const KEY='observatory-web-map-v1',list=document.querySelector('#pins'),filter=document.querySelector('#filter'),msg=document.querySelector('#feedback');
const parseGeoJSON=${parseGeoJSONImport.toString()};
const planGeoJSONMerge=${planGeoJSONMerge.toString()};
let pins=[],selectedPinId=null,pinPage=0,importPreview=null,importRevision=0;
const pinName=document.querySelector('#pin-name'),pinLat=document.querySelector('#pin-lat'),pinLng=document.querySelector('#pin-lng'),pinSave=document.querySelector('#pin-save'),pinCancel=document.querySelector('#pin-cancel'),editState=document.querySelector('#edit-state');
const importFile=document.querySelector('#geojson-file'),importStatus=document.querySelector('#geojson-status'),importApply=document.querySelector('#geojson-apply'),importPreviewButton=document.querySelector('#geojson-preview');
try{const data=JSON.parse(localStorage.getItem(KEY)||'[]');if(Array.isArray(data))pins=data.filter(valid).slice(0,500)}catch{}
const map=L.map('map',{zoomControl:true}).setView([13.7563,100.5018],11);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
const markers=new Map();
function valid(p){if(!p||typeof p.id!=='string'||typeof p.name!=='string'||p.name.length>140||!Number.isFinite(p.lat)||Math.abs(p.lat)>90||!Number.isFinite(p.lng)||Math.abs(p.lng)>180)return false;if(p.properties===undefined||p.properties===null)return true;try{return typeof p.properties==='object'&&!Array.isArray(p.properties)&&JSON.stringify(p.properties).length<=8192}catch{return false}}
function save(){localStorage.setItem(KEY,JSON.stringify(pins))}
function notify(s){msg.textContent=s;setTimeout(()=>{if(msg.textContent===s)msg.textContent=''},3000)}
function render(){
 markers.forEach(m=>map.removeLayer(m));markers.clear();list.replaceChildren();
 const q=filter.value.toLocaleLowerCase();
 const matches=pins.filter(p=>p.name.toLocaleLowerCase().includes(q));
 const pageSize=25,pageCount=Math.max(1,Math.ceil(matches.length/pageSize));pinPage=Math.min(pinPage,pageCount-1);
 document.querySelector('#pins-summary').textContent=matches.length+' matching / '+pins.length+' total · page '+(pinPage+1)+' of '+pageCount;
 document.querySelector('#pins-prev').disabled=pinPage<=0;document.querySelector('#pins-next').disabled=pinPage>=pageCount-1;
 matches.slice(pinPage*pageSize,(pinPage+1)*pageSize).forEach(p=>{
 const marker=L.marker([p.lat,p.lng]).addTo(map);const node=document.createElement('span');node.textContent=p.name;marker.bindPopup(node);markers.set(p.id,marker);
 if(!p.name.toLocaleLowerCase().includes(q))return;
 const li=document.createElement('li'),name=document.createElement('strong');li.dataset.pinId=p.id;name.textContent=p.name;
 const info=document.createElement('small');info.textContent=p.lat.toFixed(6)+', '+p.lng.toFixed(6);
 const row=document.createElement('div');row.className='pin-buttons';
 const visit=document.createElement('button');visit.type='button';visit.textContent='ดูจุด';visit.onclick=()=>{map.setView([p.lat,p.lng],Math.max(map.getZoom(),15));marker.openPopup()};
 const rename=document.createElement('button');rename.type='button';rename.textContent='แก้ไข';rename.onclick=()=>{selectedPinId=p.id;pinName.value=p.name;pinLat.value=String(p.lat);pinLng.value=String(p.lng);pinSave.textContent='บันทึกการแก้ไข';pinCancel.hidden=false;editState.textContent='กำลังแก้ไข '+p.id;map.setView([p.lat,p.lng],Math.max(map.getZoom(),15));pinName.focus()};
 const del=document.createElement('button');del.type='button';del.textContent='ลบ';del.onclick=()=>{if(confirm('ลบหมุดนี้?')){pins=pins.filter(x=>x.id!==p.id);save();render()}};
 row.append(visit,rename,del);li.append(name,info,row);list.append(li);
 });
 if(!list.children.length){const li=document.createElement('li');li.textContent=pins.length?'ไม่พบหมุดที่ตรงกับคำค้น':'ยังไม่มีหมุด · แตะบนแผนที่เพื่อกำหนดพิกัด';list.append(li)}
}
function clearEditor(){selectedPinId=null;pinName.value='';pinLat.value='';pinLng.value='';pinSave.textContent='เพิ่มหมุด';pinCancel.hidden=true;editState.textContent='เพิ่มหมุด หรือเลือกจุดแล้วกดแก้ไข'}
function savePin(){
 const name=pinName.value.trim();if(!name||name.length>140)return notify('กรุณากรอกชื่อไม่เกิน 140 ตัวอักษร');
 if(!pinLat.value.trim()||!pinLng.value.trim())return notify('กรุณากรอกพิกัดให้ครบ');
 const lat=Number(pinLat.value),lng=Number(pinLng.value);
 if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lng)||Math.abs(lng)>180)return notify('พิกัดไม่ถูกต้อง');
 if(selectedPinId){const p=pins.find(x=>x.id===selectedPinId);if(!p)return notify('ไม่พบหมุดที่เลือก');const old={name:p.name,lat:p.lat,lng:p.lng};Object.assign(p,{name,lat,lng});try{save()}catch{Object.assign(p,old);return notify('บันทึกไม่ได้ — พื้นที่จัดเก็บเต็ม')}}
 else{if(pins.length>=500)return notify('หมุดเต็ม 500 จุด');const p={id:crypto.randomUUID(),name,lat,lng};pins.push(p);try{save()}catch{pins.pop();return notify('บันทึกไม่ได้ — พื้นที่จัดเก็บเต็ม')}}
 clearEditor();pinPage=0;render();notify('บันทึกหมุดแล้ว');
}
map.on('click',e=>{if(!selectedPinId){pinLat.value=e.latlng.lat.toFixed(6);pinLng.value=e.latlng.lng.toFixed(6);if(!pinName.value)pinName.value='จุดใหม่';editState.textContent='พิกัดพร้อมแล้ว · ตั้งชื่อแล้วกดเพิ่มหมุด'}});
pinSave.onclick=savePin;pinCancel.onclick=clearEditor;
document.querySelector('#pins-prev').onclick=()=>{pinPage=Math.max(0,pinPage-1);render()};
document.querySelector('#pins-next').onclick=()=>{pinPage++;render()};
filter.addEventListener('input',()=>{pinPage=0;render()});
importPreviewButton.onclick=async()=>{
 importPreview=null;importApply.disabled=true;const file=importFile.files?.[0];
 if(!file){importStatus.textContent='เลือกไฟล์ GeoJSON ก่อน';return}
 const attempt=++importRevision;importPreviewButton.disabled=true;importStatus.textContent='กำลังตรวจสอบไฟล์…';
 try{const parsed=await parseGeoJSON(await file.text());if(attempt!==importRevision||file!==importFile.files?.[0])return;const plan=planGeoJSONMerge(pins,parsed.pins,500);
 importPreview=plan.canApply?{pins:plan.pinsToAdd,revision:attempt}:null;
 importStatus.textContent='ไฟล์ผ่านการตรวจสอบ: '+parsed.featureCount+' จุด · เพิ่มได้ '+plan.pinsToAdd.length+' · ซ้ำ '+plan.duplicates+' · ขัดแย้ง '+plan.conflicts+' · เกินความจุ '+plan.overflow+(plan.conflicts?' — แก้ข้อมูล ID ซ้ำก่อนนำเข้า':'');
 importApply.disabled=!plan.canApply;
 }catch(error){if(attempt===importRevision)importStatus.textContent='นำเข้าไม่ได้: '+String(error?.message||'รูปแบบไฟล์ไม่ถูกต้อง').slice(0,180);}
 finally{if(attempt===importRevision)importPreviewButton.disabled=false}
};
importFile.addEventListener('change',()=>{importRevision++;importPreview=null;importApply.disabled=true;importStatus.textContent=importFile.files?.[0]?'กดตรวจสอบเพื่อดูตัวอย่างก่อนบันทึก':'เลือกไฟล์ GeoJSON ก่อน'});
importApply.onclick=()=>{if(!importPreview||importApply.disabled||importPreview.revision!==importRevision)return;const before=pins.length;pins.push(...importPreview.pins);try{save()}catch{pins.length=before;return notify('บันทึกไม่ได้ — พื้นที่จัดเก็บเต็ม')};const added=importPreview.pins.length;importRevision++;importPreview=null;importApply.disabled=true;importFile.value='';pinPage=0;render();importStatus.textContent='นำเข้าแล้ว '+added+' จุด; เก็บไว้เฉพาะในเบราว์เซอร์นี้';notify('นำเข้า GeoJSON แล้ว')};
document.querySelector('#locate').onclick=()=>{
 if(!navigator.geolocation)return notify('เบราว์เซอร์ไม่รองรับ GPS');
 navigator.geolocation.getCurrentPosition(p=>{map.setView([p.coords.latitude,p.coords.longitude],16);notify('เลื่อนแผนที่ไปยังตำแหน่งของคุณแล้ว')},()=>notify('ไม่ได้รับสิทธิ์หรือตำแหน่ง GPS'),{enableHighAccuracy:false,timeout:10000,maximumAge:15000});
};
document.querySelector('#share').onclick=async()=>{
 if(pins.length>100)return notify('กรุณาส่งออก GeoJSON เมื่อหมุดเกิน 100 จุด');
 const data=encodeURIComponent(JSON.stringify(pins));const url=location.origin+location.pathname+'#pins='+data;
 if(url.length>12000)return notify('ลิงก์ยาวเกินไป กรุณาส่งออก GeoJSON');
 try{await navigator.clipboard.writeText(url);notify('คัดลอกลิงก์หมุดแล้ว')}catch{prompt('คัดลอกลิงก์นี้',url)}
};
document.querySelector('#export').onclick=()=>{
 const features=pins.map(p=>({type:'Feature',id:p.id,properties:{...(p.properties||{}),name:p.name},geometry:{type:'Point',coordinates:[p.lng,p.lat]}}));
 const blob=new Blob([JSON.stringify({type:'FeatureCollection',features},null,2)],{type:'application/geo+json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='observatory-pins.geojson';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
};
document.querySelector('#clear').onclick=()=>{if(pins.length&&confirm('ลบหมุดทั้งหมดในเบราว์เซอร์นี้?')){pins=[];save();render()}};
if(location.hash.startsWith('#pins=')){try{
 const incoming=JSON.parse(decodeURIComponent(location.hash.slice(6)));
 if(Array.isArray(incoming)&&incoming.length<=100&&incoming.every(valid)&&confirm('มีหมุด '+incoming.length+' จุดในลิงก์ ต้องการนำเข้าเพิ่มหรือไม่?')){
 const ids=new Set(pins.map(p=>p.id));incoming.forEach(p=>{if(!ids.has(p.id)&&pins.length<500)pins.push(p)});save();
 }
 history.replaceState({},'',location.pathname);
}catch{notify('อ่านข้อมูลหมุดจากลิงก์ไม่ได้')}}
render();
})();
</script></body></html>`;
export default {
 async fetch(request){
  const u=new URL(request.url);
  if(request.method!=='GET'||(u.pathname!=='/'&&u.pathname!=='/health'))return new Response('Not found',{status:404});
  if(u.pathname==='/health')return Response.json({service:'YGG_OBSERVATORY_WEB_MAP',status:'READY',storage:'BROWSER_LOCAL_ONLY',remotePin:false});
  return new Response(PAGE,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin','x-frame-options':'DENY','content-security-policy':"default-src 'none'; script-src 'unsafe-inline' https://unpkg.com; style-src 'unsafe-inline' https://unpkg.com; img-src 'self' data: blob: https://tile.openstreetmap.org; connect-src https://tile.openstreetmap.org; font-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'"}})
 }
};