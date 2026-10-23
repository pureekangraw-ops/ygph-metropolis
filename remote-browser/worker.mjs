import puppeteer from "@cloudflare/puppeteer";
import { validPageUrl, allowedAction, mayGoAct, cleanStep } from "./policy.mjs";

const HEADERS = { "content-type":"application/json; charset=utf-8", "cache-control":"no-store", "x-content-type-options":"nosniff" };
function reply(body, code=200) { return new Response(JSON.stringify(body), { status:code, headers:HEADERS }); }
async function bodyOf(request) {
  if (+(request.headers.get("content-length") || 0) > 12000) throw new Error("BODY_TOO_LARGE");
  const text=await request.text();
  if (text.length > 12000) throw new Error("BODY_TOO_LARGE");
  return text ? JSON.parse(text) : {};
}
function summarize(s) {
  return { sessionId:s.browserSessionId || null, pageUrl:s.url || null,
    controller:s.controller || "BIG", mode:s.mode || "IDLE", status:s.status || "IDLE", goCanObserve:!!s.allowGoRead,
    version:s.version || 0, updatedAt:s.updatedAt || null, job:s.job || null };
}
export default {
  async fetch(request, env) {
    const path=new URL(request.url).pathname;
    if (path==="/health") return reply({ service:"observatory-shared-browser", configured:!!env.OWNER_TOKEN && !!env.SESSIONS && !!env.BROWSER });
    const authorization=request.headers.get("authorization") || "";
    if (!env.OWNER_TOKEN || !env.SESSIONS || !env.BROWSER) return reply({ error:"NOT_CONFIGURED" },503);
    const owner=authorization==="Bearer "+env.OWNER_TOKEN;
    const go=!!env.GO_TOKEN && env.GO_TOKEN!==env.OWNER_TOKEN && authorization==="Bearer "+env.GO_TOKEN;
    if (!owner && !go) return reply({ error:"UNAUTHORIZED" },401);
    if (!path.startsWith("/v1/")) return reply({error:"NOT_FOUND"},404);
    if (go && !["/v1/session","/v1/observe","/v1/action","/v1/job"].includes(path)) return reply({error:"OWNER_ONLY"},403);
    const id=env.SESSIONS.idFromName("owner-browser-v1");
    const upstream=new Request(request,{headers:{"x-observatory-role":owner?"BIG":"GO","content-type":"application/json"}});
    const result=await env.SESSIONS.get(id).fetch(upstream);
    // A DO receives role from a trusted internal request, never a client-supplied header.
    return result;
  }
};

export class BrowserWorkspace {
  constructor(ctx, env) { this.ctx=ctx; this.env=env; this.inFlight=false; this.cancelAudit=false; }
  async state() {
    const state=(await this.ctx.storage.get("browser")) || {controller:"BIG",mode:"IDLE",status:"IDLE",version:0,allowGoRead:false};
    if(state.job?.status==="RUNNING" && state.updatedAt && Date.now()-Date.parse(state.updatedAt)>180000) {
      state.job.status="UNKNOWN";state.job.error="RUN_INTERRUPTED_NO_AUTOREPLAY";
      state.controller="BIG";state.status="UNKNOWN";state.mode="OBSERVE";
      await this.save(state);
    }
    return state;
  }
  async save(state) { state.version=(state.version || 0)+1;state.updatedAt=new Date().toISOString();await this.ctx.storage.put("browser",state);return state; }
  async withPage(state, work) {
    if (!state.browserSessionId) throw new Error("SESSION_NOT_STARTED");
    let browser;
    try {
      browser=await puppeteer.connect(this.env.BROWSER, state.browserSessionId);
      const pages=await browser.pages();
      const page=pages.find(p => p.target()._targetId === state.targetId) || pages[0];
      if (!page) throw new Error("PAGE_UNAVAILABLE");
      return await work(page);
    } catch (error) {
      if (/session.*(?:closed|not found|does not exist)|browser.*disconnect|ECONN|Target closed/i.test(String(error))) {
        state.status="EXPIRED";state.controller="BIG";state.mode="IDLE";await this.save(state);
      }
      throw error;
    } finally { if (browser) await browser.disconnect().catch(()=>{}); }
  }
  async observe(state) {
    return this.withPage(state, async page => {
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
      state.url=validPageUrl(snapshot.url) || state.url;await this.save(state);
      return {...snapshot,version:state.version,observedAt:new Date().toISOString()};
    });
  }
  async action(state, raw, role) {
    const step=cleanStep(raw);
    if (state.controller!==role) throw new Error("CONTROLLER_MISMATCH");
    if (role==="GO" && !mayGoAct(state.url,this.env.GO_ALLOWED_HOSTS)) throw new Error("GO_DOMAIN_NOT_ALLOWED");
    if (step.type==="navigate" && role==="GO" && !mayGoAct(step.url,this.env.GO_ALLOWED_HOSTS)) throw new Error("GO_DOMAIN_NOT_ALLOWED");
    return this.withPage(state, async page => {
      switch(step.type) {
        case "navigate": await page.goto(step.url,{waitUntil:"domcontentloaded",timeout:20000});break;
        case "back": await page.goBack({waitUntil:"domcontentloaded",timeout:20000});break;
        case "forward": await page.goForward({waitUntil:"domcontentloaded",timeout:20000});break;
        case "reload": await page.reload({waitUntil:"domcontentloaded",timeout:20000});break;
        case "scroll": await page.evaluate(y => window.scrollBy(0,y),step.y);break;
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
      state.url=validPageUrl(page.url()) || state.url;
      await this.save(state);
      return {ok:true,type:step.type,url:state.url,version:state.version,at:new Date().toISOString()};
    });
  }
  async beginSession(raw) {
    const url=validPageUrl(raw.url || "https://shop.yggmetro.com/");
    if (!url) throw new Error("HTTPS_PUBLIC_URL_REQUIRED");
    let state=await this.state();
    if (state.browserSessionId) {
      try {
        const result=await this.withPage(state,page=>page.goto(url,{waitUntil:"domcontentloaded",timeout:20000}).then(()=>({ok:true})));
        state.controller="BIG";state.mode="OBSERVE";state.status="RUNNING";state.url=url;await this.save(state);
        return summarize(state);
      } catch { state.browserSessionId=null; }
    }
    const browser=await puppeteer.launch(this.env.BROWSER,{keep_alive:600000});
    try {
      const page=(await browser.pages())[0] || await browser.newPage();
      await page.goto(url,{waitUntil:"domcontentloaded",timeout:20000});
      state={browserSessionId:browser.sessionId(),targetId:page.target()._targetId || null,
        controller:"BIG",mode:"OBSERVE",status:"RUNNING",url,version:state.version || 0,allowGoRead:false,job:null};
      await this.save(state);return summarize(state);
    } finally { await browser.disconnect().catch(()=>{}); }
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
  async audit(state, urls) {
    const job={id:crypto.randomUUID(),status:"RUNNING",kind:"PAGE_AUDIT",startedAt:new Date().toISOString(),results:[]};
    state.job=job;state.mode="HEADLESS";state.allowGoRead=false;state.status="RUNNING";state.controller="GO";await this.save(state);
    this.cancelAudit=false;
    this.ctx.waitUntil((async()=>{
      for(const url of urls) {
        if(this.cancelAudit)break;
        try {
          const result=await this.withPage(state,async page=>{
            const response=await page.goto(url,{waitUntil:"domcontentloaded",timeout:20000});
            const data=await page.evaluate(()=>({title:document.title,links:document.querySelectorAll("a[href]").length,buttons:document.querySelectorAll("button").length}));
            return {url,code:response?.status() ?? 0,...data};
          });
          job.results.push(result);
        }catch(e){job.results.push({url,error:String(e.message || e).slice(0,120)});}
        job.progress=job.results.length;state.job=job;await this.save(state);
      }
      job.status=this.cancelAudit?"STOPPED":"COMPLETED";
      job.finishedAt=new Date().toISOString();state.job=job;state.status=job.status;state.mode="OBSERVE";state.controller="BIG";await this.save(state);
    })().catch(async e=>{
      job.status="FAILED";job.error=String(e.message || e).slice(0,150);job.finishedAt=new Date().toISOString();
      state.job=job;state.status="FAILED";state.mode="OBSERVE";state.controller="BIG";await this.save(state);
    }));
    return {jobId:job.id,status:"RUNNING",count:urls.length};
  }
  async fetch(request) {
    const role=request.headers.get("x-observatory-role") === "BIG" ? "BIG" : "GO";
    const method=request.method,path=new URL(request.url).pathname;
    try {
      const access=await this.state();
      if(role==="GO" && !access.allowGoRead) return reply({error:"OWNER_HAS_NOT_INVITED_GO"},403);
      // All mutations are owned by this Durable Object, and guarded against overlapping browser writes.
      if (method==="GET" && path==="/v1/session") return reply(summarize(await this.state()));
      if (method==="GET" && path==="/v1/job") return reply({job:(await this.state()).job || null});
      if (method==="GET" && path==="/v1/observe") return reply(await this.observe(await this.state()));
      if (method==="GET" && path==="/v1/view" && role==="BIG") return reply(await this.view(await this.state()));
      if(method!=="POST")return reply({error:"NOT_FOUND"},404);
      const body=await bodyOf(request),state=await this.state();
      if(path==="/v1/session" && role==="BIG") {
        if(this.inFlight)return reply({error:"BUSY"},409);this.inFlight=true;
        try {return reply(await this.beginSession(body));}finally{this.inFlight=false;}
      }
      if(path==="/v1/observe-access" && role==="BIG") {
        if(typeof body.allow !== "boolean" || !state.browserSessionId) return reply({error:"INVALID_OBSERVE_GRANT"},422);
        state.allowGoRead=body.allow;
        if(!body.allow && state.controller==="GO") {state.controller="BIG";state.mode="OBSERVE";}
        await this.save(state);return reply(summarize(state));
      }
      if(path==="/v1/control" && role==="BIG") {
        if(this.inFlight)return reply({error:"BUSY"},409);
        const next=body.controller;
        if(!["BIG","GO"].includes(next))return reply({error:"INVALID_CONTROLLER"},422);
        if(next==="GO" && !mayGoAct(state.url,this.env.GO_ALLOWED_HOSTS)) return reply({error:"GO_DOMAIN_NOT_ALLOWED"},403);
        state.controller=next;state.mode=next==="GO"?"LIVE":"OBSERVE";state.allowGoRead=next==="GO";await this.save(state);return reply(summarize(state));
      }
      if(path==="/v1/action") {
        if(this.inFlight || state.mode==="HEADLESS")return reply({error:"BUSY"},409);
        if(!allowedAction(body))return reply({error:"ACTION_NOT_ALLOWED"},422);
        this.inFlight=true;
        try {return reply(await this.action(state,body,role));}finally{this.inFlight=false;}
      }
      if(path==="/v1/audit" && role==="BIG") {
        if(this.inFlight || state.mode==="HEADLESS" || !state.browserSessionId)return reply({error:"BUSY_OR_NO_SESSION"},409);
        const urls=Array.isArray(body.urls) ? body.urls.slice(0,4).map(validPageUrl) : [validPageUrl(state.url)];
        if(urls.some(x=>!x || !mayGoAct(x,this.env.GO_ALLOWED_HOSTS)))return reply({error:"URL_NOT_ALLOWED"},422);
        return reply(await this.audit(state,urls),202);
      }
      if(path==="/v1/stop" && role==="BIG") {
        this.cancelAudit=true;const st=await this.state();st.allowGoRead=false;
        st.controller="BIG";st.mode="OBSERVE";st.status="STOP_REQUESTED";await this.save(st);
        return reply(summarize(st));
      }
      return reply({error:"NOT_FOUND"},404);
    }catch(error) {return reply({error:String(error?.message || error).slice(0,160)},400);}
  }
}
