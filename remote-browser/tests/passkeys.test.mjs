import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import * as policy from "../policy.mjs";
import * as sites from "../site-permissions.mjs";
import * as passkeyUtils from "../passkey-utils.mjs";

const source=readFileSync(new URL("../worker.mjs",import.meta.url),"utf8")
  .replace(/^import .*;\n/gm,"")
  .replace("export default {","const worker = {")
  .replaceAll("export class ","class ");
const ORIGIN="https://observatory.example";
const CREDENTIAL_ID="synthetic-credential";

function fixture() {
  const storageData=new Map();
  const storage={
    get:async key=>structuredClone(storageData.get(key)),
    put:async(key,value)=>storageData.set(key,structuredClone(value)),
    delete:async keys=>{
      for(const key of Array.isArray(keys)?keys:[keys])storageData.delete(key);
    },
    list:async({prefix="",limit=1000}={})=>new Map(
      [...storageData.entries()].filter(([key])=>key.startsWith(prefix)).slice(0,limit)
        .map(([key,value])=>[key,structuredClone(value)]),
    ),
    setAlarm:async()=>{},
  };
  const webauthn={
    generateRegistrationOptions:async()=>({
      challenge:"registration-challenge",
      rp:{name:"YGG Observatory",id:"observatory.example"},
      user:{id:"synthetic-user",name:"BIG",displayName:"Observatory owner"},
      excludeCredentials:[],
    }),
    verifyRegistrationResponse:async args=>{
      assert.equal(args.expectedChallenge,"registration-challenge");
      assert.equal(args.expectedOrigin,ORIGIN);
      assert.equal(args.expectedRPID,"observatory.example");
      assert.equal(args.requireUserVerification,true);
      assert.equal(args.response?.id,CREDENTIAL_ID);
      return {verified:true,registrationInfo:{
        credential:{id:CREDENTIAL_ID,publicKey:new Uint8Array([1,2,3]),counter:0},
        userVerified:args.response?.unverified!==true,
        credentialDeviceType:"multiDevice",credentialBackedUp:true,
      }};
    },
    generateAuthenticationOptions:async()=>({
      challenge:"authentication-challenge",
      rpId:"observatory.example",allowCredentials:[],userVerification:"required",
    }),
    verifyAuthenticationResponse:async args=>{
      assert.equal(args.expectedChallenge,"authentication-challenge");
      assert.equal(args.expectedOrigin,ORIGIN);
      assert.equal(args.expectedRPID,"observatory.example");
      assert.equal(args.requireUserVerification,true);
      assert.equal(args.credential.id,CREDENTIAL_ID);
      assert.equal(args.response?.id,CREDENTIAL_ID);
      if(args.response?.badSignature)throw new Error("synthetic signature mismatch");
      return {verified:true,authenticationInfo:{
        credentialID:args.response?.wrongCredential?`${CREDENTIAL_ID}-other`:CREDENTIAL_ID,
        newCounter:1,userVerified:args.response?.unverified!==true,
        credentialDeviceType:"multiDevice",
        credentialBackedUp:true,
      }};
    },
  };
  const deps={
    puppeteer:{},
    ...policy,
    ...sites,
    webauthn,
    passkeyUtils,
    mcpResponse:async()=>new Response("synthetic MCP response"),
    consoleHtml:"",
    WorkerEntrypoint:class {},
    invokeObservatoryGo:async()=>({ok:false}),
    scrollRemotePage:async()=>{},
  };
  const {worker,BrowserWorkspace}=new Function(
    ...Object.keys(deps),source+";return {worker,BrowserWorkspace};",
  )(...Object.values(deps));
  const instance=new BrowserWorkspace({storage},{OWNER_TOKEN:"owner-token",GO_TOKEN:"go-token"});
  const env={
    OWNER_TOKEN:"owner-token",GO_TOKEN:"go-token",BROWSER:{},
    SESSIONS:{idFromName:()=>1,get:()=>({fetch:request=>instance.fetch(request)})},
  };
  async function request(path,{method="GET",token,cookie,origin=ORIGIN,body}={}) {
    const headers={};
    if(token)headers.authorization=`Bearer ${token}`;
    if(cookie)headers.cookie=cookie;
    if(origin)headers.origin=origin;
    if(body!==undefined)headers["content-type"]="application/json";
    return worker.fetch(new Request(`${ORIGIN}${path}`,{
      method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{}),
    }),env);
  }
  return {request,storageData};
}

function cookiePair(response,name) {
  const values=response.headers.getSetCookie();
  const value=values.find(item=>item.startsWith(`${name}=`));
  assert.ok(value,`expected ${name} cookie`);
  return value.split(";",1)[0];
}

async function register(f) {
  const optionsResponse=await f.request("/auth/passkey/register/options",{
    method:"POST",token:"owner-token",body:{label:"Test device"},
  });
  assert.equal(optionsResponse.status,200);
  const flowCookie=cookiePair(optionsResponse,passkeyUtils.PASSKEY_FLOW_COOKIE);
  const verifyResponse=await f.request("/auth/passkey/register/verify",{
    method:"POST",token:"owner-token",cookie:flowCookie,
    body:{credential:{id:CREDENTIAL_ID}},
  });
  assert.equal(verifyResponse.status,200);
  const item=(await f.storageData.get("owner-passkeys"))[0];
  assert.deepEqual(await verifyResponse.json(),{
    registered:true,label:"Test device",createdAt:item.createdAt,
  });
  return {flowCookie,verifyResponse};
}

async function login(f) {
  const optionsResponse=await f.request("/auth/passkey/login/options",{
    method:"POST",body:{},
  });
  assert.equal(optionsResponse.status,200);
  const flowCookie=cookiePair(optionsResponse,passkeyUtils.PASSKEY_FLOW_COOKIE);
  const verifyResponse=await f.request("/auth/passkey/login/verify",{
    method:"POST",cookie:flowCookie,body:{credential:{id:CREDENTIAL_ID}},
  });
  assert.equal(verifyResponse.status,200);
  const body=await verifyResponse.json();
  assert.equal(body.authenticated,true);
  assert.equal("sessionId" in body,false,"opaque session ID must never be returned to page JS");
  const sessionCookie=cookiePair(verifyResponse,passkeyUtils.PASSKEY_SESSION_COOKIE);
  assert.match(sessionCookie,/^observatory_owner_session=[A-Za-z0-9_-]{43}$/u);
  assert.ok(verifyResponse.headers.getSetCookie().some(value=>/HttpOnly/u.test(value)));
  return {flowCookie,sessionCookie,verifyResponse};
}

test("passkey enrollment is owner-only, same-origin, verified, and single-use",async()=>{
  const f=fixture();
  const unauthenticated=await f.request("/auth/passkey/register/options",{
    method:"POST",body:{label:"No owner"},
  });
  assert.equal(unauthenticated.status,401);
  assert.equal((await f.request("/auth/passkey/register/options",{
    method:"POST",token:"owner-token",origin:"https://evil.example",body:{label:"No"},
  })).status,403);
  const {flowCookie}=await register(f);
  const replay=await f.request("/auth/passkey/register/verify",{
    method:"POST",token:"owner-token",cookie:flowCookie,
    body:{credential:{id:CREDENTIAL_ID}},
  });
  assert.equal(replay.status,400);
  assert.equal((await f.request("/auth/passkey/status",{token:"go-token"})).status,403);
  assert.equal((await f.request("/auth/passkey/status",{token:"owner-token"})).status,200);
});

test("verified passkey creates an opaque HttpOnly session usable only for the owner Console",async()=>{
  const f=fixture();
  await register(f);
  const {sessionCookie}=await login(f);
  const ownerRead=await f.request("/v1/session",{cookie:sessionCookie});
  assert.equal(ownerRead.status,200);
  assert.equal((await ownerRead.json()).controller,"BIG");

  const crossSiteWrite=await f.request("/v1/control",{
    method:"POST",cookie:sessionCookie,origin:"https://evil.example",body:{controller:"GO"},
  });
  assert.equal(crossSiteWrite.status,403);
  assert.equal((await f.request("/mcp",{cookie:sessionCookie})).status,403,
    "passkey owner cookie must not authorize the GO MCP endpoint");
  assert.equal((await f.request("/mcp",{token:"go-token"})).status,200,
    "the existing GO token remains the only MCP authentication path");
});

test("unregistered, invalid-origin, expired, and tampered passkey attempts fail closed",async()=>{
  const f=fixture();
  const absent=await f.request("/auth/passkey/login/options",{
    method:"POST",body:{},
  });
  assert.equal(absent.status,409);
  assert.equal((await absent.json()).error,"PASSKEY_NOT_ENROLLED");

  await register(f);
  for(const origin of [null,"null","http://observatory.example"]) {
    const response=await f.request("/auth/passkey/login/options",{
      method:"POST",origin,body:{},
    });
    assert.equal(response.status,403);
  }

  const options=await f.request("/auth/passkey/login/options",{method:"POST",body:{}});
  const flowCookie=cookiePair(options,passkeyUtils.PASSKEY_FLOW_COOKIE);
  const tampered=await f.request("/auth/passkey/login/verify",{
    method:"POST",cookie:flowCookie,body:{credential:{id:CREDENTIAL_ID,badSignature:true}},
  });
  assert.equal(tampered.status,401);
  assert.equal((await tampered.json()).error,"PASSKEY_VERIFICATION_FAILED");

  const expired=await f.request("/auth/passkey/login/verify",{
    method:"POST",cookie:`${passkeyUtils.PASSKEY_FLOW_COOKIE}=invalid`,
    body:{credential:{id:CREDENTIAL_ID}},
  });
  assert.equal(expired.status,400);
  assert.equal((await expired.json()).error,"PASSKEY_FLOW_EXPIRED");
});

test("verified response must assert user verification and match the enrolled credential",async()=>{
  const f=fixture();
  await register(f);
  for(const credential of [
    {id:CREDENTIAL_ID,unverified:true},
    {id:CREDENTIAL_ID,wrongCredential:true},
  ]) {
    const options=await f.request("/auth/passkey/login/options",{method:"POST",body:{}});
    const flowCookie=cookiePair(options,passkeyUtils.PASSKEY_FLOW_COOKIE);
    const response=await f.request("/auth/passkey/login/verify",{
      method:"POST",cookie:flowCookie,body:{credential},
    });
    assert.equal(response.status,401);
    assert.equal((await response.json()).error,"PASSKEY_VERIFICATION_FAILED");
  }

  const options=await f.request("/auth/passkey/register/options",{
    method:"POST",token:"owner-token",body:{label:"Unverified device"},
  });
  const flowCookie=cookiePair(options,passkeyUtils.PASSKEY_FLOW_COOKIE);
  const unverified=await f.request("/auth/passkey/register/verify",{
    method:"POST",token:"owner-token",cookie:flowCookie,
    body:{credential:{id:CREDENTIAL_ID,unverified:true}},
  });
  assert.equal(unverified.status,400);
  assert.equal((await f.storageData.get("owner-passkeys")).length,1);
});

test("removing a passkey revokes previously issued owner sessions",async()=>{
  const f=fixture();
  await register(f);
  const {sessionCookie}=await login(f);
  const listed=await f.request("/auth/passkey/status",{token:"owner-token"});
  const [{id}]=(await listed.json()).credentials;
  const removed=await f.request("/auth/passkey/remove",{
    method:"POST",token:"owner-token",body:{id},
  });
  assert.equal(removed.status,200);
  assert.deepEqual(await removed.json(),{removed:true,remaining:0});
  const staleSession=await f.request("/v1/session",{cookie:sessionCookie});
  assert.equal(staleSession.status,401);
});

test("owner logout clears browser cookies and revokes the passkey session",async()=>{
  const f=fixture();
  await register(f);
  const {sessionCookie}=await login(f);
  const logout=await f.request("/auth/logout",{
    method:"POST",cookie:sessionCookie,body:{},
  });
  assert.equal(logout.status,200);
  assert.equal((await logout.json()).loggedOut,true);
  assert.ok(logout.headers.getSetCookie().some(value=>value.startsWith(
    `${passkeyUtils.PASSKEY_SESSION_COOKIE}=;`,
  )));
  assert.equal((await f.request("/v1/session",{cookie:sessionCookie})).status,401);
});