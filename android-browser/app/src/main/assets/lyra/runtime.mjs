import {evaluateAgent} from './policy.mjs';
import {getPrompt} from './prompts.mjs';

const sensitiveKey=/password|passcode|otp|token|secret|credential|cookie|authorization/i;
function sanitize(value, depth=0) {
  if (depth>6) return null;
  if (typeof value==='string') return value.slice(0,4000)
    .replace(/\bBearer\s+\S+/gi,'[REDACTED]')
    .replace(/\b(password|passcode|otp|token|secret|api[-_ ]?key)\s*[:=]\s*\S+/gi,'[REDACTED]');
  if (Array.isArray(value)) return value.slice(0,32).map(x=>sanitize(x,depth+1));
  if (value && typeof value==='object') return Object.fromEntries(Object.entries(value)
    .filter(([key])=>!sensitiveKey.test(key)).slice(0,40).map(([key,item])=>[key,sanitize(item,depth+1)]));
  return ['number','boolean'].includes(typeof value)?value:null;
}
function modelContext(mode, context) {
  const allowed = {SHOP:['brief','catalogue'],OFFICE:['work','ownerReadback'],INSIDE:['browser'],OUTSIDE:['coordinate','grid','mapSummary']}[mode];
  return sanitize(Object.fromEntries(allowed.filter(k=>context[k]!==undefined).map(k=>[k,context[k]])));
}
function validReply(output, mode) {
  if (!output || typeof output!=='object' || Array.isArray(output) || Object.keys(output).length!==1 || typeof output.reply!=='string') return false;
  const reply=output.reply.trim();
  if (!reply || reply.length>700 || /[<>]|SYSTEM PROMPT|Bearer\s|password\s*[:=]|token\s*[:=]/i.test(reply)) return false;
  if (/เสร็จแล้ว|สำเร็จแล้ว|ชำระแล้ว|รับเงินแล้ว|ราคา|\d\s*บาท|completed|payment verified|successfully/i.test(reply)) return false;
  if (mode==='SHOP' && /GO Hub|Work ID|checkpoint|runtime|HERMES|MIMIR|AION|PIXIE|bridge/i.test(reply)) return false;
  return true;
}

/** Server-side only. Context authority/evidence MUST come from an authenticated owner adapter. */
export function createAgent({agent, mode, provider=null, clock=Date.now, timeoutMs=10000}={}) {
  const system=getPrompt(agent,mode);
  if (provider!==null && typeof provider!=='function') throw new Error('PROVIDER_INVALID');
  if (typeof clock!=='function' || !Number.isFinite(timeoutMs) || timeoutMs<1 || timeoutMs>30000) throw new Error('RUNTIME_CONFIG_INVALID');
  return Object.freeze({
    agent,mode,
    async respond(input) {
      if (!input || typeof input!=='object') throw new Error('INPUT_INVALID');
      // Snapshot input before awaiting an external provider; no mutable cross-request memory.
      const request=structuredClone(input);
      if ((request.agent && request.agent!==agent) || (request.mode && request.mode!==mode)) throw new Error('AGENT_CONTEXT_MISMATCH');
      const plan=evaluateAgent({...request,agent,mode},clock());
      const result={reply:plan.reply,plan,executed:false,modelStatus:provider?'SKIPPED_POLICY_REPLY':'NOT_CONFIGURED'};
      // Authoritative reports, commercial escalation and command proposals use fixed policy replies.
      if (!provider || !['CLARIFY','CONFIRM_BRIEF','OBSERVE'].includes(plan.action) || plan.status==='BLOCKED') return result;
      const controller=new AbortController();let timer;
      try {
        const call={system,text:sanitize(request.text),context:modelContext(mode,request.context??{}),policy:{action:plan.action,status:plan.status},signal:controller.signal};
        const output=await Promise.race([
          Promise.resolve().then(()=>provider(call)),
          new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('PROVIDER_TIMEOUT'));},timeoutMs);})
        ]);
        if (!validReply(output,mode)) return {...result,modelStatus:'INVALID_OUTPUT'};
        return {...result,reply:output.reply.trim(),modelStatus:'RESPONDED'};
      } catch { return {...result,modelStatus:'UNAVAILABLE'}; }
      finally { clearTimeout(timer); }
    }
  });
}
