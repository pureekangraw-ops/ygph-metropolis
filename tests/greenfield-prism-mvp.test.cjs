const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

test('PRISM MVP exposes owner decision, handoff, monitor, and lab surfaces', async ()=>{
  const root=path.join(process.cwd(),'prism');
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  for (const label of ['เรื่องที่ต้องตัดสินใจ','กำลังทำอะไรอยู่','อยากส่งอะไรให้ใคร','ตอนนี้ระบบเป็นยังไง','ของที่กลับมาจากแลป']) {
    assert.match(html,new RegExp(label));
  }
  assert.match(html,/วันนี้มีอะไรให้จัดการ/);
  assert.doesNotMatch(html,/Ledger/);
});

test('SPECTRUM handoff preserves Work identity and fails closed when route unavailable', async ()=>{
  const mod=await import(pathToFileURL(path.join(process.cwd(),'prism','spectrum.mjs')).href);
  const handoff=mod.buildHandoff({
    workId:'WORK-1',checkpointId:'CP-WORK-1',destination:'PIXIE_LAB',requestedResult:'test candidate'
  });
  assert.equal(handoff.ready,true);
  assert.equal(handoff.workId,'WORK-1');
  assert.equal(handoff.checkpointId,'CP-WORK-1');
  assert.deepEqual(mod.resolveDispatchRoute({COUNTER:false,DIRECT_API:false,DEVICE_BRIDGE:false}),{route:'MANUAL',fallback:true});
});

test('PRISM home surfaces only active work and explicit decisions', async ()=>{
  const mod=await import(pathToFileURL(path.join(process.cwd(),'prism','spectrum.mjs')).href);
  const view=mod.buildPrismHome({works:[
    {workId:'W1',title:'merge',status:'WAIT VERIFY',decision:{kind:'MERGE_APPROVAL',summary:'ready'}},
    {workId:'W2',title:'done',status:'COMPLETE'}
  ]});
  assert.equal(view.decisions.length,1);
  assert.equal(view.active.length,1);
  assert.equal(view.decisions[0].workId,'W1');
});


test('PRISM is the staged product entry and Android display identity', ()=>{
  const stage=fs.readFileSync(path.join(process.cwd(),'scripts','stage-lighthouse-next-bundle.mjs'),'utf8');
  const capacitor=JSON.parse(fs.readFileSync(path.join(process.cwd(),'android-shell','capacitor.config.json'),'utf8'));
  assert.match(stage,/title>PRISM</);
  assert.match(stage,/\.\/prism\/index\.html/);
  assert.match(stage,/product:'PRISM'/);
  assert.match(stage,/architecture:'PRISM_MOBILE_V1'/);
  for (const root of ['HOME','WORK','HANDOFF','MONITOR','LAB']) assert.match(stage,new RegExp(`'${root}'`));
  assert.equal(capacitor.appName,'PRISM');
  assert.equal(capacitor.appId,'com.yggdrasil.prism');
});

test('PRISM normal surfaces hide system jargon until advanced drill-down', ()=>{
  const html=fs.readFileSync(path.join(process.cwd(),'prism','index.html'),'utf8');
  const home=html.match(/<section class="page active" data-page="HOME">[\s\S]*?<\/section>\s*<section class="page" data-page="WORK">/)?.[0]||'';
  assert.doesNotMatch(home,/Work ID|Checkpoint ID|Authority|Route|SPECTRUM|Provenance/);
  assert.match(html,/รายละเอียดสำหรับตรวจระบบ/);
  const nav=html.match(/<nav class="bottom-nav"[\s\S]*?<\/nav>/)?.[0]||'';
  for(const label of ['หน้าหลัก','งาน','ส่งต่อ','แลป']) assert.match(nav,new RegExp(label));
  assert.doesNotMatch(nav,/มอนิเตอร์/);
});
