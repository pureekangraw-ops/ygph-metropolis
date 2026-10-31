import puppeteer from "@cloudflare/puppeteer";
import { validPageUrl, allowedAction, mayGoAct, cleanStep } from "./policy.mjs";
import { mcpResponse } from "./mcp.mjs";
import { consoleHtml } from "./console.mjs";
import * as webauthn from "@simplewebauthn/server";
import * as passkeyUtils from "./passkey-utils.mjs";
import { WorkerEntrypoint } from "cloudflare:workers";
import { invokeObservatoryGo } from "./go-bridge.mjs";
import { scrollRemotePage } from "./scroll.mjs";
import {mayGoUseSite,sitePermissionsView,updateOwnerSitePermission,publicSiteHost} from "./site-permissions.mjs";
import {invokeObservatoryHub} from "./hub-bridge.mjs";
import {computeHubRequestDigest,decodeHubContext} from "./hub-contract.mjs";

const HEADERS = { "content-type":"application/json; charset=utf-8", "cache-control":"no-store", "x-content-type-options":"nosniff" };
function reply(body, code=200) { return new Response(JSON.stringify(body), { status:code, headers:HEADERS }); }
async function bodyOf(request) {
  if (+(request.headers.get("content-length") || 0) > 12000) throw new Error("BODY_TOO_LARGE");
  const reader=request.body?.getReader();let text="",bytes=0;
  const decoder=new TextDecoder("utf-8",{fatal:true});
  if(reader)try {
    for(;;){const {done,value}=await reader.read();if(done)break;
      bytes+=value.byteLength;
      if(bytes>12000){void reader.cancel().catch(()=>{});throw new Error("BODY_TOO_LARGE");}
      text+=decoder.decode(value,{stream:true});
    }
    text+=decoder.decode();
  } finally {reader.releaseLock();}
  return text ? JSON.parse(text) : {};
}
function sameGrant(s,url=s.url) {
  try {return s.allowGoRead===true && !!s.grantedHost && new URL(url).hostname===s.grantedHost;}
  catch {return false;}
}
function sameHubGrant(state,principal,now=Date.now()) {
  const grant=state?.hubGrant;
  return !!grant && !!state.browserSessionId &&
    grant.issuer===principal?.issuer && grant.audience===principal?.audience &&
    grant.subject===principal?.subject &&
    grant.browserSessionId===state.browserSessionId &&
    grant.hostname===publicSiteHost(state.url) &&
    Number.isFinite(grant.expiresAt) && grant.expiresAt>now;
}
const uuidPattern=/^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/u;
const HUB_PATHS=Object.freeze({
  observatory_session:"/v1/session",
  observatory_observe:"/v1/observe",
  observatory_screenshot:"/v1/screenshot",
  observatory_action:"/v1/action",
  observatory_run:"/v1/run",
  observatory_job:"/v1/job",
  observatory_note:"/v1/note",
});
const HUB_METHODS=Object.freeze({
  observatory_session:"GET",
  observatory_observe:"GET",
  observatory_screenshot:"GET",
  observatory_action:"POST",
  observatory_run:"POST",
  observatory_job:"GET",
  observatory_note:"POST",
});
function internalAuthRequest(request, path, role, body) {
  return new Request(new URL(path, request.url), {
    method: "POST",
    headers: {"x-observatory-role": role, "content-type": "application/json"},
    body: JSON.stringify(body || {}),
  });
}
async function authResult(stub, request, path, role, body) {
  const response = await stub.fetch(internalAuthRequest(request, path, role, body));
  let data;
  try { data = await response.json(); } catch { data = {error:"INVALID_AUTH_RESPONSE"}; }
  return {response, data};
}
function authReply(data, status=200, headers={}) {
  const responseHeaders=new Headers(HEADERS);
  for(const [name,value] of Object.entries(headers)) {
    if(Array.isArray(value))for(const item of value)responseHeaders.append(name,item);
    else responseHeaders.set(name,value);
  }
  return new Response(JSON.stringify(data), {
    status,
    headers:responseHeaders,
  });
}
async function ownerSessionIdentity(stub, request, sessionId) {
  if (!sessionId || !/^[A-Za-z0-9_-]{43}$/u.test(sessionId)) return null;
  const {response, data} = await authResult(
    stub, request, "/_auth/session/verify", "AUTH", {sessionId},
  );
  return response.ok && data.valid === true &&
    typeof data.credentialId==="string" ? {credentialId:data.credentialId} : null;
}
function summarize(s) {
  return { sessionId:s.browserSessionId || null, pageUrl:s.url || null,
    controller:s.controller || "BIG", mode:s.mode || "IDLE", status:s.status || "IDLE", goCanObserve:sameGrant(s),
    note:s.note || null,
    recording:!!s.recording, lastClosedSessionId:s.lastClosedSessionId || null,
    version:s.version || 0, updatedAt:s.updatedAt || null, job:s.job || null };
}
const station = {
  async fetch(request, env) {
    const path=new URL(request.url).pathname;
    if (path==="/console" && request.method==="GET") {
      const nonce=crypto.randomUUID().replaceAll("-","");
      const headers=new Headers({
        "content-type":"text/html; charset=utf-8","cache-control":"no-store",
        "referrer-policy":"no-referrer","x-frame-options":"DENY",
        "x-content-type-options":"nosniff",
        "content-security-policy":"default-src 'none'; connect-src 'self'; style-src 'nonce-"+nonce+
          "'; script-src 'nonce-"+nonce+"'; img-src 'none'; frame-ancestors 'none'; "+
          "base-uri 'none'; form-action 'none'"
      });
      return new Response(consoleHtml.replaceAll("__NONCE__",nonce),{headers});
    }
    if (path==="/health") return reply({ service:"observatory-shared-browser", configured:!!env.OWNER_TOKEN && !!env.SESSIONS && !!env.BROWSER });
    const authorization=request.headers.get("authorization") || "";
    if (!env.OWNER_TOKEN || !env.SESSIONS || !env.BROWSER) return reply({ error:"NOT_CONFIGURED" },503);
    const go=!!env.GO_TOKEN && env.GO_TOKEN!==env.OWNER_TOKEN && authorization==="Bearer "+env.GO_TOKEN;
    const id=env.SESSIONS.idFromName("owner-browser-v1");
    const stub=env.SESSIONS.get(id);
    const ownerToken=authorization==="Bearer "+env.OWNER_TOKEN;
    const ownerSessionId=passkeyUtils.readCookie(
      request.headers.get("cookie"), passkeyUtils.PASSKEY_SESSION_COOKIE,
    );
    const ownerSession=!ownerToken && !go
      ? await ownerSessionIdentity(stub,request,ownerSessionId)
      : null;
    const owner=ownerToken || !!ownerSession;

    if(path==="/v1/hub-invitations") {
      if(!ownerSession?.credentialId)return reply({error:"PASSKEY_OWNER_SESSION_REQUIRED"},403);
      if(request.method==="POST" && !passkeyUtils.hasSameOrigin(request))
        return reply({error:"SAME_ORIGIN_REQUIRED"},403);
      if(!["GET","POST"].includes(request.method))return reply({error:"METHOD_NOT_ALLOWED"},405);
      const headers=new Headers(request.headers);
      headers.set("x-observatory-role","BIG");
      headers.set("x-observatory-owner-id",ownerSession.credentialId);
      headers.set("content-type","application/json");
      return await stub.fetch(new Request(request,{headers}));
    }

    if (path.startsWith("/auth/")) {
      if (request.method==="POST" && !passkeyUtils.hasSameOrigin(request))
        return reply({error:"SAME_ORIGIN_REQUIRED"},403);

      if (path==="/auth/passkey/login/options" && request.method==="POST") {
        const flowId=passkeyUtils.randomBase64Url();
        const {response,data}=await authResult(
          stub,request,"/_auth/passkey/login/options","AUTH",{flowId},
        );
        if(!response.ok)return authReply(data,response.status);
        return authReply(data,response.status,{
          "set-cookie":passkeyUtils.makeSecureCookie(
            passkeyUtils.PASSKEY_FLOW_COOKIE,flowId,120,"/auth",
          ),
        });
      }
      if (path==="/auth/passkey/login/verify" && request.method==="POST") {
        const flowId=passkeyUtils.readCookie(
          request.headers.get("cookie"),passkeyUtils.PASSKEY_FLOW_COOKIE,
        );
        if(!passkeyUtils.validFlowId(flowId))return reply({error:"PASSKEY_FLOW_EXPIRED"},400);
        const body=await bodyOf(request);
        const {response,data}=await authResult(
          stub,request,"/_auth/passkey/login/verify","AUTH",{...body,flowId},
        );
        if(!response.ok)return authReply(data,response.status,{
          "set-cookie":passkeyUtils.clearSecureCookie(passkeyUtils.PASSKEY_FLOW_COOKIE,"/auth"),
        });
        const sessionId=data.sessionId;
        if(!/^[A-Za-z0-9_-]{43}$/u.test(sessionId||""))
          return reply({error:"PASSKEY_SESSION_FAILED"},502,{
            "set-cookie":passkeyUtils.clearSecureCookie(passkeyUtils.PASSKEY_FLOW_COOKIE,"/auth"),
          });
        return authReply(
          {authenticated:true,expiresAt:data.expiresAt},
          response.status,
          {"set-cookie":[
            passkeyUtils.makeSecureCookie(
              passkeyUtils.PASSKEY_SESSION_COOKIE,sessionId,
              passkeyUtils.PASSKEY_SESSION_TTL_SECONDS,"/",
            ),
            passkeyUtils.clearSecureCookie(passkeyUtils.PASSKEY_FLOW_COOKIE,"/auth"),
          ]},
        );
      }
      if (path==="/auth/logout" && request.method==="POST") {
        if(ownerSessionId) {
          await authResult(stub,request,"/_auth/session/revoke","AUTH",{sessionId:ownerSessionId});
        }
        return authReply(
          {loggedOut:true},
          200,
          {"set-cookie":[
            passkeyUtils.clearSecureCookie(passkeyUtils.PASSKEY_SESSION_COOKIE),
            passkeyUtils.clearSecureCookie(passkeyUtils.PASSKEY_FLOW_COOKIE,"/auth"),
          ]},
        );
      }

      if(!owner)return reply({error:go?"OWNER_ONLY":"UNAUTHORIZED"},go?403:401);
      if (request.method==="POST" && path==="/auth/passkey/register/options") {
        const body=await bodyOf(request);
        const flowId=passkeyUtils.randomBase64Url();
        const {response,data}=await authResult(
          stub,request,"/_auth/passkey/register/options","BIG",
          {...body,flowId},
        );
        if(!response.ok)return authReply(data,response.status);
        return authReply(data,response.status,{
          "set-cookie":passkeyUtils.makeSecureCookie(
            passkeyUtils.PASSKEY_FLOW_COOKIE,flowId,120,"/auth",
          ),
        });
      }
      if (request.method==="POST" && path==="/auth/passkey/register/verify") {
        const flowId=passkeyUtils.readCookie(
          request.headers.get("cookie"),passkeyUtils.PASSKEY_FLOW_COOKIE,
        );
        if(!passkeyUtils.validFlowId(flowId))return reply({error:"PASSKEY_FLOW_EXPIRED"},400);
        const body=await bodyOf(request);
        const {response,data}=await authResult(
          stub,request,"/_auth/passkey/register/verify","BIG",
          {...body,flowId},
        );
        return authReply(data,response.status,{
          "set-cookie":passkeyUtils.clearSecureCookie(passkeyUtils.PASSKEY_FLOW_COOKIE,"/auth"),
        });
      }
      if (request.method==="GET" && path==="/auth/passkey/status") {
        const {response,data}=await authResult(
          stub,request,"/_auth/passkey/status","BIG",
        );
        return authReply(data,response.status);
      }
      if (request.method==="POST" && path==="/auth/passkey/remove") {
        const body=await bodyOf(request);
        const {response,data}=await authResult(
          stub,request,"/_auth/passkey/remove","BIG",body,
        );
        return authReply(data,response.status);
      }
      return reply({error:"NOT_FOUND"},404);
    }

    if (path==="/mcp") {
      if(!go)return reply({error:"GO_TOOL_TOKEN_REQUIRED"},403);
      return mcpResponse(request,async(method,toolPath,args)=>{
        const upstream=new Request(new URL(toolPath,request.url),{
          method, headers:{"x-observatory-role":"GO","content-type":"application/json"},
          ...(method==="POST"?{body:JSON.stringify(args)}:{})
        });
        const result=await stub.fetch(upstream);
        let data;try{data=await result.json();}catch{data={error:"INVALID_BRIDGE_RESPONSE"};}
        if(!result.ok)return {error:data.error||"GO_TOOL_NOT_ALLOWED",status:result.status};
        return data;
      });
    }
    if (!owner && !go) return reply({ error:"UNAUTHORIZED" },401);
    if (!path.startsWith("/v1/")) return reply({error:"NOT_FOUND"},404);
    if (go && !["/v1/session","/v1/observe","/v1/screenshot","/v1/action","/v1/job","/v1/run","/v1/note"].includes(path)) return reply({error:"OWNER_ONLY"},403);
    if(ownerSession && request.method==="POST" && !passkeyUtils.hasSameOrigin(request))
      return reply({error:"SAME_ORIGIN_REQUIRED"},403);
    const headers=new Headers(request.headers);
    headers.set("x-observatory-role",owner?"BIG":"GO");
    headers.set("content-type","application/json");
    headers.set("x-request-id",request.headers.get("x-request-id")||"");
    if(ownerSession?.credentialId)headers.set("x-observatory-owner-id",ownerSession.credentialId);
    else headers.delete("x-observatory-owner-id");
    const upstream=new Request(request,{headers});
    const result=await stub.fetch(upstream);
    // A DO receives role from a trusted internal request, never a client-supplied header.
    return result;
  }
};

// Correlate the request before execution; never include URLs or upstream messages.
export default {
  async fetch(request, env) {
    const supplied=request.headers.get("x-request-id") || "";
    const requestId=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(supplied)?supplied:crypto.randomUUID();
    const headers=new Headers(request.headers);headers.set("x-request-id",requestId);
    let response;
    try {response=await station.fetch(new Request(request,{headers}),env);}
    catch {response=reply({error:"REQUEST_FAILED"},503);}
    if(new URL(request.url).pathname==="/v1/view") {
      // Fixed metadata only: never log headers, page/session IDs or signed view URLs.
      console.info(JSON.stringify({event:"browser_view_request",requestId,httpStatus:response.status}));
    }
    const out=new Headers(response.headers);out.set("x-request-id",requestId);
    return new Response(response.body,{status:response.status,headers:out});
  }
};

export class BrowserWorkspace {
  constructor(ctx, env) { this.ctx=ctx; this.env=env; this.inFlight=false; this.cancelAudit=false; this.sessionProbe=null; this.hubRpcTail=Promise.resolve(); }
  async state() {
    return (await this.ctx.storage.get("browser")) ||
      {controller:"BIG",mode:"IDLE",status:"IDLE",version:0,allowGoRead:false,recentRequests:[],
        hubGrant:null,hubPendingInvitations:[],hubRpcReceipts:[]};
  }
  async save(state) { state.version=(state.version || 0)+1;state.updatedAt=new Date().toISOString();await this.ctx.storage.put("browser",state);return state; }
  async ownerCredentialIsActive(credentialId) {
    if(typeof credentialId!=="string"||!credentialId)return false;
    return (await this.passkeyCredentials()).some(item=>item.id===credentialId);
  }
  async validateHubContext(request,path,args) {
    const context=decodeHubContext(
      request.headers.get("x-observatory-hub-context"),
    );
    const teamDomain=String(this.env.CF_ACCESS_TEAM_DOMAIN||"").trim().toLowerCase();
    const expectedIssuer=teamDomain?`https://${teamDomain}`:"";
    const expectedAudience=String(this.env.CF_ACCESS_AUD||"").trim();
    if(!context||!Object.keys(context).every(key=>[
        "name","issuer","audience","subject","issuedAt","expiresAt",
        "browserSessionId","grantId","requestId","digest",
      ].includes(key))||
      context.issuer!==expectedIssuer||!expectedIssuer||
      context.audience!==expectedAudience||!expectedAudience||
      typeof context.subject!=="string"||!context.subject||
      !Number.isSafeInteger(context.issuedAt)||!Number.isSafeInteger(context.expiresAt)||
      context.expiresAt<=Math.floor(Date.now()/1000)||
      context.issuedAt>Math.floor(Date.now()/1000)+60||
      !uuidPattern.test(context.requestId||"")||
      !uuidPattern.test(context.grantId||"")&&context.grantId!==null||
      !(typeof context.browserSessionId==="string"&&/^[A-Za-z0-9_-]{1,256}$/u.test(context.browserSessionId))&&
        context.browserSessionId!==null||
      (context.grantId===null)!==(context.browserSessionId===null)||
      !Object.hasOwn(HUB_PATHS,context.name)||HUB_PATHS[context.name]!==path||
      !/^[A-Za-z0-9_-]{43}$/u.test(context.digest||"")) {
      return {error:"HUB_CONTEXT_INVALID"};
    }
    if((context.grantId===null||context.browserSessionId===null)&&
        context.name!=="observatory_session")return {error:"OWNER_INVITATION_REQUIRED"};
    const digest=await computeHubRequestDigest(context,args);
    if(digest!==context.digest)return {error:"HUB_REQUEST_DIGEST_MISMATCH"};
    return {context};
  }
  async consumeHubRequest(context) {
    const previous=this.hubRpcTail||Promise.resolve();
    let release;
    this.hubRpcTail=new Promise(resolve=>{release=resolve;});
    await previous;
    try {
      const state=await this.state();
      const receipts=(state.hubRpcReceipts||[]).filter(item=>item.expiresAt>Date.now());
      const prior=receipts.find(item=>item.requestId===context.requestId);
      if(prior)return {error:prior.digest===context.digest?"REQUEST_REPLAYED":"REQUEST_ID_REUSED"};
      if(receipts.length>=4096)return {error:"HUB_REQUEST_CAPACITY"};
      receipts.push({
        requestId:context.requestId,digest:context.digest,
        expiresAt:Math.max(Date.now()+60_000,context.expiresAt*1000),
      });
      state.hubRpcReceipts=receipts;
      await this.save(state);
      return null;
    } finally {release();}
  }
  async hubGrantFailure(state,context) {
    if(!context?.expiresAt||context.expiresAt*1000<=Date.now())return "HUB_ASSERTION_EXPIRED";
    const grant=state.hubGrant;
    if(!grant)return "OWNER_INVITATION_REQUIRED";
    if(context.grantId!==grant.grantId)return "GRANT_MISMATCH";
    if(context.browserSessionId!==state.browserSessionId||
        grant.browserSessionId!==state.browserSessionId)return "SESSION_MISMATCH";
    if(!sameHubGrant(state,context))return "HOST_NOT_GRANTED";
    if(!mayGoUseSite(state.url,this.env.GO_ALLOWED_HOSTS,state.sitePermissions))
      return "HOST_NOT_GRANTED";
    if(!await this.ownerCredentialIsActive(grant.ownerCredentialId))
      return "OWNER_GRANT_REVOKED";
    return null;
  }
  async hubBootstrap(state,context) {
    state=await this.reconcileBrowserSession(state);
    if(!state.browserSessionId||!publicSiteHost(state.url))
      return {response:reply({status:"SESSION_NOT_READY"},409)};
    const grant=state.hubGrant;
    if(sameHubGrant(state,context)&&
        await this.ownerCredentialIsActive(grant.ownerCredentialId)&&
        mayGoUseSite(state.url,this.env.GO_ALLOWED_HOSTS,state.sitePermissions)) {
      return {state,grant};
    }
    const now=Date.now();
    const current=Array.isArray(state.hubPendingInvitations)
      ? state.hubPendingInvitations.filter(item=>item.expiresAt>now &&
        item.browserSessionId===state.browserSessionId &&
        item.hostname===publicSiteHost(state.url))
      : [];
    let pending=current.find(item=>item.issuer===context.issuer&&
      item.audience===context.audience&&item.subject===context.subject);
    if(!pending) {
      if(current.length>=8)return {response:reply({status:"INVITATION_QUEUE_FULL"},429)};
      pending={
        invitationRequestId:crypto.randomUUID(),
        issuer:context.issuer,audience:context.audience,subject:context.subject,
        browserSessionId:state.browserSessionId,hostname:publicSiteHost(state.url),
        createdAt:now,expiresAt:Math.min(now+5*60_000,context.expiresAt*1000),
      };
      current.push(pending);
    }
    state.hubPendingInvitations=current;
    await this.save(state);
    return {response:reply({
      status:"OWNER_INVITATION_REQUIRED",
      invitationRequestId:pending.invitationRequestId,
    },403)};
  }
  async ownerHubInvitationView(request) {
    const ownerCredentialId=request.headers.get("x-observatory-owner-id");
    if(!await this.ownerCredentialIsActive(ownerCredentialId))
      return reply({error:"PASSKEY_OWNER_SESSION_REQUIRED"},403);
    let state=await this.reconcileBrowserSession(await this.state());
    const now=Date.now(),host=publicSiteHost(state.url);
    const pending=(state.hubPendingInvitations||[]).filter(item=>
      item.expiresAt>now&&item.browserSessionId===state.browserSessionId&&
      item.hostname===host);
    let grant=state.hubGrant;
    if(grant&&(!sameHubGrant(state,grant)||!await this.ownerCredentialIsActive(grant.ownerCredentialId))) {
      state.hubGrant=null;
      if(state.controller==="HUB"){state.controller="BIG";state.mode="OBSERVE";}
      await this.save(state);
      grant=null;
    }
    state.hubPendingInvitations=pending;
    return reply({
      pending:pending.map(item=>({
        invitationRequestId:item.invitationRequestId,issuer:item.issuer,
        audience:item.audience,subject:item.subject,
        browserSessionId:item.browserSessionId,hostname:item.hostname,
        expiresAt:new Date(item.expiresAt).toISOString(),
      })),
      grant:grant?{
        grantId:grant.grantId,issuer:grant.issuer,audience:grant.audience,
        subject:grant.subject,browserSessionId:grant.browserSessionId,
        hostname:grant.hostname,expiresAt:new Date(grant.expiresAt).toISOString(),
      }:null,
    });
  }
  async ownerHubInvitationMutation(request,body) {
    const ownerCredentialId=request.headers.get("x-observatory-owner-id");
    if(!await this.ownerCredentialIsActive(ownerCredentialId))
      return reply({error:"PASSKEY_OWNER_SESSION_REQUIRED"},403);
    let state=await this.state();
    if(this.inFlight)return reply({error:"BUSY"},409);
    const action=body.action;
    if(action==="approve") {
      const invitationRequestId=body.invitationRequestId;
      if(!uuidPattern.test(invitationRequestId||""))
        return reply({error:"INVALID_INVITATION_REQUEST"},422);
      const pending=(state.hubPendingInvitations||[]).find(item=>
        item.invitationRequestId===invitationRequestId&&item.expiresAt>Date.now());
      if(!pending)return reply({error:"INVITATION_REQUEST_EXPIRED"},404);
      try {state=await this.refreshPageAddress(state);}
      catch {return reply({error:"SESSION_CONTEXT_UNAVAILABLE"},409);}
      const host=publicSiteHost(state.url);
      if(!state.browserSessionId||pending.browserSessionId!==state.browserSessionId||
          pending.hostname!==host)
        return reply({error:"INVITATION_CONTEXT_CHANGED"},409);
      if(!mayGoUseSite(state.url,this.env.GO_ALLOWED_HOSTS,state.sitePermissions))
        return reply({error:"HOST_NOT_OWNER_APPROVED"},403);
      const grant={
        grantId:crypto.randomUUID(),
        issuer:pending.issuer,audience:pending.audience,subject:pending.subject,
        browserSessionId:state.browserSessionId,hostname:host,
        ownerCredentialId,createdAt:Date.now(),
        expiresAt:Date.now()+passkeyUtils.PASSKEY_SESSION_TTL_SECONDS*1000,
      };
      state.hubGrant=grant;
      state.hubPendingInvitations=(state.hubPendingInvitations||[]).filter(item=>
        item.invitationRequestId!==invitationRequestId);
      if(state.controller==="HUB"){state.controller="BIG";state.mode="OBSERVE";}
      await this.save(state);
      return reply({approved:true,grantId:grant.grantId,
        browserSessionId:grant.browserSessionId,hostname:grant.hostname,
        expiresAt:new Date(grant.expiresAt).toISOString()});
    }
    if(action==="deny") {
      if(!uuidPattern.test(body.invitationRequestId||""))
        return reply({error:"INVALID_INVITATION_REQUEST"},422);
      state.hubPendingInvitations=(state.hubPendingInvitations||[]).filter(item=>
        item.invitationRequestId!==body.invitationRequestId);
      await this.save(state);
      return reply({denied:true});
    }
    if(action==="revoke") {
      if(!uuidPattern.test(body.grantId||"")||state.hubGrant?.grantId!==body.grantId)
        return reply({error:"HUB_GRANT_NOT_FOUND"},404);
      state.hubGrant=null;
      if(state.controller==="HUB"){state.controller="BIG";state.mode="OBSERVE";}
      if(state.job?.originRole==="HUB"&&state.job.status==="RUNNING") {
        state.status="STOP_REQUESTED";state.job.status="STOP_REQUESTED";
      }
      await this.save(state);
      return reply({revoked:true});
    }
    return reply({error:"INVALID_HUB_INVITATION_ACTION"},422);
  }
  async handleHubRequest(request,path) {
    const nameForPath=Object.entries(HUB_PATHS).find(([,routePath])=>routePath===path)?.[0];
    if(!nameForPath)return reply({error:"NOT_FOUND"},404);
    const method=request.method;
    const body=method==="POST"?await bodyOf(request):{};
    if(method!==HUB_METHODS[nameForPath])return reply({error:"METHOD_NOT_ALLOWED"},405);
    const validated=await this.validateHubContext(request,path,body);
    if(validated.error)return reply({status:validated.error},403);
    const context=validated.context;
    if(context.name!==nameForPath)return reply({status:"HUB_CONTEXT_INVALID"},403);
    const replay=await this.consumeHubRequest(context);
    if(replay)return reply({status:replay.error},409);

    let state=await this.state();
    if(nameForPath==="observatory_session"&&context.grantId===null) {
      const bootstrap=await this.hubBootstrap(state,context);
      if(bootstrap.response)return bootstrap.response;
      state=bootstrap.state;
      const grant=bootstrap.grant;
      return reply({
        ...summarize(state),
        browserSessionId:grant.browserSessionId,
        grantId:grant.grantId,
        pageHost:grant.hostname,
      });
    }
    const grantError=await this.hubGrantFailure(state,context);
    if(grantError)return reply({status:grantError},403);
    if(!state.browserSessionId)return reply({status:"SESSION_MISMATCH"},409);

    try {
      if(nameForPath==="observatory_session")
        return reply({...summarize(await this.reconcileBrowserSession(state)),
          browserSessionId:state.browserSessionId,grantId:state.hubGrant.grantId,
          pageHost:state.hubGrant.hostname});
      if(nameForPath==="observatory_observe")
        return reply(await this.observe(state,"HUB",context));
      if(nameForPath==="observatory_screenshot") {
        return reply(await this.withPage(state,async page=>{
          if(!sameHubGrant(state,context)||publicSiteHost(page.url())!==state.hubGrant.hostname)
            throw new Error("HOST_NOT_GRANTED");
          const raw=await page.screenshot({type:"jpeg",quality:52,fullPage:false});
          const bytes=new Uint8Array(raw);
          if(bytes.byteLength>512000)throw new Error("SCREENSHOT_TOO_LARGE");
          return {mimeType:"image/jpeg",image:Buffer.from(bytes).toString("base64"),
            observedAt:new Date().toISOString()};
        }));
      }
      if(nameForPath==="observatory_job")
        return reply({job:state.job?.originRole==="HUB"?state.job:null});
      if(nameForPath==="observatory_note") {
        if(typeof body.message!=="string"||body.message.trim().length<1||body.message.length>240)
          return reply({error:"INVALID_GO_NOTE"},422);
        state.note={message:body.message.trim(),at:new Date().toISOString()};
        await this.save(state);
        return reply({saved:true,version:state.version});
      }
      if(nameForPath==="observatory_action") {
        if(this.inFlight||state.mode==="HEADLESS")return reply({error:"BUSY"},409);
        if(state.controller!=="HUB")return reply({error:"OWNER_CONTROL_REQUIRED"},403);
        if(!allowedAction(body))return reply({error:"ACTION_NOT_ALLOWED"},422);
        this.inFlight=true;
        try{return reply(await this.action(state,body,"HUB",context));}
        finally{this.inFlight=false;}
      }
      if(nameForPath==="observatory_run") {
        if(state.controller!=="HUB"||!state.hubGrant)
          return reply({error:"OWNER_CONTROL_REQUIRED"},403);
        if(!Array.isArray(body.steps)||body.steps.length<1||body.steps.length>10||
            !body.steps.every(allowedAction)||!uuidPattern.test(body.requestId||""))
          return reply({error:"INVALID_STEPS"},422);
        if(body.steps.some(step=>step.type==="navigate"&&
            publicSiteHost(step.url)!==state.hubGrant.hostname))
          return reply({error:"HOST_NOT_GRANTED"},403);
        if(this.inFlight)return reply({error:"BUSY"},409);
        this.inFlight=true;
        try {
          const pending=await this.enqueue(state,"HUB_SCRIPT",body.steps.map(cleanStep),
            body.requestId,{
              issuer:context.issuer,audience:context.audience,subject:context.subject,
              browserSessionId:context.browserSessionId,grantId:context.grantId,
              expiresAt:context.expiresAt,
            });
          return reply(pending,202);
        } finally {this.inFlight=false;}
      }
      return reply({error:"NOT_FOUND"},404);
    } catch(error) {
      const safe=new Set(["SESSION_NOT_STARTED","SESSION_UNAVAILABLE","EXACT_PAGE_UNAVAILABLE",
        "CONTROLLER_MISMATCH","HOST_NOT_GRANTED","HUB_GRANT_HOST_MISMATCH",
        "SENSITIVE_ACTION_NEEDS_OWNER","PROTECTED_INPUT","HTTPS_PUBLIC_URL_REQUIRED",
        "SCREENSHOT_TOO_LARGE","JOB_ALREADY_RUNNING"]);
      return reply({status:safe.has(error?.message)?error.message:"HUB_REQUEST_FAILED"},400);
    }
  }

  /** A persisted RUNNING flag is not proof Browser Run still owns that session.
   * Read provider session IDs before claiming liveness; never launch on a GET.
   * An unavailable provider must not trigger destructive cleanup.
   */
  async reconcileBrowserSession(state, force=false) {
    const sessionId=state.browserSessionId;
    if(!sessionId || ["RUNNING","STOP_REQUESTED"].includes(state.job?.status))
      return state; // Never bypass the durable work queue's UNKNOWN/no-replay rules.
    if(!force && this.sessionProbe?.id===sessionId &&
        Date.now()-this.sessionProbe.at<15000) return state;
    let sessions;
    try {sessions=await puppeteer.sessions(this.env.BROWSER);}
    catch {return state;} // Unknown provider state is not evidence of expiry.
    if(!Array.isArray(sessions) ||
        !sessions.every(s=>s && typeof s.sessionId==="string")) return state;
    this.sessionProbe={id:sessionId,at:Date.now()};
    if(sessions.some(s=>s.sessionId===sessionId)) return state;
    const fresh=await this.state();
    if(fresh.browserSessionId!==sessionId) return fresh;
    fresh.lastClosedSessionId=sessionId;
    fresh.browserSessionId=null;fresh.targetId=null;
    fresh.controller="BIG";fresh.mode="IDLE";fresh.status="EXPIRED";
    fresh.allowGoRead=false;fresh.grantedHost=null;fresh.note=null;
    fresh.hubGrant=null;fresh.hubPendingInvitations=[];
    await this.save(fresh);
    return fresh;
  }

  async withPage(state, work) {
    if (!state.browserSessionId) throw new Error("SESSION_NOT_STARTED");
    let browser;
    try {
      try {browser=await puppeteer.connect(this.env.BROWSER, state.browserSessionId);}
      catch(error) {throw Object.assign(new Error("SESSION_UNAVAILABLE"),{
        sessionExpired:/session.*(?:closed|not found|does not exist)|browser.*disconnect|Target closed/i.test(String(error))
      });}
      let pages;
      try {pages=await browser.pages();} catch {throw new Error("SESSION_UNAVAILABLE");}
      const page=state.targetId ? pages.find(p => p.target()._targetId === state.targetId) : null;
      if (!page) throw new Error("EXACT_PAGE_UNAVAILABLE");
      return await work(page);
    } catch (error) {
      if (error.sessionExpired===true || /session.*(?:closed|not found|does not exist)|browser.*disconnect|ECONN|Target closed/i.test(String(error))) {
        const fresh=await this.state();
        if(fresh.browserSessionId===state.browserSessionId){
          fresh.status="EXPIRED";fresh.controller="BIG";fresh.mode="IDLE";
          fresh.allowGoRead=false;fresh.grantedHost=null;
          fresh.hubGrant=null;fresh.hubPendingInvitations=[];
          await this.save(fresh);
        }
      }
      throw error;
    } finally { if (browser) await browser.disconnect().catch(()=>{}); }
  }
  /** Read the actual Cloudflare tab origin before any new owner permission.
   * Owner-initiated browsing may redirect (google.com -> www.google.com).
   */
  async refreshPageAddress(state) {
    if(!state.browserSessionId)throw Error("SESSION_NOT_STARTED");
    const actual=await this.withPage(state,page=>page.url());
    const current=validPageUrl(actual);
    if(!current)throw Error("CURRENT_PAGE_NOT_PUBLIC_HTTPS");
    if(current!==state.url){
      state.url=current;
      if(state.hubGrant&&publicSiteHost(current)!==state.hubGrant.hostname) {
        state.hubGrant=null;
        if(state.controller==="HUB"){state.controller="BIG";state.mode="OBSERVE";}
      }
      if(!sameGrant(state)){
        state.allowGoRead=false;state.grantedHost=null;
        if(state.controller==="GO"){state.controller="BIG";state.mode="OBSERVE";}
      }
      await this.save(state);
    }
    return state;
  }
  async observe(state,role,hubContext=null) {
    return this.withPage(state, async page => {
      if(role==="GO" && !sameGrant(state,page.url()))throw new Error("OBSERVE_GRANT_ORIGIN_MISMATCH");
      if(role==="HUB"&&(!sameHubGrant(state,hubContext)||
          publicSiteHost(page.url())!==state.hubGrant.hostname))throw new Error("HOST_NOT_GRANTED");
      const snapshot=await page.evaluate(() => ({
        title:document.title,
        url:location.href,
        text:(document.body?.innerText || "").slice(0,8000),
        controls:[...document.querySelectorAll("button,a,input,select,textarea")]
          .filter(x => x.getBoundingClientRect().width > 0 && x.getBoundingClientRect().height > 0)
          .slice(0,45).map(x => ({
            tag:x.tagName.toLowerCase(),
            label:(x.getAttribute("aria-label") || x.innerText || x.getAttribute("placeholder") || "").trim().slice(0,100),
            type:x.getAttribute("type") || ""
          })).filter(x => !["password","hidden"].includes(x.type))
      }));
      const current=await this.state();
      const browserUrl=validPageUrl(snapshot.url);
      if(browserUrl && browserUrl!==current.url) {
        if(role==="HUB"&&publicSiteHost(browserUrl)!==current.hubGrant?.hostname) {
          current.hubGrant=null;
          if(current.controller==="HUB"){current.controller="BIG";current.mode="OBSERVE";}
          await this.save(current);
          throw new Error("HUB_GRANT_HOST_MISMATCH");
        }
        current.url=browserUrl;
        if(!sameGrant(current,browserUrl)){
          current.allowGoRead=false;current.grantedHost=null;
          if(current.controller==="GO"){current.controller="BIG";current.mode="OBSERVE";}
        }
        await this.save(current);
      }
      return {...snapshot,version:current.version,observedAt:new Date().toISOString()};
    });
  }
  async action(state, raw, role,hubContext=null) {
    const step=cleanStep(raw);
    if (state.controller!==role) throw new Error("CONTROLLER_MISMATCH");
    if (role==="GO" && (!mayGoUseSite(state.url,this.env.GO_ALLOWED_HOSTS,state.sitePermissions) || !sameGrant(state))) throw new Error("GO_DOMAIN_NOT_ALLOWED");
    if (step.type==="navigate" && role==="GO" && !mayGoUseSite(step.url,this.env.GO_ALLOWED_HOSTS,state.sitePermissions)) throw new Error("GO_DOMAIN_NOT_ALLOWED");
    if(role==="HUB"&&(!sameHubGrant(state,hubContext)||
        !mayGoUseSite(state.url,this.env.GO_ALLOWED_HOSTS,state.sitePermissions)))throw new Error("HOST_NOT_GRANTED");
    if(step.type==="navigate"&&role==="HUB"&&
        (publicSiteHost(step.url)!==state.hubGrant.hostname||
         !mayGoUseSite(step.url,this.env.GO_ALLOWED_HOSTS,state.sitePermissions)))
      throw new Error("HOST_NOT_GRANTED");
    return this.withPage(state, async page => {
      if(role==="GO" && (!sameGrant(state,page.url()) ||
        (step.type==="navigate" && new URL(step.url).hostname!==state.grantedHost)))throw new Error("GO_GRANT_ORIGIN_MISMATCH");
      if(role==="HUB"&&(!sameHubGrant(state,hubContext)||
          publicSiteHost(page.url())!==state.hubGrant.hostname))throw new Error("HOST_NOT_GRANTED");
      switch(step.type) {
        case "navigate": await page.goto(step.url,{waitUntil:"domcontentloaded",timeout:20000});break;
        case "back": await page.goBack({waitUntil:"domcontentloaded",timeout:20000});break;
        case "forward": await page.goForward({waitUntil:"domcontentloaded",timeout:20000});break;
        case "reload": await page.reload({waitUntil:"domcontentloaded",timeout:20000});break;
        case "scroll": await scrollRemotePage(page,step.y);break;
        case "click": {
          const risk=await page.$eval(step.selector, el => ({
            text:(el.innerText || el.getAttribute("aria-label") || el.value || "").slice(0,160),
            type:el.getAttribute("type") || "",form:!!el.closest("form"),contenteditable:el.isContentEditable
          }));
          if (/pay|buy|purchase|delete|remove|submit|confirm|transfer|checkout|sign out|logout|send|ยืนยัน|ชำระ|ลบ|ส่ง/i.test(risk.text) || risk.form || risk.type==="submit" || risk.contenteditable) throw new Error("SENSITIVE_ACTION_NEEDS_OWNER");
          await page.click(step.selector);break;
        }
        case "type": {
          const type=await page.$eval(step.selector, el => el.getAttribute("type") || "text");
          if (["password","hidden","file"].includes(type)) throw new Error("PROTECTED_INPUT");
          await page.$eval(step.selector, el => { el.value=""; el.dispatchEvent(new Event("input",{bubbles:true}));});
          await page.type(step.selector,step.value,{delay:20});break;
        }
      }
      const latest=await this.state(); // Preserve a BIG takeover that occurred during a slow navigation.
      latest.url=validPageUrl(page.url()) || latest.url;
      if(role==="HUB"&&(!sameHubGrant(latest,hubContext)||
          publicSiteHost(latest.url)!==latest.hubGrant?.hostname)) {
        latest.hubGrant=null;
        if(latest.controller==="HUB"){latest.controller="BIG";latest.mode="OBSERVE";}
        await this.save(latest);
        throw new Error("HUB_GRANT_HOST_MISMATCH");
      }
      if(!sameGrant(latest)) {
        latest.allowGoRead=false;latest.grantedHost=null;
        if(latest.controller==="GO"){latest.controller="BIG";latest.mode="OBSERVE";}
      }
      await this.save(latest);
      return {ok:true,type:step.type,url:latest.url,version:latest.version,at:new Date().toISOString()};
    });
  }
  async beginSession(raw) {
    const url=validPageUrl(raw.url || "https://shop.yggmetro.com/");
    if (!url) throw new Error("HTTPS_PUBLIC_URL_REQUIRED");
    const recording=raw.recording===true;
    let state=await this.reconcileBrowserSession(await this.state(),true);
    if (state.browserSessionId && state.url &&
        (new URL(state.url).hostname!==new URL(url).hostname || !!state.recording!==recording)) {
      // Restrict a Browser Run session to its original domain; a new site receives a fresh session
      // with host-specific network guardrails, so redirects cannot reach internal hosts.
      await this.closeSession(state);
      state=await this.state();
    }
    if (state.browserSessionId) {
      try {
        const finalUrl=await this.withPage(state,async page=>{
          await page.goto(url,{waitUntil:"domcontentloaded",timeout:20000});return validPageUrl(page.url()) || url;
        });
        state.controller="BIG";state.mode="OBSERVE";state.status="RUNNING";state.url=finalUrl;state.allowGoRead=false;state.grantedHost=null;state.note=null;await this.save(state);
        return summarize(state);
      } catch(error) {
        // Owner explicitly reopened a URL. Retire the old session before replacing
        // it; a missing target does not mean its browser has stopped billing/running.
        if(error.message!=="EXACT_PAGE_UNAVAILABLE" && error.sessionExpired!==true) throw error;
        try {await this.closeSession(state);} catch {throw new Error("SESSION_CLEANUP_FAILED");}
        state=await this.state();
      }
    }
    const host=new URL(url).hostname;
    const extras=String(this.env.PUBLIC_ASSET_HOSTS || "").split(",")
      .map(s=>s.trim().toLowerCase()).filter(s=>/^[a-z0-9.-]+$/.test(s) && s.includes("."));
    const browser=await puppeteer.launch(this.env.BROWSER,{
      keep_alive:600000,
      guardrails:{allowedDomains:[host,`*.${host}`,...extras]},
      recording
    });
    try {
      const page=(await browser.pages())[0] || await browser.newPage();
      await page.goto(url,{waitUntil:"domcontentloaded",timeout:20000});
      state={...state,browserSessionId:browser.sessionId(),targetId:page.target()._targetId || null,
        controller:"BIG",mode:"OBSERVE",status:"RUNNING",url:validPageUrl(page.url()) || url,allowGoRead:false,grantedHost:null,job:null,
        note:null,recording,lastClosedSessionId:state.lastClosedSessionId||null,
        hubGrant:null,hubPendingInvitations:[]};
      await this.save(state);return summarize(state);
    } finally { await browser.disconnect().catch(()=>{}); }
  }
  async closeSession(state) {
    if(state.job?.status==="RUNNING" || state.job?.status==="STOP_REQUESTED")throw new Error("STOP_JOB_BEFORE_CLOSING");
    state=await this.reconcileBrowserSession(state,true);
    if(state.browserSessionId){
      try {
        const browser=await puppeteer.connect(this.env.BROWSER,state.browserSessionId);
        await browser.close();
      } catch(e){
        if(!/session.*(?:closed|not found|does not exist)|browser.*disconnect|Target closed/i.test(String(e)))
          throw e;
      }
    }
    state.lastClosedSessionId=state.browserSessionId;
    state.browserSessionId=null;state.targetId=null;state.controller="BIG";state.note=null;
    state.allowGoRead=false;state.grantedHost=null;state.mode="IDLE";state.status="CLOSED";
    state.hubGrant=null;state.hubPendingInvitations=[];
    await this.save(state);return summarize(state);
  }
  async view(state) {
    const url=await this.withPage(state,async page => {
      let cdp;
      try {cdp=await page.createCDPSession();} catch {throw new Error("LIVE_VIEW_CDP_UNAVAILABLE");}
      try {const result=await cdp.send("Cloudflare.getLiveView",{mode:"tab",expiresInMs:300000});return result.devtoolsFrontendUrl;}
      catch {throw new Error("LIVE_VIEW_PROVIDER_ERROR");}
      finally {await cdp.detach().catch(()=>{});}
    });
    let parsed;try {parsed=new URL(url);} catch {throw new Error("LIVE_VIEW_UNAVAILABLE");}
    if (parsed.protocol!=="https:" || parsed.hostname!=="live.browser.run" || parsed.username || parsed.password || parsed.port) throw new Error("LIVE_VIEW_UNAVAILABLE");
    return {url,validForStartMs:300000,warning:"View URL grants access. Never log or share it."};
  }

  /** Durable source-owned work queue; DO alarms wake after the client disconnects.
   * Persist DISPATCHING *before* a step. If runtime resets mid-click, mark UNKNOWN
   * instead of replaying an action that might have succeeded on the website.
   */
  async enqueue(state,kind,items,requestId,hubPrincipal=null) {
    const repeat=state.recentRequests?.find(r=>r.requestId===requestId);
    if(repeat) return {jobId:repeat.jobId,status:"ALREADY_ACCEPTED",duplicate:true};
    if(["RUNNING","STOP_REQUESTED"].includes(state.job?.status) || state.mode==="HEADLESS")
      throw new Error("JOB_ALREADY_RUNNING");
    const job={id:crypto.randomUUID(),kind,status:"RUNNING",startedAt:new Date().toISOString(),
      progress:0,total:items.length,results:[],requestId,
      originRole:kind==="GO_SCRIPT"?"GO":kind==="HUB_SCRIPT"?"HUB":"BIG"};
    state.job=job;state.mode="HEADLESS";state.status="RUNNING";
    // A page audit is read-only and needs no GO observer grant; GO scripts require
    // the explicit scoped session grant throughout their entire execution.
    if(kind==="PAGE_AUDIT"){state.controller="BIG";state.allowGoRead=false;state.grantedHost=null;}
    state.recentRequests=[...(state.recentRequests||[]).slice(-19),{requestId,jobId:job.id}];
    await this.ctx.storage.put("pending-job",{
      jobId:job.id,kind,items,index:0,phase:"READY",
      ...(kind==="HUB_SCRIPT"?{hubPrincipal}:{}),
    });
    await this.save(state);
    await this.ctx.storage.setAlarm(Date.now()+500);
    return {jobId:job.id,status:"RUNNING",total:items.length};
  }
  async finishJob(status,error=null) {
    const current=await this.state();
    const job=current.job;if(!job)return;
    job.status=status;job.finishedAt=new Date().toISOString();
    if(error)job.error=error;
    current.job=job;
    current.status=status;current.mode="OBSERVE";current.controller="BIG";
    if(job.originRole==="GO") {current.allowGoRead=false;current.grantedHost=null;}
    await this.save(current);
    await this.ctx.storage.delete("pending-job");
  }
  async passkeyCredentials() {
    return await this.ctx.storage.get("owner-passkeys") || [];
  }
  async storePasskeyFlow(flowId,flow) {
    const pending=await this.ctx.storage.list({prefix:"passkey-flow:",limit:100});
    for(const [key,value] of pending) {
      if(!value || value.expiresAt<=Date.now())await this.ctx.storage.delete(key);
    }
    const active=[...pending.values()].filter(value=>value?.expiresAt>Date.now()).length;
    if(active>=16)return false;
    await this.ctx.storage.put(`passkey-flow:${flowId}`,flow);
    return true;
  }
  async passkeyFlow(flowId,purpose,request) {
    if(!passkeyUtils.validFlowId(flowId))return null;
    const key=`passkey-flow:${flowId}`;
    const flow=await this.ctx.storage.get(key);
    await this.ctx.storage.delete(key);
    if(!flow || flow.purpose!==purpose || flow.expiresAt<Date.now())return null;
    const url=new URL(request.url);
    if(url.protocol!=="https:" || flow.origin!==url.origin || flow.rpId!==url.hostname)return null;
    return flow;
  }
  async passkeyAuth(request,role,path) {
    const method=request.method;
    const body=method==="POST"?await bodyOf(request):{};
    const credentials=await this.passkeyCredentials();

    if(path==="/_auth/passkey/status" && method==="POST" && role==="BIG") {
      return reply({credentials:credentials.map(item=>({
        id:item.id,label:item.label,createdAt:item.createdAt,
        deviceType:item.deviceType,backedUp:item.backedUp,
      }))});
    }
    if(path==="/_auth/passkey/register/options" && method==="POST" && role==="BIG") {
      if(credentials.length>=10)return reply({error:"PASSKEY_LIMIT_REACHED"},409);
      const url=new URL(request.url);
      if(url.protocol!=="https:" || !body.label ||
          typeof body.label!=="string" || body.label.trim().length>40)
        return reply({error:"INVALID_PASSKEY_LABEL"},422);
      let userId=await this.ctx.storage.get("passkey-user-id");
      if(!userId) {
        userId=passkeyUtils.randomBase64Url();
        await this.ctx.storage.put("passkey-user-id",userId);
      }
      const options=await webauthn.generateRegistrationOptions({
        rpName:"YGG Observatory",
        rpID:url.hostname,
        userName:"BIG",
        userDisplayName:"Observatory owner",
        userID:passkeyUtils.base64UrlToBytes(userId),
        timeout:120000,
        attestationType:"none",
        authenticatorSelection:{residentKey:"preferred",userVerification:"required"},
        excludeCredentials:credentials.map(item=>({
          id:item.id,transports:item.transports,
        })),
      });
      if(!passkeyUtils.validFlowId(body.flowId))return reply({error:"INVALID_PASSKEY_FLOW"},422);
      const stored=await this.storePasskeyFlow(body.flowId,{
        purpose:"register",challenge:options.challenge,origin:url.origin,rpId:url.hostname,
        label:body.label.trim(),expiresAt:Date.now()+passkeyUtils.PASSKEY_FLOW_TTL_MS,
      });
      if(!stored)return reply({error:"PASSKEY_BUSY"},429);
      return reply(options);
    }
    if(path==="/_auth/passkey/register/verify" && method==="POST" && role==="BIG") {
      const flow=await this.passkeyFlow(body.flowId,"register",request);
      if(!flow)return reply({error:"PASSKEY_FLOW_EXPIRED"},400);
      let verification;
      try {
        verification=await webauthn.verifyRegistrationResponse({
          response:body.credential,
          expectedChallenge:flow.challenge,
          expectedOrigin:flow.origin,
          expectedRPID:flow.rpId,
          requireUserVerification:true,
        });
      } catch {
        return reply({error:"PASSKEY_VERIFICATION_FAILED"},400);
      }
      if(!verification.verified || !verification.registrationInfo ||
          verification.registrationInfo.userVerified!==true)
        return reply({error:"PASSKEY_VERIFICATION_FAILED"},400);
      const info=verification.registrationInfo;
      const credential=info.credential;
      if(credentials.some(item=>item.id===credential.id))
        return reply({error:"PASSKEY_ALREADY_REGISTERED"},409);
      if(credentials.length>=10)return reply({error:"PASSKEY_LIMIT_REACHED"},409);
      const item={
        id:credential.id,
        publicKey:passkeyUtils.bytesToBase64Url(credential.publicKey),
        counter:credential.counter,
        transports:Array.isArray(body.credential?.response?.transports)
          ?body.credential.response.transports.filter(value=>typeof value==="string").slice(0,8)
          :[],
        deviceType:info.credentialDeviceType,
        backedUp:info.credentialBackedUp,
        label:flow.label,
        createdAt:new Date().toISOString(),
      };
      await this.ctx.storage.put("owner-passkeys",[...credentials,item]);
      return reply({registered:true,label:item.label,createdAt:item.createdAt});
    }
    if(path==="/_auth/passkey/login/options" && method==="POST" && role==="AUTH") {
      if(credentials.length===0)return reply({error:"PASSKEY_NOT_ENROLLED"},409);
      const url=new URL(request.url);
      if(url.protocol!=="https:" || !passkeyUtils.validFlowId(body.flowId))
        return reply({error:"INVALID_PASSKEY_FLOW"},422);
      const options=await webauthn.generateAuthenticationOptions({
        rpID:url.hostname,
        allowCredentials:credentials.map(item=>({
          id:item.id,transports:item.transports,
        })),
        timeout:120000,
        userVerification:"required",
      });
      const stored=await this.storePasskeyFlow(body.flowId,{
        purpose:"login",challenge:options.challenge,origin:url.origin,rpId:url.hostname,
        expiresAt:Date.now()+passkeyUtils.PASSKEY_FLOW_TTL_MS,
      });
      if(!stored)return reply({error:"PASSKEY_BUSY"},429);
      return reply(options);
    }
    if(path==="/_auth/passkey/login/verify" && method==="POST" && role==="AUTH") {
      const flow=await this.passkeyFlow(body.flowId,"login",request);
      if(!flow)return reply({error:"PASSKEY_FLOW_EXPIRED"},400);
      const response=body.credential;
      const credential=credentials.find(item=>item.id===response?.id);
      if(!credential)return reply({error:"PASSKEY_NOT_FOUND"},401);
      let verification;
      try {
        verification=await webauthn.verifyAuthenticationResponse({
          response,
          expectedChallenge:flow.challenge,
          expectedOrigin:flow.origin,
          expectedRPID:flow.rpId,
          requireUserVerification:true,
          credential:{
            id:credential.id,
            publicKey:passkeyUtils.base64UrlToBytes(credential.publicKey),
            counter:credential.counter,
            transports:credential.transports,
          },
        });
      } catch {
        return reply({error:"PASSKEY_VERIFICATION_FAILED"},401);
      }
      if(!verification.verified ||
          verification.authenticationInfo?.userVerified!==true ||
          verification.authenticationInfo.credentialID!==credential.id)
        return reply({error:"PASSKEY_VERIFICATION_FAILED"},401);
      const updated=credentials.map(item=>item.id===credential.id
        ?{...item,counter:verification.authenticationInfo.newCounter,
          deviceType:verification.authenticationInfo.credentialDeviceType,
          backedUp:verification.authenticationInfo.credentialBackedUp}
        :item);
      await this.ctx.storage.put("owner-passkeys",updated);
      const sessionId=passkeyUtils.randomBase64Url();
      const key=await passkeyUtils.sha256Base64Url(sessionId);
      const expiresAt=Date.now()+passkeyUtils.PASSKEY_SESSION_TTL_SECONDS*1000;
      await this.ctx.storage.put(`passkey-session:${key}`,{
        expiresAt,credentialId:credential.id,
      });
      return reply({authenticated:true,sessionId,expiresAt:new Date(expiresAt).toISOString()});
    }
    if(path==="/_auth/session/verify" && method==="POST" && role==="AUTH") {
      if(!/^[A-Za-z0-9_-]{43}$/u.test(body.sessionId||""))return reply({valid:false});
      const key=await passkeyUtils.sha256Base64Url(body.sessionId);
      const storageKey=`passkey-session:${key}`;
      const session=await this.ctx.storage.get(storageKey);
      if(!session || session.expiresAt<=Date.now()) {
        if(session)await this.ctx.storage.delete(storageKey);
        return reply({valid:false});
      }
      if(!(await this.passkeyCredentials()).some(item=>item.id===session.credentialId)) {
        await this.ctx.storage.delete(storageKey);
        return reply({valid:false});
      }
      return reply({valid:true,credentialId:session.credentialId,
        expiresAt:new Date(session.expiresAt).toISOString()});
    }
    if(path==="/_auth/session/revoke" && method==="POST" && role==="AUTH") {
      if(/^[A-Za-z0-9_-]{43}$/u.test(body.sessionId||"")) {
        const key=await passkeyUtils.sha256Base64Url(body.sessionId);
        await this.ctx.storage.delete(`passkey-session:${key}`);
      }
      return reply({revoked:true});
    }
    if(path==="/_auth/passkey/remove" && method==="POST" && role==="BIG") {
      if(typeof body.id!=="string")return reply({error:"INVALID_PASSKEY_ID"},422);
      const remaining=credentials.filter(item=>item.id!==body.id);
      if(remaining.length===credentials.length)return reply({error:"PASSKEY_NOT_FOUND"},404);
      await this.ctx.storage.put("owner-passkeys",remaining);
      // Removing an authenticator also ends existing passkey sessions.
      const sessions=await this.ctx.storage.list({prefix:"passkey-session:"});
      await this.ctx.storage.delete([...sessions.keys()]);
      return reply({removed:true,remaining:remaining.length});
    }
    return reply({error:"NOT_FOUND"},404);
  }
  async alarm() {
    const pending=await this.ctx.storage.get("pending-job");
    if(!pending)return;
    const state=await this.state();
    if(!state.job || state.job.id!==pending.jobId){await this.ctx.storage.delete("pending-job");return;}
    if(state.status==="STOP_REQUESTED" || state.job.status==="STOP_REQUESTED"){
      await this.finishJob("STOPPED");return;
    }
    if(pending.phase!=="READY") {
      await this.finishJob("UNKNOWN","PREVIOUS_ACTION_OUTCOME_UNKNOWN_NO_REPLAY");
      return;
    }
    if(pending.kind==="GO_SCRIPT" && (state.controller!=="GO" || !sameGrant(state))) {
      await this.finishJob("STOPPED","OWNER_GO_GRANT_REVOKED");return;
    }
    if(pending.kind==="HUB_SCRIPT"&&
        (state.controller!=="HUB"||await this.hubGrantFailure(state,pending.hubPrincipal))) {
      await this.finishJob("STOPPED","OWNER_HUB_GRANT_REVOKED");return;
    }
    pending.phase="DISPATCHING";
    await this.ctx.storage.put("pending-job",pending); // source-owned pre-dispatch evidence
    let receipt=null,err=null;
    try {
      const item=pending.items[pending.index];
      if(pending.kind==="GO_SCRIPT"){
        receipt=await this.action(state,item,"GO");
        receipt={...receipt,step:pending.index+1,dispatched:true,businessOutcome:"UNKNOWN"};
      } else if(pending.kind==="HUB_SCRIPT") {
        receipt=await this.action(state,item,"HUB",pending.hubPrincipal);
        receipt={...receipt,step:pending.index+1,dispatched:true,businessOutcome:"UNKNOWN"};
      } else {
        receipt=await this.withPage(state,async page=>{
          const response=await page.goto(item,{waitUntil:"domcontentloaded",timeout:20000});
          const details=await page.evaluate(()=>({
            title:document.title,links:document.querySelectorAll("a[href]").length,
            buttons:document.querySelectorAll("button").length
          }));
          return {step:pending.index+1,url:item,code:response?.status()??0,...details,
            at:new Date().toISOString(),businessOutcome:"READ_ONLY"};
        });
      }
    } catch(e){err=String(e?.message||e).slice(0,150);}
    const fresh=await this.state();
    if(fresh.job?.id!==pending.jobId){await this.ctx.storage.delete("pending-job");return;}
    const job=fresh.job;
    if(receipt)job.results.push(receipt);
    if(err)job.results.push({step:pending.index+1,error:err,at:new Date().toISOString()});
    job.progress=Math.min(job.total,pending.index+1);
    fresh.job=job;
    await this.save(fresh);
    let shouldStop=fresh.status==="STOP_REQUESTED" || (pending.kind==="GO_SCRIPT" &&
      (fresh.controller!=="GO" || !sameGrant(fresh)));
    if(pending.kind==="HUB_SCRIPT"&&(fresh.controller!=="HUB"||
        await this.hubGrantFailure(fresh,pending.hubPrincipal)))shouldStop=true;
    if(err || shouldStop || job.progress>=job.total){
      await this.finishJob(err?"FAILED":shouldStop?"STOPPED":"COMPLETED",err);
      return;
    }
    pending.index++;
    pending.phase="READY";
    await this.ctx.storage.put("pending-job",pending);
    await this.ctx.storage.setAlarm(Date.now()+1000);
  }
  async fetch(request) {
    const suppliedRole=request.headers.get("x-observatory-role");
    const role=["BIG","GO","HUB","AUTH"].includes(suppliedRole)?suppliedRole:"GO";
    const method=request.method,path=new URL(request.url).pathname;
    try {
      if(path.startsWith("/_auth/"))return await this.passkeyAuth(request,role,path);
      if(role==="HUB")return await this.handleHubRequest(request,path);
      const access=await this.state();
      if(role==="GO" && !sameGrant(access)) {
        if(method==="GET" && path==="/v1/job" && access.job?.originRole==="GO")
          return reply({job:access.job});
        if(method==="GET" && path==="/v1/session")
          return reply({sessionId:null,pageUrl:null,controller:"BIG",mode:"LOCKED",
            status:"OWNER_INVITATION_REQUIRED",goCanObserve:false,
            job:access.job?.originRole==="GO"
              ? {id:access.job.id,status:access.job.status,progress:access.job.progress,total:access.job.total}
              : null});
        return reply({error:"OWNER_HAS_NOT_INVITED_GO"},403);
      }
      if(path==="/v1/hub-invitations"&&role==="BIG") {
        if(method==="GET")return await this.ownerHubInvitationView(request);
        if(method==="POST")return await this.ownerHubInvitationMutation(request,await bodyOf(request));
        return reply({error:"METHOD_NOT_ALLOWED"},405);
      }
      // All mutations are owned by this Durable Object, and guarded against overlapping browser writes.
      if(method==="GET" && path==="/v1/site-permissions" && role==="BIG") {
        const state=await this.reconcileBrowserSession(await this.state());
        if(state.browserSessionId)await this.refreshPageAddress(state);
        // A closed browser cannot have an active origin or GO invitation.
        const visible=state.browserSessionId?state:{...state,url:null,allowGoRead:false,grantedHost:null};
        return reply(sitePermissionsView(visible,this.env.GO_ALLOWED_HOSTS));
      }
      if (method==="GET" && path==="/v1/session")
        return reply(summarize(await this.reconcileBrowserSession(await this.state())));
      if (method==="GET" && path==="/v1/job") return reply({job:(await this.state()).job || null});
      if (method==="GET" && path==="/v1/observe") return reply(await this.observe(await this.state(),role));
      if (method==="GET" && path==="/v1/screenshot") {
        const state=await this.state();
        return reply(await this.withPage(state,async page=>{
          if(role==="GO" && !sameGrant(state,page.url()))throw new Error("OBSERVE_GRANT_ORIGIN_MISMATCH");
          const raw=await page.screenshot({type:"jpeg",quality:52,fullPage:false});
          const bytes=new Uint8Array(raw);
          if(bytes.byteLength>512000)throw new Error("SCREENSHOT_TOO_LARGE");
          return {mimeType:"image/jpeg",image:Buffer.from(bytes).toString("base64"),
            observedAt:new Date().toISOString()};
        }));
      }
      if (method==="GET" && path==="/v1/view" && role==="BIG") {
        try {return reply(await this.view(await this.state()));}
        catch(error) {
          const codes={SESSION_NOT_STARTED:[409,"session"],SESSION_UNAVAILABLE:[503,"connect"],EXACT_PAGE_UNAVAILABLE:[409,"target"],LIVE_VIEW_CDP_UNAVAILABLE:[502,"cdp"],LIVE_VIEW_PROVIDER_ERROR:[502,"provider"],LIVE_VIEW_UNAVAILABLE:[502,"response"]};
          const code=Object.hasOwn(codes,error?.message)?error.message:"LIVE_VIEW_UNAVAILABLE";
          const [status,stage]=codes[code];
          return reply({error:code,stage,requestId:request.headers.get("x-request-id")},status);
        }
      }
      if(method!=="POST")return reply({error:"NOT_FOUND"},404);
      const body=await bodyOf(request),state=await this.state();
      if(path==="/v1/note" && role==="GO") {
        const message=body.message;
        if(typeof message!=="string" || message.trim().length<1 || message.length>240)return reply({error:"INVALID_NOTE"},422);
        if(!sameGrant(state))return reply({error:"NO_OWNER_INVITATION"},403);
        state.note={message:message.trim(),at:new Date().toISOString()};
        await this.save(state);return reply({saved:true,version:state.version});
      }
      if(path==="/v1/session" && role==="BIG") {
        if(this.inFlight || ["RUNNING","STOP_REQUESTED"].includes(state.job?.status))
          return reply({error:"BUSY"},409);
        this.inFlight=true;
        try {return reply(await this.beginSession(body));}finally{this.inFlight=false;}
      }
      if(path==="/v1/site-permissions" && role==="BIG") {
        if(this.inFlight || !["allow","revoke"].includes(body.action) ||
            typeof body.host!=="string")return reply({error:"INVALID_OR_BUSY_PERMISSION_REQUEST"},422);
        // The session owner approves only the tab origin actually on screen.
        if(body.action==="allow")await this.refreshPageAddress(state);
        updateOwnerSitePermission(state,body.action,body.host);
        if(body.action==="revoke"&&state.hubGrant?.hostname===body.host) {
          state.hubGrant=null;
          if(state.controller==="HUB"){state.controller="BIG";state.mode="OBSERVE";}
        }
        await this.save(state);
        return reply(sitePermissionsView(state,this.env.GO_ALLOWED_HOSTS));
      }
      if(path==="/v1/observe-access" && role==="BIG") {
        if(typeof body.allow !== "boolean" || !state.browserSessionId)
          return reply({error:"INVALID_OBSERVE_GRANT"},422);
        if(body.allow)await this.refreshPageAddress(state);
        if(body.allow && !mayGoUseSite(state.url,this.env.GO_ALLOWED_HOSTS,state.sitePermissions))
          return reply({error:"GO_DOMAIN_NOT_ALLOWED"},403);
        state.allowGoRead=body.allow;state.grantedHost=body.allow?new URL(state.url).hostname:null;
        if(!body.allow && state.controller==="GO") {state.controller="BIG";state.mode="OBSERVE";}
        await this.save(state);return reply(summarize(state));
      }
      if(path==="/v1/control" && role==="BIG") {
        if(this.inFlight)return reply({error:"BUSY"},409);
        const next=body.controller;
        if(!["BIG","GO","HUB"].includes(next))return reply({error:"INVALID_CONTROLLER"},422);
        if(state.mode==="HEADLESS" && next==="BIG"){
          state.status="STOP_REQUESTED";state.job.status="STOP_REQUESTED";
        }
        if(next==="GO")await this.refreshPageAddress(state);
        if(next==="HUB") {
          await this.refreshPageAddress(state);
          const ownerCredentialId=request.headers.get("x-observatory-owner-id");
          const grant=state.hubGrant;
          if(!await this.ownerCredentialIsActive(ownerCredentialId)||!grant||
              !sameHubGrant(state,grant)||
              !mayGoUseSite(state.url,this.env.GO_ALLOWED_HOSTS,state.sitePermissions))
            return reply({error:"OWNER_HUB_GRANT_REQUIRED"},403);
        }
        if(next==="GO" && !mayGoUseSite(state.url,this.env.GO_ALLOWED_HOSTS,state.sitePermissions)) return reply({error:"GO_DOMAIN_NOT_ALLOWED"},403);
        state.controller=next;state.mode=next==="GO"||next==="HUB"?"LIVE":"OBSERVE";
        if(next==="GO"){state.allowGoRead=true;state.grantedHost=new URL(state.url).hostname;}
        if(next==="BIG"){state.allowGoRead=false;state.grantedHost=null;}
        await this.save(state);return reply(summarize(state));
      }
      if(path==="/v1/action") {
        if(this.inFlight || state.mode==="HEADLESS")return reply({error:"BUSY"},409);
        if(!allowedAction(body))return reply({error:"ACTION_NOT_ALLOWED"},422);
        this.inFlight=true;
        try {return reply(await this.action(state,body,role));}finally{this.inFlight=false;}
      }
      if(path==="/v1/run" && (role==="BIG" || role==="GO")) {
        if(/^[0-9a-fA-F-]{36}$/.test(body.requestId||"")) {
          const prior=state.recentRequests?.find(x=>x.requestId===body.requestId);
          if(prior)return reply({jobId:prior.jobId,status:"ALREADY_ACCEPTED",duplicate:true},200);
        }
        if(this.inFlight || state.mode==="HEADLESS" || state.controller!=="GO" || !state.allowGoRead)
          return reply({error:"OWNER_GO_GRANT_REQUIRED"},403);
        if(!Array.isArray(body.steps) || body.steps.length===0 || body.steps.length>10 ||
          !body.steps.every(allowedAction))return reply({error:"INVALID_STEPS"},422);
        if(!mayGoUseSite(state.url,this.env.GO_ALLOWED_HOSTS,state.sitePermissions))return reply({error:"GO_DOMAIN_NOT_ALLOWED"},403);
        if(!/^[0-9a-fA-F-]{36}$/.test(body.requestId||""))return reply({error:"REQUEST_ID_UUID_REQUIRED"},422);
        if(body.steps.some(step=>step.type==="navigate" && new URL(step.url).hostname!==state.grantedHost))
          return reply({error:"GO_GRANT_ORIGIN_MISMATCH"},403);
        if(this.inFlight)return reply({error:"BUSY"},409);
        this.inFlight=true;
        try{return reply(await this.enqueue(state,"GO_SCRIPT",body.steps.map(cleanStep),body.requestId),202);}
        finally{this.inFlight=false;}
      }
      if(path==="/v1/audit" && role==="BIG") {
        if(this.inFlight || ["RUNNING","STOP_REQUESTED"].includes(state.job?.status) ||
          state.mode==="HEADLESS" || !state.browserSessionId)return reply({error:"BUSY_OR_NO_SESSION"},409);
        const urls=Array.isArray(body.urls) ? body.urls.slice(0,4).map(validPageUrl) : [validPageUrl(state.url)];
        if(urls.some(x=>!x || !mayGoUseSite(x,this.env.GO_ALLOWED_HOSTS,state.sitePermissions)))return reply({error:"URL_NOT_ALLOWED"},422);
        if(this.inFlight)return reply({error:"BUSY"},409);
        this.inFlight=true;
        try {return reply(await this.enqueue(state,"PAGE_AUDIT",urls,
          /^[0-9a-fA-F-]{36}$/.test(body.requestId||"")?body.requestId:crypto.randomUUID()),202);}
        finally{this.inFlight=false;}
      }
      if(path==="/v1/close" && role==="BIG") {
        if(this.inFlight)return reply({error:"BUSY"},409);
        this.inFlight=true;
        try{return reply(await this.closeSession(state));}finally{this.inFlight=false;}
      }
      if(path==="/v1/stop" && role==="BIG") {
        const st=await this.state();
        if(!st.job || !["RUNNING","STOP_REQUESTED"].includes(st.job.status))
          return reply({error:"NO_ACTIVE_JOB"},409);
        st.allowGoRead=false;st.grantedHost=null;
        st.controller="BIG";st.status="STOP_REQUESTED";
        if(st.job?.status==="RUNNING")st.job.status="STOP_REQUESTED";
        await this.save(st);
        return reply(summarize(st));
      }
      return reply({error:"NOT_FOUND"},404);
    }catch(error) {
      const safe=new Set(["BODY_TOO_LARGE","SESSION_NOT_STARTED","SESSION_UNAVAILABLE","SESSION_CLEANUP_FAILED","EXACT_PAGE_UNAVAILABLE",
        "OBSERVE_GRANT_ORIGIN_MISMATCH","CONTROLLER_MISMATCH","GO_DOMAIN_NOT_ALLOWED","GO_GRANT_ORIGIN_MISMATCH",
        "SENSITIVE_ACTION_NEEDS_OWNER","PROTECTED_INPUT","HTTPS_PUBLIC_URL_REQUIRED","STOP_JOB_BEFORE_CLOSING",
        "JOB_ALREADY_RUNNING","SCREENSHOT_TOO_LARGE"]);
      return reply({error:safe.has(error?.message)?error.message:"REQUEST_FAILED"},400);
    }
  }
}


// Private RPC entrypoint: Cloudflare Service Bindings only. NOT an HTTP endpoint.
// GO Brain authenticates the owner's existing OAuth session, then calls this.
// The owner additionally grants page observation/control in BrowserWorkspace.
export class ObservatoryGoBridge extends WorkerEntrypoint {
  async invoke(name,args={}) {
    return invokeObservatoryGo(this.env,name,args);
  }
}

// Private Hub RPC. The Hub Access assertion is independently verified before
// the Durable Object receives a signed-claim-derived internal context.
export class ObservatoryHubBridge extends WorkerEntrypoint {
  async invoke(name,args={},context={}) {
    return invokeObservatoryHub(this.env,name,args,context);
  }
}
