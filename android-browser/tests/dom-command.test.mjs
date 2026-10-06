import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const assets = new URL('../app/src/main/assets/', import.meta.url);
function page() {
  const make = (id, visible = true, type = '') => ({id, type, tagName:'BUTTON', innerText:id, textContent:id, visible, clicks:0, getAttribute(){return null;}, getBoundingClientRect(){return {left:0,top:0,right:10,bottom:10,width:visible?10:0,height:10};}, click(){this.clicks++;}});
  const hidden=make('hidden',false), password=make('password',true,'password'), wanted=make('');
  const nodes=[hidden,password,wanted];
  const document={title:'Page',body:{innerText:'Page'},querySelectorAll(){return nodes;},contains(el){return nodes.includes(el);}};
  const context=vm.createContext({document,window:{},location:{origin:'https://owner',pathname:'/',href:'https://owner/'},getComputedStyle:el=>({display:el.visible?'block':'none',visibility:'visible'}),captureToken:'capture-1',Event:class {}});
  return {context,nodes,wanted};
}
function observe(p) {return JSON.parse(vm.runInContext(fs.readFileSync(new URL('observer.js',assets),'utf8'),p.context));}
function click(p,captureId='capture-1') {
  p.context.command={action:'CLICK',captureId,parameters:{targetId:'target-0'}};
  return vm.runInContext(fs.readFileSync(new URL('command.js',assets),'utf8'),p.context);
}
test('observer binds target-0 to the visible non-password element',()=>{
  const p=page(); const snapshot=observe(p);
  assert.equal(snapshot.targets[0].id,'target-0');
  assert.equal(p.context.window.__goObserverTargets?.nodes[0],p.wanted);
});
test('click uses captured element despite hidden and password predecessors',()=>{
  const p=page();observe(p);assert.equal(click(p).ok,true);assert.equal(p.wanted.clicks,1);assert.equal(p.nodes[0].clicks,0);
});
test('stale capture and replaced element are rejected',()=>{
  const p=page();observe(p);assert.equal(click(p,'old').ok,false);
  p.nodes.pop();assert.equal(click(p).ok,false);assert.equal(p.wanted.clicks,0);
});

test('changed target meaning cannot reuse the captured command',()=>{
  const p=page();observe(p);p.wanted.innerText='Different operation';
  assert.equal(click(p).reason,'TARGET_CHANGED');assert.equal(p.wanted.clicks,0);
});
test('replacing nodes forces a new snapshot even if labels are identical',()=>{
  const p=page();assert.equal(observe(p).targetsChanged,true);
  assert.equal(observe(p).targetsChanged,false);
  p.nodes[2]={...p.wanted};assert.equal(observe(p).targetsChanged,true);
});
