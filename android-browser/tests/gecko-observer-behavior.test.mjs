import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const root = fs.existsSync('android-browser') ? 'android-browser/' : '';
const script = fs.readFileSync(root + 'app/src/main/assets/observatory-observer/content-observer.js', 'utf8');

// Browser API doubles only; the entire production content script executes unchanged.
function page({subframe = false, name = ''} = {}) {
  let serial = 0, execute, heartbeat;
  const messages = [];
  const node = {tagName:'BUTTON', innerText:'Save', textContent:'Save', disabled:false,
    getAttribute(){return null;}, getBoundingClientRect(){return {left:0,top:0,right:40,bottom:20,width:40,height:20};},
    dispatchEvent(){},click(){node.innerText = node.textContent = 'Saved';}};
  function Element(){}; Object.setPrototypeOf(node, Element.prototype);
  const window = {name:"",scrollBy(){}}; window.top = subframe ? {} : window;
  const sandbox = {window, Element, HTMLAnchorElement:class {},
    document:{body:{innerText:'Form'},documentElement:{},visibilityState:'visible',title:'Fixture',querySelectorAll:()=>sandbox.nodes || [node],contains:n=>(sandbox.nodes || [node]).includes(n)},
    location:{href:'https://fixture.test/'},crypto:{randomUUID:()=>`${name}-${++serial}`},
    getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1'}),
    browser:{runtime:{connectNative:()=>({onMessage:{addListener(fn){execute=fn;}},postMessage(m){messages.push(m);}}),sendNativeMessage:(_app,m)=>{messages.push(m);return Promise.resolve();}}},
    MutationObserver:class {observe(){}},setTimeout:fn=>fn(),clearTimeout(){},setInterval:fn=>{heartbeat=fn;},Event:class {}};
  vm.runInNewContext(script,sandbox);
  return {sandbox,window,node,messages,heartbeat:()=>heartbeat(),execute:c=>execute({issuedAtEpochMs:Date.now(),expiresAtEpochMs:Date.now()+5000,...c}),observations:()=>messages.filter(m=>m.type==='OBSERVATION').map(m=>m.page)};
}
test('a command delayed past expiry cannot execute after native waiting ends',()=>{
 const p=page();const c=p.observations()[0];
 p.execute({type:'EXECUTE',commandId:'expired',captureId:c.captureId,frameId:c.frameId,action:'CLICK',expiresAtEpochMs:Date.now()-1,parameters:{targetId:c.targets[0].targetId,signature:c.targets[0].signature}});
 assert.equal(p.messages.at(-1).reason,'COMMAND_EXPIRED');assert.equal(p.node.innerText,'Save');
});
test('a hidden page refuses an already queued action',()=>{
 const p=page();const c=p.observations()[0];p.sandbox.document.visibilityState='hidden';
 p.execute({type:'EXECUTE',commandId:'hidden',captureId:c.captureId,frameId:c.frameId,action:'CLICK',parameters:{targetId:c.targets[0].targetId,signature:c.targets[0].signature}});
 assert.equal(p.messages.at(-1).reason,'PAGE_NOT_VISIBLE');assert.equal(p.node.innerText,'Save');
});

test('selected target identity survives an unrelated target inserted before it',()=>{
 const p=page();const selected=p.observations().at(-1).targets[0];
 const other=Object.assign(Object.create(Object.getPrototypeOf(p.node)),p.node,{innerText:'Other',textContent:'Other'});
 p.sandbox.nodes=[other,p.node];p.heartbeat();const current=p.observations().at(-1);
 assert.equal(current.targets[1].targetId,selected.targetId);
 p.execute({type:'EXECUTE',commandId:'stable-click',captureId:current.captureId,frameId:current.frameId,action:'CLICK',parameters:{targetId:selected.targetId,signature:selected.signature}});
 assert.equal(p.messages.at(-1).ok,true);assert.equal(p.node.innerText,'Saved');
});
test('same URL and label in another document cannot reuse an old target identity',()=>{
 const a=page({name:'document-a'}),b=page({name:'document-b'});
 assert.notEqual(a.observations()[0].targets[0].targetId,b.observations()[0].targets[0].targetId);
});
test('effective HTML button type is visible to native assist policy',()=>{
 const p=page();p.node.type='submit';p.heartbeat();
 assert.equal(p.observations().at(-1).targets[0].type,'submit');
});
test('a changed selected target is rejected even with a fresh capture',()=>{
 const p=page();const selected=p.observations()[0].targets[0];p.node.innerText='Different action';p.heartbeat();
 const current=p.observations().at(-1);
 p.execute({type:'EXECUTE',commandId:'changed',captureId:current.captureId,frameId:current.frameId,action:'CLICK',parameters:{targetId:selected.targetId,signature:selected.signature}});
 assert.equal(p.messages.at(-1).ok,false);assert.equal(p.messages.at(-1).reason,'TARGET_CHANGED');
});
test('fill dispatch updates the selected input without publishing input values',()=>{
 const p=page();p.node.tagName='INPUT';p.node.type='text';p.node.innerText=p.node.textContent='Search';p.heartbeat();
 const selected=p.observations().at(-1).targets[0];
 const other=Object.assign(Object.create(Object.getPrototypeOf(p.node)),p.node,{innerText:'Other',textContent:'Other'});
 p.sandbox.nodes=[other,p.node];p.heartbeat();const current=p.observations().at(-1);
 p.execute({type:'EXECUTE',commandId:'fill',captureId:current.captureId,frameId:current.frameId,action:'FILL',parameters:{targetId:selected.targetId,signature:selected.signature,value:'owner private input'}});
 assert.equal(p.messages.at(-1).ok,true);assert.equal(p.node.value,'owner private input');
 assert.equal(JSON.stringify(p.observations()).includes('owner private input'),false);
});

test('unchanged heartbeat preserves the capture that commands reference',()=>{
  const p=page();const first=p.observations().at(-1).captureId;
  p.heartbeat();assert.equal(p.observations().at(-1).captureId,first);
  p.node.innerText='Changed';p.heartbeat();assert.notEqual(p.observations().at(-1).captureId,first);
});
test('same-URL unnamed sibling frames have distinct document identities',()=>{
  const a=page({subframe:true,name:'a'}),b=page({subframe:true,name:'b'});
  assert.notEqual(a.observations()[0].frameId,b.observations()[0].frameId);
});
test('executed click emits fresh readback even before the periodic heartbeat',()=>{
  const p=page();const before=p.observations().at(-1);
  p.execute({type:'EXECUTE',commandId:'click-1',captureId:before.captureId,frameId:before.frameId,action:'CLICK',parameters:{targetId:before.targets[0].targetId,signature:before.targets[0].signature}});
  assert.equal(p.node.innerText,'Saved');
  const after=p.observations().at(-1);assert.notEqual(after.captureId,before.captureId);assert.equal(after.targets[0].label,'Saved');
});

test('payment-like click remains rejected even after a fresh capture',()=>{
  const p=page(); p.node.innerText='Pay now'; p.node.textContent='Pay now'; p.heartbeat();
  const capture=p.observations().at(-1);
  p.execute({type:'EXECUTE',commandId:'click-payment',captureId:capture.captureId,frameId:capture.frameId,action:'CLICK',
    parameters:{targetId:capture.targets[0].targetId,signature:capture.targets[0].signature}});
  assert.equal(p.messages.at(-1).reason,'HIGH_IMPACT_REQUIRES_OWNER');
  assert.equal(p.node.innerText,'Pay now');
});
test('sensitive input and invalid fill values are blocked inside the WebExtension',()=>{
  const p=page();p.node.tagName='INPUT';p.node.type='text';
  p.node.getAttribute=(key)=>key==='autocomplete'?'one-time-code':null;p.heartbeat();
  const capture=p.observations().at(-1);
  p.execute({type:'EXECUTE',commandId:'fill-otp',captureId:capture.captureId,frameId:capture.frameId,action:'FILL',
    parameters:{targetId:capture.targets[0].targetId,signature:capture.targets[0].signature,value:'123456'}});
  assert.equal(p.messages.at(-1).reason,'SENSITIVE_TARGET');
});
