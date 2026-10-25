import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as policy from '../policy.mjs';
import * as sites from '../site-permissions.mjs';
import {scrollRemotePage} from '../scroll.mjs';
const source=readFileSync(new URL('../worker.mjs',import.meta.url),'utf8')
 .replace(/^import .*;\n/gm,'').replace('export default {','const worker = {').replaceAll('export class ','class ');
function barrier(){let enter,release;return {entered:new Promise(r=>enter=r),wait:()=>{enter();return new Promise(r=>release=r)},release:()=>release()};}
function fixture({expiry,hold,stage}={}){
 const events=[];let failed=false,inspections=0;
 const db=new Map([['browser',{browserSessionId:'old',targetId:'selected',controller:'GO',mode:'LIVE',status:'RUNNING',allowGoRead:true,grantedHost:'example.com',url:'https://example.com/'}]]);
 async function provider(at){if(stage===at)await hold.wait();if(expiry===at&&!failed){failed=true;events.push('expired:'+at);throw Error('Target closed');}}
 const page={target:()=>({_targetId:'selected'}),url:()=> 'https://example.com/',goto:async()=>{await provider('goto');events.push('navigate');},$eval:async()=>{await provider(inspections++?'clear':'inspect');return {text:'Open details',type:'text',form:false,contenteditable:false};},click:async()=>{events.push('click');if(stage==='dispatched')await hold.wait();},type:async()=>events.push('type'),viewport:()=>({width:100,height:100}),mouse:{move:async()=>{await provider('move');events.push('move')},wheel:async()=>events.push('wheel')}};
 const browser={pages:async()=>{await provider('pages');return [page]},disconnect:async()=>{},close:async()=>events.push('close'),sessionId:()=> 'new'};
 const puppeteer={sessions:async()=>[{sessionId:'old'}],connect:async()=>{await provider('connect');return browser},launch:async()=>{events.push('launch');assert.ok(events.includes('close'),'cleanup must precede replacement');return browser}};
 const deps={puppeteer,...policy,...sites,scrollRemotePage,WorkerEntrypoint:class {}};
 const Workspace=new Function(...Object.keys(deps),source+';return BrowserWorkspace;')(...Object.values(deps));
 const instance=new Workspace({storage:{get:async k=>structuredClone(db.get(k)),put:async(k,v)=>db.set(k,structuredClone(v)),delete:async k=>db.delete(k),setAlarm:async()=>{}}},{GO_ALLOWED_HOSTS:'example.com'});
 const revoke=()=>instance.fetch(new Request('https://fixture/v1/observe-access',{method:'POST',headers:{'x-observatory-role':'BIG'},body:'{"allow":false}'}));
 return {instance,events,revoke};
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
 ['inspect',{type:'type',selector:'#query',value:'hello'},'type'],
 ['clear',{type:'type',selector:'#query',value:'hello'},'type'],
 ['move',{type:'scroll',y:100},'wheel']
])test(`revoke during ${step.type}/${stage} blocks the next mutation`,async()=>{
 const hold=barrier(),f=fixture({hold,stage});
 const running=f.instance.action(await f.instance.state(),step,'GO');
 await hold.entered;assert.equal((await f.revoke()).status,200);hold.release();
 await assert.rejects(running,/CONTROLLER_MISMATCH|OWNER_GO_GRANT_REVOKED/);
 assert.equal(f.events.includes(prohibited),false);
});
