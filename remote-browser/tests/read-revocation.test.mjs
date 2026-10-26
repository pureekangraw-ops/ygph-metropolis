import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as policy from '../policy.mjs';
import * as sites from '../site-permissions.mjs';
import {invokeObservatoryGo} from '../go-bridge.mjs';
const source=readFileSync(new URL('../worker.mjs',import.meta.url),'utf8')
 .replace(/^import .*;\n/gm,'').replace('export default {','const worker = {').replaceAll('export class ','class ');
function barrier(){let enter,release;return {entered:new Promise(r=>enter=r),wait:()=>{enter();return new Promise(r=>release=r)},release:()=>release()};}
function fixture({stage,hold,role='GO',target='selected'}={}){
 let state={browserSessionId:'synthetic',targetId:target,controller:'GO',mode:'LIVE',status:'RUNNING',sitePermissions:['example.com'],allowGoRead:true,grantedHost:'example.com',url:'https://example.com/'};
 let actualUrl='https://example.com/';
 const reads=[];
 const wait=async at=>{if(stage===at)await hold.wait()};
 const page={target:()=>({_targetId:'selected'}),url:()=>actualUrl,
  $eval:async()=>({text:'Open details',type:'button',form:false,contenteditable:false}),click:async()=>reads.push('click'),
  evaluate:async()=>{reads.push('observe');await wait('read');return {url:'https://example.com/',text:'PRIVATE_SYNTHETIC_DOM',controls:[]}},
  screenshot:async()=>{reads.push('screenshot');await wait('read');return Buffer.from('PRIVATE_SYNTHETIC_IMAGE')}};
 const puppeteer={connect:async()=>{await wait('connect');return {pages:async()=>{await wait('pages');return [page]},disconnect:async()=>wait('disconnect')}}};
 const deps={puppeteer,...policy,...sites,WorkerEntrypoint:class {}};
 const {BrowserWorkspace:Workspace,worker}=new Function(...Object.keys(deps),source+';return {BrowserWorkspace,worker};')(...Object.values(deps));
 const env={GO_ALLOWED_HOSTS:'example.com',OWNER_TOKEN:'synthetic-owner',GO_TOKEN:'synthetic-go',BROWSER:{}};
 const instance=new Workspace({storage:{get:async()=>structuredClone(state),put:async(k,v)=>{state=structuredClone(v)}}},env);
 env.SESSIONS={idFromName:()=>1,get:()=>({fetch:request=>instance.fetch(request)})};
 const request=(path,body,as=role)=>instance.fetch(new Request('https://synthetic.invalid/v1/'+path,{method:body?'POST':'GET',headers:{'x-observatory-role':as},...(body?{body:JSON.stringify(body)}:{})}));
 const authenticated=(path,body,token='synthetic-go')=>worker.fetch(new Request('https://synthetic.invalid/v1/'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,'x-observatory-role':'BIG'},...(body?{body:JSON.stringify(body)}:{})}),env);
 return {reads,request,authenticated,invoke:(name,args)=>invokeObservatoryGo(env,name,args),redirect:()=>{actualUrl='https://other.example/'},replace:()=>{state={...state,browserSessionId:'replacement',targetId:'replacement-target'}}};
}
for(const path of ['observe','screenshot']){
 for(const stage of ['connect','pages','read','disconnect'])test(`${path}: revoke during ${stage} denies delivery`,async()=>{
  const hold=barrier(),f=fixture({hold,stage});
  const pending=f.request(path);await hold.entered;
  assert.equal((await f.request('observe-access',{allow:false},'BIG')).status,200);
  hold.release();const response=await pending;
  assert.notEqual(response.status,200);
  assert.doesNotMatch(await response.text(),/PRIVATE_SYNTHETIC|UFJJVkFURV9TWU5USEVUSUNfSU1BR0U/);
  if(['connect','pages'].includes(stage))assert.deepEqual(f.reads,[]);
 });
 test(`${path}: replacement during provider read cannot receive old target data`,async()=>{
  const hold=barrier(),f=fixture({hold,stage:'read'});const pending=f.request(path);
  await hold.entered;f.replace();hold.release();assert.notEqual((await pending).status,200);
 });
 test(`${path}: site permission revoked during read denies delivery`,async()=>{
  const hold=barrier(),f=fixture({hold,stage:'read'});const pending=f.request(path);
  await hold.entered;
  assert.equal((await f.request('site-permissions',{action:'revoke',host:'example.com'},'BIG')).status,200);
  hold.release();assert.notEqual((await pending).status,200);
 });
 test(`${path}: origin change during capture denies delivery`,async()=>{
  const hold=barrier(),f=fixture({hold,stage:'read'});const pending=f.request(path);
  await hold.entered;f.redirect();hold.release();assert.notEqual((await pending).status,200);
 });
 test(`${path}: active invitation preserves GO eyes; BIG does not require GO grant`,async()=>{
  const f=fixture();assert.equal((await f.request(path)).status,200);
  assert.equal((await f.request('observe-access',{allow:false},'BIG')).status,200);
  assert.equal((await f.request(path,undefined,'BIG')).status,200);
  assert.notEqual((await f.request(path)).status,200);
 });
 test(`${path}: missing exact target never falls back`,async()=>{
  const f=fixture({target:'missing'});assert.notEqual((await f.request(path)).status,200);assert.deepEqual(f.reads,[]);
 });
}

test('planned owner invitation → GO eyes/hands → takeover uses the same authoritative workspace',async()=>{
 const f=fixture(),owner=(path,body)=>f.authenticated(path,body,'synthetic-owner');
 assert.equal((await f.authenticated('observe',undefined,'invalid')).status,401);
 assert.equal((await f.authenticated('control',{controller:'GO'})).status,403);
 await owner('observe-access',{allow:false});
 assert.equal((await f.authenticated('observe')).status,403);
 assert.equal((await f.invoke('observatory_observe')).ok,false);
 assert.equal((await owner('observe-access',{allow:true})).status,200);
 assert.equal((await f.invoke('observatory_observe')).ok,true);
 assert.equal((await f.authenticated('screenshot')).status,200);
 assert.notEqual((await f.authenticated('action',{type:'click',selector:'#details'})).status,200);
 assert.equal((await owner('control',{controller:'GO'})).status,200);
 assert.equal((await f.invoke('observatory_action',{type:'click',selector:'#details'})).ok,true);
 assert.equal((await owner('control',{controller:'BIG'})).status,200);
 assert.equal((await f.invoke('observatory_observe')).ok,false);
 assert.equal((await f.invoke('observatory_action',{type:'click',selector:'#details'})).ok,false);
 assert.equal((await owner('observe')).status,200);
 assert.equal(f.reads.filter(x=>x==='click').length,1);
});

test('captured DOM from an earlier invitation is discarded after revoke and reinvite',async()=>{
 const hold=barrier(),f=fixture({hold,stage:'read'}),pending=f.request('observe');
 await hold.entered;
 await f.request('observe-access',{allow:false},'BIG');
 assert.equal((await f.request('observe-access',{allow:true},'BIG')).status,200);
 hold.release();const response=await pending;
 assert.notEqual(response.status,200);assert.doesNotMatch(await response.text(),/PRIVATE_SYNTHETIC_DOM/);
});

