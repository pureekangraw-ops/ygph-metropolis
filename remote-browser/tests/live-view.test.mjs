import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as policy from '../policy.mjs';
import * as sites from '../site-permissions.mjs';
// Execute actual Worker/DO methods with synthetic provider/storage; no network.
const source=readFileSync(new URL('../worker.mjs',import.meta.url),'utf8')
 .replace(/^import .*;\n/gm,'').replace('export default {','const worker = {').replaceAll('export class ','class ');
const id='11111111-2222-4333-8444-555555555555';
function fixture({goRead=false,mode='ok',targets=['selected'],targetId='selected'}={}) {
 let state={browserSessionId:'synthetic',targetId,controller:'BIG',mode:'OBSERVE',status:'RUNNING',allowGoRead:goRead,url:'https://example.test/',grantedHost:goRead?'example.test':null},calls=0,cdpCalls=0;
 const privateError=()=>Error('PRIVATE_TOKEN https://live.browser.run/?jwt=PRIVATE_URL');
 const puppeteer={connect:async()=>{calls++;if(mode==='connect')throw privateError();return {
  pages:async()=>{if(mode==='pages')throw privateError();return targets.map(t=>({target:()=>({_targetId:t}),createCDPSession:async()=>{if(mode==='cdp')throw privateError();return {send:async()=>{cdpCalls++;if(mode==='provider')throw privateError();return {devtoolsFrontendUrl:mode==='url'?'https://attacker.invalid/':'https://live.browser.run/synthetic'};},detach:async()=>{}};}}));},disconnect:async()=>{}
 };}};
 const deps={puppeteer,...policy,...sites,WorkerEntrypoint:class {}};
 const {worker,BrowserWorkspace}=new Function(...Object.keys(deps),source+';return {worker,BrowserWorkspace};')(...Object.values(deps));
 const instance=new BrowserWorkspace({storage:{get:async()=>structuredClone(state),put:async(k,v)=>{state=structuredClone(v);}}},{});
 const env={OWNER_TOKEN:'synthetic-owner',GO_TOKEN:'synthetic-go',BROWSER:{},SESSIONS:{idFromName:()=>1,get:()=>({fetch:r=>instance.fetch(r)})}};
 return {get calls(){return calls},get cdpCalls(){return cdpCalls},async call({token='synthetic-owner',path='/v1/view',method='GET',body,requestId=id}={}){
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
