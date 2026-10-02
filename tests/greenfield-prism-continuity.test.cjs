const test=require('node:test'),assert=require('node:assert/strict');
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};
async function bridge(transport,storage){const {createPrismHubBridge}=await import('../prism/hub-bridge.mjs');return createPrismHubBridge({transport,storage});}
test('process restart while offline retains the last paired Hub Board as cached, never live',async()=>{
 const storage=memory(),status=async()=>({status:'PAIRED',sessionId:'session-one'});
 const first=await bridge({status,pullBoard:async()=>({revision:8,pins:[{workId:'W1',checkpointId:'C1',title:'Owner work',status:'ON PROCESS'}]})},storage);
 await first.getSnapshot();
 const restarted=await bridge({status,pullBoard:async()=>{throw Error('OFFLINE')}},storage);
 const result=await restarted.getSnapshot();assert.equal(result.works[0]?.workId,'W1');assert.equal(result.live,false);assert.equal(result.cached,true);assert.equal(result.error,'OFFLINE');
});
test('cached Board never crosses paired owner sessions',async()=>{
 const storage=memory();const first=await bridge({status:async()=>({status:'PAIRED',sessionId:'old-session'}),pullBoard:async()=>({pins:[{workId:'PRIVATE-WORK'}]})},storage);await first.getSnapshot();
 const changed=await bridge({status:async()=>({status:'PAIRED',sessionId:'new-session'}),pullBoard:async()=>{throw Error('OFFLINE')}},storage);assert.deepEqual((await changed.getSnapshot()).works,[]);
});
test('disconnect clears cached Work even if a new process starts offline',async()=>{
 const storage=memory(),status=async()=>({status:'PAIRED',sessionId:'session-one'});const first=await bridge({status,pullBoard:async()=>({pins:[{workId:'W1'}]}),disconnect:async()=>({status:'UNPAIRED'})},storage);await first.getSnapshot();await first.disconnect();const restarted=await bridge({status,pullBoard:async()=>{throw Error('OFFLINE')}},storage);assert.deepEqual((await restarted.getSnapshot()).works,[]);
});
