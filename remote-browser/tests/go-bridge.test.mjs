import test from "node:test";
import assert from "node:assert/strict";
import {invokeObservatoryGo,supportedGoTools} from "../go-bridge.mjs";
const fresh=()=>{
 const calls=[];
 const env={SESSIONS:{
   idFromName(name){assert.equal(name,"owner-browser-v1");return "do-1";},
   get(id){assert.equal(id,"do-1");return {fetch:async request=>{
     calls.push({path:new URL(request.url).pathname,method:request.method,
       role:request.headers.get("x-observatory-role"),
       body:request.method==="POST"?await request.json():null});
     return Response.json({controller:"BIG",status:"RUNNING",pageUrl:"https://shop.yggmetro.com/"});
   }};}
 }};
 return {env,calls};
};
test("named Worker RPC exposes only seven fixed GO tools",()=>{
 assert.deepEqual([...supportedGoTools].sort(),[
 "observatory_action","observatory_job","observatory_note","observatory_observe",
 "observatory_run","observatory_screenshot","observatory_session"]);
});
test("GO role is sourced from the service, never caller arguments",async()=>{
 const {env,calls}=fresh();
 assert.equal((await invokeObservatoryGo(env,"observatory_session")).ok,true);
 assert.deepEqual(calls,[{path:"/v1/session",method:"GET",role:"GO",body:null}]);
 assert.equal((await invokeObservatoryGo(env,"observatory_session",{role:"BIG"})).ok,false);
 assert.equal(calls.length,1);
});
test("unsupported or protected actions cannot reach Durable Object",async()=>{
 const {env,calls}=fresh();
 for(const [name,args] of [
  ["observatory_close",{}],
  ["observatory_action",{type:"js",value:"fetch('/admin')"}],
  ["observatory_action",{type:"click",selector:"button.checkout"}],
  ["observatory_run",{requestId:"abc",steps:[{type:"reload"}]}],
  ["observatory_note",{message:""}],
 ]) assert.equal((await invokeObservatoryGo(env,name,args)).ok,false,name);
 assert.equal(calls.length,0);
});
test("bounded GO action queues exactly one permitted request",async()=>{
 const {env,calls}=fresh();
 const r=await invokeObservatoryGo(env,"observatory_run",{
   requestId:"fa5ca12b-1000-4000-8000-123456789abc",
   steps:[{type:"scroll",y:200},{type:"reload"}]});
 assert.equal(r.ok,true);
 assert.equal(calls[0].path,"/v1/run");
 assert.equal(calls[0].role,"GO");
 assert.equal(calls[0].body.steps.length,2);
});
test("DO access denial remains an error, not permission",async()=>{
 const env={SESSIONS:{idFromName:()=>42,get:()=>({
   fetch:async()=>Response.json({error:"OWNER_HAS_NOT_INVITED_GO"},{status:403})
 })}};
 const r=await invokeObservatoryGo(env,"observatory_observe");
 assert.equal(r.ok,false);assert.equal(r.upstream_status,403);
});
test("missing binding fails without network fallback",async()=>{
 assert.equal((await invokeObservatoryGo({},"observatory_session")).status,
  "BROWSER_BINDING_NOT_CONFIGURED");
});
