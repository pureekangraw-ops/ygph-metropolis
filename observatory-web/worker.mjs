const PAGE = \`<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>YGG Observatory · Map</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>
:root{font-family:system-ui,-apple-system,"Noto Sans Thai",sans-serif;color:#ecf5e8;background:#10191c}
*{box-sizing:border-box}body{margin:0}header{display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:12px 14px;background:#111d21;border-bottom:1px solid #31464d}
h1{font-size:16px;margin:0 12px 0 0;font-weight:750;letter-spacing:.3px}small{color:#b0c5c8}
main{display:grid;grid-template-columns:minmax(0,1fr) 300px;height:calc(100dvh - 69px);min-height:430px}
#map{height:100%;min-height:430px;z-index:0}
aside{background:#172328;border-left:1px solid #344750;display:flex;flex-direction:column;min-height:0}
.actions{display:flex;gap:8px;flex-wrap:wrap;padding:12px}
button{font:inherit;background:#2a3f47;border:1px solid #527079;color:#fff;border-radius:11px;padding:9px 12px;cursor:pointer}
button:hover{background:#365461}button.primary{background:#b8ed6b;color:#17200d;border-color:#b8ed6b;font-weight:700}
button:focus-visible,input:focus-visible{outline:2px solid #b8ed6b;outline-offset:2px}
#filter{width:calc(100% - 24px);margin:0 12px 12px;border:1px solid #557079;background:#0c1518;border-radius:10px;color:white;padding:10px}
#pins{list-style:none;padding:0 12px;margin:0;overflow:auto;flex:1}
#pins li{border:1px solid #364b52;border-radius:12px;padding:10px;margin-bottom:9px}
#pins strong{display:block;overflow-wrap:anywhere}
#pins small{display:block;margin:4px 0}
.pin-buttons{display:flex;gap:6px;margin-top:8px}
.pin-buttons button{padding:6px 8px;font-size:12px}
footer{padding:10px 12px;border-top:1px solid #344750;font-size:12px;line-height:1.5;color:#b0c5c8}
#feedback{color:#c5eea0;font-size:13px}a{color:#c6efa3}
@media(max-width:760px){header{min-height:95px}main{height:auto;display:flex;flex-direction:column}#map{height:56dvh;min-height:350px;order:0}aside{height:auto;min-height:290px;max-height:48dvh;order:1;border-left:0;border-top:1px solid #344750}}
</style></head><body>
<header><h1>◉ YGG Observatory · Map</h1><small>แผนที่จริง · แตะค้างหรือคลิกเพื่อปักหมุด</small><span id="feedback" aria-live="polite"></span></header>
<main><div id="map" role="application" aria-label="แผนที่สำหรับปักหมุด"></div>
<aside><div class="actions"><button id="locate" class="primary">⌖ ตำแหน่งฉัน</button><button id="share">แชร์ลิงก์หมุด</button><button id="export">ส่งออก GeoJSON</button><button id="clear">ลบทั้งหมด</button></div>
<input id="filter" type="search" placeholder="ค้นหาหมุด" aria-label="ค้นหาหมุด"><ol id="pins"></ol>
<footer>หมุดบันทึกอยู่ <b>เฉพาะในเบราว์เซอร์นี้</b> ยังไม่ได้ซิงก์กับ Android หรือ GO • ตำแหน่ง GPS ใช้เมื่อคุณกดอนุญาต • © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a></footer></aside></main>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(()=>{
'use strict';
const KEY='observatory-web-map-v1',list=document.querySelector('#pins'),filter=document.querySelector('#filter'),msg=document.querySelector('#feedback');
let pins=[];
try{const data=JSON.parse(localStorage.getItem(KEY)||'[]');if(Array.isArray(data))pins=data.filter(valid).slice(0,500)}catch{}
const map=L.map('map',{zoomControl:true}).setView([13.7563,100.5018],11);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
const markers=new Map();
function valid(p){return p&&typeof p.id==='string'&&typeof p.name==='string'&&p.name.length<=140&&Number.isFinite(p.lat)&&Math.abs(p.lat)<=90&&Number.isFinite(p.lng)&&Math.abs(p.lng)<=180}
function save(){localStorage.setItem(KEY,JSON.stringify(pins))}
function notify(s){msg.textContent=s;setTimeout(()=>{if(msg.textContent===s)msg.textContent=''},3000)}
function render(){
 markers.forEach(m=>map.removeLayer(m));markers.clear();list.replaceChildren();
 const q=filter.value.toLocaleLowerCase();
 pins.forEach(p=>{
 const marker=L.marker([p.lat,p.lng]).addTo(map);const node=document.createElement('span');node.textContent=p.name;marker.bindPopup(node);markers.set(p.id,marker);
 if(!p.name.toLocaleLowerCase().includes(q))return;
 const li=document.createElement('li'),name=document.createElement('strong');name.textContent=p.name;
 const info=document.createElement('small');info.textContent=p.lat.toFixed(6)+', '+p.lng.toFixed(6);
 const row=document.createElement('div');row.className='pin-buttons';
 const visit=document.createElement('button');visit.textContent='ดูจุด';visit.onclick=()=>{map.setView([p.lat,p.lng],Math.max(map.getZoom(),15));marker.openPopup()};
 const rename=document.createElement('button');rename.textContent='เปลี่ยนชื่อ';rename.onclick=()=>{const next=prompt('ชื่อหมุดใหม่',p.name);if(next&&next.trim()){p.name=next.trim().slice(0,140);save();render()}};
 const del=document.createElement('button');del.textContent='ลบ';del.onclick=()=>{if(confirm('ลบหมุดนี้?')){pins=pins.filter(x=>x.id!==p.id);save();render()}};
 row.append(visit,rename,del);li.append(name,info,row);list.append(li);
 });
 if(!list.children.length){const li=document.createElement('li');li.textContent='ยังไม่มีหมุด · แตะค้างบนแผนที่เพื่อเริ่ม';list.append(li)}
}
function add(lat,lng){
 const name=prompt('ชื่อหมุด', 'จุดใหม่');if(name===null)return;
 const title=name.trim();if(!title)return notify('กรุณาตั้งชื่อหมุด');
 if(pins.length>=500)return notify('หมุดเต็ม 500 จุด');
 pins.push({id:crypto.randomUUID(),name:title.slice(0,140),lat,lng});
 try{save();render();notify('บันทึกหมุดแล้ว')}catch{pins.pop();notify('บันทึกไม่ได้ — พื้นที่จัดเก็บเต็ม')}
}
map.on('click',e=>add(e.latlng.lat,e.latlng.lng));
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
 const features=pins.map(p=>({type:'Feature',properties:{name:p.name},geometry:{type:'Point',coordinates:[p.lng,p.lat]}}));
 const blob=new Blob([JSON.stringify({type:'FeatureCollection',features},null,2)],{type:'application/geo+json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='observatory-pins.geojson';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
};
document.querySelector('#clear').onclick=()=>{if(pins.length&&confirm('ลบหมุดทั้งหมดในเบราว์เซอร์นี้?')){pins=[];save();render()}};
filter.addEventListener('input',render);
if(location.hash.startsWith('#pins=')){try{
 const incoming=JSON.parse(decodeURIComponent(location.hash.slice(6)));
 if(Array.isArray(incoming)&&incoming.length<=100&&incoming.every(valid)&&confirm('มีหมุด '+incoming.length+' จุดในลิงก์ ต้องการนำเข้าเพิ่มหรือไม่?')){
 const ids=new Set(pins.map(p=>p.id));incoming.forEach(p=>{if(!ids.has(p.id)&&pins.length<500)pins.push(p)});save();
 }
 history.replaceState({},'',location.pathname);
}catch{notify('อ่านข้อมูลหมุดจากลิงก์ไม่ได้')}}
render();
})();
</script></body></html>\`;
export default {
 async fetch(request){
  const u=new URL(request.url);
  if(request.method!=='GET'||(u.pathname!=='/'&&u.pathname!=='/health'))return new Response('Not found',{status:404});
  if(u.pathname==='/health')return Response.json({service:'YGG_OBSERVATORY_WEB_MAP',status:'READY',storage:'BROWSER_LOCAL_ONLY',remotePin:false});
  return new Response(PAGE,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-frame-options':'DENY','content-security-policy':"default-src 'none'; script-src 'unsafe-inline' https://unpkg.com; style-src 'unsafe-inline' https://unpkg.com; img-src 'self' data: blob: https://*.tile.openstreetmap.org; connect-src https://*.tile.openstreetmap.org; font-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'"}})
 }
};