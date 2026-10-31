import test from "node:test";
import assert from "node:assert/strict";
import {invokeObservatoryHub,supportedHubTools} from "../hub-bridge.mjs";
import {decodeHubContext} from "../hub-contract.mjs";
import {supportedGoTools} from "../go-bridge.mjs";
import {clearHubAccessJwksCache} from "../hub-auth.mjs";
import {accessConfig,signedAccessToken,corruptSignature} from "./hub-fixtures.mjs";

const ids={session:"browser-session-1",grant:"5ac0dbea-a9c5-4f80-9bc6-10642fbca92c"};
const requestId=()=>crypto.randomUUID();
function fresh() {
  const calls=[];
  const env={...accessConfig,SESSIONS:{
    idFromName(name){assert.equal(name,"owner-browser-v1");return "do-1";},
    get(id){assert.equal(id,"do-1");return {fetch:async request=>{
      const body=request.method==="POST"?await request.json():null;
      calls.push({
        path:new URL(request.url).pathname,method:request.method,
        role:request.headers.get("x-observatory-role"),body,
        context:decodeHubContext(request.headers.get("x-observatory-hub-context")),
      });
      return Response.json({sessionId:ids.session,pageUrl:"https://docs.yggmetro.com/",
        browserSessionId:ids.session,grantId:ids.grant});
    }};},
  }};
  return {env,calls};
}

test("Hub keeps the exact seven-tool scope without changing the GO bridge",()=>{
  assert.deepEqual([...supportedHubTools].sort(),[...supportedGoTools].sort());
});

test("valid Access JWT routes through HUB role with selectors in RPC context only",async()=>{
  clearHubAccessJwksCache();
  const signed=await signedAccessToken();
  const {env,calls}=fresh();
  const result=await invokeObservatoryHub(env,"observatory_action",
    {type:"click",selector:"button.refresh"},
    {accessJwt:signed.token,browserSessionId:ids.session,grantId:ids.grant,requestId:requestId()},
    signed.fetcher);
  assert.equal(result.ok,true);
  assert.equal(calls.length,1);
  assert.equal(calls[0].path,"/v1/action");
  assert.equal(calls[0].role,"HUB");
  assert.equal(calls[0].body.type,"click");
  assert.equal(calls[0].context.subject,"hub-user-001");
  assert.equal(calls[0].context.browserSessionId,ids.session);
  assert.equal(calls[0].context.grantId,ids.grant);
  assert.equal("accessJwt" in calls[0].context,false);
});

test("bootstrap allows no selectors; all other calls require both opaque selectors",async()=>{
  clearHubAccessJwksCache();
  const signed=await signedAccessToken();
  const {env,calls}=fresh();
  const boot=await invokeObservatoryHub(env,"observatory_session",{},
    {accessJwt:signed.token,requestId:requestId()},signed.fetcher);
  assert.equal(boot.ok,true);
  assert.equal(calls[0].context.browserSessionId,null);
  assert.equal(calls[0].context.grantId,null);
  const missing=await invokeObservatoryHub(env,"observatory_observe",{},
    {accessJwt:signed.token,requestId:requestId()},signed.fetcher);
  assert.equal(missing.ok,false);
  assert.equal(missing.error,"OWNER_INVITATION_REQUIRED");
  assert.equal(calls.length,1);
});

test("invalid JWT, untrusted identity fields and malformed selectors never reach DO",async()=>{
  clearHubAccessJwksCache();
  const signed=await signedAccessToken();
  const {env,calls}=fresh();
  const bad=await invokeObservatoryHub(env,"observatory_session",{},
    {accessJwt:corruptSignature(signed.token),requestId:requestId()},signed.fetcher);
  assert.equal(bad.status,"HUB_ASSERTION_INVALID");
  const identity=await invokeObservatoryHub(env,"observatory_session",{},
    {accessJwt:signed.token,requestId:requestId(),subject:"attacker"},signed.fetcher);
  assert.equal(identity.status,"INVALID_CONTEXT");
  const partial=await invokeObservatoryHub(env,"observatory_observe",{},
    {accessJwt:signed.token,browserSessionId:ids.session,requestId:requestId()},signed.fetcher);
  assert.equal(partial.status,"INVALID_CONTEXT");
  assert.equal(calls.length,0);
});

test("unknown tools, unknown tool arguments and unsafe actions do not route",async()=>{
  clearHubAccessJwksCache();
  const signed=await signedAccessToken();
  const {env,calls}=fresh();
  const context={accessJwt:signed.token,browserSessionId:ids.session,grantId:ids.grant,requestId:requestId()};
  assert.equal((await invokeObservatoryHub(env,"observatory_close",{},context,signed.fetcher)).ok,false);
  assert.equal((await invokeObservatoryHub(env,"observatory_session",{url:"https://evil.example/"},context,signed.fetcher)).ok,false);
  assert.equal((await invokeObservatoryHub(env,"observatory_action",
    {type:"click",selector:"button.submit"},context,signed.fetcher)).ok,false);
  assert.equal(calls.length,0);
});