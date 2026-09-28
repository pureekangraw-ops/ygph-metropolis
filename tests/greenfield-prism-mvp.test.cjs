const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

test('PRISM MVP exposes owner decision, handoff, monitor, and lab surfaces', async ()=>{
  const root=path.join(process.cwd(),'prism');
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  for (const label of ['ต้องตัดสินใจ','งาน & การส่งต่อ','ส่งต่องาน','ดูความจริงเมื่อจำเป็น','ผลทดลอง']) {
    assert.match(html,new RegExp(label));
  }
  assert.match(html,/SPECTRUM inside/);
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
  assert.equal(capacitor.appId,'com.yggdrasil.lighthouse');
});
