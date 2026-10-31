import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import * as policy from "../policy.mjs";
import * as sites from "../site-permissions.mjs";
import * as passkeyUtils from "../passkey-utils.mjs";
import {invokeObservatoryGo} from "../go-bridge.mjs";
import {invokeObservatoryHub} from "../hub-bridge.mjs";
import {computeHubRequestDigest,decodeHubContext} from "../hub-contract.mjs";
import {clearHubAccessJwksCache} from "../hub-auth.mjs";
import {accessConfig,signedAccessToken} from "./hub-fixtures.mjs";

const ORIGIN="https://observatory.example";
const OWNER_CREDENTIAL="owner-passkey-01";
const OWNER_SESSION="A".repeat(43);
const BROWSER_SESSION="browser-session-01";
const HOST="docs.yggmetro.com";
const page={
  url:()=>`https://${HOST}/guide`,
  target:()=>({_targetId:"page-01"}),
  evaluate:async()=>({
    title:"Documentation",url:`https://${HOST}/guide`,text:"read-only fixture",controls:[],
  }),
  screenshot:async()=>new Uint8Array([1,2,3]),
  goto:async url=>{page.currentUrl=url;},
  click:async()=>{},
};

const source=readFileSync(new URL("../worker.mjs",import.meta.url),"utf8")
  .replace(/^import .*;\n/gm,"")
  .replace("export default {","const worker = {")
  .replaceAll("export class ","class ");
const deps={
  puppeteer:{
    sessions:async()=>[{sessionId:BROWSER_SESSION}],
    connect:async()=>({pages:async()=>[page],disconnect:async()=>{},close:async()=>{}}),
  },
  ...policy,...sites,
  mcpResponse:async()=>new Response("synthetic MCP"),
  consoleHtml:"",
  webauthn:{},
  passkeyUtils,
  WorkerEntrypoint:class {},
  invokeObservatoryGo,
  invokeObservatoryHub,
  computeHubRequestDigest,
  decodeHubContext,
  scrollRemotePage:async()=>{},
};
const {worker,BrowserWorkspace}=new Function(
  ...Object.keys(deps),source+";return {worker,BrowserWorkspace};",
)(...Object.values(deps));

function fixture() {
  const storageData=new Map([
    ["owner-passkeys",[{id:OWNER_CREDENTIAL,label:"Owner device"}]],
    ["browser",{
      browserSessionId:BROWSER_SESSION,targetId:"page-01",url:`https://${HOST}/guide`,
      controller:"BIG",mode:"OBSERVE",status:"RUNNING",version:1,
      allowGoRead:false,grantedHost:null,sitePermissions:[],hubGrant:null,
      hubPendingInvitations:[],hubRpcReceipts:[],recentRequests:[],
    }],
  ]);
  const storage={
    get:async key=>structuredClone(storageData.get(key)),
    put:async(key,value)=>storageData.set(key,structuredClone(value)),
    delete:async keys=>{for(const key of Array.isArray(keys)?keys:[keys])storageData.delete(key);},
    list:async({prefix="",limit=1000}={})=>new Map(
      [...storageData.entries()].filter(([key])=>key.startsWith(prefix)).slice(0,limit)
        .map(([key,value])=>[key,structuredClone(value)]),
    ),
    setAlarm:async()=>{},
  };
  const instance=new BrowserWorkspace({storage},{...accessConfig,
    OWNER_TOKEN:"owner-token",GO_TOKEN:"go-token",GO_ALLOWED_HOSTS:"*.yggmetro.com",
    BROWSER:{},
  });
  const ownerSessionKey=passkeyUtils.sha256Base64Url(OWNER_SESSION);
  const env={
    ...accessConfig,OWNER_TOKEN:"owner-token",GO_TOKEN:"go-token",BROWSER:{},
    GO_ALLOWED_HOSTS:"*.yggmetro.com",
    SESSIONS:{
      idFromName:()=>1,
      get:()=>({fetch:request=>instance.fetch(request)}),
    },
  };
  const ready=(async()=>{
    const hashed=await ownerSessionKey;
    storageData.set(`passkey-session:${hashed}`,{
      expiresAt:Date.now()+60*60_000,credentialId:OWNER_CREDENTIAL,
    });
  })();
  async function request(path,{method="GET",token,cookie,origin=ORIGIN,body}={}) {
    await ready;
    const headers={};
    if(token)headers.authorization=`Bearer ${token}`;
    if(cookie)headers.cookie=cookie;
    if(origin)headers.origin=origin;
    if(body!==undefined)headers["content-type"]="application/json";
    return worker.fetch(new Request(`${ORIGIN}${path}`,{
      method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{}),
    }),env);
  }
  return {env,instance,storageData,request,ready};
}

const freshContext=requestId=>({requestId});

test("owner invitation bootstrap exposes no session or page data before approval",async()=>{
  clearHubAccessJwksCache();
  const f=fixture();await f.ready;
  const signed=await signedAccessToken();
  const result=await invokeObservatoryHub(f.env,"observatory_session",{},
    {...freshContext(crypto.randomUUID()),accessJwt:signed.token},signed.fetcher);
  assert.equal(result.ok,false);
  assert.equal(result.status,"OWNER_INVITATION_REQUIRED");
  assert.match(result.invitationRequestId,/^[0-9a-f-]{36}$/u);
  assert.deepEqual(Object.keys(result).sort(),["invitationRequestId","ok","status"]);
  const state=await f.storageData.get("browser");
  assert.equal(state.hubPendingInvitations[0].subject,"hub-user-001");
  assert.equal("accessJwt" in state.hubPendingInvitations[0],false);
});

test("only active passkey owner can approve; bootstrap then returns bound selectors",async()=>{
  clearHubAccessJwksCache();
  const f=fixture();await f.ready;
  const signed=await signedAccessToken();
  const pending=await invokeObservatoryHub(f.env,"observatory_session",{},
    {...freshContext(crypto.randomUUID()),accessJwt:signed.token},signed.fetcher);
  const denied=await f.request("/v1/hub-invitations",{
    token:"owner-token",method:"GET",
  });
  assert.equal(denied.status,403);

  const cookie=`${passkeyUtils.PASSKEY_SESSION_COOKIE}=${OWNER_SESSION}`;
  const listed=await f.request("/v1/hub-invitations",{cookie});
  assert.equal(listed.status,200);
  const view=await listed.json();
  assert.equal(view.pending[0].subject,"hub-user-001");
  assert.equal(view.pending[0].hostname,HOST);
  assert.equal("pageUrl" in view.pending[0],false);
  const approved=await f.request("/v1/hub-invitations",{
    cookie,method:"POST",
    body:{action:"approve",invitationRequestId:pending.invitationRequestId},
  });
  assert.equal(approved.status,200);
  const grant=await approved.json();
  assert.equal(grant.approved,true);
  assert.equal(grant.browserSessionId,BROWSER_SESSION);
  assert.match(grant.grantId,/^[0-9a-f-]{36}$/u);

  const bootstrap=await invokeObservatoryHub(f.env,"observatory_session",{},
    {...freshContext(crypto.randomUUID()),accessJwt:signed.token},signed.fetcher);
  assert.equal(bootstrap.ok,true);
  assert.equal(bootstrap.result.browserSessionId,BROWSER_SESSION);
  assert.equal(bootstrap.result.grantId,grant.grantId);
  assert.equal(bootstrap.result.pageHost,HOST);
});

test("authorized reads require matching signed principal, selectors, session and exact host",async()=>{
  clearHubAccessJwksCache();
  const f=fixture();await f.ready;
  const signed=await signedAccessToken();
  const pending=await invokeObservatoryHub(f.env,"observatory_session",{},
    {...freshContext(crypto.randomUUID()),accessJwt:signed.token},signed.fetcher);
  const cookie=`${passkeyUtils.PASSKEY_SESSION_COOKIE}=${OWNER_SESSION}`;
  await f.request("/v1/hub-invitations",{
    cookie,method:"POST",
    body:{action:"approve",invitationRequestId:pending.invitationRequestId},
  });
  const bootstrap=await invokeObservatoryHub(f.env,"observatory_session",{},
    {...freshContext(crypto.randomUUID()),accessJwt:signed.token},signed.fetcher);
  const selectors={
    browserSessionId:bootstrap.result.browserSessionId,grantId:bootstrap.result.grantId,
  };
  const read=await invokeObservatoryHub(f.env,"observatory_observe",{},
    {...freshContext(crypto.randomUUID()),...selectors,accessJwt:signed.token},signed.fetcher);
  assert.equal(read.ok,true);
  assert.equal(read.result.title,"Documentation");

  const anotherUser=await signedAccessToken({sub:"different-user"});
  const mismatch=await invokeObservatoryHub(f.env,"observatory_observe",{},
    {...freshContext(crypto.randomUUID()),...selectors,accessJwt:anotherUser.token},anotherUser.fetcher);
  assert.equal(mismatch.ok,false);
  assert.equal(mismatch.status,"HOST_NOT_GRANTED");

  const wrongSession=await invokeObservatoryHub(f.env,"observatory_observe",{},
    {...freshContext(crypto.randomUUID()),...selectors,browserSessionId:"browser-session-02",
      accessJwt:signed.token},signed.fetcher);
  assert.equal(wrongSession.status,"SESSION_MISMATCH");
  const wrongGrant=await invokeObservatoryHub(f.env,"observatory_observe",{},
    {...freshContext(crypto.randomUUID()),...selectors,grantId:crypto.randomUUID(),
      accessJwt:signed.token},signed.fetcher);
  assert.equal(wrongGrant.status,"GRANT_MISMATCH");

  const state=await f.storageData.get("browser");
  state.url="https://other.example/path";
  f.storageData.set("browser",state);
  const changedHost=await invokeObservatoryHub(f.env,"observatory_observe",{},
    {...freshContext(crypto.randomUUID()),...selectors,accessJwt:signed.token},signed.fetcher);
  assert.equal(changedHost.status,"HOST_NOT_GRANTED");
});

test("requestId+canonical digest is one-use and cross-host navigation is denied",async()=>{
  clearHubAccessJwksCache();
  const f=fixture();await f.ready;
  const signed=await signedAccessToken();
  const pending=await invokeObservatoryHub(f.env,"observatory_session",{},
    {...freshContext(crypto.randomUUID()),accessJwt:signed.token},signed.fetcher);
  const cookie=`${passkeyUtils.PASSKEY_SESSION_COOKIE}=${OWNER_SESSION}`;
  await f.request("/v1/hub-invitations",{
    cookie,method:"POST",
    body:{action:"approve",invitationRequestId:pending.invitationRequestId},
  });
  const bootstrap=await invokeObservatoryHub(f.env,"observatory_session",{},
    {...freshContext(crypto.randomUUID()),accessJwt:signed.token},signed.fetcher);
  const selectors={browserSessionId:bootstrap.result.browserSessionId,grantId:bootstrap.result.grantId};
  const delegate=await f.request("/v1/control",{
    cookie,method:"POST",body:{controller:"HUB"},
  });
  assert.equal(delegate.status,200);
  const context={...selectors,accessJwt:signed.token,requestId:crypto.randomUUID()};
  const action={type:"navigate",url:"https://outside-site.com/secret"};
  const blocked=await invokeObservatoryHub(f.env,"observatory_action",action,context,signed.fetcher);
  assert.equal(blocked.ok,false);
  assert.equal(blocked.status,"HOST_NOT_GRANTED");

  const replayContext={...selectors,accessJwt:signed.token,requestId:crypto.randomUUID()};
  const first=await invokeObservatoryHub(f.env,"observatory_observe",{},replayContext,signed.fetcher);
  const second=await invokeObservatoryHub(f.env,"observatory_observe",{},replayContext,signed.fetcher);
  assert.equal(first.ok,true);
  assert.equal(second.ok,false);
  assert.equal(second.status,"REQUEST_REPLAYED");
  for(let index=0;index<130;index++) {
    const fresh={...selectors,accessJwt:signed.token,requestId:crypto.randomUUID()};
    const accepted=await invokeObservatoryHub(f.env,"observatory_observe",{},fresh,signed.fetcher);
    assert.equal(accepted.ok,true);
  }
  const delayedReplay=await invokeObservatoryHub(f.env,"observatory_observe",{},replayContext,signed.fetcher);
  assert.equal(delayedReplay.ok,false);
  assert.equal(delayedReplay.status,"REQUEST_REPLAYED");
});

test("changed browser session and revoked owner credential invalidate the Hub grant",async()=>{
  clearHubAccessJwksCache();
  const f=fixture();await f.ready;
  const signed=await signedAccessToken();
  const pending=await invokeObservatoryHub(f.env,"observatory_session",{},
    {...freshContext(crypto.randomUUID()),accessJwt:signed.token},signed.fetcher);
  const cookie=`${passkeyUtils.PASSKEY_SESSION_COOKIE}=${OWNER_SESSION}`;
  await f.request("/v1/hub-invitations",{
    cookie,method:"POST",
    body:{action:"approve",invitationRequestId:pending.invitationRequestId},
  });
  const bootstrap=await invokeObservatoryHub(f.env,"observatory_session",{},
    {...freshContext(crypto.randomUUID()),accessJwt:signed.token},signed.fetcher);
  const selectors={browserSessionId:bootstrap.result.browserSessionId,grantId:bootstrap.result.grantId};
  const state=await f.storageData.get("browser");
  state.browserSessionId="browser-session-02";
  f.storageData.set("browser",state);
  const isolated=await invokeObservatoryHub(f.env,"observatory_observe",{},
    {...freshContext(crypto.randomUUID()),...selectors,accessJwt:signed.token},signed.fetcher);
  assert.equal(isolated.status,"SESSION_MISMATCH");

  state.browserSessionId=BROWSER_SESSION;
  f.storageData.set("browser",state);
  f.storageData.set("owner-passkeys",[]);
  const revoked=await invokeObservatoryHub(f.env,"observatory_observe",{},
    {...freshContext(crypto.randomUUID()),...selectors,accessJwt:signed.token},signed.fetcher);
  assert.equal(revoked.status,"OWNER_GRANT_REVOKED");
});