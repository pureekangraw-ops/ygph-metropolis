import {allowedAction} from "./policy.mjs";

// These tools are only callable through the named Cloudflare WorkerEntrypoint.
// No HTTP token, owner secret or arbitrary URL can be supplied by an RPC caller.
const ROUTES=Object.freeze({
  observatory_session:{method:"GET",path:"/v1/session",keys:[]},
  observatory_observe:{method:"GET",path:"/v1/observe",keys:[]},
  observatory_screenshot:{method:"GET",path:"/v1/screenshot",keys:[]},
  observatory_action:{method:"POST",path:"/v1/action",
    keys:["type","url","selector","value","y"]},
  observatory_run:{method:"POST",path:"/v1/run",keys:["steps","requestId"]},
  observatory_job:{method:"GET",path:"/v1/job",keys:[]},
  observatory_note:{method:"POST",path:"/v1/note",keys:["message"]}
});
export const supportedGoTools=Object.freeze(Object.keys(ROUTES));
const uuid=/^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;
function cleanArguments(name,args) {
  const route=ROUTES[name];
  if(!route)return {error:"UNSUPPORTED_OBSERVATORY_TOOL"};
  if(!args||typeof args!=="object"||Array.isArray(args)||
     Object.keys(args).some(k=>!route.keys.includes(k)))return {error:"INVALID_TOOL_ARGUMENTS"};
  if(name==="observatory_action"&&!allowedAction(args))return {error:"ACTION_NOT_ALLOWED"};
  if(name==="observatory_run"&&(!uuid.test(args.requestId||"")||
      !Array.isArray(args.steps)||args.steps.length<1||args.steps.length>10||
      !args.steps.every(allowedAction)))return {error:"INVALID_GO_PLAN"};
  if(name==="observatory_note"&&(
      typeof args.message!=="string"||args.message.trim().length<1||
      args.message.length>240))return {error:"INVALID_GO_NOTE"};
  return {route};
}

export async function invokeObservatoryGo(env,name,args={}) {
  const validation=cleanArguments(name,args);
  if(validation.error)return {ok:false,status:"INVALID_ARGUMENTS",error:validation.error};
  if(!env?.SESSIONS||typeof env.SESSIONS.idFromName!=="function")
    return {ok:false,status:"BROWSER_BINDING_NOT_CONFIGURED"};
  const {method,path}=validation.route;
  try {
    const id=env.SESSIONS.idFromName("owner-browser-v1");
    const stub=env.SESSIONS.get(id);
    const request=new Request("https://observatory-internal.invalid"+path,{
      method,headers:{"x-observatory-role":"GO","content-type":"application/json"},
      ...(method==="POST"?{body:JSON.stringify(args)}:{})
    });
    const response=await stub.fetch(request);
    const text=await response.text();
    if(text.length>1000000)return {ok:false,status:"RESPONSE_TOO_LARGE"};
    let parsed;
    try{parsed=JSON.parse(text);}catch{return {ok:false,status:"INVALID_UPSTREAM_RESPONSE"};}
    if(!response.ok||parsed?.error)
      return {ok:false,status:"OWNER_ACCESS_DENIED_OR_UPSTREAM_ERROR",
        upstream_status:response.status,error:String(parsed?.error||"DENIED").slice(0,120)};
    // DO is authoritative for page grants, owner takeover, host rules and action receipts.
    return {ok:true,status:"CONNECTED",result:parsed};
  }catch{
    return {ok:false,status:"OBSERVATORY_UNAVAILABLE"};
  }
}
