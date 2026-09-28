const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

test('PRISM MVP exposes owner decision, handoff, monitor, and lab surfaces', async ()=>{
  const root=path.join(process.cwd(),'prism');
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  for (const label of ['เรื่องที่รอตัดสินใจ','โปรเจกต์ทั้งหมด','ส่งงานหรือเรียกคนมาช่วย','สถานะระบบ','การเงิน']) {
    assert.match(html,new RegExp(label));
  }
  assert.match(html,/อยากให้ช่วยอะไร/);
  assert.match(html,/Ledger/);
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
  for (const root of ['COPILOT','PROJECTS','HANDOFF','MAP','LEDGER','MONITOR']) assert.match(stage,new RegExp(`'${root}'`));
  assert.equal(capacitor.appName,'PRISM');
  assert.equal(capacitor.appId,'com.yggdrasil.prism');
});

test('PRISM normal surfaces hide system jargon until advanced drill-down', ()=>{
  const html=fs.readFileSync(path.join(process.cwd(),'prism','index.html'),'utf8');
  const home=html.match(/<section class="page active" data-page="HOME">[\s\S]*?<\/section>\s*<section class="page" data-page="WORK">/)?.[0]||'';
  assert.doesNotMatch(home,/Work ID|Checkpoint ID|Authority|Route|SPECTRUM|Provenance/);
  assert.match(html,/รายละเอียดสำหรับตรวจระบบ/);
  const nav=html.match(/<nav class="bottom-nav"[\s\S]*?<\/nav>/)?.[0]||'';
  for(const label of ['Copilot','โปรเจกต์','Map','Ledger']) assert.match(nav,new RegExp(label));
  assert.doesNotMatch(nav,/มอนิเตอร์/);
});


test('PRISM applies one mobile sizing contract across all surfaces', ()=>{
  const css=fs.readFileSync(path.join(process.cwd(),'prism','styles.css'),'utf8');
  for (const token of ['--page-pad:16px','--touch:48px','--header-h:60px','--composer-h:56px','--nav-h:68px']) {
    assert.ok(css.includes(token), 'missing sizing token '+token);
  }
  assert.match(css,/\.app-shell\{width:100%/);
  assert.match(css,/\.ask-box input\{[\s\S]*?height:var\(--composer-h\)/);
  assert.match(css,/\.card-actions button\{[\s\S]*?min-height:var\(--touch\)/);
  assert.match(css,/\.bottom-nav\{[\s\S]*?height:calc\(var\(--nav-h\)/);
  assert.match(css,/@media\(min-width:600px\)/);
  assert.match(css,/env\(safe-area-inset-bottom\)/);
  assert.match(css,/\.decision-summary\{max-width:82%/);
});


test('PRISM central Copilot owns navigation while Ledger, Map and shared-Work conference stay explicit', async ()=>{
  const html=fs.readFileSync(path.join(process.cwd(),'prism','index.html'),'utf8');
  assert.match(html,/COPILOT/);
  assert.match(html,/Ledger เป็นเจ้าของข้อมูลการเงินทั้งหมด/);
  assert.match(html,/Ride เป็นโหมดเสริม/);
  assert.doesNotMatch(html,/Calendar|ปฏิทินนัดหมาย/);
  assert.match(html,/เรียก GO \+ LIGHT/);
  const mod=await import(pathToFileURL(path.join(process.cwd(),'prism','spectrum.mjs')).href);
  const call=mod.buildConferenceCall({workId:'WORK-1',checkpointId:'CP-WORK-1',participants:['GO','LIGHT']});
  assert.equal(call.ready,true);
  assert.equal(call.contextMode,'SHARED_WORK');
  assert.deepEqual([...call.participants],['GO','LIGHT']);
});


test('PRISM components are lockstep-stamped to the canonical Android release', ()=>{
  const release=JSON.parse(fs.readFileSync(path.join(process.cwd(),'prism','component-release.json'),'utf8'));
  const android=JSON.parse(fs.readFileSync(path.join(process.cwd(),'android-shell','version.json'),'utf8'));
  assert.equal(release.policy,'LOCKSTEP_FAIL_CLOSED');
  assert.equal(release.release.versionName,android.versionName);
  assert.equal(release.release.versionCode,android.versionCode);
  const required=['COPILOT','PROJECTS','HANDOFF','MAP','LEDGER','MONITOR','SPECTRUM','ANDROID_SHELL'];
  for(const id of required){
    const component=release.components.find(x=>x.id===id);
    assert.ok(component,'missing component '+id);
    assert.equal(component.versionName,android.versionName);
    assert.equal(component.versionCode,android.versionCode);
  }
  const stage=fs.readFileSync(path.join(process.cwd(),'scripts','stage-lighthouse-next-bundle.mjs'),'utf8');
  assert.match(stage,/PRISM_COMPONENT_RELEASE_VERSION_MISMATCH/);
  assert.match(stage,/PRISM_COMPONENT_VERSION_MISMATCH/);
});
