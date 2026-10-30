import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as policy from '../policy.mjs';
import * as sites from '../site-permissions.mjs';
import * as passkeyUtils from '../passkey-utils.mjs';
const webauthn={};
import {scrollRemotePage} from '../scroll.mjs';
const source=readFileSync(new URL('../worker.mjs',import.meta.url),'utf8')
 .replace(/^import .*;\n/gm,'').replace('export default {','const worker = {').replaceAll('export class ','class ');
function barrier(){let enter,release;return {entered:new Promise(r=>enter=r),wait:()=>{enter();return new Promise(r=>release=r)},release:()=>release()};}
function fixture({expiry,hold,stage,sitesGranted=false}={}){
 const events=[];let failed=false,inspections=0,inputValue="existing text";
 const db=new Map([['browser',{browserSessionId:'old',targetId:'selected',controller:'GO',mode:'LIVE',status:'RUNNING',allowGoRead:true,grantedHost:'example.com',url:'https://example.com/',...(sitesGranted?{sitePermissions:['example.com']}:{})}]]);
 async function provider(at){if(stage===at)await hold.wait();if(expiry===at&&!failed){failed=true;events.push('expired:'+at);throw Error('Target closed');}}
 const input={
  get value(){return inputValue},
  set value(value){inputValue=value;events.push('clear')},
  getAttribute:key=>key==='type'?'text':null,
  innerText:'Open details',closest:()=>null,isContentEditable:false,
  dispatchEvent:event=>{events.push('input:'+event.type)}
 };
 const page={target:()=>({_targetId:'selected'}),url:()=> 'https://example.com/',goto:async()=>{await provider('goto');events.push('navigate');},$eval:async(selector,callback)=>{const clearing=inspections++>0;if(!clearing)await provider('inspect');const result=callback(input);if(clearing)await provider('clear');return result;},click:async()=>{events.push('click');if(stage==='dispatched')await hold.wait();},type:async(selector,value)=>{events.push('type');inputValue+=value;},viewport:()=>({width:100,height:100}),mouse:{move:async()=>{await provider('move');events.push('move')},wheel:async()=>events.push('wheel')}};
 const browser={pages:async()=>{await provider('pages');return [page]},disconnect:async()=>{},close:async()=>events.push('close'),sessionId:()=> 'new'};
 const puppeteer={sessions:async()=>[{sessionId:'old'}],connect:async()=>{await provider('connect');return browser},launch:async()=>{events.push('launch');assert.ok(events.includes('close'),'cleanup must precede replacement');return browser}};
 const deps={puppeteer,...policy,...sites,scrollRemotePage,webauthn,passkeyUtils,WorkerEntrypoint:class {}};
 const Workspace=new Function(...Object.keys(deps),source+';return BrowserWorkspace;')(...Object.values(deps));
 const instance=new Workspace({storage:{get:async k=>structuredClone(db.get(k)),put:async(k,v)=>db.set(k,structuredClone(v)),delete:async k=>db.delete(k),setAlarm:async()=>{}}},{GO_ALLOWED_HOSTS:'example.com'});
 const revoke=()=>instance.fetch(new Request('https://fixture/v1/observe-access',{method:'POST',headers:{'x-observatory-role':'BIG'},body:'{"allow":false}'}));
 const owner=(path,body)=>instance.fetch(new Request('https://fixture/v1/'+path,{method:'POST',headers:{'x-observatory-role':'BIG'},body:JSON.stringify(body)}));
 return {instance,events,revoke,owner,get inputValue(){return inputValue}};
}
for(const expiry of ['connect','pages','goto'])test(`explicit owner recovery classifies ${expiry} expiry and cleans up before replacement`,async()=>{
 const f=fixture({expiry});await f.instance.beginSession({url:'https://example.com/'});
 assert.ok(f.events.indexOf('close')<f.events.indexOf('launch'));assert.equal((await f.instance.state()).browserSessionId,'new');assert.equal((await f.instance.state()).allowGoRead,false);
});
for(const stage of ['connect','pages','inspect'])test(`queued GO click revoked during ${stage} must not dispatch`,async()=>{
 const hold=barrier(),f=fixture({hold,stage});
 await f.instance.enqueue(await f.instance.state(),'GO_SCRIPT',[{type:'click',selector:'#details'}],'synthetic-request');
 const running=f.instance.alarm();await hold.entered;
 assert.equal((await f.revoke()).status,200);hold.release();await running;
 assert.equal(f.events.includes('click'),false);assert.equal((await f.instance.state()).controller,'BIG');
});
test('revocation after dispatch preserves takeover and prevents subsequent queued step',async()=>{
 const hold=barrier(),f=fixture({hold,stage:'dispatched'});
 await f.instance.enqueue(await f.instance.state(),'GO_SCRIPT',[{type:'click',selector:'#details'},{type:'click',selector:'#next'}],'synthetic-request');
 const running=f.instance.alarm();await hold.entered;assert.equal((await f.revoke()).status,200);hold.release();await running;await f.instance.alarm();
 assert.deepEqual(f.events,['click']);assert.equal((await f.instance.state()).job.status,'STOPPED');assert.equal((await f.instance.state()).controller,'BIG');
});

for(const [stage,step,prohibited] of [
 ['connect',{type:'navigate',url:'https://example.com/next'},'navigate'],
 ['move',{type:'scroll',y:100},'wheel']
])test(`revoke during ${step.type}/${stage} blocks the next mutation`,async()=>{
 const hold=barrier(),f=fixture({hold,stage});
 const running=f.instance.action(await f.instance.state(),step,'GO');
 await hold.entered;assert.equal((await f.revoke()).status,200);hold.release();
 await assert.rejects(running,/CONTROLLER_MISMATCH|OWNER_GO_GRANT_REVOKED/);
 assert.equal(f.events.includes(prohibited),false);
});

const typingStep={type:'type',selector:'#query',value:'hello'};
test('typing revoked during inspection neither clears input nor types',async()=>{
 const hold=barrier(),f=fixture({hold,stage:'inspect'});
 const running=f.instance.action(await f.instance.state(),typingStep,'GO');
 await hold.entered;assert.equal((await f.revoke()).status,200);hold.release();
 await assert.rejects(running,/CONTROLLER_MISMATCH|OWNER_GO_GRANT_REVOKED/);
 assert.deepEqual(f.events,[]);
 assert.equal(f.inputValue,'existing text');
});
test('typing revoked after clear executes its callback but never dispatches type',async()=>{
 const hold=barrier(),f=fixture({hold,stage:'clear'});
 const running=f.instance.action(await f.instance.state(),typingStep,'GO');
 await hold.entered;
 assert.deepEqual(f.events,['clear','input:input']);
 assert.equal(f.inputValue,'');
 assert.equal((await f.revoke()).status,200);hold.release();
 await assert.rejects(running,/CONTROLLER_MISMATCH|OWNER_GO_GRANT_REVOKED/);
 assert.deepEqual(f.events,['clear','input:input']);
 assert.equal(f.inputValue,'');
});
test('authorized typing executes clear callback and input event before typing',async()=>{
 const f=fixture();
 await f.instance.action(await f.instance.state(),typingStep,'GO');
 assert.deepEqual(f.events,['clear','input:input','type']);
 assert.equal(f.inputValue,'hello');
});

test('owner takeover remains available while direct action preflight is in flight',async()=>{
 const hold=barrier(),f=fixture({hold,stage:'inspect'});
 const running=f.instance.fetch(new Request('https://fixture/v1/action',{method:'POST',headers:{'x-observatory-role':'GO'},body:'{"type":"click","selector":"#details"}'}));
 await hold.entered;
 const takeover=await f.owner('control',{controller:'BIG'});
 hold.release();const response=await running;
 assert.equal(takeover.status,200);assert.notEqual(response.status,200);assert.deepEqual(f.events,[]);
});
test('revoked preflight cannot revive after a new GO control grant',async()=>{
 const hold=barrier(),f=fixture({hold,stage:'inspect'});
 const running=f.instance.action(await f.instance.state(),{type:'click',selector:'#details'},'GO');
 await hold.entered;await f.revoke();assert.equal((await f.owner('control',{controller:'GO'})).status,200);
 hold.release();await assert.rejects(running,/OWNER_GO_GRANT_REVOKED/);assert.deepEqual(f.events,[]);
});
test('queued GO work never revives after revoke and new control grant',async()=>{
 const f=fixture();await f.instance.enqueue(await f.instance.state(),'GO_SCRIPT',[{type:'click',selector:'#details'}],'old-request');
 await f.revoke();assert.equal((await f.owner('control',{controller:'GO'})).status,200);await f.instance.alarm();
 assert.deepEqual(f.events,[]);assert.equal((await f.instance.state()).job.status,'STOPPED');
});

test('close revokes pending direct action immediately and reports busy until explicit cleanup retry',async()=>{
 const hold=barrier(),f=fixture({hold,stage:'inspect'});
 const running=f.instance.fetch(new Request('https://fixture/v1/action',{method:'POST',headers:{'x-observatory-role':'GO'},body:'{"type":"click","selector":"#details"}'}));
 await hold.entered;
 const busy=await f.owner('close',{});assert.equal(busy.status,409);
 assert.deepEqual(await busy.json(),{error:'BUSY',goAccessRevoked:true,closed:false});
 hold.release();assert.notEqual((await running).status,200);assert.deepEqual(f.events,[]);
 assert.equal((await f.owner('close',{})).status,200);
 assert.deepEqual(f.events,['close']);assert.equal((await f.instance.state()).status,'CLOSED');
 assert.equal((await f.instance.state()).browserSessionId,null);
});
test('close stops queued commands before closing and never reports a pending job as closed',async()=>{
 const f=fixture();await f.instance.enqueue(await f.instance.state(),'GO_SCRIPT',[{type:'click',selector:'#details'}],'closing-request');
 const stopping=await f.owner('close',{});assert.equal(stopping.status,400);
 assert.equal((await stopping.json()).error,'STOP_JOB_BEFORE_CLOSING');
 assert.equal((await f.instance.state()).allowGoRead,false);await f.instance.alarm();
 assert.deepEqual(f.events,[]);assert.equal((await f.instance.state()).job.status,'STOPPED');
 assert.equal((await f.owner('close',{})).status,200);assert.deepEqual(f.events,['close']);
});

for(const [path,body] of [
 ['control',{controller:'GO'}],
 ['observe-access',{allow:true}],
 ['site-permissions',{action:'allow',host:'example.com'}]
])test(`pending owner ${path} grant cannot overwrite a newer revoke`,async()=>{
 const hold=barrier(),f=fixture({hold,stage:'connect'});
 const grant=f.owner(path,body);await hold.entered;
 assert.equal((await f.revoke()).status,200);const revoked=await f.instance.state();
 hold.release();const response=await grant;assert.notEqual(response.status,200);
 assert.equal((await response.json()).error,'OWNER_GO_GRANT_REVOKED');
 const final=await f.instance.state();assert.equal(final.controller,'BIG');assert.equal(final.allowGoRead,false);
 assert.equal(final.accessVersion,revoked.accessVersion);assert.equal(final.version,revoked.version);
 assert.equal(final.sitePermissions,undefined);
});

test('site revoke interrupts an in-flight GO preflight while site allow remains busy',async()=>{
 const hold=barrier(),f=fixture({hold,stage:'inspect',sitesGranted:true});
 const running=f.instance.fetch(new Request('https://fixture/v1/action',{method:'POST',headers:{'x-observatory-role':'GO'},body:'{"type":"click","selector":"#details"}'}));
 await hold.entered;
 assert.equal((await f.owner('site-permissions',{action:'allow',host:'example.com'})).status,422);
 const revoked=await f.owner('site-permissions',{action:'revoke',host:'example.com'});
 hold.release();const result=await running;
 assert.equal(revoked.status,200);assert.notEqual(result.status,200);assert.deepEqual(f.events,[]);
 assert.deepEqual((await f.instance.state()).sitePermissions,[]);
});

