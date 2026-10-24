import puppeteer from "@cloudflare/puppeteer";
import { validPageUrl, allowedAction, mayGoAct, cleanStep } from "./policy.mjs";
import { mcpResponse } from "./mcp.mjs";
import { consoleHtml } from "./console.mjs";
import { WorkerEntrypoint } from "cloudflare:workers";
import { invokeObservatoryGo } from "./go-bridge.mjs";
import { scrollRemotePage } from "./scroll.mjs";

const HEADERS = { "content-type":"application/json; charset=utf-8", "cache-control":"no-store", "x-content-type-options":"nosniff" };
function reply(body, code=200) { return new Response(JSON.stringify(body), { status:code, headers:HEADERS }); }
async function bodyOf(request) {
  if (+(request.headers.get("content-length") || 0) > 12000) throw new Error("BODY_TOO_LARGE");
  const text=await request.text();
  if (text.length > 12000) throw new Error("BODY_TOO_LARGE");
  return text ? JSON.parse(text) : {};
}
function sameGrant(s,url=s.url) {
  try {return s.allowGoRead===true && !!s.grantedHost && new URL(url).hostname===s.grantedHost;}
  catch {return false;}
}
function summarize(s) {
  return { sessionId:s.browserSessionId || null, pageUrl:s.url || null,
    controller:s.controller || "BIG", mode:s.mode || "IDLE", status:s.status || "IDLE", goCanObserve:sameGrant(s),
    note:s.note || null,
    recording:!!s.recording, lastClosedSessionId:s.lastClosedSessionId || null,
    version:s.version || 0, updatedAt:s.updatedAt || null, job:s.job || null };
}
export default {
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
    const owner=authorization==="Bearer "+env.OWNER_TOKEN;
    const go=!!env.GO_TOKEN && env.GO_TOKEN!==env.OWNER_TOKEN && authorization==="Bearer "+env.GO_TOKEN;
    if (!owner && !go) return reply({ error:"UNAUTHORIZED" },401);
    const id=env.SESSIONS.idFromName("owner-browser-v1");
    const stub=env.SESSIONS.get(id);
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
    if (!path.startsWith("/v1/")) return reply({error:"NOT_FOUND"},404);
    if (go && !["/v1/session","/v1/observe","/v1/screenshot","/v1/action","/v1/job","/v1/run","/v1/note"].includes(path)) return reply({error:"OWNER_ONLY"},403);
    const upstream=new Request(request,{headers:{"x-observatory-role":owner?"BIG":"GO","content-type":"application/json"}});
    const result=await stub.fetch(upstream);
    // A DO receives role from a trusted internal request, never a client-supplied header.
    return result;
  }
};

export class BrowserWorkspace {
  constructor(ctx, env) { this.ctx=ctx; this.env=env; this.inFlight=false; this.cancelAudit=false; }
  async state() {
    return (await this.ctx.storage.get("browser")) ||
      {controller:"BIG",mode:"IDLE",status:"IDLE",version:0,allowGoRead:false,recentRequests:[]};
  }
  async save(state) { state.version=(state.version || 0)+1;state.updatedAt=new Date().toISOString();await this.ctx.storage.put("browser",state);return state; }
  async withPage(state, work) {
    if (!state.browserSessionId) throw new Error("SESSION_NOT_STARTED");
    let browser;
    try {
      browser=await puppeteer.connect(this.env.BROWSER, state.browserSessionId);
      const pages=await browser.pages();
      const page=pages.find(p => p.target()._targetId === state.targetId) ||
        (pages.length===1 ? pages[0] : null);
      if (!page) throw new Error("EXACT_PAGE_UNAVAILABLE");
      return await work(page);
    } catch (error) {
      if (/session.*(?:closed|not found|does not exist)|browser.*disconnect|ECONN|Target closed/i.test(String(error))) {
        const fresh=await this.state();
        if(fresh.browserSessionId===state.browserSessionId){
          fresh.status="EXPIRED";fresh.controller="BIG";fresh.mode="IDLE";
          fresh.allowGoRead=false;fresh.grantedHost=null;await this.save(fresh);
        }
      }
      throw error;
    } finally { if (browser) await browser.disconnect().catch(()=>{}); }
  }
  async observe(state,role) {
    return this.withPage(state, async page => {
      if(role==="GO" && !sameGrant(state,page.url()))throw new Error("OBSERVE_GRANT_ORIGIN_MISMATCH");
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
  async action(state, raw, role) {
    const step=cleanStep(raw);
    if (state.controller!==role) throw new Error("CONTROLLER_MISMATCH");
    if (role==="GO" && (!mayGoAct(state.url,this.env.GO_ALLOWED_HOSTS) || !sameGrant(state))) throw new Error("GO_DOMAIN_NOT_ALLOWED");
    if (step.type==="navigate" && role==="GO" && !mayGoAct(step.url,this.env.GO_ALLOWED_HOSTS)) throw new Error("GO_DOMAIN_NOT_ALLOWED");
    return this.withPage(state, async page => {
      if(role==="GO" && (!sameGrant(state,page.url()) ||
        (step.type==="navigate" && new URL(step.url).hostname!==state.grantedHost)))throw new Error("GO_GRANT_ORIGIN_MISMATCH");
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
    let state=await this.state();
    if (state.browserSessionId && state.url &&
        (new URL(state.url).hostname!==new URL(url).hostname || !!state.recording!==recording)) {
      // Restrict a Browser Run session to its original domain; a new site receives a fresh session
      // with host-specific network guardrails, so redirects cannot reach internal hosts.
      await this.closeSession(state);
      state=await this.state();
    }
    if (state.browserSessionId) {
      try {
        await this.withPage(state,page=>page.goto(url,{waitUntil:"domcontentloaded",timeout:20000}).then(()=>({ok:true})));
        state.controller="BIG";state.mode="OBSERVE";state.status="RUNNING";state.url=url;state.allowGoRead=false;state.grantedHost=null;state.note=null;await this.save(state);
        return summarize(state);
      } catch { state.browserSessionId=null; }
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
        controller:"BIG",mode:"OBSERVE",status:"RUNNING",url,allowGoRead:false,grantedHost:null,job:null,
        note:null,recording,lastClosedSessionId:state.lastClosedSessionId||null};
      await this.save(state);return summarize(state);
    } finally { await browser.disconnect().catch(()=>{}); }
  }
  async closeSession(state) {
    if(state.job?.status==="RUNNING" || state.job?.status==="STOP_REQUESTED")throw new Error("STOP_JOB_BEFORE_CLOSING");
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
    await this.save(state);return summarize(state);
  }
  async view(state) {
    const url=await this.withPage(state,async page => {
      const cdp=await page.createCDPSession();
      try {const result=await cdp.send("Cloudflare.getLiveView",{mode:"tab",expiresInMs:300000});return result.devtoolsFrontendUrl;}
      finally {await cdp.detach().catch(()=>{});}
    });
    if (!url || !url.startsWith("https://live.browser.run/")) throw new Error("LIVE_VIEW_UNAVAILABLE");
    return {url,validForStartMs:300000,warning:"View URL grants access. Never log or share it."};
  }

  /** Durable source-owned work queue; DO alarms wake after the client disconnects.
   * Persist DISPATCHING *before* a step. If runtime resets mid-click, mark UNKNOWN
   * instead of replaying an action that might have succeeded on the website.
   */
  async enqueue(state,kind,items,requestId) {
    const repeat=state.recentRequests?.find(r=>r.requestId===requestId);
    if(repeat) return {jobId:repeat.jobId,status:"ALREADY_ACCEPTED",duplicate:true};
    if(["RUNNING","STOP_REQUESTED"].includes(state.job?.status) || state.mode==="HEADLESS")
      throw new Error("JOB_ALREADY_RUNNING");
    const job={id:crypto.randomUUID(),kind,status:"RUNNING",startedAt:new Date().toISOString(),
      progress:0,total:items.length,results:[],requestId,originRole:kind==="GO_SCRIPT"?"GO":"BIG"};
    state.job=job;state.mode="HEADLESS";state.status="RUNNING";
    // A page audit is read-only and needs no GO observer grant; GO scripts require
    // the explicit scoped session grant throughout their entire execution.
    if(kind==="PAGE_AUDIT"){state.controller="BIG";state.allowGoRead=false;state.grantedHost=null;}
    state.recentRequests=[...(state.recentRequests||[]).slice(-19),{requestId,jobId:job.id}];
    await this.ctx.storage.put("pending-job",{jobId:job.id,kind,items,index:0,phase:"READY"});
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
    current.allowGoRead=false;current.grantedHost=null;
    await this.save(current);
    await this.ctx.storage.delete("pending-job");
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
    pending.phase="DISPATCHING";
    await this.ctx.storage.put("pending-job",pending); // source-owned pre-dispatch evidence
    let receipt=null,err=null;
    try {
      const item=pending.items[pending.index];
      if(pending.kind==="GO_SCRIPT"){
        receipt=await this.action(state,item,"GO");
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
    const shouldStop=fresh.status==="STOP_REQUESTED" || (pending.kind==="GO_SCRIPT" &&
      (fresh.controller!=="GO" || !sameGrant(fresh)));
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
    const role=request.headers.get("x-observatory-role") === "BIG" ? "BIG" : "GO";
    const method=request.method,path=new URL(request.url).pathname;
    try {
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
      // All mutations are owned by this Durable Object, and guarded against overlapping browser writes.
      if (method==="GET" && path==="/v1/session") return reply(summarize(await this.state()));
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
      if (method==="GET" && path==="/v1/view" && role==="BIG") return reply(await this.view(await this.state()));
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
      if(path==="/v1/observe-access" && role==="BIG") {
        if(typeof body.allow !== "boolean" || !state.browserSessionId)
          return reply({error:"INVALID_OBSERVE_GRANT"},422);
        if(body.allow && !mayGoAct(state.url,this.env.GO_ALLOWED_HOSTS))
          return reply({error:"GO_DOMAIN_NOT_ALLOWED"},403);
        state.allowGoRead=body.allow;state.grantedHost=body.allow?new URL(state.url).hostname:null;
        if(!body.allow && state.controller==="GO") {state.controller="BIG";state.mode="OBSERVE";}
        await this.save(state);return reply(summarize(state));
      }
      if(path==="/v1/control" && role==="BIG") {
        if(this.inFlight)return reply({error:"BUSY"},409);
        const next=body.controller;
        if(!["BIG","GO"].includes(next))return reply({error:"INVALID_CONTROLLER"},422);
        if(state.mode==="HEADLESS" && next==="BIG"){
          state.status="STOP_REQUESTED";state.job.status="STOP_REQUESTED";
        }
        if(next==="GO" && !mayGoAct(state.url,this.env.GO_ALLOWED_HOSTS)) return reply({error:"GO_DOMAIN_NOT_ALLOWED"},403);
        state.controller=next;state.mode=next==="GO"?"LIVE":"OBSERVE";state.allowGoRead=next==="GO";state.grantedHost=next==="GO"?new URL(state.url).hostname:null;await this.save(state);return reply(summarize(state));
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
        if(!mayGoAct(state.url,this.env.GO_ALLOWED_HOSTS))return reply({error:"GO_DOMAIN_NOT_ALLOWED"},403);
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
        if(urls.some(x=>!x || !mayGoAct(x,this.env.GO_ALLOWED_HOSTS)))return reply({error:"URL_NOT_ALLOWED"},422);
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
    }catch(error) {return reply({error:String(error?.message || error).slice(0,160)},400);}
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
