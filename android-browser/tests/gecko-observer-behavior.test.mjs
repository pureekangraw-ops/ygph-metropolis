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
    click(){node.innerText = node.textContent = 'Saved';}};
  function Element(){}; Object.setPrototypeOf(node, Element.prototype);
  const window = {name:"",scrollBy(){}}; window.top = subframe ? {} : window;
  const sandbox = {window, Element, HTMLAnchorElement:class {},
    document:{body:{innerText:'Form'},documentElement:{},visibilityState:'visible',title:'Fixture',querySelectorAll:()=>[node],contains:n=>n===node},
    location:{href:'https://fixture.test/'},crypto:{randomUUID:()=>`${name}-${++serial}`},
    getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1'}),
    browser:{runtime:{connectNative:()=>({onMessage:{addListener(fn){execute=fn;}},postMessage(m){messages.push(m);}}),sendNativeMessage:(_app,m)=>{messages.push(m);return Promise.resolve();}}},
    MutationObserver:class {observe(){}},setTimeout:fn=>fn(),clearTimeout(){},setInterval:fn=>{heartbeat=fn;},Event:class {}};
  vm.runInNewContext(script,sandbox);
  return {window,node,messages,heartbeat:()=>heartbeat(),execute:c=>execute(c),observations:()=>messages.filter(m=>m.type==='OBSERVATION').map(m=>m.page)};
}

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
