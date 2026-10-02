'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
async function bridge(options){const m=await import('../prism/hub-bridge.mjs');return m.createPrismHubBridge(options);}
test('PRISM pulls real Hub Board through existing paired transport and preserves source Work identity',async()=>{
  const b=await bridge({transport:{status:async()=>({status:'PAIRED'}),pullBoard:async()=>({revision:9,pins:[{workId:'W1',canonicalWorkId:'CW1',title:'Real work',status:'DOING',card:{workId:'CW1',checkpointId:'C1',holder:'GO'}}]}),pushState:async()=>({ok:true})}});
  const s=await b.getSnapshot();assert.equal(s.live,true);assert.equal(s.revision,9);assert.equal(s.works[0].workId,'CW1');assert.equal(s.works[0].routingWorkId,'W1');assert.equal(s.works[0].checkpointId,'C1');
});
test('connection failure preserves last Board but never displays it as live',async()=>{
  let fail=false;const b=await bridge({transport:{status:async()=>({status:'PAIRED'}),pullBoard:async()=>{if(fail)throw Error('OFFLINE');return {pins:[{workId:'W1'}]};},pushState:async()=>({ok:true})}});
  await b.getSnapshot();fail=true;const s=await b.getSnapshot();assert.equal(s.live,false);assert.equal(s.works[0].workId,'W1');assert.equal(s.error,'OFFLINE');
});
test('unpaired PRISM refuses dispatch and does not fabricate empty live Work',async()=>{
  const b=await bridge({transport:{status:async()=>({status:'UNPAIRED'})}});
  assert.equal((await b.getSnapshot()).live,false);assert.equal((await b.getCapabilities()).DIRECT_API,false);
  await assert.rejects(b.dispatch({}),/NOT_PAIRED/);
});
test('PRISM uses same session transport for LIGHT handoff and reads durable receipt',async()=>{
  const b=await bridge({transport:{status:async()=>({status:'PAIRED'}),request:async(path,body)=>path==='/prism/handoff'?{ok:true,counterId:'COUNTER-1',status:'QUEUED'}:{ok:true,status:'ANSWERED',summary:'Actual answer',evidence:[{ref:'result://1'}]}}});
  const r=await b.dispatch({workId:'W1',checkpointId:'C1',destination:'LIGHT',requestedResult:'Inspect',actionIdentity:'one'});
  assert.equal(r.status,'QUEUED');assert.equal(r.counterId,'COUNTER-1');assert.equal((await b.getResult(r)).summary,'Actual answer');
});
test('staged APK contains bridge and existing transport dependencies',async()=>{
  const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');const dir=await fs.mkdtemp(path.join(os.tmpdir(),'prism-bridge-'));
  try {const {stagePrismNative}=await import('../scripts/stage-prism-native.mjs');await stagePrismNative({repoRoot:path.resolve(__dirname,'..'),destinationRoot:dir});for(const file of ['prism/hub-bridge.mjs','prism/control-port/control-port-transport.mjs','prism/control-port/control-port-credential.mjs'])assert.ok((await fs.stat(path.join(dir,file))).isFile());for(const old of ['lighthouse','lighthouse-next'])await assert.rejects(fs.stat(path.join(dir,old)),{code:'ENOENT'});assert.match(await fs.readFile(path.join(dir,'prism/hub-bridge.mjs'),'utf8'),/from '[.]\/control-port\//);}finally{await fs.rm(dir,{recursive:true,force:true});}
});
