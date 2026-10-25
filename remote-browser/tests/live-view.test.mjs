import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as policy from '../policy.mjs';
import * as sites from '../site-permissions.mjs';
// Execute actual Worker/DO methods with synthetic provider/storage; no network.
const source=readFileSync(new URL('../worker.mjs',import.meta.url),'utf8')
 .replace(/^import .*;\n/gm,'').replace('export default {','const worker = {').replaceAll('export class ','class ');
const id='11111111-2222-4333-8444-555555555555';
function fixture({goRead=false,mode='ok',targets=['selected'],targetId='selected',controller='BIG',actualUrl='https://example.com/',inputType='text',sensitiveClick=false,cleanupFails=false}={}) {
 let state={browserSessionId:'synthetic',targetId,controller,mode:'OBSERVE',status:'RUNNING',allowGoRead:goRead,url:'https://example.com/',grantedHost:goRead?'example.com':null},calls=0,cdpCalls=0,navigations=0,launches=0,observations=0,clicks=0,typed=[],closed=0;
 const liveSessions=new Set(mode==='expired'?[]:['synthetic']);
 const privateError=()=>Error('PRIVATE_TOKEN https://live.browser.run/?jwt=PRIVATE_URL');
 const page=t=>({target:()=>({_targetId:t}),url:()=>actualUrl,
  goto:async url=>{navigations++;actualUrl=url;},
  $eval:async(selector,fn)=>fn({getAttribute:key=>key==='type'?inputType:null,innerText:sensitiveClick?'Buy now':'Open details',closest:()=>null,isContentEditable:false,dispatchEvent:()=>{},value:''}),
  click:async()=>{clicks++;},type:async(selector,value)=>{typed.push(value);},
  evaluate:async()=>{observations++;return {title:'synthetic',url:actualUrl,text:'fixture only',controls:[]};},
  createCDPSession:async()=>{if(mode==='cdp')throw privateError();return {send:async()=>{cdpCalls++;if(mode==='provider')throw privateError();return {devtoolsFrontendUrl:mode==='url'?'https://attacker.invalid/':'https://live.browser.run/synthetic'};},detach:async()=>{}};}});
 const browser=()=>({pages:async()=>{if(mode==='pages')throw privateError();return targets.map(page);},disconnect:async()=>{},close:async()=>{if(cleanupFails)throw privateError();closed++;liveSessions.delete('synthetic');},sessionId:()=> 'new-synthetic-session'});
 const puppeteer={sessions:async()=>{if(mode==='sessionlist')throw privateError();return [...liveSessions].map(sessionId=>({sessionId}));},
  connect:async()=>{calls++;if(mode==='connect'||mode==='expired')throw privateError();return browser();},
  launch:async()=>{assert.equal(liveSessions.size,0,'old session must be closed before replacement');liveSessions.add('new-synthetic-session');launches++;targets=['explicit-new-target'];return browser();}};
 const deps={puppeteer,...policy,...sites,WorkerEntrypoint:class {}};
 const {worker,BrowserWorkspace}=new Function(...Object.keys(deps),source+';return {worker,BrowserWorkspace};')(...Object.values(deps));
 const env={OWNER_TOKEN:'synthetic-owner',GO_TOKEN:'synthetic-go',BROWSER:{},GO_ALLOWED_HOSTS:'example.com'};
 const instance=new BrowserWorkspace({storage:{get:async()=>structuredClone(state),put:async(k,v)=>{state=structuredClone(v);}}},env);
 env.SESSIONS={idFromName:()=>1,get:()=>({fetch:r=>instance.fetch(r)})};
 return {get calls(){return calls},get cdpCalls(){return cdpCalls},get navigations(){return navigations},get launches(){return launches},get observations(){return observations},get closed(){return closed},get liveSessions(){return [...liveSessions]},get clicks(){return clicks},get typed(){return typed},get state(){return structuredClone(state)},async call({token='synthetic-owner',path='/v1/view',method='GET',body,requestId=id}={}){
  return worker.fetch(new Request('https://fixture.invalid'+path,{method,headers:{...(token?{authorization:'Bearer '+token}:{}),'x-request-id':requestId,'x-observatory-role':'GO'},...(body!==undefined?{body}:{})}),env);
 }};
}
test('owner view works with GO OFF/ON, ignores client role and echoes pre-request correlation',async()=>{
 for(const goRead of [false,true]){const f=fixture({goRead});const r=await f.call();assert.equal(r.status,200);assert.equal(r.headers.get('x-request-id'),id);assert.equal(f.cdpCalls,1);}
});
test('absent/invalid auth and GO token cannot reach owner view provider',async()=>{
 for(const [token,status] of [[null,401],['wrong',401],['synthetic-go',403]]){const f=fixture();const r=await f.call({token});assert.equal(r.status,status);assert.equal(f.calls,0);assert.equal(r.headers.get('x-request-id'),id);}
});
test('missing exact target never falls back to another tab, even when sole tab or same site',async()=>{
 for(const targets of [['other'],['other','second'],[]]){const f=fixture({targets});const r=await f.call();assert.equal(r.status,409);assert.equal((await r.json()).error,'EXACT_PAGE_UNAVAILABLE');assert.equal(f.cdpCalls,0);}
 const f=fixture({targetId:null});assert.equal((await f.call()).status,409);assert.equal(f.cdpCalls,0);
});
test('stage errors are fixed codes and never disclose upstream text or signed URLs',async()=>{
 for(const [mode,status,code] of [['connect',503,'SESSION_UNAVAILABLE'],['pages',503,'SESSION_UNAVAILABLE'],['cdp',502,'LIVE_VIEW_CDP_UNAVAILABLE'],['provider',502,'LIVE_VIEW_PROVIDER_ERROR'],['url',502,'LIVE_VIEW_UNAVAILABLE']]){
  const r=await fixture({mode}).call();const raw=await r.text();const body=JSON.parse(raw);assert.equal(r.status,status);assert.equal(body.error,code);assert.equal(body.requestId,id);assert.doesNotMatch(raw,/PRIVATE|https:|jwt|Authorization/);
 }
});
test('malformed/oversized body and invalid correlation cannot leak request contents',async()=>{
 for(const body of ['{"PRIVATE_SECRET":', 'x'.repeat(12001)]){const f=fixture();const r=await f.call({path:'/v1/session',method:'POST',body,requestId:'PRIVATE_SECRET'});assert.equal(r.status,400);assert.doesNotMatch(await r.text(),/PRIVATE_SECRET/);assert.match(r.headers.get('x-request-id'),/^[a-f0-9-]{36}$/);assert.equal(f.calls,0);}
});
test('request correlation log contains only fixed metadata, never credentials or view URL',async()=>{
 const logs=[];const previous=console.info;console.info=x=>logs.push(x);
 try {const r=await fixture().call();assert.equal(r.status,200);} finally {console.info=previous;}
 assert.equal(logs.length,1);assert.deepEqual(JSON.parse(logs[0]),{event:'browser_view_request',requestId:id,httpStatus:200});
 assert.doesNotMatch(logs[0],/synthetic|Bearer|https:|jwt/);
});

test('GO observes and navigates the exact permitted tab; owner revocation still denies',async()=>{
 const f=fixture({goRead:true,controller:'GO'});
 const observed=await f.call({token:'synthetic-go',path:'/v1/observe'});
 assert.equal(observed.status,200);assert.equal(f.observations,1);
 const moved=await f.call({token:'synthetic-go',path:'/v1/action',method:'POST',body:JSON.stringify({type:'navigate',url:'https://example.com/next'})});
 assert.equal(moved.status,200);assert.equal(f.navigations,1);
 const revoked=await f.call({path:'/v1/observe-access',method:'POST',body:'{"allow":false}'});assert.equal(revoked.status,200);
 const denied=await f.call({token:'synthetic-go',path:'/v1/observe'});assert.equal(denied.status,403);assert.equal(f.observations,1);
});
test('GO cannot read uninvited or changed-origin tab, control as observer, or navigate outside grant',async()=>{
 const off=fixture();assert.equal((await off.call({token:'synthetic-go',path:'/v1/observe'})).status,403);assert.equal(off.calls,0);
 const drift=fixture({goRead:true,actualUrl:'https://different.com/'});assert.equal((await drift.call({token:'synthetic-go',path:'/v1/observe'})).status,400);assert.equal(drift.observations,0);
 const observer=fixture({goRead:true});assert.equal((await observer.call({token:'synthetic-go',path:'/v1/action',method:'POST',body:'{"type":"navigate","url":"https://example.com/next"}'})).status,400);assert.equal(observer.navigations,0);
 const control=fixture({goRead:true,controller:'GO'});assert.equal((await control.call({token:'synthetic-go',path:'/v1/action',method:'POST',body:'{"type":"navigate","url":"https://different.com/"}'})).status,400);assert.equal(control.navigations,0);
});
test('missing target recovers only through explicit owner URL open and a fresh GO grant',async()=>{
 const f=fixture({targets:['other'],goRead:true,controller:'GO'});
 assert.equal((await f.call()).status,409);assert.equal(f.launches,0);
 assert.equal((await f.call({token:'synthetic-go',path:'/v1/session',method:'POST',body:'{"url":"https://example.com/selected"}'})).status,404);assert.equal(f.launches,0);
 const opened=await f.call({path:'/v1/session',method:'POST',body:'{"url":"https://example.com/selected"}'});assert.equal(opened.status,200);assert.equal(f.launches,1);assert.equal(f.closed,1);assert.deepEqual(f.liveSessions,['new-synthetic-session']);assert.equal(f.state.targetId,'explicit-new-target');assert.equal(f.state.allowGoRead,false);
 assert.equal((await f.call()).status,200);
 assert.equal((await f.call({path:'/v1/control',method:'POST',body:'{"controller":"GO"}'})).status,200);
 assert.equal((await f.call({token:'synthetic-go',path:'/v1/observe'})).status,200);
});

test('GO hands click/type permitted controls while sensitive actions remain blocked',async()=>{
 const f=fixture({goRead:true,controller:'GO'});
 const action=async(f,body)=>f.call({token:'synthetic-go',path:'/v1/action',method:'POST',body:JSON.stringify(body)});
 assert.equal((await action(f,{type:'click',selector:'#details'})).status,200);assert.equal(f.clicks,1);
 assert.equal((await action(f,{type:'type',selector:'#query',value:'synthetic text'})).status,200);assert.deepEqual(f.typed,['synthetic text']);
 const protectedInput=fixture({goRead:true,controller:'GO',inputType:'password'});
 assert.equal((await action(protectedInput,{type:'type',selector:'#field',value:'synthetic'})).status,400);assert.deepEqual(protectedInput.typed,[]);
 const sensitive=fixture({goRead:true,controller:'GO',sensitiveClick:true});
 assert.equal((await action(sensitive,{type:'click',selector:'#button'})).status,400);assert.equal(sensitive.clicks,0);
 const missing=fixture({goRead:true,controller:'GO',targets:['other']});
 assert.equal((await action(missing,{type:'click',selector:'#details'})).status,400);assert.equal(missing.clicks,0);
});

test('owner recovery retains tracked old session and never launches if cleanup fails',async()=>{
 const f=fixture({targets:['other'],cleanupFails:true});
 const r=await f.call({path:'/v1/session',method:'POST',body:'{"url":"https://example.com/selected"}'});
 assert.equal(r.status,400);const text=await r.text();assert.equal(JSON.parse(text).error,'SESSION_CLEANUP_FAILED');assert.doesNotMatch(text,/PRIVATE|jwt|https:/);
 assert.equal(f.launches,0);assert.equal(f.closed,0);assert.deepEqual(f.liveSessions,['synthetic']);assert.equal(f.state.browserSessionId,'synthetic');assert.equal(f.state.targetId,'selected');
});

test('expired Browser Run is reconciled without restarting, leaking GO grant or losing owner sites',async()=>{
 const f=fixture({mode:'expired',goRead:true,controller:'GO'});
 const first=await f.call({path:'/v1/session'});
 assert.equal(first.status,200);
 const snapshot=await first.json();
 assert.equal(snapshot.sessionId,null);
 assert.equal(snapshot.status,'EXPIRED');
 assert.equal(snapshot.mode,'IDLE');
 assert.equal(snapshot.controller,'BIG');
 assert.equal(snapshot.goCanObserve,false);
 assert.equal(f.state.browserSessionId,null);
 assert.equal(f.state.allowGoRead,false);
 assert.equal(f.launches,0,'polling must not start a billed session');
 const site=await f.call({path:'/v1/site-permissions'});
 assert.equal(site.status,200);
 const perms=await site.json();
 assert.equal(perms.pageHost,null);
 assert.equal(perms.canInviteGo,false);
 assert.equal(perms.sessionGranted,false);
 const opened=await f.call({path:'/v1/session',method:'POST',body:'{"url":"https://example.com/again"}'});
 assert.equal(opened.status,200);
 assert.equal(f.launches,1,'explicit owner action starts one session');
 assert.equal(f.state.status,'RUNNING');
 assert.equal(f.state.allowGoRead,false,'invitation requires new explicit owner approval');
 assert.equal(f.state.browserSessionId,'new-synthetic-session');
});

test('session-list provider outage never deletes tracked session or GO grant',async()=>{
 const f=fixture({mode:'sessionlist',goRead:true});
 const read=await f.call({path:'/v1/session'});
 assert.equal(read.status,200);
 assert.equal((await read.json()).status,'RUNNING');
 assert.equal(f.state.browserSessionId,'synthetic');
 assert.equal(f.state.allowGoRead,true);
 assert.equal(f.launches,0);
});
